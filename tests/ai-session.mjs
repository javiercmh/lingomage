import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createAiSession } from '../js/ai-session.js';
import { createPipeline } from '../js/generation-pipeline.js';
import { failureInfo, recoverySummary } from '../js/generation-errors.js';
import { readingPlan, validateProse } from '../js/learning-validation.js';

const app = fs.readFileSync('js/app.js', 'utf8');
const bridgeSource = fs.readFileSync('js/bridge.js', 'utf8');
const coded = (message, code) => Object.assign(new Error(message), { code });

// ---------- A fake host: sessions, requests and an event log ----------
function host({ supported = true, hidden = false, failBegin, failStart } = {}) {
  const events = [];
  let sessions = 0, visible = !hidden;
  const ai = {
    sessions: {
      async supported() { events.push('supported'); if (supported instanceof Error) throw supported; return supported; },
      async begin(args) { events.push('begin'); if (failBegin) throw failBegin; assert.ok(args.model && args.providerId, 'begin carries the real chosen provider and model'); return { sessionId: `s${++sessions}` }; },
      async end(id) { events.push(`end ${id}`); },
    },
    async start(args) {
      const kind = JSON.parse(args.input).kind;
      events.push(`start ${kind}${args.sessionId ? ` @${args.sessionId}` : ''}`);
      if (failStart) { const error = failStart(kind); if (error) throw error; }
      return kind;
    },
  };
  const session = createAiSession({ ai, isVisible: () => visible });
  return { ai, session, events, show() { visible = true; }, hide() { visible = false; } };
}
const args = (kind, extra = {}) => ({ providerId: 'p', model: 'm', instructions: 'i', input: JSON.stringify({ kind }), title: 'Title', body: 'Body', ...extra });

// ---------- Session wrapper ----------
{
  const h = host();
  await h.session.start(args('explain'));
  assert.deepEqual(h.events, ['start explain'], 'A single request outside any operation opens no session');
}
{
  const h = host({ hidden: true });
  await assert.rejects(h.session.start(args('explain')), { code: 'background_paused' });
  assert.deepEqual(h.events, [], 'A hidden page makes no host call at all, so no failed request or slot is created');
}
{
  const h = host();
  await h.session.run(async () => {
    await h.session.start(args('summary')); await h.session.start(args('language-plan'));
    await h.session.run(async () => { await h.session.start(args('create')); });
    assert.equal(h.events.filter(e => e.startsWith('end')).length, 0, 'A nested scope never ends the outer session early');
    await h.session.start(args('notes'));
  });
  assert.deepEqual(h.events, ['supported', 'begin', 'start summary @s1', 'start language-plan @s1', 'start create @s1', 'start notes @s1', 'end s1']);
}
{
  const h = host();
  await h.session.run(async () => {});
  assert.deepEqual(h.events, [], 'A scope that starts nothing (finish, save, acknowledge) never asks the host for a session');
}
{
  const h = host({ supported: false, hidden: true });
  await h.session.run(async () => { await assert.rejects(h.session.start(args('create')), { code: 'background_paused' }); });
  assert.deepEqual(h.events, ['supported'], 'Unsupported hosts get no session and the hidden-page guard still applies');
  h.show();
  await h.session.run(async () => { await h.session.start(args('create')); });
  assert.ok(h.events.includes('start create') && !h.events.includes('begin'));
}
for (const failure of [coded('Request timed out.', undefined), coded('Sign in.', 'authentication'), coded('Service failed', 'service'), Object.assign(new Error('Unexpected AI capabilities response.'), { code: 'invalid_response' })]) {
  const h = host({ supported: failure });
  await h.session.run(async () => { await assert.rejects(h.session.start(args('create')), failure); });
  assert.ok(!h.events.some(e => e.startsWith('start')), `${failure.code ?? 'timeout'}: an unconfirmed capability never falls back to an unsessioned request`);
}
for (const bad of [undefined, null, 'ok', {}, { sessionId: '' }, { sessionId: 7 }, { sessionId: null }, { sessionId: {} }, { sessionId: 'x'.repeat(65) }]) {
  const h = host(); h.ai.sessions.begin = async () => bad;
  await h.session.run(async () => { await assert.rejects(h.session.start(args('create')), { code: 'invalid_response' }, JSON.stringify(bad)); });
  assert.ok(!h.events.some(e => e.startsWith('start')), `${JSON.stringify(bad)}: a malformed begin response never leads to an unsessioned request`);
  assert.ok(!h.events.some(e => e.startsWith('end')), 'No session id means nothing to end');
}
{
  const h = host(); h.ai.sessions.begin = async () => ({ sessionId: 'x'.repeat(64) });
  await h.session.run(async () => { await h.session.start(args('create')); });
  assert.ok(h.events.includes(`start create @${'x'.repeat(64)}`), 'A 64-character id is accepted');
}
{
  const h = host({ failBegin: coded('AI was not allowed for this app.', 'permission') });
  await h.session.run(async () => { await assert.rejects(h.session.start(args('create')), { code: 'permission' }); });
  assert.ok(!h.events.some(e => e.startsWith('start')), 'A refused begin starts nothing');
}
{
  // A cancelled, expired or lost session ends the operation's session for good: no automatic reopen or unsessioned fallback.
  for (const code of ['session_cancelled', 'session_idle', 'session_timeout', 'not_found', 'background_service']) {
    const h = host({ failStart: kind => kind === 'notes' ? coded('x', code) : null });
    await h.session.run(async () => {
      await h.session.start(args('create'));
      await assert.rejects(h.session.start(args('notes')), { code });
      await assert.rejects(h.session.start(args('notes')), { code });
    });
    assert.equal(h.events.filter(e => e === 'begin').length, 1, `${code}: not reopened within the operation`);
    assert.equal(h.events.filter(e => e.startsWith('start notes')).length, 1, `${code}: no further start reaches the host`);
    // Only a new explicit operation (Resume or Retry) opens a new session.
    await h.session.run(async () => { await h.session.start(args('notes')).catch(() => {}); });
    assert.equal(h.events.filter(e => e === 'begin').length, 2);
  }
}
{
  const h = host(); h.ai.sessions.end = async () => { throw coded('gone', 'not_found'); };
  await h.session.run(async () => { await h.session.start(args('create')); });
  assert.ok(true, 'A failing end never masks the operation outcome');
}
{
  const h = host({ hidden: true });
  await h.session.run(async () => { h.show(); await h.session.start(args('create')); h.hide(); await h.session.start(args('notes')); });
  assert.deepEqual(h.events.filter(e => e.startsWith('start')), ['start create @s1', 'start notes @s1'], 'Under a session the later stage may start while hidden');
}

// ---------- Real pipeline workflows ----------
const plan = { vocabulary: [{ word: '町', meaning: 'town' }], grammar: [], guidance: 'Clear references.' };
const jaProse = { title: '今日', story: '今日は町へ行きます。町へ行きます。', glossary: [{ word: '町', meaning: 'town', forms: ['町'] }] };
const deProse = { title: 'Brot', story: 'Mia kauft Brot.' };
const deNotes = { glossary: [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }] };
const exampleSet = sentence => ({ examples: Array.from({ length: 3 }, () => ({ sentence, translation: 'Example', highlightStart: 0, highlightEnd: 1 })) });

function workflow({ kind, language, ...options }) {
  const h = host(options);
  let durable = [];
  const responses = (input) => {
    if (input.kind === 'language-plan') return plan;
    if (input.kind === 'summary') return { characters: [], facts: [], plot: [], unresolved: [], uncertainties: [], situation: [] };
    if (input.kind === 'notes') return language === 'ja' ? { glossary: jaProse.glossary } : deNotes;
    if (input.kind === 'readings') return { readings: readingPlan(language === 'ja' ? (kind === 'examples' ? exampleSet('町は') : jaProse) : deProse, kind).spans.map(s => ({ id: s.id, reading: 'まち' })) };
    if (kind === 'examples') return exampleSet(language === 'ja' ? '町は' : 'Brot');
    return language === 'ja' ? jaProse : deProse;
  };
  const kinds = [];
  const fake = {
    async start(a) { const input = JSON.parse(a.input); kinds.push(input.kind); h.events.push(`start ${input.kind}${a.sessionId ? ` @${a.sessionId}` : ''}`); return `${input.kind}-${kinds.length}`; },
    async wait(id) { h.events.push(`wait ${id}`); return JSON.stringify(responses({ kind: id.replace(/-\d+$/, '') })); },
    async acknowledge(id) { h.events.push(`ack ${id}`); },
    async cancel(id) { h.events.push(`cancel ${id}`); },
  };
  // Mirrors initializePipeline: the pipeline starts requests through the session wrapper.
  h.session = createAiSession({ ai: { ...h.ai, start: fake.start }, isVisible: () => !h.hiddenNow });
  const pipeline = createPipeline({ records: [], persist: value => { durable = structuredClone(value); }, ai: { ...fake, start: a => h.session.start(a) }, apply() { h.events.push('apply'); } });
  const op = pipeline.create({ kind, language, planned: kind !== 'examples', input: { topic: 'x' }, config: { providerId: 'p', model: 'm' }, instructions: 'i', promptVersion: 't' });
  return { h, pipeline, op, get durable() { return durable; } };
}

for (const [kind, language, stages] of [
  ['create', 'ja', ['language-plan', 'create', 'notes', 'readings']],
  ['create', 'de', ['language-plan', 'create', 'notes']],
  ['continue', 'ja', ['language-plan', 'continue', 'notes', 'readings']],
  ['rewrite', 'de', ['language-plan', 'rewrite', 'notes']],
  ['examples', 'de', ['examples']],
  ['examples', 'ja', ['examples', 'readings']],
]) {
  const { h, pipeline, op } = workflow({ kind, language });
  await h.session.run(() => pipeline.run(op));
  const starts = h.events.filter(e => e.startsWith('start'));
  assert.deepEqual(starts.map(e => e.split(' ')[1]), stages, `${kind}/${language}: every stage starts`);
  assert.ok(starts.every(e => e.endsWith('@s1')), `${kind}/${language}: all stages share one session`);
  assert.equal(h.events.filter(e => e === 'begin').length, 1);
  assert.equal(h.events.filter(e => e.startsWith('end')).length, 1);
  assert.equal(h.events.at(-1), 'end s1', 'The session ends only after the result is applied and the request released');
  assert.ok(h.events.indexOf('apply') < h.events.indexOf('end s1'));
}

// Continue and Rewrite: summary preparation is inside the same session as the generation stages.
{
  const { h, pipeline, op } = workflow({ kind: 'continue', language: 'de' });
  await h.session.run(async () => {
    for (const chunk of ['one', 'two']) { // readerAi summary requests, each saved and acknowledged before the next
      const id = await h.session.start(args('summary')); h.events.push(`ack ${id}`);
    }
    await h.session.run(() => pipeline.run(op)); // runContentOperation's own scope joins the outer one
  });
  assert.equal(h.events.filter(e => e === 'begin').length, 1);
  assert.ok(h.events.filter(e => e.startsWith('start')).every(e => e.endsWith('@s1')), 'summaries and stages share the session');
  assert.deepEqual(h.events.filter(e => e.startsWith('start')).map(e => e.split(' ')[1]), ['summary', 'summary', 'language-plan', 'continue', 'notes']);
  assert.equal(h.events.filter(e => e.startsWith('end')).length, 1);
}

// Resume with an outstanding request polls, saves and acknowledges it before any session is opened.
{
  const { h, pipeline, op } = workflow({ kind: 'create', language: 'de' });
  op.stage = 'prose'; op.plan = plan; op.request = { id: 'create-0', stage: 'prose', completed: false };
  await h.session.run(() => pipeline.run(op));
  const order = h.events.filter(e => /^(wait|ack|begin|start)/.test(e));
  assert.deepEqual(order.slice(0, 4), ['wait create-0', 'ack create-0', 'begin', 'start notes @s1'], 'Existing request first; the session opens only for the next new request');
}
// Finish request / Save response are cleanup-only: no session, no capability probe, no AI connectivity.
{
  const { h, pipeline, op } = workflow({ kind: 'create', language: 'de' });
  op.stage = 'notes'; op.prose = deProse; op.plan = plan; op.request = { id: 'create-0', stage: 'prose', completed: true };
  await pipeline.finishRequest(op);
  assert.deepEqual(h.events.filter(e => !e.startsWith('ack') && !e.startsWith('wait')), [], 'finishRequest touched neither sessions nor starts');
  assert.equal(op.request, null);
}
// The app itself keeps that split: sessions wrap generation, never cleanup.
{
  const between = (from, to) => app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
  const resume = between('async function resumeCheckpoint(', 'function revealRecovery(');
  assert.ok(resume.indexOf('pipeline.finishRequest(op)') < resume.indexOf('aiSession.run('), 'Resume finishes a completed request before, and outside, any session');
  const cont = between("$('reader-edit-submit').addEventListener", "$('reader-dialog').addEventListener");
  assert.ok(cont.indexOf('releaseSavedInference()') < cont.indexOf('aiSession.run('), 'Cleanup of earlier results happens before the session');
  assert.ok(cont.indexOf('aiSession.run(') < cont.indexOf('prepareStoryMemory(') && cont.indexOf('prepareStoryMemory(') < cont.indexOf('runContentOperation('), 'Summary preparation is inside the Continue/Rewrite session');
  assert.match(between('async function runContentOperation(', 'const { operationProvenance'), /aiSession\.run\(\(\) => pipeline\.run\(op\)\)/);
  for (const name of ['async function acknowledgeReaderResult(', 'async function releaseSavedInference(', 'async function releaseInvalidReaderResponse(', 'async function savePendingReaderResult(']) {
    assert.ok(!/aiSession|ai\.start/.test(between(name, '\nasync function ') || between(name, '\nfunction ')), `${name} needs no session or inference`);
  }
  assert.ok(!/[^.]\bai\.start\(/.test(app), 'Every ai.start in the app goes through aiSession.start');
  assert.match(app, /async function readerAi[\s\S]*aiSession\.start\(/);
}

// ---------- Hidden page without a session: checkpoint stays put, explicit Resume only ----------
{
  const { h, pipeline, op } = workflow({ kind: 'continue', language: 'de', supported: false });
  h.hiddenNow = true;
  await assert.rejects(h.session.run(() => pipeline.run(op)), { code: 'background_paused' });
  assert.equal(op.stage, 'plan'); assert.equal(op.request, null);
  assert.equal(op.failure.category, 'background'); assert.equal(op.failure.code, 'background_paused');
  assert.ok(!h.events.some(e => e.startsWith('start')), 'No host call was made');
  h.hiddenNow = false;
  await h.session.run(() => pipeline.run(op)); // the learner presses Retry
  assert.ok(h.events.includes('apply'));
}
// session_cancelled mid-operation: the request is released, nothing reopens, Retry starts a new session explicitly.
{
  const { h, pipeline, op } = workflow({ kind: 'create', language: 'de' });
  let failNotes = true;
  const original = h.ai.start;
  h.session = createAiSession({ ai: { ...h.ai, start: async a => { if (failNotes && JSON.parse(a.input).kind === 'notes') { failNotes = false; throw coded('Background work was cancelled.', 'session_cancelled'); } return original(a); } } });
  const p2 = createPipeline({ records: [], persist() {}, ai: { start: a => h.session.start(a), async wait(id) { return JSON.stringify(id.startsWith('create') ? deProse : id.startsWith('notes') ? deNotes : plan); }, async acknowledge() {}, async cancel() {} }, apply() { h.events.push('apply'); } });
  const op2 = p2.create({ kind: 'create', language: 'de', planned: true, input: {}, config: { providerId: 'p', model: 'm' }, instructions: 'i', promptVersion: 't' });
  await assert.rejects(h.session.run(() => p2.run(op2)), { code: 'session_cancelled' });
  assert.equal(op2.failure.category, 'cancelled'); assert.equal(op2.stage, 'notes');
  assert.equal(h.events.filter(e => e === 'begin').length, 1, 'The cancelled session was not reopened');
  assert.ok(!h.events.includes('apply'));
}

// ---------- Diagnostics redaction ----------
for (const text of ['session_id=abc123', 'sessionId: abc123', 'Session ID = abc123', 'request id: abc123 sessionId=abc123 account_id=abc123']) {
  const failure = failureInfo(new Error(`Failed. ${text} end`), 'prose');
  assert.ok(!failure.message.includes('abc123'), `${text}: identifiers are redacted from stored diagnostics`);
  assert.match(failure.message, /\[redacted\]/);
}

// ---------- Failure wording ----------
const info = (code, message = 'x', stage = 'prose', phase = 'wait') => failureInfo(coded(message, code), stage, phase);
for (const code of ['background_service', 'background_paused', 'session_idle', 'session_timeout']) assert.equal(info(code, 'Android could not keep background work running.').category, 'background', code);
assert.equal(info('session_cancelled', 'Background work was cancelled.').category, 'cancelled');
assert.equal(info('not_found', 'Request not found.').category, 'unavailable');
assert.equal(info('not_found', 'Request not found.', 'ready', 'release').category, 'release', 'release keeps its own category');
const summaryFor = (code, message) => recoverySummary({ kind: 'continue', stage: 'prose', error: message, failure: info(code, message) });
const wording = {
  background_service: summaryFor('background_service', 'Android could not keep background work running.'),
  background_paused: summaryFor('background_paused', 'This step did not start because LingoMage was in the background.'),
  session_idle: summaryFor('session_idle', 'The background session was released.'),
  session_timeout: summaryFor('session_timeout', 'Background work stopped at a time limit.'),
  not_found: summaryFor('not_found', 'Request not found.'),
};
for (const [code, text] of Object.entries(wording)) assert.match(text, /Story continuation stopped during writing\./, code);
assert.match(wording.background_service, /Android could not keep background work running/);
assert.doesNotMatch(wording.background_service, /never ran|did not run|not start/i, 'A denial after inference started is not described as the step never running');
assert.match(wording.session_timeout, /time limit/); assert.doesNotMatch(wording.session_timeout, /30|minutes/, 'The limit may be Android\'s earlier one');
assert.match(wording.session_idle, /about 90 seconds/); assert.doesNotMatch(wording.session_idle, /Android could not/);
assert.match(wording.not_found, /no longer available/); assert.match(wording.not_found, /Earlier steps remain saved/); assert.match(wording.not_found, /Retry/);
assert.doesNotMatch(wording.not_found, /crash|stopped LingoMage|Android stopped|restart/i, 'not_found is not diagnosed as a process death');
for (const text of Object.values(wording)) assert.doesNotMatch(text, /nothing was lost/i);

// ---------- Capability probe in the real bridge.js ----------
function bridge(handler) {
  const sent = [];
  const channel = { postMessage(raw) { const m = JSON.parse(raw); sent.push(m); const r = handler(m.action, m); if (r) queueMicrotask(() => channel.onmessage({ data: JSON.stringify({ id: m.id, ...r }) })); } };
  const context = vm.createContext({ window: { AppAI: channel, addEventListener() {}, AndroidStorage: null }, XMLHttpRequest: class { open() {} setRequestHeader() {} send() { this.status = 404; this.responseText = ''; } }, URLSearchParams, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console: { error() {} }, setTimeout, clearTimeout, CustomEvent: class {}, Date, JSON });
  vm.runInContext(bridgeSource.replace(/export /g, '') + '\nglobalThis.bridge = { ai };', context);
  return { ai: context.bridge.ai, sent };
}
{
  const ok = bridge(a => a === 'capabilities' ? { type: 'result', data: { sessions: 1 } } : null);
  assert.equal(await ok.ai.sessions.supported(), true); assert.equal(await ok.ai.sessions.supported(), true);
  assert.equal(ok.sent.length, 1, 'The capability probe is sent once');
  const old = bridge(() => ({ type: 'error', data: { code: 'invalid_request', message: 'Unsupported AI command.' } }));
  assert.equal(await old.ai.sessions.supported(), false); assert.deepEqual(old.sent.map(m => m.action), ['capabilities'], 'An old host receives no provider command');
  for (const response of [
    { type: 'error', data: { code: 'invalid_request', message: 'Invalid request.' } }, { type: 'error', data: { code: 'service', message: 'Unsupported AI command.' } },
    { type: 'error', data: { code: 'authentication', message: 'Sign in.' } }, { type: 'result', data: { sessions: 'yes' } }, { type: 'result', data: null }, { type: 'result', data: { sessions: 2 } },
  ]) {
    const b = bridge(() => response);
    await assert.rejects(b.ai.sessions.supported(), `${JSON.stringify(response.data)} is never "unsupported"`);
  }
}
console.log('PASS operation sessions: lazy begin on real config, one session per operation across summaries and every stage, cleanup paths never open one, hidden-page guard, cancelled sessions never reopen, confirmed-only capability cache, accurate recovery wording');
