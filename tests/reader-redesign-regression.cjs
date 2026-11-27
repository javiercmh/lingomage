// Behavioral checks for the reader redesign helpers (scroll reveal, overlap warning, library actions).
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const { loadFactory, deps, stubDom, bridge } = await import('./support/factory-harness.mjs');
  const { explainedSegments } = await import('../js/reader/reader-text.js');
  const createGenerationBar = await loadFactory('js/generation/generation-bar.js', 'createGenerationBar');
  const createReaderSelection = await loadFactory('js/reader/reader-selection.js', 'createReaderSelection');
  const createHelpCards = await loadFactory('js/reader/help-cards.js', 'createHelpCards');
  const createReaderRequests = await loadFactory('js/reader/reader-requests.js', 'createReaderRequests');
  const createLibraryView = await loadFactory('js/screens/library-view.js', 'createLibraryView');

  // Show: scroll only enough to reveal the bottom of the explanation card.
  {
    const origWindow = globalThis.window, origDocument = globalThis.document;
    const origGetComputedStyle = globalThis.getComputedStyle, origRaf = globalThis.requestAnimationFrame, origTimeout = globalThis.setTimeout;
    try {
      const dom = stubDom();
      const scrolls = [];
      const panel = { scrollBy: options => scrolls.push(options), classList: { toggle() {} }, style: { setProperty() {}, removeProperty() {} } };
      const classes = new Set();
      const make = rect => ({ getBoundingClientRect: () => rect, setAttribute() {}, focus() {}, classList: { add: name => classes.add(name), remove: name => classes.delete(name) } });
      let navigation = null;
      globalThis.getComputedStyle = () => ({ top: '24px' });
      globalThis.document = { ...dom.document, querySelector: selector => selector === '.reader-panel' ? panel : navigation, querySelectorAll: () => [{ hidden: false, offsetParent: null, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 700 }) }] };
      globalThis.window = { addEventListener() {}, removeEventListener() {}, innerHeight: 800, matchMedia: () => ({ matches: false }) };
      globalThis.requestAnimationFrame = fn => fn();
      globalThis.setTimeout = () => 0;
      const bar = createGenerationBar(deps({ $: dom.$, state: {}, runtime: {}, readerPanel: () => panel }));
      const reveal = rect => { scrolls.length = 0; bar.revealCard(make(rect)); return scrolls[0]; };
      assert.equal(reveal({ top: 100, bottom: 400, height: 300 }), undefined, 'fully visible card does not scroll');
      assert.equal(reveal({ top: 500, bottom: 900, height: 400 }).top, 900 + 12 - 700, 'partly hidden card scrolls only to reveal its bottom');
      assert.equal(reveal({ top: 300, bottom: 1400, height: 1100 }).top, 300 - 12, 'card taller than the viewport aligns its top');
      navigation = { offsetHeight: 66 };
      assert.equal(reveal({ top: 80, bottom: 280, height: 200 }).top, 80 - 102, 'cards clear the pinned bar and top safe area');
      assert.equal(reveal({ top: 300, bottom: 1400, height: 1100 }).top, 300 - 102, 'tall cards align beneath pinned navigation');
      globalThis.getComputedStyle = element => element === panel ? { paddingTop: '36px' } : { top: '0px' };
      assert.equal(reveal({ top: 80, bottom: 280, height: 200 }).top, 80 - 114, 'clearance includes scroll-container padding and host safe area');
      assert(classes.has('reveal-pulse'));
      console.log('PASS Show reveals only the bottom of an explanation, aligns tall cards at the top and skips needless scrolling');
    } finally {
      globalThis.window = origWindow; globalThis.document = origDocument;
      globalThis.getComputedStyle = origGetComputedStyle; globalThis.requestAnimationFrame = origRaf; globalThis.setTimeout = origTimeout;
    }
  }

  // Title section: compact accessible Listen, floating navigation/preferences and Story actions.
  {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const headerStart = html.indexOf('<header class="reader-title-section"'), header = html.slice(headerStart, html.indexOf('</header>', headerStart));
    for (const id of ['reader-title-meta', 'reader-title', 'reader-actions-toggle', 'reader-menu-continue', 'reader-menu-rewrite', 'reader-share', 'reader-remove-chapters', 'reader-delete-path', 'reader-listen', 'path-list', 'chapter-select'])
      assert(header.includes(`id="${id}"`), `${id} belongs to the title section`);
    assert(header.includes('aria-label="Listen to this chapter"'), 'icon-only Listen retains its accessible scope');
    assert(!header.includes('Listen to chapter</span>'));
    for (const id of ['reader-navigation-panel', 'reader-preferences-panel', 'reader-text-size']) assert(header.includes(`id="${id}"`));
    const navStart = html.indexOf('<div id="reader-navigation-bar"'), navigation = html.slice(navStart, html.indexOf('<div id="reader-player-anchor"', navStart));
    for (const id of ['chapter-prev', 'reader-navigation-toggle', 'chapter-next', 'reader-preferences-toggle']) assert(navigation.includes(`id="${id}"`));
    assert(!navigation.includes('id="reader-listen"'), 'Listen stays with the expanded title');
    assert.equal((navigation.match(/<svg/g) || []).length, 3, 'navigation and picker use stroked chevrons');
    assert(header.indexOf('id="reader-listen"') > header.indexOf('id="reader-title"'));
    assert(!html.includes('id="text-smaller"') && !html.includes('class="reader-toolbar"'));
    assert.equal((html.match(/id="reader-share"/g) || []).length, 1);

    const origWindow = globalThis.window, origDocument = globalThis.document, origMatchMedia = globalThis.matchMedia;
    const origNode = globalThis.Node, origNodeFilter = globalThis.NodeFilter, origTimeout = globalThis.setTimeout;
    try {
      const dom = stubDom();
      const docListeners = {};
      const titleText = { nodeType: 3, nodeValue: 'Titel', parentElement: { closest: () => null } };
      const titleEl = dom.$('reader-title');
      titleEl.append(titleText);
      titleEl.textContent = 'Titel';
      titleEl.contains = node => node === titleText;
      dom.$('reader-story').contains = () => false;
      const selection = { isCollapsed: false, anchorNode: titleText, focusNode: titleText, getRangeAt: () => ({ startContainer: titleText, startOffset: 0, endContainer: titleText, endOffset: 5, getBoundingClientRect: () => ({ left: 1, top: 2, width: 40, height: 20, bottom: 22 }) }) };
      globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
      globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
      globalThis.matchMedia = () => ({ matches: false });
      globalThis.setTimeout = fn => { fn(); return 0; };
      globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 390, innerHeight: 844, getSelection: () => selection };
      globalThis.document = {
        ...dom.document, hidden: true,
        addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
        createTreeWalker: () => { let done = false; return { nextNode() { if (done) return null; done = true; return titleText; } }; }
      };
      const state = {};
      let defineCalls = 0, explainCalls = 0;
      createReaderSelection(deps({
        $: dom.$, state,
        readerStory: () => ({ id: 's', language: 'de' }),
        activeChapter: () => ({ id: 'c' }),
        activeVersion: () => ({ id: 'v', story: 'Body' }),
        SPEECH_LANGUAGES: { de: 'de-DE' },
        defineSelection: () => { defineCalls++; },
        explainSelection: () => { explainCalls++; }
      }));
      for (const fn of docListeners.selectionchange || []) fn();
      const passage = state.readerSelection;
      assert.equal(passage.kind, 'title'); assert.equal(passage.languageTag, 'de-DE'); assert.equal(passage.text, 'Titel');
      assert.equal(dom.$('selection-toolbar').hidden, false);
      assert.equal(dom.$('selection-toolbar').classList.contains('title-selection'), true);
      await dom.$('selection-define').dispatch('click');
      await dom.$('selection-explain').dispatch('click');
      assert.equal(defineCalls, 0, 'Define does not act on title selections');
      assert.equal(explainCalls, 0, 'Explain does not act on title selections');
      assert(/\.selection-toolbar\.title-selection #selection-explain, \.selection-toolbar\.title-selection #selection-define \{ display: none/.test(fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8')), 'Explain and Define are hidden for title selections');
      console.log('PASS title section structure and title selection uses the custom toolbar without Explain or Define');
    } finally {
      globalThis.window = origWindow; globalThis.document = origDocument; globalThis.matchMedia = origMatchMedia;
      globalThis.Node = origNode; globalThis.NodeFilter = origNodeFilter; globalThis.setTimeout = origTimeout;
    }
  }

  // Explained expressions: newest range owns overlaps; overlapping explanations are detected for replacement.
  {
    const origDocument = globalThis.document;
    try {
      const dom = stubDom();
      globalThis.document = dom.document;
      const segments = JSON.parse(JSON.stringify(explainedSegments(20, [{ id: 'old', start: 2, end: 10, label: 'a' }, { id: 'new', start: 6, end: 14, label: 'b' }])));
      assert.deepEqual(segments.map(s => [s.start, s.end, s.id]), [[0, 2, ''], [2, 6, 'old'], [6, 14, 'new'], [14, 20, '']]);
      const helpCards = createHelpCards(deps({ $: dom.$, state: {}, SPEECH_LANGUAGES: { de: 'de-DE' } }));
      const chapter = { help: [{ id: 'a', versionId: 'v', start: 0, end: 5 }, { id: 'b', versionId: 'v', start: 5, end: 9 }, { id: 'c', versionId: 'other', start: 0, end: 9 }, { id: 'd', versionId: 'v' }] };
      assert.deepEqual(helpCards.overlappingHelp(chapter, 'v', 4, 6).map(e => e.id), ['a', 'b'], 'ranges that touch but do not overlap are kept');
      assert.deepEqual(helpCards.overlappingHelp(chapter, 'v', 5, 5).map(e => e.id), [], 'adjacent explanations do not overlap');
      assert.deepEqual(helpCards.overlappingHelp(chapter, 'v', 9, 12).map(e => e.id), []);

      // Verify overlapping explanations trigger the replace-help confirmation in production explainSelection.
      const replaceDialog = dom.$('replace-help-dialog');
      replaceDialog.close = function () { this.open = false; this.dispatch('close'); };
      const version = { id: 'v', story: 'Hallo Welt!' };
      const overlapChapter = { id: 'c', versions: [version], help: [{ id: 'h1', versionId: 'v', start: 0, end: 5, passage: 'Hallo' }] };
      const story = { id: 's', language: 'de', difficulty: 'beginner', chapters: [overlapChapter] };
      const state = { readerId: 's', providerId: 'p', model: 'm', models: [{ id: 'm', name: 'Mock' }] };
      const runtime = {};
      let aiStarted = 0;
      bridge.ai.available = true;
      bridge.ai.providers = async () => ({ providers: [{ id: 'p', connected: true }] });
      bridge.ai.wait = async () => JSON.stringify({ explanation: 'Replacement' });
      bridge.ai.acknowledge = async () => {};
      const requests = createReaderRequests(deps({
        $: dom.$, state, runtime,
        readerStory: () => story,
        activeChapter: () => overlapChapter,
        activeVersion: () => version,
        normalizeChapters: s => s.chapters,
        overlappingHelp: helpCards.overlappingHelp,
        confirmReplaceHelp: helpCards.confirmReplaceHelp,
        createHelpLoading: helpCards.createHelpLoading,
        helpContext: helpCards.helpContext,
        resolvedHelpContext: helpCards.resolvedHelpContext,
        savedFollowUps: helpCards.savedFollowUps,
        LANGUAGES: { de: 'German' },
        validTextRange: () => true,
        aiSession: { start: async () => { aiStarted++; return 'req-1'; } },
        workspaceStorage: { assertWritable() {} },
        savePendingReaderResult: () => requests.savePendingReaderResult()
      }));
      const passage = { storyId: 's', chapterId: 'c', versionId: 'v', start: 3, end: 8, text: 'lo We' };
      const cancelledRun = requests.explainSelection('explain', 'initial', '', passage);
      assert.equal(replaceDialog.open, true, 'overlapping explanation opens the replace warning dialog');
      assert.match(dom.$('replace-help-message').textContent, /“Hallo”/);
      await dom.$('replace-help-cancel').dispatch('click');
      await cancelledRun;
      assert.equal(aiStarted, 0, 'cancelling replacement warning aborts explanation request');

      const confirmedRun = requests.explainSelection('explain', 'initial', '', passage);
      assert.equal(replaceDialog.open, true);
      await dom.$('replace-help-confirm').dispatch('click');
      await confirmedRun;
      assert.equal(aiStarted, 1, 'confirming replacement warning starts explanation request');
      assert.equal(overlapChapter.help.length, 1);
      assert.equal(overlapChapter.help[0].passage, 'lo We');
      assert(/replace-help-dialog/.test(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')));
      console.log('PASS explained expression segments favor the newest explanation and overlap detection drives the replace warning');
    } finally {
      globalThis.document = origDocument;
    }
  }

  // Library Actions: a visible 44px button opens a labelled popover with native Select and Delete. There is no swipe gesture or tray.
  {
    const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
    assert(!/story-actions-tray|story-tray-|--swipe-x|settling/.test(css), 'library swipe tray styles are removed');
    assert(/story-menu-toggle \{[^}]*width: 44px; height: 44px/.test(css) && /story-popover-action \{[^}]*min-height: 44px/.test(css) && /language-chip \{[^}]*min-height: 44px/.test(css), '44px targets');

    const origWindow = globalThis.window, origDocument = globalThis.document;
    try {
      const dom = stubDom();
      const docListeners = {}, winListeners = {};
      const makeNode = (tag = '') => {
        const node = {
          tagName: tag.toUpperCase(), id: '', type: '', className: '', hidden: false, disabled: false, open: false, value: '', textContent: '', innerHTML: '',
          dataset: {}, style: {}, attributes: {}, listeners: {}, children: [], isConnected: true, removed: false,
          classList: { values: new Set(), add(...names) { names.forEach(n => this.values.add(n)); }, remove(...names) { names.forEach(n => this.values.delete(n)); },
            toggle(name, force) { const on = force ?? !this.values.has(name); if (on) this.values.add(name); else this.values.delete(name); return on; }, contains(name) { return this.values.has(name); } },
          addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
          removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); },
          dispatch(type, event = {}) { return Promise.all((this.listeners[type] || []).map(fn => fn({ target: node, preventDefault() {}, stopPropagation() {}, ...event }))); },
          setAttribute(name, value) { this.attributes[name] = String(value); }, getAttribute(name) { return this.attributes[name] ?? null; },
          append(...nodes) { for (const n of nodes) { if (typeof n === 'object' && n) n.parentNode = this; this.children.push(n); } },
          replaceChildren(...nodes) { this.children = nodes; },
          remove() { this.removed = true; this.isConnected = false; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); },
          focus() { globalThis.document.activeElement = node; },
          querySelector(sel) {
            const cls = sel.startsWith('.') ? sel.slice(1) : '';
            for (const c of this.children) {
              if (typeof c !== 'object' || !c) continue;
              if (cls && String(c.className).split(/\s+/).includes(cls)) return c;
              const found = c.querySelector?.(sel);
              if (found) return found;
            }
            return null;
          },
          querySelectorAll: () => [],
          closest: () => null,
          showModal() { this.open = true; },
          close() { this.open = false; },
          getBoundingClientRect: () => ({ top: 20, bottom: 64, left: 300, right: 344, width: 44, height: 44 })
        };
        return node;
      };
      const elements = new Map();
      const $ = id => { if (!elements.has(id)) { const n = makeNode('div'); n.id = id; elements.set(id, n); } return elements.get(id); };
      $('view-library').classList.add('active');
      const body = makeNode('body');
      globalThis.document = {
        activeElement: null, body, visibilityState: 'visible',
        createElement: tag => makeNode(tag),
        createTextNode: text => ({ nodeType: 3, nodeValue: String(text), textContent: String(text) }),
        getElementById: id => $(id),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
        removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter(f => f !== fn); }
      };
      globalThis.window = {
        innerWidth: 390, innerHeight: 844,
        addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
        removeEventListener(type, fn) { winListeners[type] = (winListeners[type] || []).filter(f => f !== fn); }
      };

      const story = { id: 's1', title: 'Test Story', language: 'de', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', chapters: [] };
      const state = { stories: [story], libraryLanguage: 'all', librarySort: 'recent', storySelectionMode: false, selectedStoryIds: new Set(), storyMenu: null };
      const selected = [];
      const libraryView = createLibraryView(deps({
        $, LANGUAGES: { de: 'German' }, state,
        beginStorySelection: id => selected.push(id),
        openShareDialog: () => {},
        removeSelectedStories: () => true,
        finishDeletedStoryReader: () => {},
        syncStorySelection: () => {},
        leaveStorySelection: () => {},
        toggleStorySelection: () => {},
        openReader: () => {},
        pendingDeletionBlocked: () => false,
        toast: () => {}
      }));
      libraryView.renderLibrary();

      const card = $('library-list').children.find(n => n.dataset?.storyId === 's1');
      assert.ok(card, 'library renders story card');
      assert.equal(card.querySelector('.card-select-action'), null, 'hidden focus-only Select story control is retired for stories');
      assert.equal(card.querySelector('.story-actions-tray'), null, 'swipe tray is removed');

      // Dragging horizontally on the card does not reveal any swipe tray or swipe state.
      await card.dispatch('pointerdown', { button: 0, clientX: 200, clientY: 100 });
      await card.dispatch('pointermove', { clientX: 80, clientY: 100 });
      await card.dispatch('pointerup', { clientX: 80, clientY: 100 });
      assert.equal(state.storyMenu, null);

      const more = card.querySelector('.story-menu-toggle');
      assert.ok(more);
      assert.equal(more.getAttribute('aria-label'), 'Actions for Test Story');
      assert.equal(more.getAttribute('aria-expanded'), 'false');

      await more.dispatch('click');
      assert.equal(state.storyMenu?.id, 's1');
      assert.equal(more.getAttribute('aria-expanded'), 'true');
      const popover = body.children.find(n => n.className === 'story-popover');
      assert.ok(popover, 'Actions popover opens in body');
      assert.equal(popover.getAttribute('role'), 'group', 'popover is a labelled group of native buttons, not a partial ARIA menu');
      assert.equal(popover.getAttribute('aria-label'), 'Actions for Test Story');
      const buttons = popover.children.filter(c => c.tagName === 'BUTTON');
      assert.equal(buttons.find(b => b.className.includes('story-popover-select')).getAttribute('aria-label'), 'Select story Test Story');
      assert.equal(buttons.find(b => b.className.includes('story-popover-delete')).getAttribute('aria-label'), 'Delete story Test Story');

      // Escape closes the popover and restores focus to its trigger.
      for (const fn of docListeners.keydown || []) fn({ key: 'Escape', preventDefault() {} });
      assert.equal(state.storyMenu, null, 'Escape closes the popover');
      assert.equal(popover.removed, true);
      assert.equal(more.getAttribute('aria-expanded'), 'false');
      assert.equal(globalThis.document.activeElement, more, 'Escape closes the popover and restores focus to its trigger');

      // Outside pointerdown closes the popover.
      await more.dispatch('click');
      assert.ok(state.storyMenu);
      const outside = makeNode('div');
      for (const fn of docListeners.pointerdown || []) fn({ target: outside });
      assert.equal(state.storyMenu, null, 'outside press closes the popover');

      // Window scroll closes the popover.
      await more.dispatch('click');
      assert.ok(state.storyMenu);
      for (const fn of winListeners.scroll || []) fn({});
      assert.equal(state.storyMenu, null, 'scroll closes the popover');

      // Select and Delete buttons work from the popover.
      await more.dispatch('click');
      const openPopover = body.children.find(n => n.className === 'story-popover');
      await openPopover.querySelector('.story-popover-select').dispatch('click');
      assert.deepEqual(selected, ['s1']);
      assert.equal(state.storyMenu, null);

      await more.dispatch('click');
      const openPopover2 = body.children.find(n => n.className === 'story-popover');
      await openPopover2.querySelector('.story-popover-delete').dispatch('click');
      assert.equal(state.storyMenu, null);
      assert.equal($('delete-stories-dialog').open, true);

      console.log('PASS library Actions popover replaces the swipe tray with visible 44px controls, labelled native buttons, Escape focus return and outside dismissal');
    } finally {
      globalThis.window = origWindow; globalThis.document = origDocument;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
