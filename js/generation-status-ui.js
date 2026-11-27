// Generation waiting screens: field locks, the stage checklist and segmented bar, time estimates and time left,
// and opt-in ready notifications. Timing shown here is in memory only (js/generation-timing.js computes it).
// The code is the former app.js section, moved verbatim; app.js calls createGenerationStatusUi where it used to be.
import { progressSummary } from './generation-progress.js';
import { remainingText, remainingTime, estimateGeneration, timingSamples } from './generation-timing.js';
import { lightTaskConfig } from './light-model.js';
import { hasNotificationPermission, requestNotificationPermission, notify } from './bridge.js';
import { continueChapterNumber } from './story-model.js';

export function createGenerationStatusUi({
  $, generationLive, state, trySaveSettings
}) {
  // Field locks that follow generation state; also reapplied after controls that share them are rebuilt.
  // Stage checklist and segmented bar for the waiting screens. Timing is in memory only: it describes this
  // viewing, not the saved operation, so a reload simply starts counting again.
  const stepClock = new Map();
  let stepTimer = 0;
  function elapsedText(ms) { const s = Math.max(0, Math.floor(ms / 1000)); if (!s) return ''; return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function createProgressView() {
    const root = document.createElement('div'); root.className = 'gen-progress'; root.hidden = true;
    const bar = document.createElement('div'); bar.className = 'gen-bar'; bar.setAttribute('aria-hidden', 'true');
    const list = document.createElement('ol'); list.className = 'gen-steps';
    const status = document.createElement('p'); status.className = 'sr-only'; status.setAttribute('role', 'status');
    // Time left and the waiting note are not live regions: they change too often to announce.
    const eta = document.createElement('p'); eta.className = 'gen-eta'; eta.hidden = true;
    root.append(bar, list, status, eta, createWaitNote()); return root;
  }
  // A chapter card painted before its operation exists keeps the clock id it started with, so the story-context
  // step keeps its time once the real operation takes over.
  function paintProgress(root, op) {
    const summary = progressSummary(op), now = Date.now(), clockId = root.clockId || op.id;
    root.opened = Boolean(op.earlyApplied); // the chapter is readable; an estimate to opening has nothing left to say
    // One estimate per run, made when it starts; a chapter card brings its own (it knows the story-context step).
    if (root.estimateFor !== clockId) { root.estimateFor = clockId; root.estimate = root.presetEstimate !== undefined ? root.presetEstimate : op.config ? estimateFor(operationPlan(op)) : null; }
    for (const step of summary.steps) {
      const key = `${clockId}:${step.key}`, clock = stepClock.get(key) || {};
      if (step.state !== 'pending' && !clock.start) clock.start = now;
      if (step.state === 'done' && clock.start && !clock.end) clock.end = now;
      stepClock.set(key, clock);
    }
    const signature = JSON.stringify(summary.steps.map(step => [step.key, step.state]));
    root.hidden = false;
    if (root.dataset.signature !== signature) {
      root.dataset.signature = signature;
      const bar = root.querySelector('.gen-bar'), list = root.querySelector('.gen-steps');
      bar.textContent = ''; list.textContent = '';
      for (const step of summary.steps) {
        const segment = document.createElement('span'); segment.className = 'gen-seg'; segment.dataset.state = step.state; bar.append(segment);
        const item = document.createElement('li'); item.dataset.state = step.state; item.dataset.clock = `${clockId}:${step.key}`;
        const mark = document.createElement('span'); mark.className = 'gen-mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = step.state === 'done' ? '✓' : '';
        const label = document.createElement('span'); label.className = 'gen-label'; label.textContent = step.label;
        const hint = document.createElement('span'); hint.className = 'sr-only'; hint.textContent = step.state === 'done' ? ' (done)' : step.state === 'active' ? ' (in progress)' : ' (waiting)';
        const time = document.createElement('span'); time.className = 'gen-time';
        item.append(mark, label, hint, time); list.append(item);
      }
      root.querySelector('[role="status"]').textContent = summary.text;
    }
    tickProgress();
    if (!stepTimer) stepTimer = setInterval(tickProgress, 1000);
  }
  function tickProgress() {
    const items = document.querySelectorAll('.gen-steps li[data-clock]');
    if (!generationLive() || !items.length) { clearInterval(stepTimer); stepTimer = 0; }
    const now = Date.now();
    for (const item of items) {
      const clock = stepClock.get(item.dataset.clock), time = item.querySelector('.gen-time');
      time.textContent = clock?.start && item.dataset.state !== 'pending' ? elapsedText((clock.end || now) - clock.start) : '';
    }
    for (const root of document.querySelectorAll('.gen-progress')) paintTimeLeft(root, now);
  }
  // "Ready to read in about 2 minutes" (or "About 2 minutes left") from the run's estimate and each step's elapsed time on this page.
  function paintTimeLeft(root, now = Date.now()) {
    const eta = root.querySelector('.gen-eta'), items = [...root.querySelectorAll('.gen-steps li[data-clock]')];
    const steps = items.map(item => ({ key: item.dataset.clock.slice(item.dataset.clock.lastIndexOf(':') + 1), state: item.dataset.state }));
    const elapsed = Object.fromEntries(items.map((item, index) => { const clock = stepClock.get(item.dataset.clock); return [steps[index].key, clock?.start ? (clock.end || now) - clock.start : 0]; }));
    const message = root.estimate && steps.length && !(root.estimate.opens && root.opened) ? remainingText(remainingTime(root.estimate, steps, elapsed), { opens: Boolean(root.estimate.opens) }) : '';
    if (eta && eta.textContent !== message) eta.textContent = message;
    if (eta) eta.hidden = !message;
    const note = root.querySelector('.gen-wait');
    // The notification offer is for waits worth leaving for: unknown, or about a minute or more.
    if (note) note.hidden = !generationLive() || Boolean(root.estimate && root.estimate.total < 60000);
  }

  // Estimates (js/generation-timing.js): the sum of each step's median over similar earlier chapters on
  // this device, with the reasoning effort each flow actually sends.
  function estimateFor(plan) { return estimateGeneration(plan, timingSamples(state.stories)); }
  function operationPlan(op, contextRequests = 0) {
    const memory = lightTaskConfig(state);
    return { kind: op.kind, language: op.language, scope: op.input?.scope, notesParts: op.config?.notesParts, progressive: op.config?.progressive === true, model: op.config?.model, reasoning: op.config?.reasoning, light: op.config?.light, contextRequests, context: { model: memory.model, reasoning: memory.reasoning } };
  }
  // Ready notifications are opt-in: the waiting card offers them, Settings can turn them off. They are sent
  // only while LingoMage is in the background and Android allows notifications.
  function createWaitNote() {
    const note = document.createElement('div'); note.className = 'gen-wait'; note.hidden = true;
    const copy = document.createElement('p'); copy.className = 'helper'; copy.textContent = 'You can keep reading or switch apps while you wait.';
    const offer = document.createElement('button'); offer.type = 'button'; offer.className = 'small-btn gen-notify'; offer.textContent = 'Notify me when it’s ready';
    const status = document.createElement('p'); status.className = 'helper gen-notify-status';
    offer.addEventListener('click', () => { setReadyNotifications(true); });
    note.append(copy, offer, status); paintWaitNote(note); return note;
  }
  function notificationStatusText() {
    if (!state.notifyWhenReady) return '';
    if (hasNotificationPermission()) return 'You’ll get a notification when it’s ready.';
    return notificationAsked ? 'Notifications are off for LingoMage, so you won’t be told. Allow them in App²: LingoMage menu → Permissions.' : 'Allow notifications to be told when it’s ready.';
  }
  function paintWaitNote(note) {
    note.querySelector('.gen-notify').hidden = state.notifyWhenReady;
    const status = note.querySelector('.gen-notify-status'), text = notificationStatusText();
    status.textContent = text; status.hidden = !text;
  }
  function paintNotificationControls() {
    document.querySelectorAll('.gen-wait').forEach(paintWaitNote);
    $('notify-ready').checked = state.notifyWhenReady;
    const hint = $('notify-ready-status'), text = state.notifyWhenReady && !hasNotificationPermission() ? notificationStatusText() : '';
    hint.textContent = text; hint.hidden = !text;
  }
  let notificationAsked = false;
  function setReadyNotifications(on) {
    state.notifyWhenReady = on;
    if (!trySaveSettings()) { state.notifyWhenReady = !on; paintNotificationControls(); return; }
    if (on && !hasNotificationPermission()) requestNotificationPermission();
    paintNotificationControls();
  }
  // The host reports the real outcome of its permission dialogs here.
  window.addEventListener('app2:notifperm', () => { notificationAsked = true; paintNotificationControls(); });
  function notifyWhileAway(title, message) {
    if (!state.notifyWhenReady || document.visibilityState !== 'hidden' || !hasNotificationPermission()) return;
    try { notify(title, message); } catch { /* A notification is a convenience; the result is saved either way. */ }
  }
  function notifyResult(op, story) {
    if (!['create', 'continue', 'rewrite'].includes(op.kind)) return;
    const number = op.kind === 'continue' ? continueChapterNumber(op) : 0;
    const title = op.kind === 'create' ? 'Your story is ready' : op.kind === 'continue' ? `${op.target?.continueMode === 'branch' ? 'Parallel ' : ''}Chapter ${number} is ready` : 'Your rewritten chapter is ready';
    notifyWhileAway(title, story?.title || 'Open LingoMage to read it.');
  }
  function notifyStopped(kind) {
    if (['create', 'continue', 'rewrite'].includes(kind)) notifyWhileAway('Generation stopped', 'Open LingoMage to see what happened. Finished steps are kept.');
  }
  return {
    createProgressView, estimateFor, notifyResult, notifyStopped, operationPlan, paintNotificationControls,
    paintProgress, setReadyNotifications
  };
}
