import { glossaryRanges, resolveGlossaryForms, stripRussianStress, withRussianStress } from './reader-text.js';

export const SAFEGUARD_VERSION = '2026-10-14.1';
// A generous transport/storage bound, independent of note count and reading level.
export const MAX_CONTENT_UNITS = 1000000;
export function validateContentSize(value) {
  if (JSON.stringify(value).length > MAX_CONTENT_UNITS) invalid('The response exceeds the technical size limit of 1000000 UTF-16 units.');
}
export function parseContent(raw) {
  if (String(raw).length > MAX_CONTENT_UNITS) invalid('The response exceeds the technical size limit of 1000000 UTF-16 units.');
  try { return JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw Object.assign(new Error('The response was not valid JSON. Explicitly retry or discard this request.'), { code: 'invalid_json' }); }
}
function invalid(message) { throw new Error(`${message} Explicitly retry or discard this request.`); }
export function boundedText(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${field} must be nonblank text of at most ${max} characters.`);
}
export function validateScript(text, language) {
  const allowed = language === 'ja' ? /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u : /\p{Script=Cyrillic}/u;
  if (['ja', 'ru'].includes(language) && [...text].some(c => /\p{L}/u.test(c) && !allowed.test(c))) invalid(`${language === 'ja' ? 'Japanese' : 'Russian'} text must use its target script without Latin transliteration.`);
}
export function wordCount(text) { return (text.match(/[\p{L}\p{M}]+(?:['’–-][\p{L}\p{M}]+)*/gu) || []).length; }
export function sentenceCount(text) { return (text.match(/[。！？!?]+/gu) || []).length; }
export function validateProse(value, language) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('The response must be a story object.');
  boundedText(value.title, 500, 'Title'); boundedText(value.story, 30000, 'Chapter');
  validateScript(value.title, language); validateScript(value.story, language);
  return {title:value.title, story:value.story};
}
// Zero-based positions, in the unmarked text, of vowels followed by a combining acute.
function russianStressPositions(accented) {
  const letters = Array.from(stripRussianStress(accented)), stress = [];
  let position = -1;
  for (const letter of accented.normalize('NFC')) {
    if (letter === '\u0301') {
      if (/[аеёиоуыэюя]/iu.test(letters[position] || '') && stress.at(-1) !== position) stress.push(position);
    } else position++;
  }
  return stress;
}
// requireNotes: false for one part of a split notes request; the merged glossary still needs a note.
export function validateNotes(value, prose, language, { requireNotes = true } = {}) {
  const canonical = validateProse(prose, language);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'glossary')) invalid('Vocabulary notes must contain only a glossary, without rewriting the chapter.');
  validateContentSize({...canonical,...value});
  if (!Array.isArray(value.glossary) || (requireNotes && value.glossary.length < 1)) invalid('The chapter needs at least one useful learning note.');
  // Notes are repaired, never trusted: only forms found in the chapter survive, and a note
  // with no attested form is dropped instead of failing a chapter whose prose is already saved.
  const glossary=[], resolved=new Map();
  const resolve=form=>{ if(!resolved.has(form)) resolved.set(form,resolveGlossaryForms(canonical.story,form)); return resolved.get(form); };
  const article=new Set(({de:'der die das den dem des ein eine einen einem einer eines',es:'el la los las un una unos unas'})[String(language).split('-')[0]]?.split(' ')||[]);
  for (const note of value.glossary) {
    if (!note || typeof note !== 'object') invalid('A learning note is malformed.');
    boundedText(note.word, 500, 'Note headword'); boundedText(note.meaning, 4000, 'English explanation');
    validateScript(note.word, language);
    const russian = language === 'ru';
    const word = russian ? stripRussianStress(note.word) : note.word;
    if (russian && !word.trim()) continue;
    if (!/[A-Za-z]/.test(note.meaning)) invalid('A learning note needs an English explanation.');
    if (!Array.isArray(note.forms) || !note.forms.length || note.forms.length > 20) invalid('Each learning note needs 1–20 exact chapter forms.');
    for (const form of note.forms) { boundedText(form, 500, 'Note form'); validateScript(form, language); }
    let forms=[...new Set(note.forms.flatMap(form => {
      const exact = resolve(form);
      return exact.length || !russian ? exact : resolve(stripRussianStress(form));
    }))];
    if (!forms.length) { // Common model slip: only an inflection absent from the chapter. Accept the headword if the chapter itself contains it.
      const words=word.trim().split(/\s+/u), bare=words.length>1&&article.has(words[0].toLowerCase())?words.slice(1).join(' '):word;
      forms=[...new Set([note.word,word,bare].flatMap(resolve))];
    }
    if (!forms.length) continue;
    const entry = {word, meaning:note.meaning, forms:forms.slice(0,20)};
    if (russian) {
      // Accept both fresh model headwords and saved notes being revalidated after a checkpoint.
      const stress = russianStressPositions(word === note.word ? withRussianStress(word, note.stress) : note.word);
      if (stress.length) entry.stress = stress;
      // Stress on the forms as they appear in the chapter: fresh model forms carry acute marks,
      // saved forms carry positions in formStress. The headword's stress covers a form identical to it.
      const marked = new Map(), saved = note.formStress && typeof note.formStress === 'object' && !Array.isArray(note.formStress) ? note.formStress : {};
      if (stress.length) marked.set(word.toLowerCase(), stress);
      for (const form of note.forms) {
        const positions = russianStressPositions(form);
        if (positions.length) marked.set(stripRussianStress(form).toLowerCase(), positions);
      }
      const formStress = {};
      for (const form of entry.forms) {
        const positions = marked.get(form.toLowerCase()) || russianStressPositions(withRussianStress(form, saved[form]));
        if (positions.length) formStress[form] = positions;
      }
      if (Object.keys(formStress).length) entry.formStress = formStress;
    }
    glossary.push(entry);
  }
  if (!glossary.length && requireNotes) invalid('None of the AI vocabulary notes matched words or phrases that appear in the chapter. The completed prose is preserved; the chapter is not ready yet.');
  // Model annotations are ignored: the app owns Japanese boundaries.
  return { ...canonical, glossary };
}
// Define (PED-002): one vocabulary note the learner asked for, on the selected text. It passes the same
// repair as chapter notes, and at least one of its forms must cover part of the selection, so the new
// underline lands where the learner selected. Saved with addedBy: 'learner' beside the chapter notes.
export function validateDefinedNote(value, prose, language, selection) {
  const { glossary } = validateNotes(value, prose, language, { requireNotes: false });
  // The anchor is the form occurrence at the selection: the smallest range covering it, else one overlapping it.
  let best = null;
  for (const note of glossary) for (const form of note.forms) for (const range of glossaryRanges(prose.story, form)) {
    if (!(range.start < selection.end && selection.start < range.end)) continue;
    const covering = range.start <= selection.start && range.end >= selection.end;
    const better = !best || covering && !best.covering || covering === best.covering && range.end - range.start < best.end - best.start;
    if (better) best = { note, start: range.start, end: range.end, covering };
  }
  if (!best) invalid('The vocabulary note did not match the selected text in the chapter.');
  return { ...best.note, addedBy: 'learner', at: { start: best.start, end: best.end } };
}
// Splitting notes into parts (PED-002): consecutive paragraphs are grouped into parts of about targetUnits
// UTF-16 units (never below minUnits), at most maxParts of them, so a short chapter stays one request and a
// long one gets more parts of similar size instead of three ever-larger ones. Offsets are canonical.
export const MIN_NOTE_PART_UNITS = 600;
// Part size that worked in the 2026-11-26 density comparison (C1 scenes in three parts of about 1,200 units),
// rounded down so a part stays well above the ~300-unit parts that added errors on 2026-11-25.
export const NOTE_PART_TARGET_UNITS = 1000;
export const NOTE_PART_TARGET_UNITS_JA = 400;
// Requests per chapter at most; the pipeline runs at most config.parallelLimit of them at once.
export const MAX_NOTE_PARTS = 8;
// Japanese packs far more text per UTF-16 unit; at 600 most Japanese chapters never split (2026-11-25 comparison).
export const MIN_NOTE_PART_UNITS_JA = 250;
export const noteMinUnits = language => language === 'ja' ? MIN_NOTE_PART_UNITS_JA : MIN_NOTE_PART_UNITS;
export const noteTargetUnits = language => language === 'ja' ? NOTE_PART_TARGET_UNITS_JA : NOTE_PART_TARGET_UNITS;
// Japanese readings split the same way when a chapter opens early (same lead paragraph), in larger blocks: a
// readings request is quicker than a notes request, so fewer parts are needed for the rest of the chapter.
export const READING_PART_TARGET_UNITS = 1200;
export const MAX_READING_PARTS = 4;
// lead: the first part is only the opening paragraph (joined with the next ones while under half of minUnits), so
// the reader can open the chapter once that short part has its notes; the rest is split as usual.
export function notesParts(story, maxParts = 1, minUnits = MIN_NOTE_PART_UNITS, targetUnits = 0, { lead = false } = {}) {
  const text = String(story || ''), paragraphs = [];
  for (const match of text.matchAll(/[^\n]*\S[^\n]*/g)) paragraphs.push({ start: match.index, end: match.index + match[0].length });
  const limit = Math.max(1, Math.floor(maxParts) || 1);
  const parts = [];
  if (lead && limit > 1 && paragraphs.length > 1) {
    const first = { ...paragraphs[0] };
    while (paragraphs.length > 1 && first.end - first.start < minUnits / 2) first.end = paragraphs.splice(1, 1)[0].end;
    paragraphs.shift();
    if (paragraphs.length) parts.push(first); else paragraphs.push(first);
  }
  // Without a target size (older callers), parts are the text divided evenly by maxParts.
  const rest = parts.length ? text.length - parts[0].end : text.length, restLimit = limit - parts.length;
  const target = Math.max(minUnits, targetUnits || 0, Math.ceil(rest / restLimit));
  const leadCount = parts.length;
  for (const paragraph of paragraphs) {
    const last = parts.length > leadCount ? parts.at(-1) : null;
    if (last && (last.end - last.start < target || parts.length >= limit)) last.end = paragraph.end;
    else parts.push({ ...paragraph });
  }
  // A short tail joins the previous part (the lead too) instead of becoming a request of its own.
  if (parts.length > 1 && parts.at(-1).end - parts.at(-1).start < minUnits / 2) { const tail = parts.pop(); parts.at(-1).end = tail.end; }
  return parts.length > 1 ? parts.map(part => ({ ...part, text: text.slice(part.start, part.end) })) : [];
}
// Merges validated part glossaries in chapter order. Identical notes (same headword and explanation) from
// two parts become one with both parts' forms; different explanations of one headword stay separate notes.
export function mergeNoteParts(parts) {
  const merged = [], seen = new Map();
  for (const part of parts) for (const note of part.glossary || []) {
    const key = `${note.word.trim().toLowerCase()}\u0000${note.meaning.trim().toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing) { const copy = { ...note, forms: [...note.forms] }; seen.set(key, copy); merged.push(copy); continue; }
    for (const form of note.forms) if (!existing.forms.includes(form) && existing.forms.length < 20) existing.forms.push(form);
    if (note.formStress) existing.formStress = { ...note.formStress, ...existing.formStress };
  }
  return merged;
}
export function validateStory(value, language, unusedLegacyLength) {
  return validateNotes({glossary:value?.glossary}, validateProse(value, language), language);
}

export function validateExamples(value, language) {
  if (!value || !Array.isArray(value.examples) || value.examples.length !== 3) invalid('The response needs exactly three examples.');
  return { examples: value.examples.map(example => {
    boundedText(example?.sentence, 2000, 'Example'); boundedText(example.translation, 4000, 'English translation');
    validateScript(example.sentence, language);
    const {highlightStart:start, highlightEnd:end} = example;
    const splitsPair = offset => offset > 0 && offset < example.sentence.length && /[\uD800-\uDBFF]/.test(example.sentence[offset-1]) && /[\uDC00-\uDFFF]/.test(example.sentence[offset]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > example.sentence.length || splitsPair(start) || splitsPair(end)) invalid('An example highlight does not identify a complete source range.');
    return {sentence:example.sentence, translation:example.translation, highlightStart:start, highlightEnd:end};
  }) };
}
export function readingPlan(content, kind = 'story') {
  const sections = kind === 'examples' ? content.examples.map((e,i) => ({section:`example-${i}`, text:e.sentence})) : [{section:'title',text:content.title},{section:'story',text:content.story}];
  const spans = [];
  for (const source of sections) for (const match of source.text.matchAll(/\p{Script=Han}+/gu)) {
    if (match[0].length > 200) invalid('A kanji compound exceeds the technical reading limit.');
    spans.push({id:spans.length, section:source.section, text:match[0], start:match.index, end:match.index+match[0].length, context:source.text.slice(Math.max(0,match.index-100),match.index+match[0].length+100)});
  }
  return {sections, spans};
}
// Validates a readings reply that must cover exactly `spans` (all of the plan, or one part's). Returns id → kana.
export function validateReadings(plan, response, spans = plan.spans) {
  if (!response || Object.keys(response).some(key => key !== 'readings') || !Array.isArray(response.readings) || response.readings.length !== spans.length) invalid('Readings must cover exactly the requested kanji IDs without rewriting text.');
  const allowed = new Set(spans.map(span => span.id)), readings = new Map();
  for (const item of response.readings) {
    if (!item || Object.keys(item).some(key => !['id','reading'].includes(key)) || !Number.isInteger(item.id) || !allowed.has(item.id) || !plan.spans[item.id] || readings.has(item.id)) invalid('A reading ID is missing, duplicated or unknown.');
    const reading = typeof item.reading === 'string' ? item.reading.trim().normalize('NFC') : '';
    if (!reading || reading.length > 600 || !/^[\p{Script=Hiragana}\p{Script=Katakana}\u3099\u309Aー]+$/u.test(reading)) invalid('A kanji reading must contain kana only.');
    readings.set(item.id, reading);
  }
  return readings;
}
// Kanji spans one readings part covers: the title's in the first part, and the story's that start in its range
// (up to the next part's start, so nothing between parts is lost).
export function readingSpansFor(plan, parts, index) {
  const start = index === 0 ? 0 : parts[index].start, end = index + 1 < parts.length ? parts[index + 1].start : Infinity;
  return plan.spans.filter(span => span.section === 'title' ? index === 0 : span.start >= start && span.start < end);
}
export function attachReadings(content, plan, response, kind = 'story') {
  return attachReadingMap(content, plan, validateReadings(plan, response), kind);
}
// Segments from validated readings. Spans without a reading yet (parts still running) stay plain text.
export function attachReadingMap(content, plan, readings, kind = 'story') {
  const result = JSON.parse(JSON.stringify(content));
  for (const source of plan.sections) {
    const segments = []; let cursor = 0;
    for (const span of plan.spans.filter(s => s.section === source.section)) {
      if (span.start > cursor) segments.push({text:source.text.slice(cursor,span.start)});
      const reading = readings.get(span.id);
      segments.push(reading ? {text:source.text.slice(span.start,span.end),reading} : {text:source.text.slice(span.start,span.end)}); cursor=span.end;
    }
    if (cursor < source.text.length) segments.push({text:source.text.slice(cursor)});
    if (segments.map(p=>p.text).join('') !== source.text) invalid('Reading boundaries do not match canonical text.');
    if (kind === 'examples') result.examples[Number(source.section.slice(8))].segments=segments;
    else result[`${source.section}Segments`]=segments;
  }
  return result;
}
