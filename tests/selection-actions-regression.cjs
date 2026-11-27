const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

(async () => {
  const { loadFactory, deps, stubDom, bridge } = await import('./support/factory-harness.mjs');
  const createReaderSelection = await loadFactory('js/reader/reader-selection.js', 'createReaderSelection');
  const createReaderRequests = await loadFactory('js/reader/reader-requests.js', 'createReaderRequests');
  const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

  const dom = stubDom();
  const buttons = Object.fromEntries(
    ['selection-toolbar', 'selection-translate', 'selection-define', 'selection-speak', 'selection-explain', 'selection-copy']
      .map(id => [id, dom.$(id)])
  );
  const docEvents = {}, winEvents = {};
  dom.document.hidden = false;
  dom.document.execCommand = () => false;
  dom.document.addEventListener = (type, fn) => { (docEvents[type] ||= []).push(fn); };
  const fireDoc = (type, event = {}) => (docEvents[type] || []).forEach(fn => fn({ preventDefault() {}, stopPropagation() {}, ...event }));
  const fireWin = (type, event = {}) => (winEvents[type] || []).forEach(fn => fn({ preventDefault() {}, stopPropagation() {}, ...event }));

  const textNode = { nodeType: 3, nodeValue: 'Hallo', childNodes: [], parentElement: null };
  const storyEl = dom.$('reader-story');
  storyEl.append(textNode);
  storyEl.textContent = 'Hallo';
  storyEl.contains = target => target === textNode || target === storyEl;
  dom.document.createTreeWalker = () => { let done = false; return { nextNode: () => done ? null : (done = true, textNode) }; };
  const range = { startContainer: textNode, startOffset: 0, endContainer: textNode, endOffset: 5, getBoundingClientRect: () => ({ left: 10, top: 100, right: 50, bottom: 120, width: 40, height: 20 }) };
  let selectionCleared = false;

  globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.document = dom.document;
  globalThis.window = {
    innerWidth: 400, innerHeight: 800,
    matchMedia: globalThis.matchMedia,
    addEventListener(type, fn) { (winEvents[type] ||= []).push(fn); },
    removeEventListener() {},
    getSelection: () => ({
      isCollapsed: false, anchorNode: textNode, focusNode: textNode,
      getRangeAt: () => range,
      removeAllRanges() { selectionCleared = true; }
    })
  };

  const pending = { define: deferred(), translate: deferred(), speak: deferred(), copy: deferred(), generation: deferred() };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => pending.copy.promise } }, configurable: true });

  const toasts = [];
  const state = { readerSelection: null };
  bridge.translation.availability = async () => ({ available: true });
  bridge.translation.open = () => pending.translate.promise;
  bridge.speech.available = true;
  bridge.speech.speak = () => pending.speak.promise;

  let defineHandler = selection => {
    assert.equal(selection.text, 'Hallo', 'Define receives the current selection');
    return pending.define.promise;
  };
  let explainHandler = (_kind, _action, _followUp, _selection, onTaskStarted) => {
    assert.equal(buttons['selection-explain'].getAttribute('aria-busy'), 'true', 'Explain stays active while the AI task is being created');
    assert.equal(buttons['selection-toolbar'].hidden, false, 'Explain toolbar stays visible until handoff');
    onTaskStarted();
    return pending.generation.promise;
  };

  buttons['selection-toolbar'].hidden = true;
  createReaderSelection(deps({
    $: dom.$, state, SPEECH_LANGUAGES: { de: 'de-DE' },
    readerStory: () => ({ id: 's', language: 'de' }),
    activeChapter: () => ({ id: 'c' }),
    activeVersion: () => ({ id: 'v', story: 'Hallo' }),
    sentenceContext: () => 'Hallo',
    profileSnapshot: () => ({}),
    defineSelection: selection => defineHandler(selection),
    explainSelection: (...args) => explainHandler(...args),
    toast: message => toasts.push(message)
  }));

  // Trigger initial selection so toolbar opens and translation availability resolves to 'available'.
  {
    let scheduled;
    const prevSet = globalThis.setTimeout, prevClear = globalThis.clearTimeout;
    globalThis.setTimeout = fn => { scheduled = fn; return 1; };
    globalThis.clearTimeout = () => {};
    try { fireDoc('selectionchange'); } finally { globalThis.setTimeout = prevSet; globalThis.clearTimeout = prevClear; }
    scheduled();
    await flush();
  }

  async function clickAndCheck(id, operation, extraCheck) {
    buttons[id].dispatch('click');
    await flush();
    assert.equal(buttons[id].getAttribute('aria-busy'), 'true', `${id} announces busy while its action is active`);
    assert(buttons[id].classList.contains('selection-action-active'), `${id} has the action highlight`);
    if (extraCheck) extraCheck();
    operation.resolve({ status: 'completed' });
    await flush();
    assert.equal(buttons[id].getAttribute('aria-busy'), 'false', `${id} clears busy after completion`);
    assert(!buttons[id].classList.contains('selection-action-active'), `${id} clears the action highlight after completion`);
  }

  let copyCalls = 0, translateCalls = 0, speakCalls = 0;
  globalThis.navigator.clipboard.writeText = () => { copyCalls++; return pending.copy.promise; };
  bridge.translation.open = () => { translateCalls++; return pending.translate.promise; };
  bridge.speech.speak = () => { speakCalls++; return pending.speak.promise; };

  await clickAndCheck('selection-copy', pending.copy, () => {
    buttons['selection-copy'].dispatch('click');
    assert.equal(copyCalls, 1, 'selection-copy ignores re-entrant click while busy');
  });
  assert.equal(state.readerSelection, null);
  assert.equal(buttons['selection-toolbar'].hidden, true);
  assert.equal(selectionCleared, true);
  assert.equal(toasts.length, 0, 'successful copy relies on Android clipboard feedback without an app toast');

  state.readerSelection = { kind: 'body', text: 'Hallo', languageTag: 'de-DE', storyId: 's', chapterId: 'c', versionId: 'v', start: 0, end: 5 };
  buttons['selection-toolbar'].hidden = false;
  await clickAndCheck('selection-translate', pending.translate, () => {
    buttons['selection-translate'].dispatch('click');
    assert.equal(translateCalls, 1, 'selection-translate ignores re-entrant click while busy');
  });
  await clickAndCheck('selection-speak', pending.speak, () => {
    buttons['selection-speak'].dispatch('click');
    assert.equal(speakCalls, 1, 'selection-speak ignores re-entrant click while busy');
  });
  await clickAndCheck('selection-define', pending.define);

  buttons['selection-explain'].dispatch('click');
  await flush();
  assert.equal(buttons['selection-explain'].getAttribute('aria-busy'), 'false', 'Explain clears at AI task handoff');
  assert(!buttons['selection-explain'].classList.contains('selection-action-active'), 'Explain is no longer highlighted during generation');
  assert.equal(buttons['selection-toolbar'].hidden, true, 'Explain toolbar closes at AI task handoff');
  pending.generation.resolve({});

  globalThis.navigator.clipboard.writeText = async text => { assert.equal(text, 'Hallo'); throw Error('clipboard denied'); };
  buttons['selection-toolbar'].hidden = false;
  buttons['selection-copy'].dispatch('click'); await flush();
  assert.equal(buttons['selection-toolbar'].hidden, false, 'failed copy keeps toolbar');
  assert.equal(state.readerSelection.text, 'Hallo', 'failed copy keeps selection');
  assert.equal(toasts.at(-1), 'Could not copy the selection.');

  const failedButton = buttons['selection-define'];
  const failedAction = deferred();
  defineHandler = () => failedAction.promise;
  let rejectedError = null;
  const onUnhandled = error => { rejectedError = error; };
  process.once('unhandledRejection', onUnhandled);
  failedButton.dispatch('click');
  await flush();
  assert.equal(failedButton.getAttribute('aria-busy'), 'true', 'failing action remains highlighted while pending');
  failedAction.reject(new Error('simulated failure'));
  await flush();
  process.removeListener('unhandledRejection', onUnhandled);
  assert.match(rejectedError?.message || '', /simulated failure/);
  assert.equal(failedButton.getAttribute('aria-busy'), 'false', 'failure clears busy state');
  assert(!failedButton.classList.contains('selection-action-active'), 'failure clears the action highlight');

  // Exercise production pointer handlers, including implicit touch capture releasing outside.
  const toolbar = buttons['selection-toolbar'];
  const pressed = buttons['selection-define'];
  pressed.disabled = false;
  pressed.getBoundingClientRect = () => ({ left: 10, right: 54, top: 10, bottom: 54 });
  const down = () => toolbar.dispatch('pointerdown', { button: 0, target: { closest: () => pressed } });
  down(); assert(pressed.classList.contains('selection-action-pressed'));
  fireDoc('pointerup', { clientX: 30, clientY: 30 }); assert(!pressed.classList.contains('selection-action-pressed'));
  let blocked = 0;
  const click = detail => toolbar.dispatch('click', { detail, preventDefault() { blocked++; }, stopPropagation() {} });
  click(1); assert.equal(blocked, 0);
  down(); fireDoc('pointerup', { clientX: 100, clientY: 30 }); click(1); assert.equal(blocked, 1);
  down(); fireDoc('pointercancel'); click(1); assert.equal(blocked, 2);
  assert(!pressed.classList.contains('selection-action-pressed'));
  click(0); assert.equal(blocked, 2, 'keyboard activation is not blocked by a previous cancelled pointer');
  down(); fireWin('blur'); assert(!pressed.classList.contains('selection-action-pressed'));

  // Toasts use the frontmost open dialog and retain the default duration elsewhere.
  const appSource = fs.readFileSync('js/app.js', 'utf8');
  let scheduled, parent;
  const toastNode = {};
  const toastContext = {
    state: {}, $: () => toastNode, clearTimeout() {}, setTimeout(fn, ms) { scheduled = { fn, ms }; },
    document: { querySelectorAll: () => [{ append() { throw Error('behind reader'); } }, { append(node) { parent = node; } }], body: { append() { throw Error('behind dialogs'); } } }
  };
  vm.createContext(toastContext);
  vm.runInContext(appSource.slice(appSource.indexOf('function toast('), appSource.indexOf('function setView(')), toastContext);
  toastContext.toast('Request cancelled'); assert.equal(parent, toastNode); assert.equal(scheduled.ms, 2600); assert.equal(toastNode.hidden, false);
  scheduled.fn(); assert.equal(toastNode.hidden, true);
  toastContext.toast('Request cancelled'); assert.equal(scheduled.ms, 2600);

  // Explain handoff timing through production createReaderRequests: follows aiSession.start() and precedes ai.wait(id).
  {
    const reqStory = { id: 's', language: 'de', difficulty: 'A2', activePathId: 'p', chapters: [{ id: 'c', versions: [{ id: 'v', story: 'Hallo Welt.' }], help: [] }] };
    const reqState = { providerId: 'p', model: 'm', reasoning: '', models: [{ id: 'm' }], readerId: 's', stories: [reqStory], retryBrokenReplies: false };
    let startDeferred, waitDeferred;
    bridge.ai.available = true;
    bridge.ai.providers = async () => ({ providers: [{ id: 'p', connected: true }] });
    bridge.ai.wait = () => waitDeferred.promise;
    bridge.ai.acknowledge = async () => {};
    const requests = createReaderRequests(deps({
      $: dom.$,
      LANGUAGES: { de: 'German' },
      state: reqState,
      runtime: { readerGeneration: null, pipeline: null, backgroundRun: null },
      aiSession: { start: () => startDeferred.promise },
      workspaceStorage: { assertWritable() {} },
      readerStory: () => reqStory,
      normalizeChapters: s => s.chapters,
      activeChapter: () => reqStory.chapters[0],
      activeVersion: () => reqStory.chapters[0].versions[0],
      readerPanel: () => ({ scrollTop: 0 }),
      overlappingHelp: () => [],
      helpContext: () => ({ before: '', after: '' }),
      createHelpLoading: () => dom.document.createElement('div'),
      resolvedHelpContext: () => ({}),
      savedFollowUps: () => [],
      validTextRange: (text, start, end) => Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length
    }));
    let handoffs = 0;
    explainHandler = (kind, action, followUp, sel, onTaskStarted) =>
      requests.explainSelection(kind, action, followUp, sel, () => { handoffs++; onTaskStarted(); });

    // 1. Failed aiSession.start never triggers handoff.
    state.readerSelection = { kind: 'body', text: 'Hallo', languageTag: 'de-DE', storyId: 's', chapterId: 'c', versionId: 'v', start: 0, end: 5, profile: {} };
    buttons['selection-toolbar'].hidden = false;
    startDeferred = deferred(); waitDeferred = deferred();
    buttons['selection-explain'].dispatch('click');
    await flush();
    assert.equal(buttons['selection-explain'].getAttribute('aria-busy'), 'true');
    assert.equal(buttons['selection-toolbar'].hidden, false);
    startDeferred.reject(new Error('start failed'));
    await flush();
    assert.equal(handoffs, 0, 'Explain handoff does not fire if aiSession.start fails');
    assert.equal(buttons['selection-explain'].getAttribute('aria-busy'), 'false');

    // 2. Successful aiSession.start hands off immediately while ai.wait is still pending.
    startDeferred = deferred(); waitDeferred = deferred();
    buttons['selection-toolbar'].hidden = false;
    state.readerSelection = { kind: 'body', text: 'Hallo', languageTag: 'de-DE', storyId: 's', chapterId: 'c', versionId: 'v', start: 0, end: 5, profile: {} };
    buttons['selection-explain'].dispatch('click');
    await flush();
    assert.equal(buttons['selection-explain'].getAttribute('aria-busy'), 'true', 'Explain stays busy until aiSession.start resolves');
    assert.equal(buttons['selection-toolbar'].hidden, false, 'Explain toolbar stays visible until aiSession.start resolves');
    startDeferred.resolve('req-1');
    await flush();
    assert.equal(buttons['selection-toolbar'].hidden, true, 'Explain handoff follows aiSession.start before ai.wait completes');
    assert.equal(buttons['selection-explain'].getAttribute('aria-busy'), 'false');
    assert(!buttons['selection-explain'].classList.contains('selection-action-active'));
    waitDeferred.resolve(JSON.stringify({ explanation: 'Hello' }));
    await flush();
    assert.equal(reqStory.chapters[0].help.length, 1);
  }

  assert.match(fs.readFileSync('css/style.css', 'utf8'), /\.selection-toolbar button\.selection-action-active/);
  assert.match(fs.readFileSync('css/style.css', 'utf8'), /\.selection-toolbar button:focus-visible \{ outline:/);
  console.log('PASS selection action feedback, handoff timing, and shared-runner coverage');
})().catch(error => { console.error(error); process.exitCode = 1; });
