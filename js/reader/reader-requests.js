// Reader AI requests: readerAi, saving or releasing pending responses, and Explain with follow-ups and examples.
// See docs/architecture/generation-pipeline.md (help requests).
// The code is the former js/reader-help.js section, moved verbatim; app.js calls createReaderRequests where it used to be.
import { PROMPT_VERSION, helpInstructions } from '../generation/prompts.js';
import { ai } from '../bridge.js';
import { aiNotification } from '../core/ai-notification.js';
import { appendFailureDetails, failureInfo, recoverySummary } from '../generation/generation-errors.js';
import { lightModelChoice, lightTaskConfig } from '../core/light-model.js';
import { markStoryActivity } from '../screens/library-activity.js';
import { saveBeforeAcknowledge } from '../core/request-lifecycle.js';
import { timingEntry } from '../generation/generation-timing.js';
import { helpContext, overlappingHelp, resolvedHelpContext, savedFollowUps, validTextRange } from './help-context.js';

export function createReaderRequests({
  $, activeChapter, activeVersion, aiSession, confirmReplaceHelp, createHelpLoading, finishGeneratedRequest,
  LANGUAGES, normalizeChapters, persistReaderStory, readerPanel, readerStory,
  recordSelectionLookup, renderCheckpointRecovery, renderReaderGeneration, renderSavedHelp,
  runContentOperation, runtime, setReaderGeneration, showOperationResult, state,
  stopBackgroundContext, toast, updateReader, workspaceStorage
}) {
  async function readerAi(kind, input, instructions, requestPanel, config = { providerId: state.providerId, model: state.model, reasoning: state.reasoning }) {
    if (config.signal?.stopped || config.signal?.cancelledByUser) throw new Error('Request cancelled.');
    workspaceStorage.assertWritable();
    if (state.pendingReaderResult) throw new Error('Save the completed response before starting another request.');
    // alongsideNotes: Define while a shown chapter's notes are still arriving. The notes operation owns
    // state.requestId, so this request keeps its own id and never touches that slot.
    const shared = !config.alongsideNotes;
    if (shared && state.requestId) throw new Error('Another AI request is still running. Wait for it to finish before starting another.');
    if (!ai.available) throw new Error('Connect an AI provider in App² Settings → AI first.');
    const model = state.models.find(item => item.id === config.model); if (!model) throw new Error(String(config.model || '').trim() ? 'The selected AI model is not available now. Open Settings and choose an available model.' : 'No AI model is selected. Open Settings and choose an AI model first.');
    const { providers } = await ai.providers();
    const connected = providers?.filter(provider => provider.connected) || [];
    const provider = connected.find(item => item.id === (config.providerId || state.providerId)) || connected[0];
    if (!provider) throw new Error('Connect an AI provider in App² Settings → AI first.');
    if (config.providerId && provider.id !== config.providerId) throw new Error('The available AI provider changed. Choose a model in Settings first.');
    const providerId = provider.id;
    if (shared) state.requestId = 'starting';
    let id; const startedAt = Date.now();
    try { id = await aiSession.start({ providerId, model: model.id, instructions, input: JSON.stringify({ kind, ...input }), reasoningEffort: model.reasoningLevels?.includes(config.reasoning) ? config.reasoning : undefined, ...aiNotification(kind) }); }
    catch (error) { if (shared) state.requestId = null; throw error; }
    if (shared) state.requestId = id;
    let running = true;
    config.onTaskStarted?.();
    const panel = requestPanel || (['continue','rewrite'].includes(kind) ? $('reader-edit-panel') : $('reader-help'));
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'small-btn reader-ai-cancel'; cancel.textContent = 'Cancel request';
    let cancelled = false;
    cancel.addEventListener('click', async () => { if (shared ? state.requestId !== id : !running) return; cancel.disabled = true; cancelled = true; if (config.signal) config.signal.cancelledByUser=true; try { await ai.cancel(id); } catch (error) { cancelled = false; cancel.disabled = false; toast(`Could not cancel: ${error.message}`); } });
    panel.append(cancel);
    if (config.signal?.cancelledByUser) cancel.click();
    renderReaderGeneration();
    try {
      const result = await ai.wait(id); if (cancelled) throw new Error('Request cancelled.'); state.pendingReaderRequestId = id;
      // Story-context summaries before Continue or Rewrite are the operation's first step; their times go with it.
      if (Array.isArray(config.signal?.timings) && ['summary','memory-compact'].includes(kind)) config.signal.timings.push(timingEntry({ stage: 'context', part: kind, model: model.id, reasoning: config.reasoning, startedAt, completedAt: Date.now(), outcome: 'ok' }));
      return result;
    }
    catch (error) {
      state.pendingReaderRequestId = id;
      try { await releaseInvalidReaderResponse(); } catch (releaseError) { error.releaseFailure = releaseError.message; }
      if (cancelled && config.signal && !config.signal.stopped) config.signal.cancelledByUser = true;
      throw cancelled ? new Error('Request cancelled.') : error;
    }
    finally { running = false; if (shared && state.requestId === id) state.requestId = null; cancel.remove(); }
  }
  async function acknowledgeReaderResult() {
    if (!state.pendingReaderRequestId) return;
    if (!state.pendingReaderResult?.saved) throw new Error('Save the completed response before starting another request.');
    const id = state.pendingReaderRequestId;
    try { await ai.acknowledge(id); } catch (error) { if (error.code !== 'not_found') throw error; }
    state.pendingReaderRequestId = null; state.pendingReaderResult = null;
  }
  async function releaseSavedInference() {
    if (state.pendingReaderResult?.saving) throw new Error('The completed response is still being saved.');
    if (state.pendingReaderResult && !state.pendingReaderResult.saved) throw new Error('Save the completed response before starting another request.');
    if (state.pendingGeneration) {
      if (!state.pendingGeneration.saved) throw new Error('Save the completed story before starting another request.');
      if (!await finishGeneratedRequest()) throw new Error(state.pendingGeneration?.error || 'Finish the completed story request first.');
    } else if (state.pendingStoryRequestId) {
      const id = state.pendingStoryRequestId; await ai.acknowledge(id);
      if (state.requestId === id) state.requestId = null; state.pendingStoryRequestId = null;
    }
    if (state.pendingReaderResult) await acknowledgeReaderResult();
    else await releaseInvalidReaderResponse();
  }
  async function releaseInvalidReaderResponse() {
    if (!state.pendingReaderRequestId || state.pendingReaderResult) return;
    try { await ai.acknowledge(state.pendingReaderRequestId); } catch (error) { if (error.code !== 'not_found') throw error; }
    state.pendingReaderRequestId = null;
  }
  async function savePendingReaderResult() {
    const pending = state.pendingReaderResult; if (!pending) return;
    if (pending.saving) throw new Error('The completed response is still being saved.');
    pending.saving = true;
    try {
      await saveBeforeAcknowledge({
        saved: pending.saved,
        apply: pending.apply,
        persist: () => persistReaderStory(pending.story),
        onSaved: () => {
          pending.saved = true;
          pending.onSaved?.();
        },
        acknowledge: acknowledgeReaderResult
      });
      if (!pending.alongsideNotes && runtime.readerGeneration?.storyId === pending.story.id && !(state.readerEditBusy && pending.story.memoryRebuild)) { runtime.readerGeneration.phase = 'ready'; runtime.readerGeneration.message = 'Ready'; }
    } catch (error) { pending.failure=failureInfo(error,'saving',pending.saved ? 'release' : 'save'); throw error; }
    finally { pending.saving = false; renderReaderGeneration(); }
  }
  function renderPendingReaderResult() {
    document.querySelectorAll('.reader-response-recovery').forEach(panel => panel.remove());
    const pending = state.pendingReaderResult;
    if (!pending || pending.story.id !== state.readerId) return;
    const location = pending.readerLocation;
    const chapter = activeChapter(), version = activeVersion(chapter);
    if (location && (location.chapterId !== chapter.id || location.versionId !== version.id)) return;
    const box = $('reader-help'); $('reader-help-section').hidden = false;
    const host = location?.helpId ? [...box.querySelectorAll('.help-card')].find(card => card.dataset.helpId === location.helpId) || box : box;
    const recovery=document.createElement('section'); recovery.className='recovery-panel reader-response-recovery';
    if (location?.followUp) { const question = document.createElement('p'); question.className = 'help-question help-text-selectable'; question.textContent = location.followUp; recovery.append(question); }
    const note = document.createElement('p'); note.textContent = pending.saved ? 'Response saved. Finish releasing the AI request to continue.' : `${pending.preview}\n\nThis completed response still needs saving.`;
    recovery.append(note);
    if (pending.failure) appendFailureDetails(recovery,pending.failure);
    const actions=document.createElement('div'); actions.className='recovery-actions';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-btn save-generated-retry'; retry.textContent = pending.saved ? 'Finish request' : 'Save response';
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      try { await savePendingReaderResult(); if (state.readerId === pending.story.id) updateReader(); toast('Response saved'); }
      catch (error) { note.textContent = `${pending.preview}\n\n${error.message}`; retry.disabled = false; }
    });
    actions.append(retry); recovery.append(actions); host.append(recovery);
  }
  function decodeHelp(text, action = 'initial') {
    if (action === 'detail') {
      const raw = String(text || '').trim();
      if (!raw) throw new Error('The AI response was incomplete or invalid.');
      const legacy = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      try {
        const value = JSON.parse(legacy);
        if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.explanation === 'string' && value.explanation.trim()) {
          return { explanation: value.explanation };
        }
      } catch { /* Plain text is the current detail contract. */ }
      return { explanation: raw };
    }
    let value;
    try { value = JSON.parse(String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { throw new Error('The AI response was not valid JSON.'); }
    const fail = () => { throw new Error('The AI response was incomplete or invalid.'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    if (action === 'examples') {
      if (!Array.isArray(value.examples) || value.examples.length !== 3) fail();
      for (const example of value.examples) {
        if (!example || typeof example.sentence !== 'string' || !example.sentence.trim() || typeof example.translation !== 'string' || !example.translation.trim() || !validTextRange(example.sentence, example.highlightStart, example.highlightEnd)) fail();
        if (example.segments !== undefined && (!Array.isArray(example.segments) || !example.segments.every(part => part && typeof part.text === 'string' && (part.reading === undefined || typeof part.reading === 'string')) || example.segments.map(part => part.text).join('') !== example.sentence)) fail();
      }
    } else if (typeof value.explanation !== 'string' || !value.explanation.trim() || (value.contextTranslation !== undefined && typeof value.contextTranslation !== 'string')) fail();
    return value;
  }
  async function explainSelection(kind = 'explain', action = 'initial', followUp = '', selected = state.readerSelection, onTaskStarted, followUpEdit) {
    const passage = selected; if (!passage) return;
    if (runtime.backgroundRun) await stopBackgroundContext();
    if (state.checkpointBlocked || runtime.pipeline?.records.length || state.readerHelpBusy || state.readerEditBusy || state.requestId) { toast('Another AI request is still running. Wait for it to finish.'); return; }
    const story = readerStory();
    const chapter = normalizeChapters(story).find(item => item.id === passage.chapterId);
    const version = chapter?.versions.find(item => item.id === passage.versionId);
    if (story.id !== passage.storyId || !version) return;
    if (!validTextRange(version.story, passage.start, passage.end) || version.story.slice(passage.start, passage.end) !== passage.text) { toast('Select the passage again to request help.'); return; }
    const existingHelp = action !== 'initial' ? chapter.help?.find(entry => entry.id === passage.helpId) : null;
    if (action !== 'initial' && !existingHelp) return;
    if (followUpEdit && (existingHelp !== followUpEdit.item || !savedFollowUps(existingHelp)[followUpEdit.index]?.followUp)) return;
    if (action === 'initial') {
      const overlaps = overlappingHelp(chapter, version.id, passage.start, passage.end);
      if (overlaps.length && !await confirmReplaceHelp(overlaps)) return;
    }
    const providerId = state.providerId, model = state.model, reasoning = state.reasoning;
    // Explain and More detail use the light model when Settings → Advanced ticks Explanations; Examples go
    // through the pipeline, which applies the Examples task itself.
    const explainConfig = lightTaskConfig(state, 'explanations');
    state.readerHelpBusy = true;
    try {
      try { persistReaderStory(story); await releaseSavedInference(); }
      catch (error) { toast(error.message); renderPendingReaderResult(); return; }
      if (!onTaskStarted) $('selection-toolbar').hidden = true;
      const box = $('reader-help');
      const helpRequest = { storyId: story.id, chapterId: chapter.id, versionId: version.id, helpId: existingHelp?.id || '', action, loading: createHelpLoading(action, followUp) };
      state.activeHelpRequest = helpRequest;
      setReaderGeneration({ storyId: story.id, pathId: story.activePathId, chapterId: chapter.id, versionId: version.id, helpId: existingHelp?.id, phase: 'working', message: action === 'initial' ? 'Explaining selection…' : action === 'detail' ? 'Writing more detail…' : 'Generating examples…' });
      renderSavedHelp(chapter, version);
      const clearLoading = () => {
        if (state.activeHelpRequest === helpRequest) state.activeHelpRequest = null;
        helpRequest.loading.remove();
      };
      try {
        const context = helpContext(version.story, passage.start, passage.end);
        const savedHistory = existingHelp ? savedFollowUps(existingHelp) : [];
        const retainedHistory = followUpEdit ? savedHistory.slice(0, followUpEdit.index) : savedHistory;
        const promptHistory = followUpEdit ? retainedHistory.filter(entry => entry.action !== 'examples') : retainedHistory;
        const previousExplanation = existingHelp ? JSON.stringify({ explanation: existingHelp.text, followUps: promptHistory.map(entry => ({ action: entry.action || 'detail', question: entry.followUp || '', text: entry.text || '', examples: entry.examples })) }) : '';
        const helpInput={ action, language:LANGUAGES[story.language], languageCode:story.language, difficulty:story.difficulty, sourceText:version.story, start:passage.start, end:passage.end, passage:passage.text, ...context, profile:passage.profile, followUp, previousExplanation };
        if (action === 'examples') {
          const op=await runContentOperation({kind:'examples',language:story.language,input:helpInput,instructions:helpInstructions(action),config:{providerId,model,reasoning,light:lightModelChoice(state),retryBroken:state.retryBrokenReplies !== false},target:{storyId:story.id,chapterId:chapter.id,versionId:version.id,helpId:existingHelp.id,start:passage.start,end:passage.end,passage:passage.text}});
          clearLoading(); recordSelectionLookup(passage, 'examples'); showOperationResult(op); return;
        }
        const result = decodeHelp(await readerAi(kind, helpInput, helpInstructions(action), helpRequest.loading, {
          ...explainConfig, onTaskStarted
        }), action);
        clearLoading();
        const item = { id: crypto.randomUUID?.() || `help-${Date.now()}`, kind, action, passage: passage.text, start: passage.start, end: passage.end, chapterId: passage.chapterId, versionId: passage.versionId, text: result.explanation || '', followUp, profile: passage.profile, createdAt: new Date().toISOString(), providerId: explainConfig.providerId, model: explainConfig.model, promptVersion: PROMPT_VERSION };
        if (action === 'examples') item.examples = result.examples;
        if (action === 'initial') Object.assign(item, resolvedHelpContext(version.story, passage, result));
        if (runtime.readerGeneration) runtime.readerGeneration.helpId = existingHelp?.id || item.id;
        const preview = action === 'examples' ? result.examples.map(example => `${example.sentence}\n${example.translation}`).join('\n\n') : item.text;
        state.pendingReaderResult = { story, saved: false, preview, followUpEdit, readerLocation: { chapterId: chapter.id, versionId: version.id, helpId: existingHelp?.id || '', followUp }, onSaved: followUpEdit ? () => {
          if (state.followUpEdit === followUpEdit) state.followUpEdit = null;
          if (state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id) {
            const panel = readerPanel(), current = panel.scrollTop;
            renderSavedHelp(chapter, version); panel.scrollTop = current;
          }
        } : undefined, apply() {
          // Saved with the explanation in the one write; the returned rollback restores the previous value or its absence.
          const undoActivity = markStoryActivity(story);
          if (existingHelp) {
            const before = { ...existingHelp };
            const followUps = [...retainedHistory, item];
            Object.assign(existingHelp, { followUps });
            // Retain the legacy latest-detail fields for older readers.
            if (action === 'detail') Object.assign(existingHelp, { more: item.text, detailProvenance: item });
            return () => { for (const key of Object.keys(existingHelp)) delete existingHelp[key]; Object.assign(existingHelp, before); undoActivity(); };
          }
          const before = chapter.help || [];
          const replaced = new Set(overlappingHelp(chapter, version.id, item.start, item.end));
          chapter.help = [...before.filter(entry => !replaced.has(entry)), item];
          return () => { chapter.help = before; undoActivity(); };
        } };
        // The learner may have kept reading during the request: the re-render keeps where they are now, not where they asked.
        try { await savePendingReaderResult(); }
        catch { if (state.readerId === story.id) renderPendingReaderResult(); return; }
        if (!followUpEdit && state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id) {
          const panel = readerPanel(), current = panel.scrollTop;
          renderSavedHelp(chapter, version); panel.scrollTop = current;
        }
        recordSelectionLookup(passage, action === 'initial' ? 'explain' : action);
      } catch (error) {
        clearLoading();
        const cancelled = error.message === 'Request cancelled.' || error.code === 'generation_cancelled';
        try { await releaseInvalidReaderResponse(); } catch {}
        if (runtime.readerGeneration?.storyId === story.id) {
          setReaderGeneration(cancelled
            ? (state.pendingReaderRequestId ? { ...runtime.readerGeneration, phase: 'cleanup', message: 'Could not finish cancelled request.' } : null)
            : { ...runtime.readerGeneration, phase: 'error', message: 'Request stopped.' });
        }
        if (state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id) {
          renderSavedHelp(chapter, version);
          const card = existingHelp ? [...box.querySelectorAll('.help-card')].find(node => node.dataset.helpId === existingHelp.id) : null;
          const form = action === 'detail' && !followUpEdit ? card?.querySelector('.help-follow-up') : null;
          if (form) {
            form.hidden = false;
            const input = form.querySelector('input'); if (input) input.value = followUp;
            const button = card.querySelector('.help-actions button'); if (button) { button.hidden = true; button.setAttribute('aria-expanded', 'true'); }
          }
          if (cancelled) { if (!state.pendingReaderRequestId) toast('Request cancelled'); return; }
          if (runtime.pipeline?.records.length) { renderCheckpointRecovery(); return; }
          const recovery = document.createElement('section'); recovery.className='recovery-panel help-request-recovery';
          const note = document.createElement('p'); note.setAttribute('role','alert');
          note.textContent = recoverySummary({kind:action === 'initial' ? 'explain' : action,error:error.message,failure:failureInfo(error,action)}); recovery.append(note);
          appendFailureDetails(recovery, failureInfo(error,action));
          const actions=document.createElement('div'); actions.className='recovery-actions';
          const retry=document.createElement('button'); retry.type='button'; retry.className='secondary-btn'; retry.textContent=state.pendingReaderRequestId ? 'Finish request' : 'Retry';
          const retrySelection=JSON.parse(JSON.stringify(passage));
          retry.addEventListener('click', async () => {
            if (state.readerHelpBusy || state.requestId) return;
            if (state.readerId !== retrySelection.storyId) return;
            retry.disabled=true;
            try {
              const finishing=retry.textContent === 'Finish request';
              await releaseInvalidReaderResponse();
              if (finishing) {
                if (followUpEdit) { recovery.remove(); return; }
                retry.textContent='Retry'; note.textContent='Previous request finished. Retry to request a new response.'; return;
              }
              recovery.remove();
              await explainSelection(kind,action,followUp,retrySelection);
            } catch (releaseError) { note.textContent='Could not finish the previous request. Try Finish request again.'; }
            finally { retry.disabled=false; }
          });
          if (!followUpEdit || state.pendingReaderRequestId) { actions.append(retry); recovery.append(actions); }
          if (form) form.append(recovery); else (card || box).append(recovery);
          $('reader-help-section').hidden = false;
        }
      } finally { clearLoading(); }
    } finally { state.readerHelpBusy = false; renderReaderGeneration(); }
  }
  return {
    explainSelection, readerAi, releaseInvalidReaderResponse, releaseSavedInference, renderPendingReaderResult,
    savePendingReaderResult
  };
}
