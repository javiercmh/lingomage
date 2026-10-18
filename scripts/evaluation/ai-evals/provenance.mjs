// Hashes and versions that bind saved evaluation work to exact inputs, prompts and code.
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {PLAN_INSTRUCTIONS} from '../../../js/story-generation.js';
import {NOTES_INSTRUCTIONS, READING_INSTRUCTIONS, SAFEGUARD_VERSION} from '../../../js/learning-validation.js';
import {RUBRIC_HASH_SOURCE, RUBRIC_VERSION} from './rubric.mjs';
import {ROOT} from './store.mjs';

export const sha256 = text => createHash('sha256').update(text).digest('hex');
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const hashOf = value => sha256(canonicalJson(value));

// Production code that determines generation or validation, plus the evaluator itself.
const PRODUCTION_CODE = ['js/generation-pipeline.js', 'js/learning-validation.js', 'js/story-generation.js', 'js/generation-errors.js', 'js/reader-text.js'];

// The writer prompts live inside js/app.js. They are executed from the shipped source, never copied.
export function loadWriterPrompts(root = ROOT) {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const promptVersion = /const PROMPT_VERSION = '([^']+)'/.exec(app)?.[1];
  const start = app.indexOf('function storyInstructions('), end = app.indexOf('function storyInput(');
  if (!promptVersion || start < 0 || end < start) throw new Error('Could not locate the production prompt functions in js/app.js.');
  const source = app.slice(start, end);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  if (typeof context.storyInstructions !== 'function' || typeof context.chapterInstructions !== 'function') throw new Error('Production prompt functions are missing.');
  return {promptVersion, source, storyInstructions: context.storyInstructions, chapterInstructions: context.chapterInstructions};
}

export function computeProvenance(root = ROOT) {
  const writer = loadWriterPrompts(root);
  const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
  const profiles = read('data/learning-profiles.json');
  const safeguards = read('data/language-safeguards.json');
  const evaluatorDir = path.join(root, 'scripts/evaluation/ai-evals');
  const evaluatorFiles = ['scripts/ai-eval.mjs', ...fs.readdirSync(evaluatorDir).filter(name => name.endsWith('.mjs')).sort().map(name => 'scripts/evaluation/ai-evals/' + name)];
  const files = Object.fromEntries([...PRODUCTION_CODE, ...evaluatorFiles].map(rel => [rel, sha256(read(rel))]));
  const profileVersion = JSON.parse(profiles).version;
  const safeguardRegisterVersion = JSON.parse(safeguards).version;
  return {
    versions: {prompt: writer.promptVersion, safeguard: SAFEGUARD_VERSION, safeguardRegister: safeguardRegisterVersion, profile: profileVersion, rubric: RUBRIC_VERSION},
    hashes: {
      code: hashOf(files),
      prompt: hashOf({promptVersion: writer.promptVersion, writer: writer.source, plan: PLAN_INSTRUCTIONS, notes: NOTES_INSTRUCTIONS, readings: READING_INSTRUCTIONS}),
      profile: sha256(profiles),
      safeguard: hashOf({version: SAFEGUARD_VERSION, register: sha256(safeguards)}),
      rubric: hashOf(RUBRIC_HASH_SOURCE)
    },
    files,
    writer,
    profiles: JSON.parse(profiles)
  };
}

// Everything that must match before saved work for one case may be reused.
export function caseHashes(provenance, settings, caseInputHash) {
  return {
    input: caseInputHash,
    prompt: provenance.hashes.prompt,
    profile: provenance.hashes.profile,
    safeguard: provenance.hashes.safeguard,
    rubric: provenance.hashes.rubric,
    code: provenance.hashes.code,
    config: hashOf({generator: settings.generator, judge: settings.judge, maxJudgeInputUnits: settings.maxJudgeInputUnits})
  };
}

export function hashMismatches(saved, current) {
  return Object.keys(current).filter(key => saved?.[key] !== current[key]);
}
