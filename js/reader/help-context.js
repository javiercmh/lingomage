// Pure help-context helpers and safe text/highlight rendering for reader explanation cards. PED-002.
import { getCanonicalSelection, japaneseSegments } from './reader-text.js';

// PED-002: retain the exact fragment and locate it in canonical context.
export function helpContext(text, start, end) {
  const boundary = /[.!?。！？\n]/u;
  let left = start;
  while (left > 0 && !boundary.test(text[left - 1])) left--;
  let right = end;
  if (!boundary.test(text[end - 1] || '')) {
    while (right < text.length && !boundary.test(text[right])) right++;
    if (right < text.length) right++;
  }
  return { sentence: text.slice(left, right), selectionStart: start - left, selectionEnd: end - left };
}

export function validTextRange(text, start, end) {
  const boundary = offset => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length && boundary(start) && boundary(end);
}

export function resolvedHelpContext(source, passage, result) {
  const valid = validTextRange(source, result.contextStart, result.contextEnd) && result.contextStart <= passage.start && result.contextEnd >= passage.end;
  if (valid) return { contextStart: result.contextStart, contextEnd: result.contextEnd, contextTranslation: result.contextTranslation || '' };
  const fallback = helpContext(source, passage.start, passage.end);
  const start = passage.start - fallback.selectionStart;
  // A translation of an invalid excerpt need not match the fallback sentence.
  return { contextStart: start, contextEnd: start + fallback.sentence.length, contextTranslation: '' };
}

export function savedFollowUps(item) {
  return item.followUps || (item.more ? [{ ...(item.detailProvenance || {}), action: 'detail', text: item.more }] : []);
}

export function overlappingHelp(chapter, versionId, start, end) {
  return (chapter.help || []).filter(entry => entry.versionId === versionId && Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.start < end && start < entry.end);
}

export function renderHighlightedText(container, canonical, segments, highlightStart, highlightEnd, excerptStart = 0, excerptEnd = canonical.length, { hideFurigana = false } = {}) {
  container.textContent = '';
  container.classList.toggle('hide-furigana', hideFurigana);
  const parts = /\p{Script=Han}/u.test(canonical) ? japaneseSegments(canonical, segments) : Array.isArray(segments) && segments.every(part => part && typeof part.text === 'string') && segments.map(part => part.text).join('') === canonical ? segments : [{ text: canonical }];
  let offset = 0;
  for (const part of parts) {
    const partStart = offset; offset += part.text.length;
    const left = Math.max(excerptStart, partStart), right = Math.min(excerptEnd, offset);
    if (right <= left) continue;
    const target = part.reading && left === partStart && right === offset ? document.createElement('ruby') : container;
    const boundaries = [...new Set([left, right, Math.max(left, Math.min(right, highlightStart)), Math.max(left, Math.min(right, highlightEnd))])].sort((a, b) => a - b);
    for (let index = 0; index < boundaries.length - 1; index++) {
      const start = boundaries[index], end = boundaries[index + 1];
      const text = canonical.slice(start, end);
      if (start >= highlightStart && end <= highlightEnd) {
        const mark = document.createElement('mark'); mark.className = 'help-highlight'; mark.textContent = text; target.append(mark);
      } else target.append(document.createTextNode(text));
    }
    if (target !== container) {
      const rt = document.createElement('rt'); rt.textContent = part.reading; target.append(rt); container.append(target);
    }
  }
  container.addEventListener('copy', event => {
    const selection = getCanonicalSelection(container); if (!selection) return;
    event.clipboardData?.setData('text/plain', selection.text); event.preventDefault();
  });
}

// Render a deliberately small formatting subset without interpreting HTML.
export function renderDetailText(container, text) {
  function inline(parent, value, emphasis = true) {
    const pattern = emphasis ? /(`[^`\n]+`|\*\*[^*\n]+(?:\*[^*\n]+\*)?[^*\n]*\*\*|\*[^*\n]+\*)/g : /(`[^`\n]+`)/g;
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      parent.append(document.createTextNode(value.slice(offset, match.index)));
      const token = match[0], code = token.startsWith('`'), bold = token.startsWith('**');
      const node = document.createElement(code ? 'code' : bold ? 'strong' : 'em');
      const content = token.slice(bold ? 2 : 1, bold ? -2 : -1);
      if (code) node.textContent = content;
      else inline(node, content, bold);
      parent.append(node); offset = match.index + token.length;
    }
    parent.append(document.createTextNode(value.slice(offset)));
  }
  for (const paragraph of String(text || '').split(/\r?\n[ \t]*\r?\n/)) {
    const node = document.createElement('p'); inline(node, paragraph); container.append(node);
  }
}
