import { validStories } from './workspace-storage.js';
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
// Story-file import: the inverse of storyExportFile. Pure; the caller persists the returned copy through the
// normal stories save and keeps existing data untouched on any thrown error.
export const STORY_FILE_FORMAT = 'lingomage-story';
export const STORY_FILE_VERSION = 1;
export const STORY_IMPORT_MAX_BYTES = 16 * 1024 * 1024; // App² writeFile text limit
const importFault = (code, message) => Object.assign(new Error(message), {code, userMessage:message});
export function importStoryFile(text, {existingIds = [], normalizeChapters, newId = () => crypto.randomUUID(), now = new Date()} = {}) {
  if (typeof text !== 'string' || !text.trim()) throw importFault('invalid_file', 'This file is empty or is not a LingoMage story file.');
  let file;
  try { file = JSON.parse(text.replace(/^﻿/, '')); } catch { throw importFault('invalid_file', 'This file is not a LingoMage story file.'); }
  if (!file || typeof file !== 'object' || Array.isArray(file) || file.format !== STORY_FILE_FORMAT) throw importFault('invalid_file', 'This file is not a LingoMage story file.');
  if (file.formatVersion !== STORY_FILE_VERSION) {
    throw Number.isInteger(file.formatVersion) && file.formatVersion > STORY_FILE_VERSION
      ? importFault('unsupported_version', 'This story file comes from a newer LingoMage. Update LingoMage, then try again.')
      : importFault('invalid_file', 'This story file has an unknown format version.');
  }
  const story = file.story && typeof file.story === 'object' && !Array.isArray(file.story) ? JSON.parse(JSON.stringify(file.story)) : null;
  if (!story || !validStories([story])) throw importFault('invalid_story', 'This story file is damaged or incomplete. Nothing was imported.');
  // Legacy single-text stories derive chapter and version IDs from the story ID; pin them before re-identifying
  // so saved memories and positions keep pointing at the same version.
  if (!story.chapters?.length && normalizeChapters) story.chapters = JSON.parse(JSON.stringify(normalizeChapters(story)));
  const taken = new Set(existingIds);
  let id = newId();
  for (let attempt = 0; taken.has(id) || !id; attempt++) { if (attempt > 8) throw importFault('invalid_story', 'Could not give the imported story a new identity.'); id = newId(); }
  story.id = id;
  story.importedAt = new Date(now).toISOString();
  if (!validStories([story])) throw importFault('invalid_story', 'This story file is damaged or incomplete. Nothing was imported.');
  return story;
}
