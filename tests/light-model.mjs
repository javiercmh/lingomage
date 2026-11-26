// Light tasks model: choice resolution, stage routing in the pipeline, provenance and the settings file.
import assert from 'node:assert/strict';
import { lightModelChoice, lightTaskConfig, lightTasks, DEFAULT_LIGHT_TASKS } from '../js/light-model.js';
import { stageModel, createPipeline } from '../js/generation-pipeline.js';
import { createGenerationController } from '../js/generation-controller.js';
import { validSettings, settingsSnapshot } from '../js/workspace-storage.js';

const models = [{ id: 'main', reasoningLevels: ['low', 'high'] }, { id: 'fast', reasoningLevels: ['low', 'medium'] }, { id: 'plain' }];

{ // Empty, unavailable or effort-less choices fall back cleanly.
  assert.equal(lightModelChoice({ models, lightModel: '' }), null, 'empty means the story model');
  assert.equal(lightModelChoice({ models, lightModel: 'gone' }), null, 'a model the provider no longer offers is not used');
  assert.deepEqual(lightModelChoice({ models, lightModel: 'fast', lightReasoning: 'medium' }), { model: 'fast', reasoning: 'medium', tasks: ['notes', 'readings', 'memory'] });
  assert.deepEqual(lightModelChoice({ models, lightModel: 'fast', lightReasoning: 'high' }), { model: 'fast', reasoning: '', tasks: ['notes', 'readings', 'memory'] }, 'an effort the model lacks becomes the provider default');
  assert.deepEqual(lightModelChoice({ models, lightModel: 'plain', lightReasoning: 'low' }), { model: 'plain', reasoning: '', tasks: ['notes', 'readings', 'memory'] });
  const state = { models, providerId: 'p', model: 'main', reasoning: 'high' };
  assert.deepEqual(lightTaskConfig(state), { providerId: 'p', model: 'main', reasoning: 'high' }, 'story memory falls back to the story model');
  assert.deepEqual(lightTaskConfig({ ...state, lightModel: 'fast', lightReasoning: 'low' }), { providerId: 'p', model: 'fast', reasoning: 'low' });
}

{ // Settings → Advanced → Use the light model for: defaults, saved choices and per-task configs.
  assert.deepEqual(DEFAULT_LIGHT_TASKS, ['notes', 'readings', 'memory']);
  assert.deepEqual(lightTasks({}), DEFAULT_LIGHT_TASKS, 'absent means the default tasks');
  assert.deepEqual(lightTasks({ lightTasks: ['examples', 'bogus', 'notes'] }), ['notes', 'examples'], 'unknown names are ignored, order is canonical');
  assert.deepEqual(lightTasks({ lightTasks: [] }), [], 'an empty list means no task uses the light model');
  const state = { models, providerId: 'p', model: 'main', reasoning: 'high', lightModel: 'fast', lightReasoning: 'low' };
  assert.equal(lightTaskConfig(state, 'explanations').model, 'main', 'explanations keep the story model by default');
  assert.equal(lightTaskConfig({ ...state, lightTasks: ['explanations'] }, 'explanations').model, 'fast');
  assert.equal(lightTaskConfig({ ...state, lightTasks: ['explanations'] }, 'notes').model, 'main', 'an unticked Define keeps the story model');
  assert.equal(lightTaskConfig({ ...state, lightTasks: [] }, 'memory').model, 'main');
  // Pipeline stages follow the saved tasks; operations saved before tasks existed keep notes and readings light.
  const op = (tasks, kind = 'create') => ({ kind, config: { providerId: 'p', model: 'main', reasoning: 'high', light: { model: 'fast', reasoning: 'low', ...(tasks ? { tasks } : {}) } } });
  assert.equal(stageModel(op(['readings']), 'notes').model, 'main');
  assert.equal(stageModel(op(['readings']), 'readings').model, 'fast');
  assert.equal(stageModel(op(['examples'], 'examples'), 'prose').model, 'fast', 'example sentences use the light model when ticked');
  assert.equal(stageModel(op(['notes'], 'examples'), 'prose').model, 'main');
  assert.equal(stageModel(op(['examples']), 'prose').model, 'main', 'story prose never uses the light model');
  assert.equal(stageModel(op(null), 'notes').model, 'fast'); assert.equal(stageModel(op(null, 'examples'), 'prose').model, 'main');
  // The settings file accepts only known task names.
  assert.equal(validSettings({ lightTasks: ['notes', 'examples'] }), true);
  assert.equal(validSettings({ lightTasks: ['notes', 'prose'] }), false);
  assert.equal(validSettings({ lightTasks: 'notes' }), false);
  assert.deepEqual(settingsSnapshot({ readingPreferences: {} }).lightTasks, DEFAULT_LIGHT_TASKS);
  assert.deepEqual(settingsSnapshot({ readingPreferences: {}, lightTasks: ['examples'] }).lightTasks, ['examples']);
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
