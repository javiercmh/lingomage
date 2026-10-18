import assert from 'node:assert/strict';
import {createWorkspaceStorage, createSettingsPersistence} from '../js/workspace-storage.js';
import {createSettingsFeedback, unsavedWorkReason} from '../js/settings-feedback.js';
import {createFakeDocument} from './support/fake-dom.mjs';

// Production persistence and feedback modules, wired the way app.js wires them, over fake files and a fake DOM.
function harness({stored = '{}', reader = false} = {}) {
  const {document, $} = createFakeDocument(['settings-write-error', 'reader-settings-error']);
  const files = new Map([['data/settings.json', stored]]);
  let failWrite = false, writes = 0;
  const storage = createWorkspaceStorage({read: path => files.get(path) ?? '', exists: path => files.has(path), write: (path, value) => { if (failWrite) return false; writes++; files.set(path, JSON.stringify(value)); return true; }});
  storage.load('data/settings.json');
  const state = {providerId: '', model: 'm', reasoning: '', languageOrder: ['de'], targetLanguages: {}, standardizedLevels: {}, learnerProfiles: {}, languageExpectations: {}, languageSetupDismissed: false, furigana: true, readerFontSize: 19, speechRate: 1, followAlong: true};
  const events = {rollbacks: 0, reapplied: 0};
  const view = {reader};
  const persistence = createSettingsPersistence({storage, state, admit: {},
    onRollback: () => events.rollbacks++, onReapply: () => events.reapplied++,
    onError: info => feedback.show(info), onSaved: () => { if (!persistence.pending) feedback.clear(); }});
  const feedback = createSettingsFeedback({$, document, persistence, readerOpen: () => view.reader});
  persistence.remember();
  return {document, $, files, state, storage, persistence, feedback, events, view, failWrite: value => { failWrite = value; }, writes: () => writes};
}
const save = h => { try { h.persistence.save(); } catch {} };

// A write failure shows a retryable notice in the page and the reader, and only the visible surface is a live alert.
{
  const h = harness();
  h.failWrite(true); h.state.readerFontSize = 25; save(h);
  const page = h.$('settings-write-error'), reader = h.$('reader-settings-error');
  assert.equal(page.hidden, false); assert.equal(reader.hidden, true, 'reader notice is hidden while the reader is closed');
  assert.equal(page.getAttribute('role'), 'alert'); assert.equal(reader.getAttribute('role'), null);
  assert.match(page.textContent, /Preference not saved/); assert.match(page.textContent, /Could not save data\/settings\.json/);
  assert.ok(page.button('Retry save'), 'write failures offer a retry of the change');
  assert.equal(h.state.readerFontSize, 19, 'state was rolled back');
  // Opening the reader moves the live alert inside the modal; closing it hides the reader copy but keeps the page copy.
  h.view.reader = true; h.feedback.sync();
  assert.equal(reader.hidden, false); assert.equal(reader.getAttribute('role'), 'alert'); assert.equal(page.getAttribute('role'), null);
  assert.ok(reader.button('Retry save'));
  h.view.reader = false; h.feedback.sync();
  assert.equal(reader.hidden, true); assert.equal(page.hidden, false); assert.equal(page.getAttribute('role'), 'alert');
}

// Repeated identical failures neither rebuild the notice (focus stays) nor announce again; Retry repeats the intended change.
{
  const h = harness({reader: true});
  const slider = h.document.createElement('input'); slider.focus();
  h.failWrite(true); h.state.readerFontSize = 25; save(h);
  const reader = h.$('reader-settings-error'), retry = reader.button('Retry save'); retry.focus();
  save(h); save(h);
  assert.equal(reader.button('Retry save'), retry, 'same failure does not rebuild the notice');
  assert.equal(h.document.activeElement, retry, 'keyboard focus stays on Retry');
  retry.click();
  assert.match(reader.textContent, /Still could not save/);
  assert.equal(reader.button('Retry save'), retry, 'a failed retry keeps the button');
  assert.equal(h.files.get('data/settings.json'), '{}', 'nothing is written while failing');
  h.failWrite(false); retry.click();
  assert.equal(h.state.readerFontSize, 25, 'Retry applied the intended change, not a reload');
  assert.equal(JSON.parse(h.files.get('data/settings.json')).readingPreferences.fontSize, 25);
  assert.equal(reader.hidden, true); assert.equal(h.$('settings-write-error').hidden, true);
  assert.equal(h.document.activeElement, slider, 'focus returns to the control being used');
  assert.equal(h.events.reapplied, 2, 'both the failed and the successful retry reapplied the change');
}

// A successful unrelated save does not clear a notice whose change is still unsaved.
{
  const h = harness();
  h.failWrite(true); h.state.speechRate = 1.5; save(h); h.failWrite(false);
  h.state.readerFontSize = 22; save(h);
  assert.equal(h.$('settings-write-error').hidden, false);
  h.$('settings-write-error').button('Retry save').click();
  assert.equal(h.$('settings-write-error').hidden, true); assert.equal(h.state.speechRate, 1.5);
}

// An unreadable store is not a write failure: no Retry save, the file name and guidance are shown, and bytes are untouched.
{
  const h = harness({stored: '{broken', reader: true});
  h.state.readerFontSize = 25; save(h);
  const reader = h.$('reader-settings-error');
  assert.equal(reader.hidden, false); assert.equal(reader.button('Retry save'), null);
  assert.match(reader.textContent, /data\/settings\.json/); assert.match(reader.textContent, /preserved/); assert.match(reader.textContent, /Close the reader, then use Retry loading/);
  assert.equal(h.files.get('data/settings.json'), '{broken'); assert.equal(h.writes(), 0); assert.equal(h.state.readerFontSize, 19);
}

// Reloading is refused whenever it would discard unsaved or in-flight work.
{
  const h = harness();
  const state = {}, pipeline = {busy: false};
  assert.equal(unsavedWorkReason({state, pipeline, persistence: h.persistence}), '');
  pipeline.busy = true; assert.match(unsavedWorkReason({state, pipeline, persistence: h.persistence}), /AI request is running/); pipeline.busy = false;
  for (const key of ['requestId', 'readerEditBusy', 'readerHelpBusy']) assert.match(unsavedWorkReason({state: {[key]: true}, pipeline, persistence: h.persistence}), /AI request is running/, key);
  for (const key of ['pendingReaderResult', 'pendingGeneration', 'pendingStoryRequestId', 'pendingReaderRequestId']) assert.match(unsavedWorkReason({state: {[key]: {}}, pipeline, persistence: h.persistence}), /not been saved|not saved/, key);
  h.failWrite(true); h.state.readerFontSize = 25; save(h);
  assert.match(unsavedWorkReason({state, pipeline, persistence: h.persistence}), /Retry save/, 'an unsaved preference change blocks a reload');
}
console.log('PASS settings feedback: persistent retryable write-failure notice in page and reader, no rebuild or repeated alert, focus kept, invalid stores non-retryable, reload guarded');
