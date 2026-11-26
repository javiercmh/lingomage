// Create: generating a new story from the form, its cancel control, the saved-progress recovery panel and
// saving the generated story to the Library.
// The code is the former app.js section, moved verbatim except that bindings other app.js code reassigns are
// read through accessors (currentPipeline(), currentReaderGeneration(), currentBackgroundRun(), setCreatingStory()).
// app.js calls createCreateFlow where the section used to be.
import { ai } from './bridge.js';
import { storyInstructions } from './prompts.js';
import { lightModelChoice } from './light-model.js';
import { parallelLimitFor } from './generation-pipeline.js';
import { recoverySummary, failureInfo, appendFailureDetails, discardFailureMessage } from './generation-errors.js';
import { saveBeforeAcknowledge } from './request-lifecycle.js';

export function createCreateFlow({
  $, LANGUAGES, PROFILE_DEFINITIONS, createProgressRoot, currentBackgroundRun, currentPipeline,
  currentReaderGeneration, guideFor, noteParts, notifyStopped, openReader, persistReaderStory,
  populateDifficulty, readingDescription, renderCheckpointRecovery, renderReaderGeneration, revealRecovery,
  runContentOperation, setCreatingStory, setReaderGeneration, showOperationResult, showPendingRecovery,
  showStorageErrors, state, stopBackgroundContext, storyInput, toast
}) {
  async function generate(event) {
    event.preventDefault(); $('form-error').textContent = ''; $('create-error-details').textContent='';
    if (state.checkpointBlocked || currentPipeline()?.records.length) { if (currentPipeline()?.records.length) showPendingRecovery(); else showStorageErrors(); return; }
    if (state.pendingReaderResult) { $('form-error').textContent = 'Save the completed reader response before generating another story.'; return; }
    if (state.pendingGeneration) { $('form-error').textContent = 'Finish saving the completed story before generating another.'; return; }
    if (currentBackgroundRun()) await stopBackgroundContext();
    if (state.requestId || state.readerEditBusy || state.readerHelpBusy) { $('form-error').textContent = 'Finish the current AI request before generating another story.'; return; }
    if (!ai.available) { $('form-error').textContent = 'Open App² → Settings → AI and connect a provider, then return here.'; return; }
    try {
      const {providers} = await ai.providers();
      const connected = providers?.filter(provider => provider.connected) || [];
      const provider = connected.find(item => item.id === state.providerId) || connected[0];
      if (!provider) throw new Error('Open App² → Settings → AI and connect a provider, then return here.');
      if (state.providerId && state.providerId !== provider.id) {
        state.model = ''; state.reasoning = ''; state.models = [];
      }
      state.providerId = provider.id;
      const modelsResult = await ai.models(provider.id);
      state.models = modelsResult.models || [];
      const model = state.models.find(item => item.id === state.model);
      if (!model) throw new Error(String(state.model || '').trim() ? 'The selected AI model is not available now. Open Settings and choose an available model.' : 'No AI model is selected. Open Settings and choose an AI model before generating.');
      state.model = model.id;
      const chosenEffort = model.reasoningLevels?.includes(state.reasoning) ? state.reasoning : undefined;
      const languageCode = $('language').value, difficulty = $('difficulty').value;
      const requestInput = storyInput();
      const requestProfile = JSON.parse(requestInput);
      $('story-form').hidden = true; $('loading-card').hidden = false; { const root = createProgressRoot(); root.hidden = true; delete root.dataset.signature; }
      setCreatingStory(true); setReaderGeneration({storyId:null,phase:'working',message:'Writing your story…'});
      $('generation-status').textContent = ai.developmentMock ? 'Using the offline development response.' : 'Weaving your ideas into a story.';
      const op = await runContentOperation({kind:'create', language:languageCode, input:requestProfile, profileVersion:PROFILE_DEFINITIONS.version, instructions:storyInstructions(LANGUAGES[languageCode],difficulty,guideFor(languageCode,difficulty)), config:{providerId:provider.id,model:model.id,reasoning:chosenEffort,light:lightModelChoice(state),notesParts:noteParts(),parallelLimit:parallelLimitFor(state.aiStartLimit),noteDensity:state.noteDensity,progressive:true,retryBroken:state.retryBrokenReplies !== false}});
      showOperationResult(op);
    } catch (error) {
      if (error.code === 'generation_cancelled') { setReaderGeneration(null); toast('Generation cancelled'); return; }
      notifyStopped('create');
      if (state.requestId && !state.pendingGeneration && !currentPipeline()?.records.length) {
        try { await ai.acknowledge(state.requestId); state.requestId = null; state.pendingStoryRequestId = null; }
        catch (releaseError) { error.message = `${error.message} The AI result still needs release: ${releaseError.message}`; }
      }
      const op = currentPipeline()?.records[0];
      $('form-error').textContent = op ? '' : recoverySummary({kind:'create',stage:'setup',error:error.message,failure:failureInfo(error,'setup')});
      if (!op) appendFailureDetails($('create-error-details'), failureInfo(error,'setup'));
      else requestAnimationFrame(()=>revealRecovery(op));
      // A deliberate cancel leaves no status; a failure with saved progress points to its recovery.
      if (currentReaderGeneration()?.storyId == null) setReaderGeneration(op ? {storyId:null,phase:'error',message:op.discardRequested ? discardFailureMessage(op) : 'Story generation stopped.'} : null);
    } finally { setCreatingStory(false); $('loading-card').hidden = true; $('story-form').hidden = false; renderCheckpointRecovery(); renderReaderGeneration(); }
  }
  $('story-form').addEventListener('submit', generate);
  $('language').addEventListener('change', () => populateDifficulty());
  $('difficulty').addEventListener('change', () => { $('difficulty-description').textContent = readingDescription($('language').value,$('difficulty').value); });
  $('cancel-generation').addEventListener('click', async () => { try { await currentPipeline().cancel(); } catch (error) { toast(error.message); } });

  function renderRecoveryPanel(container, pending, savedLabel) {
    container.textContent = ''; container.hidden = !pending;
    if (!pending) return;
    const note = document.createElement('p'); note.className = 'helper';
    note.textContent = pending.error || (pending.saved ? savedLabel : 'The completed story is waiting to be saved.');
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-btn';
    retry.textContent = pending.saved ? 'Finish request' : 'Retry save';
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      if (pending.saved) await finishGeneratedRequest();
      else await saveGeneratedStory();
      retry.disabled = false;
    });
    container.append(note, retry);
  }
  function renderGenerationRecovery() {
    const pending = state.pendingGeneration;
    renderRecoveryPanel($('generation-recovery-create'), pending, 'Story saved. Finish releasing the AI request to continue.');
    renderRecoveryPanel($('generation-recovery-reader'), pending?.saved ? pending : null, 'Story saved. Finish releasing the AI request to continue.');
  }
  async function finishGeneratedRequest() {
    const pending = state.pendingGeneration;
    if (!pending?.saved) return false;
    try {
      await saveBeforeAcknowledge({ saved: true, acknowledge: () => ai.acknowledge(pending.requestId) });
      if (state.requestId === pending.requestId) state.requestId = null;
      state.pendingStoryRequestId = null; state.pendingGeneration = null;
      renderGenerationRecovery(); return true;
    } catch (error) {
      pending.error = `Story saved. Could not finish the AI request: ${error.message}`;
      renderGenerationRecovery(); return false;
    }
  }
  async function saveGeneratedStory() {
    const pending = state.pendingGeneration;
    if (!pending) return false;
    try {
      await saveBeforeAcknowledge({
        saved: pending.saved,
        apply: () => () => {},
        persist: () => persistReaderStory(pending.story),
        onSaved: () => { pending.saved = true; pending.error = ''; },
        acknowledge: () => ai.acknowledge(pending.requestId)
      });
      if (state.requestId === pending.requestId) state.requestId = null;
      state.pendingStoryRequestId = null; state.pendingGeneration = null;
    } catch (error) {
      pending.error = pending.saved ? `Story saved. Could not finish the AI request: ${error.message}` : `Could not save the story: ${error.message}`;
    }
    renderGenerationRecovery();
    if (!pending.saved) return false;
    $('generation-recovery-create').hidden = true;
    openReader(pending.story);
    renderGenerationRecovery();
    return !state.pendingGeneration;
  }
  return {
    finishGeneratedRequest, renderGenerationRecovery
  };
}
