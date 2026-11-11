// Models separate paragraphs with one line break or with blank lines. After the story text is built,
// each run of blank lines is wrapped in a short block (.paragraph-gap) so every story shows the same
// paragraph gap. The characters stay in the DOM, so canonical offsets, selection, copy and speech are
// unchanged. Only plain text directly in the container is touched, never ruby or note triggers.
const BLANK_LINES = /\n(?:[ \t]*\n)+/g;

export function markParagraphGaps(container) {
  for (const node of [...container.childNodes]) {
    if (node.nodeType !== 3) continue;
    const text = node.nodeValue, parts = [];
    let last = 0;
    for (const match of text.matchAll(BLANK_LINES)) {
      if (match.index > last) parts.push(document.createTextNode(text.slice(last, match.index)));
      const gap = document.createElement('span'); gap.className = 'paragraph-gap'; gap.append(document.createTextNode(match[0]));
      parts.push(gap); last = match.index + match[0].length;
    }
    if (!parts.length) continue;
    if (last < text.length) parts.push(document.createTextNode(text.slice(last)));
    node.replaceWith(...parts);
  }
}
