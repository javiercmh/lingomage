// Broken replies (not JSON) are resent automatically, up to three times per stage or part, and every resend is
// announced. After the limit, any other validation failure, or without retryBroken, recovery is explicit.
import assert from 'node:assert/strict';
import { createPipeline, MAX_BROKEN_RESENDS } from '../js/generation-pipeline.js';
import { progressSteps } from '../js/generation-progress.js';
import { recoverySummary } from '../js/generation-errors.js';
import { decodePlan } from '../js/story-generation.js';
import { parseContent } from '../js/learning-validation.js';
import { validSettings, settingsSnapshot } from '../js/workspace-storage.js';

const WORDS = ['Hund', 'Katze', 'Vogel', 'Fisch', 'Pferd', 'Maus'];
const story = WORDS.map(word => `Der ${word} läuft schnell durch den Garten. `.repeat(12).trim()).join('\n\n');
const prose = { title: 'Tiere', story };

// broken: {label: n} answers the first n requests for that label with text that is not JSON.
function harness({ retryBroken = true, notesParts = 1, broken = {}, unmatched = false } = {}) {
  let n = 0; const starts = [], kinds = new Map(), announced = [];
  const ai = {
    async start(args) { const input = JSON.parse(args.input), label = input.kind === 'notes' && input.focus ? `notes-${input.focus.part}` : input.kind; const id = `r${++n}`; kinds.set(id, { label, input }); starts.push(label); return id; },
    async wait(id) {
      const { label, input } = kinds.get(id);
      if (broken[label] > 0) { broken[label]--; return 'Sorry, here are the notes: {glossary: [unfinished'; }
      if (input.kind === 'language-plan') return JSON.stringify({ vocabulary: [], grammar: [], guidance: '' });
      if (input.kind === 'create') return JSON.stringify(prose);
      if (unmatched) return JSON.stringify({ glossary: [{ word: 'Elefant', meaning: 'elephant', forms: ['Elefant'] }] });
      const text = input.focus ? input.focus.text : input.chapter.story;
      return JSON.stringify({ glossary: WORDS.filter(word => text.includes(word)).map(word => ({ word, meaning: `the ${word}`, forms: [word] })) });
    },
    acknowledge: async () => {}, cancel: async () => {}
  };
  const pipeline = createPipeline({ records: [], persist: () => {}, ai, parallel: true, apply: async () => {}, onResend: (op, key, count) => announced.push(`${key} ${count}`) });
  const op = pipeline.create({ kind: 'create', language: 'de', planned: true, input: { difficulty: 'A2' }, instructions: 'Write.', config: { providerId: 'p', model: 'main', notesParts, ...(retryBroken === 'absent' ? {} : { retryBroken }) } });
  return { pipeline, op, starts, announced };
}

{ // Both parsers mark broken replies; a JSON reply with wrong content is not "broken".
  assert.throws(() => parseContent('not json'), error => error.code === 'invalid_json');
  assert.throws(() => decodePlan('not json', 'de'), error => error.code === 'invalid_json');
  assert.throws(() => decodePlan('{"vocabulary":"x"}', 'de'), error => error.code !== 'invalid_json');
}

{ // Broken notes replies are resent and announced each time; the operation finishes within the limit.
  assert.equal(MAX_BROKEN_RESENDS, 3);
  const h = harness({ broken: { notes: 2 } });
  await h.pipeline.run(h.op);
  assert.deepEqual(h.starts, ['language-plan', 'create', 'notes', 'notes', 'notes']);
  assert.deepEqual(h.announced, ['notes 1', 'notes 2']);
  assert.equal(h.pipeline.records.length, 0);
}

{ // The plan stage is resent too.
  const h = harness({ broken: { 'language-plan': 1 } });
  await h.pipeline.run(h.op);
  assert.deepEqual(h.starts.slice(0, 2), ['language-plan', 'language-plan']);
}

{ // After three automatic resends the fourth broken reply stops; recovery says so; Retry is explicit.
  const h = harness({ broken: { notes: 4 } });
  await assert.rejects(h.pipeline.run(h.op), /not valid JSON/);
  assert.equal(h.starts.filter(label => label === 'notes').length, 4);
  assert.deepEqual(h.announced, ['notes 1', 'notes 2', 'notes 3']);
  assert.equal(h.op.failure.code, 'invalid_json'); assert.deepEqual(h.op.retried, { notes: 3 });
  assert.match(recoverySummary(h.op), /already retried this step automatically 3 times, and every reply was unreadable/);
  await h.pipeline.run(h.op); // explicit Retry after recovery: one more request, no further automatic resends
  assert.equal(h.starts.filter(label => label === 'notes').length, 5);
  assert.equal(h.announced.length, 3);
}

{ // Setting off, or an older operation without the flag: no automatic resend.
  for (const retryBroken of [false, 'absent']) {
    const h = harness({ retryBroken, broken: { notes: 1 } });
    await assert.rejects(h.pipeline.run(h.op), /not valid JSON/);
    assert.equal(h.starts.filter(label => label === 'notes').length, 1);
    assert.doesNotMatch(recoverySummary(h.op), /already retried/); assert.deepEqual(h.announced, []);
  }
}

{ // Valid JSON that fails validation (no note matches the chapter) is never resent.
  const h = harness({ unmatched: true });
  await assert.rejects(h.pipeline.run(h.op), /None of the AI vocabulary notes matched/);
  assert.equal(h.starts.filter(label => label === 'notes').length, 1);
}

{ // Split notes: only the broken part is resent; progress shows the retry on the notes step.
  const h = harness({ notesParts: 3, broken: { 'notes-2': 1 } });
  await h.pipeline.run(h.op);
  assert.deepEqual(h.starts.filter(label => label.startsWith('notes')).sort(), ['notes-1', 'notes-2', 'notes-2', 'notes-3']);
  assert.deepEqual(h.announced, ['notes-2 1']);
  const steps = progressSteps({ kind: 'create', language: 'de', stage: 'enrich', retried: { 'notes-2': 2 }, parallel: { 'notes-1': { done: true }, 'notes-2': { done: false }, 'notes-3': { done: true } } });
  assert.match(steps.find(step => step.key === 'notes').label, /· retry 2 of 3$/);
  const finished = progressSteps({ kind: 'create', language: 'de', stage: 'ready', retried: { notes: 1 } });
  assert.doesNotMatch(finished.find(step => step.key === 'notes').label, /retry/, 'finished steps drop the retry label');
}

{ // Setting file: optional boolean, absent means on.
  assert.equal(validSettings({ retryBrokenReplies: false }), true);
  assert.equal(validSettings({ retryBrokenReplies: 'yes' }), false);
  assert.equal(settingsSnapshot({ readerFontSize: 19 }).retryBrokenReplies, true);
  assert.equal(settingsSnapshot({ readerFontSize: 19, retryBrokenReplies: false }).retryBrokenReplies, false);
}

console.log('PASS broken replies: up to three announced automatic resends per stage or part, setting and legacy operations respected, validation failures never resent');
