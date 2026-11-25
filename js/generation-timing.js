// Generation timing: how long each step of a saved generation took, and an estimate for the next one.
// Pure helpers with no DOM and no clock of their own. Timings are measured by LingoMage itself (the host
// reports no request times): `startedAt` just before ai.start, `completedAt` when the reply or error
// arrives. A reply collected by a later page after a reload only shows when that page noticed it, so
// such attempts are marked `approximate` and their step is never used for estimates.

export const MIN_SAMPLES = 3;      // similar past runs needed before a step gets an estimate
export const RECENT_SAMPLES = 20;  // newest similar runs used for one step's median
const TIMED_STEPS = ['context', 'plan', 'prose', 'notes', 'readings'];

const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' ? value : '';
export const stepOf = name => String(name).startsWith('notes') ? 'notes' : String(name);

// One finished request attempt, appended to op.timings by the pipeline (and, for story context, by the app).
export function timingEntry({stage, part, model, reasoning, startedAt, completedAt, outcome, approximate}) {
  const entry = {stage, model: text(model), reasoning: text(reasoning), startedAt, completedAt, outcome};
  if (part && part !== stage) entry.part = part;
  if (approximate) entry.approximate = true;
  return entry;
}

// Busy time of possibly overlapping intervals, so parallel note parts count once.
export function busyTime(intervals) {
  const sorted = intervals.filter(([start, end]) => finite(start) && finite(end) && end >= start).sort((a, b) => a[0] - b[0]);
  let total = 0, start = null, end = null;
  for (const [from, to] of sorted) {
    if (end === null || from > end) { if (end !== null) total += end - start; start = from; end = to; }
    else end = Math.max(end, to);
  }
  return end === null ? 0 : total + end - start;
}

// What a finished operation took, saved with the chapter as `timing`. Retries and failed attempts count
// toward the step that needed them; waiting between attempts (a stop and a later Resume) does not.
export function summarizeTimings(op) {
  const entries = (Array.isArray(op?.timings) ? op.timings : []).filter(entry => entry && TIMED_STEPS.includes(stepOf(entry.stage)) && finite(entry.startedAt) && finite(entry.completedAt) && entry.completedAt >= entry.startedAt);
  if (!entries.length) return null;
  const steps = {}, intervals = [];
  let approximate = false;
  for (const key of TIMED_STEPS) {
    const own = entries.filter(entry => stepOf(entry.stage) === key);
    if (!own.length) continue;
    if (own.some(entry => entry.approximate)) { approximate = true; continue; }
    const spans = own.map(entry => [entry.startedAt, entry.completedAt]);
    intervals.push(...spans);
    const last = own[own.length - 1];
    const step = {ms: busyTime(spans), attempts: own.length, model: text(last.model), reasoning: text(last.reasoning)};
    if (key === 'context') step.requests = own.length;
    if (key === 'notes') step.parts = new Set(own.map(entry => entry.part || entry.stage)).size;
    steps[key] = step;
  }
  if (!Object.keys(steps).length) return null;
  return {version: 1, steps, totalMs: busyTime(intervals), ...(approximate ? {approximate: true} : {})};
}

// Past steps from saved chapters, oldest first. Saved data is never trusted: malformed timing is skipped.
export function timingSamples(stories) {
  const samples = [];
  for (const story of Array.isArray(stories) ? stories : []) {
    for (const chapter of Array.isArray(story?.chapters) ? story.chapters : []) {
      for (const version of Array.isArray(chapter?.versions) ? chapter.versions : []) {
        const steps = version?.timing?.steps;
        if (!steps || typeof steps !== 'object') continue;
        for (const key of TIMED_STEPS) {
          const step = steps[key];
          if (!step || !finite(step.ms) || step.ms <= 0) continue;
          const requests = key === 'context' ? Number(step.requests) : 1;
          if (!(requests >= 1)) continue;
          samples.push({step: key, ms: step.ms / requests, model: text(step.model), reasoning: text(step.reasoning), language: text(story.language), scope: text(version.scope) === 'longer' ? 'chapter' : text(version.scope), parts: Number(step.parts) || 1, at: Date.parse(version.createdAt || '') || 0});
        }
      }
    }
  }
  return samples.sort((a, b) => a.at - b.at);
}

function quantile(sorted, q) {
  const position = (sorted.length - 1) * q, low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}
// Median and quartiles of the most similar past runs: first the same model, reasoning effort, language,
// scope (and number of note parts), then the same model and effort, then the same model only.
export function stepStats(samples, step) {
  const own = samples.filter(sample => sample.step === step.key && sample.model === step.model);
  const levels = [
    sample => sample.reasoning === step.reasoning && sample.language === step.language && (step.key === 'context' || step.key === 'readings' || sample.scope === step.scope) && (step.key !== 'notes' || sample.parts === step.parts),
    sample => sample.reasoning === step.reasoning,
    () => true
  ];
  for (const match of levels) {
    const found = own.filter(match);
    if (found.length < MIN_SAMPLES) continue;
    const values = found.slice(-RECENT_SAMPLES).map(sample => sample.ms).sort((a, b) => a - b);
    return {median: quantile(values, 0.5), low: quantile(values, 0.25), high: quantile(values, 0.75), samples: values.length};
  }
  return null;
}

// The steps a new generation will run, mirroring the pipeline and progressSteps. `plan` describes the
// request: kind, language, scope, notesParts, model and reasoning, light ({model, reasoning} or null),
// and for Continue/Rewrite the number of story-context summaries still to make and their model.
export function plannedSteps(plan) {
  const main = {model: text(plan.model), reasoning: text(plan.reasoning)};
  const light = text(plan.light?.model).trim() ? {model: plan.light.model, reasoning: text(plan.light.reasoning)} : main;
  const common = {language: text(plan.language), scope: text(plan.scope) === 'longer' ? 'chapter' : text(plan.scope)};
  const steps = [];
  if (plan.contextRequests > 0) steps.push({key: 'context', ...common, ...(plan.context || light), requests: plan.contextRequests});
  if (plan.kind !== 'examples') steps.push({key: 'plan', ...common, ...main});
  steps.push({key: 'prose', ...common, ...main});
  if (plan.kind !== 'examples') steps.push({key: 'notes', ...common, ...light, parts: Math.max(1, Number(plan.notesParts) || 1)});
  if (plan.language === 'ja') steps.push({key: 'readings', ...common, ...light});
  return steps;
}

// The estimate is the sum of each step's median; Japanese notes and readings run at the same time, so
// that pair counts as the longer of the two. Null until every step has enough similar past runs.
export function estimateGeneration(plan, samples) {
  if (plan.kind === 'examples') return null; // examples are not estimated (their prose step differs)
  const steps = {};
  for (const step of plannedSteps(plan)) {
    const stats = stepStats(samples, step);
    if (!stats) return null;
    const times = step.requests || 1;
    steps[step.key] = {median: stats.median * times, low: stats.low * times, high: stats.high * times};
  }
  const sum = field => Object.entries(steps).reduce((total, [key, value]) => key === 'readings' && steps.notes ? total : total + (key === 'notes' && steps.readings ? Math.max(value[field], steps.readings[field]) : value[field]), 0);
  return {steps, total: sum('median'), low: sum('low'), high: sum('high')};
}

// Time left while running: done steps count nothing, waiting steps their median, the running step what is
// left of its median. A running step past its median counts zero; when nothing else is left, `over` is true.
export function remainingTime(estimate, steps, elapsed = {}) {
  if (!estimate) return null;
  const left = {};
  let overdue = false;
  for (const step of steps) {
    const median = estimate.steps[step.key]?.median;
    if (median === undefined) { left[step.key] = 0; continue; }
    if (step.state === 'done') left[step.key] = 0;
    else if (step.state === 'active') { const rest = median - (elapsed[step.key] || 0); if (rest <= 0) overdue = true; left[step.key] = Math.max(0, rest); }
    else left[step.key] = median;
  }
  const ms = Object.entries(left).reduce((total, [key, value]) => key === 'readings' && left.notes !== undefined ? total : total + (key === 'notes' && left.readings !== undefined ? Math.max(value, left.readings) : value), 0);
  return {ms, over: overdue && ms <= 0};
}

const minutes = count => `${count} minute${count === 1 ? '' : 's'}`;
// Before starting: a range of typical runs, never a precise countdown.
export function estimateText(estimate) {
  if (!estimate) return '';
  const high = Math.round(estimate.high / 60000);
  if (high < 1) return 'Usually less than a minute';
  const low = Math.min(high, Math.max(1, Math.round(estimate.low / 60000)));
  return low === high ? `Usually about ${minutes(low)}` : `Usually ${low}–${high} minutes`;
}
// While running: one rounded figure.
export function remainingText(remaining) {
  if (!remaining) return '';
  if (remaining.over) return 'Taking longer than usual';
  if (remaining.ms < 45000) return 'Less than a minute left';
  return `About ${minutes(Math.max(1, Math.round(remaining.ms / 60000)))} left`;
}
