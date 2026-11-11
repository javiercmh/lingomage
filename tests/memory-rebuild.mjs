import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { beginMemoryRebuild, finishMemoryRebuild, createStoryMemory } from '../js/story-memory.js';
import { failureInfo } from '../js/generation-errors.js';

const fixture = () => ({ id: 's', title: 'Saved story', language: 'de', promptVersion: 'original', activePathId: 'main',
  chapters: [{ id: 'c1', help: [{ text: 'Kept explanation' }], versions: [{ id: 'v1', title: 'First', story: 'Mia waits.', glossary: [{ word: 'waits' }] }] },
    { id: 'c2', versions: [{ id: 'v2', title: 'Second', story: 'Mia leaves.' }] }],
  paths: [{ id: 'main', name: 'Original', entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }] }],
  memories: [{ key: 'broken-legacy', memory: { bad: true } }] });
const json = value => JSON.parse(JSON.stringify(value));
{
  const story = fixture(), before = json(story);
  assert.throws(() => beginMemoryRebuild(story, story.paths[0], () => { throw Error('disk'); }), /disk/);
  assert.deepEqual(story, before, 'failed invalidation restores original cache and all content');
  const marker = beginMemoryRebuild(story, story.paths[0], () => {});
  story.paths[0].entries.push({ chapterId: 'later', versionId: 'later' });
  assert.equal(marker.entries.length, 2, 'lineage captured independently of later path changes');
  story.memories.push({ key: 'completed-new-summary' });
  assert.equal(beginMemoryRebuild(story, story.paths[0], () => { throw Error('must not invalidate twice'); }), marker);
  assert.equal(story.memories.length, 1, 'resume keeps completed work');
  assert.throws(() => finishMemoryRebuild(story, () => { throw Error('disk'); }), /disk/);
  assert.equal(story.memoryRebuild, marker, 'final write failure keeps recovery');
  finishMemoryRebuild(story, () => {}); assert.equal(story.memoryRebuild, undefined);
  assert.deepEqual(story.chapters, before.chapters); assert.equal(story.promptVersion, before.promptVersion);
}

const source = fs.readFileSync('js/app.js', 'utf8');
const code = source.slice(source.indexOf('let memoryRebuildStory = null;'), source.indexOf("$('reader-actions-toggle').addEventListener('click', toggleReaderActions);"));
function harness(story = fixture()) {
  const elements = new Map();
  const node = () => ({ hidden: false, open: false, children: [], handlers: {}, textContent: '',
    append(...nodes) { this.children.push(...nodes); }, replaceChildren() { this.children = []; },
    addEventListener(type, cb) { this.handlers[type] = cb; }, querySelector() { return this.strong ||= node(); },
    close() { this.open = false; }, showModal() { this.open = true; }, focus() {}, remove() {} });
  const calls = [], state = { stories: [story], readerId: story.id, providerId: 'mock', model: 'mock', models: [{ id: 'mock' }] };
  let disk = json(story), summaries = 0;
  const ctx = { state, beginMemoryRebuild, finishMemoryRebuild, document: { createElement: node },
    $: id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    readerStory: () => story, selectedPath: s => s.paths[0], pendingDeletionBlocked: () => Boolean(state.readerEditBusy || state.pendingReaderResult || state.pendingReaderRequestId),
    closeReaderActions() {}, renderChapterRequest() {}, renderReaderActions() {}, renderReaderGeneration() {},
    createHelpLoading: node, toast: message => calls.push(message), ai: { available: true },
    aiSession: { async run(fn) { calls.push('session'); return fn(); } }, workspaceStorage: { assertWritable() {} },
    async stopBackgroundContext() { calls.push('stop-background'); }, async releaseSavedInference() { if (ctx.releaseError) throw ctx.releaseError; }, async releaseInvalidReaderResponse() {},
    persistReaderStory(s) { if (ctx.failSave) throw Error('disk'); disk = json(s); calls.push('save'); },
    setReaderGeneration(status) { ctx.status = status; }, failureInfo, appendFailureDetails() {} };
  const memory = createStoryMemory({ state, promptVersion: 'test', normalizeChapters: s => s.chapters,
    async readerAi(kind, input, instructions, panel, config) {
      assert.equal(kind, 'summary'); assert.ok(config.signal); summaries++;
      if (ctx.cancel) { config.signal.cancelledByUser = true; throw Error('cancelled'); }
      if (ctx.failAt === summaries) throw ctx.failWith || Error('invalid response');
      return JSON.stringify({ newEvents: [{ event: input.chapterChunk }] });
    }, async savePendingReaderResult() {
      const pending = state.pendingReaderResult, undo = pending.apply();
      try { ctx.persistReaderStory(story); } catch (error) { undo(); throw error; }
      state.pendingReaderResult = null;
    } });
  ctx.prepareStoryMemory = memory.prepareStoryMemory;
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, story, state, calls, disk: () => disk, summaries: () => summaries };
}
{
  const h = harness(), before = json(h.story);
  await h.ctx.runMemoryRebuild(h.story);
  assert.equal(h.summaries(), 2); assert.equal(h.disk().memoryRebuild, undefined);
  assert.equal(h.disk().memories.length, 2); assert.equal(h.state.readerEditBusy, false);
  assert.deepEqual(h.disk().chapters, before.chapters); assert.deepEqual(h.disk().paths, before.paths);
  assert.equal(h.disk().promptVersion, 'original');
  assert.ok(h.calls.indexOf('stop-background') < h.calls.indexOf('session'));
  assert.ok(h.calls.indexOf('save') < h.calls.indexOf('session'), 'invalidation saved before requests');
  assert.equal(h.ctx.status, null);
}
{
  const h = harness(); h.ctx.failAt = 2;
  await h.ctx.runMemoryRebuild(h.story);
  assert.equal(h.disk().memories.length, 1); assert.ok(h.disk().memoryRebuild);
  assert.equal(h.ctx.status.phase, 'error');
  // Reload from persisted progress, switch viewed path, resume the captured lineage.
  const reloaded = harness(h.disk());
  reloaded.story.paths.unshift({ id: 'other', name: 'Other', entries: [{ chapterId: 'c1', versionId: 'v1' }] });
  await reloaded.ctx.runMemoryRebuild(reloaded.story);
  assert.equal(reloaded.summaries(), 1, 'reload/resume does not regenerate the completed first chapter');
  assert.equal(reloaded.disk().memories.length, 2); assert.equal(reloaded.disk().memoryRebuild, undefined);
}
{
  const h = harness(); h.ctx.cancel = true; await h.ctx.runMemoryRebuild(h.story);
  assert.equal(h.summaries(), 1); assert.equal(h.ctx.status, null); assert.ok(h.disk().memoryRebuild);
  assert.equal(h.state.readerEditBusy, false);
}
{
  const h = harness(), before = json(h.story); h.state.pendingReaderResult = {};
  await h.ctx.runMemoryRebuild(h.story); assert.equal(h.summaries(), 0); assert.deepEqual(h.story, before);
  h.state.pendingReaderResult = null; h.ctx.failSave = true;
  await h.ctx.runMemoryRebuild(h.story); assert.equal(h.summaries(), 0); assert.deepEqual(h.story, before);
}
// Host reasons in the dialog, toast and Technical details are bounded and redacted, keep the actual reason
// and the explicit Resume, and leave the summary saved before the failure in place.
const hostError = code => Object.assign(Error(`The model ended early: max_output_tokens. sessionId=secret-session https://private.invalid/x Bearer secret-token ${'x'.repeat(3000)}`), { code });
const assertHostText = (text, suffix = '') => {
  assert.ok(text.startsWith('The model ended early: max_output_tokens.'), 'the actual host reason stays visible');
  assert.ok(text.endsWith(suffix));
  assert.doesNotMatch(text, /secret-session|private\.invalid|secret-token|\[redacted\]/);
  assert.ok(text.length <= 1500 + suffix.length, 'displayed host text is bounded');
};
{
  const h = harness(); h.ctx.failAt = 2; h.ctx.failWith = hostError('incomplete');
  await h.ctx.runMemoryRebuild(h.story);
  const toast = h.calls.find(item => typeof item === 'string' && item.includes('Resume memory rebuild'));
  assertHostText(toast, ' Resume memory rebuild to retry.');
  assert.equal(h.ctx.status.phase, 'error'); assert.equal(h.ctx.status.message, 'Story memory rebuild stopped.');
  assert.equal(h.state.memoryRebuildFailure.failure.code, 'incomplete'); assert.equal(h.state.memoryRebuildFailure.failure.category, 'service');
  assertHostText(h.state.memoryRebuildFailure.failure.message);
  assert.equal(h.disk().memories.length, 1, 'the first saved summary stays'); assert.ok(h.disk().memoryRebuild, 'Resume stays available');
  assert.equal(h.summaries(), 2, 'no automatic retry');
}
{
  const h = harness(); h.ctx.$('memory-rebuild-dialog').open = true; h.ctx.releaseError = hostError('timeout');
  await h.ctx.runMemoryRebuild(h.story);
  assertHostText(h.ctx.$('memory-rebuild-error').textContent);
  assert.equal(h.summaries(), 0); assert.equal(h.disk().memoryRebuild, undefined, 'nothing was invalidated');
}
{ // A request whose release failed keeps its cleanup status, now with the bounded, redacted reason.
  const h = harness(); h.ctx.failAt = 1; h.ctx.failWith = hostError('response_too_large');
  h.ctx.releaseInvalidReaderResponse = async () => { h.state.pendingReaderRequestId = 'held'; throw Error('Cannot release'); };
  await h.ctx.runMemoryRebuild(h.story);
  assert.equal(h.ctx.status.phase, 'cleanup'); assertHostText(h.ctx.status.message);
}
console.log('PASS explicit memory rebuild: invalidation rollback, preserved chapters/paths/help/provenance, captured lineage, sessions, cancellation, save blocking, reload/resume without repeating summaries, and bounded redacted host reasons');

// A memory whose only eligible event is tiny (the rest are the four newest) makes no compaction request,
// and preparation succeeds. A memory with enough eligible events condenses them in one request
// whose arc budget matches the shorter-than-source check.
async function compactionCase(events) {
  const story = fixture(); story.chapters = [story.chapters[0]]; story.paths[0].entries = [story.paths[0].entries[0]]; story.memories = [];
  const state = { providerId: 'mock', model: 'mock' }; const seen = { summaries: 0, compactions: [] };
  const memory = createStoryMemory({ state, normalizeChapters: s => s.chapters,
    async readerAi(kind, input, instructions) {
      if (kind === 'summary') { seen.summaries++; return JSON.stringify({ newThreads: [{ ref: 't1', thread: 'Still open.' }], newEvents: events }); }
      assert.equal(kind, 'memory-compact'); assert.match(instructions, /at most maxArcTextCharacters/);
      seen.compactions.push(input);
      return JSON.stringify({ arcs: [{ text: 'a short arc.', covers: input.events.map(event => event.id) }] });
    }, async savePendingReaderResult() { state.pendingReaderResult.apply(); state.pendingReaderResult = null; } });
  const loading = { querySelector: () => ({}) };
  const result = await memory.prepareStoryMemory(story, story.paths[0].entries, loading);
  await memory.prepareStoryMemory(story, story.paths[0].entries, loading);
  return { result, ...seen };
}
const onThread = n => Array.from({ length: n }, () => ({ event: 'b'.repeat(400), importance: 'major', threads: ['t1'] }));
{
  const { result, summaries, compactions } = await compactionCase([{ event: 'a'.repeat(71), importance: 'minor' }, ...Array.from({ length: 4 }, () => ({ event: 'n'.repeat(3000), importance: 'major' }))]);
  assert.equal(summaries, 1);
  assert.equal(compactions.length, 0, 'no request for a single tiny event'); assert.equal(result.events.length, 5);
}
{
  const { summaries, compactions, result } = await compactionCase([...Array.from({ length: 10 }, () => ({ event: 'm'.repeat(300), importance: 'minor' })), ...onThread(18)]);
  assert.equal(summaries, 1); assert.equal(compactions.length, 1, 'one request, reused from the cache afterwards');
  const input = compactions[0];
  assert.ok(input.events.length >= 10, 'enough events to approach the target');
  assert.equal(input.maxArcTextCharacters, input.events.map(event => event.event).join('\n').length - 1);
  assert.equal(result.arcs.length, 1); assert.ok(result.events.length >= 4, 'the newest events stay');
}
console.log('PASS compaction never asks to condense one tiny event, and sizes requests to reach the memory target with an exact arc budget');
