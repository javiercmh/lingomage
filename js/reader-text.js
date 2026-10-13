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

// PED-002: display each explanation once; validation still uses every occurrence.
export function firstGlossaryMatches(canonical, glossary = []) {
  const seen = new Set();
  const normalize = value => String(value || '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  return findGlossaryMatches(canonical, glossary).flatMap(match => {
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
  const parts = valid ? segments : [{ text: canonical }];
  const matches = firstGlossaryMatches(canonical, glossary);
  const controls = new Map();
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
