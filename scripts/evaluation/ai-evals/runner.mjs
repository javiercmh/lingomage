// Live orchestration (only reachable through --live). Reuses the production stage pipeline for generation and the
// gateway for every request. Nothing is retried, rerolled or replaced unless the operator passes --retry.
import fs from 'node:fs';
import {createPipeline} from '../../../js/generation-pipeline.js';
import {SAFEGUARD_VERSION} from '../../../js/learning-validation.js';
import {validateModelSettings} from './bridge.mjs';
import {createGateway} from './gateway.mjs';
import {BudgetExhausted, createLedger, FatalEvalError} from './ledger.mjs';
import {buildPlan, UsageError} from './plan.mjs';
import {canonicalJson, hashMismatches} from './provenance.mjs';
import {buildJudgeInput, classifyReview, classifyRun, JUDGE_INSTRUCTIONS, RUN_LIMITATIONS, SAME_FAMILY_NOTE, validateJudgeResponse} from './rubric.mjs';
import {acquireLock, createStore, resolveOutputDir} from './store.mjs';

const OUTPUT_TOKEN_NOTE = 'Not enforceable: the Codex bridge accepts no output-token limit and returns no usage. Judge input size and request counts are enforced instead.';

export function summarizeCase(spec, rec, notes = {}) {
  const base = {caseId: spec.item.id, title: spec.item.title, kind: spec.item.kind, language: spec.item.language, level: spec.item.difficulty};
  if (!rec) return {...base, status: 'incomplete', reason: notes.halted ? 'The run halted before this case started.' : notes.budget ? 'The request budget was exhausted before this case started.' : 'Not run.', stage: {state: 'not-run'}, judge: {state: 'not-run'}};
  const op = rec.records[0];
  const stage = rec.result ? {state: 'completed'} : op?.failure ? {state: 'failed', failure: op.failure} : op ? {state: 'incomplete', stage: op.stage} : {state: 'not-run'};
  stage.failureHistory = rec.failureHistory;
  const attempts = rec.judge.attempts;
  const last = attempts.at(-1);
  let judge = {state: 'not-run', attempts: attempts.length};
  if (rec.review) judge = {state: 'reviewed', attempts: attempts.length};
  else if (rec.judge.oversize) judge = {state: 'oversize', ...rec.judge.oversize};
  else if (last?.error) judge = {state: 'error', error: last.error, attempts: attempts.length};
  else if (last?.validation && !last.validation.valid) judge = {state: 'invalid', errors: last.validation.errors, attempts: attempts.length};
  else if (last) judge = {state: 'incomplete', attempts: attempts.length};
  const failedJudgeAttempts = attempts.filter(attempt => attempt.error || (attempt.validation && !attempt.validation.valid)).map(attempt => ({error: attempt.error || null, validationErrors: attempt.validation?.errors || [], raw: attempt.raw ?? null}));
  if (!rec.review) {
    const reason = stage.state !== 'completed' ? (notes.budget && stage.state !== 'failed' ? 'The request budget was exhausted during generation.' : `Generation ${stage.state}.`) : judge.state === 'not-run' && notes.budget ? 'The request budget was exhausted before judging.' : judge.state === 'not-run' && notes.halted ? 'The run halted before judging.' : `Judge ${judge.state}.`;
    return {...base, status: 'incomplete', reason, stage, judge, failedJudgeAttempts};
  }
  const classification = classifyReview(rec.review.response);
  return {
    ...base, status: classification.status, flaggedBecause: classification.reasons, stage, judge, failedJudgeAttempts,
    scores: Object.fromEntries(Object.entries(rec.review.response.dimensions).map(([name, entry]) => [name, entry ? entry.score : null])),
    review: rec.review.response
  };
}

export function buildReport({runRecord, specs, recs, ledger, notes, provenance, settings, triage}) {
  const cases = specs.map(spec => summarizeCase(spec, recs.get(spec.item.id), {budget: notes.budgetStopped.has(spec.item.id), halted: Boolean(notes.halted)}));
  const attempts = ledger.data.attempts;
  return {
    schema: 1, runId: runRecord.runId, generatedAt: runRecord.generatedAt, status: classifyRun(cases.map(item => item.status)), halted: notes.halted || '',
    counts: {
      selected: cases.length, flagged: cases.filter(item => item.status === 'flagged').length, noIssuesFlagged: cases.filter(item => item.status === 'no issues flagged').length,
      incomplete: cases.filter(item => item.status === 'incomplete').length,
      stageErrors: cases.filter(item => item.stage.state === 'failed').length, judgeErrors: cases.filter(item => ['error', 'invalid', 'oversize'].includes(item.judge.state)).length
    },
    settings: {...settings, sameFamilyBias: SAME_FAMILY_NOTE, outputTokenLimit: OUTPUT_TOKEN_NOTE, usage: 'Not provided by the bridge; none is recorded or estimated.'},
    versions: provenance.versions, hashes: provenance.hashes,
    budget: {max: ledger.data.maxRequests, started: attempts.length, remaining: ledger.data.maxRequests - attempts.length, history: ledger.data.budgetHistory},
    requests: attempts.map(({seq, caseId, stage, role, state, startedAt, finishedAt, seconds, error, code}) => ({seq, caseId, stage, role, state, startedAt, finishedAt, seconds, error, code})),
    cases, triage: triage || [], limitations: RUN_LIMITATIONS
  };
}

export function formatReport(report) {
  const lines = [`AI eval result: ${report.status.toUpperCase()}${report.halted ? ' (halted: ' + report.halted + ')' : ''}`];
  lines.push(`Requests started: ${report.budget.started}/${report.budget.max}. Flagged ${report.counts.flagged}, no issues flagged ${report.counts.noIssuesFlagged}, incomplete ${report.counts.incomplete}; stage errors ${report.counts.stageErrors}, judge errors ${report.counts.judgeErrors}.`);
  for (const item of report.cases) {
    lines.push(`  ${item.caseId}: ${item.status}${item.reason ? ' (' + item.reason + ')' : ''}${item.flaggedBecause?.length ? ': ' + item.flaggedBecause.join('; ') : ''}`);
  }
  lines.push('"No issues flagged" is not a pass. Scores are uncalibrated and do not show learning benefit. ' + SAME_FAMILY_NOTE);
  return lines.join('\n');
}

export async function runLive(options, deps) {
  const {bridge, fs: fsImpl = fs, now = () => new Date(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), root, stdout = () => {}, timeoutMs, pollMs} = deps;
  const plan = buildPlan(options, {root, fsImpl});
  if (plan.problems.length) throw new UsageError('Live run refused:\n  - ' + plan.problems.join('\n  - '));
  const {settings, provenance, specs} = plan;

  // Metadata only. No inference happens before the models are validated.
  const info = await bridge.info();
  if (!info?.liveAi) throw new Error('The bridge is not a live --chatgpt development server. Mock or disabled AI is not accepted as evidence.');
  const models = await bridge.models();
  validateModelSettings(models, 'Generator', settings.generator);
  validateModelSettings(models, 'Judge', settings.judge);

  const out = resolveOutputDir(options.output, {fs: fsImpl});
  if (out.exists && !out.empty && !options.resume) throw new Error('The output directory already contains a run. Pass --resume to continue it with identical settings, or choose a new directory.');
  if (options.resume && (!out.exists || out.empty)) throw new Error('--resume needs an existing run directory.');
  if ((options.retry || options.abandonAmbiguous) && !options.resume) throw new UsageError('--retry and --abandon-ambiguous apply only with --resume.');
  const store = createStore(out.dir, fsImpl);
  store.ensure();
  const unlock = acquireLock(store, now);
  const notes = {halted: '', budgetStopped: new Set()};
  const recs = new Map();
  try {
    const compat = {
      schema: 1, caseIds: specs.map(spec => spec.item.id), generator: settings.generator, judge: settings.judge, maxJudgeInputUnits: settings.maxJudgeInputUnits,
      versions: provenance.versions, hashes: provenance.hashes, caseHashes: Object.fromEntries(specs.map(spec => [spec.item.id, spec.hashes]))
    };
    let runRecord;
    if (store.exists('run.json')) {
      runRecord = store.read('run.json');
      const differing = Object.keys(compat).filter(key => canonicalJson(runRecord.compat?.[key]) !== canonicalJson(compat[key]));
      if (differing.length) throw new Error('This run directory was created with different inputs, prompts, profile, safeguards, rubric, code or settings (' + differing.join(', ') + '). Use a new directory.');
    } else {
      runRecord = {runId: `ai-eval-${now().toISOString().replace(/[:.]/g, '-')}`, createdAt: now().toISOString(), compat, note: 'Fictional public cases only; no learner files are read.'};
      store.write('run.json', runRecord);
    }
    runRecord.generatedAt = now().toISOString();
    const ledger = createLedger({store, now});
    if (!ledger.loaded) ledger.init(plan.maxRequests); else ledger.setMax(plan.maxRequests);
    const unresolved = ledger.unresolved();
    if (unresolved.length) {
      if (!options.abandonAmbiguous) throw new FatalEvalError(`${unresolved.length} earlier request start(s) have no saved request ID (attempt ${unresolved.map(item => item.seq).join(', ')}); starting again could duplicate inference. Restart the bridge, then resume with --abandon-ambiguous to give up on them (they stay counted), or use a new directory.`);
      ledger.abandonUnresolved();
    }
    const gateway = createGateway({store, ledger, bridge, now, sleep, settings, timeoutMs, pollMs});
    const save = rec => store.write(`cases/${rec.caseId}.json`, rec);

    function loadCaseRecord(spec) {
      const name = `cases/${spec.item.id}.json`;
      if (store.exists(name)) {
        const saved = store.read(name);
        const differing = hashMismatches(saved.hashes, spec.hashes);
        if (differing.length) throw new Error(`Saved case ${spec.item.id} does not match the current ${differing.join(', ')}; refusing to reuse it.`);
        return saved;
      }
      return {schema: 1, caseId: spec.item.id, hashes: spec.hashes, createdAt: now().toISOString(), records: [], failureHistory: [], result: null, operationSnapshot: null, judge: {attempts: []}, review: null};
    }

    async function generate(spec, rec) {
      let op = rec.records[0];
      if (op?.failure || op?.error) {
        if (!options.retry) return false; // The failure is retained; --retry is the only way to spend more budget on it.
        rec.failureHistory.push({at: now().toISOString(), stage: op.stage, failure: op.failure || null, error: op.error || ''});
        save(rec);
      }
      if (!op && ledger.remaining() <= 0) { notes.budgetStopped.add(spec.item.id); return false; }
      const pipeline = createPipeline({
        records: rec.records, persist: () => save(rec), ai: gateway.forCase(spec.item.id, 'generator'),
        apply(finished) { // Idempotent: a saved result is never applied twice.
          if (rec.result) return;
          rec.result = finished.result; rec.operationSnapshot = JSON.parse(JSON.stringify(finished)); rec.completedAt = now().toISOString();
          save(rec);
        }
      });
      op = op || pipeline.create({planned: true, kind: spec.item.kind, language: spec.item.language, input: spec.input, instructions: spec.instructions, config: {providerId: 'chatgpt', model: settings.generator.model, reasoning: settings.generator.effort}, promptVersion: provenance.versions.prompt, safeguardVersion: SAFEGUARD_VERSION});
      try { await pipeline.run(op); return true; }
      catch (error) {
        if (error.evalFatal) throw error;
        if (error.code === 'budget_exhausted') { delete op.failure; op.error = ''; save(rec); notes.budgetStopped.add(spec.item.id); return false; }
        if (['storage', 'release'].includes(op.failure?.category)) throw new FatalEvalError(`A ${op.failure.category} failure stopped the run: ${error.message}`);
        return false;
      }
    }

    async function judge(spec, rec) {
      if (rec.review) return;
      const built = buildJudgeInput(spec.item, spec.input, rec.result);
      if (built.units > settings.maxJudgeInputUnits) { rec.judge.oversize = {units: built.units, max: settings.maxJudgeInputUnits}; save(rec); return; } // Never truncated.
      const attempts = rec.judge.attempts;
      let attempt = attempts.at(-1);
      if (attempt && (attempt.error || (attempt.validation && !attempt.validation.valid))) { if (!options.retry) return; attempt = null; }
      const adapter = gateway.forCase(spec.item.id, 'judge');
      if (!attempt) {
        if (ledger.remaining() <= 0) { notes.budgetStopped.add(spec.item.id); return; }
        attempt = {createdAt: now().toISOString()}; attempts.push(attempt); save(rec);
      }
      if (!('raw' in attempt)) {
        let id = attempt.requestId; // A saved ID is polled, never replaced.
        try { id = id || await adapter.start({providerId: 'chatgpt', model: settings.judge.model, reasoningEffort: settings.judge.effort, instructions: JUDGE_INSTRUCTIONS, input: built.input}); }
        catch (error) {
          if (error instanceof BudgetExhausted) { if (!attempt.requestId) attempts.pop(); save(rec); notes.budgetStopped.add(spec.item.id); return; }
          if (error.evalFatal) throw error;
          attempt.error = String(error.message).slice(0, 500); save(rec); return; // A definite bridge rejection; counted, not retried.
        }
        attempt.requestId = id; save(rec);
        try { attempt.raw = await adapter.wait(id); attempt.finishedAt = now().toISOString(); }
        catch (error) {
          if (error.evalFatal) throw error;
          attempt.error = String(error.message).slice(0, 500); save(rec);
          await adapter.acknowledge(id); attempt.released = true; save(rec); return;
        }
        save(rec);
      }
      if (!attempt.validation) {
        const result = validateJudgeResponse(attempt.raw, {quotable: built.quotable, glossaryTotal: built.glossaryTotal, language: spec.item.language, practiceBlank: !spec.item.practiceRequest});
        attempt.validation = {valid: result.valid, errors: result.errors};
        if (result.valid) rec.review = {requestId: attempt.requestId, response: result.review};
        save(rec); // Persisted before the request is released.
      }
      if (!attempt.released) { await adapter.acknowledge(attempt.requestId); attempt.released = true; save(rec); }
    }

    for (const spec of specs) {
      const rec = loadCaseRecord(spec);
      recs.set(spec.item.id, rec);
      if (notes.halted) continue;
      try {
        if (!rec.result) await generate(spec, rec);
        if (rec.result) await judge(spec, rec);
      } catch (error) {
        notes.halted = error.evalFatal ? error.message : 'Unexpected error: ' + error.message;
      }
    }
    for (const spec of specs) if (!recs.get(spec.item.id)?.records.length && !recs.get(spec.item.id)?.result && !store.exists(`cases/${spec.item.id}.json`)) recs.set(spec.item.id, null);

    const triage = store.exists('triage.json') ? store.read('triage.json') : [];
    const report = buildReport({runRecord, specs, recs, ledger, notes, provenance, settings: {generator: settings.generator, judge: settings.judge, maxJudgeInputUnits: settings.maxJudgeInputUnits, endpoint: bridge.endpoint}, triage});
    store.write('report.json', report);
    stdout(formatReport(report));
    return report;
  } finally { unlock(); }
}
