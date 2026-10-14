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
  const context = { document: { querySelector: () => panel, querySelectorAll: () => [{ hidden: false, offsetParent: {}, getBoundingClientRect: () => ({ top: 700 }) }] }, window: { innerHeight: 800, matchMedia: () => ({ matches: false }) }, requestAnimationFrame: fn => fn(), setTimeout: () => 0 };
  vm.createContext(context); vm.runInContext(section('function revealCard(', '\nfunction readJson('), context);
  const reveal = rect => { scrolls.length = 0; context.revealCard(make(rect)); return scrolls[0]; };
  assert.equal(reveal({ top: 100, bottom: 400, height: 300 }), undefined, 'fully visible card does not scroll');
  assert.equal(reveal({ top: 500, bottom: 900, height: 400 }).top, 900 + 12 - 700, 'partly hidden card scrolls only to reveal its bottom');
  assert.equal(reveal({ top: 300, bottom: 1400, height: 1100 }).top, 300 - 12, 'card taller than the viewport aligns its top');
  assert(classes.has('reveal-pulse'));
  console.log('PASS Show reveals only the bottom of an explanation, aligns tall cards at the top and skips needless scrolling');
}

// Title section: one header with meta, title, labelled Listen, navigation and a Story menu holding continue/rewrite/copy.
{
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const headerStart = html.indexOf('<header class="reader-title-section"'), header = html.slice(headerStart, html.indexOf('</header>', headerStart));
  for (const id of ['reader-title-meta', 'reader-title', 'reader-actions-toggle', 'reader-menu-continue', 'reader-menu-rewrite', 'reader-copy', 'reader-remove-chapters', 'reader-delete-path', 'reader-listen', 'chapter-select'])
    assert(header.includes(`id="${id}"`), `${id} belongs to the title section`);
  assert(header.includes('Listen to chapter</span>'), 'Listen is labelled with its scope');
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
  assert(/\.story-card\.swipe-revealed \.story-open \{ transform: translateX\(-168px\)/.test(css), 'tray width matches the slide distance');
  assert(/story-menu-toggle[^}]*width: 44px; height: 44px/.test(css) && /\.story-tray-action \{[^}]*min-height: 44px/.test(css), '44px targets');
  const surface = { style: {} }, handlers = {}, classes = new Set();
  const card = { classList: { contains: name => classes.has(name) }, querySelector: selector => selector === '.story-open' ? surface : null, addEventListener: (name, fn) => { handlers[name] = fn; }, setPointerCapture() {} };
  const context = { state: { storySelectionMode: false }, revealStory() {}, closeStoryReveal() {} }; vm.createContext(context);
  vm.runInContext(section('const STORY_TRAY_WIDTH', 'function confirmStoryDeletion('), context);
  context.wireStorySwipe(card, 'a', () => {});
  handlers.pointerdown({ clientX: 300, clientY: 100, pointerId: 1, isPrimary: true, button: 0, target: { closest: () => null } });
  handlers.pointermove({ clientX: 250, clientY: 100, pointerId: 1, preventDefault() {} });
  assert.equal(surface.style.transform, 'translateX(-50px)', 'surface follows the finger');
  handlers.pointermove({ clientX: 20, clientY: 100, pointerId: 1, preventDefault() {} });
  assert.equal(surface.style.transform, 'translateX(-168px)', 'drag is clamped to the tray width');
  handlers.pointerup({ clientX: 20, clientY: 100, pointerId: 1 });
  assert.equal(surface.style.transform, '', 'inline transform is released so the class settles the surface');
  const app = source;
  assert(/story-tray-select/.test(app) && /story-swipe-delete/.test(app) && /Actions for \$\{story\.title\}/.test(app) && /closeStoryReveal\(true\)/.test(app));
  assert(!/card-select-action'; select\.textContent = 'Select story'/.test(app), 'hidden focus-only Select story control is retired for stories');
  console.log('PASS story swipe follows the finger, clamps to the tray, and a visible Actions button exposes Select and Delete');
}
