// Align model-provided readings with app-extracted kanji runs. Never guess an
// ambiguous pronunciation; display fallback preserves legacy annotation data.
export function japaneseSegments(canonical, segments, strict = false) {
  const fail = () => { throw new Error('Japanese readings could not be aligned. Generate again to explicitly retry.'); };
  const valid = Array.isArray(segments) && segments.every(p => p && typeof p.text === 'string' && (p.reading == null || typeof p.reading === 'string')) && segments.map(p => p.text).join('') === canonical;
  if (!valid) { if (strict) fail(); return [{ text: canonical }]; }
  const han = text => /\p{Script=Han}/u.test(text);
  const fold = text => text.normalize('NFC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const kana = text => /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(text);
  return segments.flatMap(segment => {
    const reading = typeof segment.reading === 'string' ? segment.reading.trim() : '';
    if (!han(segment.text)) return [{ text: segment.text }];
    if (!reading || segment.text.length > 1000 || reading.length > 2000) { if (strict) fail(); return [segment]; }
    const runs = segment.text.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu);
    const memo = new Map();
    const visit = (index, cursor) => {
      if (index === runs.length) return cursor === reading.length ? [[]] : [];
      const key = `${index}:${cursor}`; if (memo.has(key)) return memo.get(key);
      const run = runs[index], solutions = [];
      if (!han(run)) {
        // Kana, punctuation and spaces are fixed anchors, never ruby bases.
        if (fold(reading.slice(cursor, cursor + run.length)) === fold(run)) {
          for (const tail of visit(index + 1, cursor + run.length)) solutions.push([{ text: run }, ...tail]);
        }
        // Models sometimes omit punctuation/whitespace from the reading.
        if (/^[\p{P}\p{Z}\s]+$/u.test(run)) {
          for (const tail of visit(index + 1, cursor)) solutions.push([{ text: run }, ...tail]);
        }
      } else {
        for (let end = cursor + 1; end <= reading.length; end++) {
          const part = reading.slice(cursor, end); if (!kana(part)) break;
          for (const tail of visit(index + 1, end)) solutions.push([{ text: run, reading: part }, ...tail]);
          if (solutions.length > 1) break;
        }
      }
      memo.set(key, solutions.slice(0, 2)); return memo.get(key);
    };
    const aligned = visit(0, 0);
    if (aligned.length === 1) return aligned[0];
    if (strict) fail();
    return [segment];
  });
}

function glossaryRanges(canonical, form, firstOnly = false) {
  const ranges=[];
  const wordCharacter = value => Boolean(value && /[\p{L}\p{N}\p{M}_]/u.test(value));
  const usesJapaneseScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(form);
  let from=0;
  while (from <= canonical.length-form.length) {
    const start=canonical.indexOf(form,from);if(start<0)break;
    const end=start+form.length;
    if (usesJapaneseScript || (!wordCharacter(form[0]) || !wordCharacter(canonical[start-1])) && (!wordCharacter(form[form.length-1]) || !wordCharacter(canonical[end]))) {
      ranges.push({start,end});if(firstOnly)break;
    }
    from=start+1;
  }
  return ranges;
}
export function hasGlossaryForm(canonical, form) {
  return typeof form === 'string' && form.length>0 && glossaryRanges(canonical,form,true).length>0;
}
// Tolerant lookup used only to repair model-listed note forms. It returns exact
// chapter text, so reader matching and storage keep using literal substrings.
const FOLD_PUNCTUATION = [[/[\u2018\u2019\u201A\u201B\u2032\u02BC]/u, "'"], [/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2039\u203A]/u, '"'], [/[\u2010-\u2015\u2212]/u, '-'], [/[\s\u00A0]/u, ' ']];
function foldUnit(unit) {
  let value = unit.normalize('NFC').toLowerCase().replace(/ё/gu, 'е');
  for (const [pattern, replacement] of FOLD_PUNCTUATION) if (pattern.test(value)) return replacement;
  return value;
}
function foldedUnits(text) {
  const units = [];
  for (const match of text.matchAll(/[\s\S][\p{M}]*/gu)) {
    const key = foldUnit(match[0]);
    if (key === ' ' && units.length && units[units.length - 1].key === ' ') { units[units.length - 1].end = match.index + match[0].length; continue; }
    units.push({key, start: match.index, end: match.index + match[0].length});
  }
  return units;
}
let foldedCache = {text: null, units: []};
function tolerantRange(canonical, form) {
  const wanted = foldedUnits(form.trim().replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')).map(unit => unit.key);
  if (!wanted.length) return null;
  if (foldedCache.text !== canonical) foldedCache = {text: canonical, units: foldedUnits(canonical)};
  const units = foldedCache.units;
  const wordCharacter = value => Boolean(value && /[\p{L}\p{N}\p{M}_]/u.test(value));
  const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(form);
  for (let i = 0; i + wanted.length <= units.length; i++) {
    if (units[i].key !== wanted[0]) continue;
    let ok = true;
    for (let j = 1; j < wanted.length && ok; j++) ok = units[i + j].key === wanted[j];
    if (!ok) continue;
    const start = units[i].start, end = units[i + wanted.length - 1].end;
    if (japanese || (!wordCharacter(canonical[start]) || !wordCharacter(canonical[start - 1])) && (!wordCharacter(canonical[end - 1]) || !wordCharacter(canonical[end]))) return {start, end};
  }
  return null;
}
// Map one model-listed form to exact chapter text. A discontinuous form such as
// "winkte ... herüber" becomes its separately attested parts. Returns [] when
// the chapter does not contain it, so callers drop it rather than invent evidence.
export function resolveGlossaryForms(canonical, form) {
  if (typeof form !== 'string' || !form.trim()) return [];
  if (hasGlossaryForm(canonical, form)) return [form];
  const whole = tolerantRange(canonical, form);
  if (whole) return [canonical.slice(whole.start, whole.end)];
  const parts = form.split(/\s*(?:\.{2,}|\u2026)\s*/u).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return [];
  const resolved = parts.map(part => hasGlossaryForm(canonical, part) ? part : (() => { const range = tolerantRange(canonical, part); return range ? canonical.slice(range.start, range.end) : null; })());
  return resolved.every(Boolean) ? [...new Set(resolved)] : [];
}
export function findGlossaryMatches(canonical, glossary = []) {
  // Group repeated forms before scanning. Process one length at a time so a
  // larger glossary does not allocate every candidate across every length.
  const forms=new Map();
  for (const note of glossary) for (const form of Array.isArray(note?.forms) ? note.forms : []) {
    if (typeof form !== 'string' || !form.length || !note?.meaning) continue;
    if(!forms.has(form))forms.set(form,{form,notes:[],identities:new Map()});
    const group=forms.get(form);
    if(!group.identities.has(note.word))group.identities.set(note.word,new Set());
    const meanings=group.identities.get(note.word);
    if(!meanings.has(note.meaning)){meanings.add(note.meaning);group.notes.push(note);}
  }
  const lengths=new Map();
  for(const group of forms.values()){
    if(!lengths.has(group.form.length))lengths.set(group.form.length,[]);
    lengths.get(group.form.length).push(group);
  }
  const occupied=new Uint8Array(canonical.length),chosen=[];
  for(const length of [...lengths.keys()].sort((a,b)=>b-a)) {
    const candidates=[];
    for(const group of lengths.get(length))for(const range of glossaryRanges(canonical,group.form))candidates.push({...range,form:group.form,notes:group.notes});
    candidates.sort((a,b)=>a.start-b.start);
    for(const candidate of candidates){
      if(occupied.subarray(candidate.start,candidate.end).some(value=>value))continue;
      chosen.push(candidate);occupied.fill(1,candidate.start,candidate.end);
    }
  }
  return chosen.sort((a,b)=>a.start-b.start);
}

// PED-002: display each explanation once; validation still uses every occurrence.
export function firstGlossaryMatches(canonical, glossary = []) {
  const seen = new Set();
  const seenGroups = new WeakSet();
  const normalize = value => String(value || '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  return findGlossaryMatches(canonical, glossary).flatMap(match => {
    if (seenGroups.has(match.notes)) return [];
    seenGroups.add(match.notes);
    const notes = match.notes.filter(note => {
      const key = JSON.stringify([normalize(note.word || note.forms?.[0]), normalize(note.meaning)]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return notes.length ? [{ ...match, notes }] : [];
  });
}

export function annotatedText(container, canonical, segments, { glossary = [], language = '', onNote = () => {} } = {}) {
  container.textContent = '';
  container.lang = language;
  const valid = Array.isArray(segments) && segments.every(part => part && typeof part.text === 'string') && segments.map(part => part.text).join('') === canonical;
  const matches = firstGlossaryMatches(canonical, glossary);
  const controls = new Map();
  const parts = language.startsWith('ja') ? japaneseSegments(canonical, segments) : valid ? segments : [{ text: canonical }];
  let offset = 0;
  const triggerFor = (match, start, end) => {
    const trigger = document.createElement('span');
    trigger.className = 'gloss-note-trigger'; trigger.lang = language;
    trigger.textContent = canonical.slice(start, end);
    if (!controls.has(match)) {
      controls.set(match, trigger);
      trigger.setAttribute('role', 'button'); trigger.tabIndex = 0;
      trigger.setAttribute('aria-label', `Word note for ${canonical.slice(match.start, match.end)}`);
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); onNote(event, trigger, match.notes);
      });
    }
    trigger.addEventListener('click', event => onNote(event, controls.get(match), match.notes));
    return trigger;
  };
  for (const part of parts) {
    const partStart = offset, partEnd = offset + part.text.length;
    const target = part.reading ? document.createElement('ruby') : container;
    let cursor = partStart;
    for (const match of matches) {
      const start = Math.max(partStart, match.start), end = Math.min(partEnd, match.end);
      if (end <= start) continue;
      if (start > cursor) target.append(document.createTextNode(canonical.slice(cursor, start)));
      target.append(triggerFor(match, start, end)); cursor = end;
    }
    if (cursor < partEnd) target.append(document.createTextNode(canonical.slice(cursor, partEnd)));
    if (part.reading) {
      const reading = document.createElement('rt'); reading.textContent = part.reading; target.append(reading); container.append(target);
    }
    offset = partEnd;
  }
  container.addEventListener('copy', event => {
    const selection = getCanonicalSelection(container);
    if (!selection) return;
    event.clipboardData?.setData('text/plain', selection.text); event.preventDefault();
  });
}

export function selectCanonicalText(root) {
  const selection = window.getSelection(), range = document.createRange();
  range.selectNodeContents(root); selection.removeAllRanges(); selection.addRange(range);
}

export function getCanonicalSelection(root) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const offsetFor = (node, offset) => {
    const reading = node.nodeType === Node.ELEMENT_NODE ? node.closest('rt') : node.parentElement?.closest('rt');
    if (reading) { node = reading; offset = 0; }
    if (node.nodeType !== Node.TEXT_NODE && (offset < 0 || offset > node.childNodes.length)) return null;
    let total = 0, found = false;
    const count = current => {
      if (current.nodeType === Node.ELEMENT_NODE && current.matches('rt')) return;
      if (current.nodeType === Node.TEXT_NODE) total += current.nodeValue.length;
      else for (const child of current.childNodes) count(child);
    };
    const visit = current => {
      if (found) return;
      if (current === node) {
        if (current.nodeType === Node.TEXT_NODE) total += offset;
        else for (const child of [...current.childNodes].slice(0, offset)) count(child);
        found = true; return;
      }
      if (current.nodeType === Node.ELEMENT_NODE && current.matches('rt')) return;
      if (current.nodeType === Node.TEXT_NODE) total += current.nodeValue.length;
      else for (const child of current.childNodes) visit(child);
    };
    visit(root); return found ? total : null;
  };
  const start = offsetFor(range.startContainer, range.startOffset), end = offsetFor(range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) { return node.parentElement?.closest('rt') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
  let canonical = '', node;
  while ((node = walker.nextNode())) canonical += node.nodeValue;
  return { start, end, text: canonical.slice(start, end), rootText: root.textContent };
}
