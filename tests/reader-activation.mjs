import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTreeDom } from './support/tree-dom.mjs';

const dom = createTreeDom();
Object.assign(globalThis, dom.globals);
const { document, window, dispatch } = dom;
const { annotatedText, applyExplainedMarks } = await import('../js/reader-text.js');
const { createReaderActivation, glossaryForTrigger, indexGlossaryTriggers, normalizeReaderControls } = await import('../js/reader-activation.js');
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
  const storyText = document.createTextNode('Brot'), storyText2 = document.createTextNode(' und Käse'); story.append(storyText, storyText2);
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
  window.selection = { isCollapsed: false, anchorNode: storyText, focusNode: storyText2 }; dispatch(document, 'selectionchange'); assert.equal(router.confirmed, true, 'multiword selection across inline text nodes suppresses the native menu');
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
  window.selection = { isCollapsed: false, anchorNode: storyText, focusNode: storyText2 };
  assert.equal(dispatch(document.body, 'contextmenu').defaultPrevented, true, 'multiword selection menu is cancelled when Android targets the selection ancestor');
  window.selection = { isCollapsed: true, anchorNode: null, focusNode: null };
  for (const target of [textarea, help, helpText, note, noteText, error, chrome]) assert.equal(dispatch(target, 'contextmenu').defaultPrevented, false, 'native menu untouched');
  console.log('PASS contextmenu prevention is scoped to story and title text');
  for (const node of [title, story, textarea, help, note, error, chrome]) node.remove();
}

// --- Overlapping vocabulary note and saved explanation --------------------------------------------
// Vocabulary is first: text with a note opens it directly and hands over any saved explanation id.
function reader({ text, glossary, ranges, segments = null, language = 'de' }) {
  const dialog = make('div'), story = make('div', { id: 'reader-story' }, dialog);
  const events = [], selection = { collapsed: true }, mode = { explanation: false };
  const cards = new Set(ranges.map(range => range.id));
  const activate = createReaderActivation({
    root: story, glossaryFor: glossaryForTrigger,
    hasExplanation: id => !mode.explanation && cards.has(id),
    selectionCollapsed: () => selection.collapsed,
    closeNote: () => events.push('close-note'),
    showNote: (vocab, helpId) => events.push(['note', vocab, helpId]),
    showExplanation: id => events.push(['explanation', id])
  });
  annotatedText(story, text, segments, { glossary, language, onNote: event => activate(event) });
  indexGlossaryTriggers(story, text, glossary);
  applyExplainedMarks(story, ranges);
  normalizeReaderControls(story);
  story.addEventListener('click', activate);
  story.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
  window.selection = { isCollapsed: true, anchorNode: null, focusNode: null };
  return { dialog, story, events, selection, mode, activate, cleanup: () => dialog.remove() };
}
const click = (target, ctx) => { window.selection.isCollapsed = ctx ? ctx.selection.collapsed : true; return dispatch(target, 'click'); };
const results = events => events.filter(Array.isArray);
const BREAD = [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }];

{
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: BREAD, ranges: [{ id: 'h1', start: 4, end: 13, label: 'esse Brot' }] });
  const { story, events } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), marks = story.querySelectorAll('mark.explained-expression');
  assert.equal(marks.length, 2, 'the explanation is split around the glossary trigger');
  const nested = trigger.querySelector('mark.explained-expression');
  assert.ok(nested && nested.parentElement === trigger, 'DOM nests the mark inside the glossary trigger');
  assert.equal(nested.getAttribute('role'), null, 'a glossary trigger does not contain another button role');
  assert.equal(nested.getAttribute('tabindex'), null, 'nested marks do not add a second tab stop');
  assert.equal(canonicalOf(story), 'Ich esse Brot heute', 'canonical text is unchanged by nesting');

  click(nested);
  assert.equal(results(events).length, 1, 'one activation dispatches exactly once');
  const [kind, vocab, helpId] = results(events)[0];
  assert.equal(kind, 'note', 'text with both opens the vocabulary note, not the explanation');
  assert.equal(vocab.trigger, trigger); assert.equal(vocab.surface, 'Brot'); assert.equal(vocab.notes[0].meaning, 'bread');
  assert.equal(helpId, 'h1', 'the saved explanation id travels with the note');
  assert.ok(!results(events).some(item => item[0] === 'explanation'), 'nothing navigates to the explanation');

  // The glossary control's own (unmarked) area has no explanation to offer.
  events.length = 0; click(trigger);
  assert.deepEqual(results(events).map(item => [item[0], item[2]]), [['note', '']], 'unmarked trigger area opens a plain note');
  // A mark outside the trigger is explanation-only and jumps directly.
  events.length = 0; click(marks[0]);
  assert.deepEqual(results(events), [['explanation', 'h1']], 'explanation-only text opens directly');
  ctx.cleanup();
  console.log('PASS text with a note and a saved explanation opens the note once with the explanation id; explanation-only text jumps');
}

{
  // Keyboard: the outer glossary control and the marks reach the same single dispatch.
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: BREAD, ranges: [{ id: 'h1', start: 4, end: 13, label: 'esse Brot' }] });
  const { story, events } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), firstMark = story.querySelector('mark.explained-expression');
  assert.equal(trigger.tabIndex, 0); assert.equal(firstMark.tabIndex, 0); assert.equal(firstMark.getAttribute('role'), 'button');
  trigger.focus();
  const key = dispatch(trigger, 'keydown', { key: 'Enter' });
  assert.equal(key.defaultPrevented, true);
  assert.deepEqual(results(events).map(item => [item[0], item[2]]), [['note', 'h1']], 'Enter on the glossary control opens the note once');
  events.length = 0; dispatch(trigger, 'keydown', { key: ' ' });
  assert.deepEqual(results(events).map(item => [item[0], item[2]]), [['note', 'h1']], 'Space does too');
  // Space on the focusable mark outside the glossary is explanation-only.
  events.length = 0; firstMark.focus(); const space = dispatch(firstMark, 'keydown', { key: ' ' });
  assert.equal(space.defaultPrevented, true); assert.deepEqual(results(events), [['explanation', 'h1']]);
  events.length = 0; dispatch(trigger, 'keydown', { key: 'a' }); assert.deepEqual(events, [], 'other keys do nothing');
  ctx.cleanup();
  console.log('PASS keyboard Enter/Space dispatches once');
}

{
  // Reverse nesting: the mark wraps the glossary trigger.
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: BREAD, ranges: [{ id: 'h9', start: 0, end: 0, label: '' }] });
  const { story, events } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), mark = document.createElement('mark');
  mark.className = 'explained-expression'; mark.dataset.helpId = 'h9'; mark.setAttribute('tabindex', '0'); mark.setAttribute('role', 'button');
  trigger.replaceWith(mark); mark.append(trigger);
  click(trigger); assert.deepEqual(results(events).map(item => [item[0], item[2]]), [['note', 'h9']], 'a mark wrapping the trigger is resolved too');
  events.length = 0; mark.focus(); dispatch(mark, 'keydown', { key: 'Enter' });
  assert.deepEqual(results(events).map(item => [item[0], item[2]]), [['note', 'h9']], 'Enter on the wrapping mark finds the inner trigger');
  ctx.cleanup();
  console.log('PASS glossary/mark nesting resolves in either order');
}

{
  // Noncollapsed selection and explanation-selection mode.
  const ctx = reader({ text: 'Ich esse Brot heute', glossary: BREAD, ranges: [{ id: 'h1', start: 4, end: 13, label: 'esse Brot' }] });
  const { story, events, selection, mode } = ctx;
  const trigger = story.querySelector('.gloss-note-trigger'), nested = trigger.querySelector('mark.explained-expression'), outer = story.querySelector('mark.explained-expression');
  selection.collapsed = false;
  for (const target of [nested, outer, trigger]) click(target, ctx);
  assert.deepEqual(events, [], 'a click that ends a selection opens and navigates nothing');
  dispatch(trigger, 'keydown', { key: 'Enter' }); dispatch(outer, 'keydown', { key: ' ' });
  assert.deepEqual(events, [], 'Enter and Space during a selection also do nothing');
  selection.collapsed = true; mode.explanation = true;
  click(nested, ctx); assert.deepEqual(results(events).map(item => [item[0], item[2]]), [['note', '']], 'explanation selection mode leaves only the glossary note');
  ctx.cleanup();
  console.log('PASS noncollapsed selection blocks activation; explanation-selection mode offers no explanation action');
}

{
  // Japanese: readings stay separate; a secondary ruby fragment still reaches the shared note.
  const segments = [{ text: '日', reading: 'にち' }, { text: '本語', reading: 'ほんご' }, { text: 'を読む' }];
  const ctx = reader({ text: '日本語を読む', language: 'ja-JP', segments, glossary: [{ word: '日本語', meaning: 'Japanese language', forms: ['日本語'] }], ranges: [{ id: 'j1', start: 1, end: 4, label: '本語を' }] });
  const { story, events } = ctx;
  assert.equal(canonicalOf(story), '日本語を読む', 'canonical Japanese is separate from readings');
  assert.deepEqual(story.querySelectorAll('rt').map(item => item.textContent), ['にち', 'ほんご']);
  const triggers = story.querySelectorAll('.gloss-note-trigger'), primary = triggers[0];
  const secondaryMark = triggers[1].querySelector('mark.explained-expression') || triggers[1];
  primary.focus(); dispatch(primary, 'keydown', { key: 'Enter' });
  assert.equal(results(events).at(-1)[2], 'j1', 'primary keyboard control finds an explanation on a later ruby fragment');
  events.length = 0; click(secondaryMark);
  assert.equal(results(events).length, 1);
  assert.equal(results(events)[0][1].trigger, primary, 'every fragment shares the primary control'); assert.equal(results(events)[0][1].surface, '日本語');
  assert.equal(results(events)[0][2], 'j1');
  events.length = 0; click(primary);
  assert.deepEqual(results(events).map(item => [item[0], item[2]]), [['note', '']], 'the unmarked first fragment opens a plain note');
  ctx.cleanup();
  console.log('PASS Japanese fragments share the note, keep readings separate and carry the explanation id');
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
  // The source chooser is gone; the note carries the only secondary action.
  const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const css = read('../css/style.css'), html = read('../index.html'), app = read('../js/app.js');
  assert.doesNotMatch(css + html + read('../js/reader-activation.js') + app, /source-chooser|sourceChooser|createSourceChooser/, 'obsolete chooser markup, styles and wiring are removed');
  assert.match(css, /\.word-note-view \{[^}]*width: 100%[^}]*min-height: 44px/, 'View saved explanation is a full-width 44px target');
  assert.match(css, /\.word-note-view \{[^}]*border-top: 1px solid/, 'a subtle divider separates it from the meanings');
  assert.match(css, /\.word-note-view:hover, \.word-note-view:focus-visible/, 'visible keyboard focus');
  assert.match(app, /function closeWordNote\(restoreFocus = false\) \{\n  const popover/, 'note closing no longer touches a chooser');
  assert.match(app, /if \(!\$\('word-note-popover'\)\.hidden\) \{\n    closeWordNote\(true\);\n    history\.pushState/, 'Back dismisses an open note before leaving the reader');
  assert.match(app, /selectionMenuRouter\.reset\(\); \$\('reader-dialog'\)\.showModal\(\)/, 'reader entry re-asserts native menu suppression');
  assert.match(app, /onNote: event => activateReaderText\(event\)/, 'trigger controls share the single dispatcher');
  console.log('PASS chooser removed; note action is 44px, divided, focus-visible; Back dismisses the note first');
}
