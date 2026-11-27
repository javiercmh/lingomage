const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const { bridge, loadFactory, deps, stubDom } = await import('./support/factory-harness.mjs');
  const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');
  const createReaderControls = await loadFactory('js/reader/reader-controls.js', 'createReaderControls');

  // Story characters on a grid: 10px wide, 20px lines, `columns` per line; character 999 is an unrendered line break.
  let columns = 20;
  const view = { top: 0, bottom: 400, left: 0, right: 200 };
  const dom = stubDom();
  const panel = dom.$('panel');
  panel.scrollTop = 200;
  panel.getBoundingClientRect = () => view;

  const rect = index => {
    const top = Math.floor(index / columns) * 20 - panel.scrollTop, left = (index % columns) * 10;
    return index === 999 ? { top: 0, bottom: 0, left: 0, right: 0, height: 0 } : { top, bottom: top + 20, left, right: left + 10, height: 20 };
  };

  dom.$('reader-dialog').open = true;
  dom.$('reader-dialog').querySelector = selector => selector === '.reader-panel' ? panel : null;
  dom.$('reader-navigation-panel').hidden = true;
  dom.$('reader-preferences-panel').hidden = false;
  dom.$('reader-actions-menu').hidden = true;
  dom.$('word-note-popover').hidden = true;

  const storyNode = dom.$('reader-story');
  storyNode.textContent = 'x'.repeat(1000);
  storyNode.children = [dom.document.createTextNode('x'.repeat(1000))];

  globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
  dom.document.createTreeWalker = root => {
    const nodes = [];
    const walk = node => { for (const child of node.childNodes || []) { if (child.nodeType === 3) nodes.push(child); else walk(child); } };
    walk(root);
    let idx = 0;
    return { nextNode: () => nodes[idx++] || null };
  };
  dom.document.createRange = () => ({
    start: 0,
    setStart(_node, offset) { this.start = offset; },
    setEnd() {},
    getBoundingClientRect() { return rect(this.start); }
  });

  const history = { state: { lingomageView: 'library' }, replaceState(value) { this.state = value; } };
  const windowListeners = {};
  let frame;
  globalThis.window = {
    innerWidth: 360, innerHeight: 800,
    addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); },
    removeEventListener() {},
    matchMedia: () => ({ matches: false })
  };
  globalThis.document = dom.document;
  globalThis.history = history;
  globalThis.requestAnimationFrame = fn => { frame = fn; };
  globalThis.getComputedStyle = () => ({});

  const story = {
    id: 's', language: 'de', title: 'T', activePathId: 'p',
    chapters: [{ id: 'c', activeVersionId: 'v', versions: [{ id: 'v', title: 'T', story: 'x'.repeat(1000), glossary: [] }] }],
    paths: [{ id: 'p', name: 'Original', entries: [{ chapterId: 'c', versionId: 'v' }] }]
  };
  const state = { stories: [story], readerId: 's', readerChapter: 0, readerPositions: {} };

  const readerView = createReaderView(deps({
    $: dom.$, state, SPEECH_LANGUAGES: {}, LANGUAGES: {},
    persistStories() {}, persistReaderStory() {},
    clearExplanationSelection() {}, closeStoryMenu() {},
    selectionMenuRouter: { reset() {} }, usage: { setReader() {} }, settingsFeedback: { sync() {} }
  }));

  createReaderControls(deps({
    $: dom.$, state,
    closeReaderActions: readerView.closeReaderActions,
    closeReaderPanels: readerView.closeReaderPanels,
    closeWordNote: readerView.closeWordNote,
    fitReaderTitle() {},
    keepReaderLocation: readerView.keepReaderLocation,
    pathChapters: readerView.pathChapters,
    positionReaderPanel: readerView.positionReaderPanel,
    readerPanels: readerView.readerPanels,
    readerStory: readerView.readerStory,
    rememberReaderPosition: readerView.rememberReaderPosition,
    renderReaderGeneration() {},
    restoreReaderPosition: readerView.restoreReaderPosition,
    selectedPath: readerView.selectedPath,
    setReaderViewport: readerView.setReaderViewport,
    setRestoringPathPosition: readerView.setRestoringPathPosition,
    updateReader: readerView.updateReader,
    updateReaderNavigation: readerView.updateReaderNavigation
  }));

  const middleOf = offset => { const box = rect(offset); return (box.top + box.bottom) / 2; };

  // Line 20 crosses the middle (y 200); its character nearest x 100 is column 10.
  readerView.rememberReaderPosition();
  readerView.persistReaderPosition();
  const position = state.readerPositions['s:p'];
  assert.equal(position.textOffset, 410);
  assert.equal(position.textTop, undefined, 'only the middle character is stored');
  assert.equal(history.state.lingomagePosition.textOffset, 410);

  // Rotation: wider lines, shorter view. The same character moves to the new middle.
  columns = 40; Object.assign(view, { bottom: 200, right: 400 });
  readerView.restoreReaderPosition(position);
  assert.equal(middleOf(410), 100, 'middle character stays at the middle after rotation');
  columns = 20; Object.assign(view, { bottom: 400, right: 200 });
  readerView.restoreReaderPosition(position);
  assert.equal(middleOf(410), 200, 'rotating back centres the same passage');
  readerView.restoreReaderPosition({ ...position, versionId: 'other' });
  assert.equal(panel.scrollTop, 200, 'different version uses pixel fallback');
  readerView.restoreReaderPosition({ scrollTop: 85 });
  assert.equal(panel.scrollTop, 85, 'legacy positions remain readable');

  // Middle in the title area (above the prose) keeps the pixel offset alone.
  panel.scrollTop = -300; readerView.rememberReaderPosition();
  assert.equal(state.readerPositions['s:p'].textOffset, undefined);
  // Middle past the prose keeps the pixel offset alone.
  panel.scrollTop = 1200; readerView.rememberReaderPosition();
  assert.equal(state.readerPositions['s:p'].textOffset, undefined);
  // A short last line: the nearest character is the line's last one.
  story.chapters[0].versions[0].story = 'x'.repeat(405);
  panel.scrollTop = 200; readerView.rememberReaderPosition();
  assert.equal(state.readerPositions['s:p'].textOffset, 404);
  story.chapters[0].versions[0].story = 'x'.repeat(1000);

  // Layout scrolls before resize cannot overwrite the cached reading location.
  state.readerPositions['s:p'] = position;
  dom.$('reader-preferences-panel').hidden = false;
  globalThis.window.innerWidth = 800; columns = 40; panel.scrollTop = 0;
  readerView.rememberReaderPosition();
  assert.equal(state.readerPositions['s:p'], position);
  Object.assign(view, { bottom: 200, right: 400 });
  for (const fn of windowListeners.resize || []) fn({});
  assert.equal(middleOf(410), 100);
  assert.equal(dom.$('reader-preferences-panel').hidden, false, 'rotation keeps preferences open');
  readerView.rememberReaderPosition();
  assert.equal(state.readerPositions['s:p'], position, 'restoration scroll cannot overwrite the anchor');
  frame();

  // Text size and furigana reflow keep the remembered middle character centred, through repeated steps.
  globalThis.window.innerWidth = 360;
  readerView.setReaderViewport({ width: 360, height: 800 });
  for (const size of [30, 26, 22]) {
    columns = size; panel.scrollTop = 0;
    readerView.keepReaderLocation(() => {});
    assert.equal(middleOf(410), 100, `text reflow to ${size} columns keeps the middle`);
    readerView.rememberReaderPosition();
    assert.equal(state.readerPositions['s:p'], position, 'reflow scroll cannot replace the anchor');
    frame();
    readerView.rememberReaderPosition();
    assert.equal(state.readerPositions['s:p'], position, 'a late scroll event at the restored offset keeps the anchor');
  }
  // A real scroll afterwards picks the new middle.
  panel.scrollTop += 40; readerView.rememberReaderPosition();
  assert.notEqual(state.readerPositions['s:p'], position);
  state.readerPositions['s:p'] = position;
  // A position from another chapter is not applied to the open chapter.
  state.readerPositions['s:p'] = { ...position, chapterId: 'other' }; panel.scrollTop = 33;
  readerView.keepReaderLocation(() => {});
  assert.equal(panel.scrollTop, 33);

  // Recreated pages reuse the reader history entry and restore the selected tab.
  const rootDir = path.resolve(__dirname, '..');
  bridge.files.clear();
  bridge.files.set('data/learning-profiles.json', fs.readFileSync(path.join(rootDir, 'data/learning-profiles.json'), 'utf8'));
  bridge.files.set('data/language-safeguards.json', fs.readFileSync(path.join(rootDir, 'data/language-safeguards.json'), 'utf8'));
  bridge.files.set('data/stories.json', JSON.stringify([story]));
  bridge.files.set('data/settings.json', '{}');
  bridge.files.set('data/generation-checkpoints.json', '[]');

  const appDom = stubDom();
  Object.defineProperty(appDom.$('language'), 'options', { get() { return this.children; } });
  const appPanel = appDom.$('panel');
  appPanel.scrollTop = 0;
  appPanel.getBoundingClientRect = () => view;
  appDom.$('reader-dialog').querySelector = selector => selector === '.reader-panel' ? appPanel : null;
  const tabNodes = ['create', 'library', 'profile'].map(name => {
    const tab = appDom.document.createElement('button');
    tab.dataset = { view: name };
    return tab;
  });
  const viewNodes = ['create', 'library', 'profile', 'settings'].map(name => appDom.$(`view-${name}`));
  appDom.document.documentElement = appDom.$('html');
  appDom.document.head = appDom.$('head');
  appDom.document.querySelectorAll = selector => selector === '.tab' ? tabNodes : selector === '.view' ? viewNodes : [];
  appDom.document.createTreeWalker = root => {
    const nodes = [];
    const walk = node => { for (const child of node.childNodes || []) { if (child.nodeType === 3) nodes.push(child); else walk(child); } };
    walk(root);
    let idx = 0;
    return { nextNode: () => nodes[idx++] || null };
  };
  appDom.document.createRange = () => ({ setStart() {}, setEnd() {}, getBoundingClientRect: () => ({ top: 0, bottom: 20, left: 0, right: 10, height: 20 }) });

  const recreateHistory = {
    state: { lingomageView: 'library', lingomageReader: 's', lingomagePosition: position },
    pushes: 0,
    pushState(value) { this.pushes++; this.state = value; },
    replaceState(value) { this.state = value; },
    back() {}
  };
  globalThis.document = appDom.document;
  globalThis.history = recreateHistory;
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 360, innerHeight: 800,
    scrollTo() {}, visualViewport: null, location: { reload() {} }
  };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};

  await import('../js/app.js?recreate=1');

  assert.equal(appDom.$('view-library').classList.contains('active'), true);
  assert.equal(appDom.$('reader-dialog').open, true);
  assert.equal(recreateHistory.state.lingomageReader, 's');
  assert.equal(recreateHistory.pushes, 0, 'recreated page reuses the reader history entry without pushing a second one');
  bridge.files.clear();
  console.log('reader rotation: middle anchor, reflow, legacy fallback and page recreation pass');
})().catch(error => { console.error(error); process.exitCode = 1; });
