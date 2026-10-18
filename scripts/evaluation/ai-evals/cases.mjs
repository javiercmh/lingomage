// The six core learning-quality cases: loading, validation, production-shaped inputs and request bounds.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './store.mjs';
import {hashOf} from './provenance.mjs';

export const CASES_FILE = path.join(ROOT, 'scripts/evaluation/ai-evals/cases.json');
export const LANGUAGE_NAMES = {de: 'German', ja: 'Japanese', ru: 'Russian', 'es-CL': 'Spanish'};
const KINDS = new Set(['create', 'continue', 'rewrite']);
const MEMORY_KEYS = ['characters', 'facts', 'plot', 'unresolved', 'uncertainties', 'situation'];
const REQUIRED_IDS = ['de-a1-parcel-create', 'ja-n5-station-create', 'ru-b1-appointment-create', 'es-cl-b1-ticket-create', 'de-b1-parcel-continue', 'ja-n3-umbrella-rewrite'];

export function loadCases(file = CASES_FILE, profiles) {
  const {cases} = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seen = new Set();
  for (const item of cases) {
    const where = `Case ${item?.id}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item?.id || '') || seen.has(item.id)) throw new Error(`${where}: id must be unique kebab-case.`);
    seen.add(item.id);
    if (!KINDS.has(item.kind) || !LANGUAGE_NAMES[item.language]) throw new Error(`${where}: unknown kind or language.`);
    if (typeof item.topic !== 'string' || !item.topic.trim()) throw new Error(`${where}: a brief is required.`);
    for (const key of ['practiceRequest', 'languageExpectations', 'prompt']) if (typeof item[key] !== 'string') throw new Error(`${where}: ${key} must be a string.`);
    if (profiles && !profiles.standardizedLevels[item.language].levels.some(level => level.id === item.difficulty)) throw new Error(`${where}: unknown level ${item.difficulty}.`);
    if (profiles && !profiles.scopes[item.scope]) throw new Error(`${where}: unknown scope.`);
    if (item.kind === 'create') {
      if (item.source) throw new Error(`${where}: create cases have no source chapter.`);
    } else {
      if (typeof item.source?.title !== 'string' || typeof item.source?.story !== 'string' || !item.source.story.trim()) throw new Error(`${where}: a frozen source chapter is required.`);
      if (!MEMORY_KEYS.every(key => Array.isArray(item.source.storyMemory?.[key]))) throw new Error(`${where}: storyMemory needs ${MEMORY_KEYS.join(', ')}.`);
    }
  }
  return cases;
}

export function requiredCaseIds() { return [...REQUIRED_IDS]; }

// Stage ceilings under the current pipeline: plan, prose, notes, plus readings for Japanese. Judge adds one request.
export function requestBound(item) {
  const generation = item.language === 'ja' ? 4 : 3;
  return {generation, judge: 1, total: generation + 1};
}

// Mirrors the Create/Continue/Rewrite inputs the app builds, without any learner profile or settings.
export function buildGenerationInput(item, profiles) {
  const level = profiles.standardizedLevels[item.language].levels.find(entry => entry.id === item.difficulty);
  const topic = item.practiceRequest ? `${item.topic} Practice request: ${item.practiceRequest}` : item.topic;
  const input = {
    language: LANGUAGE_NAMES[item.language], languageCode: item.language, difficulty: item.difficulty,
    framework: profiles.standardizedLevels[item.language].framework, levelDescription: level.guide,
    readingStartingPoint: item.difficulty, readingSelfReport: level.description,
    languageExpectations: item.languageExpectations, scope: item.scope, scopeDescription: profiles.scopes[item.scope].description,
    profileVersion: profiles.version, topic, practice: ''
  };
  if (item.kind === 'create') return input;
  input.prompt = item.prompt;
  input.storyMemory = item.source.storyMemory;
  input.recentProse = item.kind === 'continue' ? item.source.story : item.source.precedingProse || '';
  if (item.kind === 'rewrite') input.currentChapter = {title: item.source.title, story: item.source.story};
  return input;
}

export function buildInstructions(item, input, writer) {
  return item.kind === 'create'
    ? writer.storyInstructions(input.language, input.difficulty, input.levelDescription)
    : writer.chapterInstructions(input.language, input.difficulty, input.levelDescription, item.kind);
}

export function caseInputHash(item, input, instructions) {
  return hashOf({definition: item, input, instructions});
}
