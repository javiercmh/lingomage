import assert from 'node:assert/strict';
import {bootApp} from './support/app-harness.mjs';

// The real js/app.js, booted against a stub DOM and an in-memory file backend: start-up order, store
// states, Retry loading, settings rollback/Retry wiring and recovery-panel stability.
const base = {'data/stories.json': '[]', 'data/settings.json': '{"futureTop":{"a":1},"readingPreferences":{"followAlong":false,"futurePreference":7}}', 'data/generation-checkpoints.json': '[]'};
const findAll = (node, predicate, found = []) => { for (const child of node.children || []) { if (predicate(child)) found.push(child); findAll(child, predicate, found); } return found; };
const textOf = node => (node.textContent || '') + (node.children || []).map(textOf).join('');
const settingsFile = app => JSON.parse(app.file('data/settings.json'));

// Healthy and missing stores start normally.
let app = await bootApp({files: base});
assert.equal(app.el('storage-recovery').hidden, true); assert.equal(app.el('generate').disabled, false);
for (const name of Object.keys(base)) {
  const files = {...base}; delete files[name];
  app = await bootApp({files});
  assert.equal(app.el('storage-recovery').hidden, true, `${name} missing starts normally`);
}

// Malformed and blank stores block work, name the file, preserve the bytes, and Retry loading reloads once nothing is in flight.
for (const name of Object.keys(base)) {
  for (const bad of ['{broken', '']) {
    app = await bootApp({files: {...base, [name]: bad}});
    assert.equal(app.el('storage-recovery').hidden, false, `${name} ${JSON.stringify(bad)}`);
    assert.match(app.el('storage-recovery-message').textContent, new RegExp(name.replace('.', '\\.')));
    assert.match(app.el('storage-recovery-message').textContent, /original file has been preserved/);
    assert.equal(app.el('generate').disabled, true);
    assert.equal(app.file(name), bad, 'bytes preserved');
    // Preference edits cannot overwrite an unreadable settings file.
    if (name === 'data/settings.json') { app.el('furigana-toggle').checked = false; app.dispatch('furigana-toggle', 'change'); assert.equal(app.file(name), bad); assert.equal(app.el('furigana-toggle').checked, true, 'control restored'); assert.equal(app.el('settings-write-error').hidden, false); assert.equal(findAll(app.el('settings-write-error'), node => node.textContent === 'Retry save').length, 0, 'an unreadable store offers no Retry save'); }
    app.dispatch('storage-retry', 'click'); assert.equal(app.control.reloads, 1, 'Retry loading reloads when no work is in flight');
  }
}

// A settings write failure restores every control, keeps the file untouched and offers a retry of the intended change.
app = await bootApp({files: base});
const before = app.file('data/settings.json');
app.failWrites('data/settings.json');
app.el('furigana-toggle').checked = false; app.dispatch('furigana-toggle', 'change');
app.el('reader-text-size').value = '27'; app.dispatch('reader-text-size', 'input'); app.dispatch('reader-text-size', 'change');
app.dispatch('player-rate', 'change', {target: {value: '1.5'}});
app.dispatch('player-follow', 'click');
assert.equal(app.el('furigana-toggle').checked, true); assert.equal(app.el('reader-text-size').value, '19');
assert.equal(app.el('player-rate').value, '1'); assert.equal(app.el('player-follow').attributes['aria-pressed'], 'false', 'Follow toggle and saved preference agree');
assert.equal(app.file('data/settings.json'), before, 'nothing was written');
const notice = app.el('settings-write-error');
assert.equal(notice.hidden, false); assert.match(textOf(notice), /Could not save data\/settings\.json/);
const retry = app.buttonWithText(notice, 'Retry save'); assert.ok(retry, 'write failures offer Retry save');
// Reloading would discard the unsaved change, so Retry loading refuses.
app.dispatch('storage-retry', 'click'); assert.equal(app.control.reloads, 0); assert.match(app.el('storage-retry-note').textContent, /Retry save/);
// Retry while the disk still fails keeps the notice and the intended change.
app.click(retry); assert.equal(notice.hidden, false); assert.equal(app.file('data/settings.json'), before);
app.failWrites('data/settings.json', false);
app.click(retry);
assert.equal(notice.hidden, true, 'the notice clears after a successful retry');
const saved = settingsFile(app);
assert.equal(saved.readingPreferences.furigana, false); assert.equal(saved.readingPreferences.fontSize, 27); assert.equal(saved.readingPreferences.speechRate, 1.5); assert.equal(saved.readingPreferences.followAlong, true);
assert.equal(saved.readingPreferences.futurePreference, 7); assert.deepEqual(saved.futureTop, {a: 1});
assert.equal(app.el('furigana-toggle').checked, false); assert.equal(app.el('reader-text-size').value, '27'); assert.equal(app.el('player-rate').value, '1.5');

// An unrelated settings save leaves a failed-generation recovery panel (and its focus and alert) untouched.
const checkpoint = {id: 'op-1', kind: 'create', stage: 'prose', language: 'de', config: {}, input: {topic: 'x'}, request: null, promptVersion: 'older', safeguardVersion: 'older', error: 'The AI response could not be used.', createdAt: 'then'};
app = await bootApp({files: {...base, 'data/generation-checkpoints.json': JSON.stringify([checkpoint])}});
const panel = app.el('checkpoint-recovery-create'), rendered = [...panel.children];
assert.equal(panel.hidden, false); assert.ok(rendered.length > 0);
const unchanged = () => panel.children.length === rendered.length && panel.children.every((child, index) => child === rendered[index]);
app.el('furigana-toggle').checked = false; app.dispatch('furigana-toggle', 'change'); assert.ok(unchanged(), 'successful unrelated save rebuilt the recovery panel');
app.failWrites('data/settings.json'); app.el('furigana-toggle').checked = true; app.dispatch('furigana-toggle', 'change'); assert.ok(unchanged(), 'failed unrelated save rebuilt the recovery panel');
assert.equal(app.file('data/generation-checkpoints.json'), JSON.stringify([checkpoint]), 'the checkpoint was not rewritten');

// Unknown and legacy nested settings survive ordinary saves; deliberate Stop learning / Add still apply.
const longProfile = 'y'.repeat(900);
const future = {futureTop: {a: 1}, targetLanguages: {de: 'enabled', fr: 'enabled'}, standardizedLevels: {de: 'A1', fr: 'B1', ja: 'N0'}, languageOrder: ['fr', 'de', 'ja', 'ru', 'es-CL', 'xx'], learnerProfiles: {fr: 'future', de: longProfile}, languageExpectations: {fr: 'tu', de: 'Austrian'}, readingPreferences: {fontSize: 14, futurePreference: 7}};
app = await bootApp({files: {...base, 'data/settings.json': JSON.stringify(future)}});
app.el('furigana-toggle').checked = false; app.dispatch('furigana-toggle', 'change');
let result = settingsFile(app);
assert.deepEqual(result.futureTop, {a: 1}); assert.deepEqual(result.targetLanguages, {de: 'enabled', fr: 'enabled'});
assert.deepEqual(result.standardizedLevels, future.standardizedLevels); assert.equal(result.learnerProfiles.de, longProfile); assert.equal(result.learnerProfiles.fr, 'future');
assert.equal(result.languageExpectations.fr, 'tu'); assert.equal(result.languageOrder[0], 'fr'); assert.equal(result.languageOrder.at(-1), 'xx');
assert.equal(result.readingPreferences.fontSize, 14); assert.equal(result.readingPreferences.futurePreference, 7); assert.equal(result.readingPreferences.furigana, false);
const stop = findAll(app.el('target-language-options'), node => node.className === 'language-remove')[0];
assert.ok(stop, 'Stop learning is rendered for the enabled language'); app.click(stop);
result = settingsFile(app);
assert.deepEqual(result.targetLanguages, {fr: 'enabled'}, 'the removed known language is gone and the future one remains');
assert.equal(result.standardizedLevels.ja, 'N0'); assert.equal(result.languageExpectations.fr, 'tu');
const add = findAll(app.el('target-language-add'), node => node.className === 'language-add').find(node => node.dataset.code === 'ru');
assert.ok(add, 'Add is offered for a remaining language');
app.failWrites('data/settings.json'); app.click(add);
assert.deepEqual(settingsFile(app).targetLanguages, {fr: 'enabled'}, 'a failed Add is not written');
assert.ok(findAll(app.el('target-language-add'), node => node.className === 'language-add').some(node => node.dataset.code === 'ru'), 'a failed Add is rolled back in the list');
assert.equal(app.el('settings-write-error').hidden, false);
app.failWrites('data/settings.json', false); app.click(app.buttonWithText(app.el('settings-write-error'), 'Retry save'));
assert.equal(settingsFile(app).targetLanguages.ru, 'enabled', 'Retry repeats the Add'); assert.equal(settingsFile(app).targetLanguages.fr, 'enabled');
console.log('PASS app start-up and settings wiring: store states, Retry loading guard, rollback of every reader control, retry of the intended change, stable recovery panels, nested settings preservation');
process.exit(0);
