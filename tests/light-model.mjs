// Light tasks model: choice resolution, stage routing in the pipeline, provenance and the settings file.
import assert from 'node:assert/strict';
import { lightModelChoice, lightTaskConfig } from '../js/light-model.js';
import { stageModel, createPipeline } from '../js/generation-pipeline.js';
import { createGenerationController } from '../js/generation-controller.js';
import { validSettings, settingsSnapshot } from '../js/workspace-storage.js';

const models = [{ id: 'main', reasoningLevels: ['low', 'high'] }, { id: 'fast', reasoningLevels: ['low', 'medium'] }, { id: 'plain' }];

{ // Empty, unavailable or effort-less choices fall back cleanly.
  assert.equal(lightModelChoice({ models, lightModel: '' }), null, 'empty means the story model');
  assert.equal(lightModelChoice({ models, lightModel: 'gone' }), null, 'a model the provider no longer offers is not used');
  assert.deepEqual(lightModelChoice({ models, lightModel: 'fast', lightReasoning: 'medium' }), { model: 'fast', reasoning: 'medium' });
  assert.deepEqual(lightModelChoice({ models, lightModel: 'fast', lightReasoning: 'high' }), { model: 'fast', reasoning: '' }, 'an effort the model lacks becomes the provider default');
  assert.deepEqual(lightModelChoice({ models, lightModel: 'plain', lightReasoning: 'low' }), { model: 'plain', reasoning: '' });
  const state = { models, providerId: 'p', model: 'main', reasoning: 'high' };
  assert.deepEqual(lightTaskConfig(state), { providerId: 'p', model: 'main', reasoning: 'high' }, 'story memory falls back to the story model');
  assert.deepEqual(lightTaskConfig({ ...state, lightModel: 'fast', lightReasoning: 'low' }), { providerId: 'p', model: 'fast', reasoning: 'low' });
}

{ // Only notes and readings use the light model; plan and prose keep the story model.
  const op = { config: { providerId: 'p', model: 'main', reasoning: 'high', light: { model: 'fast', reasoning: 'low' } } };
  assert.deepEqual(stageModel(op, 'plan'), { providerId: 'p', model: 'main', reasoningEffort: 'high' });
  assert.deepEqual(stageModel(op, 'prose'), { providerId: 'p', model: 'main', reasoningEffort: 'high' });
  assert.deepEqual(stageModel(op, 'notes'), { providerId: 'p', model: 'fast', reasoningEffort: 'low' });
  assert.deepEqual(stageModel(op, 'readings'), { providerId: 'p', model: 'fast', reasoningEffort: 'low' });
  assert.deepEqual(stageModel({ config: { ...op.config, light: { model: 'fast', reasoning: '' } } }, 'notes').reasoningEffort, undefined);
  assert.deepEqual(stageModel({ config: { providerId: 'p', model: 'main', reasoning: '' } }, 'notes'), { providerId: 'p', model: 'main', reasoningEffort: undefined }, 'saved operations without light use the story model');
  assert.deepEqual(stageModel({ config: { ...op.config, light: null } }, 'readings').model, 'main');
}

{ // A full German create sends plan and prose to the story model and notes to the light model.
  const started = [], answers = {
    'language-plan': JSON.stringify({ vocabulary: [], grammar: [], guidance: '' }),
  };
  const ai = {
    start: async args => { started.push(args); return `r${started.length}`; },
    wait: async id => {
      const kind = JSON.parse(started[Number(id.slice(1)) - 1].input).kind;
      if (answers[kind]) return answers[kind];
      if (kind === 'notes') return JSON.stringify({ title: 'Titel', story: 'Der Hund läuft.', glossary: [] });
      return JSON.stringify({ title: 'Titel', story: 'Der Hund läuft.' });
    },
    acknowledge: async () => {}, cancel: async () => {}
  };
  const records = [];
  const pipeline = createPipeline({ records, persist: () => {}, ai, apply: async () => {} });
  const op = pipeline.create({ kind: 'create', language: 'de', planned: true, input: { difficulty: 'A1' }, instructions: 'Write.', config: { providerId: 'p', model: 'main', reasoning: 'high', light: { model: 'fast', reasoning: 'low' } } });
  try { await pipeline.run(op); } catch { /* validation of the toy content is not under test */ }
  const byKind = Object.fromEntries(started.map(args => [JSON.parse(args.input).kind, args]));
  assert.equal(byKind['language-plan'].model, 'main');
  assert.equal(byKind.create.model, 'main'); assert.equal(byKind.create.reasoningEffort, 'high');
  assert.ok(byKind.notes, 'the notes stage started'); assert.equal(byKind.notes.model, 'fast'); assert.equal(byKind.notes.reasoningEffort, 'low');
}

{ // Saved versions record the light model only when one was used.
  const { operationProvenance } = createGenerationController({ state: {}, normalizeChapters: () => [], ensureStoryPaths: () => {}, persistReaderStory: () => {}, savedFollowUps: () => [] });
  const op = { id: 'o', input: {}, config: { providerId: 'p', model: 'main' }, createdAt: 'now' };
  assert.equal(operationProvenance(op).lightModel, undefined);
  assert.equal(operationProvenance({ ...op, config: { ...op.config, light: { model: 'fast', reasoning: '' } } }).lightModel, 'fast');
  assert.equal(operationProvenance(op).model, 'main');
}

{ // Settings file: optional strings, saved with the rest.
  assert.equal(validSettings({ lightModel: 'fast', lightReasoning: 'low' }), true);
  assert.equal(validSettings({ lightModel: 3 }), false);
  assert.equal(validSettings({ lightReasoning: null }), false);
  const snapshot = settingsSnapshot({ providerId: 'p', model: 'main', reasoning: '', lightModel: 'fast', lightReasoning: 'low', readerFontSize: 19 });
  assert.equal(snapshot.lightModel, 'fast'); assert.equal(snapshot.lightReasoning, 'low');
  assert.equal(settingsSnapshot({ readerFontSize: 19 }).lightModel, '', 'absent means the story model');
}

console.log('PASS light tasks model: choice fallback, notes/readings routing, provenance and settings');
