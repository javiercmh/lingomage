import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTreeDom } from './support/tree-dom.mjs';

const dom = createTreeDom();
Object.assign(globalThis, dom.globals);
const { document, window, dispatch } = dom;
const { annotatedText, applyExplainedMarks } = await import('../js/reader-text.js');
const { createReaderActivation, createSourceChooser, glossaryForTrigger, indexGlossaryTriggers, normalizeReaderControls } = await import('../js/reader-activation.js');
const { createSelectionMenuRouter } = await import('../js/selection-menu.js');

const make = (tag, attrs = {}, parent = document.body) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) { if (key === 'text') element.textContent = value; else element.setAttribute(key, value); }
  parent.append(element); return element;
};
const canonicalOf = root => { let text = ''; const visit = node => { for (const child of node.childNodes) { if (child.nodeType === 3) text += child.nodeValue; else if (child.tagName !== 'rt') visit(child); } }; visit(root); return text; };

// --- Native selection menu routing ---------------------------------------------------------------
{
  const title = make('h2', { id: 'reader-title', text: 'Titel' }), story = make('div', { id: 'reader-story' });
  const storyText = document.createTextNode('Brot'); story.append(storyText);
  const textarea = make('textarea'), help = make('div', { class: 'help-text-selectable', text: 'explanation' });
  const note = make('div', { class: 'word-note-popover', text: 'note' }), error = make('p', { class: 'form-error', text: 'oops' });
  const chrome = make('button', { text: 'Create' });
  const helpText = help.childNodes[0], noteText = note.childNodes[0];

  // Host acknowledgement: only a true result is cached; failures are retried by the next routing event.
  const calls = []; let acknowledge = false;
  const host = { setSuppressed(value) { calls.push(value); return acknowledge; } };
  const router = createSelectionMenuRouter({ host, document, window });
  assert.deepEqual(calls, [true]); assert.equal(router.confirmed, null, 'an unacknowledged call is not cached');
  dispatch(story, 'pointerdown'); assert.deepEqual(calls, [true, true], 'story entry retries after a failed acknowledgement');
  acknowledge = true;
  dispatch(story, 'pointerdown'); assert.equal(router.confirmed, true);
  dispatch(story, 'pointerdown'); dispatch(title, 'pointerdown'); assert.equal(calls.length, 3, 'acknowledged suppression is not repeated');
  acknowledge = false;
  dispatch(textarea, 'pointerdown'); assert.equal(router.confirmed, true, 'a failed unsuppress keeps the last acknowledged value');
  assert.equal(calls.at(-1), false, 'but the field still asks for the native menu');
  acknowledge = true;
  dispatch(textarea, 'pointerdown'); assert.equal(router.confirmed, false);
  for (const target of [help, helpText, note, noteText, error]) { dispatch(story, 'pointerdown'); dispatch(target, 'pointerdown'); assert.equal(router.confirmed, false, 'native menu kept'); }
  for (const target of [story, storyText, title, chrome]) { dispatch(textarea, 'pointerdown'); dispatch(target, 'pointerdown'); assert.equal(router.confirmed, true, 'suppressed'); }
  const press = dispatch(story, 'pointerdown'); assert.equal(press.defaultPrevented, false, 'selection gestures are never prevented');
  console.log('PASS selection menu is cached only after host acknowledgement and routed by touch target');

  // Selection routing covers keyboard and handle-driven selections that have no pointerdown on the target.
  dispatch(textarea, 'pointerdown'); window.selection = { isCollapsed: false, anchorNode: storyText, focusNode: storyText };
  dispatch(document, 'selectionchange'); assert.equal(router.confirmed, true, 'a story selection suppresses the native menu');
  window.selection = { isCollapsed: false, anchorNode: helpText, focusNode: helpText }; dispatch(document, 'selectionchange'); assert.equal(router.confirmed, false, 'explanation text selection keeps it');
  window.selection = { isCollapsed: false, anchorNode: storyText, focusNode: helpText }; dispatch(document, 'selectionchange'); assert.equal(router.confirmed, true, 'a selection touching the story uses the LingoMage toolbar');
  window.selection = { isCollapsed: false, anchorNode: title.childNodes[0], focusNode: title.childNodes[0] }; dispatch(textarea, 'pointerdown'); dispatch(document, 'selectionchange'); assert.equal(router.confirmed, true, 'title selection suppresses');
  window.selection = { isCollapsed: false, anchorNode: document.body, focusNode: document.body }; textarea.focus(); dispatch(document, 'selectionchange'); assert.equal(router.confirmed, false, 'a focused field selection keeps it');
  dispatch(story, 'pointerdown'); window.selection = { isCollapsed: true, anchorNode: null, focusNode: null }; dispatch(document, 'selectionchange'); assert.equal(router.confirmed, true, 'a collapsed selection changes nothing');
  dispatch(textarea, 'focusin'); assert.equal(router.confirmed, false, 'keyboard focus into a field unsuppresses');
  dispatch(textarea, 'focusout', { relatedTarget: null }); assert.equal(router.confirmed, true);
  const callsBeforeEntry = calls.length;
  assert.equal(router.reset(), true); assert.equal(router.confirmed, true);
  assert.equal(calls.length, callsBeforeEntry + 1, 'reader entry reasserts even a previously acknowledged flag');
  console.log('PASS selection and field-focus changes route the menu without a pointer event');

  // Long-press context menus are cancelled only on story and title text.
  for (const target of [story, storyText, title]) assert.equal(dispatch(target, 'contextmenu').defaultPrevented, true, 'reader text context menu cancelled');
  for (const target of [textarea, help, helpText, note, noteText, error, chrome]) assert.equal(dispatch(target, 'contextmenu').defaultPrevented, false, 'native menu untouched');
  console.log('PASS contextmenu prevention is scoped to story and title text');
  for (const node of [title, story, textarea, help, note, error, chrome]) node.remove();
}

// --- Overlapping vocabulary note and saved explanation --------------------------------------------
function reader({ text, glossary, ranges, segments = null, language = 'de' }) {
  const dialog = make('div'), story = make('div', { id: 'reader-story' }, dialog), element = make('div', { id: 'source-chooser', class: 'source-chooser' }, dialog);
  element.hidden = true;
  const events = [], selection = { collapsed: true }, mode = { explanation: false };
  const chooser = createSourceChooser({ element, document, window });
  const cards = new Set(ranges.map(range => range.id));
  const activate = createReaderActivation({
    root: story, chooser, glossaryFor: glossaryForTrigger,
    hasExplanation: id => !mode.explanation && cards.has(id),
    selectionCollapsed: () => selection.collapsed,
    closeNote: () => events.push('close-note'),
    showNote: vocab => events.push(['note', vocab]),
    showExplanation: id => events.push(['explanation', id])
  });
  annotatedText(story, text, segments, { glossary, language, onNote: event => activate(event) });
  indexGlossaryTriggers(story, text, glossary);
  applyExplainedMarks(story, ranges);
  normalizeReaderControls(story);
  story.addEventListener('click', activate);
  story.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
  window.selection = { isCollapsed: true, anchorNode: null, focusNode: null };
  return { dialog, story, element, chooser, events, selection, mode, activate, cleanup: () => dialog.remove() };
}
const click = (target, ctx) => { window.selection.isCollapsed = ctx ? ctx.selection.collapsed : true; return dispatch(target, 'click'); };
const labels = element => element.childNodes.map(button => button.textContent);

{
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }], ranges: [{ id: 'h1', start: 4, end: 13, label: 'esse Brot' }] });
  const { story, element, chooser, events } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), marks = story.querySelectorAll('mark.explained-expression');
  assert.equal(marks.length, 2, 'the explanation is split around the glossary trigger');
  const nested = trigger.querySelector('mark.explained-expression');
  assert.ok(nested && nested.parentElement === trigger, 'DOM nests the mark inside the glossary trigger');
  assert.equal(nested.getAttribute('role'), null, 'a glossary trigger does not contain another button role');
  assert.equal(nested.getAttribute('tabindex'), null, 'nested marks do not add a second tab stop');
  assert.equal(canonicalOf(story), 'Ich esse Brot heute', 'canonical text is unchanged by nesting');

  click(nested);
  assert.equal(element.hidden, false, 'one activation opens the chooser once (no duplicate toggling)');
  assert.deepEqual(labels(element), ['Vocabulary note', 'Saved explanation']);
  assert.deepEqual(events, ['close-note'], 'nothing navigates before a choice');
  assert.equal(document.activeElement, element.childNodes[0], 'focus moves to the first action');
  element.childNodes[1].focus(); dispatch(element.childNodes[1], 'click');
  assert.deepEqual(events.slice(1), [['explanation', 'h1']], 'Saved explanation opens only the explanation');
  assert.equal(element.hidden, true, 'choosing closes the chooser');

  click(nested); dispatch(element.childNodes[0], 'click');
  assert.equal(events.at(-1)[0], 'note'); assert.equal(events.at(-1)[1].trigger, trigger); assert.equal(events.at(-1)[1].surface, 'Brot'); assert.equal(events.at(-1)[1].notes[0].meaning, 'bread');
  assert.equal(events.filter(item => item[0] === 'explanation').length, 1, 'Vocabulary note opens only the note');

  // Toggle: activating the same control again dismisses it.
  const before = events.length;
  click(nested); assert.equal(element.hidden, false); click(nested); assert.equal(element.hidden, true, 'second activation of the same control closes it');
  assert.equal(events.filter(item => item[0] === 'note' || item[0] === 'explanation').length, 2, 'toggling does not navigate');
  assert.ok(events.length > before);

  // The glossary control's own (unmarked) area, and a mark outside the trigger, are single destinations.
  events.length = 0;
  click(trigger); assert.equal(element.hidden, true); assert.deepEqual(events.filter(Array.isArray).map(item => item[0]), ['note'], 'unmarked trigger area opens the note directly');
  chooser.close();
  events.length = 0;
  click(marks[0]); assert.deepEqual(events.filter(item => Array.isArray(item)), [['explanation', 'h1']], 'explanation-only text opens directly'); assert.equal(element.hidden, true);
  ctx.cleanup();
  console.log('PASS nested trigger/mark DOM opens a two-action chooser once; each action opens only its destination');
}

{
  // Keyboard: the outer glossary control and the inner/outer mark both reach the chooser; Escape restores focus.
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }], ranges: [{ id: 'h1', start: 4, end: 13, label: 'esse Brot' }] });
  const { story, element, events } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), firstMark = story.querySelector('mark.explained-expression');
  assert.equal(trigger.tabIndex, 0); assert.equal(firstMark.tabIndex, 0); assert.equal(firstMark.getAttribute('role'), 'button');
  trigger.focus();
  const key = dispatch(trigger, 'keydown', { key: 'Enter' });
  assert.equal(key.defaultPrevented, true); assert.equal(element.hidden, false, 'Enter on the glossary control opens the chooser once');
  assert.equal(document.activeElement, element.childNodes[0]);
  dispatch(element.childNodes[0], 'keydown', { key: 'ArrowDown' }); assert.equal(document.activeElement, element.childNodes[1], 'arrows move between the two actions');
  dispatch(element.childNodes[1], 'keydown', { key: 'ArrowDown' }); assert.equal(document.activeElement, element.childNodes[0]);
  const escape = dispatch(element.childNodes[0], 'keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true); assert.equal(element.hidden, true); assert.equal(document.activeElement, trigger, 'Escape restores focus to a focusable control');
  assert.deepEqual(events.filter(item => Array.isArray(item)), [], 'dismissal navigates nowhere');
  // Space on the focusable mark that lies outside the glossary trigger opens its explanation directly.
  firstMark.focus(); const space = dispatch(firstMark, 'keydown', { key: ' ' });
  assert.equal(space.defaultPrevented, true); assert.deepEqual(events.filter(item => Array.isArray(item)), [['explanation', 'h1']]); assert.equal(element.hidden, true);
  // Space on the nested trigger opens the chooser as well, and choosing the note activates it once.
  events.length = 0; dispatch(trigger, 'keydown', { key: ' ' }); dispatch(element.childNodes[0], 'click');
  assert.equal(events.filter(item => item[0] === 'note').length, 1);
  dispatch(trigger, 'keydown', { key: 'a' }); assert.equal(element.hidden, true, 'other keys do nothing');
  ctx.cleanup();
  console.log('PASS keyboard Enter/Space opens the chooser once; arrows, Escape and focus return work');
}

{
  // Reverse nesting: the mark wraps the glossary trigger.
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }], ranges: [{ id: 'h9', start: 0, end: 0, label: '' }] });
  const { story, element, events } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), mark = document.createElement('mark');
  mark.className = 'explained-expression'; mark.dataset.helpId = 'h9'; mark.setAttribute('tabindex', '0'); mark.setAttribute('role', 'button');
  trigger.replaceWith(mark); mark.append(trigger);
  click(trigger); assert.deepEqual(labels(element), ['Vocabulary note', 'Saved explanation'], 'a mark wrapping the trigger is resolved too');
  ctx.chooser.close();
  mark.focus(); dispatch(mark, 'keydown', { key: 'Enter' }); assert.equal(element.hidden, false, 'Enter on the wrapping mark finds the inner trigger');
  dispatch(element.childNodes[1], 'click'); assert.deepEqual(events.filter(Array.isArray), [['explanation', 'h9']]);
  ctx.cleanup();
  console.log('PASS glossary/mark nesting resolves in either order');
}

{
  // Noncollapsed selection and explanation-selection mode.
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }], ranges: [{ id: 'h1', start: 4, end: 13, label: 'esse Brot' }] });
  const { story, element, events, selection, mode } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), nested = trigger.querySelector('mark.explained-expression'), outer = story.querySelector('mark.explained-expression');
  selection.collapsed = false;
  for (const target of [nested, outer, trigger]) click(target, ctx);
  assert.equal(element.hidden, true); assert.deepEqual(events, [], 'a click that ends a selection opens and navigates nothing');
  selection.collapsed = true; mode.explanation = true;
  click(nested, ctx); assert.deepEqual(events.filter(Array.isArray).map(item => item[0]), ['note'], 'explanation selection mode leaves the glossary note');
  assert.equal(element.hidden, true);
  const single = reader({ text: 'Brot', glossary: [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }], ranges: [{ id: 'h9', start: 0, end: 0, label: '' }] });
  single.selection.collapsed = false; click(single.story.querySelector('.gloss-note-trigger'), single);
  assert.deepEqual(single.events, [], 'a noncollapsed selection also blocks a single note');
  single.selection.collapsed = true; click(single.story.querySelector('.gloss-note-trigger'), single);
  assert.equal(single.events.filter(item => Array.isArray(item)).length, 1, 'a single destination opens directly with one activation');
  assert.equal(single.element.hidden, true);
  single.cleanup(); ctx.cleanup();
  console.log('PASS noncollapsed selection blocks activation; single destinations remain direct');
}

{
  // Japanese: readings stay separate; a secondary ruby fragment still reaches the shared note through the chooser.
  const segments = [{ text: '日', reading: 'にち' }, { text: '本語', reading: 'ほんご' }, { text: 'を読む' }];
  const ctx = reader({ text: '日本語を読む', language: 'ja-JP', segments, glossary: [{ word: '日本語', meaning: 'Japanese language', forms: ['日本語'] }], ranges: [{ id: 'j1', start: 1, end: 4, label: '本語を' }] });
  const { story, element, events } = ctx;
  assert.equal(canonicalOf(story), '日本語を読む', 'canonical Japanese is separate from readings');
  assert.deepEqual(story.querySelectorAll('rt').map(item => item.textContent), ['にち', 'ほんご']);
  const triggers = story.querySelectorAll('.gloss-note-trigger'), primary = triggers[0];
  const secondaryMark = triggers[1].querySelector('mark.explained-expression') || triggers[1];
  primary.focus(); dispatch(primary, 'keydown', { key: 'Enter' });
  assert.equal(element.hidden, false, 'primary keyboard control finds an explanation on a later ruby fragment');
  dispatch(element.childNodes[0], 'keydown', { key: 'Escape' });
  ctx.selection.collapsed = false; dispatch(primary, 'keydown', { key: 'Enter' });
  assert.equal(element.hidden, true, 'keyboard activation preserves a noncollapsed selection');
  ctx.selection.collapsed = true;
  click(secondaryMark);
  assert.equal(element.hidden, false); dispatch(element.childNodes[0], 'click');
  assert.equal(events.at(-1)[1].trigger, primary, 'every fragment shares the primary control'); assert.equal(events.at(-1)[1].surface, '日本語');
  click(primary); assert.equal(element.hidden, true, 'the unmarked first fragment opens the note directly'); assert.equal(events.at(-1)[0], 'note');
  ctx.cleanup();
  console.log('PASS Japanese fragments share the note, keep readings separate and offer the chooser over marks');
}

{
  // An inner form inside a longer phrase keeps its own note; the phrase's remaining fragments keep the phrase note.
  const ctx = reader({ text: 'Он в руках держит', language: 'ru', glossary: [{ word: 'в руках', meaning: 'in hands', forms: ['в руках'] }, { word: 'рука', meaning: 'hand', forms: ['руках'] }], ranges: [] });
  const triggers = ctx.story.querySelectorAll('.gloss-note-trigger');
  assert.deepEqual(triggers.map(item => item.textContent), ['в ', 'руках']);
  assert.equal(glossaryForTrigger(triggers[0]).notes[0].meaning, 'in hands'); assert.equal(glossaryForTrigger(triggers[0]).surface, 'в руках');
  assert.equal(glossaryForTrigger(triggers[1]).notes[0].meaning, 'hand'); assert.equal(glossaryForTrigger(triggers[1]).trigger, triggers[1]);
  ctx.cleanup();
  console.log('PASS nested glossary phrases resolve to the innermost note per fragment');
}

{
  // Dismissal and cleanup.
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }], ranges: [{ id: 'h1', start: 4, end: 13, label: 'esse Brot' }] });
  const { story, element, chooser } = ctx;
  const nested = story.querySelector('.gloss-note-trigger').querySelector('mark.explained-expression'), outside = make('p', { text: 'elsewhere' });
  const open = () => { click(nested); assert.equal(element.hidden, false); assert.equal(chooser.isOpen(), true); };
  open(); dispatch(element.childNodes[0], 'pointerdown'); assert.equal(chooser.isOpen(), true, 'pressing the chooser does not dismiss it');
  dispatch(nested, 'pointerdown'); assert.equal(chooser.isOpen(), true, 'pressing the marked text lets the click toggle it');
  dispatch(outside, 'pointerdown'); assert.equal(chooser.isOpen(), false, 'outside press dismisses'); assert.equal(element.childNodes.length, 0);
  open(); dispatch(element, 'scroll'); assert.equal(chooser.isOpen(), true, 'scrolling the chooser itself keeps it');
  dispatch(document.body, 'scroll'); assert.equal(chooser.isOpen(), false, 'reader scroll dismisses');
  open(); window.fire('resize'); assert.equal(chooser.isOpen(), false, 'resize dismisses');
  open(); chooser.close(); assert.equal(element.hidden, true, 'chapter change/reader close cleanup'); assert.equal(chooser.key, null);
  chooser.close(true);
  open(); chooser.show({ anchor: nested, key: 'other', options: [{ label: 'A', run() {} }, { label: 'B', run() {} }] }); assert.deepEqual(labels(element), ['A', 'B'], 'a new anchor replaces the open chooser');
  chooser.close(); outside.remove(); ctx.cleanup();
  const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.source-chooser-option \{[^}]*min-height: 44px/, 'actions keep 44px targets');
  assert.match(css, /\.source-chooser-option:hover, \.source-chooser-option:focus-visible/, 'visible keyboard focus');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<div id="source-chooser" class="source-chooser" role="dialog" aria-label="Open from this text" hidden><\/div>/, 'nonmodal labelled dialog inside the reader dialog');
  assert.ok(html.indexOf('id="source-chooser"') > html.indexOf('id="reader-dialog"') && html.indexOf('id="source-chooser"') < html.indexOf('</dialog>', html.indexOf('id="reader-dialog"')), 'the chooser lives inside the reader dialog');
  console.log('PASS chooser dismisses on outside press, scroll, resize and close; controls are 44px, labelled and nonmodal');
}

{
  // App wiring contracts that need the real reader: cleanup paths and Back.
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /function closeWordNote\(restoreFocus = false\) \{\n  sourceChooser\.close\(\);/, 'closing a note (chapter change, reader close, panels, resize) also closes the chooser');
  assert.match(app, /if \(sourceChooser\.isOpen\(\)\) \{\n    sourceChooser\.close\(true\);\n    history\.pushState/, 'Back dismisses the chooser before leaving the reader');
  assert.match(app, /selectionMenuRouter\.reset\(\); \$\('reader-dialog'\)\.showModal\(\)/, 'reader entry re-asserts native menu suppression');
  assert.match(app, /onNote: event => activateReaderText\(event\)/, 'trigger controls share the single dispatcher');
  console.log('PASS app wiring: chooser cleanup, Back dismissal and reader-entry routing');
}
