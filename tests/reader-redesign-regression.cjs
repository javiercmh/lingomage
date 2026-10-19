// Behavioral checks for the reader redesign helpers (scroll reveal, overlap warning, swipe actions).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
function section(start, end) { const at = source.indexOf(start); assert(at >= 0, `missing ${start}`); return source.slice(at, source.indexOf(end, at)); }

// Show: scroll only enough to reveal the bottom of the explanation card.
{
  const scrolls = [];
  const panel = { scrollBy: options => scrolls.push(options) };
  const classes = new Set();
  const make = rect => ({ getBoundingClientRect: () => rect, setAttribute() {}, focus() {}, classList: { add: name => classes.add(name), remove: name => classes.delete(name) } });
  let navigation = null;
  const context = { getComputedStyle: () => ({top: '24px'}), document: { querySelector: selector => selector === '.reader-panel' ? panel : navigation, querySelectorAll: () => [{ hidden: false, offsetParent: null, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 700 }) }] }, window: { innerHeight: 800, matchMedia: () => ({ matches: false }) }, requestAnimationFrame: fn => fn(), setTimeout: () => 0 };
  vm.createContext(context); vm.runInContext(section('function revealCard(', '\nfunction readJson('), context);
  const reveal = rect => { scrolls.length = 0; context.revealCard(make(rect)); return scrolls[0]; };
  assert.equal(reveal({ top: 100, bottom: 400, height: 300 }), undefined, 'fully visible card does not scroll');
  assert.equal(reveal({ top: 500, bottom: 900, height: 400 }).top, 900 + 12 - 700, 'partly hidden card scrolls only to reveal its bottom');
  assert.equal(reveal({ top: 300, bottom: 1400, height: 1100 }).top, 300 - 12, 'card taller than the viewport aligns its top');
  navigation = {offsetHeight: 66};
  assert.equal(reveal({top: 80, bottom: 280, height: 200}).top, 80 - 102, 'cards clear the pinned bar and top safe area');
  assert.equal(reveal({top: 300, bottom: 1400, height: 1100}).top, 300 - 102, 'tall cards align beneath pinned navigation');
  context.getComputedStyle = element => element === panel ? {paddingTop: '36px'} : {top: '0px'};
  assert.equal(reveal({top: 80, bottom: 280, height: 200}).top, 80 - 114, 'clearance includes scroll-container padding and host safe area');
  assert(classes.has('reveal-pulse'));
  console.log('PASS Show reveals only the bottom of an explanation, aligns tall cards at the top and skips needless scrolling');
}

// Title section: compact accessible Listen, floating navigation/preferences and Story actions.
{
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const headerStart = html.indexOf('<header class="reader-title-section"'), header = html.slice(headerStart, html.indexOf('</header>', headerStart));
  for (const id of ['reader-title-meta', 'reader-title', 'reader-actions-toggle', 'reader-menu-continue', 'reader-menu-rewrite', 'reader-copy', 'reader-remove-chapters', 'reader-delete-path', 'reader-listen', 'chapter-select'])
    assert(header.includes(`id="${id}"`), `${id} belongs to the title section`);
  assert(header.includes('aria-label="Listen to this chapter"'), 'icon-only Listen retains its accessible scope');
  assert(!header.includes('Listen to chapter</span>'));
  for (const id of ['reader-navigation-panel', 'reader-preferences-panel', 'reader-text-size']) assert(header.includes(`id="${id}"`));
  const navStart = html.indexOf('<div id="reader-navigation-bar"'), navigation = html.slice(navStart, html.indexOf('<div id="reader-player-anchor"', navStart));
  for (const id of ['chapter-prev', 'reader-navigation-toggle', 'chapter-next', 'reader-preferences-toggle']) assert(navigation.includes(`id="${id}"`));
  assert(!navigation.includes('id="reader-listen"'), 'Listen stays with the expanded title');
  assert.equal((navigation.match(/<svg/g) || []).length, 3, 'navigation and picker use stroked chevrons');
  assert(header.indexOf('id="reader-listen"') > header.indexOf('id="reader-title"'));
  assert(!html.includes('id="text-smaller"') && !html.includes('class="reader-toolbar"'));
  assert.equal((html.match(/id="reader-copy"/g) || []).length, 1);
  const titleContext = { window: { getSelection: () => ({ getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 1, top: 2 }) }) }) }, getCanonicalSelection: () => ({ text: 'Titel', start: 0, end: 5 }), $: () => ({}), readerStory: () => ({ id: 's', language: 'de' }), activeChapter: () => ({ id: 'c' }), activeVersion: () => ({ id: 'v' }), SPEECH_LANGUAGES: { de: 'de-DE' } };
  vm.createContext(titleContext); vm.runInContext(section('function selectedTitle(', 'function selectedPassage('), titleContext);
  const passage = titleContext.selectedTitle();
  assert.equal(passage.kind, 'title'); assert.equal(passage.languageTag, 'de-DE'); assert.equal(passage.text, 'Titel');
  assert(/\.selection-toolbar\.title-selection #selection-explain \{ display: none/.test(fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8')), 'Explain is hidden for title selections');
  console.log('PASS title section structure and title selection uses the custom toolbar without Explain');
}

// Explained expressions: newest range owns overlaps; overlapping explanations are detected for replacement.
{
  const textSource = fs.readFileSync(path.join(__dirname, '../js/reader-text.js'), 'utf8').replaceAll('export function ', 'function ');
  const context = {}; vm.createContext(context);
  vm.runInContext(textSource + '\n' + section('function overlappingHelp(', 'function confirmReplaceHelp('), context);
  const segments = JSON.parse(JSON.stringify(context.explainedSegments(20, [{ id: 'old', start: 2, end: 10, label: 'a' }, { id: 'new', start: 6, end: 14, label: 'b' }])));
  assert.deepEqual(segments.map(s => [s.start, s.end, s.id]), [[0, 2, ''], [2, 6, 'old'], [6, 14, 'new'], [14, 20, '']]);
  const chapter = { help: [{ id: 'a', versionId: 'v', start: 0, end: 5 }, { id: 'b', versionId: 'v', start: 5, end: 9 }, { id: 'c', versionId: 'other', start: 0, end: 9 }, { id: 'd', versionId: 'v' }] };
  assert.deepEqual(context.overlappingHelp(chapter, 'v', 4, 6).map(e => e.id), ['a', 'b'], 'ranges that touch but do not overlap are kept');
  assert.deepEqual(context.overlappingHelp(chapter, 'v', 5, 5).map(e => e.id), [], 'adjacent explanations do not overlap');
  assert.deepEqual(context.overlappingHelp(chapter, 'v', 9, 12).map(e => e.id), []);
  assert(/overlapping|overlaps/.test(source) && /confirmReplaceHelp\(overlaps\)/.test(source) && /replace-help-dialog/.test(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')));
  console.log('PASS explained expression segments favor the newest explanation and overlap detection drives the replace warning');
}

// Story actions tray: swipe tracks the finger and a visible keyboard-reachable control exposes Select and Delete.
{
  const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
  assert(/\.story-card\.swipe-revealed \{ --swipe-x: -168px; \}/.test(css) && /\.story-open, \.story-menu-toggle \{ transform: translateX\(var\(--swipe-x\)\)/.test(css), 'tray width matches the slide distance and the Actions button moves with the surface');
  assert(/story-menu-toggle[^}]*width: 44px; height: 44px/.test(css) && /\.story-tray-action \{[^}]*min-height: 44px/.test(css), '44px targets');
  assert(/\.story-card\.swipe-revealed\.settling \.story-open, \.story-card\.swipe-revealed\.settling \.story-menu-toggle \{ pointer-events: none; \}/.test(css), 'while the revealed surface slides over the tray, taps pass through to Select/Delete');
  const vars = {}, tray = { hidden: true }, handlers = {}, classes = new Set(), timers = [];
  const card = { classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) }, style: { setProperty: (k, v) => { vars[k] = v; }, removeProperty: k => { delete vars[k]; } }, querySelector: selector => selector === '.story-actions-tray' ? tray : null, addEventListener: (name, fn) => { handlers[name] = fn; }, setPointerCapture() {} };
  const context = { state: { storySelectionMode: false }, revealStory() {}, closeStoryReveal() {}, setTimeout: fn => timers.push(fn), clearTimeout() {} }; vm.createContext(context);
  vm.runInContext(section('const STORY_TRAY_WIDTH', 'function confirmStoryDeletion('), context);
  context.wireStorySwipe(card, 'a', () => {});
  handlers.pointerdown({ clientX: 300, clientY: 100, pointerId: 1, isPrimary: true, button: 0, target: { closest: () => null } });
  handlers.pointermove({ clientX: 250, clientY: 100, pointerId: 1, preventDefault() {} });
  assert.equal(vars['--swipe-x'], '-50px', 'card follows the finger');
  assert.equal(tray.hidden, false, 'tray is revealed progressively while dragging');
  handlers.pointermove({ clientX: 20, clientY: 100, pointerId: 1, preventDefault() {} });
  assert.equal(vars['--swipe-x'], '-168px', 'drag is clamped to the tray width');
  handlers.pointerup({ clientX: 20, clientY: 100, pointerId: 1 });
  assert.equal(vars['--swipe-x'], undefined, 'inline offset is released so the class settles the card');
  assert(classes.has('settling'), 'a completed reveal swipe lets the first tap reach the tray while the surface is still sliding');
  timers.splice(0).forEach(fn => fn());
  assert(!classes.has('settling'), 'tray pass-through ends once the slide settles');
  handlers.pointerdown({ clientX: 300, clientY: 100, pointerId: 3, isPrimary: true, button: 0, target: { closest: () => null } });
  handlers.pointermove({ clientX: 280, clientY: 100, pointerId: 3, preventDefault() {} });
  handlers.pointerup({ clientX: 280, clientY: 100, pointerId: 3 });
  assert(!classes.has('settling'), 'a short drag that does not reveal the tray never makes the surface click-through');
  // A touch drag produces no click; the next tap on a tray button must not be swallowed.
  handlers.pointerdown({ clientX: 100, clientY: 100, pointerId: 2, isPrimary: true, button: 0, target: { closest: () => ({}) } });
  let swallowed = false; handlers.click({ preventDefault() { swallowed = true; }, stopImmediatePropagation() {} });
  assert.equal(swallowed, false, 'a tap on the tray after a swipe is not suppressed');
  const app = source;
  assert(/story-tray-select/.test(app) && /story-swipe-delete/.test(app) && /Actions for \$\{story\.title\}/.test(app) && /closeStoryReveal\(true\)/.test(app));
  assert(!/card-select-action'; select\.textContent = 'Select story'/.test(app), 'hidden focus-only Select story control is retired for stories');
  console.log('PASS story swipe follows the finger, clamps to the tray, and a visible Actions button exposes Select and Delete');
}
