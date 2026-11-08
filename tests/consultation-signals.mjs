import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorkspaceStorage, emptySignals, validSignals, optionalStore, SIGNALS_PATH} from '../js/workspace-storage.js';
import {createSignalsTracker, rankItems, itemScore, itemKey, mergeSignals, DEDUPE_MS, HALF_LIFE_DAYS} from '../js/consultation-signals.js';

const DAY = 24 * 60 * 60 * 1000;
const calendar = {dateKey: ms => new Date(ms).toISOString().slice(0, 10)};
function harness({stored = null, invalid = false} = {}) {
  const clock = {wall: Date.UTC(2026, 10, 8, 12), now() { return this.wall; }};
  const disk = {text: stored ? JSON.stringify(stored) : null, writes: 0, fail: false};
  const persistence = {
    load: () => invalid ? {status: 'invalid', value: emptySignals(), error: 'Could not load data/learning-signals.json.'}
      : disk.text === null ? {status: 'missing', value: emptySignals()} : {status: 'valid', value: JSON.parse(disk.text)},
    save(value) {
      if (disk.fail) throw Object.assign(new Error('Could not save.'), {code: 'write_failed'});
      assert.ok(validSignals(value), 'only valid signals are ever written');
      disk.text = JSON.stringify(value); disk.writes++;
    }
  };
  const tracker = createSignalsTracker({clock, calendar, persistence});
  return {clock, disk, tracker, stored: () => JSON.parse(disk.text)};
}
const note = (extra = {}) => ({language: 'de', kind: 'note', word: 'kaufen', meaning: 'buy', action: 'note', sentence: 'Sie kauft Brot.', ...extra});

// --- Recording: note identity, counts, days, contexts, whole-file write ---------------------------------
{
  const h = harness();
  assert.equal(h.tracker.record(note()), true);
  const item = h.stored().languages.de.items[itemKey('kaufen')];
  assert.deepEqual(item.counts, {note: 1});
  assert.deepEqual(item.days, ['2026-11-08']);
  assert.equal(item.first, '2026-11-08'); assert.equal(item.last, '2026-11-08');
  assert.deepEqual(item.contexts, [{sentence: 'Sie kauft Brot.', date: '2026-11-08'}]);
  assert.equal(h.disk.writes, 1);
  // Same item and action inside the dedupe window counts once; another action counts.
  assert.equal(h.tracker.record(note()), false);
  assert.equal(h.tracker.record(note({action: 'listen'})), true);
  h.clock.wall += DEDUPE_MS;
  assert.equal(h.tracker.record(note()), true);
  assert.deepEqual(h.stored().languages.de.items[itemKey('kaufen')].counts, {note: 2, listen: 1});
  // The same headword with another chapter's meaning is the same item; the latest meaning is shown.
  h.clock.wall += DEDUPE_MS;
  h.tracker.record(note({meaning: 'to buy; kaufte is past tense here'}));
  assert.deepEqual(Object.keys(h.stored().languages.de.items), ['kaufen']);
  assert.equal(h.stored().languages.de.items.kaufen.meaning, 'to buy; kaufte is past tense here');
  assert.equal(h.stored().languages.de.items.kaufen.counts.note, 3);
  // Every meaning is kept, latest first, with its own count and sentence, so homographs can be split later.
  assert.deepEqual(h.stored().languages.de.items.kaufen.meanings.map(m => [m.text, m.count, m.sentence]),
    [['to buy; kaufte is past tense here', 1, 'Sie kauft Brot.'], ['buy', 3, 'Sie kauft Brot.']]);
  h.clock.wall += DEDUPE_MS;
  h.tracker.record(note({sentence: 'Er kauft Milch.'}));
  assert.deepEqual(h.stored().languages.de.items.kaufen.meanings.map(m => [m.text, m.count, m.sentence]),
    [['buy', 4, 'Er kauft Milch.'], ['to buy; kaufte is past tense here', 1, 'Sie kauft Brot.']]);
  assert.equal(h.stored().languages.de.items.kaufen.meaning, 'buy');
  // Contexts keep the three most recent distinct sentences.
  for (const sentence of ['A.', 'B.', 'C.', 'D.']) { h.clock.wall += DEDUPE_MS; h.tracker.record(note({sentence})); }
  assert.deepEqual(h.tracker.data.languages.de.items[itemKey('kaufen')].contexts.map(c => c.sentence), ['D.', 'C.', 'B.']);
}

// --- Selections: normalized key, canonical text, title selections and invalid input are ignored ------------
{
  const h = harness();
  h.tracker.record({language: 'ja', kind: 'selection', word: '  食べて  いる ', action: 'explain', sentence: '猫が魚を食べている。'});
  h.tracker.record({language: 'ja', kind: 'selection', word: '食べて いる', action: 'detail'});
  const items = h.stored().languages.ja.items;
  assert.deepEqual(Object.keys(items), ['食べて いる']);
  assert.equal(items['食べて いる'].word, '食べて いる', 'stores canonical text without readings or extra spaces');
  assert.deepEqual(items['食べて いる'].counts, {explain: 1, detail: 1});
  assert.equal(h.tracker.record({language: 'de', kind: 'selection', word: '   ', action: 'explain'}), false);
  assert.equal(h.tracker.record({language: 'de', kind: 'other', word: 'x', action: 'explain'}), false);
  assert.equal(h.tracker.record({language: 'de', kind: 'selection', word: 'x', action: 'Bad Action'}), false);
}

// --- A selection of a noted word merges with the note, in either order; the note keeps headword and meaning ----
{
  const h = harness();
  h.tracker.record({language: 'ja', kind: 'selection', word: 'の', action: 'explain'});
  h.tracker.record({language: 'ja', kind: 'note', word: 'の', meaning: 'question marker', action: 'note'});
  h.tracker.record({language: 'de', kind: 'note', word: 'Gelegenheit', meaning: 'opportunity', action: 'note'});
  h.tracker.record({language: 'de', kind: 'selection', word: 'gelegenheit', action: 'explain'});
  const ja = h.stored().languages.ja.items, de = h.stored().languages.de.items;
  assert.deepEqual(Object.keys(ja), ['の']);
  assert.deepEqual([ja['の'].kind, ja['の'].meaning, ja['の'].counts], ['note', 'question marker', {explain: 1, note: 1}]);
  assert.deepEqual(Object.keys(de), ['gelegenheit']);
  assert.deepEqual([de.gelegenheit.word, de.gelegenheit.meaning, de.gelegenheit.counts], ['Gelegenheit', 'opportunity', {note: 1, explain: 1}]);
}

// --- Items saved under the earlier headword|meaning and sel: keys are merged on load ------------------------
{
  const old = (word, extra) => ({word, counts: {note: 1}, days: ['2026-11-01'], first: '2026-11-01', last: '2026-11-01', contexts: [], exposures: 1, seenSinceLookup: 1, ...extra});
  const disk = {text: JSON.stringify({version: 1, languages: {ja: {items: {
    'note:の|casual question marker': old('の', {kind: 'note', meaning: 'casual question marker', last: '2026-11-05', days: ['2026-11-05']}),
    'note:の|possessive': old('の', {kind: 'note', meaning: 'possessive'}),
    'sel:の': old('の', {kind: 'selection', counts: {explain: 1}})
  }}}}), writes: 0};
  const tracker = createSignalsTracker({clock: {now: () => Date.UTC(2026, 10, 8)}, calendar, persistence: {load: () => ({status: 'ok', value: JSON.parse(disk.text)}), save: value => { disk.writes++; disk.text = JSON.stringify(value); }}});
  const items = tracker.data.languages.ja.items;
  assert.deepEqual(Object.keys(items), ['の']);
  assert.deepEqual(items['の'].counts, {note: 2, explain: 1});
  assert.equal(items['の'].meaning, 'casual question marker', 'the most recent meaning is shown');
  assert.deepEqual(items['の'].meanings.map(m => [m.text, m.count, m.last]),
    [['casual question marker', 1, '2026-11-05'], ['possessive', 1, '2026-11-01']], 'no meaning is lost in the merge');
  assert.deepEqual(items['の'].days, ['2026-11-01', '2026-11-05']);
  assert.equal(items['の'].exposures, 3);
  assert.equal(disk.writes, 0, 'loading alone does not rewrite the file');
}

// --- Ranking: weights, recency half-life, repetition across days, exposure damping ------------------------
{
  const base = {kind: 'note', word: 'a', counts: {note: 1}, days: ['2026-11-08'], first: '2026-11-08', last: '2026-11-08', exposures: 0, seenSinceLookup: 0};
  const today = '2026-11-08';
  assert.equal(itemScore(base, today), 1);
  assert.equal(itemScore({...base, counts: {detail: 1}}, today), 3, 'a follow-up weighs more than a tap');
  assert.equal(itemScore({...base, last: '2026-10-25'}, today), 0.5, `halves after ${HALF_LIFE_DAYS} days`);
  assert.equal(itemScore({...base, days: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-05']}, today), 3, 'repetition across days: 1 + log2(4)');
  assert.equal(itemScore({...base, seenSinceLookup: 4}, today), 0.5, 'seen 4 times since the lookup halves the score');
  const signals = {version: 1, languages: {de: {items: {
    old: {...base, word: 'old', last: '2026-09-01'},
    fresh: {...base, word: 'fresh', counts: {explain: 1}},
    repeated: {...base, word: 'repeated', days: ['2026-11-01', '2026-11-04', '2026-11-08']}
  }}}};
  assert.deepEqual(rankItems(signals, 'de', today).map(item => item.word), ['repeated', 'fresh', 'old']);
  assert.equal(rankItems(signals, 'de', today, 1).length, 1);
  assert.deepEqual(rankItems(signals, 'ru', today), []);
}

// --- Exposure: once per paragraph per day, increments seen counts, resets on new lookup --------------------
{
  const h = harness();
  h.tracker.record(note());
  h.tracker.record({language: 'de', kind: 'selection', word: 'auf jeden Fall', action: 'explain'});
  const paragraph = {language: 'de', storyId: 's1', versionId: 'v1', paragraphIndex: 0, text: 'Auf jeden Fall kauft sie Brot, auf jeden Fall.', words: 9, notes: [{word: 'kaufen', meaning: 'buy', count: 1}, {word: 'Brot', meaning: 'bread', count: 1}]};
  assert.equal(h.tracker.recordExposure(paragraph), true);
  assert.equal(h.tracker.recordExposure(paragraph), false, 'same paragraph, same day counts once');
  let items = h.stored().languages.de.items;
  assert.equal(items[itemKey('kaufen')].exposures, 1);
  assert.equal(items['auf jeden fall'].exposures, 2, 'selection matched case-insensitively, every occurrence');
  assert.equal(items[itemKey('Brot')], undefined, 'untracked notes are not created by exposure');
  assert.deepEqual(h.stored().languages.de.reading, {'2026-11-08': {words: 9, paragraphs: 1}});
  h.clock.wall += DAY;
  assert.equal(h.tracker.recordExposure(paragraph), true, 'a later day counts again');
  items = h.stored().languages.de.items;
  assert.equal(items[itemKey('kaufen')].seenSinceLookup, 2);
  assert.equal(items[itemKey('kaufen')].lastExposure, '2026-11-09');
  h.tracker.record(note());
  assert.equal(h.stored().languages.de.items[itemKey('kaufen')].seenSinceLookup, 0, 'a new lookup resets seen-since-lookup');
  assert.equal(h.stored().languages.de.items[itemKey('kaufen')].exposures, 2, 'total exposures are kept');
}

// --- Reading the chapter a word was looked up in that day is exposure, not an encounter since the lookup ------
{
  const h = harness();
  h.tracker.record(note({where: 's1/v1'}));
  const paragraph = {language: 'de', storyId: 's1', versionId: 'v1', paragraphIndex: 0, text: 'Sie kauft Brot.', words: 3, notes: [{word: 'kaufen', meaning: 'buy', count: 1}]};
  h.tracker.recordExposure(paragraph);
  let item = h.tracker.data.languages.de.items[itemKey('kaufen')];
  assert.equal(item.exposures, 1); assert.equal(item.seenSinceLookup, 0);
  h.tracker.recordExposure({...paragraph, versionId: 'v2'});
  item = h.tracker.data.languages.de.items[itemKey('kaufen')];
  assert.equal(item.seenSinceLookup, 1, 'another chapter the same day is a later encounter');
}

// --- Optional store: unreadable file blocks saving, is never overwritten, retry merges -------------------
{
  const original = '{"version":1,"languages":{"de":{"items":{"broken":true}}}}';
  const files = new Map([[SIGNALS_PATH, original]]);
  let writes = 0;
  const storage = createWorkspaceStorage({read: name => files.get(name) ?? '', write: (name, value) => { writes++; files.set(name, JSON.stringify(value)); return true; }, exists: name => files.has(name)});
  assert.equal(optionalStore(SIGNALS_PATH), true);
  const tracker = createSignalsTracker({clock: {now: () => Date.UTC(2026, 10, 8)}, calendar, persistence: {load: () => storage.load(SIGNALS_PATH), save: value => storage.save(SIGNALS_PATH, value)}});
  assert.equal(tracker.status.blocked, true);
  tracker.record(note());
  assert.equal(writes, 0); assert.equal(files.get(SIGNALS_PATH), original, 'corrupt bytes are preserved');
  assert.equal(tracker.clearLanguage('de'), false, 'cannot clear while unreadable');
  assert.equal(tracker.retryLoad(), false, 'still unreadable');
  files.set(SIGNALS_PATH, JSON.stringify({version: 1, languages: {de: {items: {[itemKey('kaufen')]: {kind: 'note', word: 'kaufen', meaning: 'buy', counts: {note: 2}, days: ['2026-11-01'], first: '2026-11-01', last: '2026-11-01'}}}}}));
  assert.equal(tracker.retryLoad(), true);
  const merged = JSON.parse(files.get(SIGNALS_PATH)).languages.de.items[itemKey('kaufen')];
  assert.deepEqual(merged.counts, {note: 3}, 'counts gathered while unreadable are merged once');
  assert.deepEqual(merged.days, ['2026-11-01', '2026-11-08']);
  assert.equal(merged.last, '2026-11-08');
}

// --- Write failure keeps counts in memory; clearing removes one language only -----------------------------
{
  const h = harness();
  h.disk.fail = true;
  h.tracker.record(note());
  assert.equal(h.tracker.status.saveError.code, 'write_failed');
  h.disk.fail = false;
  assert.equal(h.tracker.retrySave(), true);
  h.tracker.record({language: 'ru', kind: 'selection', word: 'в руках', action: 'translate'});
  assert.equal(h.tracker.clearLanguage('de'), true);
  assert.deepEqual(Object.keys(h.stored().languages), ['ru']);
}

// --- Validation and merge helpers -----------------------------------------------------------------------
{
  assert.ok(validSignals(emptySignals()));
  assert.equal(validSignals({version: 2, languages: {}}), false);
  assert.equal(validSignals({version: 1, languages: {de: {items: {x: {kind: 'note', word: 'a', counts: {note: -1}, days: []}}}}}), false);
  assert.equal(validSignals({version: 1, languages: {de: {reading: {'2026-13-01': {words: 1, paragraphs: 1}}}}}), false);
  const target = {version: 1, languages: {de: {reading: {'2026-11-08': {words: 5, paragraphs: 1}}}}};
  mergeSignals(target, {version: 1, languages: {de: {reading: {'2026-11-08': {words: 3, paragraphs: 1}}}}});
  assert.deepEqual(target.languages.de.reading['2026-11-08'], {words: 8, paragraphs: 2});
  // The shipped seed is empty: learner history is never committed or packaged.
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../data/learning-signals.json', import.meta.url), 'utf8')), emptySignals());
}

// --- Story deletion does not touch signals: the tracker never reads stories ------------------------------
{
  const source = fs.readFileSync(new URL('../js/consultation-signals.js', import.meta.url), 'utf8');
  assert.equal(/stories\.json/.test(source), false);
}

console.log('PASS consultation signals: recording, ranking, exposure, optional-store safety');
