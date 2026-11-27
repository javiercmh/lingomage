// Saved generation operations: progress cards, generation locks, the recovery panels (Resume, Retry, Discard, Cancel),
// resuming a checkpoint and starting a new content operation. See docs/architecture/generation-pipeline.md.
// The code is the former app.js section, moved verbatim; app.js calls createCheckpointRecovery where it used to be.
import { PROMPT_VERSION } from './prompts.js';
import { SAFEGUARD_VERSION } from './learning-validation.js';
import { appendFailureDetails, discardFailureMessage, failureInfo, operationLabel, recoverySummary } from './generation-errors.js';
import { chapterLoadingCopy, progressSummary } from './generation-progress.js';
import { continueChapterNumber, continueResultPathId } from '../core/story-model.js';
import { pendingRequests } from './generation-pipeline.js';

export function createCheckpointRecovery({
  $, aiSession, closeReader, createChapterLoading, createProgressView, ensureReaderOpen, generationAction,
  isViewingChapter, LANGUAGES, notesProgressMessage, notifyStopped, paintProgress, PROFILE_DEFINITIONS,
  renderChapterRequest, renderReaderGeneration, revealCard, runtime, setReaderGeneration, setScopeDisabled,
  setView, showOperationResult, state, stopBackgroundContext, toast, workspaceStorage
}) {
  let createProgress = null, resumedCreateCard = false;
  function paintChapterProgress(request, op) {
    const loading = request.loading;
    if (!loading.progress) { loading.progress = createProgressView(); loading.progress.clockId = request.clockId; loading.progress.presetEstimate = request.estimate; loading.querySelector('.help-loading-copy').append(loading.progress); loading.classList.add('has-progress'); }
    paintProgress(loading.progress, op);
  }
  function createProgressRoot() { if (!createProgress) { createProgress = createProgressView(); $('generation-status').after(createProgress); } return createProgress; }
  function applyGenerationLocks() {
    const op = runtime.pipeline?.records[0], busy = Boolean(runtime.pipeline?.busy);
    $('generate').disabled = Boolean(state.storageBlocked || state.checkpointBlocked || op || busy);
    if (!runtime.pipeline) return;
    for (const id of ['topic','language','difficulty','reading-scope']) $(id).disabled = Boolean(op?.kind === 'create' || busy);
    setScopeDisabled($('reading-scope'), Boolean(op?.kind === 'create' || busy));
    const readerFrozen = !!(state.readerEditBusy || op && op.target?.storyId === state.readerId && ['continue','rewrite'].includes(op.kind));
    for (const id of ['reader-prompt','reader-level','reader-edit-submit','continue-story','rewrite-chapter','reader-menu-continue','reader-menu-rewrite']) $(id).disabled=readerFrozen;
    const pathList=$('path-list');
    if (pathList) {
      if (pathList.dataset) pathList.dataset.disabled=readerFrozen ? 'true' : '';
      pathList.querySelectorAll?.('button').forEach(button=>{ button.disabled=readerFrozen; });
    }
    setScopeDisabled($('reader-scope'), readerFrozen);
    $('reader-edit-submit').disabled=Boolean(readerFrozen || op || busy || state.storageBlocked || state.checkpointBlocked);
  }
  function renderCheckpointRecovery() {
    if (!runtime.pipeline) return;
    const op = runtime.pipeline.records[0];
    applyGenerationLocks();
    const taskLabel=operationLabel(op, state.stories, LANGUAGES[op?.language]);
    let notice=$('reader-pending-progress');
    if (!notice) {
      notice=document.createElement('section'); notice.id='reader-pending-progress'; notice.className='pending-progress';
      const copy=document.createElement('div');
      const heading=document.createElement('strong'); heading.className='recovery-heading';
      const task=document.createElement('span'); task.className='recovery-task';
      const instruction=document.createElement('span'); instruction.className='helper';
      copy.append(heading,task,instruction);
      const button=document.createElement('button'); button.type='button'; button.className='small-btn'; button.textContent='Review unfinished generation';
      button.addEventListener('click',()=>showPendingRecovery()); notice.append(copy,button); $('reader-edit-panel').before(notice);
    }
    // Create and the owning reader already provide full recovery controls on the same screen.
    notice.hidden=!op || runtime.pipeline.busy || op.target?.storyId === state.readerId;
    const heading=notice.querySelector('.recovery-heading'), task=notice.querySelector('.recovery-task'), instruction=notice.querySelector('.helper');
    if (heading) heading.textContent=op?.discardRequested ? 'A cancelled generation needs attention' : 'An unfinished generation needs attention';
    if (task) task.textContent=taskLabel;
    if (instruction) instruction.textContent=op?.discardRequested ? discardFailureMessage(op) : 'Finish it or discard it before starting another generation.';
    const stageMessage=op?.discardRequested ? 'Cancelling…' : op?.kind === 'examples' && op.stage === 'prose' ? 'Generating examples…' : op?.stage === 'plan' ? 'Planning suitable language…' : op?.stage === 'notes' ? 'Adding vocabulary notes…' : op?.stage === 'readings' ? 'Adding kanji readings…' : op?.stage === 'enrich' ? (Object.keys(op.parallel || {}).some(name => name.startsWith('readings')) ? 'Adding kanji readings and vocabulary notes…' : 'Adding vocabulary notes…') : op?.kind === 'continue' ? 'Writing the next chapter…' : op?.kind === 'rewrite' ? 'Rewriting this chapter…' : 'Writing your story…';
    // A running operation always uses the same status card, whether it started here or was resumed from recovery.
    if (op && runtime.pipeline.busy && op.kind === 'create' && !runtime.creatingStory && $('loading-card').hidden) { resumedCreateCard = true; $('story-form').hidden = true; $('loading-card').hidden = false; }
    if (resumedCreateCard && !runtime.pipeline.busy) { resumedCreateCard = false; $('loading-card').hidden = true; $('story-form').hidden = false; }
    if (op && runtime.pipeline.busy && ['continue','rewrite'].includes(op.kind)) {
      if (op.target?.storyId === state.readerId && $('reader-edit-panel')) $('reader-edit-panel').hidden = true;
      if (!state.activeChapterRequest) {
        const copy = typeof chapterLoadingCopy === 'function' ? chapterLoadingCopy(op.kind, op.target) : null;
        state.activeChapterRequest = { storyId: op.target.storyId, loading: createChapterLoading(op.kind, copy), resumed: true, opened: false };
        renderChapterRequest();
      }
    }
    if (state.activeChapterRequest?.resumed && !runtime.pipeline.busy) { state.activeChapterRequest.loading.remove(); state.activeChapterRequest = null; renderChapterRequest(); }
    if (op && runtime.pipeline.busy) {
      if (op.kind === 'create') { $('generation-status').textContent=stageMessage; paintProgress(createProgressRoot(), op); }
      if (runtime.readerGeneration && (runtime.readerGeneration.storyId ?? null) === (op.target?.storyId ?? null)) {
        runtime.readerGeneration.phase = 'working';
        if (op.discardRequested) {
          delete runtime.readerGeneration.readyTarget;
          runtime.readerGeneration.message = 'Cancelling…';
        } else if (op.earlyApplied && op.kind === 'continue') {
          const base = Array.isArray(op.target?.baseEntries) ? op.target.baseEntries : (op.target?.entries || []);
          const num = typeof continueChapterNumber === 'function' ? continueChapterNumber(op) : (base.length + 1);
          const resultPathId = typeof continueResultPathId === 'function' ? continueResultPathId(op) : (op.target?.continueMode === 'branch' ? `path-${op.id}` : op.target?.pathId);
          const isBranch = op.target?.continueMode === 'branch';
          const notesText = typeof notesProgressMessage === 'function' ? notesProgressMessage(op) : 'Adding notes…';
          const viewingNew = typeof isViewingChapter === 'function' && isViewingChapter({ storyId: op.target?.storyId, pathId: resultPathId, chapterId: `chapter-${op.id}`, versionId: `version-${op.id}` });
          if (viewingNew) {
            delete runtime.readerGeneration.readyTarget;
            runtime.readerGeneration.message = notesText;
          } else {
            runtime.readerGeneration.readyTarget = { storyId: op.target?.storyId, pathId: resultPathId, chapterId: `chapter-${op.id}`, versionId: `version-${op.id}`, chapterNumber: num, isBranch };
            runtime.readerGeneration.message = `${isBranch ? 'Parallel ' : ''}Chapter ${num} ready · ${notesText}`;
          }
        } else if (op.earlyApplied) {
          runtime.readerGeneration.message = typeof notesProgressMessage === 'function' ? notesProgressMessage(op) : 'Adding notes…';
        } else {
          runtime.readerGeneration.message = progressSummary(op).text;
        }
      }
      if (state.activeChapterRequest && state.activeChapterRequest.storyId === op.target?.storyId) {
        state.activeChapterRequest.loading.querySelector('strong').textContent = stageMessage;
        paintChapterProgress(state.activeChapterRequest, op);
        const openBtn = state.activeChapterRequest.loading.openReadyButton;
        if (openBtn) {
          const showOpen = Boolean(op.earlyApplied && op.kind === 'continue' && runtime.readerGeneration?.readyTarget);
          openBtn.hidden = !showOpen;
          if (showOpen) {
            const base = Array.isArray(op.target?.baseEntries) ? op.target.baseEntries : (op.target?.entries || []);
            const num = typeof continueChapterNumber === 'function' ? continueChapterNumber(op) : (base.length + 1);
            openBtn.textContent = `Read Chapter ${num}`;
            state.activeChapterRequest.loading.onOpenReady = () => generationAction();
          }
        }
      }
    }
    for (const id of ['checkpoint-recovery-create','checkpoint-recovery-profile','checkpoint-recovery-reader']) {
      const box = $(id);
      if (id === 'checkpoint-recovery-reader') { const anchor = op?.kind === 'examples' ? $('reader-help-section') : $('reader-edit-panel'); if (anchor.nextElementSibling !== box) anchor.after?.(box); }
      const hidden = !op || id === 'checkpoint-recovery-reader' && (op.target?.storyId !== state.readerId || runtime.pipeline.busy && state.activeChapterRequest?.storyId === op.target?.storyId) || id === 'checkpoint-recovery-create' && runtime.pipeline.busy && !$('loading-card').hidden;
      const messageText = !op ? '' : runtime.pipeline.busy ? stageMessage : op.discardRequested ? recoverySummary(op) : op.promptVersion !== PROMPT_VERSION || op.safeguardVersion !== SAFEGUARD_VERSION ? 'This saved request belongs to an older app definition. Discard it to start with the current requirements.' : recoverySummary(op);
      const resumeText = !op ? '' : op.discardRequested ? 'Try again' : op.stage === 'applied' || pendingRequests(op).some(request => request.completed) ? 'Finish request' : op.stage === 'ready' ? 'Save response' : op.error ? 'Retry' : 'Resume';
      const resumeBlocked = Boolean(op) && Boolean(state.storageBlocked || runtime.pipeline.busy || !op.discardRequested && ( /older app definition|destination.*no longer|source explanation changed|destination path changed/i.test(op.error || '') || op.promptVersion !== PROMPT_VERSION || op.safeguardVersion !== SAFEGUARD_VERSION));
      const failure=op?.failure || (op?.error ? failureInfo(new Error(op.error),op.stage) : null);
      const neutral=Boolean(runtime.pipeline.busy || !op?.discardRequested && (!failure || ['cancelled','background','unavailable'].includes(failure.category)));
      // Rebuilding would drop keyboard focus and make screen readers repeat an unchanged alert.
      const signature = JSON.stringify([hidden, op?.id, messageText, resumeText, resumeBlocked, runtime.pipeline.busy, op?.error, op?.failure, taskLabel, neutral]);
      if (box.dataset.rendered === signature) continue;
      box.dataset.rendered = signature; box.textContent=''; box.hidden = hidden;
      box.className=neutral ? 'recovery-panel recovery-neutral' : 'recovery-panel';
      if (hidden) continue;
      const message = document.createElement('p'); message.className='helper'; message.setAttribute('role','status');
      const heading=document.createElement('strong'); heading.className='recovery-heading'; heading.textContent=runtime.pipeline.busy ? 'Generation in progress' : op.discardRequested ? 'Generation needs attention' : 'Unfinished generation';
      const task=document.createElement('span'); task.className='recovery-task'; task.textContent=taskLabel;
      const explanation=document.createElement('span'); explanation.textContent=messageText;
      message.append(heading,task,explanation);
      if (op.error) message.setAttribute('role', 'alert');
      const resume = document.createElement('button'); resume.type='button'; resume.className='secondary-btn'; resume.textContent=resumeText; resume.disabled=resumeBlocked;
      resume.addEventListener('click', () => resumeCheckpoint(op));
      const discard = document.createElement('button'); discard.type='button'; discard.className=runtime.pipeline.busy ? 'small-btn reader-ai-cancel' : 'small-btn'; discard.textContent=op.discardRequested && runtime.pipeline.busy ? 'Cancelling…' : runtime.pipeline.busy ? 'Cancel request' : 'Discard'; discard.disabled=Boolean(runtime.pipeline.busy && op.discardRequested);
      discard.addEventListener('click', async () => {
        try {
          if (runtime.pipeline.busy) {
            discard.disabled=true;
            await runtime.pipeline.cancel();
          } else { await runtime.pipeline.discard(op); if (runtime.readerGeneration?.storyId === op.target?.storyId && runtime.readerGeneration?.phase !== 'ready') setReaderGeneration(null); toast('Unfinished generation discarded'); }
        } catch (error) { op.failure=failureInfo(error,op.stage); op.error=op.failure.message; }
        finally { discard.disabled=Boolean(runtime.pipeline.busy && op.discardRequested); renderCheckpointRecovery(); }
      });
      box.append(message);
      if (op.error) appendFailureDetails(box, op.failure || failureInfo(new Error(op.error), op.stage));
      // While the operation runs, Resume has nothing to do; only Cancel request is offered.
      const actions = document.createElement('div'); actions.className='recovery-actions'; actions.append(...(runtime.pipeline.busy ? [discard] : op.discardRequested ? [resume] : [resume, discard])); box.append(actions);
    }
    renderReaderGeneration(); // Re-evaluate visibility after the recovery panels have been updated.
  }
  async function resumeCheckpoint(op) {
    if (state.storageBlocked) { toast('Retry loading your workspace before resuming generation.'); return; }
    if (!runtime.pipeline.records.includes(op) || runtime.pipeline.busy) return;
    if (runtime.backgroundRun) { await stopBackgroundContext(); if (!runtime.pipeline.records.includes(op) || runtime.pipeline.busy) return; }
    if (state.requestId || state.readerEditBusy || state.readerHelpBusy || state.pendingReaderResult || state.pendingGeneration) { toast('Finish the active request first.'); return; }
    try {
      if (op.discardRequested) { await runtime.pipeline.discard(op); setReaderGeneration(null); toast('Generation cancelled'); return; }
      if (op.promptVersion !== PROMPT_VERSION || op.safeguardVersion !== SAFEGUARD_VERSION) throw new Error('This saved operation belongs to an older app definition. Discard it to start with the current requirements.');
      if (state.readerEditDraft && state.readerEditDraft.storyId === op.target?.storyId) {
        state.readerEditDraft.error = '';
        $('reader-edit-error').textContent = '';
      }
      setReaderGeneration({storyId:op.target?.storyId ?? null,phase:'working',message:'Resuming saved progress…'});
      if (pendingRequests(op).some(request => request.completed) && !['ready','applied'].includes(op.stage)) { await runtime.pipeline.finishRequest(op); setReaderGeneration(null); return; }
      if (op.config && !String(op.config.model || '').trim() && String(state.model || '').trim()) {
        op.config = { ...op.config, providerId: state.providerId || op.config.providerId || '', model: state.model, reasoning: state.reasoning };
      }
      // An outstanding request is polled, saved and acknowledged by the pipeline before any new request,
      // and so before any session is opened (sessions open lazily at the next ai.start).
      await aiSession.run(() => runtime.pipeline.run(op)); showOperationResult(op);
    } catch (error) {
      if (error.code === 'generation_cancelled') { setReaderGeneration(null); toast('Generation cancelled'); return; }
      notifyStopped(op.kind);
      op.error=failureInfo(error,op.stage).message; if (op.failure?.message !== failureInfo(error,op.stage).message) op.failure = failureInfo(error, op.stage);
      if (runtime.readerGeneration && (runtime.readerGeneration.storyId ?? null) === (op.target?.storyId ?? null)) setReaderGeneration({...runtime.readerGeneration,phase:'error',message:op.discardRequested ? discardFailureMessage(op) : 'Generation stopped.'});
      renderCheckpointRecovery(); revealRecovery(op);
    }
  }
  async function showPendingRecovery() {
    const op=runtime.pipeline?.records[0]; if (!op) return;
    const story=state.stories.find(item=>item.id === op.target?.storyId);
    if (story) await ensureReaderOpen(story);
    else { await closeReader(); setView('create'); }
    renderCheckpointRecovery(); revealRecovery(op);
  }
  function revealRecovery(op) {
    const box = op?.target?.storyId === state.readerId && $('reader-dialog').open ? $('checkpoint-recovery-reader') : $('checkpoint-recovery-create');
    if (box.id === 'checkpoint-recovery-reader') { revealCard(box); return; }
    requestAnimationFrame(() => { if (!box.hidden) { box.tabIndex=-1; box.focus({preventScroll:true}); box.scrollIntoView({block:'nearest',behavior:'smooth'}); } });
  }
  async function runContentOperation(spec) {
    workspaceStorage.assertWritable();
    if (!String(spec?.config?.model || '').trim()) throw new Error('No AI model is selected. Open Settings and choose an AI model before generating.');
    if (runtime.pipeline.records.length) throw new Error('Resume or discard the pending generation before starting another.');
    const op = runtime.pipeline.create({...spec, promptVersion:PROMPT_VERSION, profileVersion:PROFILE_DEFINITIONS.version, planned:!['examples','notes'].includes(spec.kind)});
    await aiSession.run(() => runtime.pipeline.run(op));
    return op;
  }
  return {
    applyGenerationLocks, createProgressRoot, paintChapterProgress, renderCheckpointRecovery, resumeCheckpoint,
    revealRecovery, runContentOperation, showPendingRecovery
  };
}
