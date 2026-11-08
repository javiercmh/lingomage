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
  const item = h.stored().languages.de.items[itemKey('note', 'kaufen', 'buy')];
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
  assert.deepEqual(h.stored().languages.de.items[itemKey('note', 'kaufen', 'buy')].counts, {note: 2, listen: 1});
  // A different meaning of the same headword is a separate item.
  h.tracker.record(note({meaning: 'purchase'}));
  assert.equal(Object.keys(h.stored().languages.de.items).length, 2);
  // Contexts keep the three most recent distinct sentences.
  for (const sentence of ['A.', 'B.', 'C.', 'D.']) { h.clock.wall += DEDUPE_MS; h.tracker.record(note({sentence})); }
  assert.deepEqual(h.tracker.data.languages.de.items[itemKey('note', 'kaufen', 'buy')].contexts.map(c => c.sentence), ['D.', 'C.', 'B.']);
}

// --- Selections: normalized key, canonical text, title selections and invalid input are ignored ------------
{
  const h = harness();
  h.tracker.record({language: 'ja', kind: 'selection', word: '  食べて  いる ', action: 'explain', sentence: '猫が魚を食べている。'});
  h.tracker.record({language: 'ja', kind: 'selection', word: '食べて いる', action: 'detail'});
  const items = h.stored().languages.ja.items;
  assert.deepEqual(Object.keys(items), ['sel:食べて いる']);
  assert.equal(items['sel:食べて いる'].word, '食べて いる', 'stores canonical text without readings or extra spaces');
  assert.deepEqual(items['sel:食べて いる'].counts, {explain: 1, detail: 1});
  assert.equal(h.tracker.record({language: 'de', kind: 'selection', word: '   ', action: 'explain'}), false);
  assert.equal(h.tracker.record({language: 'de', kind: 'other', word: 'x', action: 'explain'}), false);
  assert.equal(h.tracker.record({language: 'de', kind: 'selection', word: 'x', action: 'Bad Action'}), false);
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
  assert.equal(items[itemKey('note', 'kaufen', 'buy')].exposures, 1);
  assert.equal(items['sel:auf jeden fall'].exposures, 2, 'selection matched case-insensitively, every occurrence');
  assert.equal(items[itemKey('note', 'Brot', 'bread')], undefined, 'untracked notes are not created by exposure');
  assert.deepEqual(h.stored().languages.de.reading, {'2026-11-08': {words: 9, paragraphs: 1}});
  h.clock.wall += DAY;
  assert.equal(h.tracker.recordExposure(paragraph), true, 'a later day counts again');
  items = h.stored().languages.de.items;
  assert.equal(items[itemKey('note', 'kaufen', 'buy')].seenSinceLookup, 2);
  assert.equal(items[itemKey('note', 'kaufen', 'buy')].lastExposure, '2026-11-09');
  h.tracker.record(note());
  assert.equal(h.stored().languages.de.items[itemKey('note', 'kaufen', 'buy')].seenSinceLookup, 0, 'a new lookup resets seen-since-lookup');
  assert.equal(h.stored().languages.de.items[itemKey('note', 'kaufen', 'buy')].exposures, 2, 'total exposures are kept');
}

// --- Reading the chapter a word was looked up in that day is exposure, not an encounter since the lookup ------
{
  const h = harness();
  h.tracker.record(note({where: 's1/v1'}));
  const paragraph = {language: 'de', storyId: 's1', versionId: 'v1', paragraphIndex: 0, text: 'Sie kauft Brot.', words: 3, notes: [{word: 'kaufen', meaning: 'buy', count: 1}]};
  h.tracker.recordExposure(paragraph);
  let item = h.tracker.data.languages.de.items[itemKey('note', 'kaufen', 'buy')];
  assert.equal(item.exposures, 1); assert.equal(item.seenSinceLookup, 0);
  h.tracker.recordExposure({...paragraph, versionId: 'v2'});
  item = h.tracker.data.languages.de.items[itemKey('note', 'kaufen', 'buy')];
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
  files.set(SIGNALS_PATH, JSON.stringify({version: 1, languages: {de: {items: {[itemKey('note', 'kaufen', 'buy')]: {kind: 'note', word: 'kaufen', meaning: 'buy', counts: {note: 2}, days: ['2026-11-01'], first: '2026-11-01', last: '2026-11-01'}}}}}));
  assert.equal(tracker.retryLoad(), true);
  const merged = JSON.parse(files.get(SIGNALS_PATH)).languages.de.items[itemKey('note', 'kaufen', 'buy')];
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
