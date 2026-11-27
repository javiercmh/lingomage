// Exercise compact reader controls through production createReaderView and createReaderControls factories.
const assert = require('node:assert/strict');

(async () => {
  const { loadFactory, deps, stubDom } = await import('./support/factory-harness.mjs');
  const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');
  const createReaderControls = await loadFactory('js/reader/reader-controls.js', 'createReaderControls');

  const dom = stubDom();
  let saved = 0, failed = false, updates = [], messages = [], navigationTop = 160;
  const $ = id => {
    const isNew = !dom.elements.has(id);
    const node = dom.$(id);
    if (isNew) {
      node.hidden = true;
      node.focus = options => { node.focused = true; node.focusOptions = options; dom.document.activeElement = node; };
      if (id === 'reader-navigation-bar') node.getBoundingClientRect = () => ({ top: navigationTop, height: 66 });
      else if (id.endsWith('-toggle')) node.getBoundingClientRect = () => ({ left: 230, top: 200, bottom: 244 });
      else node.getBoundingClientRect = () => ({ width: 280, height: 160 });
    }
    return node;
  };

  const docListeners = {};
  dom.document.addEventListener = (type, fn) => { (docListeners[type] ||= []).push(fn); };
  dom.document.removeEventListener = (type, fn) => { docListeners[type] = (docListeners[type] || []).filter(item => item !== fn); };
  dom.document.dispatch = (type, event = {}) => {
    const payload = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...event };
    for (const fn of [...(docListeners[type] || [])]) fn(payload);
    return payload;
  };

  let computedStyle = () => ({ paddingLeft: '14', paddingRight: '14', paddingTop: '12', paddingBottom: '24' });
  globalThis.window = { innerWidth: 320, innerHeight: 640, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
  globalThis.document = dom.document;
  globalThis.getComputedStyle = (...args) => computedStyle(...args);
  globalThis.requestAnimationFrame = fn => fn();

  const reader = $('reader-panel');
  reader.scrollTop = 0;
  reader.getBoundingClientRect = () => ({ left: 0, right: 320, top: 0, bottom: 640 });
  $('reader-dialog').querySelector = selector => selector === '.reader-panel' ? reader : null;

  const story = {
    id: 'S', activePathId: 'original',
    chapters: [
      { id: 'A', activeVersionId: 'vA', versions: [{ id: 'vA', story: 'A' }] },
      { id: 'B', activeVersionId: 'vB', versions: [{ id: 'vB', story: 'B' }] }
    ],
    paths: [
      { id: 'original', name: 'Original', entries: [{ chapterId: 'A', versionId: 'vA' }, { chapterId: 'B', versionId: 'vB' }] },
      { id: 'alt', name: 'Alternate 1', entries: [{ chapterId: 'A', versionId: 'vA' }, { chapterId: 'B', versionId: 'vB' }] }
    ]
  };
  const positions = {
    'S:original': { chapterId: 'B', scrollTop: 120 },
    'S:alt': { chapterId: 'A', scrollTop: 20 }
  };
  const state = { stories: [story], readerId: 'S', readerChapter: 0, readerFontSize: 19, readerEditBusy: false, readerPositions: positions };

  const view = createReaderView(deps({
    $, state, SPEECH_LANGUAGES: {}, LANGUAGES: {},
    persistReaderStory() { if (failed) throw Error('disk'); saved++; },
    persistStories() {},
    toast(message) { messages.push(message); },
    trySaveSettings() { saved++; return true; },
    selectionMenuRouter: { reset() {} },
    usage: { setReader() {} },
    settingsFeedback: { sync() {} }
  }));

  createReaderControls(deps({
    $, state,
    closeReaderActions: view.closeReaderActions,
    closeReaderPanels: view.closeReaderPanels,
    closeWordNote: view.closeWordNote,
    confirmReaderRemoval: view.confirmReaderRemoval,
    fitReaderTitle: () => {},
    keepReaderLocation: view.keepReaderLocation,
    pathChapters: view.pathChapters,
    persistReaderStory() { if (failed) throw Error('disk'); saved++; },
    positionReaderPanel: view.positionReaderPanel,
    readerPanels: view.readerPanels,
    readerStory: view.readerStory,
    rememberReaderPosition: view.rememberReaderPosition,
    removeReaderContent: view.removeReaderContent,
    restoreReaderPosition(position) { reader.scrollTop = position?.scrollTop || 0; },
    selectedPath: view.selectedPath,
    setReaderViewport: view.setReaderViewport,
    setRestoringPathPosition: view.setRestoringPathPosition,
    toast(message) { messages.push(message); },
    toggleReaderActions: view.toggleReaderActions,
    trySaveSettings() { saved++; return true; },
    updateReader(keep) { updates.push(keep); },
    updateReaderNavigation: view.updateReaderNavigation
  }));

  $('path-control').hidden = true;
  await $('reader-navigation-toggle').dispatch('click');
  assert.equal($('reader-navigation-panel').hidden, false);
  assert.equal($('chapter-select').focused, true, 'single path focuses Chapter');
  assert.equal($('reader-navigation-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal($('reader-navigation-panel').style.left, '26px', 'panel stays within narrow safe bounds');
  assert.equal($('reader-actions-menu').hidden, true);

  await $('reader-preferences-toggle').dispatch('click');
  assert.equal($('reader-navigation-panel').hidden, true, 'opening Aa closes navigation');
  assert.equal($('reader-text-size').focused, true);
  $('reader-text-size').value = '99'; await $('reader-text-size').dispatch('input');
  assert.equal(state.readerFontSize, 30); assert.equal($('reader-story').style.fontSize, '30px');
  assert.equal($('reader-text-size').getAttribute('aria-valuetext'), '30 pixels');
  assert.equal(saved, 0, 'live preview does not write settings');
  await $('reader-text-size').dispatch('change'); assert.equal(saved, 1);
  $('reader-text-size').value = '1'; await $('reader-text-size').dispatch('input'); assert.equal(state.readerFontSize, 15);

  const esc = dom.document.dispatch('keydown', { key: 'Escape' });
  assert(esc.prevented && esc.stopped, 'Escape is consumed before reader dismissal');
  assert.equal($('reader-preferences-panel').hidden, true); assert.equal($('reader-preferences-toggle').focused, true);
  assert.equal($('reader-preferences-toggle').focusOptions.preventScroll, true, 'returning focus must not scroll a pinned control back to its document position');

  const originalOption = { className: 'storyline-option', dataset: { pathId: 'original' }, disabled: false, focus(options) { this.focused = true; this.focusOptions = options; }, closest: () => originalOption };
  const altOption = { className: 'storyline-option is-active', dataset: { pathId: 'alt' }, disabled: false, focus(options) { this.focused = true; this.focusOptions = options; }, closest: () => altOption };
  const pathList = $('path-list');
  pathList.querySelector = () => story.activePathId === 'alt' ? altOption : originalOption;
  pathList.querySelectorAll = () => [originalOption, altOption].filter(item => !item.disabled);
  $('path-control').hidden = false; await $('reader-navigation-toggle').dispatch('click');
  assert.equal(originalOption.focused, true, 'multiple paths focus active Storyline option');
  dom.document.dispatch('pointerdown', { target: { closest: () => true } }); assert.equal($('reader-navigation-panel').hidden, false);
  dom.document.dispatch('pointerdown', { target: { closest: () => null } }); assert.equal($('reader-navigation-panel').hidden, true);

  // Path changes preserve existing remembered positions and recover failed writes.
  await $('reader-navigation-toggle').dispatch('click'); await $('path-list').dispatch('click', { target: altOption });
  assert.equal(story.activePathId, 'alt'); assert.equal(state.readerChapter, 0); assert.equal(reader.scrollTop, 20);
  assert.equal(updates.at(-1), true); assert.equal($('reader-navigation-panel').hidden, false);
  failed = true; await $('path-list').dispatch('click', { target: originalOption });
  assert.equal(story.activePathId, 'alt'); assert.equal(reader.scrollTop, 20); assert.deepEqual(messages, ['disk']);
  failed = false; state.readerEditBusy = true; await $('path-list').dispatch('click', { target: originalOption });
  assert.equal(story.activePathId, 'alt');
  state.readerEditBusy = false; originalOption.disabled = true; await $('path-list').dispatch('click', { target: originalOption });
  assert.equal(story.activePathId, 'alt');
  originalOption.disabled = false;

  // Chapter choice closes navigation and restores its trigger before rendering.
  $('chapter-select').value = '1'; await $('chapter-select').dispatch('change');
  assert.equal(state.readerChapter, 1); assert.equal($('reader-navigation-panel').hidden, true);
  assert.equal($('reader-navigation-toggle').focused, true);

  // Prose reflow must not unmount the range during a continuous adjustment.
  state.readerEditBusy = false; await $('reader-preferences-toggle').dispatch('click');
  await reader.dispatch('scroll', { target: $('reader-preferences-panel') }); assert.equal($('reader-preferences-panel').hidden, false);
  const savesBeforeDrag = saved;
  for (const size of [17, 22, 30, 24, 19]) {
    $('reader-text-size').value = String(size); await $('reader-text-size').dispatch('input');
    await reader.dispatch('scroll', { target: reader });
    assert.equal($('reader-preferences-panel').hidden, false, 'reflow leaves the native range available for the next drag input');
    assert.equal(state.readerFontSize, size);
    assert.equal(saved, savesBeforeDrag, 'intermediate drag values are previews only');
  }
  await $('reader-text-size').dispatch('change'); assert.equal(saved, savesBeforeDrag + 1, 'release saves once');
  await reader.dispatch('scroll', { target: reader }); assert.equal($('reader-preferences-panel').hidden, false, 'late reflow after release does not dismiss preferences');
  dom.document.dispatch('wheel', { target: { closest: () => true } }); assert.equal($('reader-preferences-panel').hidden, false);
  dom.document.dispatch('wheel', { target: { closest: () => null } }); assert.equal($('reader-preferences-panel').hidden, true);
  await $('reader-preferences-toggle').dispatch('click');
  dom.document.dispatch('pointerdown', { target: { closest: () => null } }); assert.equal($('reader-preferences-panel').hidden, true, 'outside tap still dismisses preferences');

  $('word-note-popover').hidden = false;
  await $('reader-navigation-toggle').dispatch('click');
  assert.equal($('word-note-popover').hidden, true, 'opening navigation closes an open vocabulary note');
  await reader.dispatch('scroll', { target: reader });
  assert.equal($('reader-navigation-panel').hidden, true, 'reader scrolling still dismisses chapter navigation');

  // Pinned styling follows geometry and safe areas without changing content or scroll position.
  $('reader-dialog').open = true; reader.scrollTop = 300; navigationTop = 12;
  view.updateReaderNavigation(); assert($('reader-navigation-bar').classList.contains('is-floating')); assert.equal(reader.scrollTop, 300);
  navigationTop = 100; view.updateReaderNavigation(); assert(!$('reader-navigation-bar').classList.contains('is-floating'));
  computedStyle = element => element === reader ? { paddingTop: '36px' } : { top: '0px' }; navigationTop = 36; view.updateReaderNavigation(); assert($('reader-navigation-bar').classList.contains('is-floating'));
  reader.scrollTop = 0; view.updateReaderNavigation(); assert(!$('reader-navigation-bar').classList.contains('is-floating'));
  console.log('PASS compact reader: panel exclusivity, viewport bounds, focus/dismissal, live size/persistence, path positions/write rollback and generation lock');
})().catch(error => { console.error(error); process.exitCode = 1; });
