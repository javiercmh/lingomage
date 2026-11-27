// Reader → Define (PED-002): an on-demand vocabulary note for the selection, its popover and pending underline.
// The code is the former js/reader-help.js section, moved verbatim; app.js calls createDefineNote where it used to be.
import { DEFINE_INSTRUCTIONS, PROMPT_VERSION } from '../generation/prompts.js';
import { canonicalRange } from './reader-player.js';
import { failureInfo, recoverySummary } from '../generation/generation-errors.js';
import { glossaryForTrigger } from './reader-activation.js';
import { lightTaskConfig } from '../core/light-model.js';
import { markStoryActivity } from '../screens/library-activity.js';
import { validateDefinedNote } from '../generation/learning-validation.js';

export function createDefineNote({
  $, activeChapter, activeVersion, closeWordNote, LANGUAGES, normalizeChapters, persistReaderStory, readerAi,
  readerPanel, readerStory, releaseInvalidReaderResponse, releaseSavedInference, renderCheckpointRecovery,
  renderPendingReaderResult, renderReaderGeneration, runtime, savePendingReaderResult, setReaderGeneration,
  showWordNote, state, stopBackgroundContext, toast, updateReader, validTextRange
}) {
  // Define (PED-002): an on-demand vocabulary note for the selection, saved with the chapter's notes and
  // underlined like them. A selection inside an existing note opens that note without an AI request.
  function noteCoveringSelection(passage) {
    let best = null;
    for (const fragment of $('reader-story').querySelectorAll('.gloss-note-trigger')) {
      const info = glossaryForTrigger(fragment);
      if (!info || info.start > passage.start || info.end < passage.end) continue;
      if (!best || info.end - info.start < best.end - best.start) best = info;
    }
    return best;
  }
  function openNoteForSelection(passage) {
    const shown = noteCoveringSelection(passage);
    if (!shown?.trigger) return false;
    showWordNote(shown.trigger, shown.notes, shown.surface);
    return true;
  }
  let defineRequestHost = null;
  function showDefinePopover(passage, build) {
    const popover = $('word-note-popover');
    closeWordNote(); popover.textContent = '';
    const item = document.createElement('div'); item.className = 'word-note-entry';
    const heading = document.createElement('span'); heading.className = 'word-note-heading';
    const word = document.createElement('strong'); word.textContent = passage.text;
    heading.append(word); item.append(heading); build(item, popover, heading); popover.prepend(item);
    popover.dataset.define = 'true'; popover.hidden = false; popover.focus();
    const rect = passage.rect || { left: 12, bottom: 12, top: 12 };
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - 292, rect.left))}px`;
    popover.style.top = `${Math.min(window.innerHeight - 20, rect.bottom + 8)}px`;
    requestAnimationFrame(() => {
      const box = popover.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 12) popover.style.top = `${Math.max(12, rect.top - box.height - 8)}px`;
    });
  }
  // While the note is written, the selected words glow and their dotted underline draws itself in; the layer
  // sits over the story text, has no text of its own, and disappears with the next story render.
  function markDefinePending(passage) {
    clearDefinePending();
    const root = $('reader-story'), range = canonicalRange(root, passage.start, passage.end);
    if (!range) return;
    const origin = root.getBoundingClientRect(), layer = document.createElement('div'), seen = new Set();
    layer.className = 'define-pending-layer'; layer.setAttribute('aria-hidden', 'true');
    for (const rect of range.getClientRects()) {
      const key = [rect.left, rect.top, rect.width, rect.height].map(Math.round).join();
      if (!rect.width || seen.has(key)) continue;
      seen.add(key);
      const mark = document.createElement('span'); mark.className = 'define-pending';
      Object.assign(mark.style, { left: `${rect.left - origin.left}px`, top: `${rect.top - origin.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      layer.append(mark);
    }
    root.append(layer);
  }
  function clearDefinePending() { document.querySelectorAll('.define-pending-layer').forEach(layer => layer.remove()); }
  // The underline finishes drawing before the saved note replaces it.
  function completeDefinePending() {
    const layer = document.querySelector('.define-pending-layer');
    if (!layer || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    layer.classList.add('complete');
    return new Promise(resolve => setTimeout(resolve, 200));
  }
  function defineInProgress() { const popover = $('word-note-popover'); return !popover.hidden && popover.dataset.define === 'true'; }
  async function defineSelection(selected = state.readerSelection) {
    const passage = selected; if (!passage || passage.kind === 'title') return;
    const story = readerStory();
    const chapter = normalizeChapters(story).find(item => item.id === passage.chapterId);
    const version = chapter?.versions.find(item => item.id === passage.versionId);
    if (story.id !== passage.storyId || !version) return;
    if (openNoteForSelection(passage)) { $('selection-toolbar').hidden = true; return; }
    if (runtime.backgroundRun) await stopBackgroundContext();
    // Define also works while a shown chapter's vocabulary notes are still arriving (any chapter of any story):
    // the running operation has already saved its chapter, and the learner's note is kept and prevails.
    const notesOp = runtime.pipeline?.busy ? runtime.pipeline.records.find(op => op.earlyApplied) : null, alongside = Boolean(notesOp);
    if (state.checkpointBlocked || (runtime.pipeline?.records.length && !alongside) || state.readerHelpBusy || state.readerEditBusy || (state.requestId && !alongside)) { toast('Another AI request is still running. Wait for it to finish.'); return; }
    if (!validTextRange(version.story, passage.start, passage.end) || version.story.slice(passage.start, passage.end) !== passage.text) { toast('Select the word again to define it.'); return; }
    const config = { ...lightTaskConfig(state, 'notes'), ...(alongside ? { alongsideNotes: true } : {}) };
    // The status bar keeps showing the notes' progress; the note popover shows this request.
    const setStatus = value => { if (!alongside) setReaderGeneration(value); };
    state.readerHelpBusy = true;
    try {
      try { persistReaderStory(story); await releaseSavedInference(); }
      catch (error) { toast(error.message); renderPendingReaderResult(); return; }
      $('selection-toolbar').hidden = true;
      if (!defineRequestHost) { defineRequestHost = document.createElement('span'); defineRequestHost.hidden = true; readerPanel().append(defineRequestHost); }
      // A skeleton of the note: the same heading, with shimmering lines where the meaning will appear.
      showDefinePopover(passage, (item, popover, heading) => {
        item.classList.add('word-note-skeleton');
        const status = document.createElement('span'); status.className = 'sr-only'; status.setAttribute('role', 'status'); status.textContent = 'Writing a vocabulary note…';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'icon-btn define-cancel'; cancel.setAttribute('aria-label', 'Cancel vocabulary note'); cancel.title = 'Cancel';
        cancel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        cancel.addEventListener('click', () => { defineRequestHost.querySelector('.reader-ai-cancel')?.click(); });
        const lines = ['92%', '64%'].map(width => { const line = document.createElement('span'); line.className = 'skeleton-line'; line.style.width = width; return line; });
        heading.append(cancel); item.append(status, ...lines);
      });
      markDefinePending(passage);
      setStatus({ storyId: story.id, pathId: story.activePathId, chapterId: chapter.id, versionId: version.id, kind: 'define', phase: 'working', message: 'Writing a vocabulary note…' });
      const sameView = () => state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id;
      try {
        const input = { language: LANGUAGES[story.language], languageCode: story.language, difficulty: story.difficulty, chapter: { title: version.title || story.title, story: version.story }, start: passage.start, end: passage.end, passage: passage.text, sentence: passage.sentence || '', profile: passage.profile };
        const raw = await readerAi('define', input, DEFINE_INSTRUCTIONS, defineRequestHost, config);
        let value;
        try { value = JSON.parse(String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
        catch { throw new Error('The AI response was not valid JSON.'); }
        const note = { ...validateDefinedNote(value, { title: version.title || story.title, story: version.story }, story.language, passage), createdAt: new Date().toISOString(), providerId: config.providerId, model: config.model, promptVersion: PROMPT_VERSION };
        state.pendingReaderResult = { story, saved: false, alongsideNotes: alongside, preview: `${note.word} — ${note.meaning}`, readerLocation: { chapterId: chapter.id, versionId: version.id, helpId: '' }, apply() {
          const undoActivity = markStoryActivity(story);
          const before = version.glossary;
          version.glossary = [...(before || []), note];
          return () => { if (before === undefined) delete version.glossary; else version.glossary = before; undoActivity(); };
        } };
        try { await savePendingReaderResult(); }
        catch { if (state.readerId === story.id) { closeWordNote(); renderPendingReaderResult(); } return; }
        if (!sameView()) return;
        await completeDefinePending();
        if (!sameView()) return;
        const panel = readerPanel(), current = panel.scrollTop;
        updateReader(true); panel.scrollTop = current;
        // The opened note is the result, so the reader status bar's Ready / View result is not needed.
        if (openNoteForSelection(passage) && !alongside && runtime.readerGeneration?.storyId === story.id) setReaderGeneration(null);
      } catch (error) {
        const cancelled = error.message === 'Request cancelled.' || error.code === 'generation_cancelled';
        try { await releaseInvalidReaderResponse(); } catch {}
        if (!alongside && runtime.readerGeneration?.storyId === story.id) {
          setReaderGeneration(cancelled
            ? (state.pendingReaderRequestId ? { ...runtime.readerGeneration, phase: 'cleanup', message: 'Could not finish cancelled request.' } : null)
            : { ...runtime.readerGeneration, phase: 'error', message: 'Request stopped.' });
        }
        if (cancelled) { if (defineInProgress()) closeWordNote(); if (!state.pendingReaderRequestId) toast('Request cancelled'); return; }
        // The note popover (or a toast after leaving the chapter) carries the failure and Retry, not the status bar.
        if (!alongside && !state.pendingReaderRequestId && runtime.readerGeneration?.storyId === story.id && !runtime.pipeline?.records.length) setReaderGeneration(null);
        if (!sameView()) { toast(`Could not define: ${error.message}`); return; }
        if (runtime.pipeline?.records.length && !alongside) { closeWordNote(); renderCheckpointRecovery(); return; }
        const retrySelection = JSON.parse(JSON.stringify(passage));
        showDefinePopover(passage, (item, popover) => {
          const note = document.createElement('span'); note.setAttribute('role', 'alert');
          note.textContent = recoverySummary({ kind: 'define', error: error.message, failure: failureInfo(error, 'define') });
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'word-note-view'; retry.textContent = 'Retry';
          retry.addEventListener('click', () => { closeWordNote(); void defineSelection(retrySelection); });
          item.append(note); popover.append(retry);
        });
      }
    } finally { clearDefinePending(); state.readerHelpBusy = false; renderReaderGeneration(); }
  }
  return {
    defineSelection
  };
}
