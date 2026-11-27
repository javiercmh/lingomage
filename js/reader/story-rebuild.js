// Reader ⋮ → Rebuild story memory and Rebuild vocabulary notes (PED-002): their dialogs, runs and recovery.
// The code is the former app.js section, moved verbatim; app.js calls createStoryRebuild where it used to be.
import { ai } from '../bridge.js';
import { appendFailureDetails, discardFailureMessage, failureInfo } from '../generation/generation-errors.js';
import { beginMemoryRebuild, finishMemoryRebuild } from '../generation/story-memory.js';
import { lightModelChoice, lightTaskConfig } from '../core/light-model.js';
import { parallelLimitFor } from '../generation/generation-pipeline.js';

export function createStoryRebuild({
  $, activeVersion, aiSession, closeReaderActions, createHelpLoading, guideFor, LANGUAGES, LEVELS,
  normalizeChapters, noteParts, pathChapters, pendingDeletionBlocked, persistReaderStory, prepareStoryMemory,
  profileSnapshot, readerStory, readingDescription, rebuildPathLabel, releaseInvalidReaderResponse,
  releaseSavedInference, renderChapterRequest, renderCheckpointRecovery, renderReaderActions,
  renderReaderGeneration, revealRecovery, runContentOperation, runtime, selectedPath, setReaderGeneration,
  showOperationResult, showPendingRecovery, showStorageErrors, state, stopBackgroundContext, toast,
  workspaceStorage
}) {
  let memoryRebuildStory = null;
  function renderMemoryRebuild() {
    const story = readerStory(), panel = $('reader-memory-recovery');
    panel.hidden = !story?.memoryRebuild || state.readerEditBusy;
    panel.replaceChildren();
    if (panel.hidden) return;
    const title = document.createElement('h3'); title.textContent = 'Story memory rebuild unfinished';
    const text = document.createElement('p'); text.textContent = 'Your chapters are unchanged. Saved summary steps will be reused when you resume. Rebuilding uses AI and may still fail validation.';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-btn'; button.textContent = 'Resume memory rebuild';
    button.disabled = pendingDeletionBlocked() || state.storageBlocked;
    button.addEventListener('click', () => runMemoryRebuild(story));
    panel.append(title, text, button);
    if (state.memoryRebuildFailure?.storyId === story.id) appendFailureDetails(panel, state.memoryRebuildFailure.failure);
  }
  $('reader-rebuild-memory').addEventListener('click', () => {
    if (pendingDeletionBlocked() || state.storageBlocked) return;
    memoryRebuildStory = readerStory();
    if (!memoryRebuildStory) return;
    closeReaderActions();
    const rebuild = memoryRebuildStory.memoryRebuild;
    $('memory-rebuild-title').textContent = rebuild ? 'Resume story memory rebuild?' : 'Rebuild story memory?';
    $('memory-rebuild-description').textContent = `Story: ${memoryRebuildStory.title}. Storyline: ${rebuildPathLabel(memoryRebuildStory, rebuild)}. All chapters on this storyline will be summarized with ${lightTaskConfig(state).model}.`;
    $('memory-rebuild-effect').textContent = rebuild
      ? 'This uses AI to finish rebuilding story context. Completed summaries will be reused. Your chapters, storylines, vocabulary notes and explanations stay as they are.'
      : 'This uses AI to recreate summaries, characters, events and story context from saved chapters. Your chapters, storylines, vocabulary notes and explanations stay as they are. Saved summaries for this story will be cleared; other storylines prepare their context when needed.';
    $('memory-rebuild-submit').textContent = rebuild ? 'Resume' : 'Rebuild';
    $('memory-rebuild-error').textContent = '';
    $('memory-rebuild-dialog').showModal(); $('memory-rebuild-cancel').focus();
  });
  $('memory-rebuild-cancel').addEventListener('click', () => $('memory-rebuild-dialog').close());
  $('memory-rebuild-dialog').addEventListener('close', () => $('reader-actions-toggle').focus({ preventScroll: true }));
  $('memory-rebuild-submit').addEventListener('click', () => runMemoryRebuild(memoryRebuildStory));

  // Reader ⋮ → Rebuild vocabulary notes: a "notes" operation on the viewed chapter version (PED-002). It uses the
  // current Settings → Vocabulary notes amount and the notes model, keeps Define notes, and recovers like any
  // other saved generation.
  const DENSITY_NAMES = { fewer: 'Fewer', standard: 'Standard', more: 'More' };
  let notesRebuildTarget = null;
  $('reader-rebuild-notes').addEventListener('click', () => {
    if (pendingDeletionBlocked() || state.storageBlocked) return;
    const story = readerStory(), chapter = story && pathChapters(story)[state.readerChapter], version = chapter && activeVersion(chapter);
    if (!version) return;
    closeReaderActions();
    notesRebuildTarget = { storyId: story.id, chapterId: chapter.id, versionId: version.id, index: state.readerChapter };
    const kept = (version.glossary || []).filter(note => note.addedBy === 'learner').length;
    $('notes-rebuild-description').textContent = `Chapter ${state.readerChapter + 1} gets new notes (${DENSITY_NAMES[state.noteDensity] || 'Standard'}).${kept ? ' Your Define notes stay.' : ''}`;
    $('notes-rebuild-error').textContent = '';
    $('notes-rebuild-dialog').showModal(); $('notes-rebuild-cancel').focus();
  });
  $('notes-rebuild-cancel').addEventListener('click', () => $('notes-rebuild-dialog').close());
  $('notes-rebuild-dialog').addEventListener('close', () => { if (!state.readerEditBusy) $('reader-actions-toggle').focus({ preventScroll: true }); });
  $('notes-rebuild-submit').addEventListener('click', () => runNotesRebuild(notesRebuildTarget));
  async function runNotesRebuild(target) {
    const story = state.stories.find(item => item.id === target?.storyId);
    const chapter = story && normalizeChapters(story).find(item => item.id === target.chapterId), version = chapter?.versions.find(item => item.id === target.versionId);
    if (!version) { $('notes-rebuild-dialog').close(); return; }
    if (state.checkpointBlocked || runtime.pipeline?.records.length) { $('notes-rebuild-dialog').close(); if (runtime.pipeline?.records.length) showPendingRecovery(); else showStorageErrors(); return; }
    const fail = message => { $('notes-rebuild-error').textContent = message; };
    if (pendingDeletionBlocked() || state.readerEditBusy || state.readerHelpBusy) { fail('Another AI request is still running. Wait for it to finish.'); return; }
    if (ai.available === false) { fail('Open App² → Settings → AI and connect a provider, then return here.'); return; }
    if (!String(state.model || '').trim()) { fail('No AI model is selected. Open Settings and choose an AI model first.'); return; }
    if (Array.isArray(state.models) && !state.models.some(item => item.id === state.model)) { fail('The selected AI model is not available now. Open Settings and choose an available model.'); return; }
    const difficulty = version.difficulty || story.difficulty;
    const input = { topic: story.topic || '', practice: story.practice || (story.words || []).join(', '), language: LANGUAGES[story.language], languageCode: story.language, difficulty, framework: LEVELS[story.language].framework, levelDescription: guideFor(story.language, difficulty), readingSelfReport: readingDescription(story.language, difficulty), languageExpectations: state.languageExpectations[story.language] || '', learnerProfile: version.learnerContext || { ...profileSnapshot(story), readingStartingPoint: difficulty, readingSelfReport: readingDescription(story.language, difficulty) } };
    const config = { providerId: state.providerId, model: state.model, reasoning: state.reasoning, light: lightModelChoice(state), notesParts: noteParts(), parallelLimit: parallelLimitFor(state.concurrentRequests), noteDensity: state.noteDensity, retryBroken: state.retryBrokenReplies !== false };
    $('notes-rebuild-dialog').close();
    state.readerEditBusy = true; renderReaderActions();
    setReaderGeneration({ storyId: story.id, phase: 'working', message: 'Rebuilding vocabulary notes…' });
    try {
      if (runtime.backgroundRun) await stopBackgroundContext();
      persistReaderStory(story);
      await releaseSavedInference();
      const op = await runContentOperation({ kind: 'notes', language: story.language, input, plan: version.languagePlan || null, prose: { title: version.title, story: version.story }, config, target: { storyId: story.id, chapterId: chapter.id, versionId: version.id, index: target.index } });
      showOperationResult(op);
    } catch (error) {
      try { await releaseInvalidReaderResponse(); } catch {}
      const cancelled = error.code === 'generation_cancelled';
      if (runtime.readerGeneration?.storyId === story.id) setReaderGeneration(cancelled ? null : { ...runtime.readerGeneration, phase: 'error', message: runtime.pipeline?.records[0]?.discardRequested ? discardFailureMessage(runtime.pipeline.records[0]) : 'Vocabulary notes stopped.' });
      if (cancelled && !runtime.pipeline?.records.length) toast('Generation cancelled');
      else if (runtime.pipeline?.records.length) { renderCheckpointRecovery(); revealRecovery(runtime.pipeline.records[0]); }
      else toast(failureInfo(error, 'notes').message);
    } finally { state.readerEditBusy = false; renderReaderActions(); }
  }
  async function runMemoryRebuild(story) {
    if (!story || pendingDeletionBlocked() || state.storageBlocked) return;
    state.readerEditBusy = true; $('memory-rebuild-submit').disabled = true;
    state.memoryRebuildFailure = null;
    const loading = createHelpLoading('continue');
    loading.querySelector('strong').textContent = 'Rebuilding story memory…';
    const request = state.activeChapterRequest = { storyId: story.id, loading, stopped: false, cancelledByUser: false };
    const config = { ...lightTaskConfig(state), signal: request };
    try {
      await stopBackgroundContext();
      await releaseSavedInference();
      // Check configuration before discarding the old cache.
      workspaceStorage.assertWritable();
      if (!ai.available) throw new Error('Connect an AI provider in App² Settings → AI first.');
      if (!state.models.some(model => model.id === config.model)) throw new Error(String(config.model || '').trim() ? 'The selected AI model is not available now. Open Settings and choose an available model.' : 'No AI model is selected. Open Settings and choose an AI model first.');
      if (request.cancelledByUser) throw new Error('Request cancelled.');
      const rebuild = beginMemoryRebuild(story, selectedPath(story), persistReaderStory);
      $('memory-rebuild-dialog').close();
      renderMemoryRebuild(); renderChapterRequest(); renderReaderActions();
      setReaderGeneration({ storyId: story.id, phase: 'working', message: 'Rebuilding story memory…' });
      await aiSession.run(() => prepareStoryMemory(story, rebuild.entries, loading, config));
      if (request.cancelledByUser) throw new Error('Request cancelled.');
      finishMemoryRebuild(story, persistReaderStory);
      setReaderGeneration(null); toast('Story memory rebuilt');
    } catch (error) {
      try { await releaseInvalidReaderResponse(); } catch {}
      // Host text is shown only in its bounded, redacted form.
      const failure = failureInfo(error, 'context', 'request');
      state.memoryRebuildFailure = { storyId: story.id, failure };
      if ($('memory-rebuild-dialog').open) $('memory-rebuild-error').textContent = failure.message;
      else {
        setReaderGeneration(state.pendingReaderResult || state.pendingReaderRequestId
          ? { storyId: story.id, phase: 'cleanup', message: failure.message }
          : request.cancelledByUser ? null : { storyId: story.id, phase: 'error', message: 'Story memory rebuild stopped.' });
        if (!request.cancelledByUser) toast(`${failure.message} Resume memory rebuild to retry.`);
      }
    } finally {
      state.readerEditBusy = false; state.activeChapterRequest = null; loading.remove(); $('memory-rebuild-submit').disabled = false;
      renderChapterRequest(); renderMemoryRebuild(); renderReaderActions(); renderReaderGeneration();
    }
  }
  return {
    renderMemoryRebuild, runMemoryRebuild, runNotesRebuild
  };
}
