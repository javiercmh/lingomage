const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8');
const section = source.slice(source.indexOf('function showOperationResult('), source.indexOf('function initializePipeline('));

function build({open = true, viewedPath = 'original', chapter = 0} = {}) {
  const calls = [], panel = {scrollTop: 240}, focused = {isConnected: true, focus() { calls.push('focus'); }};
  const edit = {hidden: false}, story = {id: 'story'};
  const context = {calls, panel, focused, edit, toasts: [], story,
    state: {stories: [story], readerId: 'story', readerChapter: chapter, readerEditDraft: {prompt: 'x'}},
    document: {activeElement: null},
    $: id => id === 'reader-edit-panel' ? edit : {open},
    selectedPath: () => ({id: viewedPath}), readerPanel: () => panel,
    renderChapterNavigation() { calls.push('nav'); panel.scrollTop = 0; context.document.activeElement = null; },
    renderReaderActions() { calls.push('actions'); }, updateReaderNavigation() { calls.push('sticky'); },
    updateReader() { calls.push('updateReader'); }, renderReaderGeneration() { calls.push('status'); },
    ensureReaderOpen: async s => { calls.push(`open:${s.id}`); }, setReaderGeneration(v) { vm.runInContext('readerGeneration = null', context); calls.push(`status:${v}`); }, toast: m => context.toasts.push(m)};
  context.document.activeElement = focused;
  vm.createContext(context);
  vm.runInContext('let readerGeneration = null;', context);
  vm.runInContext(section, context);
  const generation = value => vm.runInContext(`readerGeneration = ${JSON.stringify(value)};`, context);
  const status = () => JSON.parse(vm.runInContext('JSON.stringify(readerGeneration)', context));
  return {context, calls, panel, focused, edit, generation, status, story};
}
const continueOp = (extra = {}) => ({id: 'op1', kind: 'continue', target: {storyId: 'story', pathId: 'original', entries: [{}, {}]}, ...extra});

// Viewed path = request path: nothing navigates; counts refresh; scroll and focus survive the re-render.
{
  const t = build({chapter: 0}); t.generation({storyId: 'story', phase: 'working', message: 'Writing', pathId: 'original'});
  t.context.showOperationResult(continueOp());
  assert.equal(t.context.state.readerChapter, 0, 'viewed chapter unchanged');
  assert.ok(!t.calls.includes('updateReader'), 'no full reader navigation');
  assert.ok(t.calls.includes('nav') && t.calls.includes('actions') && t.calls.includes('sticky'), 'chapter count and navigation controls refresh');
  assert.equal(t.panel.scrollTop, 240, 'scroll offset restored'); assert.ok(t.calls.includes('focus'), 'focus restored');
  assert.equal(t.edit.hidden, true); assert.equal(t.context.state.readerEditDraft, null);
  assert.deepEqual(t.status(), {storyId: 'story', phase: 'ready', message: 'Chapter 3 is ready', pathId: 'original', chapterId: 'chapter-op1', versionId: 'version-op1', helpId: ''});
  assert.deepEqual(t.context.toasts, ['Chapter added']);
}
// Viewing a different path than the one that grew: the view is not touched at all.
{
  const t = build({viewedPath: 'alt', chapter: 1}); t.generation({storyId: 'story', phase: 'working', message: 'Writing'});
  t.context.showOperationResult(continueOp());
  assert.equal(t.context.state.readerChapter, 1); assert.ok(!t.calls.some(c => ['updateReader', 'nav', 'actions'].includes(c)));
  assert.equal(t.edit.hidden, false); assert.equal(t.status().pathId, 'original', 'View result will name the request path');
}
// Reader closed: no view work, but the result is announced and reachable.
{
  const t = build({open: false}); t.generation({storyId: 'story', phase: 'working', message: 'Writing'});
  t.context.showOperationResult(continueOp());
  assert.ok(!t.calls.some(c => ['updateReader', 'nav'].includes(c))); assert.equal(t.status().phase, 'ready');
}
// Rewrite keeps its existing navigation to the rewritten chapter on the new alternate path.
{
  const t = build({chapter: 2}); t.generation({storyId: 'story', phase: 'working', message: 'Rewriting'});
  t.context.showOperationResult({id: 'op2', kind: 'rewrite', target: {storyId: 'story', pathId: 'original', chapterId: 'c1', index: 1, entries: [{}, {}]}});
  assert.equal(t.context.state.readerChapter, 1); assert.ok(t.calls.includes('updateReader'));
  assert.equal(t.status().pathId, 'path-op2'); assert.deepEqual(t.context.toasts, ['Alternate path created']);
}
// Create keeps opening the reader and leaves no lingering status.
{
  const t = build(); t.generation({storyId: null, phase: 'working', message: 'Writing your story…'});
  t.context.state.stories = [{id: 'story-op3', operationId: 'op3'}];
  t.context.showOperationResult({id: 'op3', kind: 'create'});
  assert.ok(t.calls.includes('open:story-op3')); assert.equal(t.status(), null);
}
console.log('PASS Continue stays on the viewed chapter/path/scroll/focus (closed reader and other path included); Rewrite and Create navigation unchanged');
