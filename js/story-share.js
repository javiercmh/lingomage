// Canonical saved text only; presentation readings never enter shared text.
export function chapterShareText(story, chapter, version, {notes = false} = {}) {
  const parts = [version.title || story.title || '', version.story || ''];
  if (notes && version.glossary?.length) parts.push(`Vocabulary\n${version.glossary.map(note => `${note.word} — ${note.meaning}`).join('\n')}`);
  return parts.join('\n\n');
}
export function storyShareText(story, model, options = {}) {
  // The legacy model initializes paths; keep this pure for callers.
  const copy = JSON.parse(JSON.stringify(story));
  return [copy.title || '', ...model.pathChapters(copy).map((chapter, index) => {
    const version = model.activeVersion(chapter, copy);
    return `Chapter ${index + 1}: ${chapterShareText(copy, chapter, version, options)}`;
  })].join('\n\n');
}
export function slugify(title) {
  return String(title || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/g, '') || 'story';
}
export function storyExportFile(story, {appVersion, now = new Date()} = {}) {
  return {name: `${slugify(story.title)}.lingomage.json`, mimeType: 'application/json',
    content: JSON.stringify({format:'lingomage-story', formatVersion:1, appVersion, exportedAt:new Date(now).toISOString(), story:JSON.parse(JSON.stringify(story))}, null, 2)};
}
export async function deliverShare(payload, {share, clipboard, download, isNative = false}) {
  try {
    if (share?.available) { await (payload.content !== undefined ? share.file(payload) : share.text(payload)); return {launched:true}; }
    if (payload.content !== undefined && !isNative && download) { await download(payload); return {method:'downloaded'}; }
    if (clipboard) { await clipboard.writeText(payload.content ?? payload.text); return {method:'copied'}; }
    throw Object.assign(new Error('Sharing is unavailable.'), {code:'unavailable'});
  } catch (error) { if (error.code === 'cancelled') return {cancelled:true}; throw error; }
}
