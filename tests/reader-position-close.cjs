const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const plain = value => JSON.parse(JSON.stringify(value));

// Real position helpers, openReader and the reader close handler. Like a real <dialog>, the fake hides its panel on close
// (display:none reports scrollTop 0) before the close event fires.
function build(story) {
  const elements = new Map(), saves = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, hidden: true, open: false, value: '', textContent: '', handlers: {}, scrollTop: 0, rendered: 0,
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      querySelector() { return element('panel'); },
      showModal() { this.open = true; element('panel').scrollTop = element('panel').rendered; },
      close() { if (!this.open) return; this.open = false; element('panel').rendered = element('panel').scrollTop; element('panel').scrollTop = 0; (this.handlers.close || []).forEach(fn => fn({})); }});
    return elements.get(id);
  };
  const panel = element('panel');
  Object.defineProperty(panel, 'scrollTop', {get() { return this._top || 0; }, set(value) { this._top = value; if (element('reader-dialog').open) this.rendered = value; }});
  const context = {saves, history: {state: null, pushState() {}, replaceState() {}, back() {}}, console,
    state: {stories: [story], readerPositions: {}, readerEditDraft: null, readerId: null, readerChapter: 0},
    $: element, readerStory: () => context.state.stories.find(item => item.id === context.state.readerId) || null,
    selectedPath: () => ({id: 'original'}), pathChapters: () => [{id: 'c1'}, {id: 'c2'}],
    activeChapter: () => context.pathChapters()[context.state.readerChapter],
    persistStories() { saves.push(JSON.parse(JSON.stringify(story.readerPositions))); },
    selectionMenuRouter: {reset() {}}, usage: {setReader() {}}, stopExposure() {}, settingsFeedback: {sync() {}},
    closeStoryMenu() {}, clearExplanationSelection() {}, normalizeChapters: s => s.chapters, updateReader() {}, updateReaderNavigation() {}, renderGenerationRecovery() {},
    closeReaderPanels() {}, closeReaderActions() {}, stopSpeech() {}, closeWordNote() {}, setView() {}, showEditPanel() {}};
  vm.createContext(context);
  element('reader-removal-dialog');
  vm.runInContext(between('function readerPanel()', "window.addEventListener('popstate'"), context);
  return {context, panel, dialog: element('reader-dialog')};
}

// Leaving the reader keeps the chapter and the scroll offset the learner reached, in memory and on disk.
{
  const story = {id: 's', chapters: [{id: 'c1'}, {id: 'c2'}], paths: [{id: 'original'}]};
  const t = build(story);
  t.context.openReader(story);
  t.context.state.readerChapter = 1; t.panel.scrollTop = 900; t.context.rememberReaderPosition(); // the scroll listener's call
  t.dialog.close();
  assert.deepEqual(plain(t.context.state.readerPositions['s:original']), {chapterId: 'c2', scrollTop: 900}, 'hidden panel does not overwrite the offset');
  assert.deepEqual(t.context.saves.at(-1), {original: {chapterId: 'c2', scrollTop: 900}}, 'saved position keeps the offset');
  t.context.openReader(story);
  assert.equal(t.context.state.readerChapter, 1); assert.equal(t.panel.scrollTop, 900, 'reopening restores the offset');
}
// A closed reader never records a position.
{
  const story = {id: 's', chapters: [{id: 'c1'}], paths: [{id: 'original'}]};
  const t = build(story); t.context.state.readerId = 's';
  t.context.rememberReaderPosition();
  assert.deepEqual(plain(t.context.state.readerPositions), {});
}
console.log('reader position close: ok');
