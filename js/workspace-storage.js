// Workspace JSON is learner data: invalid data is never a writable empty default.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => JSON.parse(JSON.stringify(value));
const list = (value, check) => Array.isArray(value) && value.every(check);
// Older records may carry null for optional fields; null is treated as absent.
const absent = value => value === undefined || value === null;
const fault = (message, code) => Object.assign(new Error(message), {code});
function version(value) {
  return object(value) && id(value.id) && typeof value.story === 'string'
    && (absent(value.title) || typeof value.title === 'string')
    && (absent(value.glossary) || list(value.glossary, note => object(note) && typeof note.word === 'string' && typeof note.meaning === 'string' && (absent(note.forms) || list(note.forms, form => typeof form === 'string'))));
}

// --- Temporary one-time migration (remove in the next major release) ---------------------------
// Some saved stories carry glossary notes whose headword key is `term` or `text` instead of
// `word`. Before strict validation, `migrateGlossaryAliases` rewrites an alias-only key to `word`
// in place (key order kept) and drops the alias. It is idempotent: canonical data is untouched and
// reports no change. A note holding `word` plus a different alias value, or two different aliases,
// throws so the load fails closed and the original file is never rewritten. To remove: delete this
// block and the `migrate` entry on the stories definition below.
const GLOSSARY_ALIASES = ['term', 'text'];
function migrateGlossaryAliases(stories) {
  if (!Array.isArray(stories)) return false;
  let changed = false;
  const normalize = glossary => {
    if (!Array.isArray(glossary)) return;
    glossary.forEach((note, index) => {
      if (!object(note)) return;
      const present = GLOSSARY_ALIASES.filter(key => Object.hasOwn(note, key));
      if (!present.length) return;
      const values = ['word', ...present].filter(key => Object.hasOwn(note, key)).map(key => note[key]);
      if (values.some(item => item !== values[0])) throw Object.assign(new Error('Conflicting glossary headword keys.'), {userMessage:'Could not update data/stories.json: a glossary note has conflicting headword values. The original file has been preserved. Repair the file, then retry loading.'});
      const rebuilt = {};
      for (const [key, item] of Object.entries(note)) {
        if (GLOSSARY_ALIASES.includes(key)) { if (!('word' in rebuilt) && !Object.hasOwn(note, 'word')) rebuilt.word = item; } else rebuilt[key] = item;
      }
      glossary[index] = rebuilt; changed = true;
    });
  };
  for (const story of stories) {
    if (!object(story)) continue;
    normalize(story.glossary);
    if (Array.isArray(story.chapters)) for (const chapter of story.chapters) if (object(chapter) && Array.isArray(chapter.versions)) for (const item of chapter.versions) if (object(item)) normalize(item.glossary);
  }
  return changed;
}
// --- End temporary migration --------------------------------------------------------------------
export function validStories(value) {
  if (!list(value, story => {
    if (!object(story) || !id(story.id) || !id(story.language)) return false;
    if (['title','story','topic','practice'].some(key => !absent(story[key]) && typeof story[key] !== 'string')) return false;
    if (!absent(story.words) && !list(story.words, word => typeof word === 'string')) return false;
    if (!absent(story.chapters) && !Array.isArray(story.chapters)) return false;
    if (story.chapters?.length) {
      if (!story.chapters.every(chapter => object(chapter) && id(chapter.id) && chapter.versions?.length && list(chapter.versions, version) && (absent(chapter.help) || list(chapter.help, object)))) return false;
    } else if (!version({...story, id:story.id})) return false;
    if (!absent(story.paths) && !list(story.paths, path => object(path) && id(path.id) && typeof path.name === 'string' && path.entries?.length && list(path.entries, entry => object(entry) && story.chapters?.some(chapter => chapter.id === entry.chapterId && chapter.versions.some(item => item.id === entry.versionId))))) return false;
    return absent(story.memories) || list(story.memories, object);
  })) return false;
  return new Set(value.map(story => story.id)).size === value.length;
}
export function validSettings(value) {
  if (!object(value)) return false;
  const strings = ['providerId','model','reasoning','theme'];
  if (strings.some(key => value[key] !== undefined && typeof value[key] !== 'string')) return false;
  if (value.languageOrder !== undefined && !list(value.languageOrder, item => typeof item === 'string')) return false;
  if (value.languageSetupDismissed !== undefined && typeof value.languageSetupDismissed !== 'boolean') return false;
  if (['targetLanguages','standardizedLevels','learnerProfiles','languageExpectations'].some(key => value[key] !== undefined && !object(value[key]))) return false;
  return value.readingPreferences === undefined || object(value.readingPreferences);
}
export function validCheckpoints(value) {
  return Array.isArray(value) && value.length <= 1 && value.every(op => object(op) && id(op.id)
    && ['create','continue','rewrite','examples'].includes(op.kind)
    && ['plan','prose','notes','readings','ready','applied'].includes(op.stage)
    && object(op.config) && object(op.input) && id(op.language)
    && (op.kind === 'create' || object(op.target))
    && (op.request == null || object(op.request) && id(op.request.id)));
}
// Usage history: compact versioned local-date aggregates in milliseconds. Languages and activities are
// open key sets so history for a disabled or future language stays readable. Activities never overlap
// within a moment, so their sum cannot exceed the day's app time (about 25 h bounds a DST day).
export const USAGE_VERSION = 1;
export const USAGE_PATH = 'data/usage.json';
export const emptyUsage = () => ({version:USAGE_VERSION, days:{}});
const MAX_DAY_MS = 25 * 3600000;
const wholeMs = value => Number.isSafeInteger(value) && value >= 0;
function dateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === key;
}
export function validUsage(value) {
  if (!object(value) || value.version !== USAGE_VERSION || !object(value.days)) return false;
  return Object.entries(value.days).every(([key, day]) => {
    if (!dateKey(key) || !object(day) || !wholeMs(day.app) || day.app > MAX_DAY_MS || !object(day.languages)) return false;
    let total = 0;
    for (const [code, activities] of Object.entries(day.languages)) {
      if (!/^[A-Za-z][A-Za-z0-9-]{0,15}$/.test(code) || !object(activities)) return false;
      for (const [name, ms] of Object.entries(activities)) {
        if (!/^[a-z][a-z0-9-]{0,31}$/.test(name) || !wholeMs(ms)) return false;
        total += ms;
      }
    }
    return total <= day.app;
  });
}
// Optional stores never block generation, settings or stories when unreadable.
export const optionalStore = path => path === USAGE_PATH;
const CORE_STORES = ['data/stories.json', 'data/settings.json', 'data/generation-checkpoints.json'];
const definitions = {
  'data/stories.json': {fallback:[], validate:validStories, migrate:migrateGlossaryAliases},
  'data/settings.json': {fallback:{}, validate:validSettings},
  'data/generation-checkpoints.json': {fallback:[], validate:validCheckpoints},
  [USAGE_PATH]: {fallback:emptyUsage(), validate:validUsage}
};
export function createWorkspaceStorage({read, write, exists}) {
  const entries = new Map();
  function load(path) {
    const definition = definitions[path];
    if (!definition) throw new Error(`Unknown workspace store: ${path}`);
    let entry;
    try {
      const raw = read(path);
      // Some host versions return an empty string for a missing file. An empty
      // existing file is invalid; if existence cannot be established, fail closed.
      const missing = raw === '' && exists(path) === false;
      const value = missing ? clone(definition.fallback) : JSON.parse(raw);
      const migrated = !missing && definition.migrate ? definition.migrate(value) : false;
      if (!definition.validate(value)) throw new Error('Unexpected saved-data shape.');
      // Persist only valid migrated data. If the write fails the store stays invalid (and so
      // unwritable) with the original bytes untouched; a later load retries the migration.
      if (migrated) {
        let written = false;
        try { written = write(path, value); } catch { written = false; }
        if (!written) throw Object.assign(new Error('Migration write failed.'), {userMessage:`Could not update ${path} to the current format. Your data was not changed and the original file has been preserved. Retry loading.`});
      }
      entry = {path, status:missing ? 'missing' : 'valid', value, error:''};
    } catch (error) {
      if (error.code === 'not_found' || /ENOENT|not[ _]?found|does not exist/i.test(error.message)) entry = {path,status:'missing',value:clone(definition.fallback),error:''};
      else entry = {path,status:'invalid',value:clone(definition.fallback),error:error.userMessage || `Could not load ${path}. Repair the file, then retry loading. The original file has been preserved.`};
    }
    entries.set(path, entry); return entry;
  }
  function assertWritable(paths = CORE_STORES) {
    for (const path of paths) {
      const entry = entries.get(path);
      if (!entry || entry.status === 'invalid') throw fault(entry?.error || `Load ${path} before saving.`, 'store_invalid');
    }
  }
  return {
    load, entries, assertWritable,
    save(path, value) {
      assertWritable([path]);
      if (!definitions[path].validate(value)) throw fault(`Could not save ${path}: unexpected data shape.`, 'invalid_data');
      let written = false;
      try { written = write(path, value); } catch { written = false; }
      if (!written) throw fault(`Could not save ${path}. Your changes were not saved.`, 'write_failed');
      entries.set(path, {path,status:'valid',value:clone(value),error:''});
    }
  };
}

const SETTINGS_PATH = 'data/settings.json';
const SCALARS = ['providerId','model','reasoning','languageSetupDismissed','theme'];
const MAPS = ['targetLanguages','standardizedLevels','learnerProfiles','languageExpectations'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function settingsSnapshot(state) {
  return clone({providerId:state.providerId,model:state.model,reasoning:state.reasoning,targetLanguages:state.targetLanguages,languageOrder:state.languageOrder,learnerProfiles:state.learnerProfiles,languageExpectations:state.languageExpectations,languageSetupDismissed:state.languageSetupDismissed,standardizedLevels:state.standardizedLevels,readingPreferences:{furigana:state.furigana,fontSize:state.readerFontSize,speechRate:state.speechRate,followAlong:state.followAlong},theme:'dark'});
}
export function restoreSettingsSnapshot(state, value) {
  const {readingPreferences, theme, ...fields} = clone(value);
  Object.assign(state, fields, {furigana:readingPreferences.furigana,readerFontSize:readingPreferences.fontSize,speechRate:readingPreferences.speechRate,followAlong:readingPreferences.followAlong});
}

// Builds the file content for an ordinary save. Runtime state holds only values this version
// understands, so the stored file stays authoritative for everything else: unknown keys, retired
// values and legacy values the learner has not changed since load survive. A known entry the
// learner removed (present in `saved`, absent in `value`) is not restored. `admit[field](key, item)`
// says whether this version loads an entry into runtime state; languageOrder items are codes.
export function mergeSettings(stored, value, saved, admit = {}) {
  const base = object(stored) ? stored : {};
  const merged = {...base};
  const unchanged = (current, previous) => saved !== undefined && same(current, previous);
  for (const key of SCALARS) merged[key] = key in base && unchanged(value[key], saved?.[key]) ? base[key] : value[key];
  for (const key of MAPS) {
    const raw = object(base[key]) ? base[key] : {};
    const kept = Object.entries(raw).filter(([code, item]) => admit[key] && !admit[key](code, item));
    const current = Object.entries(value[key] || {}).map(([code, item]) => [code, Object.hasOwn(raw, code) && unchanged(item, saved?.[key]?.[code]) ? raw[code] : item]);
    merged[key] = Object.fromEntries([...kept, ...current]);
  }
  const known = [...(value.languageOrder || [])], order = [];
  for (const code of Array.isArray(base.languageOrder) ? base.languageOrder : []) {
    if (admit.languageOrder && !admit.languageOrder(code)) order.push(code);
    else if (known.length) order.push(known.shift());
  }
  merged.languageOrder = [...order, ...known];
  const preferences = object(base.readingPreferences) ? base.readingPreferences : {};
  merged.readingPreferences = {...preferences, ...Object.fromEntries(Object.entries(value.readingPreferences).map(([key, item]) => [key, key in preferences && unchanged(item, saved?.readingPreferences?.[key]) ? preferences[key] : item]))};
  return merged;
}

// Leaves are addressed by path: ['model'], ['readingPreferences','fontSize'], ['targetLanguages','de'].
function leafPaths(a, b) {
  const paths = [];
  for (const key of [...SCALARS, 'languageOrder']) paths.push([key]);
  for (const key of ['readingPreferences', ...MAPS]) for (const code of new Set([...Object.keys(a[key] || {}), ...Object.keys(b[key] || {})])) paths.push([key, code]);
  return paths;
}
const leaf = (snapshot, path) => path.reduce((item, key) => item?.[key], snapshot);
function setLeaf(snapshot, path, value) {
  const holder = path.length > 1 ? snapshot[path[0]] : snapshot;
  if (value === undefined) delete holder[path.at(-1)]; else holder[path.at(-1)] = clone(value);
}
export function settingsChanges(from, to) {
  return leafPaths(from, to).filter(path => !same(leaf(from, path), leaf(to, path))).map(path => ({path, from:leaf(from, path), to:leaf(to, path)}));
}

// Owns the settings transaction: write, roll back on failure, and remember a failed write's
// intended change so Retry repeats that change (never a reload). `admit` is described at mergeSettings.
export function createSettingsPersistence({storage, state, admit = {}, onRollback = () => {}, onReapply = () => {}, onError = () => {}, onSaved = () => {}}) {
  let saved, pending = null;
  function save() {
    const entry = storage.entries.get(SETTINGS_PATH), value = settingsSnapshot(state);
    try {
      storage.save(SETTINGS_PATH, mergeSettings(entry?.value, value, saved, admit));
      saved = value; onSaved();
    } catch (error) {
      const base = saved || value;
      if (saved) restoreSettingsSnapshot(state, saved);
      if (error.code === 'write_failed') {
        const next = settingsChanges(base, value);
        pending = {changes:[...(pending?.changes || []).filter(old => !next.some(item => same(item.path, old.path))), ...next]};
      }
      onRollback({intended:value, saved:base});
      onError({message:error.message, code:error.code || 'unknown', retryable:Boolean(pending)});
      throw error;
    }
  }
  return {
    remember() { saved = settingsSnapshot(state); },
    save,
    get pending() { return pending; },
    // Reapplies the failed change on top of current state. A field the learner has changed since
    // the failure is left alone. Returns true once nothing remains unsaved.
    retry() {
      if (!pending) return true;
      const current = settingsSnapshot(state), next = clone(current), applied = [];
      for (const change of pending.changes) if (same(leaf(current, change.path), change.from)) { setLeaf(next, change.path, change.to); applied.push(change); }
      pending = null;
      if (!applied.length) { onSaved(); return true; }
      restoreSettingsSnapshot(state, next); onReapply({changes:applied});
      try { save(); return true; } catch { return false; }
    }
  };
}
