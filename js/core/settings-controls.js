// Settings persistence and controls: what settings.json loads into state, the save transaction and its notice, and
// keeping Settings controls (including the AI model and light-model options) in line with state.
// The code is the former app.js section, moved verbatim; app.js calls createSettingsControls where it used to be.
import { MAX_NOTE_PARTS } from '../generation/learning-validation.js';
import { createSettingsFeedback } from './settings-feedback.js';
import { createSettingsPersistence } from './workspace-storage.js';
import { lightModelChoice, lightTasks } from './light-model.js';

export function createSettingsControls({
  $, enabledLanguages, LANGUAGES, levelDefinition, LEVELS, paintNotificationControls, renderPlayerFollow,
  setReaderTextSize, state, STORY_GUIDES, syncLanguageSettings, workspaceStorage
}) {
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
  return {
    buildLightModelOptions, buildReasoningOptions, noteParts, SETTINGS_ADMIT, settingsFeedback,
    settingsPersistence
  };
}
