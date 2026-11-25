// Generation timing and estimates: the pipeline stamps every request with a fake clock, the finished
// operation saves what each step took, and estimates are the sum of each step's median over similar runs.
import assert from 'node:assert/strict';
import { createPipeline } from '../js/generation-pipeline.js';
import { createGenerationController } from '../js/generation-controller.js';
import { progressSteps } from '../js/generation-progress.js';
import { busyTime, summarizeTimings, timingSamples, estimateGeneration, remainingTime, estimateText, remainingText, plannedSteps, MIN_SAMPLES } from '../js/generation-timing.js';
import { validSettings, settingsSnapshot } from '../js/workspace-storage.js';

const WORDS = ['Hund', 'Katze', 'Vogel', 'Fisch', 'Pferd', 'Maus'];
const story = WORDS.map(word => `Der ${word} läuft schnell durch den Garten. `.repeat(12).trim()).join('\n\n');

// durations: {label: ms or [ms, ms…] per attempt}; broken: {label: n} first n replies are not JSON.
function harness({ notesParts = 1, durations = {}, broken = {}, records = [] } = {}) {
  let n = 0, clock = 1000;
  const requests = new Map(), seen = {};
  const ai = {
    async start(args) {
      const input = JSON.parse(args.input), label = input.kind === 'notes' && input.focus ? `notes-${input.focus.part}` : input.kind;
      const id = `r${++n}`; requests.set(id, { label, input, startedAt: clock }); return id;
    },
    async wait(id) {
      const { label, input, startedAt } = requests.get(id);
      const attempt = seen[label] = (seen[label] || 0) + 1, value = durations[label], ms = Array.isArray(value) ? value[attempt - 1] : value || 0;
      // Replies arrive in time order (a real timer scaled down 1000×), so parallel parts all start first.
      await new Promise(resolve => setTimeout(resolve, ms / 1000));
      clock = startedAt + ms;
      if (broken[label] > 0) { broken[label]--; return 'not json'; }
      if (input.kind === 'language-plan') return JSON.stringify({ vocabulary: [], grammar: [], guidance: '' });
      if (input.kind === 'create') return JSON.stringify({ title: 'Tiere', story });
      const text = input.focus ? input.focus.text : input.chapter.story;
      return JSON.stringify({ glossary: WORDS.filter(word => text.includes(word)).map(word => ({ word, meaning: `the ${word}`, forms: [word] })) });
    },
    acknowledge: async () => {}, cancel: async () => {}
  };
  let applied = null;
  const pipeline = createPipeline({ records, persist: () => {}, ai, parallel: true, now: () => clock, apply: async op => { applied = JSON.parse(JSON.stringify(op)); } });
  return { pipeline, ai, get applied() { return applied; }, setClock: value => { clock = value; } };
}
const createSpec = (config = {}) => ({ kind: 'create', language: 'de', planned: true, input: { difficulty: 'A2', scope: 'scene' }, instructions: 'Write.', config: { providerId: 'p', model: 'main', reasoning: 'low', notesParts: 1, retryBroken: true, ...config } });

{ // Each request is stamped; the saved timing holds every step, with the model and effort it used.
  const h = harness({ durations: { 'language-plan': 5000, create: 30000, notes: 20000 } });
  const op = h.pipeline.create(createSpec({ light: { model: 'light', reasoning: 'minimal' } }));
  await h.pipeline.run(op);
  const timing = summarizeTimings(h.applied);
  assert.deepEqual(Object.keys(timing.steps), ['plan', 'prose', 'notes']);
  assert.equal(timing.steps.plan.ms, 5000);
  assert.equal(timing.steps.prose.ms, 30000);
  assert.deepEqual([timing.steps.prose.model, timing.steps.prose.reasoning], ['main', 'low']);
  assert.deepEqual([timing.steps.notes.ms, timing.steps.notes.model, timing.steps.notes.reasoning, timing.steps.notes.parts], [20000, 'light', 'minimal', 1]);
  assert.equal(timing.totalMs, 55000);
  assert.equal(timing.approximate, undefined);
  // Saved with the version, not repeated on the story.
  const state = { stories: [], current: null };
  const controller = createGenerationController({ state, normalizeChapters: story => story.chapters, ensureStoryPaths: () => {}, persistReaderStory: story => { state.stories.push(story); }, savedFollowUps: () => [] });
  controller.applyContentOperation(h.applied);
  assert.equal(state.stories[0].timing, undefined);
  assert.deepEqual(state.stories[0].chapters[0].versions[0].timing, timing);
}

{ // A broken reply resent automatically counts toward its step: both attempts, one step.
  const h = harness({ durations: { 'language-plan': 1000, create: 2000, notes: [4000, 6000] }, broken: { notes: 1 } });
  const op = h.pipeline.create(createSpec());
  await h.pipeline.run(op);
  assert.deepEqual(h.applied.timings.filter(entry => entry.stage === 'notes').map(entry => entry.outcome), ['resent', 'ok']);
  const timing = summarizeTimings(h.applied);
  assert.equal(timing.steps.notes.ms, 10000);
  assert.equal(timing.steps.notes.attempts, 2);
}

{ // Split notes run at the same time: the step takes as long as its longest part, not their sum.
  const h = harness({ notesParts: 3, durations: { 'language-plan': 1000, create: 2000, 'notes-1': 9000, 'notes-2': 7000, 'notes-3': 8000 } });
  const op = h.pipeline.create(createSpec({ notesParts: 3 }));
  await h.pipeline.run(op);
  const timing = summarizeTimings(h.applied);
  assert.equal(timing.steps.notes.parts, 3);
  assert.equal(timing.steps.notes.ms, 9000);
  assert.equal(timing.totalMs, 12000);
  assert.equal(busyTime([[0, 5], [3, 8], [10, 12]]), 10);
}

{ // A request saved by an earlier page completes only when this page notices: its step is approximate
  // and left out, while steps measured here are kept.
  const records = [{ ...createSpec(), id: 'op-1', createdAt: '2026-11-26T10:00:00.000Z', safeguardVersion: 'x', stage: 'prose', plan: { vocabulary: [], grammar: [], guidance: '' }, request: { id: 'old', stage: 'prose', completed: false, startedAt: 1000 }, parallel: null,
    timings: [{ stage: 'plan', model: 'main', reasoning: 'low', startedAt: 0, completedAt: 900, outcome: 'ok' }] }];
  const h = harness({ records, durations: { notes: 3000 } });
  h.ai.start({ input: JSON.stringify({ kind: 'create' }) }); // makes request r1 known to the fake host…
  records[0].request.id = 'r1';                              // …under the saved request's id
  h.setClock(500000);
  await h.pipeline.run(records[0]);
  const timing = summarizeTimings(h.applied);
  assert.equal(h.applied.timings.find(entry => entry.stage === 'prose').approximate, true);
  assert.equal(timing.approximate, true);
  assert.equal(timing.steps.prose, undefined);
  assert.equal(timing.steps.plan.ms, 900);
  assert.equal(timing.steps.notes.ms, 3000);
  // Checkpoints from before timing existed have no startedAt and record nothing for that request.
  assert.equal(summarizeTimings({ timings: [] }), null);
  assert.equal(summarizeTimings({}), null);
}

// Saved chapters for estimates: {model, reasoning, language, scope, steps:{key: ms}} per chapter.
function storiesWith(runs) {
  return [{ language: 'de', chapters: runs.map((run, index) => ({ versions: [{ scope: run.scope || 'scene', createdAt: new Date(Date.UTC(2026, 10, 1 + index)).toISOString(),
    timing: { version: 1, steps: Object.fromEntries(Object.entries(run.steps).map(([key, ms]) => [key, { ms, model: run.model || 'main', reasoning: run.reasoning ?? 'low', ...(key === 'context' ? { requests: run.requests || 1 } : {}), ...(key === 'notes' ? { parts: run.parts || 1 } : {}) }])) } }] })) }];
}
const plan = (extra = {}) => ({ kind: 'create', language: 'de', scope: 'scene', notesParts: 1, model: 'main', reasoning: 'low', light: null, contextRequests: 0, ...extra });

{ // The estimate is the sum of each step's median; a step without enough similar runs gives no estimate.
  const runs = [10, 20, 30].map(base => ({ steps: { plan: base * 100, prose: base * 1000, notes: base * 500 } }));
  const estimate = estimateGeneration(plan(), timingSamples(storiesWith(runs)));
  assert.equal(estimate.total, 2000 + 20000 + 10000);
  assert.ok(estimate.low < estimate.total && estimate.total < estimate.high);
  assert.equal(estimateGeneration(plan(), timingSamples(storiesWith(runs.slice(0, MIN_SAMPLES - 1)))), null);
  // Another model has no history yet: no estimate rather than a guess.
  assert.equal(estimateGeneration(plan({ model: 'other' }), timingSamples(storiesWith(runs))), null);
  // Examples are not estimated.
  assert.equal(estimateGeneration(plan({ kind: 'examples' }), timingSamples(storiesWith(runs))), null);
}

{ // Similar runs come first: the same scope is preferred, then the same model and effort, then the model.
  const scene = [1, 2, 3].map(() => ({ steps: { plan: 1000, prose: 10000, notes: 5000 } }));
  const chapter = [1, 2, 3].map(() => ({ scope: 'chapter', steps: { plan: 1000, prose: 40000, notes: 9000 } }));
  const samples = timingSamples(storiesWith([...scene, ...chapter]));
  assert.equal(estimateGeneration(plan({ scope: 'chapter' }), samples).steps.prose.median, 40000);
  assert.equal(estimateGeneration(plan({ scope: 'scene' }), samples).steps.prose.median, 10000);
  // Russian has no runs of its own, so the same model and effort are used.
  assert.equal(estimateGeneration(plan({ language: 'ru' }), samples).steps.prose.median, 25000);
  // A different effort falls back to the model alone.
  assert.equal(estimateGeneration(plan({ reasoning: 'high' }), samples).steps.prose.median, 25000);
}

{ // Story context: the number of summaries still to make × the median time per summary (saved per run).
  const runs = [1, 2, 3].map(() => ({ requests: 2, steps: { context: 8000, plan: 1000, prose: 10000, notes: 5000 } }));
  const samples = timingSamples(storiesWith(runs));
  const estimate = estimateGeneration(plan({ kind: 'continue', contextRequests: 3, context: { model: 'main', reasoning: 'low' } }), samples);
  assert.equal(estimate.steps.context.median, 12000);
  assert.equal(estimate.total, 12000 + 1000 + 10000 + 5000);
  // Context already prepared: no context step, so no context history is needed.
  assert.equal(estimateGeneration(plan({ kind: 'continue' }), timingSamples(storiesWith(runs.map(run => ({ steps: { plan: 1000, prose: 10000, notes: 5000 } }))))).total, 16000);
}

{ // Japanese notes and readings run together, so the pair counts as the longer one.
  const runs = [1, 2, 3].map(() => ({ steps: { plan: 1000, prose: 10000, notes: 6000, readings: 4000 } }));
  const stories = storiesWith(runs); stories[0].language = 'ja';
  const estimate = estimateGeneration(plan({ language: 'ja' }), timingSamples(stories));
  assert.equal(estimate.total, 1000 + 10000 + 6000);
  assert.deepEqual(plannedSteps(plan({ language: 'ja', light: { model: 'light', reasoning: '' } })).map(step => [step.key, step.model]), [['plan', 'main'], ['prose', 'main'], ['notes', 'light'], ['readings', 'light']]);
}

{ // Malformed or missing saved timing is ignored, never trusted.
  const stories = [{ language: 'de', chapters: [{ versions: [{}, { timing: null }, { timing: { steps: { prose: { ms: 'x' } } } }, { timing: { steps: { context: { ms: 5000, requests: 0 } } } }] }] }, null, { chapters: 'x' }];
  assert.deepEqual(timingSamples(stories), []);
}

{ // Time left: waiting steps count their median, the running step what is left of it.
  const estimate = { steps: { plan: { median: 10000 }, prose: { median: 60000 }, notes: { median: 30000 } }, total: 100000 };
  const op = { kind: 'create', language: 'de', stage: 'prose' };
  const steps = progressSteps(op);
  assert.equal(remainingTime(estimate, steps, { prose: 20000 }).ms, 40000 + 30000);
  assert.equal(remainingText(remainingTime(estimate, steps, { prose: 20000 })), 'About 1 minute left');
  // Past its median the running step counts zero; with nothing else left it is "taking longer".
  const last = progressSteps({ ...op, stage: 'notes' });
  assert.deepEqual(remainingTime(estimate, last, { notes: 45000 }), { ms: 0, over: true });
  assert.equal(remainingText(remainingTime(estimate, last, { notes: 45000 })), 'Taking longer than usual');
  assert.equal(remainingText(remainingTime(estimate, last, { notes: 0 })), 'Less than a minute left');
  assert.equal(remainingText(remainingTime(estimate, progressSteps({ ...op, stage: 'plan' }), {})), 'About 2 minutes left');
  assert.equal(remainingText(null), '');
  // Japanese notes and readings left at the same time count as the longer one.
  const ja = { steps: { plan: { median: 1 }, prose: { median: 1 }, notes: { median: 90000 }, readings: { median: 30000 } } };
  assert.equal(remainingTime(ja, progressSteps({ kind: 'create', language: 'ja', stage: 'enrich', parallel: { notes: {}, readings: {} } }), {}).ms, 90000);
}

{ // Before starting: a range of typical runs, rounded to whole minutes.
  assert.equal(estimateText({ low: 50000, high: 110000 }), 'Usually 1–2 minutes');
  assert.equal(estimateText({ low: 70000, high: 85000 }), 'Usually about 1 minute');
  assert.equal(estimateText({ low: 10000, high: 25000 }), 'Usually less than a minute');
  assert.equal(estimateText({ low: 10000, high: 200000 }), 'Usually 1–3 minutes');
  assert.equal(estimateText(null), '');
}

{ // The ready-notification preference is an optional boolean in settings, off unless chosen.
  assert.equal(validSettings({ notifyWhenReady: true }), true);
  assert.equal(validSettings({ notifyWhenReady: 'yes' }), false);
  assert.equal(validSettings({}), true);
  const base = { providerId: '', model: '', reasoning: '', targetLanguages: {}, languageOrder: [], learnerProfiles: {}, languageExpectations: {}, standardizedLevels: {}, readingPreferences: {} };
  assert.equal(settingsSnapshot(base).notifyWhenReady, false);
  assert.equal(settingsSnapshot({ ...base, notifyWhenReady: true }).notifyWhenReady, true);
}

console.log('generation timing tests passed');
