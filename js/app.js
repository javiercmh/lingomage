import { chapterShareText, storyShareText, storyExportFile, shareTargets, downloadStoryFile, shareStoryFile, shareText, copyText, importStoryFile, STORY_IMPORT_MAX_BYTES } from './story-share.js';
import { createStoryModel, pathLabel } from './story-model.js';
import { lightModelChoice, lightTaskConfig, lightTasks, LIGHT_TASKS } from './light-model.js';
import { markStoryActivity, planLibrary, dateSegments, describeDates } from './library-activity.js';
import { beginMemoryRebuild, finishMemoryRebuild, createStoryMemory } from './story-memory.js';
import { createGenerationController } from './generation-controller.js';
import { createReaderPanels } from './reader-panels.js';
import { ai, readFile, writeFile, listFiles, speech, translation, selectionMenu, share, save, isNative, notify, hasNotificationPermission, requestNotificationPermission } from './bridge.js';
import { speakSelection, prepareSpeechOptions, speakChapter, chapterSpeechText } from './reader-speech.js';
import { createSelectionMenuRouter } from './selection-menu.js';
import { createReaderActivation, glossaryForTrigger, indexGlossaryTriggers, normalizeReaderControls } from './reader-activation.js';
import { annotatedText, applyExplainedMarks, findGlossaryMatches, getCanonicalSelection, japaneseSegments, stripRussianStress, withRussianStress } from './reader-text.js';
import { markParagraphGaps } from './paragraph-gaps.js';
import { SPEECH_RATES, canonicalRange, createReaderPlayer, speechUnits } from './reader-player.js';
import { createPipeline, pendingRequests, MAX_BROKEN_RESENDS, parallelLimitFor } from './generation-pipeline.js';
import { hasStoryContext, progressSummary } from './generation-progress.js';
import { timingEntry, timingSamples, estimateGeneration, remainingTime, remainingText } from './generation-timing.js';
import { SAFEGUARD_VERSION, parseContent, validateStory, MAX_NOTE_PARTS } from './learning-validation.js';
import { PROMPT_VERSION, storyInstructions, chapterInstructions, helpInstructions, NOTE_DENSITIES, DEFAULT_NOTE_DENSITY, scopeGuide } from './prompts.js';
import { failureInfo, recoverySummary, operationLabel, discardFailureMessage, appendFailureDetails } from './generation-errors.js';
import { createWorkspaceStorage, createSettingsPersistence, optionalStore, SIGNALS_PATH, USAGE_PATH } from './workspace-storage.js';
import { createSignalsTracker } from './consultation-signals.js';
import { SAMPLE_MS, createExposureTracker, paragraphRanges, visibleFraction, wordCount } from './reading-exposure.js';
import { createUsageTracker } from './usage-tracker.js';
import { RANGES, ACTIVITY_LABELS, summarize, formatDuration, hasUsage } from './usage-stats.js';
import { saveBeforeAcknowledge } from './request-lifecycle.js';
import { aiNotification } from './ai-notification.js';
import { createAiSession } from './ai-session.js';
import { createSettingsFeedback, unsavedWorkReason } from './settings-feedback.js';
import { createStatsView } from './stats-view.js';
import { createLanguageSettings } from './language-settings.js';
import { createShareDialog } from './share-dialog.js';
import { createReaderPlayerUi } from './reader-player-ui.js';
import { createLibraryView } from './library-view.js';
import { createReaderHelp } from './reader-help.js';
import { createGenerationStatusUi } from './generation-status-ui.js';
import { createCreateFlow } from './create-flow.js';
import { createReaderView } from './reader-view.js';

// Every ai.start goes through aiSession; multi-request operations scope it with aiSession.run, and
// cleanup-only paths (finish request, save response, acknowledge, discard) never open a session.
const aiSession = createAiSession({ ai });
const LANGUAGES = {de:'German',ja:'Japanese',ru:'Russian','es-CL':'Spanish'};
const SPEECH_LANGUAGES = { de: 'de-DE', ja: 'ja-JP', ru: 'ru-RU', 'es-CL': 'es-CL' };
const PROFILE_DEFINITIONS = readJson('data/learning-profiles.json', {});
const STORY_GUIDES = PROFILE_DEFINITIONS.generationGuides;
const JOURNEY_DESCRIPTIONS = PROFILE_DEFINITIONS.languages;
const LEVELS = PROFILE_DEFINITIONS.standardizedLevels;
const SCOPES = PROFILE_DEFINITIONS.scopes;
function levelDefinition(language, id) { return LEVELS[language]?.levels.find(level => level.id === id); }
function guideFor(language, id) { return levelDefinition(language, id)?.guide || STORY_GUIDES[language]?.[id] || ''; }
function readingDescription(language, id) { return levelDefinition(language, id)?.description || JOURNEY_DESCRIPTIONS[language]?.[id] || ''; }
function fillLevelOptions(select, language, selected) {
  select.textContent = '';
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a reading level'; select.append(placeholder);
  LEVELS[language].levels.forEach(level => { const option = document.createElement('option'); option.value = level.id; option.textContent = level.label; select.append(option); });
  select.value = levelDefinition(language, selected) ? selected : '';
}
const LEGACY_SCOPES = { longer: 'chapter' };
function normalizeScope(value) { return SCOPES[value] ? value : SCOPES[LEGACY_SCOPES[value]] ? LEGACY_SCOPES[value] : 'scene'; }
function setScope(input, value, describe) {
  const scope = normalizeScope(value); input.value = scope;
  document.querySelectorAll(`#${input.id}-group [role="radio"]`).forEach(button => { const on = button.dataset.value === scope; button.setAttribute('aria-checked', String(on)); button.tabIndex = on ? 0 : -1; });
  if (describe) describe.textContent = SCOPES[scope].description;
}
function setScopeDisabled(input, disabled) { input.disabled = disabled; document.querySelectorAll(`#${input.id}-group [role="radio"]`).forEach(button => { button.disabled = disabled; }); }
function fillScopeOptions(input, selected = 'scene', describe) {
  const group = $(`${input.id}-group`);
  if (group) {
    group.textContent = '';
    Object.entries(SCOPES).forEach(([value, scope]) => {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'radio'); button.dataset.value = value; button.className = 'segment'; button.textContent = scope.label;
      button.addEventListener('click', () => { if (!button.disabled) setScope(input, value, describe); });
      button.addEventListener('keydown', event => {
        const keys = Object.keys(SCOPES), step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
        if (!step) return; event.preventDefault();
        const next = keys[(keys.indexOf(input.value) + step + keys.length) % keys.length]; setScope(input, next, describe); group.querySelector(`[data-value="${next}"]`).focus();
      });
      group.append(button);
    });
  }
  setScope(input, selected, describe);
}

// Suggested ChatGPT starting points (2026-11-25 comparison, generation-tests/results.md) are shown as
// reference text in index.html. PREFERRED_MODEL preselects the story model on first use only.
const PREFERRED_MODEL = 'gpt-6.2-sol';
const $ = id => document.getElementById(id);
const state = { languageOrder: Object.keys(LANGUAGES), standardizedLevels: {}, checkpointBlocked: false, stories: [], current: null, requestId: null, pendingStoryRequestId: null, pendingGeneration: null, pendingReaderRequestId: null, pendingReaderResult: null, activeHelpRequest: null, readerPositions: {}, providerId: '', model: '', reasoning: '', lightModel: '', lightReasoning: '', lightTasks: null, splitNotes: true, concurrentRequests: true, noteDensity: DEFAULT_NOTE_DENSITY, retryBrokenReplies: true, notifyWhenReady: false, targetLanguages: {}, learnerProfiles: {}, languageExpectations: {}, languageSetupDismissed: false, models: [], toastTimer: null, readerId: null, readerChapter: 0, readerVersion: 0, readerSelection: null, readerFontSize: 19, furigana: true, libraryLanguage: 'all', librarySort: 'recent', storyMenu: null, libraryStale: false, libraryPlainHero: false, deleteTrigger: null, deleteStoryIds: new Set(), storySelectionMode: false, selectedStoryIds: new Set(), storySelectionFocusId: '', explanationSelectionMode: false, selectedExplanationIds: new Set(), selectionFocusId: '', readerHistoryEntry: false, speechVersionKey: '', playerEnabled: false, player: null, playerUnits: [], speechRate: 1, followAlong: true, following: true, wordNoteTrigger: null, backgroundStoryContext: true, shareVocabularyNotes: false, readerEditBusy: false, activeChapterRequest: null, readerEditDraft: null };

// One status record covers Create, continuation, rewrite and explanation requests. It is shown in the reader bar
// while that story is open and in the page-level bar everywhere else (any tab, reader closed, or another story's reader).
let readerGeneration = null;
let creatingStory = false;
function setCreatingStory(value) { creatingStory = value; }
function setReaderGeneration(value) {
  readerGeneration = value;
  renderReaderGeneration();
}
function currentReaderGeneration() { return readerGeneration; }
// "Working" is displayed only while a request is actually live, so a cancelled, failed or abandoned request never leaves a stale status.
function generationLive() { return Boolean(creatingStory || backgroundRun || pipeline?.busy || state.readerEditBusy || state.readerHelpBusy || state.requestId); }
function definePopoverOpen() { const popover = $('word-note-popover'); return Boolean(popover && !popover.hidden && popover.dataset.define === 'true'); }
function generationView(status) {
  if (!status) return null;
  const pending = state.pendingReaderResult;
  if (pending && pending.story.id === status.storyId) return { message: pending.saved ? 'Response saved. Finish request.' : 'Response needs saving.', action: pending.saved ? 'Finish request' : 'Save response', dismiss: false };
  // Define shows its progress and Cancel in the note popover at the word, so the bar stays hidden while that is open.
  if (status.phase === 'working' && status.kind === 'define' && definePopoverOpen()) return null;
  if (status.phase === 'working') return generationLive() ? { message: status.message, action: 'Cancel request', dismiss: false, working: true } : null;
  return { message: status.message, action: { cleanup: 'Finish request', error: 'Review', ready: 'View result' }[status.phase] || '', dismiss: true };
}
function paintGenerationBar(bar, view) {
  bar.hidden = !view;
  if (!view) return;
  const [message, action, dismiss] = bar.id === 'generation-status-bar' ? ['generation-status-message', 'generation-status-action', 'generation-status-dismiss'] : ['reader-generation-message', 'reader-generation-action', 'reader-generation-dismiss'];
  // Rewriting identical live-region text can be announced again, so only changed text is written.
  if ($(message).textContent !== view.message) $(message).textContent = view.message;
  $(action).hidden = !view.action; $(action).textContent = view.action;
  $(action).disabled = Boolean(view.working) && !cancelAvailable();
  $(dismiss).hidden = !view.dismiss;
}
// Cancel is possible only while an operation stage or a memory request is live; the chapter card follows the bar.
function cancelAvailable() { return !pipeline?.records?.[0]?.discardRequested && Boolean(pipeline?.busy || state.activeChapterRequest && !state.activeChapterRequest.cancelledByUser || document.querySelector('.reader-ai-cancel')); }
// Ready hides itself after READY_STATUS_MS; the result stays in the reader. Hovering or focusing the bar, or a hidden
// page, postpones it, and returning to the page restarts the full countdown. Working, errors, cleanup and unsaved
// responses stay until handled.
const READY_STATUS_MS = 8000;
let readyTimer = null, readyStatus = null;
function scheduleReadyDismiss(status, view) {
  const ready = Boolean(view?.dismiss) && status?.phase === 'ready';
  if (ready && readyStatus === status) return;
  clearTimeout(readyTimer); readyTimer = null; readyStatus = ready ? status : null;
  if (ready) readyTimer = setTimeout(expireReadyStatus, READY_STATUS_MS);
}
function expireReadyStatus() {
  const status = readyStatus; readyTimer = null;
  if (!status || readerGeneration !== status || status.phase !== 'ready') { readyStatus = null; return; }
  const held = ['reader-generation-bar', 'generation-status-bar'].some(id => { const bar = $(id); return !bar.hidden && (bar.matches?.(':hover') || bar.contains?.(document.activeElement)); });
  if (held || document.visibilityState === 'hidden') { readyTimer = setTimeout(expireReadyStatus, READY_STATUS_MS); return; }
  readyStatus = null; setReaderGeneration(null);
}
function restartReadyCountdown() {
  if (!readyStatus) return;
  clearTimeout(readyTimer); readyTimer = setTimeout(expireReadyStatus, READY_STATUS_MS);
}
function recoveryCardInView(status) {
  if (status?.phase !== 'error') return false;
  const inReader=$('reader-dialog').open, op=pipeline?.records?.[0];
  if (inReader && status.storyId !== state.readerId) return false;
  const checkpoint=op && (op.target?.storyId ?? null) === (status.storyId ?? null);
  const cards=checkpoint
    ? (inReader ? [$('checkpoint-recovery-reader')] : [$('checkpoint-recovery-create'),$('checkpoint-recovery-profile')])
    : inReader ? [...document.querySelectorAll('.help-request-recovery'), $('reader-memory-recovery')] : [];
  return cards.some(card=>{
    if (!card || card.hidden || !card.getClientRects?.().length) return false;
    const rect=card.getBoundingClientRect();
    const top=inReader ? $('reader-navigation-bar').getBoundingClientRect?.().bottom || 0 : 0;
    const bottom=inReader ? window.innerHeight : document.querySelector('.tabbar')?.getBoundingClientRect?.().top || window.innerHeight;
    // Ignore a sliver behind fixed navigation; do not use the status bar itself as a boundary.
    return rect.right > 0 && rect.left < window.innerWidth && Math.min(rect.bottom,bottom)-Math.max(rect.top,top) >= Math.min(44,rect.height);
  });
}
function renderReaderGeneration() {
  const bar = $('reader-generation-bar'), appBar = $('generation-status-bar');
  if (!bar || !appBar) return;
  const status = readerGeneration, view = recoveryCardInView(status) ? null : generationView(status);
  scheduleReadyDismiss(status, view);
  const inReader = Boolean(view) && status.storyId != null && status.storyId === state.readerId && $('reader-dialog').open;
  // Create's visible progress card (with Cancel) is the indicator on its tab; a resumed Create has no such card.
  const ownCard = Boolean(view?.working) && status.storyId == null && $('view-create').classList.contains('active') && !$('reader-dialog').open && !$('loading-card').hidden;
  const page = view && !inReader && !ownCard ? view : null;
  const inDialog = Boolean(page) && $('reader-dialog').open;
  document.querySelectorAll('.chapter-cancel').forEach(button => { button.disabled = !cancelAvailable(); });
  paintGenerationBar(bar, inReader ? view : null);
  paintGenerationBar(appBar, page);
  // Inside an open reader the page-level bar occupies the same bottom edge as the reader bar, so it shares its scroll and notice offsets.
  readerPanel().classList.toggle('has-generation-status', inReader || inDialog);
  const shown = inReader ? bar : inDialog ? appBar : null, panelStyle = readerPanel().style;
  if (shown && shown.offsetHeight) panelStyle?.setProperty('--generation-bar-height', `${shown.offsetHeight}px`); else panelStyle?.removeProperty?.('--generation-bar-height');
  document.body.classList.toggle('has-app-generation-status', Boolean(page) && !inDialog);
  // A modal dialog makes the page inert, so the page-level bar moves into the topmost open dialog, as the toast does.
  if (page) { const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body; if (appBar.parentNode !== host) host.append(appBar); }
  maybeStartBackgroundContext();
}
// Background story context (Settings → Story memory, on by default): after a chapter is saved, the story memory for
// its path is prepared while the learner reads, so Continue usually finds it saved. A queued target starts only once
// no request, unsaved response, saved progress or status is showing (so "Chapter 3 is ready" is seen first). It never
// retries by itself; any other AI action stops it, and Continue or Rewrite on the same lineage waits for it instead.
let backgroundTarget = null, backgroundRun = null;
function currentBackgroundRun() { return backgroundRun; }
function queueBackgroundContext(storyId, pathId = null) {
  if (!state.backgroundStoryContext) return;
  backgroundTarget = { storyId, pathId };
  maybeStartBackgroundContext();
}
function maybeStartBackgroundContext() {
  const target = backgroundTarget;
  if (!target || backgroundRun || readerGeneration || generationLive() || state.pendingReaderResult || state.pendingGeneration || state.pendingReaderRequestId || pipeline?.records.length || state.storageBlocked || state.checkpointBlocked) return;
  backgroundTarget = null;
  const story = state.stories.find(item => item.id === target.storyId);
  if (!state.backgroundStoryContext || !story || !ai.available || !state.model) return;
  const path = target.pathId ? story.paths?.find(item => item.id === target.pathId) : selectedPath(story);
  const entries = (path?.entries || []).map(entry => ({ ...entry }));
  if (!entries.length || storyContextReady(story, entries)) return;
  const run = backgroundRun = { storyId: story.id, entries, stopped: false, cancelledByUser: false };
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
      run.host.remove(); backgroundRun = null;
      // An unsaved summary keeps the status, which then offers Save response.
      if (readerGeneration === status && !state.pendingReaderResult) setReaderGeneration(null); else renderReaderGeneration();
    }
  })();
}
async function stopBackgroundContext() {
  backgroundTarget = null;
  const run = backgroundRun; if (!run) return;
  run.stopped = true;
  run.host.querySelector('.reader-ai-cancel')?.click();
  await run.promise;
}
// Continue and Rewrite reuse a background run on the same lineage (summaries are keyed by lineage prefix).
async function settleBackgroundContext(storyId, entries) {
  backgroundTarget = null;
  const run = backgroundRun; if (!run) return;
  const sameLineage = run.storyId === storyId && run.entries.length <= entries.length && run.entries.every((entry, index) => entry.versionId === entries[index].versionId);
  if (!sameLineage) { await stopBackgroundContext(); return; }
  await run.promise;
  if (run.cancelledByUser) throw new Error('Request cancelled.');
}
for (const id of ['reader-generation-dismiss', 'generation-status-dismiss']) $(id).addEventListener('click', () => setReaderGeneration(null));
let recoveryVisibilityFrame=0;
function scheduleRecoveryVisibility() {
  if (readerGeneration?.phase !== 'error' || recoveryVisibilityFrame) return;
  recoveryVisibilityFrame=requestAnimationFrame(()=>{ recoveryVisibilityFrame=0; renderReaderGeneration(); });
}
// Resolves after the reader's own close handler has run (the close event is dispatched asynchronously).
function closeReader() {
  const dialog = $('reader-dialog');
  if (!dialog.open) return Promise.resolve();
  return new Promise(resolve => { dialog.addEventListener('close', resolve, { once: true }); dialog.close(); });
}
// Opens the story's reader. Switching from another story's reader keeps and replaces that reader's history entry
// instead of going back and pushing again, so a single Back still returns to the Library.
async function ensureReaderOpen(story) {
  if ($('reader-dialog').open && state.readerId === story.id) return;
  if ($('reader-dialog').open) { state.switchingReader = true; try { await closeReader(); } finally { state.switchingReader = false; } }
  openReader(story);
}
async function cancelGeneration() {
  if (pipeline?.busy) { try { await pipeline.cancel(); } catch (error) { toast(error.message); } return; }
  if (state.activeChapterRequest) { state.activeChapterRequest.cancelledByUser=true; state.activeChapterRequest.stopped=true; }
  document.querySelector('.reader-ai-cancel')?.click();
}
async function generationAction() {
  const status = readerGeneration; if (!status) return;
  const pending = state.pendingReaderResult;
  if (pending) {
    // Acknowledging the saved response clears state.pendingReaderResult, so the owning story is captured first.
    try { await savePendingReaderResult(); if ($('reader-dialog').open && state.readerId === pending.story.id) updateReader(); else renderReaderGeneration(); }
    catch (error) { status.message = error.message; renderReaderGeneration(); }
    return;
  }
  if (status.phase === 'cleanup') {
    try { await releaseInvalidReaderResponse(); setReaderGeneration(null); toast('Request cancelled'); }
    catch { toast('Could not finish cancelled request. Try again.'); }
    return;
  }
  if (status.phase === 'working') { await cancelGeneration(); return; }
  const story = state.stories.find(item => item.id === status.storyId);
  if (status.phase === 'error') {
    const op = pipeline?.records[0];
    if (!story) { await closeReader(); setView('create'); if (op) revealRecovery(op); return; } // a modal reader would leave the Create page inert
    await ensureReaderOpen(story);
    if (op?.target?.storyId === story.id) { revealRecovery(op); return; }
    revealCard(story.memoryRebuild ? $('reader-memory-recovery') : document.querySelector('.help-request-recovery') || $('reader-edit-panel')); return;
  }
  if (!story) { toast('That story is no longer available.'); setReaderGeneration(null); return; }
  await ensureReaderOpen(story);
  // The result's own path is used, not whichever path happens to hold the same chapter version first.
  const holds = item => item.entries.some(entry => entry.chapterId === status.chapterId && entry.versionId === status.versionId);
  const path = story.paths.find(item => item.id === status.pathId && holds(item)) || story.paths.find(holds);
  if (!path) { toast('That result is no longer available.'); setReaderGeneration(null); return; }
  if (story.activePathId !== path.id) {
    rememberReaderPosition();
    const previous = story.activePathId; story.activePathId = path.id;
    try { persistReaderStory(story); } catch (error) { story.activePathId = previous; toast(error.message); return; }
  }
  state.readerChapter = path.entries.findIndex(entry => entry.chapterId === status.chapterId && entry.versionId === status.versionId);
  state.readerPositions[`${story.id}:${path.id}`] = { chapterId: status.chapterId, scrollTop: 0 }; persistReaderPosition();
  updateReader();
  const target = status.helpId ? [...$('reader-help').querySelectorAll('.help-card')].find(card => card.dataset.helpId === status.helpId) : $('reader-title');
  setReaderGeneration(null);
  if (status.helpId) revealCard(target); else target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
for (const id of ['reader-generation-action', 'generation-status-action']) $(id).addEventListener('click', generationAction);
// Scroll the reader only as far as needed to show the bottom of a card; taller cards align at their top.
function revealCard(card) {
  if (!card) return;
  const panel = document.querySelector('.reader-panel');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => {
    const bars = [...document.querySelectorAll('.reader-generation-bar, .reader-panel .explanation-selection-toolbar')].filter(bar => !bar.hidden && bar.getClientRects().length > 0);
    const barTop = Math.min(window.innerHeight, ...bars.map(bar => bar.getBoundingClientRect().top));
    const navigation = document.querySelector('#reader-navigation-bar');
    const topEdge = 12 + (navigation ? navigation.offsetHeight + (parseFloat(getComputedStyle(navigation).top) || 0) + (parseFloat(getComputedStyle(panel).paddingTop) || 0) : 0);
    const rect = card.getBoundingClientRect(), margin = 12;
    let delta = 0;
    if (rect.height + margin * 2 > barTop - topEdge) delta = rect.top - topEdge;
    else if (rect.bottom + margin > barTop) delta = rect.bottom + margin - barTop;
    else if (rect.top < topEdge) delta = rect.top - topEdge;
    if (delta) panel.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
    card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true });
    card.classList.add('reveal-pulse'); setTimeout(() => card.classList.remove('reveal-pulse'), 1400);
  });
}

function readJson(path, fallback) {
  try { const text = readFile(path); return text.trim() ? JSON.parse(text) : fallback; }
  catch (error) { console.error(`Could not read ${path}`, error); return fallback; }
}
const workspaceStorage = createWorkspaceStorage({read:readFile, write:writeFile, exists:path => { const files=listFiles({strict:true}); return files.some(file=>file.name === path); }});
// Time tracking is optional data: an unreadable usage file never blocks stories, settings or generation.
const usage = createUsageTracker({persistence:{load:() => workspaceStorage.load(USAGE_PATH), save:value => workspaceStorage.save(USAGE_PATH, value)}, onStatus:status => renderUsageStatus(status)});
// Chapter audio keeps the story it started with, even if the reader changes while Stop is pending.
let playbackContext = {storyId:'', language:''};
function setPlaybackContext(value) { playbackContext = value; }
const trackedSpeech = usage.trackSpeech(speech, () => playbackContext);
// Lookup history and reading exposure (PED-005) are optional data like usage: recording never blocks reading.
const signals = createSignalsTracker({persistence:{load:() => workspaceStorage.load(SIGNALS_PATH), save:value => workspaceStorage.save(SIGNALS_PATH, value)}, onStatus:status => renderLookupStatus(status)});
function recordLookup(entry) { try { signals.record(entry); } catch (error) { console.error('Could not record lookup', error); } }
function recordNoteLookup(notes, info, action) {
  const story = readerStory(), version = story && activeVersion(activeChapter(story)); if (!version) return;
  const sentence = info && Number.isInteger(info.start) ? sentenceContext(version.story, info.start, info.end) : '';
  for (const note of notes) if (note?.word && note.meaning) recordLookup({language:story.language, kind:'note', word:note.word, meaning:note.meaning, action, sentence, where:`${story.id}/${version.id}`});
}
// Paragraphs on screen long enough to read count as exposure for tracked items (PED-005).
const exposure = createExposureTracker({onRead:(paragraph, context) => {
  try { signals.recordExposure({...context, paragraphIndex:paragraph.index, text:paragraph.text, words:paragraph.words, notes:paragraph.notes}); }
  catch (error) { console.error('Could not record reading', error); }
}});
let exposureTimer = null, exposureListening = false;
function listenForReading() {
  if (exposureListening) return; exposureListening = true;
  const interacted = () => exposure.interacted();
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) $('reader-dialog').addEventListener(type, interacted, { passive: true });
  const panel = readerPanel(); panel.addEventListener('scroll', interacted, { passive: true });
}
function startExposure(story, version) {
  listenForReading();
  const root = $('reader-story'), language = SPEECH_LANGUAGES[story.language] || story.language;
  const matches = findGlossaryMatches(version.story, version.glossary || []);
  const paragraphs = paragraphRanges(version.story).map(paragraph => ({...paragraph, words:wordCount(paragraph.text, language),
    notes:matches.filter(match => match.start >= paragraph.start && match.end <= paragraph.end).flatMap(match => match.notes.map(note => ({word:note.word, meaning:note.meaning, count:1})))}));
  exposure.start({paragraphs, context:{language:story.language, storyId:story.id, versionId:version.id}, measure:paragraph => {
    const box = canonicalRange(root, paragraph.start, paragraph.end)?.getBoundingClientRect(), panel = readerPanel().getBoundingClientRect();
    return visibleFraction(box, {top:Math.max(0, panel.top), bottom:Math.min(window.innerHeight, panel.bottom)});
  }});
  if (!exposureTimer) {
    exposureTimer = setInterval(() => { try { if ($('reader-dialog').open) exposure.sample(document.visibilityState === 'visible'); } catch (error) { console.error('Could not measure reading', error); } }, SAMPLE_MS);
    if (typeof exposureTimer === 'object') exposureTimer?.unref?.();
  }
}
function stopExposure() { exposure.stop(); if (exposureTimer) clearInterval(exposureTimer); exposureTimer = null; }
function recordSelectionLookup(passage, action) {
  if (!passage || passage.kind === 'title' || !passage.text?.trim()) return;
  const story = state.stories.find(item => item.id === passage.storyId) || readerStory();
  const version = story?.chapters?.find(item => item.id === passage.chapterId)?.versions.find(item => item.id === passage.versionId);
  const sentence = passage.sentence || (version && Number.isInteger(passage.start) ? sentenceContext(version.story, passage.start, passage.end) : '');
  recordLookup({language:passage.language || story?.language, kind:'selection', word:passage.text, action, sentence, where:`${passage.storyId}/${passage.versionId}`});
}
// What this version loads into runtime state. Every other entry in settings.json is preserved by saves.
const SETTINGS_ADMIT = {
  targetLanguages: code => Object.hasOwn(LEVELS, code),
  standardizedLevels: (code, level) => Object.hasOwn(LEVELS, code) && Boolean(levelDefinition(code, level)),
  learnerProfiles: (code, value) => Object.hasOwn(STORY_GUIDES, code) && typeof value === 'string',
  languageExpectations: (code, value) => Object.hasOwn(STORY_GUIDES, code) && typeof value === 'string',
  languageOrder: code => Object.hasOwn(LANGUAGES, code)
};
const settingsPersistence=createSettingsPersistence({storage:workspaceStorage,state,admit:SETTINGS_ADMIT,
  onRollback:() => syncSettingsControls(),
  onReapply:({changes}) => {
    syncSettingsControls();
    if (state.player && changes.some(change => change.path.join('.') === 'readingPreferences.followAlong')) { state.following = state.followAlong; renderPlayerFollow(); }
  },
  onError:info => settingsFeedback.show(info),
  onSaved:() => { if (!settingsPersistence.pending) settingsFeedback.clear(); }});
const settingsFeedback = createSettingsFeedback({$, document, persistence:settingsPersistence, readerOpen:() => $('reader-dialog').open});
// Puts every control a settings save can touch back in line with state after a rollback or a retry.
// Re-rendered language rows keep keyboard focus and uncommitted typing.
function syncSettingsControls() {
  syncLanguageSettings();
  setReaderTextSize(state.readerFontSize);
  $('furigana-toggle').checked=state.furigana;
  $('reader-story').classList.toggle('hide-furigana', !state.furigana);
  $('reader-title').classList.toggle('hide-furigana', !state.furigana);
  document.querySelectorAll('#reader-help .story-text').forEach(node=>node.classList.toggle('hide-furigana', !state.furigana));
  $('language-setup').hidden=Boolean(enabledLanguages().length) || state.languageSetupDismissed;
  $('player-rate').value=String(state.speechRate);
  if (state.player && state.playerRate !== state.speechRate) { state.playerRate=state.speechRate; state.player.setRate(state.speechRate); }
  // During playback `following` may differ from the preference (manual scroll); otherwise it mirrors the saved Follow setting.
  if (!state.player) { state.following=state.followAlong; renderPlayerFollow(); }
  $('background-context').checked = state.backgroundStoryContext;
  $('split-notes').checked = state.splitNotes;
  $('concurrent-requests').checked = state.concurrentRequests;
  $('note-density').value = state.noteDensity;
  $('retry-broken').checked = state.retryBrokenReplies;
  paintNotificationControls();
  syncModelControls();
}
function syncModelControls() {
  if (!state.models?.length) return;
  const select=$('model-select');
  if (state.models.some(model => model.id === state.model)) select.value=state.model; else select.selectedIndex=-1;
  buildReasoningOptions(); buildLightModelOptions();
}
// Rebuilds the options only when the model changed, so a focused Reasoning select keeps focus.
function buildReasoningOptions(force = false) {
  const model=state.models.find(item => item.id === state.model), select=$('reasoning-select');
  if (force || select.dataset.model !== String(state.model)) {
    select.dataset.model=String(state.model);
    select.textContent=''; const defaultOption=document.createElement('option'); defaultOption.value=''; defaultOption.textContent='Provider default'; select.append(defaultOption);
    (model?.reasoningLevels || []).forEach(level => { const option=document.createElement('option'); option.value=level; option.textContent=level[0].toUpperCase() + level.slice(1); select.append(option); });
  }
  $('reasoning-label').hidden=!model; select.hidden=!model; select.disabled=!(model?.reasoningLevels || []).length;
  select.value=model?.reasoningLevels?.includes(state.reasoning) ? state.reasoning : '';
}
// Settings → Split vocabulary notes: paragraph parts of similar size (up to MAX_NOTE_PARTS; Allow concurrent requests runs
// up to MAX_PARALLEL at once, else one at a time), or one request.
const noteParts = () => state.splitNotes === false ? 1 : MAX_NOTE_PARTS;
function buildLightModelOptions() {
  const select = $('light-model-select'), effort = $('light-reasoning-select');
  select.textContent = '';
  const same = document.createElement('option'); same.value = ''; same.textContent = 'Same as story model'; select.append(same);
  state.models.forEach(model => { const option = document.createElement('option'); option.value = model.id; option.textContent = model.name; select.append(option); });
  select.disabled = !state.models.length;
  select.value = lightModelChoice(state) ? state.lightModel : '';
  const model = state.models.find(item => item.id === select.value);
  if (effort.dataset.model !== String(select.value)) {
    effort.dataset.model = String(select.value); effort.textContent = '';
    const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = 'Provider default'; effort.append(defaultOption);
    (model?.reasoningLevels || []).forEach(level => { const option = document.createElement('option'); option.value = level; option.textContent = level[0].toUpperCase() + level.slice(1); effort.append(option); });
  }
  $('light-reasoning-label').hidden = !model; effort.hidden = !model; effort.disabled = !(model?.reasoningLevels || []).length;
  effort.value = model?.reasoningLevels?.includes(state.lightReasoning) ? state.lightReasoning : '';
  // Settings → AI models → Light model: the collapsed row shows the current choice; its tasks show only once a
  // separate light model is chosen.
  $('light-tasks').hidden = !model;
  const effortName = model?.reasoningLevels?.includes(state.lightReasoning) ? ` · ${state.lightReasoning[0].toUpperCase()}${state.lightReasoning.slice(1)}` : '';
  $('light-summary').textContent = model ? `${model.name}${effortName}` : 'Same as story model';
  const ticked = lightTasks(state);
  document.querySelectorAll('[data-light-task]').forEach(box => { box.checked = ticked.includes(box.dataset.lightTask); });
}
function persistStories() { workspaceStorage.save('data/stories.json', state.stories); }
function persistReaderStory(story) {
  const alreadySaved = state.stories.some(item => item.id === story.id);
  if (!alreadySaved) state.stories.unshift(story);
  try { persistStories(); libraryChanged(); }
  catch (error) { if (!alreadySaved) state.stories = state.stories.filter(item => item.id !== story.id); throw error; }
}
function persistSettings() { settingsPersistence.save(); }
// A failed save has already been rolled back and reported by the settings feedback notice.
function trySaveSettings() { try { persistSettings(); return true; } catch { return false; } }
// Unreadable stores only; settings write failures are reported by settingsFeedback.
function showStorageErrors() {
  const errors=[...workspaceStorage.entries.values()].filter(entry=>entry.status === 'invalid' && !optionalStore(entry.path));
  const text=errors.map(entry=>entry.error).join(' '), message=$('storage-recovery-message');
  $('storage-recovery').hidden=!errors.length;
  if (message.textContent !== text) message.textContent=text;
  state.storageBlocked=errors.length > 0;
  if (pipeline) renderCheckpointRecovery();
  if (state.storageBlocked) { $('generate').disabled=true; applyStorageBlock(); }
}
// Settings stay readable (disclosure toggles work) but cannot be edited while a store is unreadable.
function applyStorageBlock() {
  document.querySelectorAll('#view-settings input, #view-settings select, #view-settings textarea, #view-settings button:not(#settings-back), #my-languages input, #my-languages select, #my-languages textarea, #my-languages button:not(.language-toggle)').forEach(control=>{control.disabled=true;});
}
$('storage-retry').addEventListener('click', () => {
  const reason=unsavedWorkReason({state, pipeline, persistence:settingsPersistence});
  $('storage-retry-note').textContent=reason;
  if (!reason) window.location.reload();
});
const {
  renderLookupStatus, renderLookups, renderStats, renderUsageStatus, startStatsRefresh, stopStatsRefresh
} = createStatsView({
  $, LANGUAGES, SPEECH_LANGUAGES, signals, state, toast, usage
});
function toast(message) {
  const el = $('toast');
  ([...document.querySelectorAll('dialog[open]')].at(-1) || document.body).append(el);
  el.textContent = message; el.hidden = false;
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
function setView(name) {
  if (name !== 'library' && state.storySelectionMode) leaveStorySelection();
  const tabView = name === 'settings' ? 'profile' : name; // Settings is reached from Profile, which keeps its tab.
  document.querySelectorAll('.tab').forEach(tab => {
    const active = tab.dataset.view === tabView;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  if (name === 'library') renderLibrary();
  if (name === 'profile') { renderStats(); renderLookups(); startStatsRefresh(); } else stopStatsRefresh();
  if (name === 'profile' || name === 'settings') { if (name === 'profile') renderTargetLanguageSettings(); if (state.storageBlocked) showStorageErrors(); }
  window.scrollTo(0, 0);
  history.replaceState?.({ ...history.state, lingomageView: name }, '');
  renderReaderGeneration();
}
$('background-context').addEventListener('change', () => {
  state.backgroundStoryContext = $('background-context').checked;
  if (!trySaveSettings()) return;
  if (!state.backgroundStoryContext) stopBackgroundContext().catch(() => {});
});
$('open-settings').addEventListener('click', () => { setView('settings'); $('settings-back').focus({ preventScroll: true }); });
$('settings-back').addEventListener('click', () => { setView('profile'); $('open-settings').focus({ preventScroll: true }); });
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

// Match the starter's bottom navigation behavior when the on-screen keyboard opens.
let nativeImeVisible = null;
let baselineHeight = window.visualViewport?.height || window.innerHeight;
let baselineWidth = window.innerWidth;
window.addEventListener('app2:insets', event => {
  if (typeof event.detail?.imeVisible !== 'boolean') return;
  nativeImeVisible = event.detail.imeVisible;
  document.body.classList.toggle('kb', nativeImeVisible);
});
function updateKeyboardNavigation() {
  if (nativeImeVisible !== null) return;
  const height = window.visualViewport?.height || window.innerHeight;
  if (Math.abs(window.innerWidth - baselineWidth) > 80) {
    baselineWidth = window.innerWidth;
    baselineHeight = height;
    document.body.classList.remove('kb');
    return;
  }
  const visible = baselineHeight - height > 120;
  document.body.classList.toggle('kb', visible);
  if (!visible) baselineHeight = height;
}
window.visualViewport?.addEventListener('resize', updateKeyboardNavigation);
window.addEventListener('resize', updateKeyboardNavigation);

let pipeline;
function currentPipeline() { return pipeline; }
const {
  createProgressView, estimateFor, notifyResult, notifyStopped, operationPlan, paintNotificationControls,
  paintProgress, setReadyNotifications
} = createGenerationStatusUi({
  $, generationLive, state, trySaveSettings
});
let createProgress = null, resumedCreateCard = false;
function paintChapterProgress(request, op) {
  const loading = request.loading;
  if (!loading.progress) { loading.progress = createProgressView(); loading.progress.clockId = request.clockId; loading.progress.presetEstimate = request.estimate; loading.querySelector('.help-loading-copy').append(loading.progress); loading.classList.add('has-progress'); }
  paintProgress(loading.progress, op);
}
function createProgressRoot() { if (!createProgress) { createProgress = createProgressView(); $('generation-status').after(createProgress); } return createProgress; }
function applyGenerationLocks() {
  const op = pipeline?.records[0], busy = Boolean(pipeline?.busy);
  $('generate').disabled = Boolean(state.storageBlocked || state.checkpointBlocked || op || busy);
  if (!pipeline) return;
  for (const id of ['topic','language','difficulty','reading-scope']) $(id).disabled = Boolean(op?.kind === 'create' || busy);
  setScopeDisabled($('reading-scope'), Boolean(op?.kind === 'create' || busy));
  const readerFrozen = !!(state.readerEditBusy || op && op.target?.storyId === state.readerId && ['continue','rewrite'].includes(op.kind));
  for (const id of ['reader-prompt','reader-level','reader-edit-submit','continue-story','rewrite-chapter','reader-menu-continue','reader-menu-rewrite','path-select']) $(id).disabled=readerFrozen;
  setScopeDisabled($('reader-scope'), readerFrozen);
  $('reader-edit-submit').disabled=Boolean(readerFrozen || op || busy || state.storageBlocked || state.checkpointBlocked);
}
function renderCheckpointRecovery() {
  if (!pipeline) return;
  const op = pipeline.records[0];
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
  notice.hidden=!op || pipeline.busy || op.target?.storyId === state.readerId;
  const heading=notice.querySelector('.recovery-heading'), task=notice.querySelector('.recovery-task'), instruction=notice.querySelector('.helper');
  if (heading) heading.textContent=op?.discardRequested ? 'A cancelled generation needs attention' : 'An unfinished generation needs attention';
  if (task) task.textContent=taskLabel;
  if (instruction) instruction.textContent=op?.discardRequested ? discardFailureMessage(op) : 'Finish it or discard it before starting another generation.';
  const stageMessage=op?.discardRequested ? 'Cancelling…' : op?.kind === 'examples' && op.stage === 'prose' ? 'Generating examples…' : op?.stage === 'plan' ? 'Planning suitable language…' : op?.stage === 'notes' ? 'Adding vocabulary notes…' : op?.stage === 'readings' ? 'Adding kanji readings…' : op?.stage === 'enrich' ? 'Adding kanji readings and vocabulary notes…' : op?.kind === 'continue' ? 'Writing the next chapter…' : op?.kind === 'rewrite' ? 'Rewriting this chapter…' : 'Writing your story…';
  // A running operation always uses the same status card, whether it started here or was resumed from recovery.
  if (op && pipeline.busy && op.kind === 'create' && !creatingStory && $('loading-card').hidden) { resumedCreateCard = true; $('story-form').hidden = true; $('loading-card').hidden = false; }
  if (resumedCreateCard && !pipeline.busy) { resumedCreateCard = false; $('loading-card').hidden = true; $('story-form').hidden = false; }
  if (op && pipeline.busy && ['continue','rewrite'].includes(op.kind) && !state.activeChapterRequest) { state.activeChapterRequest = { storyId: op.target.storyId, loading: createChapterLoading(op.kind), resumed: true }; renderChapterRequest(); }
  if (state.activeChapterRequest?.resumed && !pipeline.busy) { state.activeChapterRequest.loading.remove(); state.activeChapterRequest = null; renderChapterRequest(); }
  if (op && pipeline.busy) {
    if (op.kind === 'create') { $('generation-status').textContent=stageMessage; paintProgress(createProgressRoot(), op); }
    if (readerGeneration && (readerGeneration.storyId ?? null) === (op.target?.storyId ?? null)) { readerGeneration.phase='working'; readerGeneration.message=op.discardRequested ? 'Cancelling…' : progressSummary(op).text; }
    if (state.activeChapterRequest && state.activeChapterRequest.storyId === op.target?.storyId) { state.activeChapterRequest.loading.querySelector('strong').textContent=stageMessage; paintChapterProgress(state.activeChapterRequest, op); }
  }
  for (const id of ['checkpoint-recovery-create','checkpoint-recovery-profile','checkpoint-recovery-reader']) {
    const box = $(id);
    if (id === 'checkpoint-recovery-reader') { const anchor = op?.kind === 'examples' ? $('reader-help-section') : $('reader-edit-panel'); if (anchor.nextElementSibling !== box) anchor.after?.(box); }
    const hidden = !op || id === 'checkpoint-recovery-reader' && (op.target?.storyId !== state.readerId || pipeline.busy && state.activeChapterRequest?.storyId === op.target?.storyId) || id === 'checkpoint-recovery-create' && pipeline.busy && !$('loading-card').hidden;
    const messageText = !op ? '' : pipeline.busy ? stageMessage : op.discardRequested ? recoverySummary(op) : op.promptVersion !== PROMPT_VERSION || op.safeguardVersion !== SAFEGUARD_VERSION ? 'This saved request belongs to an older app definition. Discard it to start with the current requirements.' : recoverySummary(op);
    const resumeText = !op ? '' : op.discardRequested ? 'Try again' : op.stage === 'applied' || pendingRequests(op).some(request => request.completed) ? 'Finish request' : op.stage === 'ready' ? 'Save response' : op.error ? 'Retry' : 'Resume';
    const resumeBlocked = Boolean(op) && Boolean(state.storageBlocked || pipeline.busy || !op.discardRequested && ( /older app definition|destination.*no longer|source explanation changed|destination path changed/i.test(op.error || '') || op.promptVersion !== PROMPT_VERSION || op.safeguardVersion !== SAFEGUARD_VERSION));
    const failure=op?.failure || (op?.error ? failureInfo(new Error(op.error),op.stage) : null);
    const neutral=Boolean(pipeline.busy || !op?.discardRequested && (!failure || ['cancelled','background','unavailable'].includes(failure.category)));
    // Rebuilding would drop keyboard focus and make screen readers repeat an unchanged alert.
    const signature = JSON.stringify([hidden, op?.id, messageText, resumeText, resumeBlocked, pipeline.busy, op?.error, op?.failure, taskLabel, neutral]);
    if (box.dataset.rendered === signature) continue;
    box.dataset.rendered = signature; box.textContent=''; box.hidden = hidden;
    box.className=neutral ? 'recovery-panel recovery-neutral' : 'recovery-panel';
    if (hidden) continue;
    const message = document.createElement('p'); message.className='helper'; message.setAttribute('role','status');
    const heading=document.createElement('strong'); heading.className='recovery-heading'; heading.textContent=pipeline.busy ? 'Generation in progress' : op.discardRequested ? 'Generation needs attention' : 'Unfinished generation';
    const task=document.createElement('span'); task.className='recovery-task'; task.textContent=taskLabel;
    const explanation=document.createElement('span'); explanation.textContent=messageText;
    message.append(heading,task,explanation);
    if (op.error) message.setAttribute('role', 'alert');
    const resume = document.createElement('button'); resume.type='button'; resume.className='secondary-btn'; resume.textContent=resumeText; resume.disabled=resumeBlocked;
    resume.addEventListener('click', () => resumeCheckpoint(op));
    const discard = document.createElement('button'); discard.type='button'; discard.className=pipeline.busy ? 'small-btn reader-ai-cancel' : 'small-btn'; discard.textContent=op.discardRequested && pipeline.busy ? 'Cancelling…' : pipeline.busy ? 'Cancel request' : 'Discard'; discard.disabled=Boolean(pipeline.busy && op.discardRequested);
    discard.addEventListener('click', async () => {
      try {
        if (pipeline.busy) {
          discard.disabled=true;
          await pipeline.cancel();
        } else { await pipeline.discard(op); if (readerGeneration?.storyId === op.target?.storyId && readerGeneration?.phase !== 'ready') setReaderGeneration(null); toast('Unfinished generation discarded'); }
      } catch (error) { op.failure=failureInfo(error,op.stage); op.error=op.failure.message; }
      finally { discard.disabled=Boolean(pipeline.busy && op.discardRequested); renderCheckpointRecovery(); }
    });
    box.append(message);
    if (op.error) appendFailureDetails(box, op.failure || failureInfo(new Error(op.error), op.stage));
    // While the operation runs, Resume has nothing to do; only Cancel request is offered.
    const actions = document.createElement('div'); actions.className='recovery-actions'; actions.append(...(pipeline.busy ? [discard] : op.discardRequested ? [resume] : [resume, discard])); box.append(actions);
  }
  renderReaderGeneration(); // Re-evaluate visibility after the recovery panels have been updated.
}
async function resumeCheckpoint(op) {
  if (state.storageBlocked) { toast('Retry loading your workspace before resuming generation.'); return; }
  if (!pipeline.records.includes(op) || pipeline.busy) return;
  if (backgroundRun) { await stopBackgroundContext(); if (!pipeline.records.includes(op) || pipeline.busy) return; }
  if (state.requestId || state.readerEditBusy || state.readerHelpBusy || state.pendingReaderResult || state.pendingGeneration) { toast('Finish the active request first.'); return; }
  try {
    if (op.discardRequested) { await pipeline.discard(op); setReaderGeneration(null); toast('Generation cancelled'); return; }
    if (op.promptVersion !== PROMPT_VERSION || op.safeguardVersion !== SAFEGUARD_VERSION) throw new Error('This saved operation belongs to an older app definition. Discard it to start with the current requirements.');
    if (state.readerEditDraft && state.readerEditDraft.storyId === op.target?.storyId) {
      state.readerEditDraft.error = '';
      $('reader-edit-error').textContent = '';
    }
    setReaderGeneration({storyId:op.target?.storyId ?? null,phase:'working',message:'Resuming saved progress…'});
    if (pendingRequests(op).some(request => request.completed) && !['ready','applied'].includes(op.stage)) { await pipeline.finishRequest(op); setReaderGeneration(null); return; }
    if (op.config && !String(op.config.model || '').trim() && String(state.model || '').trim()) {
      op.config = { ...op.config, providerId: state.providerId || op.config.providerId || '', model: state.model, reasoning: state.reasoning };
    }
    // An outstanding request is polled, saved and acknowledged by the pipeline before any new request,
    // and so before any session is opened (sessions open lazily at the next ai.start).
    await aiSession.run(() => pipeline.run(op)); showOperationResult(op);
  } catch (error) {
    if (error.code === 'generation_cancelled') { setReaderGeneration(null); toast('Generation cancelled'); return; }
    notifyStopped(op.kind);
    op.error=failureInfo(error,op.stage).message; if (op.failure?.message !== failureInfo(error,op.stage).message) op.failure = failureInfo(error, op.stage);
    if (readerGeneration && (readerGeneration.storyId ?? null) === (op.target?.storyId ?? null)) setReaderGeneration({...readerGeneration,phase:'error',message:op.discardRequested ? discardFailureMessage(op) : 'Generation stopped.'});
    renderCheckpointRecovery(); revealRecovery(op);
  }
}
async function showPendingRecovery() {
  const op=pipeline?.records[0]; if (!op) return;
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
  if (pipeline.records.length) throw new Error('Resume or discard the pending generation before starting another.');
  const op = pipeline.create({...spec, promptVersion:PROMPT_VERSION, profileVersion:PROFILE_DEFINITIONS.version, planned:!['examples','notes'].includes(spec.kind)});
  await aiSession.run(() => pipeline.run(op));
  return op;
}
const { operationProvenance, applyContentOperation, clearNotesPending } = createGenerationController({state, normalizeChapters:(...args)=>normalizeChapters(...args), ensureStoryPaths:(...args)=>ensureStoryPaths(...args), persistReaderStory, savedFollowUps: (...args) => savedFollowUps(...args)});
// Reading while notes are written: the chapter opens once its text (and Japanese readings) is saved; notes appear as
// their parts finish. The status bar keeps Cancel and counts saved note parts; the reader keeps its place.
function notesProgressMessage(op) {
  const parts = Object.entries(op.parallel || {}).filter(([name]) => name === 'notes' || name.startsWith('notes-'));
  return parts.length > 1 ? `Adding vocabulary notes · ${parts.filter(([, part]) => part.done).length} of ${parts.length}` : 'Adding vocabulary notes…';
}
function refreshReaderInPlace(storyId) {
  if (state.readerId !== storyId || !$('reader-dialog').open) return;
  // Never rebuild under an open note or an active selection; the next part or the final save refreshes instead.
  if (!$('word-note-popover').hidden || !$('selection-toolbar').hidden) return;
  const scrollTop = readerPanel().scrollTop; updateReader(true); readerPanel().scrollTop = scrollTop;
}
function showEarlyResult(op, first) {
  const story = state.stories.find(s => op.kind === 'create' ? s.operationId === op.id : s.id === op.target.storyId);
  if (!story) return;
  if (!first) { refreshReaderInPlace(story.id); setReaderGeneration({ storyId: story.id, phase: 'working', message: notesProgressMessage(op) }); return; }
  setReaderGeneration({ storyId: story.id, phase: 'working', message: notesProgressMessage(op) });
  if (op.kind === 'create') { ensureReaderOpen(story).catch(error => toast(error.message)); toast('Your story is ready. Vocabulary notes are on their way.'); return; }
  if (op.kind === 'continue') {
    if (state.readerId === story.id && $('reader-dialog').open && selectedPath(story).id === op.target.pathId) {
      const scrollTop = readerPanel().scrollTop, focused = document.activeElement;
      $('reader-edit-panel').hidden = true; state.readerEditDraft = null;
      renderChapterNavigation(story); renderReaderActions(); updateReaderNavigation();
      readerPanel().scrollTop = scrollTop; if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }
    toast(`Chapter ${op.target.entries.length + 1} is ready. Vocabulary notes are on their way.`); return;
  }
  if (state.readerId === story.id) { state.readerChapter = op.target.index; $('reader-edit-panel').hidden = true; state.readerEditDraft = null; updateReader(); }
  toast('Branch created. Vocabulary notes are on their way.');
}
function showOperationResult(op) {
  const story=state.stories.find(s=>op.kind === 'create' ? s.operationId === op.id : s.id === op.target.storyId);
  if (!story) return;
  notifyResult(op, story);
  if (op.earlyApplied && op.kind !== 'notes') {
    // The chapter was already shown; only its notes changed.
    refreshReaderInPlace(story.id);
    if (readerGeneration?.storyId === story.id) setReaderGeneration(null);
    queueBackgroundContext(story.id, op.kind === 'continue' ? op.target.pathId : op.kind === 'rewrite' ? `path-${op.id}` : null);
    toast('Vocabulary notes ready'); return;
  }
  if (op.kind === 'notes') {
    // Notes rebuilt in place: the learner stays on the same chapter, scroll position and path.
    if (readerGeneration?.storyId === story.id) setReaderGeneration(null);
    if (state.readerId === story.id && $('reader-dialog').open) { const scrollTop = readerPanel().scrollTop; updateReader(); readerPanel().scrollTop = scrollTop; }
    toast('Vocabulary notes rebuilt'); return;
  }
  if (op.kind !== 'examples') queueBackgroundContext(story.id, op.kind === 'continue' ? op.target.pathId : op.kind === 'rewrite' ? `path-${op.id}` : null);
  if (op.kind === 'create') { setReaderGeneration(null); ensureReaderOpen(story).catch(error => toast(error.message)); return; }
  if (readerGeneration && readerGeneration.storyId === story.id) {
    Object.assign(readerGeneration,{phase:'ready',message:op.kind === 'continue' ? `Chapter ${op.target.entries.length + 1} is ready` : 'Ready',pathId:op.kind === 'continue' ? op.target.pathId : op.kind === 'rewrite' ? `path-${op.id}` : readerGeneration.pathId,chapterId:op.kind === 'examples' ? op.target.chapterId : op.kind === 'continue' ? `chapter-${op.id}` : op.target?.chapterId,versionId:op.kind === 'examples' ? op.target.versionId : `version-${op.id}`,helpId:op.kind === 'examples' ? op.target.helpId : ''});
    renderReaderGeneration();
  }
  if (state.readerId === story.id && op.kind === 'continue') {
    // Continue never moves the learner: the viewed path, chapter, scroll and focus stay put; only the counts and navigation controls change.
    if ($('reader-dialog').open && selectedPath(story).id === op.target.pathId) {
      const scrollTop = readerPanel().scrollTop, focused = document.activeElement;
      $('reader-edit-panel').hidden = true; state.readerEditDraft = null;
      renderChapterNavigation(story); renderReaderActions(); updateReaderNavigation();
      readerPanel().scrollTop = scrollTop; if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    }
  } else if (state.readerId === story.id) {
    if (op.kind !== 'examples') state.readerChapter=op.target.index;
    $('reader-edit-panel').hidden=true; state.readerEditDraft=null; updateReader();
  }
  toast(op.kind === 'examples' ? 'Examples saved' : op.kind === 'continue' ? 'Chapter added' : 'Branch created');
}
// Automatic resends of unreadable replies are announced, never silent (Settings → Advanced).
function resendStepName(key) {
  if (key.startsWith('notes-')) return `vocabulary notes (part ${key.slice(6)})`;
  if (key.startsWith('readings-')) return `kanji readings (part ${key.slice(9)})`;
  return {plan:'language plan',prose:'story text',notes:'vocabulary notes',readings:'kanji readings'}[key] || 'AI';
}
function announceResend(op, key, count) {
  toast(`The ${resendStepName(key)} reply was unreadable. Retrying automatically (${count} of ${MAX_BROKEN_RESENDS}).`);
}
function initializePipeline() {
  const entry=workspaceStorage.load('data/generation-checkpoints.json');
  if (entry.status === 'invalid') { state.checkpointBlocked=true; showStorageErrors(); return; }
  const records=entry.value;
  pipeline=createPipeline({records,persist:value=>workspaceStorage.save('data/generation-checkpoints.json',value),apply:applyContentOperation,applyPartial:(op,content,{first})=>{applyContentOperation(op,{content}); showEarlyResult(op,first);},discarded:op=>{clearNotesPending(op); const story=state.stories.find(s=>op.kind === 'create' ? s.operationId === op.id : s.id === op.target?.storyId); if(story) refreshReaderInPlace(story.id);},parallel:true,onResend:announceResend,changed:()=>{if(pipeline && !pipeline.busy) state.requestId=null; renderCheckpointRecovery();},ai:{
    start:async args=>{workspaceStorage.assertWritable(); if (!String(args?.model || '').trim()) throw new Error('No AI model is selected. Open Settings and choose an AI model before generating.'); state.requestId='starting'; try {const id=await aiSession.start(args); state.requestId=id; return id;} catch(error){state.requestId=null;throw error;}},
    wait:async id=>{state.requestId=id; try {const text=await ai.wait(id); return text;} finally {if(state.requestId===id) state.requestId=null;}},
    acknowledge:id=>ai.acknowledge(id), cancel:id=>ai.cancel(id)
  }});
  const pendingCreate=records.find(op=>op.kind === 'create');
  if (pendingCreate) {
    $('topic').value=pendingCreate.input.topic || '';
    $('language').value=pendingCreate.language;
    fillLevelOptions($('difficulty'),pendingCreate.language,pendingCreate.input.difficulty);
    $('difficulty-description').textContent=readingDescription(pendingCreate.language,pendingCreate.input.difficulty);
    setScope($('reading-scope'),pendingCreate.input.scope,$('scope-description'));
  }
  renderCheckpointRecovery();
}

function storyInput() {
  workspaceStorage.assertWritable();
  const language = $('language').value, difficulty = $('difficulty').value;
  const level = levelDefinition(language, difficulty);
  if (!level) throw new Error('Choose a reading level before generating.');
  const scope = $('reading-scope').value;
  return JSON.stringify({ language: LANGUAGES[language], languageCode: language, difficulty, framework: LEVELS[language].framework, levelDescription: level.guide, readingStartingPoint: state.standardizedLevels[language] || difficulty, readingSelfReport: level.description, languageExpectations: state.languageExpectations[language] || '', scope, scopeDescription: scopeGuide(scope, language, difficulty), profileVersion: PROFILE_DEFINITIONS.version, topic: $('topic').value.trim(), practice: '' });
}
function populateDifficulty(selected = '') {
  const language = $('language').value, select = $('difficulty');
  fillLevelOptions(select, language, selected || state.standardizedLevels[language]);
  $('difficulty-description').textContent = readingDescription(language, select.value) || 'Select the description closest to what you can comfortably read.';
}
function populateTargetPicker(preferred = '') {
  const select = $('language'), previous = preferred || select.value;
  select.textContent = '';
  const allLanguages = state.languageOrder;
  const selectedLanguages = allLanguages.filter(code => state.targetLanguages[code]);
  const availableLanguages = selectedLanguages.length ? selectedLanguages : allLanguages;
  $('language-setup').hidden = Boolean(selectedLanguages.length) || state.languageSetupDismissed;
  availableLanguages.forEach(code => { const option = document.createElement('option'); option.value = code; option.textContent = LANGUAGES[code]; select.append(option); });
  select.value = availableLanguages.includes(previous) ? previous : (select.options[0]?.value || '');
  select.disabled = false;
  populateDifficulty();
  applyGenerationLocks();
}
const {
  enabledLanguages, renderTargetLanguageSettings, syncLanguageSettings
} = createLanguageSettings({
  $, LANGUAGES, applyStorageBlock, fillLevelOptions, levelDefinition, populateDifficulty, populateTargetPicker,
  readingDescription, state, trySaveSettings
});
function decodeResponse(text, languageCode) { return validateStory(parseContent(text),languageCode); }

$('reader-level').addEventListener('change', () => { $('reader-level-description').textContent = readingDescription(readerStory().language, $('reader-level').value); });

const {
  finishGeneratedRequest, renderGenerationRecovery
} = createCreateFlow({
  $, LANGUAGES, PROFILE_DEFINITIONS, createProgressRoot, currentBackgroundRun, currentPipeline,
  currentReaderGeneration, guideFor, noteParts, notifyStopped, openReader: (...args) => openReader(...args), persistReaderStory,
  populateDifficulty, readingDescription, renderCheckpointRecovery, renderReaderGeneration, revealRecovery,
  runContentOperation, setCreatingStory, setReaderGeneration, showOperationResult, showPendingRecovery,
  showStorageErrors, state, stopBackgroundContext, storyInput, toast
});
function pendingDeletionBlocked() { return !!(state.checkpointBlocked || pipeline?.records.length || state.requestId || state.pendingGeneration || state.pendingStoryRequestId || state.pendingReaderRequestId || state.pendingReaderResult || state.readerEditBusy || state.readerHelpBusy); }
function syncStorySelection() {
  $('story-selection-toolbar').hidden = !state.storySelectionMode;
  $('story-selection-count').textContent = `${state.selectedStoryIds.size} selected`;
  $('delete-selected-stories').disabled = !state.selectedStoryIds.size || pendingDeletionBlocked();
  $('library-list').querySelectorAll('.story-card').forEach(card => {
    const selected = state.selectedStoryIds.has(card.dataset.storyId);
    card.classList.toggle('selected-card', selected);
    const checkbox = card.querySelector('.story-select-checkbox');
    if (checkbox) checkbox.checked = selected;
  });
}
function leaveStorySelection(restoreFocus = false) {
  const focusId = state.storySelectionFocusId || [...state.selectedStoryIds][0];
  state.storySelectionMode = false; state.selectedStoryIds.clear(); syncStorySelection();
  const scrollY = window.scrollY;
  renderLibrary(); window.scrollTo(0, scrollY);
  if (restoreFocus && focusId) $('library-list').querySelector(`[data-story-id="${CSS.escape(focusId)}"] .story-menu-toggle`)?.focus({ preventScroll: true });
  state.storySelectionFocusId = '';
}
function beginStorySelection(id) {
  closeStoryMenu();
  if (!state.storySelectionMode) {
    state.storySelectionMode = true; state.selectedStoryIds.clear(); state.storySelectionFocusId = id;
  }
  state.selectedStoryIds.add(id);
  const scrollY = window.scrollY;
  renderLibrary(); window.scrollTo(0, scrollY);
  $('library-list').querySelector(`[data-story-id="${CSS.escape(id)}"] .story-select-checkbox`)?.focus({ preventScroll: true });
}
function toggleStorySelection(id) {
  if (state.selectedStoryIds.has(id)) state.selectedStoryIds.delete(id); else state.selectedStoryIds.add(id);
  if (!state.selectedStoryIds.size) { state.storySelectionFocusId = id; leaveStorySelection(true); return; }
  syncStorySelection();
}
function removeSelectedStories(ids) {
  if (!ids.size || pendingDeletionBlocked()) return false;
  const previous=state.stories; state.stories=previous.filter(story=>!ids.has(story.id));
  try { persistStories(); leaveStorySelection(); renderLibrary(); toast(`${ids.size} ${ids.size===1?'story':'stories'} deleted`); return true; }
  catch(error) { state.stories=previous; toast(error.message); return false; }
}
const {
  closeStoryMenu, confirmStoryDeletion, libraryChanged, renderLibrary, wireLongPress
} = createLibraryView({
  $, LANGUAGES, beginStorySelection, finishDeletedStoryReader: (...args) => finishDeletedStoryReader(...args), leaveStorySelection, openReader: (...args) => openReader(...args), openShareDialog: (...args) => openShareDialog(...args),
  pendingDeletionBlocked, removeSelectedStories, state, syncStorySelection, toast, toggleStorySelection
});
// Functions created further down are passed as wrappers resolved at call time; selectionMenuRouter is an
// object created further down, so the reader gets a forwarder for the one method it calls (reset).
const {
  activeChapter, activeVersion, closeReaderActions, closeReaderPanels, closeWordNote, confirmReaderRemoval,
  createInlineListenButton, ensureStoryPaths, finishDeletedStoryReader, keepReaderLocation, loadReaderPositions,
  normalizeChapters, openReader, pathChapters, pendingSummaryCount, persistReaderPosition, positionReaderPanel,
  prepareStoryMemory, profileSnapshot, readerPanel, readerPanels, readerStory, rebuildPathLabel, recentProse,
  rememberReaderPosition, removeReaderContent, renderChapterNavigation, renderChapterRequest,
  renderReaderActions, restoreReaderPosition, selectedPath, sentenceContext, setReaderTextSize,
  setReaderViewport, setRestoringPathPosition, showWordNote, storyContextReady, toggleReaderActions,
  updateReader, updateReaderNavigation
} = createReaderView({
  $, LANGUAGES, PROFILE_DEFINITIONS, SPEECH_LANGUAGES,
  activateStoryText: (...args) => activateStoryText(...args),
  clearExplanationSelection: (...args) => clearExplanationSelection(...args), closeStoryMenu,
  confirmStoryDeletion, fillLevelOptions, fillScopeOptions, fitReaderTitle: (...args) => fitReaderTitle(...args),
  pendingDeletionBlocked, persistReaderStory, persistStories, readerAi: (...args) => readerAi(...args),
  readingDescription, recordNoteLookup,
  releaseInvalidReaderResponse: (...args) => releaseInvalidReaderResponse(...args), renderCheckpointRecovery,
  renderGenerationRecovery, renderMemoryRebuild,
  renderPendingReaderResult: (...args) => renderPendingReaderResult(...args), renderReaderGeneration,
  renderReaderListen: (...args) => renderReaderListen(...args),
  renderSavedHelp: (...args) => renderSavedHelp(...args),
  savePendingReaderResult: (...args) => savePendingReaderResult(...args),
  selectionMenuRouter: { reset: () => selectionMenuRouter.reset() }, setView, settingsFeedback, showEditPanel,
  showExplanationForHelp: (...args) => showExplanationForHelp(...args), startExposure, state, stopExposure,
  stopSpeech: (...args) => stopSpeech(...args), toast, trySaveSettings, usage
});
const {
  renderPlayerFollow, runReaderPlayer
} = createReaderPlayerUi({
  $, SPEECH_LANGUAGES, clearExplanationSelection: (...args) => clearExplanationSelection(...args), closeWordNote, readerPanel, state, stopSpeech: (...args) => stopSpeech(...args), toast,
  trackedSpeech, trySaveSettings
});
const {
  activateStoryText, clearExplanationSelection, createChapterLoading, createHelpLoading, fitReaderTitle,
  openShareDialog, readerAi, releaseInvalidReaderResponse, releaseSavedInference, renderPendingReaderResult,
  renderReaderListen, renderSavedHelp, savePendingReaderResult, savedFollowUps, showExplanationForHelp,
  stopSpeech
} = createReaderHelp({
  $, LANGUAGES, SPEECH_LANGUAGES, activeChapter, activeVersion, aiSession, cancelGeneration, closeWordNote,
  createInlineListenButton, currentBackgroundRun, currentPipeline, currentReaderGeneration,
  finishGeneratedRequest, normalizeChapters, pathChapters, pendingDeletionBlocked, persistReaderStory,
  profileSnapshot, readerPanel, readerStory, recordSelectionLookup, renderCheckpointRecovery,
  renderReaderGeneration, resetCopyLabels: (...args) => resetCopyLabels(...args), revealCard,
  runContentOperation, runReaderPlayer, selectedPath, sentenceContext, setPlaybackContext, setReaderGeneration,
  showOperationResult, showWordNote, state, stopBackgroundContext, toast, trackedSpeech, updateReader,
  updateShareSummaries: (...args) => updateShareSummaries(...args), usage, wireLongPress, workspaceStorage
});
const {
  resetCopyLabels, updateShareSummaries
} = createShareDialog({
  $, activeVersion, libraryChanged, normalizeChapters, pathChapters, persistStories, readJson, renderLibrary,
  state, toast, trySaveSettings, workspaceStorage
});
$('reader-share').addEventListener('click', () => {
  const story = readerStory(); if (!story) return;
  closeReaderActions(); openShareDialog(story, {chapterIndex:state.readerChapter, trigger:$('reader-actions-toggle')});
});
// Android's own selection menu would compete with the LingoMage bar on story text, but fields need Cut/Copy/Paste.
const selectionMenuRouter = createSelectionMenuRouter({ host: selectionMenu, document, window });

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
  if (state.checkpointBlocked || pipeline?.records.length) { $('notes-rebuild-dialog').close(); if (pipeline?.records.length) showPendingRecovery(); else showStorageErrors(); return; }
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
    if (backgroundRun) await stopBackgroundContext();
    persistReaderStory(story);
    await releaseSavedInference();
    const op = await runContentOperation({ kind: 'notes', language: story.language, input, plan: version.languagePlan || null, prose: { title: version.title, story: version.story }, config, target: { storyId: story.id, chapterId: chapter.id, versionId: version.id, index: target.index } });
    showOperationResult(op);
  } catch (error) {
    try { await releaseInvalidReaderResponse(); } catch {}
    const cancelled = error.code === 'generation_cancelled';
    if (readerGeneration?.storyId === story.id) setReaderGeneration(cancelled ? null : { ...readerGeneration, phase: 'error', message: pipeline?.records[0]?.discardRequested ? discardFailureMessage(pipeline.records[0]) : 'Vocabulary notes stopped.' });
    if (cancelled && !pipeline?.records.length) toast('Generation cancelled');
    else if (pipeline?.records.length) { renderCheckpointRecovery(); revealRecovery(pipeline.records[0]); }
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

$('reader-actions-toggle').addEventListener('click', toggleReaderActions);
$('reader-remove-chapters').addEventListener('click', () => confirmReaderRemoval('chapters'));
$('reader-delete-path').addEventListener('click', () => confirmReaderRemoval('path'));
$('reader-removal-confirm').addEventListener('click', () => removeReaderContent());
$('reader-removal-cancel').addEventListener('click', () => $('reader-removal-dialog').close());
$('reader-removal-dialog').addEventListener('close', () => { state.readerRemoval = null; $('reader-actions-toggle').focus(); });
$('reader-removal-dialog').addEventListener('click', event => { if (event.target === $('reader-removal-dialog')) $('reader-removal-dialog').close(); });
document.addEventListener('click', event => { if (!event.target.closest?.('#reader-actions-toggle, #reader-actions-menu')) closeReaderActions(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('reader-actions-menu').hidden) { event.preventDefault(); event.stopPropagation(); closeReaderActions(true); }
}, true);
window.addEventListener('resize', () => {
  closeReaderActions(); closeWordNote();
  setReaderViewport({ width: window.innerWidth, height: window.innerHeight });
  if ($('reader-dialog').open) {
    // Refit the title first: its stale width would wrap it and move the story after centring.
    keepReaderLocation(fitReaderTitle);
    for (const name of ['navigation', 'preferences']) if (!$(`reader-${name}-panel`).hidden) positionReaderPanel(name);
  }
  updateReaderNavigation(); renderReaderGeneration();
});
$('chapter-select').addEventListener('change', () => { closeReaderPanels(true); state.readerChapter = Number($('chapter-select').value); state.readerVersion = 0; clearExplanationSelection(); updateReader(); });
$('path-select').addEventListener('change', () => {
  if (state.readerEditBusy) { $('path-select').value = selectedPath().id; return; }
  rememberReaderPosition(); closeWordNote(); clearExplanationSelection();
  const story = readerStory(), previous = story.activePathId; story.activePathId = $('path-select').value;
  try { persistReaderStory(story); } catch (error) { story.activePathId = previous; toast(error.message); }
  const position = state.readerPositions[`${story.id}:${selectedPath(story).id}`];
  state.readerChapter = Math.max(0, pathChapters(story).findIndex(chapter => chapter.id === position?.chapterId));
  const keepNavigation = !$('reader-navigation-panel').hidden;
  $('reader-edit-panel').hidden = true; state.readerEditDraft = null; updateReader(keepNavigation);
  setRestoringPathPosition(true); restoreReaderPosition(position);
  requestAnimationFrame(() => { setRestoringPathPosition(false); if (keepNavigation && !$('reader-navigation-panel').hidden) positionReaderPanel('navigation'); });
});
$('chapter-prev').addEventListener('click', () => { if (state.readerChapter > 0) { state.readerChapter--; clearExplanationSelection(); } updateReader(); });
$('chapter-next').addEventListener('click', () => { if (state.readerChapter < pathChapters(readerStory()).length - 1) { state.readerChapter++; clearExplanationSelection(); } updateReader(); });
readerPanels.initialize();
$('furigana-toggle').addEventListener('change', () => { state.furigana = $('furigana-toggle').checked; keepReaderLocation(() => { $('reader-story').classList.toggle('hide-furigana', !state.furigana); $('reader-title').classList.toggle('hide-furigana', !state.furigana); requestAnimationFrame(fitReaderTitle); }); document.querySelectorAll('#reader-help .story-text').forEach(node => node.classList.toggle('hide-furigana', !state.furigana)); trySaveSettings(); });
function showEditPanel(mode) {
  if (state.readerEditBusy) return;
  const story = readerStory(), version = activeVersion();
  fillLevelOptions($('reader-level'), story.language, version.difficulty || story.difficulty);
  $('reader-level-description').textContent = readingDescription(story.language, $('reader-level').value) || 'Choose a reading level for the new version.';
  fillScopeOptions($('reader-scope'), version.scope || story.scope, $('reader-scope-description'));
  $('reader-edit-panel').hidden = false; $('reader-prompt').value = ''; $('reader-edit-error').textContent = '';
  $('reader-edit-panel').dataset.mode = mode;
  $('reader-prompt-label').textContent = mode === 'continue' ? 'What should happen next? (optional)' : 'How should this chapter change? (optional)';
  $('reader-prompt').placeholder = 'Add ideas in any language, or leave blank.';
  $('reader-edit-submit').textContent = mode === 'continue' ? 'Continue' : 'Rewrite';
  $('reader-edit-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); $('reader-prompt').focus();
}
$('continue-story').addEventListener('click', () => showEditPanel('continue'));
$('rewrite-chapter').addEventListener('click', () => showEditPanel('rewrite'));
for (const [id, mode] of [['reader-menu-continue', 'continue'], ['reader-menu-rewrite', 'rewrite']]) $(id).addEventListener('click', () => { closeReaderActions(); showEditPanel(mode); });
$('reader-edit-cancel').addEventListener('click', () => { if (!state.readerEditBusy) { $('reader-edit-panel').hidden = true; state.readerEditDraft = null; } });
$('reader-edit-submit').addEventListener('click', async () => {
  if (state.readerEditBusy) return;
  if (state.checkpointBlocked || pipeline?.records.length) { if (pipeline?.records.length) showPendingRecovery(); else showStorageErrors(); return; }
  const prompt = $('reader-prompt').value.trim();
  const story = readerStory(), chapters = pathChapters(story), chapter = chapters[state.readerChapter], version = activeVersion(chapter), mode = $('reader-edit-panel').dataset.mode;
  const path = selectedPath(story), entries = path.entries.map(entry => ({ ...entry })), rewriteIndex = state.readerChapter;
  const sourceVersion = mode === 'continue' ? activeVersion(chapters[chapters.length - 1]) : version;
  const providerId = state.providerId, model = state.model, config = { providerId, model, reasoning: state.reasoning, light: lightModelChoice(state), notesParts: noteParts(), parallelLimit: parallelLimitFor(state.concurrentRequests), noteDensity: state.noteDensity, progressive: true, retryBroken: state.retryBrokenReplies !== false }, memoryConfig = lightTaskConfig(state);
  const difficulty = $('reader-level').value, scope = $('reader-scope').value;
  if (!levelDefinition(story.language,difficulty)) { $('reader-edit-error').textContent='Choose a reading level for this generation.'; return; }
  if (ai.available === false || (Array.isArray(state.models) && !state.models.length && $('ai-setup')?.hidden === false)) { $('reader-edit-error').textContent='Open App² → Settings → AI and connect a provider, then return here.'; return; }
  if (!String(model || '').trim()) { $('reader-edit-error').textContent='No AI model is selected. Open Settings and choose an AI model before generating.'; return; }
  if (Array.isArray(state.models) && !state.models.some(item => item.id === model)) { $('reader-edit-error').textContent='The selected AI model is not available now. Open Settings and choose an available model.'; return; }
  const input = { topic: story.topic || '', practice: story.practice || (story.words || []).join(', '), language: LANGUAGES[story.language], languageCode: story.language, difficulty, framework: LEVELS[story.language].framework, levelDescription: guideFor(story.language, difficulty), readingSelfReport: readingDescription(story.language, difficulty), languageExpectations: state.languageExpectations[story.language] || '', scope, scopeDescription: scopeGuide(scope, story.language, difficulty), learnerProfile: { ...profileSnapshot(story), readingStartingPoint: difficulty, readingSelfReport: readingDescription(story.language, difficulty) }, prompt };
  const instructions = chapterInstructions(LANGUAGES[story.language], difficulty, guideFor(story.language, difficulty), mode);
  state.readerEditBusy = true; state.readerEditDraft = null; $('path-select').disabled = true;
  const loading = createChapterLoading(mode);
  // Earlier chapters are summarized before the operation exists; the checklist shows that as its first step.
  const memoryEntries = mode === 'continue' ? entries : entries.slice(0, rewriteIndex);
  // The estimate is made now, while it can still count the story-context summaries this run will make.
  const estimate = estimateFor(operationPlan({ kind: mode, language: story.language, input: { scope }, config }, pendingSummaryCount(story, memoryEntries)));
  const request = state.activeChapterRequest = { storyId: story.id, loading, stopped:false, cancelledByUser:false, clockId: `chapter-request-${Date.now()}`, timings: [], estimate };
  config.signal=request; memoryConfig.signal=request;
  const provisional = { id: request.clockId, kind: mode, language: story.language, stage: storyContextReady(story, memoryEntries) && !backgroundRun ? 'plan' : 'context', target: { index: rewriteIndex } };
  if (hasStoryContext(provisional)) { loading.querySelector('strong').textContent = 'Preparing story context…'; paintChapterProgress(request, provisional); }
  renderChapterRequest();
  setReaderGeneration({ storyId: story.id, phase: 'working', message: hasStoryContext(provisional) ? progressSummary(provisional).text : mode === 'continue' ? 'Preparing next chapter…' : 'Preparing rewrite…' });
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
      const priorEntry = mode === 'continue' ? entries[entries.length - 1] : entries[rewriteIndex - 1];
      const priorVersion = priorEntry ? normalizeChapters(story).find(c => c.id === priorEntry.chapterId).versions.find(v => v.id === priorEntry.versionId) : null;
      input.recentProse = priorVersion ? recentProse(priorVersion.story) : '';
      if (mode === 'rewrite') input.currentChapter = { title: sourceVersion.title, story: sourceVersion.story };
      if (readerGeneration) { readerGeneration.message = mode === 'continue' ? 'Writing the next chapter…' : 'Rewriting this chapter…'; renderReaderGeneration(); }
      loading.querySelector('strong').textContent = mode === 'continue' ? 'Writing the next chapter…' : 'Rewriting this chapter…';
      return runContentOperation({kind:mode,language:story.language,input,instructions,config,timings:request.timings,target:{storyId:story.id,pathId:path.id,entries,chapterId:chapter.id,sourceVersionId:sourceVersion.id,index:rewriteIndex}});
    });
    showOperationResult(op);
  } catch (error) {
    try { await releaseInvalidReaderResponse(); } catch {}
    // A deliberate cancel clears the status instead of reporting a failure.
    if (readerGeneration?.storyId === story.id) setReaderGeneration(error.code === 'generation_cancelled' || request.cancelledByUser ? null : { ...readerGeneration, phase: 'error', message: pipeline?.records[0]?.discardRequested ? discardFailureMessage(pipeline.records[0]) : 'Generation stopped.' });
    if ((error.code === 'generation_cancelled' || request.cancelledByUser) && !pipeline?.records.length) toast('Generation cancelled');
    else if (error.code !== 'generation_cancelled' && !request.cancelledByUser) notifyStopped(mode);
    const message = error.code === 'generation_cancelled' || request.cancelledByUser ? '' : pipeline?.records.length ? '' : `${failureInfo(error, 'context').message} Submit again to retry.`;
    state.readerEditDraft = { storyId: story.id, pathId: path.id, chapterId: chapter.id, mode, prompt, difficulty, scope, error: message };
    if (state.readerId === story.id) {
      state.readerChapter = chapters.indexOf(chapter); updateReader();
      $('reader-edit-panel').hidden = false; $('reader-prompt').value = prompt; $('reader-edit-panel').dataset.mode = mode;
      $('reader-edit-error').textContent = message; renderPendingReaderResult();
    }
  }
  finally { $('path-select').disabled = false; loading.remove(); state.activeChapterRequest = null; renderChapterRequest(); state.readerEditBusy = false; $('reader-edit-cancel').disabled = false; $('reader-prompt').disabled = false; $('reader-level').disabled = false; setScopeDisabled($('reader-scope'), false); button.disabled = false; button.textContent = mode === 'continue' ? 'Continue' : 'Rewrite'; renderCheckpointRecovery(); }

});
$('reader-dialog').addEventListener('click', event => { if (event.target === $('reader-dialog')) $('reader-dialog').close(); });


let modelRefreshVersion = 0;
async function refreshModels() {
  if (state.storageBlocked) return;
  const refreshVersion = ++modelRefreshVersion;
  const select = $('model-select');
  if (!ai.available) { $('ai-setup').hidden = false; $('model-controls').hidden = true; return; }
  try {
    const {providers} = await ai.providers();
    if (refreshVersion !== modelRefreshVersion) return;
    const connected = providers?.filter(provider => provider.connected) || [];
    const provider = connected.find(item => item.id === state.providerId) || connected[0];
    if (!provider) {
      state.models = [];
      $('ai-setup').hidden = false; $('model-controls').hidden = true;
      $('ai-setup').querySelector('.helper').textContent = ai.developmentLive
        ? 'ChatGPT is not connected in Codex. Run `codex login`, then restart the development server with --chatgpt.'
        : 'Open App² → Settings → AI, then connect a provider. Return here when it’s ready.';
      return;
    }
    const hadModel = !!state.model;
    const providerChanged = !!state.providerId && state.providerId !== provider.id;
    if (providerChanged) { state.model = ''; state.reasoning = ''; state.lightModel = ''; state.lightReasoning = ''; state.models = []; }
    state.providerId = provider.id; $('ai-setup').hidden = true; $('model-controls').hidden = false;
    const response = await ai.models(provider.id);
    if (refreshVersion !== modelRefreshVersion) return;
    state.models = response.models || [];
    if (!state.models.some(model => model.id === state.model)) { state.model = ''; state.reasoning = ''; }
    if (state.lightModel && !state.models.some(model => model.id === state.lightModel)) { state.lightModel = ''; state.lightReasoning = ''; }
    trySaveSettings(); // A write failure is reported by the settings notice; it does not mean the provider is unavailable.
    select.textContent = '';
    state.models.forEach(model => { const option = document.createElement('option'); option.value = model.id; option.textContent = model.name; select.append(option); });
    if (state.models.length) {
      const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const preferred = ai.developmentMock ? state.models[0] : (state.models.find(item => item.id === state.model) || (!providerChanged && !hadModel && state.models.find(item => normalize(item.id) === normalize(PREFERRED_MODEL) || normalize(item.name) === normalize(PREFERRED_MODEL))));
      select.disabled = false;
      if (preferred) { state.model = preferred.id; select.value = preferred.id; select.dispatchEvent(new Event('change')); }
      else { state.model = ''; select.selectedIndex = -1; }
    } else { state.model = ''; state.reasoning = ''; select.disabled = true; select.innerHTML = '<option>No models available</option>'; }
    if (!state.model) { $('reasoning-select').value = ''; $('reasoning-select').hidden = true; $('reasoning-label').hidden = true; }
    buildLightModelOptions();
  } catch { if (refreshVersion !== modelRefreshVersion) return; $('ai-setup').hidden = false; $('model-controls').hidden = true; }
}
$('language-settings-open').addEventListener('click', () => { setView('profile'); $('my-languages').scrollIntoView({ block: 'start' }); });
$('language-setup-dismiss').addEventListener('click', () => {
  state.languageSetupDismissed = true;
  $('language-setup').hidden = true;
  if (!trySaveSettings()) $('language-setup-dismiss').focus();
});
$('model-select').addEventListener('change', () => {
  state.model = $('model-select').value;
  buildReasoningOptions(true); state.reasoning = $('reasoning-select').value;
  trySaveSettings();
});
$('reasoning-select').addEventListener('change', () => { state.reasoning = $('reasoning-select').value; trySaveSettings(); });
$('light-model-select').addEventListener('change', () => {
  state.lightModel = $('light-model-select').value; state.lightReasoning = '';
  buildLightModelOptions(); trySaveSettings();
});
$('retry-broken').addEventListener('change', () => { state.retryBrokenReplies = $('retry-broken').checked; trySaveSettings(); });
$('notify-ready').addEventListener('change', () => setReadyNotifications($('notify-ready').checked));
// Estimates follow the form and the model settings they depend on.
$('split-notes').addEventListener('change', () => { state.splitNotes = $('split-notes').checked; trySaveSettings(); });
$('concurrent-requests').addEventListener('change', () => { state.concurrentRequests = $('concurrent-requests').checked; trySaveSettings(); });
// Settings → Vocabulary notes: picks the notes prompt for chapters started from now on (PED-002).
$('note-density').addEventListener('change', () => { state.noteDensity = $('note-density').value; trySaveSettings(); });
$('light-reasoning-select').addEventListener('change', () => { state.lightReasoning = $('light-reasoning-select').value; buildLightModelOptions(); trySaveSettings(); });
document.querySelectorAll('[data-light-task]').forEach(box => box.addEventListener('change', () => {
  state.lightTasks = LIGHT_TASKS.filter(task => document.querySelector(`[data-light-task="${task}"]`).checked); trySaveSettings();
}));
window.addEventListener('app2:ai:connection', refreshModels);
window.addEventListener('pageshow', () => { if (document.visibilityState === 'visible') refreshModels(); });

document.documentElement.style.colorScheme = 'dark';
state.stories = JSON.parse(JSON.stringify(workspaceStorage.load('data/stories.json').value));
loadReaderPositions();
const settings = workspaceStorage.load('data/settings.json').value; state.providerId = settings.providerId || ''; state.model = settings.model || PREFERRED_MODEL; state.reasoning = settings.reasoning || ''; state.lightModel = settings.lightModel || ''; state.lightReasoning = settings.lightReasoning || ''; state.lightTasks = lightTasks(settings); state.splitNotes = settings.splitNotes !== false; state.concurrentRequests = settings.concurrentRequests !== false; state.noteDensity = NOTE_DENSITIES.includes(settings.noteDensity) ? settings.noteDensity : DEFAULT_NOTE_DENSITY; state.retryBrokenReplies = settings.retryBrokenReplies !== false; state.notifyWhenReady = settings.notifyWhenReady === true;
state.furigana = settings.readingPreferences?.furigana !== false;
state.readerFontSize = Math.max(15, Math.min(30, Number(settings.readingPreferences?.fontSize) || 19));
state.speechRate = SPEECH_RATES.includes(Number(settings.readingPreferences?.speechRate)) ? Number(settings.readingPreferences.speechRate) : 1;
state.followAlong = settings.readingPreferences?.followAlong !== false;
state.backgroundStoryContext = settings.backgroundStoryContext !== false;
state.shareVocabularyNotes = settings.shareVocabularyNotes === true;
$('retry-broken').checked = state.retryBrokenReplies;
$('notify-ready').checked = state.notifyWhenReady;
$('split-notes').checked = state.splitNotes;
$('concurrent-requests').checked = state.concurrentRequests;
$('note-density').value = state.noteDensity;
$('background-context').checked = state.backgroundStoryContext;
state.languageSetupDismissed = settings.languageSetupDismissed === true;
state.languageOrder = [...new Set([...(Array.isArray(settings.languageOrder) ? settings.languageOrder : []), ...Object.keys(LANGUAGES)])].filter(code => Object.hasOwn(LANGUAGES, code));
const admitted = (field, map) => Object.entries(map || {}).filter(([code, value]) => SETTINGS_ADMIT[field](code, value));
state.targetLanguages = Object.fromEntries(admitted('targetLanguages', settings.targetLanguages));
state.standardizedLevels = Object.fromEntries(admitted('standardizedLevels', settings.standardizedLevels));
fillScopeOptions($('reading-scope'), 'scene', $('scope-description'));
state.learnerProfiles = Object.fromEntries(admitted('learnerProfiles', settings.learnerProfiles).map(([code,value]) => [code,value.slice(0,600)]));
state.languageExpectations = Object.fromEntries(admitted('languageExpectations', settings.languageExpectations).map(([code,value]) => [code,value.slice(0,600)]));
settingsPersistence.remember();
renderTargetLanguageSettings(); populateTargetPicker();
// Positions update in memory while scrolling; write them when the reader closes or the page is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') restartReadyCountdown();
  if (document.visibilityState === 'hidden' && $('reader-dialog').open) { rememberReaderPosition(); persistReaderPosition(); }
});
window.addEventListener('pagehide', () => { if ($('reader-dialog').open) { rememberReaderPosition(); persistReaderPosition(); } });
usage.setVisible(document.visibilityState === 'visible');
document.addEventListener('visibilitychange', () => {
  const visible = document.visibilityState === 'visible';
  usage.setVisible(visible);
  if (!visible) stopStatsRefresh(); else if ($('view-profile').classList.contains('active')) { renderStats(); startStatsRefresh(); }
});
window.addEventListener('pagehide', () => usage.setVisible(false));
window.addEventListener('pageshow', () => usage.setVisible(document.visibilityState === 'visible'));
document.addEventListener('scroll',scheduleRecoveryVisibility,{capture:true,passive:true});
document.addEventListener('toggle',scheduleRecoveryVisibility,true);
window.visualViewport?.addEventListener('resize',scheduleRecoveryVisibility);
initializePipeline();
showStorageErrors();
refreshModels();
paintNotificationControls();

// A recreated page keeps the current tab and reader entry, rather than returning to Create.
const restoredNavigation = history.state;
if (['create', 'library', 'profile', 'settings'].includes(restoredNavigation?.lingomageView)) setView(restoredNavigation.lingomageView);
const restoredStory = state.stories.find(story => story.id === restoredNavigation?.lingomageReader);
if (restoredStory) {
  if (restoredStory.paths?.some(path => path.id === restoredNavigation.lingomagePathId)) restoredStory.activePathId = restoredNavigation.lingomagePathId;
  const position = restoredNavigation.lingomagePosition;
  if (position?.chapterId && Number.isFinite(position.scrollTop)) state.readerPositions[`${restoredStory.id}:${selectedPath(restoredStory).id}`] = position;
  state.readerHistoryEntry = true;
  openReader(restoredStory);
}
