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
