// Reading while vocabulary notes are written: the chapter is saved as soon as its prose (and Japanese readings) is
// ready, each finished notes part adds its notes to the same version, and the final apply completes it.
import assert from 'node:assert/strict';
import { createPipeline } from '../js/generation-pipeline.js';
import { createGenerationController } from '../js/generation-controller.js';
import { MAX_NOTE_PARTS } from '../js/learning-validation.js';

const WORDS = ['Hund', 'Katze', 'Vogel', 'Fisch', 'Pferd', 'Maus'];
const story = WORDS.map(word => `Der ${word} läuft schnell durch den Garten. `.repeat(30).trim()).join('\n\n');
const prose = { title: 'Tiere', story };

function harness({ progressive = true, language = 'de', text = prose, records = [], applyPartial = true, failNotes = '' } = {}) {
  const calls = [], started = [];
  let n = 0; const kinds = new Map();
  const ai = {
    async start(args) { const input = JSON.parse(args.input); const label = input.kind === 'notes' && input.focus ? `notes-${input.focus.part}` : input.kind; const id = `r${++n}`; kinds.set(id, { label, input }); started.push(label); return id; },
    async wait(id) {
      const { label, input } = kinds.get(id);
      await new Promise(resolve => setTimeout(resolve, label === 'readings' ? 2 : label.startsWith('notes') ? 4 + Number(label.slice(6) || 0) * 3 : 1));
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
  return { pipeline, op, calls, started };
}

{ // German: the chapter is shown right after the prose, then notes arrive part by part, then the final apply.
  const h = harness();
  await h.pipeline.run(h.op);
  const partials = h.calls.filter(call => call.type === 'partial');
  assert.equal(partials[0].first, true); assert.equal(partials[0].notes, 0, 'the chapter is shown before any notes');
  assert.ok(partials.slice(1).every(call => call.first === false));
  assert.ok(partials.length >= 3, 'each finished part updates the chapter');
  for (let i = 1; i < partials.length; i++) assert.ok(partials[i].notes >= partials[i - 1].notes, 'notes only grow');
  assert.equal(h.calls.at(-1).type, 'final'); assert.equal(h.calls.at(-1).notes, WORDS.length);
  assert.equal(h.op.earlyApplied, true);
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

{ // A failed part stops the run but the chapter stays shown; discarding then clears the pending mark.
  const h = harness({ failNotes: 'notes-2' });
  await assert.rejects(h.pipeline.run(h.op), /Model failed/);
  assert.equal(h.op.earlyApplied, true);
  assert.ok(h.calls.some(call => call.type === 'partial' && call.first));
  await h.pipeline.discard(h.op);
  assert.deepEqual(h.calls.filter(call => call.type === 'discarded').map(call => call.id), [h.op.id]);
}

{ // Resumed after the prose without an early save: the chapter is shown before the remaining notes.
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

console.log('PASS progressive notes: early chapter after prose or Japanese readings, growing notes per part, final completion, failure and discard, resume, controller updates');
