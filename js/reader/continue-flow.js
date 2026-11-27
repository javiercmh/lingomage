// Reader → Continue and Rewrite: the continue choice (parallel, add, replace), the edit panel and running the request.
// The code is the former app.js section, moved verbatim; app.js calls createContinueFlow where it used to be.
import { ai } from '../bridge.js';
import { chapterInstructions, scopeGuide } from '../generation/prompts.js';
import { chapterLoadingCopy, hasStoryContext, progressSummary } from '../generation/generation-progress.js';
import { discardFailureMessage, failureInfo } from '../generation/generation-errors.js';
import { lightModelChoice, lightTaskConfig } from '../core/light-model.js';
import { parallelLimitFor } from '../generation/generation-pipeline.js';
import { pathLabel } from '../core/story-model.js';

export function createContinueFlow({
  $, activeVersion, aiSession, closeReaderActions, createChapterLoading, elementInView, estimateFor,
  fillLevelOptions, fillScopeOptions, guideFor, LANGUAGES, levelDefinition, LEVELS, normalizeChapters,
  noteParts, notifyStopped, operationPlan, paintChapterProgress, pathChapters, pendingSummaryCount,
  persistReaderStory, prepareStoryMemory, profileSnapshot, readerStory, readingDescription, recentProse,
  releaseInvalidReaderResponse, releaseSavedInference, renderChapterRequest, renderCheckpointRecovery,
  renderPendingReaderResult, renderReaderGeneration, runContentOperation, runtime, selectedPath,
  setReaderGeneration, setScopeDisabled, settleBackgroundContext, showOperationResult, showPendingRecovery,
  showStorageErrors, state, storyContextReady, toast, updateReader
}) {
  function continueTargetSummary(story, path, k, N, continueMode) {
    const range = k + 1 === N ? `Chapter ${N}` : `Chapters ${k + 1}–${N}`;
    if (continueMode === 'branch') return { text: `Parallel Chapter ${k + 1} · new storyline after Chapter ${k}`, submit: `Write parallel Chapter ${k + 1}`, danger: false };
    if (continueMode === 'replace') return { text: `Replaces ${range} after Chapter ${k} on this storyline once saved; other storylines stay intact.`, submit: `Replace ${range}`, danger: true };
    return { text: `Chapter ${N + 1} · after Chapter ${N} on this storyline`, submit: `Write Chapter ${N + 1}`, danger: false };
  }
  function showEditPanel(mode, continueMode = 'append') {
    if (state.readerEditBusy) return;
    const story = readerStory(), chapters = pathChapters(story), version = activeVersion();
    fillLevelOptions($('reader-level'), story.language, version.difficulty || story.difficulty);
    $('reader-level-description').textContent = readingDescription(story.language, $('reader-level').value) || 'Choose a reading level for the new version.';
    fillScopeOptions($('reader-scope'), version.scope || story.scope, $('reader-scope-description'));
    $('reader-edit-panel').hidden = false; $('reader-prompt').value = ''; $('reader-edit-error').textContent = '';
    $('reader-edit-panel').dataset.mode = mode;
    const resolvedMode = mode === 'continue' ? (continueMode || 'append') : '';
    $('reader-edit-panel').dataset.continueMode = resolvedMode;
    const k = state.readerChapter + 1, N = chapters.length, earlier = mode === 'continue' && k < N;
    const targetRow = $('reader-edit-target'), submit = $('reader-edit-submit');
    if (mode === 'continue') {
      const info = continueTargetSummary(story, selectedPath(story), k, N, resolvedMode);
      if (targetRow) {
        targetRow.hidden = !earlier;
        targetRow.classList.toggle('is-danger', info.danger);
        $('reader-edit-target-text').textContent = earlier ? info.text : '';
      }
      submit.textContent = info.submit;
      submit.classList.toggle('is-danger', info.danger);
    } else {
      if (targetRow) { targetRow.hidden = true; targetRow.classList.remove('is-danger'); }
      submit.textContent = 'Rewrite';
      submit.classList.remove('is-danger');
    }
    $('reader-prompt-label').textContent = mode === 'continue' ? 'What should happen next? (optional)' : 'How should this chapter change? (optional)';
    $('reader-prompt').placeholder = 'Add ideas in any language, or leave blank.';
    $('reader-edit-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); $('reader-prompt').focus();
  }
  let continueChoiceTrigger = null;
  function openContinueChoice(trigger = null) {
    if (state.readerEditBusy) return;
    const story = readerStory(); if (!story) return;
    const path = selectedPath(story), k = state.readerChapter + 1, N = path.entries.length;
    if (k >= N) { showEditPanel('continue', 'append'); return; }
    const label = pathLabel(story, path), multi = story.paths.length > 1;
    const range = k + 1 === N ? `Chapter ${N}` : `Chapters ${k + 1}–${N}`;
    continueChoiceTrigger = trigger;
    $('continue-choice-subtitle').textContent = `Reading Chapter ${k} of ${N}${multi ? ` · ${label}` : ''}`;
    $('continue-choice-branch-title').textContent = `Parallel Chapter ${k + 1}`;
    $('continue-choice-branch-sub').textContent = `Starts a new storyline after Chapter ${k}. Keeps ${k + 1 === N ? `the current Chapter ${N}` : range}.`;
    $('continue-choice-append-title').textContent = `Add Chapter ${N + 1}`;
    $('continue-choice-append-sub').textContent = `Continues from the end of this storyline, after Chapter ${N}.`;
    $('continue-choice-replace-title').textContent = `Replace ${range}`;
    $('continue-choice-replace-sub').textContent = `Writes a new Chapter ${k + 1} after Chapter ${k} and removes ${k + 1 === N ? 'the current one' : range}.`;
    $('continue-choice-dialog').showModal();
    $('continue-choice-branch').focus();
  }
  function pickContinueChoice(continueMode) {
    continueChoiceTrigger = null;
    $('continue-choice-dialog').close();
    showEditPanel('continue', continueMode);
  }
  $('continue-choice-branch').addEventListener('click', () => pickContinueChoice('branch'));
  $('continue-choice-append').addEventListener('click', () => pickContinueChoice('append'));
  $('continue-choice-replace').addEventListener('click', () => pickContinueChoice('replace'));
  $('continue-choice-cancel').addEventListener('click', () => $('continue-choice-dialog').close());
  $('continue-choice-dialog').addEventListener('click', event => { if (event.target === $('continue-choice-dialog')) $('continue-choice-dialog').close(); });
  $('continue-choice-dialog').addEventListener('close', () => {
    const trigger = continueChoiceTrigger; continueChoiceTrigger = null;
    trigger?.focus?.({ preventScroll: true });
  });
  $('reader-edit-change-target').addEventListener('click', () => openContinueChoice($('reader-edit-change-target')));
  function startContinueFlow(trigger) {
    if (state.readerEditBusy) return;
    const chapters = pathChapters(readerStory());
    if (state.readerChapter < chapters.length - 1) openContinueChoice(trigger);
    else showEditPanel('continue', 'append');
  }
  $('continue-story').addEventListener('click', () => startContinueFlow($('continue-story')));
  $('rewrite-chapter').addEventListener('click', () => showEditPanel('rewrite'));
  $('reader-menu-continue').addEventListener('click', () => { closeReaderActions(); startContinueFlow($('reader-actions-toggle')); });
  $('reader-menu-rewrite').addEventListener('click', () => { closeReaderActions(); showEditPanel('rewrite'); });
  $('reader-edit-cancel').addEventListener('click', () => { if (!state.readerEditBusy) { $('reader-edit-panel').hidden = true; state.readerEditDraft = null; } });
  $('reader-edit-submit').addEventListener('click', async () => {
    if (state.readerEditBusy) return;
    if (state.checkpointBlocked || runtime.pipeline?.records.length) { if (runtime.pipeline?.records.length) showPendingRecovery(); else showStorageErrors(); return; }
    const prompt = $('reader-prompt').value.trim();
    const story = readerStory(), chapters = pathChapters(story), chapter = chapters[state.readerChapter], version = activeVersion(chapter), mode = $('reader-edit-panel').dataset.mode;
    const continueMode = mode === 'continue' ? ($('reader-edit-panel').dataset.continueMode || 'append') : '';
    const path = selectedPath(story), entries = path.entries.map(entry => ({ ...entry })), rewriteIndex = state.readerChapter;
    const sourceVersion = mode === 'continue' ? (continueMode === 'append' ? activeVersion(chapters[chapters.length - 1]) : version) : version;
    const providerId = state.providerId, model = state.model, config = { providerId, model, reasoning: state.reasoning, light: lightModelChoice(state), notesParts: noteParts(), parallelLimit: parallelLimitFor(state.concurrentRequests), noteDensity: state.noteDensity, progressive: true, retryBroken: state.retryBrokenReplies !== false }, memoryConfig = lightTaskConfig(state);
    const difficulty = $('reader-level').value, scope = $('reader-scope').value;
    if (!levelDefinition(story.language,difficulty)) { $('reader-edit-error').textContent='Choose a reading level for this generation.'; return; }
    if (ai.available === false || (Array.isArray(state.models) && !state.models.length && $('ai-setup')?.hidden === false)) { $('reader-edit-error').textContent='Open App² → Settings → AI and connect a provider, then return here.'; return; }
    if (!String(model || '').trim()) { $('reader-edit-error').textContent='No AI model is selected. Open Settings and choose an AI model before generating.'; return; }
    if (Array.isArray(state.models) && !state.models.some(item => item.id === model)) { $('reader-edit-error').textContent='The selected AI model is not available now. Open Settings and choose an available model.'; return; }
    const input = { topic: story.topic || '', practice: story.practice || (story.words || []).join(', '), language: LANGUAGES[story.language], languageCode: story.language, difficulty, framework: LEVELS[story.language].framework, levelDescription: guideFor(story.language, difficulty), readingSelfReport: readingDescription(story.language, difficulty), languageExpectations: state.languageExpectations[story.language] || '', scope, scopeDescription: scopeGuide(scope, story.language, difficulty), learnerProfile: { ...profileSnapshot(story), readingStartingPoint: difficulty, readingSelfReport: readingDescription(story.language, difficulty) }, prompt };
    const instructions = chapterInstructions(LANGUAGES[story.language], difficulty, guideFor(story.language, difficulty), mode);
    const memoryEntries = mode === 'continue' ? (continueMode === 'append' ? entries : entries.slice(0, rewriteIndex + 1)) : entries.slice(0, rewriteIndex);
    const target = {
      storyId: story.id, pathId: path.id, entries, chapterId: chapter.id, sourceVersionId: sourceVersion.id, index: rewriteIndex,
      ...(mode === 'continue' && continueMode !== 'append' ? { continueMode, baseEntries: memoryEntries } : {})
    };
    const copyOverride = typeof chapterLoadingCopy === 'function' ? chapterLoadingCopy(mode, target) : null;
    state.readerEditBusy = true; state.readerEditDraft = null;
    const busyPathList = $('path-list');
    if (busyPathList) {
      if (busyPathList.dataset) busyPathList.dataset.disabled = 'true';
      busyPathList.querySelectorAll?.('button').forEach(item => { item.disabled = true; });
    }
    const loading = createChapterLoading(mode, copyOverride);
    // The estimate is made now, while it can still count the story-context summaries this run will make.
    const estimate = estimateFor(operationPlan({ kind: mode, language: story.language, input: { scope }, config }, pendingSummaryCount(story, memoryEntries)));
    const request = state.activeChapterRequest = { storyId: story.id, loading, stopped:false, cancelledByUser:false, opened:false, clockId: `chapter-request-${Date.now()}`, timings: [], estimate };
    config.signal=request; memoryConfig.signal=request;
    const provisional = { id: request.clockId, kind: mode, language: story.language, stage: storyContextReady(story, memoryEntries) && !runtime.backgroundRun ? 'plan' : 'context', target };
    if (hasStoryContext(provisional)) { loading.querySelector('strong').textContent = 'Preparing story context…'; paintChapterProgress(request, provisional); }
    const formWasInView = typeof elementInView === 'function' && elementInView($('reader-edit-panel'), true);
    $('reader-edit-panel').hidden = true;
    renderChapterRequest();
    if (formWasInView) {
      const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      $('reader-chapter-status').scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    setReaderGeneration({ storyId: story.id, phase: 'working', message: hasStoryContext(provisional) ? progressSummary(provisional).text : mode === 'continue' ? 'Preparing next chapter…' : 'Preparing rewrite…' });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => renderReaderGeneration());
    $('reader-edit-cancel').disabled = true; $('reader-prompt').disabled = true; $('reader-level').disabled = true; setScopeDisabled($('reader-scope'), true);
    const button = $('reader-edit-submit'); button.disabled = true; button.textContent = 'Working…'; $('reader-edit-error').textContent = '';
    try {
      await settleBackgroundContext(story.id, memoryEntries);
      persistReaderStory(story);
      await releaseSavedInference();
      // Summary preparation and every generation stage share one session; readerAi joins it and never ends it.
      const op = await aiSession.run(async () => {
        input.storyMemory = await prepareStoryMemory(story, memoryEntries, loading, memoryConfig, loading.requestHost);
        if (request.cancelledByUser) throw Object.assign(new Error('Generation cancelled.'), {code:'generation_cancelled'});
        const priorEntry = mode === 'continue' ? memoryEntries[memoryEntries.length - 1] : entries[rewriteIndex - 1];
        const priorVersion = priorEntry ? normalizeChapters(story).find(c => c.id === priorEntry.chapterId).versions.find(v => v.id === priorEntry.versionId) : null;
        input.recentProse = priorVersion ? recentProse(priorVersion.story) : '';
        if (mode === 'rewrite') input.currentChapter = { title: sourceVersion.title, story: sourceVersion.story };
        const proseStageMessage = mode === 'continue' ? 'Writing the next chapter…' : 'Rewriting this chapter…';
        if (runtime.readerGeneration) { runtime.readerGeneration.message = proseStageMessage; renderReaderGeneration(); }
        loading.querySelector('strong').textContent = proseStageMessage;
        return runContentOperation({kind:mode,language:story.language,input,instructions,config,timings:request.timings,target});
      });
      showOperationResult(op);
    } catch (error) {
      try { await releaseInvalidReaderResponse(); } catch {}
      // A deliberate cancel clears the status instead of reporting a failure.
      if (runtime.readerGeneration?.storyId === story.id) setReaderGeneration(error.code === 'generation_cancelled' || request.cancelledByUser ? null : { ...runtime.readerGeneration, phase: 'error', message: runtime.pipeline?.records[0]?.discardRequested ? discardFailureMessage(runtime.pipeline.records[0]) : 'Generation stopped.' });
      if ((error.code === 'generation_cancelled' || request.cancelledByUser) && !runtime.pipeline?.records.length) toast('Generation cancelled');
      else if (error.code !== 'generation_cancelled' && !request.cancelledByUser) notifyStopped(mode);
      const message = error.code === 'generation_cancelled' || request.cancelledByUser ? '' : runtime.pipeline?.records.length ? '' : `${failureInfo(error, 'context').message} Submit again to retry.`;
      state.readerEditDraft = { storyId: story.id, pathId: path.id, chapterId: chapter.id, mode, continueMode, prompt, difficulty, scope, error: message };
      if (state.readerId === story.id) {
        state.readerChapter = chapters.indexOf(chapter); updateReader();
        if (typeof showEditPanel === 'function') showEditPanel(mode, continueMode || 'append');
        else { $('reader-edit-panel').hidden = false; $('reader-edit-panel').dataset.mode = mode; $('reader-edit-panel').dataset.continueMode = continueMode; }
        $('reader-prompt').value = prompt;
        if ($('reader-level')) $('reader-level').value = difficulty;
        $('reader-edit-error').textContent = message; renderPendingReaderResult();
      }
    }
    finally {
      const idlePathList = $('path-list');
      if (idlePathList) {
        if (idlePathList.dataset) idlePathList.dataset.disabled = '';
        idlePathList.querySelectorAll?.('button').forEach(item => { item.disabled = false; });
      }
      loading.remove(); state.activeChapterRequest = null; renderChapterRequest();
      state.readerEditBusy = false; $('reader-edit-cancel').disabled = false; $('reader-prompt').disabled = false;
      $('reader-level').disabled = false; setScopeDisabled($('reader-scope'), false); button.disabled = false;
      if (typeof showEditPanel !== 'function' || $('reader-edit-panel').hidden) { button.classList?.remove?.('is-danger'); button.textContent = mode === 'continue' ? 'Continue' : 'Rewrite'; }
      renderCheckpointRecovery();
    }

  });
  return {
    showEditPanel
  };
}
