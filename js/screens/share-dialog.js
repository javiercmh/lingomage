// Reader → Share: the share dialog (notes switch, row summaries, download/send/copy actions) and Library → Import story.
// The code is the former app.js section, moved verbatim, plus openShareDialog (formerly in js/reader-help.js) at the end;
// app.js calls createShareDialog where the section used to be.
import { storyExportFile, downloadStoryFile, shareStoryFile, chapterShareText, storyShareText, copyText, shareText, STORY_IMPORT_MAX_BYTES, importStoryFile, shareTargets } from './story-share.js';
import { pathLabel } from '../core/story-model.js';
import { save, isNative, share } from '../bridge.js';
import { markStoryActivity } from './library-activity.js';

export function createShareDialog({
  $, activeVersion, libraryChanged, normalizeChapters, pathChapters, persistStories, readJson, renderLibrary,
  selectedPath, state, toast, trySaveSettings, workspaceStorage
}) {
  // Row summaries state which text each row holds; the notes switch is shown once, above the rows.
  function updateShareSummaries() {
    const context = state.shareDialog; if (!context) return;
    $('share-story-sub').textContent = `All chapters${context.storyline ? ` · ${context.storyline}` : ''}`;
    $('share-chapter-sub').textContent = context.chapterTitle || '';
  }
  function resetCopyLabels() {
    clearTimeout(state.shareCopiedTimer);
    for (const id of ['share-story-copy', 'share-chapter-copy']) $(id).classList.toggle('copied', false);
  }
  // The notes choice is remembered in settings. A failed save is reported by the settings notice and rolls back
  // only the remembered value; the switch still applies to this share.
  $('share-notes').addEventListener('change', () => {
    state.shareVocabularyNotes = $('share-notes').checked; trySaveSettings();
  });
  $('share-cancel').addEventListener('click', () => $('share-dialog').close());
  $('share-dialog').addEventListener('click', event => { if (event.target === $('share-dialog')) $('share-dialog').close(); });
  $('share-dialog').addEventListener('close', () => {
    const opener = state.shareDialog; state.shareDialog = null;
    if (state.libraryStale && !state.storySelectionMode) renderLibrary();
    const target = opener?.trigger?.isConnected ? opener.trigger : [...$('library-list').querySelectorAll('[data-story-id]')].find(card => card.dataset.storyId === opener?.id)?.querySelector('.story-menu-toggle');
    target?.focus({preventScroll:true});
  });
  function browserDownload({name, mimeType, content}) {
    const url = URL.createObjectURL(new Blob([content], {type:mimeType}));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const SHARE_ACTIONS = ['share-download', 'share-send-file', 'share-chapter-copy', 'share-chapter-send', 'share-story-copy', 'share-story-send'];
  // Each button does exactly what it says; a failure keeps the dialog open and never falls back to another delivery.
  async function runShareAction(action, scope) {
    const context = state.shareDialog; if (!context || context.busy) return;
    context.busy = true; SHARE_ACTIONS.forEach(id => { $(id).disabled = true; });
    const file = scope === 'file', notes = $('share-notes').checked;
    try {
      let result;
      if (file) {
        const payload = storyExportFile(context.story, {appVersion:readJson('manifest.json', {}).version});
        result = action === 'download' ? await downloadStoryFile(payload, {save, download:browserDownload, isNative}) : await shareStoryFile(payload, {share});
      } else {
        const text = scope === 'chapter' ? chapterShareText(context.story, context.chapter, activeVersion(context.chapter, context.modelStory), {notes}) : storyShareText(context.story, {pathChapters, activeVersion}, {notes});
        const payload = {title:context.story.title, text};
        result = action === 'copy' ? await copyText(payload, {clipboard:navigator.clipboard}) : await shareText(payload, {share});
      }
      if (result.cancelled) return;
      if (result.done === 'copied') {
        // Copying keeps the sheet open so both texts can be copied; the button confirms in place.
        const button = $(`share-${scope}-copy`); resetCopyLabels();
        button.classList.toggle('copied', true);
        $('share-live').textContent = `${scope === 'chapter' ? 'Chapter text' : 'Story text'} copied`;
        state.shareCopiedTimer = setTimeout(resetCopyLabels, 1500);
        return;
      }
      if (result.done) toast(`Story file ${result.done}`);
      if (state.shareDialog === context) $('share-dialog').close();
    } catch (error) {
      console.warn(error);
      toast(file && action === 'download' ? (error.code === 'too_large' ? 'This story is too large to download.' : 'Could not download the story file.') : action === 'copy' ? 'Could not copy the text.' : 'Could not share the story.');
    } finally { context.busy = false; SHARE_ACTIONS.forEach(id => { $(id).disabled = false; }); }
  }
  $('share-download').addEventListener('click', () => runShareAction('download', 'file'));
  $('share-send-file').addEventListener('click', () => runShareAction('share', 'file'));
  $('share-chapter-copy').addEventListener('click', () => runShareAction('copy', 'chapter'));
  $('share-chapter-send').addEventListener('click', () => runShareAction('share', 'chapter'));
  $('share-story-copy').addEventListener('click', () => runShareAction('copy', 'story'));
  $('share-story-send').addEventListener('click', () => runShareAction('share', 'story'));

  // Library → Import story…: a standard file input (App² serves Android's document picker). The copy gets a new
  // identity and joins the Library through the normal stories save; cancellation and any failure leave data unchanged.
  async function importStoryFromFile(file) {
    if (file.size > STORY_IMPORT_MAX_BYTES) throw Object.assign(new Error('too large'), {userMessage:'This file is too large to be a LingoMage story file.'});
    let text;
    try { text = await file.text(); } catch { throw Object.assign(new Error('unreadable'), {userMessage:'Could not read this file.'}); }
    workspaceStorage.assertWritable(['data/stories.json']);
    const story = importStoryFile(text, {existingIds:state.stories.map(item => item.id), normalizeChapters});
    markStoryActivity(story, new Date(), 'updated');
    state.stories.unshift(story);
    try { persistStories(); }
    catch (error) { state.stories = state.stories.filter(item => item !== story); throw error; }
    return story;
  }
  $('import-story').addEventListener('click', () => {
    const input = $('import-story-input');
    input.value = ''; // choosing the same file again must fire change
    input.click();
  });
  $('import-story-input').addEventListener('change', async () => {
    const input = $('import-story-input'), file = input.files?.[0];
    if (!file || state.importingStory) return; // cancelled: nothing changes, no message
    state.importingStory = true; $('import-story').disabled = true;
    try {
      const story = await importStoryFromFile(file);
      libraryChanged(); toast(`Imported “${story.title || 'Untitled story'}”`);
    } catch (error) {
      console.warn(error);
      toast(error.userMessage || (['store_invalid', 'write_failed'].includes(error.code) ? error.message : 'Could not import the story. Your stories are unchanged.'));
    } finally { state.importingStory = false; $('import-story').disabled = false; input.value = ''; $('import-story').focus({preventScroll:true}); }
  });
  function openShareDialog(story, {chapterIndex = null, trigger}) {
    const saved = workspaceStorage.entries.get('data/stories.json')?.value.find(item => item.id === story.id);
    if (!saved) { toast('Could not share the story.'); return; }
    const snapshot = JSON.parse(JSON.stringify(saved));
    const modelStory = JSON.parse(JSON.stringify(snapshot));
    const chapter = chapterIndex === null ? null : pathChapters(modelStory)[chapterIndex];
    state.shareDialog = {story:snapshot, modelStory, chapter, chapterIndex, trigger, id:story.id};
    const targets = shareTargets({save, share, isNative});
    $('share-title').textContent = snapshot.title || 'Untitled story';
    $('share-send-file').hidden = !targets.shareFile; $('share-download').hidden = !targets.download;
    // The first available file action is the primary one (Share in App², Save backup otherwise): only its icon is accent-tinted.
    const primary = targets.shareFile ? $('share-send-file') : $('share-download');
    for (const button of [$('share-send-file'), $('share-download')]) button.querySelector('.share-row-icon').classList.toggle('small-btn-strong', button === primary);
    $('share-chapter-send').hidden = $('share-story-send').hidden = !targets.shareText;
    $('share-chapter-row').hidden = !chapter;
    const name = chapter ? `Chapter ${chapterIndex + 1}` : '';
    $('share-chapter-name').textContent = name;
    state.shareDialog.chapterTitle = chapter ? activeVersion(chapter, modelStory).title || '' : '';
    state.shareDialog.storyline = modelStory.paths.length > 1 ? pathLabel(modelStory, selectedPath(modelStory)) : '';
    $('share-chapter-copy').setAttribute('aria-label', `Copy ${name} text`); $('share-chapter-send').setAttribute('aria-label', `Share ${name} text`);
    $('share-story-copy').setAttribute('aria-label', 'Copy whole story text'); $('share-story-send').setAttribute('aria-label', 'Share whole story text');
    $('share-notes').checked = state.shareVocabularyNotes === true; $('share-live').textContent = ''; resetCopyLabels(); updateShareSummaries();
    $('share-dialog').showModal(); primary.focus();
  }
  return {
    openShareDialog
  };
}
