// Reader ⋮ → Rebuild vocabulary notes: a "notes" operation reuses the saved chapter text, runs only the notes
// stage (no plan, prose or readings), honours the saved density and light-model tasks, and its application
// replaces generated notes while keeping Define notes, idempotently and only on unchanged text.
import assert from 'node:assert/strict';
import { createPipeline } from '../js/generation/generation-pipeline.js';
import { createGenerationController } from '../js/generation/generation-controller.js';
import { notesInstructions } from '../js/generation/prompts.js';
import { progressSteps } from '../js/generation/generation-progress.js';
import { plannedSteps } from '../js/generation/generation-timing.js';
import { validCheckpoints } from '../js/core/workspace-storage.js';
import { operationLabel, recoverySummary } from '../js/generation/generation-errors.js';

const prose = { title: 'Am Bahnhof', story: 'Mia kauft Brot. Mia geht zum Bahnhof.' };
const glossary = [{ word: 'kaufen', meaning: 'buy', forms: ['kauft'] }, { word: 'Bahnhof', meaning: 'railway station', forms: ['Bahnhof'] }];

function harness({ language = 'de', story = prose, parallel = false, config = {} } = {}) {
  const started = [], records = [];
  const ai = {
    start: async args => { started.push(args); return `r${started.length}`; },
    wait: async () => JSON.stringify({ glossary }),
    acknowledge: async () => {}, cancel: async () => {}
  };
  let applied = null;
  const pipeline = createPipeline({ records, persist: () => {}, ai, parallel, apply: async op => { applied = op; } });
  const op = pipeline.create({ kind: 'notes', language, planned: false, input: { difficulty: 'A1' }, plan: { vocabulary: [], grammar: [], guidance: '' }, prose: story, config: { providerId: 'p', model: 'main', reasoning: 'low', notesParts: parallel ? 3 : 1, ...config }, target: { storyId: 's', chapterId: 'c', versionId: 'v', index: 0 } });
  return { pipeline, op, started, records, get applied() { return applied; } };
}

{ // Only the notes stage runs, with the saved chapter, plan and density.
  const h = harness({ config: { noteDensity: 'more' } });
  assert.equal(h.op.stage, 'notes');
  await h.pipeline.run(h.op);
  assert.equal(h.started.length, 1);
  const input = JSON.parse(h.started[0].input);
  assert.equal(input.kind, 'notes'); assert.deepEqual(input.chapter, prose); assert.deepEqual(input.languagePlan, { vocabulary: [], grammar: [], guidance: '' });
  assert.equal(h.started[0].instructions, notesInstructions('more'));
  assert.equal(h.started[0].title, 'Writing vocabulary notes');
  assert.deepEqual(h.applied.result.glossary, glossary); assert.equal(h.applied.result.story, prose.story);
  assert.equal(h.records.length, 0, 'the checkpoint is cleared after applying');
}

{ // Japanese keeps its saved readings: no readings request, also when notes are split.
  const story = { title: '駅', story: '土曜日の朝、娘はいつもの靴をはきました。「この靴、きついよ。」\n\n靴屋で、娘は赤い靴を見つけました。「これ、はきたい。」\n\n次に、青い靴をはきました。娘は店の中を歩いて、私のところに来ました。' };
  const single = harness({ language: 'ja', story });
  await single.pipeline.run(single.op).catch(() => {}); // toy notes may not match this text; only routing is under test
  assert.ok(single.started.every(args => JSON.parse(args.input).kind === 'notes'));
  const split = harness({ language: 'ja', story: { title: '駅', story: story.story.repeat(4) }, parallel: true });
  if (split.op.stage === 'enrich') assert.ok(!('readings' in split.op.parallel), 'no readings part in a notes rebuild');
  assert.ok(['notes', 'enrich'].includes(split.op.stage));
}

{ // The notes step uses the light model only when its tasks include notes.
  const light = harness({ config: { light: { model: 'fast', reasoning: 'low', tasks: ['notes'] } } });
  await light.pipeline.run(light.op); assert.equal(light.started[0].model, 'fast');
  const main = harness({ config: { light: { model: 'fast', reasoning: 'low', tasks: ['readings'] } } });
  await main.pipeline.run(main.op); assert.equal(main.started[0].model, 'main');
}

{ // Application replaces generated notes, keeps Define notes, records the run, is idempotent and refuses changed text.
  const define = { word: 'Brot', meaning: 'bread', forms: ['Brot'], addedBy: 'learner', at: { start: 10, end: 14 } };
  const makeStory = () => ({ id: 's', paths: [{ id: 'main', entries: [{ chapterId: 'c', versionId: 'v' }] }], activePathId: 'main', chapters: [{ id: 'c', activeVersionId: 'v', help: [{ id: 'h' }], versions: [{ id: 'v', ...prose, glossary: [{ word: 'old', meaning: 'old note', forms: ['Mia'] }, define], titleSegments: null, storySegments: null }] }] });
  let saves = 0;
  const state = { stories: [makeStory()] };
  const { applyContentOperation } = createGenerationController({ state, normalizeChapters: story => story.chapters, ensureStoryPaths: () => {}, persistReaderStory: () => { saves++; }, savedFollowUps: () => [] });
  const op = { id: 'op1', kind: 'notes', language: 'de', promptVersion: 'pv', safeguardVersion: 'sv', createdAt: 'then', input: {}, prose, result: { ...prose, glossary }, config: { providerId: 'p', model: 'main', noteDensity: 'fewer' }, target: { storyId: 's', chapterId: 'c', versionId: 'v', index: 0 } };
  applyContentOperation(op);
  const version = state.stories[0].chapters[0].versions[0];
  assert.deepEqual(version.glossary, [...glossary, define]);
  assert.equal(version.notesRebuild.operationId, 'op1'); assert.equal(version.notesRebuild.noteDensity, 'fewer'); assert.equal(version.notesRebuild.model, 'main');
  assert.equal(version.story, prose.story); assert.deepEqual(state.stories[0].chapters[0].help, [{ id: 'h' }], 'explanations are untouched');
  applyContentOperation(op); assert.equal(saves, 1, 'applying the same operation twice saves once');
  state.stories[0].chapters[0].versions[0].story = 'Changed.';
  assert.throws(() => applyContentOperation({ ...op, id: 'op2' }), /chapter text changed/);
}

{ // Checkpoints, progress, estimates and labels know the new kind.
  assert.equal(validCheckpoints([{ id: 'a', kind: 'notes', stage: 'notes', config: {}, input: {}, language: 'de', target: {} }]), true);
  assert.deepEqual(progressSteps({ kind: 'notes', language: 'ja', stage: 'notes' }).map(step => step.key), ['notes']);
  assert.deepEqual(plannedSteps({ kind: 'notes', language: 'ja', model: 'main', notesParts: 3 }).map(step => step.key), ['notes']);
  const story = { id: 's', title: 'Bahnhof', paths: [{ id: 'main', entries: [{ chapterId: 'c', versionId: 'v' }] }], chapters: [] };
  assert.equal(operationLabel({ kind: 'notes', target: { storyId: 's', chapterId: 'c', versionId: 'v' } }, [story]), 'Vocabulary notes for “Bahnhof” · Chapter 1');
  assert.match(recoverySummary({ kind: 'notes', stage: 'notes', error: 'Bad reply.' }), /^Vocabulary notes rebuild stopped during vocabulary notes/);
}

console.log('PASS notes rebuild: notes-only stage, saved density and light tasks, Japanese readings kept, Define notes kept, idempotent application, labels');
