import { lightTasks } from './core/light-model.js';
import { ai, readFile, writeFile, listFiles, selectionMenu } from './bridge.js';
import { createSelectionMenuRouter } from './core/selection-menu.js';
import { SPEECH_RATES } from './reader/reader-player.js';
import { parseContent, validateStory } from './generation/learning-validation.js';
import { NOTE_DENSITIES, DEFAULT_NOTE_DENSITY, scopeGuide } from './generation/prompts.js';
import { createWorkspaceStorage, optionalStore } from './core/workspace-storage.js';
import { createAiSession } from './core/ai-session.js';
import { unsavedWorkReason } from './core/settings-feedback.js';
import { createStatsView } from './screens/stats-view.js';
import { createLanguageSettings } from './screens/language-settings.js';
import { createShareDialog } from './screens/share-dialog.js';
import { createReaderPlayerUi } from './reader/reader-player-ui.js';
import { createLibraryView } from './screens/library-view.js';
import { createGenerationStatusUi } from './generation/generation-status-ui.js';
import { createCreateFlow } from './screens/create-flow.js';
import { createReaderView } from './reader/reader-view.js';
import { createGenerationBar } from './generation/generation-bar.js';
import { createBackgroundContext } from './generation/background-context.js';
import { createLearnerTracking } from './tracking/learner-tracking.js';
import { createSettingsControls } from './core/settings-controls.js';
import { createCheckpointRecovery } from './generation/checkpoint-recovery.js';
import { createGenerationResults } from './generation/generation-results.js';
import { createLibrarySelection } from './screens/library-selection.js';
import { createStoryRebuild } from './reader/story-rebuild.js';
import { createReaderControls } from './reader/reader-controls.js';
import { createContinueFlow } from './reader/continue-flow.js';
import { createModelSettings } from './generation/model-settings.js';
import { createReaderSelection } from './reader/reader-selection.js';
import { createReaderListen } from './reader/reader-listen.js';
import { createHelpCards } from './reader/help-cards.js';
import { createReaderRequests } from './reader/reader-requests.js';
import { createDefineNote } from './reader/define-note.js';

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
// Runtime state by area. Some fields are first set where they are needed (for example storageBlocked, readerHelpBusy).
const state = {
  // Stores
  stories: [], current: null, readerPositions: {}, checkpointBlocked: false,
  // Settings (saved in data/settings.json; SETTINGS_ADMIT in js/core/settings-controls.js limits what loads)
  languageOrder: Object.keys(LANGUAGES), standardizedLevels: {}, targetLanguages: {}, learnerProfiles: {},
  languageExpectations: {}, languageSetupDismissed: false, providerId: '', model: '', reasoning: '', lightModel: '',
  lightReasoning: '', lightTasks: null, splitNotes: true, concurrentRequests: true,
  noteDensity: DEFAULT_NOTE_DENSITY, retryBrokenReplies: true, notifyWhenReady: false, backgroundStoryContext: true,
  shareVocabularyNotes: false, readerFontSize: 19, furigana: true, speechRate: 1, followAlong: true,
  // AI models offered by the host
  models: [],
  // AI requests in flight and unsaved responses
  requestId: null, pendingStoryRequestId: null, pendingGeneration: null, pendingReaderRequestId: null,
  pendingReaderResult: null, activeHelpRequest: null, activeChapterRequest: null, readerEditBusy: false,
  readerEditDraft: null,
  // Reader
  readerId: null, readerChapter: 0, readerVersion: 0, readerSelection: null, readerHistoryEntry: false,
  wordNoteTrigger: null, explanationSelectionMode: false, selectedExplanationIds: new Set(), selectionFocusId: '',
  // Chapter listening
  speechVersionKey: '', playerEnabled: false, player: null, playerUnits: [], following: true,
  // Library
  libraryLanguage: 'all', librarySort: 'recent', storyMenu: null, libraryStale: false, libraryPlainHero: false,
  deleteTrigger: null, deleteStoryIds: new Set(), storySelectionMode: false, selectedStoryIds: new Set(),
  storySelectionFocusId: '',
  // Page
  toastTimer: null
};

// Bindings that several modules read and reassign live on `runtime`, so every module sees the current value.
const runtime = { pipeline: null, readerGeneration: null, creatingStory: false, backgroundRun: null, playbackContext: {storyId:'', language:''} };
const {
  cancelGeneration, closeReader, elementInView, ensureReaderOpen, generationAction, generationLive,
  isViewingChapter, renderReaderGeneration, restartReadyCountdown, revealCard, scheduleRecoveryVisibility,
  setReaderGeneration
} = createGenerationBar({
  $, activeChapter: (...args) => activeChapter(...args), activeVersion: (...args) => activeVersion(...args),
  maybeStartBackgroundContext: (...args) => maybeStartBackgroundContext(...args),
  notesProgressMessage: (...args) => notesProgressMessage(...args),
  openReader: (...args) => openReader(...args),
  persistReaderPosition: (...args) => persistReaderPosition(...args), persistReaderStory,
  readerPanel: (...args) => readerPanel(...args), readerStory: (...args) => readerStory(...args),
  releaseInvalidReaderResponse: (...args) => releaseInvalidReaderResponse(...args),
  rememberReaderPosition: (...args) => rememberReaderPosition(...args),
  revealRecovery: (...args) => revealRecovery(...args), runtime,
  savePendingReaderResult: (...args) => savePendingReaderResult(...args),
  selectedPath: (...args) => selectedPath(...args), setView, state, toast,
  updateReader: (...args) => updateReader(...args)
});
const {
  maybeStartBackgroundContext, queueBackgroundContext, settleBackgroundContext, stopBackgroundContext
} = createBackgroundContext({
  generationLive, prepareStoryMemory: (...args) => prepareStoryMemory(...args), renderReaderGeneration, runtime,
  selectedPath: (...args) => selectedPath(...args), setReaderGeneration, state,
  storyContextReady: (...args) => storyContextReady(...args), toast
});
function readJson(path, fallback) {
  try { const text = readFile(path); return text.trim() ? JSON.parse(text) : fallback; }
  catch (error) { console.error(`Could not read ${path}`, error); return fallback; }
}
const workspaceStorage = createWorkspaceStorage({read:readFile, write:writeFile, exists:path => { const files=listFiles({strict:true}); return files.some(file=>file.name === path); }});
const {
  recordNoteLookup, recordSelectionLookup, signals, startExposure, stopExposure, trackedSpeech, usage
} = createLearnerTracking({
  $, activeChapter: (...args) => activeChapter(...args), activeVersion: (...args) => activeVersion(...args),
  readerPanel: (...args) => readerPanel(...args), readerStory: (...args) => readerStory(...args),
  renderLookupStatus: (...args) => renderLookupStatus(...args),
  renderUsageStatus: (...args) => renderUsageStatus(...args), runtime,
  sentenceContext: (...args) => sentenceContext(...args), SPEECH_LANGUAGES, state, workspaceStorage
});
const {
  buildLightModelOptions, buildReasoningOptions, noteParts, SETTINGS_ADMIT, settingsFeedback,
  settingsPersistence
} = createSettingsControls({
  $, enabledLanguages: (...args) => enabledLanguages(...args), LANGUAGES, levelDefinition, LEVELS,
  paintNotificationControls: (...args) => paintNotificationControls(...args),
  renderPlayerFollow: (...args) => renderPlayerFollow(...args),
  setReaderTextSize: (...args) => setReaderTextSize(...args), state, STORY_GUIDES,
  syncLanguageSettings: (...args) => syncLanguageSettings(...args), workspaceStorage
});
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
  if (runtime.pipeline) renderCheckpointRecovery();
  if (state.storageBlocked) { $('generate').disabled=true; applyStorageBlock(); }
}
// Settings stay readable (disclosure toggles work) but cannot be edited while a store is unreadable.
function applyStorageBlock() {
  document.querySelectorAll('#view-settings input, #view-settings select, #view-settings textarea, #view-settings button:not(#settings-back), #my-languages input, #my-languages select, #my-languages textarea, #my-languages button:not(.language-toggle)').forEach(control=>{control.disabled=true;});
}
$('storage-retry').addEventListener('click', () => {
  const reason=unsavedWorkReason({state, pipeline: runtime.pipeline, persistence:settingsPersistence});
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

const {
  createProgressView, estimateFor, notifyResult, notifyStopped, operationPlan, paintNotificationControls,
  paintProgress, setReadyNotifications
} = createGenerationStatusUi({
  $, generationLive, state, trySaveSettings
});
const {
  applyGenerationLocks, createProgressRoot, paintChapterProgress, renderCheckpointRecovery, revealRecovery,
  runContentOperation, showPendingRecovery
} = createCheckpointRecovery({
  $, aiSession, closeReader, createChapterLoading: (...args) => createChapterLoading(...args),
  createProgressView, ensureReaderOpen, generationAction, isViewingChapter, LANGUAGES,
  notesProgressMessage: (...args) => notesProgressMessage(...args), notifyStopped, paintProgress,
  PROFILE_DEFINITIONS, renderChapterRequest: (...args) => renderChapterRequest(...args), renderReaderGeneration,
  revealCard, runtime, setReaderGeneration, setScopeDisabled, setView,
  showOperationResult: (...args) => showOperationResult(...args), state, stopBackgroundContext, toast,
  workspaceStorage
});
const {
  initializePipeline, notesProgressMessage, showOperationResult
} = createGenerationResults({
  $, aiSession, elementInView, ensureReaderOpen, ensureStoryPaths: (...args) => ensureStoryPaths(...args),
  fillLevelOptions, generationAction, isViewingChapter,
  normalizeChapters: (...args) => normalizeChapters(...args), notifyResult,
  persistReaderPosition: (...args) => persistReaderPosition(...args), persistReaderStory,
  queueBackgroundContext, readerPanel: (...args) => readerPanel(...args), readingDescription,
  rememberReaderPosition: (...args) => rememberReaderPosition(...args),
  renderChapterNavigation: (...args) => renderChapterNavigation(...args), renderCheckpointRecovery,
  renderReaderActions: (...args) => renderReaderActions(...args), renderReaderGeneration, runtime,
  savedFollowUps: (...args) => savedFollowUps(...args), selectedPath: (...args) => selectedPath(...args),
  setReaderGeneration, setScope, showStorageErrors, state, toast,
  updateReader: (...args) => updateReader(...args),
  updateReaderNavigation: (...args) => updateReaderNavigation(...args), workspaceStorage
});
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
  $, LANGUAGES, PROFILE_DEFINITIONS, createProgressRoot, guideFor, noteParts, notifyStopped, openReader: (...args) => openReader(...args), persistReaderStory,
  populateDifficulty, readingDescription, renderCheckpointRecovery, renderReaderGeneration, revealRecovery,
  runContentOperation, runtime, setReaderGeneration, showOperationResult, showPendingRecovery,
  showStorageErrors, state, stopBackgroundContext, storyInput, toast
});
function pendingDeletionBlocked() { return !!(state.checkpointBlocked || runtime.pipeline?.records.length || state.requestId || state.pendingGeneration || state.pendingStoryRequestId || state.pendingReaderRequestId || state.pendingReaderResult || state.readerEditBusy || state.readerHelpBusy); }
const {
  beginStorySelection, leaveStorySelection, removeSelectedStories, syncStorySelection, toggleStorySelection
} = createLibrarySelection({
  $, closeStoryMenu: (...args) => closeStoryMenu(...args), pendingDeletionBlocked, persistStories,
  renderLibrary: (...args) => renderLibrary(...args), state, toast
});
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
  renderGenerationRecovery, renderMemoryRebuild: (...args) => renderMemoryRebuild(...args),
  renderPendingReaderResult: (...args) => renderPendingReaderResult(...args), renderReaderGeneration,
  renderReaderListen: (...args) => renderReaderListen(...args),
  renderSavedHelp: (...args) => renderSavedHelp(...args),
  savePendingReaderResult: (...args) => savePendingReaderResult(...args),
  selectionMenuRouter: { reset: () => selectionMenuRouter.reset() }, setView, settingsFeedback, showEditPanel: (...args) => showEditPanel(...args),
  showExplanationForHelp: (...args) => showExplanationForHelp(...args), startExposure, state, stopExposure,
  stopSpeech: (...args) => stopSpeech(...args), toast, trySaveSettings, usage
});
const {
  renderPlayerFollow, runReaderPlayer
} = createReaderPlayerUi({
  $, SPEECH_LANGUAGES, clearExplanationSelection: (...args) => clearExplanationSelection(...args), closeWordNote, readerPanel, state, stopSpeech: (...args) => stopSpeech(...args), toast,
  trackedSpeech, trySaveSettings
});
createReaderSelection({
  $, activeChapter, activeVersion, closeWordNote, defineSelection: (...args) => defineSelection(...args),
  explainSelection: (...args) => explainSelection(...args), profileSnapshot, readerStory, recordSelectionLookup,
  sentenceContext, SPEECH_LANGUAGES, state, toast
});
const {
  fitReaderTitle, renderReaderListen, stopSpeech
} = createReaderListen({
  $, activeChapter, activeVersion, readerStory, runReaderPlayer, runtime, SPEECH_LANGUAGES, state, toast,
  trackedSpeech, usage
});
const {
  activateStoryText, clearExplanationSelection, confirmReplaceHelp, createChapterLoading, createHelpLoading,
  helpContext, overlappingHelp, renderSavedHelp, resolvedHelpContext, savedFollowUps, showExplanationForHelp,
  validTextRange
} = createHelpCards({
  $, activeChapter, activeVersion, cancelGeneration, closeWordNote, createInlineListenButton,
  explainSelection: (...args) => explainSelection(...args), pendingDeletionBlocked, persistReaderStory,
  profileSnapshot, readerPanel, readerStory, revealCard, showWordNote, SPEECH_LANGUAGES, state, toast,
  wireLongPress
});
const {
  explainSelection, readerAi, releaseInvalidReaderResponse, releaseSavedInference, renderPendingReaderResult,
  savePendingReaderResult
} = createReaderRequests({
  $, activeChapter, activeVersion, aiSession, confirmReplaceHelp, createHelpLoading, finishGeneratedRequest,
  helpContext, LANGUAGES, normalizeChapters, overlappingHelp, persistReaderStory, readerPanel, readerStory,
  recordSelectionLookup, renderCheckpointRecovery, renderReaderGeneration, renderSavedHelp, resolvedHelpContext,
  runContentOperation, runtime, savedFollowUps, setReaderGeneration, showOperationResult, state,
  stopBackgroundContext, toast, updateReader, validTextRange, workspaceStorage
});
const {
  defineSelection
} = createDefineNote({
  $, activeChapter, activeVersion, closeWordNote, LANGUAGES, normalizeChapters, persistReaderStory, readerAi,
  readerPanel, readerStory, releaseInvalidReaderResponse, releaseSavedInference, renderCheckpointRecovery,
  renderPendingReaderResult, renderReaderGeneration, runtime, savePendingReaderResult, setReaderGeneration,
  showWordNote, state, stopBackgroundContext, toast, updateReader, validTextRange
});
const {
  openShareDialog
} = createShareDialog({
  $, activeVersion, libraryChanged, normalizeChapters, pathChapters, persistStories, readJson, renderLibrary,
  selectedPath, state, toast, trySaveSettings, workspaceStorage
});
$('reader-share').addEventListener('click', () => {
  const story = readerStory(); if (!story) return;
  closeReaderActions(); openShareDialog(story, {chapterIndex:state.readerChapter, trigger:$('reader-actions-toggle')});
});
// Android's own selection menu would compete with the LingoMage bar on story text, but fields need Cut/Copy/Paste.
const selectionMenuRouter = createSelectionMenuRouter({ host: selectionMenu, document, window });

const {
  renderMemoryRebuild
} = createStoryRebuild({
  $, activeVersion, aiSession, closeReaderActions, createHelpLoading, guideFor, LANGUAGES, LEVELS,
  normalizeChapters, noteParts, pathChapters, pendingDeletionBlocked, persistReaderStory, prepareStoryMemory,
  profileSnapshot, readerStory, readingDescription, rebuildPathLabel, releaseInvalidReaderResponse,
  releaseSavedInference, renderChapterRequest, renderCheckpointRecovery, renderReaderActions,
  renderReaderGeneration, revealRecovery, runContentOperation, runtime, selectedPath, setReaderGeneration,
  showOperationResult, showPendingRecovery, showStorageErrors, state, stopBackgroundContext, toast,
  workspaceStorage
});
createReaderControls({
  $, clearExplanationSelection, closeReaderActions, closeReaderPanels, closeWordNote, confirmReaderRemoval,
  fitReaderTitle, keepReaderLocation, pathChapters, persistReaderStory, positionReaderPanel, readerPanels,
  readerStory, rememberReaderPosition, removeReaderContent, renderReaderGeneration, restoreReaderPosition,
  selectedPath, setReaderViewport, setRestoringPathPosition, state, toast, toggleReaderActions, trySaveSettings,
  updateReader, updateReaderNavigation
});
const {
  showEditPanel
} = createContinueFlow({
  $, activeVersion, aiSession, closeReaderActions, createChapterLoading, elementInView, estimateFor,
  fillLevelOptions, fillScopeOptions, guideFor, LANGUAGES, levelDefinition, LEVELS, normalizeChapters,
  noteParts, notifyStopped, operationPlan, paintChapterProgress, pathChapters, pendingSummaryCount,
  persistReaderStory, prepareStoryMemory, profileSnapshot, readerStory, readingDescription, recentProse,
  releaseInvalidReaderResponse, releaseSavedInference, renderChapterRequest, renderCheckpointRecovery,
  renderPendingReaderResult, renderReaderGeneration, runContentOperation, runtime, selectedPath,
  setReaderGeneration, setScopeDisabled, settleBackgroundContext, showOperationResult, showPendingRecovery,
  showStorageErrors, state, storyContextReady, toast, updateReader
});
$('reader-dialog').addEventListener('click', event => { if (event.target === $('reader-dialog')) $('reader-dialog').close(); });

const {
  refreshModels
} = createModelSettings({
  $, buildLightModelOptions, buildReasoningOptions, PREFERRED_MODEL, setReadyNotifications, setView, state,
  trySaveSettings
});
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
