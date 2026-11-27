// Background story context: prepares story memory for a path while the learner reads (Settings → Story memory).
// The code is the former app.js section, moved verbatim; app.js calls createBackgroundContext where it used to be.
import { ai } from '../bridge.js';
import { failureInfo } from './generation-errors.js';
import { lightTaskConfig } from '../core/light-model.js';

export function createBackgroundContext({
  generationLive, prepareStoryMemory, renderReaderGeneration, runtime, selectedPath, setReaderGeneration, state,
  storyContextReady, toast
}) {
  // Background story context (Settings → Story memory, on by default): after a chapter is saved, the story memory for
  // its path is prepared while the learner reads, so Continue usually finds it saved. A queued target starts only once
  // no request, unsaved response, saved progress or status is showing (so "Chapter 3 is ready" is seen first). It never
  // retries by itself; any other AI action stops it, and Continue or Rewrite on the same lineage waits for it instead.
  let backgroundTarget = null;
  function queueBackgroundContext(storyId, pathId = null) {
    if (!state.backgroundStoryContext) return;
    backgroundTarget = { storyId, pathId };
    maybeStartBackgroundContext();
  }
  function maybeStartBackgroundContext() {
    const target = backgroundTarget;
    if (!target || runtime.backgroundRun || runtime.readerGeneration || generationLive() || state.pendingReaderResult || state.pendingGeneration || state.pendingReaderRequestId || runtime.pipeline?.records.length || state.storageBlocked || state.checkpointBlocked) return;
    backgroundTarget = null;
    const story = state.stories.find(item => item.id === target.storyId);
    if (!state.backgroundStoryContext || !story || !ai.available || !state.model) return;
    const path = target.pathId ? story.paths?.find(item => item.id === target.pathId) : selectedPath(story);
    const entries = (path?.entries || []).map(entry => ({ ...entry }));
    if (!entries.length || storyContextReady(story, entries)) return;
    const run = runtime.backgroundRun = { storyId: story.id, entries, stopped: false, cancelledByUser: false };
    const loading = document.createElement('div'); loading.append(document.createElement('strong'));
    run.host = document.createElement('span'); run.host.hidden = true; document.body.append(run.host);
    const status = { storyId: story.id, phase: 'working', message: 'Preparing story context in the background…' };
    setReaderGeneration(status);
    run.promise = (async () => {
      try { await prepareStoryMemory(story, entries, loading, { ...lightTaskConfig(state), signal: run }, run.host); }
      catch (error) {
        // Stopping, cancelling or a hidden page is not a failure; Continue prepares whatever is missing.
        if (!run.stopped && !run.cancelledByUser && error.message !== 'Request cancelled.' && error.code !== 'background_paused') toast(`Story context was not prepared in the background: ${failureInfo(error, 'context', 'request').message} Continue will prepare it.`);
      } finally {
        run.host.remove(); runtime.backgroundRun = null;
        // An unsaved summary keeps the status, which then offers Save response.
        if (runtime.readerGeneration === status && !state.pendingReaderResult) setReaderGeneration(null); else renderReaderGeneration();
      }
    })();
  }
  async function stopBackgroundContext() {
    backgroundTarget = null;
    const run = runtime.backgroundRun; if (!run) return;
    run.stopped = true;
    run.host.querySelector('.reader-ai-cancel')?.click();
    await run.promise;
  }
  // Continue and Rewrite reuse a background run on the same lineage (summaries are keyed by lineage prefix).
  async function settleBackgroundContext(storyId, entries) {
    backgroundTarget = null;
    const run = runtime.backgroundRun; if (!run) return;
    const sameLineage = run.storyId === storyId && run.entries.length <= entries.length && run.entries.every((entry, index) => entry.versionId === entries[index].versionId);
    if (!sameLineage) { await stopBackgroundContext(); return; }
    await run.promise;
    if (run.cancelledByUser) throw new Error('Request cancelled.');
  }
  return {
    maybeStartBackgroundContext, queueBackgroundContext, settleBackgroundContext, stopBackgroundContext
  };
}
