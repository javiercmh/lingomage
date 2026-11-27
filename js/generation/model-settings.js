// Settings → AI models: loading providers and models from the host, and the model, reasoning, light-model and
// generation preference controls.
// The code is the former app.js section, moved verbatim; app.js calls createModelSettings where it used to be.
import { LIGHT_TASKS } from '../core/light-model.js';
import { ai } from '../bridge.js';

export function createModelSettings({
  $, buildLightModelOptions, buildReasoningOptions, PREFERRED_MODEL, setReadyNotifications, setView, state,
  trySaveSettings
}) {
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
  return {
    refreshModels
  };
}
