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
