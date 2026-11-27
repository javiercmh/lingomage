const assert = require('node:assert/strict');

// Real openReader (reader-view), close/popstate handlers and closeReader/ensureReaderOpen (generation-bar) against a fake dialog and a fake browser history stack.
const known = []; // stories the reader can find, as the Library's would
async function setup() {
  const { loadFactory, deps } = await import('./support/factory-harness.mjs');
  const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');
  const createGenerationBar = await loadFactory('js/generation/generation-bar.js', 'createGenerationBar');
  function build() {
    const elements = new Map(), listeners = {popstate: []}, log = {backs: 0, views: []};
    const history = {stack: [{page: 'base'}], index: 0,
      get state() { return this.stack[this.index]; },
      pushState(entry) { this.stack.splice(this.index + 1); this.stack.push(entry); this.index++; },
      replaceState(entry) { this.stack[this.index] = entry; },
      back() { log.backs++; if (this.index > 0) { this.index--; setTimeout(() => listeners.popstate.forEach(fn => fn({})), 0); } }};
    const element = id => {
      if (!elements.has(id)) elements.set(id, {id, hidden: true, open: false, value: '', textContent: '', handlers: {}, scrollTop: 0, childNodes: [], dataset: {}, style: {}, classList: {toggle() {}, add() {}, remove() {}, contains: () => false},
        addEventListener(type, fn, options) { (this.handlers[type] ||= []).push({fn, once: options?.once}); },
        showModal() { this.open = true; },
        close() { if (!this.open) return; this.open = false; setTimeout(() => this.fire('close'), 0); },
        fire(type) { for (const entry of [...(this.handlers[type] || [])]) { if (entry.once) this.handlers[type].splice(this.handlers[type].indexOf(entry), 1); entry.fn({}); } },
        querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, append() {}, contains: () => false, getBoundingClientRect: () => ({top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0})});
      return elements.get(id);
    };
    const state = {readerPositions: {}, readerEditDraft: null, readerId: null, stories: known};
    const runtime = {pipeline: null, readerGeneration: null, creatingStory: false, backgroundRun: null, playbackContext: null};
    globalThis.history = history;
    globalThis.window = {addEventListener: (type, fn) => (listeners[type] ||= []).push(fn), removeEventListener() {}, matchMedia: () => ({matches: false}), innerWidth: 360, innerHeight: 800};
    globalThis.document = {activeElement: null, body: element('body'), visibilityState: 'visible', querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, createElement: () => element(), createTextNode: text => ({textContent: text}), createDocumentFragment: () => element()};
    globalThis.requestAnimationFrame = () => 0;
    globalThis.getComputedStyle = () => ({top: '0', paddingTop: '0'});
    element('word-note-popover').hidden = true;
    // Real view: readerPanel stays the production one (reader-dialog's .reader-panel); a panel element gives scrollTop.
    const panel = element('panel'); element('reader-dialog').querySelector = selector => selector === '.reader-panel' ? panel : null;
    const view = createReaderView(deps({$: element, state, selectionMenuRouter: {reset() {}}, usage: {setReader() {}}, settingsFeedback: {sync() {}},
      setView: name => log.views.push(name), pendingDeletionBlocked: () => false}));
    const bar = createGenerationBar(deps({$: element, state, runtime, openReader: view.openReader, readerStory: view.readerStory, selectedPath: view.selectedPath, activeChapter: view.activeChapter, activeVersion: view.activeVersion,
      readerPanel: view.readerPanel, setView: name => log.views.push(name), updateReader: view.updateReader, rememberReaderPosition: view.rememberReaderPosition, persistReaderPosition: view.persistReaderPosition}));
    const context = {state, closeReader: bar.closeReader, ensureReaderOpen: bar.ensureReaderOpen, openReader: view.openReader};
    return {context, element, history, log};
  }
  return build;
}
const story = id => known.find(item => item.id === id) || known[known.push({id, language: 'de', title: id, activePathId: 'p', chapters: [{id: 'c1', activeVersionId: 'v1', versions: [{id: 'v1', story: 'Text.'}]}], paths: [{id: 'p', name: 'Original', entries: [{chapterId: 'c1', versionId: 'v1'}]}]}) - 1];
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

(async () => {
  const build = await setup();
  // A normal close goes back exactly once.
  let t = build(); t.context.openReader(story('A'));
  assert.equal(t.history.stack.length, 2); await t.context.closeReader(); await settle();
  assert.equal(t.log.backs, 1); assert.equal(t.history.index, 0);

  // Switching from another story's reader reuses the entry: no second push, no back-then-push race, one Back returns to the Library.
  t = build(); t.context.openReader(story('A'));
  await t.context.ensureReaderOpen(story('B')); await settle();
  assert.equal(t.element('reader-dialog').open, true); assert.equal(t.context.state.readerId, 'B');
  assert.equal(t.history.stack.length, 2, 'history entry reused, not layered'); assert.equal(t.history.state.lingomageReader, 'B');
  assert.equal(t.log.backs, 0, 'switching does not navigate back');
  t.history.back(); await settle();
  assert.equal(t.element('reader-dialog').open, false, 'one Back closes the reader');
  assert.equal(t.history.index, 0); assert.equal(t.log.backs, 1, 'no extra Back is needed');
  assert.equal(t.log.views.at(-1), 'library');

  // Reopening after leaving still pushes a fresh entry.
  t.context.openReader(story('C')); assert.equal(t.history.stack.length, 2);
  console.log('PASS reader history: View result from another reader reuses the entry and one Back returns to the Library; normal close still goes back once');
})();
