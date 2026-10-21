const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8');
const BAR = ['reader-generation-bar', 'generation-status-bar'];

function build(extra = {}) {
  const elements = new Map(), classes = new Set();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, hidden: false, disabled: false, open: false, textContent: '', writes: 0, parentNode: null, children: [],
      classList: {toggle(name, on) { on ? classes.add(`${id}:${name}`) : classes.delete(`${id}:${name}`); }, contains: name => classes.has(`${id}:${name}`)},
      append(node) { node.parentNode = this; }, scrollIntoView() {}, querySelectorAll: () => []});
    return elements.get(id);
  };
  const body = element('body'), dialog = element('reader-dialog');
  element('loading-card').hidden = true;
  const closers = [];
  dialog.addEventListener = (type, fn) => { if (type === 'close') closers.push(fn); };
  dialog.close = () => { dialog.open = false; setTimeout(() => closers.splice(0).forEach(fn => fn()), 0); };
  const context = {state: {readerId: null, stories: []}, $: element, readerPanel: () => element('reader-panel'), pipeline: null, toasts: [],
    document: {body, querySelectorAll: () => dialog.open ? [dialog] : [], querySelector: () => null}, toast(message) { context.toasts.push(message); }, ...extra};
  Object.defineProperty(context, 'bodyClass', {get: () => body.classList.contains('x')});
  vm.createContext(context);
  // The status core, then the View result handler; both are the production source.
  vm.runInContext(source.slice(source.indexOf('let readerGeneration'), source.indexOf("for (const id of ['reader-generation-dismiss'")), context);
  vm.runInContext(source.slice(source.indexOf('function closeReader('), source.indexOf("for (const id of ['reader-generation-action'")), context);
  return {context, element, classes};
}
const visible = (t, id) => !t.element(id).hidden;

// Reader open on the status' own story: only the reader bar, with the phase's action.
{
  const t = build({pipeline: {busy: true}}), {context} = t;
  t.element('reader-dialog').open = true; context.state.readerId = 'story';
  context.setReaderGeneration({storyId: 'story', phase: 'working', message: 'Writing…'});
  assert.equal(visible(t, 'reader-generation-bar'), true); assert.equal(visible(t, 'generation-status-bar'), false);
  assert.equal(t.element('reader-generation-action').textContent, 'Cancel request');
  assert.equal(t.element('reader-generation-dismiss').hidden, true);
  assert.ok(t.classes.has('reader-panel:has-generation-status'));
  // Rendering unchanged text does not rewrite the live region.
  const writes = () => t.element('reader-generation-message').textContent;
  context.renderReaderGeneration(); assert.equal(writes(), 'Writing…');
}

// No false "working": once nothing is live (cancelled, failed, abandoned) the status is hidden everywhere.
{
  const t = build({pipeline: {busy: true}}), {context} = t;
  context.setReaderGeneration({storyId: null, phase: 'working', message: 'Writing your story…'});
  assert.equal(visible(t, 'generation-status-bar'), true, 'live Create request shows on any tab');
  context.pipeline.busy = false; context.renderReaderGeneration();
  assert.equal(visible(t, 'generation-status-bar'), false, 'settled request leaves no stale working status');
  for (const flag of ['readerEditBusy', 'readerHelpBusy']) {
    context.state[flag] = true; context.renderReaderGeneration(); assert.equal(visible(t, 'generation-status-bar'), true, `${flag} is a live signal`);
    context.state[flag] = false; context.renderReaderGeneration(); assert.equal(visible(t, 'generation-status-bar'), false);
  }
  context.state.requestId = 'r'; context.renderReaderGeneration(); assert.equal(visible(t, 'generation-status-bar'), true); context.state.requestId = null;
  context.renderReaderGeneration(); assert.equal(visible(t, 'generation-status-bar'), false);
}

// Placement: reader closed, another story's reader, and Create's own progress card.
{
  const t = build({pipeline: {busy: true}}), {context} = t;
  context.state.readerId = 'other';
  context.setReaderGeneration({storyId: 'story', phase: 'working', message: 'Writing the next chapter…'});
  assert.equal(visible(t, 'generation-status-bar'), true, 'reader closed'); assert.equal(visible(t, 'reader-generation-bar'), false);
  assert.equal(t.element('generation-status-bar').parentNode, t.element('body'));
  assert.ok(t.classes.has('body:has-app-generation-status'));
  assert.ok(!t.classes.has('reader-panel:has-generation-status'));
  t.element('reader-dialog').open = true; context.renderReaderGeneration();
  assert.ok(t.classes.has('reader-panel:has-generation-status'), "another story's reader reserves bottom space and notice offsets");
  assert.ok(!t.classes.has('body:has-app-generation-status'), 'page padding is not used behind a modal reader');
  assert.equal(visible(t, 'generation-status-bar'), true, "another story's reader"); assert.equal(visible(t, 'reader-generation-bar'), false);
  assert.equal(t.element('generation-status-bar').parentNode, t.element('reader-dialog'), 'moved into the modal dialog so it is not inert');
  t.element('reader-dialog').open = false;
  context.state.readerId = 'story'; context.renderReaderGeneration();
  assert.equal(visible(t, 'generation-status-bar'), true, 'closed reader of the same story still uses the page bar');
  t.classes.add('view-create:active'); context.setReaderGeneration({storyId: null, phase: 'working', message: 'Writing your story…'});
  assert.equal(visible(t, 'generation-status-bar'), true, 'a resumed Create has no progress card, so the bar is shown');
  t.element('loading-card').hidden = false; context.renderReaderGeneration();
  assert.equal(visible(t, 'generation-status-bar'), false, 'Create tab keeps its own visible progress card');
  t.element('loading-card').hidden = true; context.renderReaderGeneration();
  assert.equal(visible(t, 'generation-status-bar'), true, 'the bar returns as soon as the card is hidden');
  context.setReaderGeneration({storyId: null, phase: 'error', message: 'Story generation stopped. View recovery.'});
  assert.equal(visible(t, 'generation-status-bar'), true); assert.equal(t.element('generation-status-action').textContent, 'View recovery');
}

// Saved-response recovery and terminal phases never claim to be working.
{
  const t = build({pipeline: {busy: false}}), {context} = t;
  t.element('reader-dialog').open = true; context.state.readerId = 'story';
  context.setReaderGeneration({storyId: 'story', phase: 'working', message: 'Writing…'});
  assert.equal(visible(t, 'reader-generation-bar'), false);
  context.state.pendingReaderResult = {story: {id: 'story'}, saved: false}; context.renderReaderGeneration();
  assert.equal(t.element('reader-generation-action').textContent, 'Save response');
  context.state.pendingReaderResult.saved = true; context.renderReaderGeneration();
  assert.equal(t.element('reader-generation-action').textContent, 'Finish request');
  context.state.pendingReaderResult = null;
  for (const [phase, label] of [['ready', 'View result'], ['error', 'View recovery'], ['cleanup', 'Finish request']]) {
    context.setReaderGeneration({storyId: 'story', phase, message: phase});
    assert.equal(t.element('reader-generation-action').textContent, label); assert.equal(t.element('reader-generation-dismiss').hidden, false);
  }
  context.setReaderGeneration(null); assert.equal(visible(t, 'reader-generation-bar'), false);
}

// Cancel uses the pipeline directly, so it works from the page bar with the reader closed.
(async () => {
  let cancels = 0;
  const t = build({pipeline: {busy: true, async cancel() { cancels++; }}}), {context} = t;
  context.setReaderGeneration({storyId: 'story', phase: 'working', message: 'Writing…'});
  assert.equal(t.element('generation-status-action').disabled, false);
  context.state.stories = [{id: 'story', paths: [], activePathId: 'a'}];
  await context.generationAction(); assert.equal(cancels, 1);

  // Saving a response acknowledges it, which clears state.pendingReaderResult: the owning reader is refreshed from the captured record.
  for (const [readerId, expectUpdate] of [['story', true], ['other', false]]) {
    const w = build({pipeline: null}), c = w.context, calls = [];
    w.element('reader-dialog').open = true; c.state.readerId = readerId;
    c.state.pendingReaderResult = {story: {id: 'story'}, saved: false};
    c.updateReader = () => calls.push('updateReader');
    c.savePendingReaderResult = async () => { c.state.pendingReaderResult = null; };
    c.setReaderGeneration({storyId: 'story', phase: 'working', message: 'Writing…'});
    await c.generationAction();
    assert.deepEqual(calls, expectUpdate ? ['updateReader'] : [], `reader ${readerId} after saving a response for story`);
  }

  // Create recovery from another story's modal reader: the reader is closed first, then Create is shown and revealed.
  {
    const order = [], op = {kind: 'create'};
    const w = build({pipeline: {busy: false, records: [op]}}), c = w.context;
    w.element('reader-dialog').open = true; c.state.readerId = 'other'; c.state.stories = [];
    c.setView = name => order.push(`view:${name}:${w.element('reader-dialog').open ? 'open' : 'closed'}`);
    c.revealRecovery = value => order.push(`reveal:${value === op}`);
    c.setReaderGeneration({storyId: null, phase: 'error', message: 'Story generation stopped. View recovery.'});
    await c.generationAction();
    assert.deepEqual(order, ['view:create:closed', 'reveal:true']);
  }

  // View result targets the exact result path, also when the same chapter version is shared by two paths.
  const makeStory = () => ({id: 'story', activePathId: 'original', paths: [
    {id: 'original', name: 'Original', entries: [{chapterId: 'c1', versionId: 'v1'}, {chapterId: 'c2', versionId: 'v2'}]},
    {id: 'alt', name: 'Alternate 1', entries: [{chapterId: 'c1', versionId: 'v1'}, {chapterId: 'c3', versionId: 'v3'}]}]});
  const open = (story, extra = {}) => {
    const w = build({pipeline: null, ...extra}), saved = [], calls = [];
    Object.assign(w.context, {persisted: saved, calls, rememberReaderPosition: () => calls.push('remember'), persistReaderStory: s => { saved.push(s.activePathId); if (w.context.failSave) throw new Error('disk full'); },
      persistReaderPosition: () => calls.push('position'), updateReader: () => calls.push('update'), revealCard() {}, setView() {}, revealRecovery() {}, openReader: s => { w.context.state.readerId = s.id; w.element('reader-dialog').open = true; }});
    w.context.state.stories = [story]; w.context.state.readerPositions = {}; w.context.state.readerChapter = 0;
    return w;
  };
  // Shared first chapter on both paths: the status names 'alt', so 'alt' wins over the first path containing it.
  let story = makeStory(), w = open(story);
  w.context.setReaderGeneration({storyId: 'story', phase: 'ready', message: 'ready', pathId: 'alt', chapterId: 'c1', versionId: 'v1'});
  await w.context.generationAction();
  assert.equal(story.activePathId, 'alt'); assert.deepEqual(w.context.persisted, ['alt'], 'selected path is saved');
  assert.equal(w.context.state.readerChapter, 0);
  assert.equal(JSON.stringify(w.context.state.readerPositions['story:alt']), '{"chapterId":"c1","scrollTop":0}');
  assert.ok(w.context.calls.includes('remember') && w.context.calls.includes('update') && w.context.calls.includes('position'));
  assert.equal(vm.runInContext('readerGeneration', w.context), null);
  // Continue result on the path that is not the selected one.
  story = makeStory(); w = open(story);
  w.context.setReaderGeneration({storyId: 'story', phase: 'ready', message: 'ready', pathId: 'original', chapterId: 'c2', versionId: 'v2'});
  story.activePathId = 'alt'; await w.context.generationAction();
  assert.equal(story.activePathId, 'original'); assert.equal(w.context.state.readerChapter, 1);
  // Already on that path: no redundant path write.
  story = makeStory(); w = open(story);
  w.context.setReaderGeneration({storyId: 'story', phase: 'ready', message: 'ready', pathId: 'original', chapterId: 'c2', versionId: 'v2'});
  await w.context.generationAction(); assert.deepEqual(w.context.persisted, []); assert.equal(w.context.state.readerChapter, 1);
  // A failed save restores the selection and does not navigate.
  story = makeStory(); w = open(story); w.context.failSave = true;
  w.context.setReaderGeneration({storyId: 'story', phase: 'ready', message: 'ready', pathId: 'alt', chapterId: 'c3', versionId: 'v3'});
  await w.context.generationAction(); assert.equal(story.activePathId, 'original'); assert.deepEqual(w.context.toasts, ['disk full']); assert.ok(!w.context.calls.includes('update'));
  // Deleted path and deleted story degrade without navigating.
  story = makeStory(); w = open(story);
  w.context.setReaderGeneration({storyId: 'story', phase: 'ready', message: 'ready', pathId: 'gone', chapterId: 'cX', versionId: 'vX'});
  await w.context.generationAction(); assert.deepEqual(w.context.toasts, ['That result is no longer available.']); assert.equal(vm.runInContext('readerGeneration', w.context), null);
  w = open(makeStory()); w.context.state.stories = [];
  w.context.setReaderGeneration({storyId: 'story', phase: 'ready', message: 'ready', pathId: 'alt', chapterId: 'c1', versionId: 'v1'});
  await w.context.generationAction(); assert.deepEqual(w.context.toasts, ['That story is no longer available.']);
  console.log('PASS generation status: all task kinds across tabs/readers, no stale working after cancel/error, saved-response recovery, cancel from the page bar and exact-path View result with rollback');
})();
