// Reading while vocabulary notes are written: the chapter is saved once its opening paragraph (a short lead notes
// part) has notes and, for Japanese, its readings are ready; each finished notes part adds its notes to the same
// version, and the final apply completes it.
import assert from 'node:assert/strict';
import { createPipeline } from '../js/generation-pipeline.js';
import { createGenerationController } from '../js/generation-controller.js';
import { firstGlossaryMatches } from '../js/reader-text.js';
import { progressSteps } from '../js/generation-progress.js';
import { MAX_NOTE_PARTS, readingPlan, attachReadingMap, readingSpansFor, validateReadings } from '../js/learning-validation.js';

const WORDS = ['Hund', 'Katze', 'Vogel', 'Fisch', 'Pferd', 'Maus'];
const story = WORDS.map(word => `Der ${word} läuft schnell durch den Garten. `.repeat(30).trim()).join('\n\n');
const prose = { title: 'Tiere', story };

function harness({ progressive = true, language = 'de', text = prose, records = [], applyPartial = true, failNotes = '', slowLead = false } = {}) {
  const calls = [], started = [];
  let n = 0; const kinds = new Map();
  const ai = {
    async start(args) { const input = JSON.parse(args.input); const label = input.kind === 'notes' && input.focus ? `notes-${input.focus.part}` : input.kind; const id = `r${++n}`; kinds.set(id, { label, input }); started.push(label); return id; },
    async wait(id) {
      const { label, input } = kinds.get(id);
      await new Promise(resolve => setTimeout(resolve, label === 'readings' ? 2 : label.startsWith('notes') ? (slowLead && label === 'notes-1' ? 40 : 4 + Number(label.slice(6) || 0) * 3) : 1));
      if (label === failNotes) throw Object.assign(new Error('Model failed.'), { code: 'provider' });
      if (input.kind === 'language-plan') return JSON.stringify({ vocabulary: [], grammar: [], guidance: '' });
      if (input.kind === 'create') return JSON.stringify(text);
      if (input.kind === 'readings') return JSON.stringify({ readings: input.spans.map(span => ({ id: span.id, reading: 'えき' })) });
      const source = input.focus ? input.focus.text : input.chapter.story;
      const found = (language === 'ja' ? ['駅'] : WORDS).filter(word => source.includes(word));
      return JSON.stringify({ glossary: found.map(word => ({ word, meaning: `the ${word}`, forms: [word] })) });
    },
    acknowledge: async () => {}, cancel: async () => {}
  };
  const pipeline = createPipeline({ records, persist: () => {}, ai, parallel: true,
    apply: async op => { calls.push({ type: 'final', notes: op.result.glossary.length }); },
    ...(applyPartial ? { applyPartial: async (op, content, { first }) => { calls.push({ type: 'partial', first, notes: content.glossary.length, segments: Boolean(content.storySegments) }); } } : {}),
    discarded: op => calls.push({ type: 'discarded', id: op.id }) });
  const op = records[0] || pipeline.create({ kind: 'create', language, planned: true, input: { difficulty: 'A2' }, instructions: 'Write.', config: { providerId: 'p', model: 'main', notesParts: MAX_NOTE_PARTS, progressive } });
  return { pipeline, op, calls, started, inputs: kinds };
}

{ // German: the lead part is the first paragraph; the chapter opens with its notes, then the rest arrive, then the final apply.
  const h = harness();
  await h.pipeline.run(h.op);
  const lead = [...h.inputs.values()].find(item => item.label === 'notes-1').input.focus.text;
  assert.equal(lead, story.split('\n\n')[0], 'the lead part is the opening paragraph');
  const partials = h.calls.filter(call => call.type === 'partial');
  assert.equal(partials[0].first, true); assert.ok(partials[0].notes >= 1, 'the chapter opens with the first paragraph\'s notes');
  assert.ok(partials.slice(1).every(call => call.first === false));
  assert.ok(partials.length >= 3, 'each finished part updates the chapter');
  for (let i = 1; i < partials.length; i++) assert.ok(partials[i].notes >= partials[i - 1].notes, 'notes only grow');
  assert.equal(h.calls.at(-1).type, 'final'); assert.equal(h.calls.at(-1).notes, WORDS.length);
  assert.equal(h.op.earlyApplied, true);
}

{ // Parts that finish before the lead do not open the chapter; it opens when the lead is done.
  const h = harness({ slowLead: true });
  await h.pipeline.run(h.op);
  const partials = h.calls.filter(call => call.type === 'partial');
  assert.ok(partials[0].notes > 1, 'opened only after the lead, with the parts already finished');
  assert.ok(partials[0].first);
}

{ // A failed lead part shows nothing early.
  const h = harness({ failNotes: 'notes-1' });
  await assert.rejects(h.pipeline.run(h.op), /Model failed/);
  assert.equal(h.op.earlyApplied, undefined); assert.ok(!h.calls.some(call => call.type === 'partial'));
}

{ // Without progressive (saved operations, examples) nothing is shown early.
  const h = harness({ progressive: false });
  await h.pipeline.run(h.op);
  assert.deepEqual(h.calls.map(call => call.type), ['final']);
}

{ // Japanese waits for its readings, so the first early save already has furigana.
  const ja = { title: '駅', story: Array.from({ length: 6 }, (_, i) => `今日は${i + 1}番目の駅で友だちと会って、電車の時間を確認しました。`.repeat(3)).join('\n') };
  const h = harness({ language: 'ja', text: ja });
  await h.pipeline.run(h.op);
  const partials = h.calls.filter(call => call.type === 'partial');
  assert.ok(partials.length >= 1);
  assert.ok(partials.every(call => call.segments), 'every early save carries the readings');
}

{ // Japanese readings use the same blocks as the notes: readings-1 asks only for the title and opening paragraph;
  // the chapter opens with the opening's furigana, and the final save has every reading.
  const ja = { title: '駅', story: Array.from({ length: 12 }, (_, i) => `今日は${i + 1}番目の駅で友だちと会って、電車の時間を確認しました。`.repeat(3)).join('\n') };
  const h = harness({ language: 'ja', text: ja });
  await h.pipeline.run(h.op);
  const readings = [...h.inputs.values()].filter(item => item.label === 'readings');
  const noteParts = [...h.inputs.values()].filter(item => item.label.startsWith('notes-'));
  assert.ok(readings.length >= 2); assert.equal(readings.length, noteParts.length, 'one readings block per notes part');
  const all = readings.flatMap(item => item.input.spans.map(span => span.id));
  assert.equal(new Set(all).size, all.length, 'no kanji is asked twice');
  const first = readings[0].input.spans;
  assert.ok(first.some(span => span.section === 'title'), 'the title is in the first readings part');
  const leadEnd = ja.story.indexOf('\n', ja.story.indexOf('\n') + 1);
  assert.ok(first.filter(span => span.section === 'story').every(span => span.start < leadEnd + 1), 'the first part covers only the opening');
  assert.ok(h.op.result.storySegments.filter(seg => /\p{Script=Han}/u.test(seg.text)).every(seg => seg.reading), 'the final save has every reading');
}

{ // Progress counts split furigana parts like notes parts.
  const steps = progressSteps({ kind: 'create', language: 'ja', stage: 'enrich', parallel: { 'notes-1': { done: true }, 'readings-1': { done: true }, 'notes-2': { done: false }, 'readings-2': { done: false } } });
  assert.equal(steps.find(step => step.key === 'readings').label, 'Kanji readings · 1 of 2 parts');
  assert.equal(steps.find(step => step.key === 'notes').label, 'Vocabulary notes · 1 of 2 parts');
}

{ // Readings of one part: only its kanji are accepted; kanji of parts still running stay plain text.
  const c = { title: '駅', story: '電車に乗る。\n学校へ行く。' }, plan = readingPlan(c), ranges = [{ start: 0, end: 6 }, { start: 7, end: 13 }];
  const first = readingSpansFor(plan, ranges, 0), second = readingSpansFor(plan, ranges, 1);
  assert.deepEqual(first.map(span => span.text), ['駅', '電車', '乗']); assert.deepEqual(second.map(span => span.text), ['学校', '行']);
  assert.throws(() => validateReadings(plan, { readings: second.map(span => ({ id: span.id, reading: 'か' })) }, first));
  const shown = attachReadingMap(c, plan, validateReadings(plan, { readings: first.map(span => ({ id: span.id, reading: 'か' })) }, first));
  assert.deepEqual(shown.storySegments.slice(4), [{ text: '学校' }, { text: 'へ' }, { text: '行' }, { text: 'く。' }]);
}

{ // A failed part stops the run but the chapter stays shown; discarding then clears the pending mark.
  const h = harness({ failNotes: 'notes-2' });
  await assert.rejects(h.pipeline.run(h.op), /Model failed/);
  assert.equal(h.op.earlyApplied, true);
  assert.ok(h.calls.some(call => call.type === 'partial' && call.first));
  await h.pipeline.discard(h.op);
  assert.deepEqual(h.calls.filter(call => call.type === 'discarded').map(call => call.id), [h.op.id]);
}

{ // Resumed after the prose without an early save: the chapter opens once the lead part is done.
  const first = harness({ failNotes: 'notes-1', applyPartial: false });
  await assert.rejects(first.pipeline.run(first.op));
  const records = first.pipeline.records; assert.equal(records[0].earlyApplied, undefined);
  const resumed = harness({ records });
  await resumed.pipeline.run(records[0]);
  assert.equal(resumed.calls[0].type, 'partial'); assert.equal(resumed.calls[0].first, true);
  assert.equal(resumed.calls.at(-1).type, 'final');
}

{ // Controller: an early version carries notesPending, later saves update it, the final save completes it once.
  const stories = []; let saves = 0;
  const state = { stories };
  const persistReaderStory = item => { saves++; if (!stories.includes(item)) stories.push(item); };
  const { applyContentOperation, clearNotesPending } = createGenerationController({ state, normalizeChapters: s => s.chapters, ensureStoryPaths: () => {}, persistReaderStory, savedFollowUps: () => [] });
  const op = { id: 'op1', kind: 'create', language: 'de', input: { difficulty: 'A2' }, config: { providerId: 'p', model: 'main' }, createdAt: 'then', promptVersion: 'pv' };
  applyContentOperation(op, { content: { ...prose, glossary: [] } });
  const version = () => stories[0].chapters[0].versions[0];
  assert.equal(stories.length, 1); assert.equal(version().notesPending, true); assert.deepEqual(version().glossary, []);
  applyContentOperation(op, { content: { ...prose, glossary: [{ word: 'Hund', meaning: 'dog', forms: ['Hund'] }] } });
  assert.equal(stories.length, 1, 'no second story'); assert.equal(version().glossary.length, 1); assert.equal(version().notesPending, true);
  applyContentOperation({ ...op, result: { ...prose, glossary: [{ word: 'Hund', meaning: 'dog', forms: ['Hund'] }, { word: 'Katze', meaning: 'cat', forms: ['Katze'] }] } });
  assert.equal(version().glossary.length, 2); assert.equal(version().notesPending, undefined);
  const before = saves;
  applyContentOperation({ ...op, result: { ...prose, glossary: [] } });
  assert.equal(saves, before, 're-applying a completed version changes nothing'); assert.equal(version().glossary.length, 2);
  // A note the learner added with Define while notes were arriving survives the later saves and the final one.
  const own = { id: 'op3', kind: 'create', language: 'de', input: { difficulty: 'A2' }, config: { providerId: 'p', model: 'main' }, createdAt: 'then', promptVersion: 'pv' };
  const text = { title: 'Tiere', story: 'Der Hund bellt. Der Hund schläft.' };
  applyContentOperation(own, { content: { ...text, glossary: [] } });
  const shown = stories.find(item => item.operationId === 'op3').chapters[0].versions[0];
  const learner = { word: 'Hund', meaning: 'my dog note', forms: ['Hund'], addedBy: 'learner', at: { start: 4, end: 8 } };
  shown.glossary = [...shown.glossary, learner];
  const generated = { word: 'Hund', meaning: 'dog', forms: ['Hund'] };
  applyContentOperation(own, { content: { ...text, glossary: [generated] } });
  assert.deepEqual(shown.glossary, [generated, learner]);
  applyContentOperation({ ...own, result: { ...text, glossary: [generated] } });
  assert.deepEqual(shown.glossary, [generated, learner]); assert.equal(shown.notesPending, undefined);
  // The learner's note prevails where the generated one was written for (its first occurrence); it does not move on.
  const matches = firstGlossaryMatches(text.story, shown.glossary);
  assert.deepEqual(matches.map(match => [match.start, match.notes[0].meaning]), [[4, 'my dog note']]);
  // A generated note that first occurs elsewhere still shows there.
  const earlier = { word: 'Hund', meaning: 'dog', forms: ['Hund'] }, later = { ...learner, at: { start: 20, end: 24 } };
  assert.deepEqual(firstGlossaryMatches(text.story, [earlier, later]).map(match => [match.start, match.notes[0].meaning]), [[4, 'dog'], [20, 'my dog note']]);
  // A continue shown early adds one chapter and later fills it.
  const cont = { id: 'op2', kind: 'continue', language: 'de', input: { prompt: '' }, config: { providerId: 'p', model: 'main' }, createdAt: 'then', target: { storyId: stories[0].id, pathId: 'main', entries: [{ chapterId: stories[0].chapters[0].id, versionId: version().id }], sourceVersionId: version().id } };
  stories[0].paths = [{ id: 'main', entries: cont.target.entries.map(entry => ({ ...entry })) }];
  applyContentOperation(cont, { content: { title: 'Weiter', story: 'Der Hund schläft.', glossary: [] } });
  assert.equal(stories[0].chapters.length, 2); assert.equal(stories[0].chapters[1].versions[0].notesPending, true);
  applyContentOperation(cont, { content: { title: 'Weiter', story: 'Der Hund schläft.', glossary: [{ word: 'schlafen', meaning: 'sleep', forms: ['schläft'] }] } });
  assert.equal(stories[0].chapters.length, 2, 'a later save does not add another chapter');
  clearNotesPending(cont);
  assert.equal(stories[0].chapters[1].versions[0].notesPending, undefined, 'discarding keeps the notes and clears the mark');
  assert.equal(stories[0].chapters[1].versions[0].glossary.length, 1);
}

console.log('PASS progressive notes: chapter opens after its first paragraph has notes (and Japanese readings, in the same blocks), growing notes per part, final completion, Define notes kept and preferred, failure and discard, resume, controller updates');
