// Background story context: queueing, start conditions, stop/settle, quiet cancellation and the setting.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createStoryMemory } from '../js/story-memory.js';

const source = fs.readFileSync('js/app.js', 'utf8');
const code = source.slice(source.indexOf('let backgroundTarget = null'), source.indexOf("for (const id of ['reader-generation-dismiss'"));
const element = () => ({ children: [], hidden: false, append(...nodes) { this.children.push(...nodes); }, remove() { this.removed = true; },
  querySelector(selector) { return this.children.find(node => node.className === selector.slice(1)) || null; } });

function harness({ ready = false, enabled = true } = {}) {
  const story = { id: 'story', paths: [{ id: 'main', entries: [{ chapterId: 'c1', versionId: 'v1' }] }, { id: 'alt', entries: [{ chapterId: 'c1', versionId: 'v2' }] }] };
  const calls = [], toasts = [];
  const ctx = { state: { backgroundStoryContext: enabled, stories: [story], model: 'mock', providerId: 'p', reasoning: '' }, ai: { available: true }, pipeline: { records: [] },
    readerGeneration: null, calls, toasts, story, console,
    document: { createElement: element, body: element() },
    generationLive: () => false, selectedPath: s => s.paths[0], storyContextReady: () => ready, toast: message => toasts.push(message),
    renderReaderGeneration() {},
    setReaderGeneration(value) { ctx.readerGeneration = value; ctx.maybeStartBackgroundContext(); },
    // Each summary request waits for the test; its cancel control lives in the hidden host like readerAi's.
    prepareStoryMemory(s, entries, loading, config, host) {
      calls.push({ entries, config });
      const cancel = { className: 'reader-ai-cancel', click() { ctx.pending.reject(new Error('Request cancelled.')); } };
      host.append(cancel);
      return new Promise((resolve, reject) => { ctx.pending = { resolve, reject }; });
    } };
  vm.createContext(ctx);
  vm.runInContext(code + '\nObject.assign(globalThis, { queueBackgroundContext, maybeStartBackgroundContext, stopBackgroundContext, settleBackgroundContext, run: () => backgroundRun });', ctx);
  return ctx;
}

{ // Starts after the ready status is gone, shows its own status, and clears it when done.
  const h = harness();
  h.readerGeneration = { phase: 'ready' };
  h.queueBackgroundContext('story', 'alt');
  assert.equal(h.calls.length, 0, 'a showing status (Chapter N is ready) is seen first');
  h.setReaderGeneration(null);
  assert.equal(h.calls.length, 1); assert.equal(JSON.stringify(h.calls[0].entries), JSON.stringify([{ chapterId: 'c1', versionId: 'v2' }]), 'the queued path is prepared');
  assert.equal(h.readerGeneration.message, 'Preparing story context in the background…');
  assert.equal(h.calls[0].config.signal, h.run(), 'requests carry the run so a stop is honoured between requests');
  h.pending.resolve({});
  await h.run().promise;
  assert.equal(h.run(), null); assert.equal(h.readerGeneration, null); assert.deepEqual(h.toasts, []);
}
{ // Nothing starts when the setting is off, the context is already saved, or other work is pending.
  for (const options of [{ enabled: false }, { ready: true }]) { const h = harness(options); h.queueBackgroundContext('story'); assert.equal(h.calls.length, 0, JSON.stringify(options)); }
  const h = harness(); h.state.pendingReaderResult = {}; h.queueBackgroundContext('story'); assert.equal(h.calls.length, 0, 'an unsaved response blocks it');
  h.state.pendingReaderResult = null; h.maybeStartBackgroundContext(); assert.equal(h.calls.length, 1, 'it starts once the response is handled');
}
{ // Another AI action stops it quietly; the stopped run makes no further request.
  const h = harness(); h.queueBackgroundContext('story');
  await h.stopBackgroundContext();
  assert.equal(h.run(), null); assert.deepEqual(h.toasts, [], 'stopping is not reported as a failure'); assert.equal(h.readerGeneration, null);
}
{ // Continue on the same lineage waits for it; on another lineage it stops it; a user cancel also cancels Continue.
  const same = harness(); same.queueBackgroundContext('story', 'main');
  const waiting = same.settleBackgroundContext('story', [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v3' }]);
  let settled = false; waiting.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false, 'Continue waits for the summary already running');
  same.pending.resolve({}); await waiting; assert.equal(settled, true);

  const other = harness(); other.queueBackgroundContext('story', 'alt');
  await other.settleBackgroundContext('story', [{ chapterId: 'c1', versionId: 'v1' }]);
  assert.equal(other.run(), null, 'a different lineage is stopped instead');

  const cancelled = harness(); cancelled.queueBackgroundContext('story', 'main');
  const run = cancelled.run(), waitingCancel = cancelled.settleBackgroundContext('story', [{ chapterId: 'c1', versionId: 'v1' }]);
  run.cancelledByUser = true; cancelled.pending.reject(new Error('Request cancelled.'));
  await assert.rejects(waitingCancel, /Request cancelled/); assert.deepEqual(cancelled.toasts, []);
}
{ // A real failure is reported once and never retried; a hidden page is not a failure.
  const h = harness(); h.queueBackgroundContext('story');
  h.pending.reject(Object.assign(new Error('Service failed.'), { code: 'service' })); await h.run().promise;
  assert.equal(h.toasts.length, 1); assert.match(h.toasts[0], /Continue will prepare it/); assert.equal(h.calls.length, 1, 'no automatic retry');
  const hidden = harness(); hidden.queueBackgroundContext('story');
  hidden.pending.reject(Object.assign(new Error('background'), { code: 'background_paused' })); await hidden.run().promise;
  assert.deepEqual(hidden.toasts, []);
}
{ // storyContextReady: false before the newest chapter is summarized, true once its record is saved.
  const state = {};
  const story = { id: 's', chapters: [{ id: 'c1', versions: [{ id: 'v1', story: 'Mia kauft Brot.' }] }], memories: [] };
  const memory = createStoryMemory({ state, promptVersion: 'test', normalizeChapters: s => s.chapters, readerAi: async () => JSON.stringify({ newEvents: [{ ref: 'e1', event: 'Mia buys bread.' }] }), savePendingReaderResult: async () => { state.pendingReaderResult.apply(); state.pendingReaderResult = null; } });
  const entries = [{ chapterId: 'c1', versionId: 'v1' }];
  assert.equal(memory.storyContextReady(story, entries), false);
  assert.equal(memory.storyContextReady(story, []), true, 'nothing to summarize for chapter 1');
  await memory.prepareStoryMemory(story, entries, { querySelector: () => ({}) });
  assert.equal(memory.storyContextReady(story, entries), true, 'a saved summary means Continue makes no memory request');
}
{ // Settings: the preference is saved, defaults on, and the toggle is wired.
  const storage = fs.readFileSync('js/workspace-storage.js', 'utf8'), html = fs.readFileSync('index.html', 'utf8');
  assert.match(storage, /backgroundStoryContext:state\.backgroundStoryContext !== false/);
  assert.match(source, /state\.backgroundStoryContext = settings\.backgroundStoryContext !== false;/);
  assert.match(html, /<input id="background-context" type="checkbox" checked aria-describedby="background-context-hint">/);
  assert.match(source, /if \(!state\.backgroundStoryContext\) stopBackgroundContext\(\)/, 'turning it off stops a running summary');
}
console.log('PASS background story context: waits for status, setting and saved context, stops for other AI work, Continue reuses it, quiet cancels, one reported failure');
