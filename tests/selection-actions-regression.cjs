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
  window: { getSelection: () => ({removeAllRanges() { context.selectionCleared = true; }}) },
  clearTimeout() {}, selectionTimer: null,
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
  toast: (message, duration) => { toasts.push(message); context.toastDuration = duration; }
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
  assert.equal(context.state.readerSelection, null);
  assert.equal(buttons['selection-toolbar'].hidden, true);
  assert.equal(context.selectionCleared, true);
  assert.equal(toasts.at(-1), 'Copied');
  assert.equal(context.toastDuration, 1000);
  context.state.readerSelection = {kind:'body',text:'Hallo',languageTag:'de-DE'};
  buttons['selection-toolbar'].hidden = false;
  await clickAndCheck('selection-translate', pending.translate);
  await clickAndCheck('selection-speak', pending.speak);

  buttons['selection-explain'].listeners.click();
  await flush();
  assert.equal(buttons['selection-explain'].attributes['aria-busy'], 'false', 'Explain clears at AI task handoff');
  assert(!buttons['selection-explain'].classes.has('selection-action-active'), 'Explain is no longer highlighted during generation');
  assert.equal(buttons['selection-toolbar'].hidden, true, 'Explain toolbar closes at AI task handoff');
  pending.generation.resolve({});

  context.navigator.clipboard.writeText = async text => { assert.equal(text, 'Hallo'); throw Error('clipboard denied'); };
  buttons['selection-toolbar'].hidden = false;
  buttons['selection-copy'].listeners.click(); await flush();
  assert.equal(buttons['selection-toolbar'].hidden, false, 'failed copy keeps toolbar');
  assert.equal(context.state.readerSelection.text, 'Hallo', 'failed copy keeps selection');
  assert.equal(toasts.at(-1), 'Could not copy the selection.');

  const failedButton = button();
  const failedAction = deferred();
  const failedRun = context.runSelectionAction(failedButton, () => failedAction.promise);
  await flush();
  assert.equal(failedButton.attributes['aria-busy'], 'true', 'failing action remains highlighted while pending');
  failedAction.reject(new Error('simulated failure'));
  await assert.rejects(failedRun, /simulated failure/);
  assert.equal(failedButton.attributes['aria-busy'], 'false', 'failure clears busy state');
  assert(!failedButton.classes.has('selection-action-active'), 'failure clears the action highlight');

  // Exercise production pointer handlers, including implicit touch capture releasing outside.
  const events = {}, docEvents = {}, winEvents = {};
  const toolbar = {addEventListener(type, fn) { events[type] = fn; }};
  const pressed = button(); pressed.getBoundingClientRect = () => ({left:10,right:54,top:10,bottom:54});
  const pressContext = { $: () => toolbar, clearTimeout() {}, selectionTimer:null,
    document:{addEventListener(type, fn) {docEvents[type]=fn;}}, window:{addEventListener(type,fn){winEvents[type]=fn;}} };
  vm.createContext(pressContext);
  vm.runInContext(app.slice(app.indexOf('let selectionPressedButton = null;'),app.indexOf('// Flex sizing')),pressContext);
  const down = () => events.pointerdown({button:0,preventDefault(){},target:{closest:()=>pressed}});
  down(); assert(pressed.classes.has('selection-action-pressed'));
  docEvents.pointerup({clientX:30,clientY:30}); assert(!pressed.classes.has('selection-action-pressed'));
  let blocked=0;
  const click = detail => events.click({detail,preventDefault(){blocked++;},stopPropagation(){}});
  click(1);assert.equal(blocked,0);
  down();docEvents.pointerup({clientX:100,clientY:30});click(1);assert.equal(blocked,1);
  down();docEvents.pointercancel();click(1);assert.equal(blocked,2);
  assert(!pressed.classes.has('selection-action-pressed'));
  click(0);assert.equal(blocked,2,'keyboard activation is not blocked by a previous cancelled pointer');
  down();winEvents.blur();assert(!pressed.classes.has('selection-action-pressed'));

  // Toasts use the frontmost open dialog and retain the default duration elsewhere.
  let scheduled, parent;
  const toastNode = {};
  const toastContext = {state:{}, $:()=>toastNode, clearTimeout(){},setTimeout(fn,ms){scheduled={fn,ms};},
    document:{querySelectorAll:()=>[{append(){throw Error('behind reader');}},{append(node){parent=node;}}],body:{append(){throw Error('behind dialogs');}}}};
  vm.createContext(toastContext);
  vm.runInContext(app.slice(app.indexOf('function toast('),app.indexOf('function setView(')),toastContext);
  toastContext.toast('Copied',1000);assert.equal(parent,toastNode);assert.equal(scheduled.ms,1000);assert.equal(toastNode.hidden,false);
  scheduled.fn();assert.equal(toastNode.hidden,true);
  toastContext.toast('Request cancelled');assert.equal(scheduled.ms,2600);

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
