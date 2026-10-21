const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

// Real openReader, close/popstate handlers and ensureReaderOpen against a fake dialog and a fake browser history stack.
function build() {
  const elements = new Map(), listeners = {popstate: []}, log = {backs: 0, views: []};
  const history = {stack: [{page: 'base'}], index: 0,
    get state() { return this.stack[this.index]; },
    pushState(entry) { this.stack.splice(this.index + 1); this.stack.push(entry); this.index++; },
    replaceState(entry) { this.stack[this.index] = entry; },
    back() { log.backs++; if (this.index > 0) { this.index--; setTimeout(() => listeners.popstate.forEach(fn => fn({})), 0); } }};
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, hidden: true, open: false, value: '', textContent: '', handlers: {}, scrollTop: 0, classList: {toggle() {}},
      addEventListener(type, fn, options) { (this.handlers[type] ||= []).push({fn, once: options?.once}); },
      showModal() { this.open = true; },
      close() { if (!this.open) return; this.open = false; setTimeout(() => this.fire('close'), 0); },
      fire(type) { for (const entry of [...(this.handlers[type] || [])]) { if (entry.once) this.handlers[type].splice(this.handlers[type].indexOf(entry), 1); entry.fn({}); } }});
    return elements.get(id);
  };
  const context = {log, history, state: {readerPositions: {}, readerEditDraft: null, readerId: null}, $: element, window: {addEventListener: (type, fn) => (listeners[type] ||= []).push(fn)},
    selectionMenuRouter: {reset() {}}, usage: {setReader() {}}, settingsFeedback: {sync() {}}, readerPanel: () => element('panel'),
    closeStoryMenu() {}, clearExplanationSelection() {}, normalizeChapters: s => s.chapters, pathChapters: () => [{id: 'c1'}], selectedPath: () => ({id: 'p'}), updateReader() {}, updateReaderNavigation() {}, renderGenerationRecovery() {},
    closeReaderPanels() {}, closeReaderActions() {}, stopSpeech() {}, closeWordNote() {}, rememberReaderPosition() {}, persistReaderPosition() {}, setView: name => log.views.push(name), showEditPanel() {}};
  vm.createContext(context);
  element('word-note-popover').hidden = true;
  vm.runInContext(between('function openReader(', 'readerPanel().addEventListener(\'scroll\''), context);
  vm.runInContext(between('function closeReader(', 'async function cancelGeneration'), context);
  return {context, element, history, log};
}
const story = id => ({id, language: 'de', chapters: [{id: 'c1'}], paths: []});
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

(async () => {
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
