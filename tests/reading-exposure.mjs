import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExposureTracker, paragraphRanges, wordCount, requiredDwellMs, visibleFraction, IDLE_MS, MIN_DWELL_MS, SAMPLE_MS, MAX_SAMPLE_GAP_MS} from '../js/tracking/reading-exposure.js';
import {bridge, loadFactory, deps, stubDom} from './support/factory-harness.mjs';

// --- Paragraphs and word counts -------------------------------------------------------------------------
{
  const text = 'Erste Zeile hier.\n\nZweite Zeile.\n   \nDritte.';
  assert.deepEqual(paragraphRanges(text).map(p => [p.index, p.text, text.slice(p.start, p.end)]), [[0, 'Erste Zeile hier.', 'Erste Zeile hier.'], [1, 'Zweite Zeile.', 'Zweite Zeile.'], [2, 'Dritte.', 'Dritte.']]);
  assert.equal(wordCount('Sie kauft heute Brot.', 'de-DE'), 4);
  assert.ok(wordCount('猫が魚を食べている。', 'ja-JP') >= 4, 'Japanese is segmented without spaces');
  assert.equal(wordCount('', 'de-DE'), 0);
  assert.equal(requiredDwellMs(1), MIN_DWELL_MS);
  assert.equal(requiredDwellMs(400), 60000, '400 words need a minute at the speed ceiling');
}

// --- Visible fraction is relative to the smaller of paragraph and viewport ----------------------------------
{
  const viewport = {top: 0, bottom: 800};
  assert.equal(visibleFraction({top: 100, bottom: 200}, viewport), 1);
  assert.equal(visibleFraction({top: 750, bottom: 850}, viewport), 0.5);
  assert.equal(visibleFraction({top: 900, bottom: 1000}, viewport), 0);
  assert.equal(visibleFraction({top: -500, bottom: 2000}, viewport), 1, 'a paragraph taller than the screen filling it counts as visible');
  assert.equal(visibleFraction(null, viewport), 0);
}

// --- Dwell rules ----------------------------------------------------------------------------------------
function harness(paragraphs, visible = () => 1) {
  const clock = {mono: 1000, monotonic() { return this.mono; }};
  const reads = [];
  const tracker = createExposureTracker({clock, onRead: (paragraph, context) => reads.push([paragraph.index, context.storyId])});
  tracker.start({paragraphs, measure: visible, context: {storyId: 's1'}});
  const step = (ms, pageVisible = true) => { clock.mono += ms; return tracker.sample(pageVisible); };
  return {clock, tracker, reads, step};
}
{
  // 20 words need 3 s at 400 wpm.
  const h = harness([{index: 0, words: 20}, {index: 1, words: 20}], p => p.index === 0 ? 1 : 0);
  h.step(SAMPLE_MS); h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [], 'not yet long enough');
  h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [[0, 's1']], 'visible paragraph counts once its dwell reaches the threshold');
  for (let i = 0; i < 10; i++) h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [[0, 's1']], 'counts once per session; off-screen paragraph never counts');
}
{
  const h = harness([{index: 0, words: 20}]);
  h.step(SAMPLE_MS); h.step(SAMPLE_MS, false); h.step(SAMPLE_MS, false); h.step(SAMPLE_MS, false);
  assert.deepEqual(h.reads, [], 'hidden page does not accrue');
  h.step(MAX_SAMPLE_GAP_MS + 1);
  assert.deepEqual(h.reads, [], 'a long unexplained gap is discarded');
}
{
  const h = harness([{index: 0, words: 20}]);
  h.clock.mono += IDLE_MS + 1; h.tracker.sample();
  h.step(SAMPLE_MS); h.step(SAMPLE_MS); h.step(SAMPLE_MS); h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [], 'no interaction for over a minute stops accrual');
  h.tracker.interacted();
  h.step(SAMPLE_MS); h.step(SAMPLE_MS); h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [[0, 's1']], 'interaction resumes accrual');
}
{
  // Quickly scrolling past: visible for one sample only.
  let visibleNow = true;
  const h = harness([{index: 0, words: 20}], () => visibleNow ? 1 : 0);
  h.step(SAMPLE_MS); visibleNow = false;
  for (let i = 0; i < 5; i++) h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [], 'scrolling past does not count');
  h.tracker.stop();
  assert.equal(h.tracker.active, false);
  assert.deepEqual(h.tracker.sample(), []);
}

// --- App wiring: lookups recorded after user actions; exposure follows the rendered chapter -----------------
{
  const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');
  const createReaderSelection = await loadFactory('js/reader/reader-selection.js', 'createReaderSelection');
  const createReaderRequests = await loadFactory('js/reader/reader-requests.js', 'createReaderRequests');
  const createDefineNote = await loadFactory('js/reader/define-note.js', 'createDefineNote');
  const createStatsView = await loadFactory('js/screens/stats-view.js', 'createStatsView');

  const origDocument = globalThis.document;
  const origWindow = globalThis.window;
  const origHistory = globalThis.history;
  const origRaf = globalThis.requestAnimationFrame;
  const origGetComputedStyle = globalThis.getComputedStyle;
  const origSetTimeout = globalThis.setTimeout;
  const origMatchMedia = globalThis.matchMedia;
  const origNode = globalThis.Node;
  const origNodeFilter = globalThis.NodeFilter;
  const origAi = { ...bridge.ai };
  const origSpeech = { ...bridge.speech };
  const origTranslation = { ...bridge.translation };

  const findAll = (root, pred, out = []) => {
    for (const child of root.children || []) {
      if (pred(child)) out.push(child);
      findAll(child, pred, out);
    }
    return out;
  };
  const enhanceDom = dom => {
    const origCreateElement = dom.document.createElement.bind(dom.document);
    const matchesClass = (node, selector) => {
      if (!selector) return false;
      return String(selector).split(',').some(part => {
        const s = part.trim();
        if (s.startsWith('.')) return String(node.className || '').split(/\s+/).includes(s.slice(1).split('[')[0]);
        return node.tagName === s.toUpperCase();
      });
    };
    const enhanceNode = node => {
      node.nodeType = 1;
      node.matches = selector => matchesClass(node, selector);
      node.contains = target => {
        if (target === node) return true;
        return (node.children || []).some(child => child === target || (child.contains ? child.contains(target) : false));
      };
      node.querySelector = selector => findAll(node, child => matchesClass(child, selector))[0] || null;
      node.querySelectorAll = selector => findAll(node, child => matchesClass(child, selector));
      let textValue = node.textContent || '';
      Object.defineProperty(node, 'textContent', {
        get() { return textValue; },
        set(value) {
          textValue = String(value ?? '');
          node.children = textValue ? [dom.document.createTextNode(textValue)] : [];
        },
        configurable: true
      });
      return node;
    };
    dom.document.createElement = tag => enhanceNode(origCreateElement(tag));
    const origGet = dom.$;
    const wrapped$ = id => {
      const node = origGet(id);
      if (node.nodeType !== 1) enhanceNode(node);
      return node;
    };
    const docListeners = {};
    dom.document.addEventListener = (type, fn) => { (docListeners[type] ||= []).push(fn); };
    dom.document.removeEventListener = (type, fn) => { docListeners[type] = (docListeners[type] || []).filter(f => f !== fn); };
    dom.document.dispatch = (type, event = {}) => Promise.all((docListeners[type] || []).map(fn => fn({ target: dom.document.body, preventDefault() {}, stopPropagation() {}, ...event })));
    dom.document.createTreeWalker = (root, _whatToShow, filter) => {
      const textNodes = [];
      const walk = node => {
        for (const child of node.childNodes || []) {
          if (child.nodeType === 3) {
            if (!filter?.acceptNode || filter.acceptNode(child) === 1) textNodes.push(child);
          } else walk(child);
        }
      };
      walk(root);
      let idx = 0;
      return { nextNode: () => textNodes[idx++] || null };
    };
    return { ...dom, $: wrapped$ };
  };

  try {
    globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
    globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
    globalThis.matchMedia = () => ({ matches: false });
    globalThis.requestAnimationFrame = fn => fn();
    globalThis.getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', top: '0' });
    globalThis.history = { state: null, replaceState() {}, pushState() {}, back() {} };

    // 1. Reader view: updateReader starts exposure; opening a note and clicking Listen record lookups; close stops exposure & clears reader usage.
    {
      const dom = enhanceDom(stubDom());
      globalThis.document = dom.document;
      const panel = dom.document.createElement('div');
      dom.$('reader-dialog').querySelector = selector => selector === '.reader-panel' ? panel : null;
      const note = { word: 'Brot', meaning: 'bread', forms: ['Brot'] };
      const version = { id: 'v1', title: 'Titel', story: 'Sie kauft Brot.', glossary: [note] };
      const chapter = { id: 'c1', activeVersionId: 'v1', versions: [version] };
      const story = { id: 's1', language: 'de', title: 'Titel', chapters: [chapter], paths: [{ id: 'original', entries: [{ chapterId: 'c1', versionId: 'v1' }] }], activePathId: 'original' };
      const state = { stories: [story], readerId: 's1', readerChapter: 0, readerFontSize: 19, furigana: false, readerPositions: {} };
      const recordedNotes = [], exposures = [], usageCalls = [];
      let stoppedExposure = 0;

      bridge.speech.available = true;
      bridge.speech.speak = async () => ({ status: 'completed' });
      bridge.speech.stop = async () => {};

      const reader = createReaderView(deps({
        $: dom.$,
        LANGUAGES: { de: 'German' },
        SPEECH_LANGUAGES: { de: 'de-DE' },
        state,
        readerStory: () => story,
        pathChapters: () => [chapter],
        selectedPath: () => story.paths[0],
        activeVersion: () => version,
        pendingDeletionBlocked: () => false,
        fitReaderTitle() {},
        activateStoryText() {},
        renderSavedHelp() {},
        renderCheckpointRecovery() {},
        renderPendingReaderResult() {},
        renderMemoryRebuild() {},
        renderChapterRequest() {},
        renderReaderGeneration() {},
        renderReaderListen() {},
        stopSpeech() {},
        clearExplanationSelection() {},
        setView() {},
        persistStories() {},
        trySaveSettings() { return true; },
        settingsFeedback: { sync() {} },
        usage: { setReader(value) { usageCalls.push(value); } },
        startExposure(s, v) { exposures.push([s.id, v.id]); },
        stopExposure() { stoppedExposure++; },
        recordNoteLookup(notes, info, action) { recordedNotes.push({ notes, info, action }); },
        toast() {}
      }, { strict: true }));

      reader.updateReader();
      assert.deepEqual(exposures, [['s1', 'v1']], 'updateReader starts exposure on the rendered chapter');

      const trigger = dom.$('reader-story').querySelector('.gloss-note-trigger');
      assert.ok(trigger, 'rendered story contains glossary trigger');
      reader.showWordNote(trigger, [note], 'Brot');
      assert.equal(recordedNotes.length, 1);
      assert.equal(recordedNotes[0].action, 'note');
      assert.equal(recordedNotes[0].info.surface, 'Brot');
      assert.deepEqual(recordedNotes[0].notes, [note]);

      const listenBtn = dom.$('word-note-popover').querySelector('.inline-listen');
      assert.ok(listenBtn);
      await listenBtn.dispatch('click');
      assert.equal(recordedNotes.length, 2);
      assert.equal(recordedNotes[1].action, 'listen');
      assert.deepEqual(recordedNotes[1].notes, [note]);
      assert.equal(recordedNotes[1].info.surface, 'Brot');

      await dom.$('reader-dialog').dispatch('close');
      assert.equal(usageCalls.at(-1), null);
      assert.equal(stoppedExposure, 1);
    }

    // 2. Reader selection: translate records only after translator opens; title selections never define or explain.
    {
      const dom = enhanceDom(stubDom());
      globalThis.document = dom.document;
      let pendingSelectionTimer = null;
      globalThis.setTimeout = (fn, ms, ...args) => {
        if (ms === 180) { pendingSelectionTimer = fn; return 1; }
        return origSetTimeout(fn, ms, ...args);
      };
      const textNode = dom.document.createTextNode('Sie kauft Brot.');
      dom.$('reader-story').append(textNode);
      const range = { getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 40, right: 80, width: 40, height: 20 }) };
      globalThis.window = {
        ...origWindow,
        addEventListener() {},
        removeEventListener() {},
        matchMedia: () => ({ matches: false }),
        innerWidth: 360,
        innerHeight: 800,
        getSelection: () => ({
          isCollapsed: false,
          anchorNode: textNode, anchorOffset: 10,
          focusNode: textNode, focusOffset: 14,
          getRangeAt: () => ({ startContainer: textNode, startOffset: 10, endContainer: textNode, endOffset: 14, getBoundingClientRect: range.getBoundingClientRect })
        })
      };

      const version = { id: 'v1', title: 'Titel', story: 'Sie kauft Brot.' };
      const chapter = { id: 'c1', activeVersionId: 'v1', versions: [version] };
      const story = { id: 's1', language: 'de', title: 'Titel', chapters: [chapter] };
      const state = { readerSelection: null };
      const selectionLookups = [], defines = [], explains = [], toasts = [];

      bridge.translation.availability = async () => ({ available: true });
      bridge.translation.open = async () => { throw new Error('unavailable'); };

      createReaderSelection(deps({
        $: dom.$,
        SPEECH_LANGUAGES: { de: 'de-DE' },
        state,
        readerStory: () => story,
        activeChapter: () => chapter,
        activeVersion: () => version,
        sentenceContext: s => s,
        profileSnapshot: () => ({}),
        closeWordNote() {},
        recordSelectionLookup(passage, action) { selectionLookups.push([passage.text, action]); },
        defineSelection(p) { defines.push(p); },
        explainSelection(...args) { explains.push(args); },
        toast: m => toasts.push(m)
      }, { strict: true }));

      await dom.document.dispatch('selectionchange');
      assert.ok(pendingSelectionTimer);
      pendingSelectionTimer();
      await new Promise(resolve => origSetTimeout(resolve, 0));
      assert.equal(state.readerSelection.text, 'Brot');
      assert.equal(dom.$('selection-translate').disabled, false);

      await dom.$('selection-translate').dispatch('click');
      await new Promise(resolve => origSetTimeout(resolve, 0));
      assert.deepEqual(selectionLookups, [], 'translate records only after the translator opened');
      assert.match(toasts.at(-1), /Could not open translator/);

      bridge.translation.open = async () => ({ launched: true });
      await dom.$('selection-translate').dispatch('click');
      await new Promise(resolve => origSetTimeout(resolve, 0));
      assert.deepEqual(selectionLookups, [['Brot', 'translate']], 'translate records after the translator opens');

      state.readerSelection = { kind: 'title', text: 'Titel', start: 0, end: 5 };
      await dom.$('selection-define').dispatch('click');
      await dom.$('selection-explain').dispatch('click');
      await new Promise(resolve => origSetTimeout(resolve, 0));
      assert.equal(defines.length, 0, 'title selections do not define');
      assert.equal(explains.length, 0, 'title selections do not explain');

      const { defineSelection } = createDefineNote(deps({ $: dom.$, state }, { strict: true }));
      await defineSelection({ kind: 'title', text: 'Titel' });
    }

    // 3. Reader requests: explain/detail record only after saving without a saved toast; examples record after op completes.
    {
      const dom = enhanceDom(stubDom());
      globalThis.document = dom.document;
      globalThis.setTimeout = origSetTimeout;
      const version = { id: 'v1', title: 'Titel', story: 'Sie kauft Brot.' };
      const existingHelp = { id: 'h1', text: 'Existing explanation', start: 10, end: 14, versionId: 'v1' };
      const chapter = { id: 'c1', activeVersionId: 'v1', versions: [version], help: [existingHelp] };
      const story = { id: 's1', language: 'de', difficulty: 'A2', title: 'Titel', chapters: [chapter], activePathId: 'original' };
      const state = {
        stories: [story], readerId: 's1', providerId: 'mock', model: 'm1', reasoning: '',
        models: [{ id: 'm1', reasoningLevels: [] }], lightTasks: []
      };
      const lookups = [], toasts = [], panel = dom.document.createElement('div');
      let saveSucceeds = false;

      const { explainSelection } = createReaderRequests(deps({
        $: dom.$,
        LANGUAGES: { de: 'German' },
        state,
        runtime: { pipeline: { records: [] }, backgroundRun: null, readerGeneration: null },
        workspaceStorage: { assertWritable() {} },
        aiSession: { async start() { return 'req-1'; } },
        readerStory: () => story,
        normalizeChapters: () => [chapter],
        activeChapter: () => chapter,
        activeVersion: () => version,
        readerPanel: () => panel,
        confirmReplaceHelp: async () => true,
        createHelpLoading: () => dom.document.createElement('div'),
        persistReaderStory() { if (!saveSucceeds && state.pendingReaderResult) throw new Error('disk full'); },
        renderSavedHelp() {},
        renderReaderGeneration() {},
        setReaderGeneration() {},
        recordSelectionLookup(passage, action) { lookups.push([passage.text, action]); },
        runContentOperation: async () => ({ kind: 'examples' }),
        showOperationResult() {},
        toast: m => toasts.push(m)
      }, { strict: true }));

      bridge.ai.available = true;
      bridge.ai.providers = async () => ({ providers: [{ id: 'mock', connected: true }] });
      bridge.ai.wait = async () => JSON.stringify({ explanation: 'Bread.' });

      const passage = { storyId: 's1', chapterId: 'c1', versionId: 'v1', start: 10, end: 14, text: 'Brot', profile: {} };
      await explainSelection('explain', 'initial', '', passage);
      assert.deepEqual(lookups, [], 'explain does not record if saving fails');

      state.pendingReaderResult = null;
      state.pendingReaderRequestId = null;
      state.requestId = null;
      saveSucceeds = true;
      await explainSelection('explain', 'initial', '', passage);
      assert.deepEqual(lookups, [['Brot', 'explain']], 'explain records only after the result is saved');
      assert.ok(!toasts.includes('Explanation saved'), 'saved explanations appear in place without a notice');

      const savedHelpId = chapter.help.at(-1).id;
      await explainSelection('explain', 'detail', 'Why?', { ...passage, helpId: savedHelpId });
      assert.deepEqual(lookups, [['Brot', 'explain'], ['Brot', 'detail']]);

      await explainSelection('explain', 'examples', '', { ...passage, helpId: savedHelpId });
      assert.deepEqual(lookups, [['Brot', 'explain'], ['Brot', 'detail'], ['Brot', 'examples']]);
    }

    // 4. Stats view: lookup rows open the read-only detail sheet without recording; closing stops only speech started by the sheet.
    {
      const dom = enhanceDom(stubDom());
      globalThis.document = dom.document;
      const entry = { key: 'brot', word: 'Brot', meaning: 'bread', lookups: 2, days: ['2026-11-27'], contexts: [] };
      let stops = 0, resolveSpeak = null;
      bridge.speech.available = true;
      bridge.speech.speak = () => new Promise(resolve => { resolveSpeak = resolve; });
      bridge.speech.stop = async () => { stops++; };

      const dialog = dom.$('lookup-detail-dialog');
      dialog.close = () => { dialog.open = false; return dialog.dispatch('close'); };

      const { renderLookups } = createStatsView(deps({
        $: dom.$,
        LANGUAGES: { de: 'German' },
        SPEECH_LANGUAGES: { de: 'de-DE' },
        state: { languageOrder: ['de'] },
        usage: { status: {} },
        signals: { status: {}, data: { languages: { de: {} } }, ranked: () => [entry] },
        toast() {}
      }, { strict: true }));

      renderLookups();
      const row = dom.$('lookups-content').querySelector('.lookup-row');
      assert.ok(row, 'each row is a button that opens its detail sheet');
      await row.dispatch('click');
      assert.equal(dialog.open, true);
      assert.equal(dom.$('lookup-detail-word').textContent, 'Brot');

      await dialog.close();
      await Promise.resolve();
      assert.equal(stops, 0, 'closing without listening does not stop background speech');

      await row.dispatch('click');
      await Promise.all([
        dom.$('lookup-detail-listen').dispatch('click'),
        (async () => {
          await dialog.close();
          await Promise.resolve();
          assert.equal(stops, 1, 'closing stops speech the sheet started');
          resolveSpeak?.({ status: 'completed' });
        })()
      ]);

      const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
      assert.match(html, /<dialog id="lookup-detail-dialog"[^>]*aria-labelledby="lookup-detail-word"/);
    }
  } finally {
    Object.assign(bridge.ai, origAi);
    Object.assign(bridge.speech, origSpeech);
    Object.assign(bridge.translation, origTranslation);
    globalThis.document = origDocument;
    globalThis.window = origWindow;
    globalThis.history = origHistory;
    globalThis.requestAnimationFrame = origRaf;
    globalThis.getComputedStyle = origGetComputedStyle;
    globalThis.setTimeout = origSetTimeout;
    globalThis.matchMedia = origMatchMedia;
    globalThis.Node = origNode;
    globalThis.NodeFilter = origNodeFilter;
  }
}

console.log('PASS reading exposure: paragraphs, word counts, dwell rules and app wiring');
