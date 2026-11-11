import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createPipeline } from '../js/generation-pipeline.js';
import { createAiSession } from '../js/ai-session.js';
import { readingPlan } from '../js/learning-validation.js';
import { createStoryMemory } from '../js/story-memory.js';
import { aiNotification } from '../js/ai-notification.js';
import { saveBeforeAcknowledge } from '../js/request-lifecycle.js';
import { failureInfo } from '../js/generation-errors.js';

const source = fs.readFileSync('js/bridge.js', 'utf8');
const realSetTimeout = globalThis.setTimeout;
const frozenTimers = [];
const frozenTimeout = (callback, ms) => { frozenTimers.push({ callback, ms }); return frozenTimers.length; };
const args = { providerId: 'p', model: 'm', input: '{}' };
const errorReply = (code, message) => ({ type: 'error', data: { code, message } });

function bridge(handler = action => action === 'start' ? { type: 'result', data: 'request' } : null, timers = frozenTimeout) {
  const sent = [], listeners = new Map();
  const channel = { postMessage(raw) {
    const message = JSON.parse(raw); sent.push(message);
    const reply = handler(message.action, message);
    if (reply) queueMicrotask(() => respond(message, reply));
  } };
  const respond = (message, reply) => channel.onmessage({ data: JSON.stringify({ id: message.id, ...reply }) });
  const context = vm.createContext({
    window: { AppAI: channel, addEventListener(name, listener) { listeners.set(name, listener); } },
    URLSearchParams, setTimeout: timers, clearTimeout, Date, JSON,
  });
  vm.runInContext(source.replace(/export /g, '') + '\nglobalThis.bridge = { ai, aiResults };', context);
  return {
    ...context.bridge, sent, respond,
    push(event, id, data) { listeners.get('message')({ data: JSON.stringify({ event, id, data }) }); },
  };
}

// Bounded microtask draining makes a stalled chain fail without relying on the frozen timers.
async function until(predicate, message) {
  for (let i = 0; i < 500 && !predicate(); i++) await Promise.resolve();
  assert.ok(predicate(), message);
}

// Native result replies never arrive, and no page timer fires. Only the window event can settle wait.
for (const event of ['complete', 'error']) {
  const b = bridge(), id = await b.ai.start(args);
  const waits = [b.ai.wait(id), b.ai.wait(id)];
  const outcome = event === 'error'
    ? Promise.all(waits.map(wait => assert.rejects(wait, { code: 'incomplete', message: 'Model ended at max_output_tokens.' })))
    : Promise.all(waits);
  assert.equal(b.aiResults.get(id).listeners.size, 2);
  assert.equal(b.sent.filter(m => m.action === 'result').length, 2);
  b.push(event, id, event === 'complete' ? 'Finished text' : { code: 'incomplete', message: 'Model ended at max_output_tokens.' });
  if (event === 'complete') assert.deepEqual(await outcome, ['Finished text', 'Finished text']);
  else await outcome;
  assert.equal(b.aiResults.get(id).listeners.size, 0, 'Every settled waiter unsubscribes');
  const polls = b.sent.filter(m => m.action === 'result').length;
  if (event === 'complete') assert.equal(await b.ai.wait(id), 'Finished text');
  else await assert.rejects(b.ai.wait(id), { code: 'incomplete' });
  assert.equal(b.sent.filter(m => m.action === 'result').length, polls, 'Cached completion needs no poll');
}

// Late pending replies and errors cannot settle again or schedule another poll after pushed completion.
for (const reply of [{ type: 'result', data: null }, errorReply('service', 'Late failure.')]) {
  const b = bridge(), id = await b.ai.start(args);
  const wait = b.ai.wait(id);
  b.push('complete', id, 'Pushed text');
  assert.equal(await wait, 'Pushed text');
  const timersBefore = frozenTimers.length;
  b.respond(b.sent.find(m => m.action === 'result'), reply);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(frozenTimers.length, timersBefore, 'A late reply schedules no fallback timer');
  assert.equal(b.aiResults.get(id).listeners.size, 0);
}

// Polling may win, too; its listener is removed, and a queued poll is inert after a push wins.
{
  const b = bridge(action => action === 'start' ? { type: 'result', data: 'request' } : { type: 'result', data: 'Polled text' });
  const id = await b.ai.start(args);
  assert.equal(await b.ai.wait(id), 'Polled text');
  assert.equal(b.aiResults.get(id).listeners.size, 0);
}
{
  const b = bridge(action => action === 'start' ? { type: 'result', data: 'request' } : errorReply('timeout', 'Connection timed out.'));
  const id = await b.ai.start(args);
  await assert.rejects(b.ai.wait(id), { code: 'timeout', message: 'Connection timed out.' });
  assert.equal(b.aiResults.get(id).listeners.size, 0, 'A poll failure also unsubscribes');
}
{
  const b = bridge(action => ({ type: 'result', data: action === 'start' ? 'request' : null }));
  const id = await b.ai.start(args), start = frozenTimers.length;
  const wait = b.ai.wait(id);
  await until(() => frozenTimers.slice(start).some(t => t.ms === 400), 'Pending result schedules a fallback');
  const poll = frozenTimers.slice(start).find(t => t.ms === 400);
  b.push('complete', id, 'Finished'); await wait;
  const calls = b.sent.length;
  await poll.callback();
  assert.equal(b.sent.length, calls, 'A queued fallback makes no host call once settled');
}

// An earlier page's ID has no listener entry. Real polling still retrieves its retained result.
{
  let polls = 0;
  const b = bridge(action => {
    assert.equal(action, 'result');
    return { type: 'result', data: ++polls === 1 ? null : 'Retained text' };
  }, (callback, ms) => {
    const timer = realSetTimeout(callback, ms);
    if (ms === 30000) timer.unref(); // Only the actual 400 ms fallback keeps this test alive.
    return timer;
  });
  assert.equal(await b.ai.wait('persisted-id'), 'Retained text');
  assert.equal(polls, 2);
  assert.equal(b.aiResults.size, 0);
}

// Exercise the real pipeline, session wrapper and VM bridge together with every page timer frozen.
// A one-slot host also forces Japanese enrichment's request_in_progress fallback.
const originalInterval = globalThis.setInterval, originalFrame = globalThis.requestAnimationFrame;
globalThis.setTimeout = frozenTimeout;
globalThis.setInterval = frozenTimeout;
globalThis.requestAnimationFrame = callback => frozenTimeout(callback, 0);
try {
  for (const language of ['de', 'ja']) {
    const events = [], requests = new Map();
    let active = null, durable = [], serial = 0;
    const b = bridge((action, message) => {
      if (action === 'capabilities') return { type: 'result', data: { sessions: 1 } };
      if (action === 'beginSession') return { type: 'result', data: { sessionId: 'session' } };
      if (action === 'endSession') return { type: 'result', data: true };
      if (action === 'start') {
        const input = JSON.parse(message.data.input);
        if (active) { events.push(`refused ${input.kind}`); return errorReply('request_in_progress', 'One request at a time.'); }
        assert.equal(message.data.sessionId, 'session');
        const id = `request-${++serial}`;
        requests.set(id, input); active = id; events.push(`start ${input.kind}`);
        return { type: 'result', data: id };
      }
      if (action === 'acknowledge') {
        const input = requests.get(message.requestId);
        assert.ok(durable[0], 'A checkpoint exists before acknowledgement');
        if (input.kind === 'language-plan') assert.ok(durable[0].plan);
        if (input.kind === 'create') assert.ok(durable[0].prose);
        if (input.kind === 'notes' || input.kind === 'readings') {
          assert.ok(language === 'ja' ? durable[0].parallel[input.kind].done : durable[0].result);
        }
        events.push(`ack ${input.kind}`); active = null;
        return { type: 'result', data: true };
      }
      assert.equal(action, 'result');
      return null; // Even the host's result command stays pending throughout the operation.
    });
    const session = createAiSession({ ai: b.ai, isVisible: () => false });
    const pipeline = createPipeline({
      records: [], parallel: true, persist(records) { durable = structuredClone(records); },
      ai: { ...b.ai, start: a => session.start(a) }, apply() { events.push('apply'); },
    });
    const op = pipeline.create({ kind: 'create', language, planned: true, input: {}, config: { providerId: 'p', model: 'm' }, instructions: 'i' });
    let done = false;
    const run = session.run(() => pipeline.run(op)).then(() => { done = true; });
    const prose = language === 'ja' ? { title: '今日', story: '今日は町へ行きます。' } : { title: 'Brot', story: 'Mia kauft Brot.' };
    const word = language === 'ja' ? '町' : 'Brot';
    const stages = language === 'ja' ? ['language-plan', 'create', 'notes', 'readings'] : ['language-plan', 'create', 'notes'];
    for (const stage of stages) {
      await until(() => active && b.aiResults.get(active)?.listeners.size, `${language}: ${stage} starts and waits without timers`);
      const id = active, input = requests.get(id);
      assert.equal(input.kind, stage);
      const response = stage === 'language-plan' ? { vocabulary: [{ word, meaning: 'fixture' }], grammar: [], guidance: '' }
        : stage === 'create' ? prose
        : stage === 'notes' ? { glossary: [{ word, meaning: 'fixture', forms: [word] }] }
        : { readings: readingPlan(prose).spans.map(s => ({ id: s.id, reading: s.text === '今日' ? 'きょう' : 'まち' })) };
      b.push('complete', id, JSON.stringify(response));
    }
    await until(() => done, `${language}: application finishes without timers`);
    await run;
    assert.deepEqual(events.filter(e => e.startsWith('start')), stages.map(stage => `start ${stage}`));
    for (let i = 1; i < stages.length; i++) assert.ok(events.indexOf(`ack ${stages[i - 1]}`) < events.indexOf(`start ${stages[i]}`));
    if (language === 'ja') assert.ok(events.includes('refused readings'), 'The older host forces promise-only sequential fallback');
    assert.equal(events.at(-1), 'apply');
    assert.deepEqual(durable, []);
  }

  // Cancel during an active wait: no timer is needed to stop, and the next stage never starts.
  {
    const events = [], requests = new Map();
    let active = null, durable = [], serial = 0;
    const b = bridge((action, message) => {
      if (action === 'capabilities') return { type: 'result', data: { sessions: 1 } };
      if (action === 'beginSession') return { type: 'result', data: { sessionId: 'session' } };
      if (action === 'endSession') { events.push('end session'); return { type: 'result', data: true }; }
      if (action === 'start') {
        const { kind } = JSON.parse(message.data.input), id = `request-${++serial}`;
        requests.set(id, kind); active = id; events.push(`start ${kind}`);
        return { type: 'result', data: id };
      }
      if (action === 'cancel') { events.push(`cancel ${requests.get(message.requestId)}`); return { type: 'result', data: true }; }
      if (action === 'acknowledge') {
        const kind = requests.get(message.requestId);
        if (kind === 'language-plan') assert.ok(durable[0]?.plan, 'the plan is saved before its request is released');
        events.push(`ack ${kind}`);
        return { type: 'result', data: true };
      }
      assert.equal(action, 'result');
      return null;
    });
    const session = createAiSession({ ai: b.ai, isVisible: () => false });
    const pipeline = createPipeline({
      records: [], parallel: true, persist(records) { durable = structuredClone(records); },
      ai: { ...b.ai, start: a => session.start(a) }, apply() { events.push('apply'); },
    });
    const op = pipeline.create({ kind: 'create', language: 'de', planned: true, input: {}, config: { providerId: 'p', model: 'm' }, instructions: 'i' });
    let outcome = null;
    const run = session.run(() => pipeline.run(op)).then(() => { outcome = 'resolved'; }, error => { outcome = error; });
    await until(() => active && b.aiResults.get(active)?.listeners.size, 'the plan waits without timers');
    b.push('complete', active, JSON.stringify({ vocabulary: [{ word: 'Brot', meaning: 'fixture' }], grammar: [], guidance: '' }));
    await until(() => active && requests.get(active) === 'create' && b.aiResults.get(active)?.listeners.size, 'prose starts and waits without timers');
    const proseId = active;
    await pipeline.cancel();
    await until(() => outcome, 'cancellation settles the run without timers');
    await run;
    assert.equal(outcome.code, 'generation_cancelled');
    assert.deepEqual(durable, [], 'the cancelled operation is discarded');
    b.push('complete', proseId, JSON.stringify({ title: 'Brot', story: 'Mia kauft Brot.' }));
    for (let i = 0; i < 50; i++) await Promise.resolve();
    assert.deepEqual(events, ['start language-plan', 'ack language-plan', 'start create', 'cancel create', 'ack create', 'end session'],
      'a late completion after Cancel starts no next stage and applies nothing');
  }

  // Story-memory summaries and compaction through the production readerAi, save and release code,
  // the session wrapper and the bridge, while the page is hidden.
  {
    const appSource = fs.readFileSync('js/app.js', 'utf8');
    const section = (start, end) => appSource.slice(appSource.indexOf(start), appSource.indexOf(end, appSource.indexOf(start)));
    const events = [], requests = new Map();
    let active = null, durable = null, serial = 0;
    const b = bridge((action, message) => {
      if (action === 'capabilities') return { type: 'result', data: { sessions: 1 } };
      if (action === 'beginSession') return { type: 'result', data: { sessionId: 'session' } };
      if (action === 'endSession') { events.push('end session'); return { type: 'result', data: true }; }
      if (action === 'providers') return { type: 'result', data: { providers: [{ id: 'p', connected: true }] } };
      if (action === 'start') {
        assert.equal(message.data.sessionId, 'session');
        const input = JSON.parse(message.data.input), id = `memory-${++serial}`;
        requests.set(id, input); active = id; events.push(`start ${input.kind}`);
        return { type: 'result', data: id };
      }
      if (action === 'acknowledge') {
        assert.equal(durable?.memories?.length, serial, 'the record from this request is saved before it is released');
        events.push(`ack ${requests.get(message.requestId).kind}`); active = null;
        return { type: 'result', data: true };
      }
      assert.equal(action, 'result');
      return null;
    });
    const session = createAiSession({ ai: b.ai, isVisible: () => false });
    const node = () => ({ textContent: '', children: [], append(...nodes) { this.children.push(...nodes); }, querySelector() { return this.strong ||= node(); }, addEventListener() {}, remove() {} });
    const ctx = vm.createContext({
      ai: b.ai, aiSession: session, aiNotification, saveBeforeAcknowledge, failureInfo, readerGeneration: null,
      state: { models: [{ id: 'm' }], providerId: 'p', model: 'm' }, workspaceStorage: { assertWritable() {} },
      document: { createElement: node }, $: () => node(), toast() {}, renderReaderGeneration() {},
      persistReaderStory(story) { durable = structuredClone(story); events.push('save'); },
    });
    vm.runInContext(section('async function readerAi(', 'function renderPendingReaderResult('), ctx);
    const memory = createStoryMemory({ state: ctx.state, normalizeChapters: story => story.chapters, readerAi: (...a) => ctx.readerAi(...a),
      savePendingReaderResult: () => ctx.savePendingReaderResult(), discardResponse: () => ctx.releaseInvalidReaderResponse() });
    const story = { id: 's', language: 'de', memories: [], chapters: [
      { id: 'c1', versions: [{ id: 'v1', title: 'Eins', story: 'Mia wartet.' }] },
      { id: 'c2', versions: [{ id: 'v2', title: 'Zwei', story: 'Mia geht.' }] }] };
    let result = null;
    const run = session.run(() => memory.prepareStoryMemory(story, [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }], node(), { providerId: 'p', model: 'm', reasoning: '' }))
      .then(value => { result = value; });
    const responses = {
      summary: [{ newEvents: [{ ref: 'e1', event: 'Mia waits.' }] },
        { newThreads: [{ ref: 't1', thread: 'Still open.' }], newEvents: [
          ...Array.from({ length: 10 }, () => ({ event: 'm'.repeat(300), importance: 'minor' })),
          ...Array.from({ length: 18 }, () => ({ event: 'b'.repeat(400), importance: 'major', threads: ['t1'] }))] }],
      'memory-compact': [],
    };
    for (const kind of ['summary', 'summary', 'memory-compact']) {
      await until(() => active && b.aiResults.get(active)?.listeners.size, `${kind} starts and waits without timers`);
      const input = requests.get(active);
      assert.equal(input.kind, kind);
      const response = kind === 'summary' ? responses.summary.shift() : { arcs: [{ text: 'a short arc.', covers: input.events.map(event => event.id) }] };
      b.push('complete', active, JSON.stringify(response));
    }
    await until(() => result, 'story memory is ready without timers');
    await run;
    assert.deepEqual(events, ['start summary', 'save', 'ack summary', 'start summary', 'save', 'ack summary', 'start memory-compact', 'save', 'ack memory-compact', 'end session']);
    assert.equal(result.arcs.length, 1);
    assert.equal(durable.memories.length, 3);
    assert.equal(ctx.state.pendingReaderResult, null); assert.equal(ctx.state.pendingReaderRequestId, null); assert.equal(ctx.state.requestId, null);
  }
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.setInterval = originalInterval;
  if (originalFrame === undefined) delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame = originalFrame;
}
console.log('PASS pushed AI completion/errors, polling recovery, waiter cleanup/races, background pipeline handoffs, cancellation during a wait, and story-memory summaries and compaction through readerAi with frozen timers');
