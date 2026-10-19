const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const app = fs.readFileSync('js/app.js', 'utf8');
const helperStart = app.indexOf('function runSelectionAction(');
const actionsStart = app.indexOf("$('selection-translate').addEventListener", helperStart);
const actionsEnd = app.indexOf("$('reader-copy').addEventListener", actionsStart);
assert(helperStart >= 0 && actionsStart > helperStart && actionsEnd > actionsStart, 'selection action runner and handlers exist');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function button() {
  const attributes = {};
  const classes = new Set();
  return {
    attributes, classes, listeners: {}, hidden: false,
    classList: { add(value) { classes.add(value); }, remove(value) { classes.delete(value); } },
    setAttribute(key, value) { attributes[key] = value; },
    getAttribute(key) { return attributes[key] ?? null; },
    addEventListener(type, listener) { this.listeners[type] = listener; }
  };
}

const buttons = Object.fromEntries(['selection-toolbar', 'selection-translate', 'selection-speak', 'selection-explain', 'selection-copy'].map(id => [id, button()]));
const pending = { translate: deferred(), speak: deferred(), copy: deferred(), generation: deferred() };
const toasts = [];
const context = {
  state: { readerSelection: { kind: 'body', text: 'Hallo', languageTag: 'de-DE' } },
  $: id => buttons[id],
  document: { execCommand: () => false },
  navigator: { clipboard: { writeText: () => pending.copy.promise } },
  translationLaunching: false,
  translationAvailability: 'available',
  renderTranslationButton() {},
  translation: { open: () => pending.translate.promise },
  speech: { available: true },
  speakSelection: () => pending.speak.promise,
  explainSelection(_kind, _action, _followUp, _selection, onTaskStarted) {
    assert.equal(buttons['selection-explain'].attributes['aria-busy'], 'true', 'Explain stays active while the AI task is being created');
    assert.equal(buttons['selection-toolbar'].hidden, false, 'Explain toolbar stays visible until handoff');
    onTaskStarted();
    return pending.generation.promise;
  },
  toast: message => toasts.push(message)
};
vm.createContext(context);
vm.runInContext(app.slice(helperStart, actionsStart) + app.slice(actionsStart, actionsEnd), context);

async function flush() { await new Promise(resolve => setTimeout(resolve, 0)); }
async function clickAndCheck(id, operation) {
  buttons[id].listeners.click();
  await flush();
  assert.equal(buttons[id].attributes['aria-busy'], 'true', `${id} announces busy while its action is active`);
  assert(buttons[id].classes.has('selection-action-active'), `${id} has the action highlight`);
  operation.resolve({ status: 'completed' });
  await flush();
  assert.equal(buttons[id].attributes['aria-busy'], 'false', `${id} clears busy after completion`);
  assert(!buttons[id].classes.has('selection-action-active'), `${id} clears the action highlight after completion`);
}

(async () => {
  await clickAndCheck('selection-copy', pending.copy);
  await clickAndCheck('selection-translate', pending.translate);
  await clickAndCheck('selection-speak', pending.speak);

  buttons['selection-explain'].listeners.click();
  await flush();
  assert.equal(buttons['selection-explain'].attributes['aria-busy'], 'false', 'Explain clears at AI task handoff');
  assert(!buttons['selection-explain'].classes.has('selection-action-active'), 'Explain is no longer highlighted during generation');
  assert.equal(buttons['selection-toolbar'].hidden, true, 'Explain toolbar closes at AI task handoff');
  pending.generation.resolve({});

  const failedButton = button();
  const failedAction = deferred();
  const failedRun = context.runSelectionAction(failedButton, () => failedAction.promise);
  await flush();
  assert.equal(failedButton.attributes['aria-busy'], 'true', 'failing action remains highlighted while pending');
  failedAction.reject(new Error('simulated failure'));
  await assert.rejects(failedRun, /simulated failure/);
  assert.equal(failedButton.attributes['aria-busy'], 'false', 'failure clears busy state');
  assert(!failedButton.classes.has('selection-action-active'), 'failure clears the action highlight');

  const source = fs.readFileSync('js/app.js', 'utf8');
  const start = source.indexOf('async function readerAi(');
  const end = source.indexOf('\nasync function acknowledgeReaderResult', start);
  const readerAi = source.slice(start, end);
  assert(readerAi.indexOf('config.onTaskStarted?.()') > readerAi.indexOf('await ai.start('), 'Explain handoff follows successful AI task creation');
  assert(readerAi.indexOf('config.onTaskStarted?.()') < readerAi.indexOf('await ai.wait(id)'), 'Explain handoff precedes AI generation completion');
  for (const id of ['selection-translate', 'selection-speak', 'selection-explain', 'selection-copy']) {
    const start = source.indexOf(`$('${id}').addEventListener`);
    const next = source.indexOf("$('", start + 3);
    assert(source.slice(start, next).includes('runSelectionAction('), `${id} uses the shared runner`);
  }
  assert.match(fs.readFileSync('css/style.css', 'utf8'), /\.selection-toolbar button\.selection-action-active/);
  assert.match(fs.readFileSync('css/style.css', 'utf8'), /\.selection-toolbar button:focus-visible \{ outline:/);
  console.log('PASS selection action feedback, handoff timing, and shared-runner coverage');
})().catch(error => { console.error(error); process.exitCode = 1; });
