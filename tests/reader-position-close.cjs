const assert = require('node:assert/strict');
const plain = value => JSON.parse(JSON.stringify(value));
// A story with the shape the production story model needs: versions pinned by one path.
const makeStory = ids => ({id: 's', title: 'T', activePathId: 'original',
  chapters: ids.map(id => ({id, activeVersionId: `${id}-v`, versions: [{id: `${id}-v`, title: 'T', story: 'Text.', glossary: []}], help: []})),
  paths: [{id: 'original', name: 'Original', entries: ids.map(id => ({chapterId: id, versionId: `${id}-v`}))}]});

(async () => {
// Production createReaderView: openReader, the position helpers and the reader close handler. Like a real <dialog>, the fake hides its panel on close
// (display:none reports scrollTop 0) before the close event fires.
const { loadFactory, deps, stubDom } = await import('./support/factory-harness.mjs');
const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');
// One factory per build: the factory registers its close and scroll listeners on that build's elements.
function build(story) {
  const dom = stubDom(), saves = [], element = dom.$, panel = element('panel'), dialog = element('reader-dialog');
  Object.assign(globalThis.window, {innerWidth: 390, innerHeight: 844, addEventListener() {}});
  globalThis.document = dom.document; globalThis.history = {state: null, pushState() {}, replaceState() {}, back() {}};
  globalThis.requestAnimationFrame = () => {}; globalThis.getComputedStyle = () => ({});
  Object.assign(panel, {rendered: 0, addEventListener() {}});
  Object.defineProperty(panel, 'scrollTop', {get() { return this._top || 0; }, set(value) { this._top = value; if (dialog.open) this.rendered = value; }});
  dialog.querySelector = () => panel;
  dialog.showModal = function () { this.open = true; panel.scrollTop = panel.rendered; };
  dialog.close = function () { if (!this.open) return; this.open = false; panel.rendered = panel.scrollTop; panel.scrollTop = 0; (this.listeners.close || []).forEach(fn => fn({})); };
  const state = {stories: [story], readerPositions: {}, readerEditDraft: null, readerId: null, readerChapter: 0, furigana: true, readerFontSize: 19};
  const view = createReaderView(deps({$: element, state, SPEECH_LANGUAGES: {}, persistStories() { saves.push(JSON.parse(JSON.stringify(story.readerPositions))); },
    selectionMenuRouter: {reset() {}}, usage: {setReader() {}}, settingsFeedback: {sync() {}}}));
  return {context: {...view, state, saves}, panel, dialog};
}

// Leaving the reader keeps the chapter and the scroll offset the learner reached, in memory and on disk.
{
  const story = makeStory(['c1', 'c2']);
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
  const story = makeStory(['c1']);
  const t = build(story); t.context.state.readerId = 's';
  t.context.rememberReaderPosition();
  assert.deepEqual(plain(t.context.state.readerPositions), {});
}
console.log('reader position close: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
