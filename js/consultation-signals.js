import { localCalendar } from './usage-stats.js';
import { emptySignals } from './workspace-storage.js';

// Learning signals (PED-005). Records what the learner looked up and which tracked items they later met
// while reading, then ranks items for the "Most looked up" list. The file is written whole after each
// change; like usage history it is optional, and an unreadable file is never overwritten.
//
// Weights, half-life, damping and the dedupe window are product assumptions documented in PED-005.
export const ACTION_WEIGHTS = {detail:3, explain:2, examples:2, translate:1.5, note:1, listen:0.5};
export const ACTIONS = Object.keys(ACTION_WEIGHTS);
export const HALF_LIFE_DAYS = 14;
export const DAMPING_ENCOUNTERS = 4;
export const DEDUPE_MS = 2 * 60 * 1000;
export const CONTEXTS_KEPT = 3;
const MAX_WORD = 200, MAX_SENTENCE = 400;
const LANGUAGE_ID = /^[A-Za-z][A-Za-z0-9-]{0,15}$/;

const nfc = value => String(value ?? '').normalize('NFC');
const selectionText = value => nfc(value).trim().replace(/\s+/g, ' ');
export function itemKey(kind, word, meaning = '') {
  return kind === 'note' ? `note:${nfc(word).trim()}|${nfc(meaning).trim()}` :`sel:${selectionText(word).toLocaleLowerCase()}`;
}
const dayNumber = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const daysBetween = (from, to) => Math.max(0, dayNumber(to) - dayNumber(from));
const lookups = item => Object.values(item.counts).reduce((sum, value) => sum + value, 0);

export function itemScore(item, today) {
  const weighted = Object.entries(item.counts).reduce((sum, [action, value]) => sum + (ACTION_WEIGHTS[action] ?? 1) * value, 0);
  if (!weighted) return 0;
  const recency = item.last ? 0.5 ** (daysBetween(item.last, today) / HALF_LIFE_DAYS) : 1;
  const repetition = 1 + Math.log2(Math.max(1, item.days.length));
  const damping = 1 / (1 + (item.seenSinceLookup || 0) / DAMPING_ENCOUNTERS);
  return weighted * recency * repetition * damping;
}
export function rankItems(signals, language, today, limit = Infinity) {
  const items = signals?.languages?.[language]?.items || {};
  return Object.entries(items)
    .map(([key, item]) => ({key, ...item, lookups:lookups(item), score:itemScore(item, today)}))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.last || '').localeCompare(a.last || '') || a.word.localeCompare(b.word))
    .slice(0, limit);
}

// Non-overlapping occurrences of `needle` in `haystack` (both already normalized).
function occurrences(haystack, needle) {
  if (!needle) return 0;
  let total = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) total++;
  return total;
}

// Adds counts gathered while the file was unreadable into the repaired file's data.
export function mergeSignals(target, source) {
  for (const [code, from] of Object.entries(source.languages)) {
    const into = target.languages[code] ||= {};
    for (const [key, item] of Object.entries(from.items || {})) {
      const items = into.items ||= {};
      const old = items[key];
      if (!old) { items[key] = structuredClone(item); continue; }
      for (const [action, value] of Object.entries(item.counts)) old.counts[action] = (old.counts[action] || 0) + value;
      old.days = [...new Set([...old.days, ...item.days])].sort();
      old.first = [old.first, item.first].filter(Boolean).sort()[0];
      old.last = [old.last, item.last].filter(Boolean).sort().at(-1);
      old.lastExposure = [old.lastExposure, item.lastExposure].filter(Boolean).sort().at(-1);
      old.contexts = [...(item.contexts || []), ...(old.contexts || [])].slice(0, CONTEXTS_KEPT);
      old.exposures = (old.exposures || 0) + (item.exposures || 0);
      old.seenSinceLookup = item.seenSinceLookup ?? old.seenSinceLookup;
    }
    for (const [key, day] of Object.entries(from.reading || {})) {
      const reading = into.reading ||= {};
      const old = reading[key] ||= {words:0, paragraphs:0};
      old.words += day.words; old.paragraphs += day.paragraphs;
    }
    for (const [key, marks] of Object.entries(from.readMarks || {})) Object.assign((into.readMarks ||= {})[key] ||= {}, marks);
  }
  return target;
}

export function createSignalsTracker({clock = {now: () => Date.now()}, calendar = localCalendar, persistence, onStatus = () => {}}) {
  let data = emptySignals(), blocked = false, loadError = '', saveError = null, dirty = false;
  // In-memory only: where each item was last looked up, so reading the very chapter version the lookup came
  // from that day still counts as exposure but not as a later encounter since the lookup.
  const recent = new Map(), lookedUpIn = new Map();
  const status = () => ({blocked, loadError, saveError, dirty});
  const notify = () => onStatus(status());
  const today = () => calendar.dateKey(clock.now());
  function load() {
    const entry = persistence.load();
    if (entry.status === 'invalid') { blocked = true; loadError = entry.error || 'Lookup history could not be read.'; data = emptySignals(); }
    else { blocked = false; loadError = ''; data = structuredClone(entry.value); }
  }
  function save() {
    if (blocked || !dirty) return true;
    try { persistence.save(data); dirty = false; saveError = null; notify(); return true; }
    catch (error) { saveError = {message:error.message, code:error.code || 'write_failed'}; notify(); return false; }
  }
  const languageData = code => data.languages[code] ||= {};

  load();
  return {
    // Records one consultation after the learner's action. `kind` is 'note' (glossary note, keyed by
    // headword and meaning) or 'selection' (canonical selected text, without readings).
    record({language, kind, word, meaning = '', action, sentence = '', where = ''}) {
      if (!LANGUAGE_ID.test(language || '') || !['note', 'selection'].includes(kind) || !/^[a-z][a-z0-9-]{0,31}$/.test(action || '')) return false;
      const text = kind === 'note' ? nfc(word).trim() : selectionText(word);
      if (!text) return false;
      const key = itemKey(kind, text, meaning), now = clock.now(), tag = `${language}\u0000${key}\u0000${action}`;
      if (now - (recent.get(tag) ?? -Infinity) < DEDUPE_MS) return false;
      recent.set(tag, now);
      const date = today(), items = languageData(language).items ||= {};
      const item = items[key] ||= {kind, word:text.slice(0, MAX_WORD), ...(kind === 'note' ? {meaning:nfc(meaning)} : {}), counts:{}, days:[], first:date, last:date, contexts:[], exposures:0, seenSinceLookup:0};
      item.counts[action] = (item.counts[action] || 0) + 1;
      if (!item.days.includes(date)) item.days.push(date);
      item.last = date; item.seenSinceLookup = 0;
      lookedUpIn.set(`${language}\u0000${key}`, {where, date});
      const context = nfc(sentence).trim().slice(0, MAX_SENTENCE);
      if (context && item.contexts?.[0]?.sentence !== context) item.contexts = [{sentence:context, date}, ...(item.contexts || []).filter(old => old.sentence !== context)].slice(0, CONTEXTS_KEPT);
      dirty = true; save();
      return true;
    },
    // Records a paragraph the learner probably read. Counts once per paragraph, version and local day.
    // `notes` are glossary notes matched in the paragraph: [{word, meaning, count}].
    recordExposure({language, storyId, versionId, paragraphIndex, text, words, notes = []}) {
      if (!LANGUAGE_ID.test(language || '') || !storyId || !versionId || !Number.isInteger(paragraphIndex)) return false;
      const date = today(), lang = languageData(language), mark = `${storyId}/${versionId}`;
      const marks = (lang.readMarks ||= {})[mark] ||= {};
      if (marks[paragraphIndex] === date) return false;
      marks[paragraphIndex] = date;
      const day = (lang.reading ||= {})[date] ||= {words:0, paragraphs:0};
      day.words += Math.max(0, Math.round(words || 0)); day.paragraphs += 1;
      const items = lang.items || {}, paragraph = selectionText(text).toLocaleLowerCase();
      const seen = new Map();
      for (const note of notes) { const key = itemKey('note', note.word, note.meaning); if (items[key]) seen.set(key, (seen.get(key) || 0) + (note.count || 1)); }
      for (const [key, item] of Object.entries(items)) if (item.kind === 'selection') { const found = occurrences(paragraph, key.slice(4)); if (found) seen.set(key, found); }
      for (const [key, found] of seen) {
        const item = items[key];
        item.exposures = (item.exposures || 0) + found;
        const origin = lookedUpIn.get(`${language}\u0000${key}`);
        if (!(origin && origin.where === mark && origin.date === date)) item.seenSinceLookup = (item.seenSinceLookup || 0) + found;
        item.lastExposure = date;
      }
      dirty = true; save();
      return true;
    },
    ranked(language, limit) { return rankItems(data, language, today(), limit); },
    readingTotals(language) { return data.languages[language]?.reading || {}; },
    clearLanguage(language) {
      if (blocked || !data.languages[language]) return false;
      delete data.languages[language]; dirty = true;
      return save();
    },
    retrySave() { return save(); },
    retryLoad() {
      if (!blocked) return true;
      const counted = data;
      load();
      if (blocked) { data = counted; return false; }
      mergeSignals(data, counted);
      dirty = Object.keys(counted.languages).length > 0;
      notify(); save();
      return true;
    },
    get status() { return status(); },
    get data() { return data; },
    today
  };
}
