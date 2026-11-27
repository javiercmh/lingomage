// Reader view: word-note popover, inline Listen, Russian stress, chapter status binding, and open/reopen position restore.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bridge, loadFactory, deps, stubDom } from './support/factory-harness.mjs';
import { validStories } from '../js/core/workspace-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssSource = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');

const SPEECH_LANGUAGES = { de: 'de-DE', ja: 'ja-JP', ru: 'ru-RU', 'es-CL': 'es-CL' };
const LANGUAGES = { ja: 'Japanese', de: 'German', ru: 'Russian', 'es-CL': 'Spanish' };
globalThis.getComputedStyle ??= () => ({ fontSize: '16px', getPropertyValue: () => '' });

// 1. Word-note popover: lookup recording, inline Listen playback/stop, focus restore, View saved explanation, Russian stress.
{
  const dom = stubDom();
  globalThis.document = dom.document;
  globalThis.window = { ...globalThis.window, innerWidth: 390, innerHeight: 800 };
  globalThis.requestAnimationFrame = fn => fn();

  let heard, finishSpeech, finishStop, stopped = 0;
  const revealed = [], lookups = [];
  let currentStory = { language: 'ja' };
  const state = {};

  bridge.speech.available = true;
  bridge.speech.speak = options => {
    heard = options;
    return new Promise(resolve => { finishSpeech = resolve; });
  };
  bridge.speech.stop = () => new Promise(resolve => {
    finishStop = () => { stopped++; finishSpeech?.({ status: 'cancelled' }); resolve(); };
  });

  const view = createReaderView(deps({
    $: dom.$,
    state,
    LANGUAGES,
    SPEECH_LANGUAGES,
    recordNoteLookup: (notes, info, action) => lookups.push([notes.map(note => note.word).join(), action]),
    showExplanationForHelp: id => revealed.push(id)
  }));
  // Point readerStory to currentStory by setting state.stories & state.readerId.
  const setStory = story => {
    currentStory = { id: 'S', ...story };
    state.stories = [currentStory];
    state.readerId = currentStory.id;
  };
  setStory({ language: 'ja' });

  const popover = dom.$('word-note-popover');
  Object.defineProperty(popover, 'textContent', {
    get() { return this.children.map(node => node.textContent).join(''); },
    set(value) { this.children = value ? [{ nodeType: 3, textContent: String(value) }] : []; }
  });
  popover.hidden = true;
  popover.style = {};
  popover.getBoundingClientRect = () => ({ bottom: 150 });
  const trigger = dom.document.createElement('span');
  trigger.getBoundingClientRect = () => ({ left: 20, top: 80, bottom: 100 });

  view.showWordNote(trigger, [{ word: '買う', meaning: 'to buy', forms: ['買います'] }]);
  assert.deepEqual(lookups, [['買う', 'note']], 'opening a word note records one lookup (PED-005)');
  const listen = popover.childNodes[0].childNodes[0].childNodes[1];
  assert.match(cssSource, /\.inline-listen\s*\{[^}]*color:\s*#bfdbfe;/, 'idle note speaker uses the same bright color as chapter Listen');
  assert.match(cssSource, /\.inline-listen\[data-playing="true"\]\s*\{\s*color:\s*var\(--muted\);/, 'playing note speaker switches to the same muted color as chapter Listen');
  assert.equal(listen.attributes['aria-label'], 'Listen to 買う');
  assert.equal(dom.document.activeElement, popover);

  const starting = listen.dispatch('click');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(heard.text, '買う'); assert.equal(heard.language, 'ja-JP');
  assert.equal(listen.disabled, false); assert.equal(listen.attributes['aria-pressed'], 'true');
  const stopping = listen.dispatch('click');
  assert.equal(listen.disabled, false); assert.equal(listen.attributes['aria-pressed'], 'true');
  finishStop(); await stopping; await starting;
  assert.equal(stopped, 1); assert.equal(listen.attributes['aria-pressed'], 'false');

  view.closeWordNote(true);
  assert.equal(dom.document.activeElement, trigger); assert.equal(popover.hidden, true);

  view.closeWordNote();
  view.showWordNote(trigger, [{ word: '買う', meaning: 'to buy' }], '買います');
  const surfaceItem = popover.childNodes[0];
  assert.equal(surfaceItem.childNodes[0].childNodes[0].textContent, '買います');
  assert.equal(surfaceItem.childNodes[1].textContent, 'Dictionary form: 買う');
  const surfaceListen = surfaceItem.childNodes[0].childNodes[1];
  const surfaceStarting = surfaceListen.dispatch('click');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(heard.text, '買います');
  const stoppingSurface = surfaceListen.dispatch('click');
  assert.equal(surfaceListen.disabled, false);
  finishStop(); await stoppingSurface; await surfaceStarting;
  assert.equal(stopped, 2);

  view.closeWordNote();
  bridge.speech.available = false;
  view.showWordNote(trigger, [{ word: '買う', meaning: 'to buy' }]);
  assert.equal(popover.childNodes[0].childNodes[0].childNodes[1].disabled, true);

  view.closeWordNote();
  bridge.speech.available = true;
  view.showWordNote(trigger, [{ word: '買う', meaning: 'to buy' }], '買います');
  assert.equal(popover.childNodes.some(node => node.className === 'word-note-view'), false, 'a vocabulary-only note has no explanation action');

  view.closeWordNote();
  view.showWordNote(trigger, [{ word: '買う', meaning: 'to buy' }], '買います', 'h7');
  const viewBtn = popover.childNodes[popover.childNodes.length - 1];
  assert.equal(viewBtn.className, 'word-note-view');
  assert.equal(viewBtn.textContent, 'View saved explanation ↓');
  assert.equal(viewBtn.type, 'button');
  await viewBtn.dispatch('click');
  assert.deepEqual(revealed, ['h7'], 'View reuses the saved-card reveal once');
  assert.equal(popover.hidden, true, 'View closes the note');

  setStory({ language: 'ru' });
  const russianNote = { word: 'молоко', meaning: 'milk', stress: [5] };
  view.closeWordNote();
  view.showWordNote(trigger, [russianNote], 'Молоко');
  assert.equal(popover.childNodes[0].childNodes[0].childNodes[0].textContent, 'Молоко\u0301');
  assert.equal(popover.childNodes[0].childNodes[0].childNodes[1].attributes['aria-label'], 'Listen to Молоко');

  view.closeWordNote();
  view.showWordNote(trigger, [russianNote], 'молока');
  assert.equal(popover.childNodes[0].childNodes[0].childNodes[0].textContent, 'молока', 'an inflection without saved form stress stays unmarked');
  assert.equal(popover.childNodes[0].childNodes[1].textContent, 'Dictionary form: молоко', 'the dictionary form line never carries stress');

  view.closeWordNote();
  view.showWordNote(trigger, [{ word: 'вход', meaning: 'entrance', formStress: { 'входа': [2] } }], 'входа');
  assert.equal(popover.childNodes[0].childNodes[0].childNodes[0].textContent, 'вхо\u0301да', 'stress marks the form from the text');
  assert.equal(popover.childNodes[0].childNodes[1].textContent, 'Dictionary form: вход');
  assert.equal(popover.childNodes[0].childNodes[0].childNodes[1].attributes['aria-label'], 'Listen to входа');

  console.log('PASS note offers View saved explanation only for activated text with one, closing the note before revealing the card');
  console.log('PASS glossary Listen speaks the text form (dictionary form follows) with source locale, restores focus and disables browser playback');
}

// 2. Chapter request status stays bound to its originating story and clears after completion.
{
  const dom = stubDom();
  globalThis.document = dom.document;
  const state = { readerId: 'A', activeChapterRequest: { storyId: 'A', loading: { textContent: 'Writing…' } } };
  const view = createReaderView(deps({ $: dom.$, state, LANGUAGES, SPEECH_LANGUAGES }));
  view.renderChapterRequest(); assert.equal(dom.$('reader-chapter-status').hidden, false);
  state.readerId = 'B'; view.renderChapterRequest(); assert.equal(dom.$('reader-chapter-status').hidden, true);
  state.readerId = 'A'; view.renderChapterRequest(); assert.equal(dom.$('reader-chapter-status').hidden, false);
  state.activeChapterRequest = null; view.renderChapterRequest(); assert.equal(dom.$('reader-chapter-status').hidden, true);
  console.log('PASS chapter status stays bound to its originating story and clears after completion');
}

// 3. Scroll panel & chapter restore on reopen, failed chapter draft restore, and legacy empty chapters array.
{
  const dom = stubDom();
  globalThis.document = dom.document;
  globalThis.history = { pushState() {}, replaceState() {} };
  const chapter = id => ({ id, activeVersionId: id + 'v', versions: [{ id: id + 'v', title: id, story: 'Text ' + id }], help: [] });
  const story3 = { id: 'S', language: 'de', chapters: [chapter('one'), chapter('two'), chapter('three')], activePathId: 'original' };
  const panel = { scrollTop: 321, addEventListener() {}, classList: { toggle() {} }, getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 360, width: 360, height: 800 }) };
  const state = { stories: [story3], readerId: 'S', readerChapter: 2, readerPositions: {} };
  let restoredMode;
  const view = createReaderView(deps({
    $: dom.$,
    state,
    LANGUAGES,
    SPEECH_LANGUAGES,
    selectionMenuRouter: { reset() {} },
    usage: { setReader() {}, checkpoint() {} },
    settingsFeedback: { sync() {} },
    showEditPanel: mode => { restoredMode = mode; },
    closeStoryMenu() {},
    clearExplanationSelection() {}
  }));
  dom.$('reader-dialog').querySelector = () => panel;
  dom.$('reader-dialog').showModal = () => {};
  dom.$('reader-dialog').open = true;

  view.rememberReaderPosition();
  panel.scrollTop = 0;
  view.openReader(story3);
  assert.equal(state.readerChapter, 2);
  assert.equal(panel.scrollTop, 321);
  console.log('PASS actual scroll panel and chapter restored on reopen');

  state.readerEditDraft = { storyId: 'S', chapterId: story3.chapters[0].id, mode: 'rewrite', prompt: 'Keep a clue', error: 'Provider failed' };
  view.openReader(story3);
  assert.equal(state.readerChapter, 0);
  assert.equal(restoredMode, 'rewrite');
  assert.equal(dom.$('reader-prompt').value, 'Keep a clue');
  assert.equal(dom.$('reader-edit-error').textContent, 'Provider failed');
  console.log('PASS reopening a failed chapter request restores its original chapter and prompt');

  const emptyChapters = { id: 'E', language: 'de', title: 'T', story: 'Text.', chapters: [] };
  state.stories.push(emptyChapters);
  state.readerPositions = {};
  view.openReader(emptyChapters);
  assert.equal(emptyChapters.chapters.length, 1);
  assert.equal(emptyChapters.paths[0].entries[0].chapterId, emptyChapters.chapters[0].id);
  assert.ok(validStories([emptyChapters]));
  console.log('PASS legacy story with an empty chapters array opens with saved chapters matching its paths');
}
