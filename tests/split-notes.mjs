// Split vocabulary notes: paragraph parts, merging, the parallel scheduler, and both rate-limit paths
// (App²'s start limit before inference, the provider's limit during a request). No silent retries.
import assert from 'node:assert/strict';
import { createPipeline, pendingRequests, MAX_RUNNING } from '../js/generation-pipeline.js';
import { progressSummary } from '../js/generation-progress.js';
import { recoverySummary } from '../js/generation-errors.js';
import { notesParts, noteMinUnits, mergeNoteParts, validateNotes } from '../js/learning-validation.js';
import { NOTES_INSTRUCTIONS } from '../js/prompts.js';

const WORDS = ['Hund', 'Katze', 'Vogel', 'Fisch', 'Pferd', 'Maus'];
const paragraph = word => `Der ${word} läuft schnell durch den Garten. `.repeat(12).trim();
const story = WORDS.map(paragraph).join('\n\n');
const prose = { title: 'Tiere', story };

{ // Splitting: short chapters stay whole; long ones become contiguous paragraph groups.
  assert.deepEqual(notesParts('Kurz.\n\nNoch kurz.', 3), []);
  assert.deepEqual(notesParts(story, 1), [], 'one part means one ordinary request');
  const parts = notesParts(story, 3);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].start, 0); assert.equal(parts.at(-1).end, story.length);
  for (const part of parts) { assert.equal(story.slice(part.start, part.end), part.text); assert.ok(!/^\s|\s$/.test(part.text)); }
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i].start > parts[i - 1].end && !story.slice(parts[i - 1].end, parts[i].start).trim(), 'parts only skip the blank lines between them');
  assert.ok(notesParts(story, 10).length <= WORDS.length, 'never more parts than paragraphs');
  // Japanese: denser text gets a lower minimum, so an ordinary chapter of about 500 units splits.
  const ja = Array.from({ length: 8 }, (_, i) => `今日は${i + 1}番目の駅で友だちと会って、電車の時間を確認しました。`.repeat(2)).join('\n');
  assert.equal(noteMinUnits('ja'), 250); assert.equal(noteMinUnits('de'), 600);
  assert.equal(notesParts(ja, 3).length, 0, 'the general minimum would keep it whole');
  assert.ok(notesParts(ja, 3, noteMinUnits('ja')).length > 1, 'the Japanese minimum splits it');
}

{ // Merging keeps chapter order, joins identical notes and keeps different senses apart.
  const merged = mergeNoteParts([
    { glossary: [{ word: 'Hund', meaning: 'dog', forms: ['Hund'] }, { word: 'sie', meaning: 'she', forms: ['sie'] }] },
    { glossary: [{ word: 'hund', meaning: 'Dog', forms: ['Hunde'] }, { word: 'sie', meaning: 'they', forms: ['sie'] }] }
  ]);
  assert.deepEqual(merged.map(note => [note.word, note.meaning, note.forms]), [['Hund', 'dog', ['Hund', 'Hunde']], ['sie', 'she', ['sie']], ['sie', 'they', ['sie']]]);
  assert.deepEqual(validateNotes({ glossary: [] }, prose, 'de', { requireNotes: false }).glossary, [], 'one part may have nothing to note');
  assert.throws(() => validateNotes({ glossary: [] }, prose, 'de'), /at least one useful learning note/, 'the whole chapter still needs a note');
  assert.ok(NOTES_INSTRUCTIONS.includes('When focus is present') && NOTES_INSTRUCTIONS.includes('note only words and expressions that occur in focus.text'));
}

// A fake host: each notes request answers with the animals named in its focus (or the whole chapter).
function harness({ notesParts: parts = 3, startRefusals = {}, waitFailures = {}, records = [] } = {}) {
  let n = 0, running = 0, peak = 0; const started = [], kinds = new Map(), events = [];
  const ai = {
    async start(args) {
      const input = JSON.parse(args.input), label = input.kind === 'notes' && input.focus ? `notes-${input.focus.part}` : input.kind;
      if (startRefusals[label]?.length) { const code = startRefusals[label].shift(); events.push(`refused ${label}`); throw Object.assign(new Error('This app started too many AI requests. Wait a minute, then generate again.'), { code }); }
      const id = `r${++n}`; kinds.set(id, { label, input }); started.push({ label, input, model: args.model }); events.push(`start ${label}`); return id;
    },
    async wait(id) {
      const { label, input } = kinds.get(id);
      running++; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, label.startsWith('notes') ? 5 + Number(label.slice(6) || 0) : 1));
      running--;
      if (waitFailures[label]) { const code = waitFailures[label]; delete waitFailures[label]; events.push(`failed ${label}`); throw Object.assign(new Error('ChatGPT plan usage is unavailable or has reached a limit.'), { code }); }
      events.push(`done ${label}`);
      if (input.kind === 'language-plan') return JSON.stringify({ vocabulary: [], grammar: [], guidance: '' });
      if (input.kind === 'create') return JSON.stringify(prose);
      const text = input.focus ? input.focus.text : input.chapter.story;
      return JSON.stringify({ glossary: WORDS.filter(word => text.includes(word)).map(word => ({ word, meaning: `the ${word}`, forms: [word] })).concat([{ word: 'Garten', meaning: 'garden', forms: ['Garten'] }]) });
    },
    acknowledge: async () => {}, cancel: async () => {}
  };
  let applied = null;
  const pipeline = createPipeline({ records, persist: () => {}, ai, parallel: true, apply: async op => { applied = op.result; } });
  const op = records[0] || pipeline.create({ kind: 'create', language: 'de', planned: true, input: { difficulty: 'A2' }, instructions: 'Write.', config: { providerId: 'p', model: 'main', notesParts: parts } });
  return { pipeline, op, started, events, get peak() { return peak; }, get applied() { return applied; } };
}

{ // Three parts run together; each sees the whole chapter plus its focus; the result merges them in order.
  const h = harness();
  await h.pipeline.run(h.op);
  const notes = h.started.filter(item => item.input.kind === 'notes');
  assert.equal(notes.length, 3); assert.equal(h.peak, 3);
  assert.ok(notes.every(item => item.input.chapter.story === story && item.input.focus.of === 3));
  assert.deepEqual(h.applied.glossary.map(note => note.word).filter(word => word !== 'Garten'), WORDS, 'notes follow chapter order');
  assert.equal(new Set(h.applied.glossary.map(note => note.word)).size, h.applied.glossary.length, 'identical notes from several parts are joined');
  assert.ok(WORDS.every(word => h.applied.glossary.some(note => note.word === word)));
  assert.equal(h.pipeline.records.length, 0);
  assert.ok(MAX_RUNNING >= 3);
}

{ // Split notes off: one ordinary notes request, as before.
  const h = harness({ notesParts: 1 });
  await h.pipeline.run(h.op);
  const notes = h.started.filter(item => item.input.kind === 'notes');
  assert.equal(notes.length, 1); assert.equal(notes[0].input.focus, undefined);
}

{ // App² refuses a start while other parts run: the part starts again after one of them finishes.
  const h = harness({ startRefusals: { 'notes-3': ['usage_limit'] } });
  await h.pipeline.run(h.op);
  const refused = h.events.indexOf('refused notes-3'), restarted = h.events.lastIndexOf('start notes-3');
  assert.ok(refused >= 0 && restarted > refused);
  assert.ok(h.events.slice(refused, restarted).some(event => event.startsWith('done notes-')), 'it waits for a running part to finish');
  assert.equal(h.events.filter(event => event === 'start notes-3').length, 1, 'refused starts made no request');
}

{ // Refused again with nothing left running: stop, keep finished parts, explain App²'s limit.
  const h = harness({ startRefusals: { 'notes-3': ['usage_limit', 'usage_limit', 'usage_limit'] } });
  await assert.rejects(h.pipeline.run(h.op), /too many AI requests/);
  assert.equal(h.op.stage, 'enrich');
  assert.ok(h.op.parallel['notes-1'].done && h.op.parallel['notes-2'].done && !h.op.parallel['notes-3'].done);
  assert.equal(h.op.failure.code, 'usage_limit'); assert.equal(h.op.failure.phase, 'start');
  assert.deepEqual(pendingRequests(h.op), []);
  const summary = recoverySummary(h.op);
  assert.match(summary, /App² limits how many AI requests LingoMage can start per minute/);
  assert.match(summary, /2 of 3 note parts are saved/); assert.match(summary, /during vocabulary notes\./);
  assert.match(progressSummary(h.op).text, /Vocabulary notes · 2 of 3 parts/);
  // Resume starts only the missing part.
  const resumed = harness({ records: h.pipeline.records });
  await resumed.pipeline.run(resumed.op);
  assert.deepEqual(resumed.started.map(item => item.label), ['notes-3']);
  assert.ok(WORDS.every(word => resumed.applied.glossary.some(note => note.word === word)));
}

{ // A provider limit during a request: no new parts start, Resume runs the rest one at a time.
  const h = harness({ notesParts: 3, waitFailures: { 'notes-1': 'usage_limit' } });
  await assert.rejects(h.pipeline.run(h.op), /usage is unavailable/);
  assert.equal(h.op.partsOneAtATime, true);
  assert.equal(h.op.failure.code, 'usage_limit'); assert.equal(h.op.failure.phase, 'wait');
  assert.ok(!h.op.parallel['notes-1'].done);
  const summary = recoverySummary(h.op);
  assert.match(summary, /AI provider reported a rate limit or usage limit/); assert.match(summary, /Resume runs the missing parts one at a time/);
  const resumed = harness({ records: h.pipeline.records });
  await resumed.pipeline.run(resumed.op);
  assert.equal(resumed.peak, 1, 'one part at a time after a provider limit');
  assert.ok(resumed.started.every(item => item.label.startsWith('notes-')));
  assert.equal(resumed.pipeline.records.length, 0);
}

console.log('PASS split vocabulary notes: paragraph parts, merge, parallel limit, App² start refusals and provider rate limits');
