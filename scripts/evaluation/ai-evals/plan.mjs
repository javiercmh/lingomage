// Argument parsing and the offline plan. Nothing here contacts the bridge, spawns a process or writes a file.
import fs from 'node:fs';
import {buildGenerationInput, buildInstructions, caseInputHash, loadCases, requestBound} from './cases.mjs';
import {DEFAULT_ENDPOINT} from './bridge.mjs';
import {caseHashes, computeProvenance} from './provenance.mjs';
import {resolveOutputDir} from './store.mjs';

export const MAX_REQUESTS_CAP = 60;
export const JUDGE_UNITS_RANGE = [1000, 400000];
const FLAGS = {
  '--cases': 'cases', '--generator-model': 'generatorModel', '--generator-effort': 'generatorEffort', '--judge-model': 'judgeModel', '--judge-effort': 'judgeEffort',
  '--max-requests': 'maxRequests', '--max-judge-input-units': 'maxJudgeInputUnits', '--output': 'output', '--endpoint': 'endpoint'
};
const SWITCHES = {'--live': 'live', '--resume': 'resume', '--retry': 'retry', '--abandon-ambiguous': 'abandonAmbiguous', '--help': 'help', '-h': 'help'};

export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = {endpoint: DEFAULT_ENDPOINT};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg in SWITCHES) options[SWITCHES[arg]] = true;
    else if (arg in FLAGS) {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value.`);
      options[FLAGS[arg]] = value;
    } else throw new UsageError(`Unknown argument: ${arg}`);
  }
  return options;
}

export const HELP = `LingoMage learning-quality evaluations (AI evals). Development-only; never packaged.

Default behavior is offline: with no --live this prints help or a plan and makes no network call, spawns no process and writes no file.
Nothing has been run live yet. The user decides when (docs/validation/generation-evaluation/README.md).

Usage (placeholders in <angle brackets> must be chosen explicitly; there are no defaults):
  node scripts/ai-eval.mjs --cases <CASE_ID[,CASE_ID...]> \\
    --generator-model <OPENAI_MODEL_ID> --generator-effort <EFFORT> \\
    --judge-model <OPENAI_MODEL_ID> --judge-effort <EFFORT> \\
    --max-requests <N> --max-judge-input-units <N> --output <RUN_DIR>        # offline plan
  ... the same arguments plus --live                                          # inference through the local bridge

Live runs need a dedicated 'python3 dev_server.py 8889 --chatgpt' (Codex login, OpenAI models only). Other flags:
  --endpoint http://localhost:PORT   bridge address (default ${DEFAULT_ENDPOINT})
  --resume                           continue an existing run directory with identical inputs, prompts, profile, safeguards, rubric, code and settings
  --retry                            with --resume, spend budget on failed stages/judge replies; failures are retained
  --abandon-ambiguous                with --resume, give up on a start whose outcome is unknown (still counted); restart the bridge first
Core case IDs: see scripts/evaluation/ai-evals/cases.json. Maximum budget: ${MAX_REQUESTS_CAP} requests.
`;

export function buildPlan(options, {root, fsImpl = fs} = {}) {
  const provenance = computeProvenance(root);
  const cases = loadCases(undefined, provenance.profiles);
  const problems = [];
  const ids = options.cases ? options.cases.split(',').map(id => id.trim()) : [];
  if (!ids.length || ids.some(id => !id)) problems.push('--cases needs explicit case IDs.');
  if (new Set(ids).size !== ids.length) problems.push('--cases lists a case twice.');
  const unknown = ids.filter(id => !cases.some(item => item.id === id));
  if (unknown.length) problems.push('Unknown case IDs: ' + unknown.join(', '));
  for (const [flag, value] of [['--generator-model', options.generatorModel], ['--generator-effort', options.generatorEffort], ['--judge-model', options.judgeModel], ['--judge-effort', options.judgeEffort]]) {
    if (!value || !value.trim()) problems.push(`${flag} is required; there is no default model or effort.`);
  }
  const integer = (name, flag, min, max) => {
    const raw = options[name];
    if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) { problems.push(`${flag} must be a whole number from ${min} to ${max}.`); return null; }
    return Number(raw);
  };
  const maxRequests = integer('maxRequests', '--max-requests', 1, MAX_REQUESTS_CAP);
  const maxJudgeInputUnits = integer('maxJudgeInputUnits', '--max-judge-input-units', ...JUDGE_UNITS_RANGE);
  let output = null;
  try { output = resolveOutputDir(options.output, {fs: fsImpl}); } catch (error) { problems.push('--output: ' + error.message); }
  const selected = ids.map(id => cases.find(item => item.id === id)).filter(Boolean);
  const settings = {generator: {model: options.generatorModel || '', effort: options.generatorEffort || ''}, judge: {model: options.judgeModel || '', effort: options.judgeEffort || ''}, maxJudgeInputUnits};
  const specs = selected.map(item => {
    const input = buildGenerationInput(item, provenance.profiles);
    const instructions = buildInstructions(item, input, provenance.writer);
    const inputHash = caseInputHash(item, input, instructions);
    return {item, input, instructions, inputHash, hashes: caseHashes(provenance, settings, inputHash), bound: requestBound(item)};
  });
  const total = specs.reduce((sum, spec) => sum + spec.bound.total, 0);
  const warnings = [];
  if (maxRequests !== null && maxRequests < total) warnings.push(`The budget (${maxRequests}) is below the upper bound (${total}); the run will stop at the budget and be reported incomplete.`);
  if (maxRequests !== null && maxRequests > total) warnings.push(`The budget exceeds the upper bound (${total}); the surplus is only for explicit --retry attempts.`);
  return {problems, warnings, provenance, specs, settings, maxRequests, output, total, generationTotal: specs.reduce((sum, spec) => sum + spec.bound.generation, 0)};
}

export function formatPlan(plan, options) {
  const lines = ['AI eval plan (offline: the bridge was not contacted; no request, file or process was created)'];
  lines.push(`Generator: ${plan.settings.generator.model || '(missing)'} / effort ${plan.settings.generator.effort || '(missing)'}`);
  lines.push(`Judge:     ${plan.settings.judge.model || '(missing)'} / effort ${plan.settings.judge.effort || '(missing)'}`);
  lines.push('Both must be OpenAI models in the bridge listing; they are validated against it only with --live. Same-family bias is recorded in the report.');
  lines.push(`Budget: at most ${plan.maxRequests ?? '(missing)'} inference starts shared by generation, judging, failures and retries. Judge input limit: ${plan.settings.maxJudgeInputUnits ?? '(missing)'} UTF-16 units.`);
  lines.push(`Output directory: ${plan.output ? plan.output.dir + (plan.output.exists ? ' (exists)' : ' (new)') : '(invalid)'}`);
  lines.push('Selected cases (stage requests = plan, prose, notes, plus readings for Japanese; +1 judge):');
  for (const spec of plan.specs) lines.push(`  ${spec.item.id}: ${spec.item.title}: up to ${spec.bound.generation} generation + ${spec.bound.judge} judge = ${spec.bound.total}`);
  lines.push(`Upper bound without recovery: ${plan.generationTotal} generation + ${plan.specs.length} judge = ${plan.total} requests.`);
  lines.push(`Versions: prompt ${plan.provenance.versions.prompt}, safeguards ${plan.provenance.versions.safeguard}, profiles ${plan.provenance.versions.profile}, rubric ${plan.provenance.versions.rubric}`);
  lines.push('Code and configuration hashes are recorded at run start; any mismatch refuses reuse.');
  lines.push('The bridge returns no token usage and cannot enforce an output-token limit; request counts and judge-input size are the enforced budgets.');
  for (const warning of plan.warnings) lines.push('Note: ' + warning);
  if (plan.problems.length) { lines.push('Missing or invalid:'); for (const problem of plan.problems) lines.push('  - ' + problem); }
  else lines.push(options.live ? 'Plan is complete.' : 'Plan is complete. Add --live to run it; nothing has been run.');
  return lines.join('\n');
}
