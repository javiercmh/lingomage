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

export function findGlossaryMatches(canonical, glossary = []) {
  const candidates = [];
  const wordCharacter = value => Boolean(value && /[\p{L}\p{N}\p{M}_]/u.test(value));
  for (const note of glossary) {
    for (const form of Array.isArray(note?.forms) ? note.forms : []) {
      if (typeof form !== 'string' || !form.length || !note?.meaning) continue;
      const usesJapaneseScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(form);
      let from = 0;
      while (from <= canonical.length - form.length) {
        const start = canonical.indexOf(form, from);
        if (start < 0) break;
        const end = start + form.length;
        const bounded = usesJapaneseScript || (!wordCharacter(form[0]) || !wordCharacter(canonical[start - 1])) && (!wordCharacter(form[form.length - 1]) || !wordCharacter(canonical[end]));
        if (bounded) candidates.push({ start, end, form, note });
        from = start + 1;
      }
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const chosen = [];
  for (const candidate of candidates) {
    const identical = chosen.find(item => item.start === candidate.start && item.end === candidate.end);
    if (identical) {
      if (!identical.notes.some(note => note.word === candidate.note.word && note.meaning === candidate.note.meaning)) identical.notes.push(candidate.note);
      continue;
    }
    if (chosen.some(item => candidate.start < item.end && candidate.end > item.start)) continue;
    chosen.push({ start: candidate.start, end: candidate.end, form: candidate.form, notes: [candidate.note] });
  }
  return chosen.sort((a, b) => a.start - b.start);
}

export function annotatedText(container, canonical, segments, { glossary = [], language = '', onNote = () => {} } = {}) {
  container.textContent = '';
  container.lang = language;
  const valid = Array.isArray(segments) && segments.every(part => part && typeof part.text === 'string') && segments.map(part => part.text).join('') === canonical;
  const parts = language.startsWith('ja') ? japaneseSegments(canonical, segments) : valid ? segments : [{ text: canonical }];
  const matches = findGlossaryMatches(canonical, glossary);
  let offset = 0;
  const triggerFor = (match, start, end) => {
    const trigger = document.createElement('span');
    trigger.className = 'gloss-note-trigger'; trigger.lang = language; trigger.setAttribute('role', 'button'); trigger.tabIndex = 0;
    trigger.setAttribute('aria-label', `Word note for ${canonical.slice(match.start, match.end)}`);
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.textContent = canonical.slice(start, end);
    trigger.addEventListener('click', event => onNote(event, trigger, match.notes));
    trigger.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); onNote(event, trigger, match.notes);
    });
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
