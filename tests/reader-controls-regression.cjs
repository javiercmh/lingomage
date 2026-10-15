// Exercise compact reader controls through production helpers and event handlers.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const elements = new Map(), documentEvents = {};
const box = id => {
  if (!elements.has(id)) elements.set(id, {hidden: true, classList: {toggle(name, enabled) { enabled ? navigationClasses.add(name) : navigationClasses.delete(name); }}, style: {}, attributes: {}, events: {}, value: '',
    setAttribute(k, v) { this.attributes[k] = v; }, focus(options) { this.focused = true; this.focusOptions = options; },
    addEventListener(k, fn) { this.events[k] = fn; },
    getBoundingClientRect() { if (id === 'reader-navigation-bar') return {top: navigationTop, height: 66}; return id.endsWith('-toggle') ? {left: 230, top: 200, bottom: 244} : {width: 280, height: 160}; }});
  return elements.get(id);
};
const story = {id: 'S', activePathId: 'original'}, positions = {
  'S:original': {chapterId: 'B', scrollTop: 120}, 'S:alt': {chapterId: 'A', scrollTop: 20}
};
let saved = 0, failed = false, updates = [], notesClosed = 0, messages = [], navigationTop = 160;
const navigationClasses = new Set();
const reader = {events: {}, addEventListener(key, fn) { this.events[key] = fn; }, scrollTop: 0, getBoundingClientRect: () => ({left: 0, right: 320, top: 0, bottom: 640})};
const c = {state: {readerFontSize: 19, readerEditBusy: false, readerPositions: positions}, $: box,
  window: {innerWidth: 320, innerHeight: 640}, getComputedStyle: () => ({paddingLeft: '14', paddingRight: '14', paddingTop: '12', paddingBottom: '24'}), readerPanel: () => reader,
  document: {addEventListener: (key, fn) => documentEvents[key] = fn}, closeWordNote() { notesClosed++; },
  persistSettings() { saved++; }, toast(message) { messages.push(message); },
  readerStory: () => story, selectedPath: () => ({id: story.activePathId}),
  pathChapters: () => [{id: 'A'}, {id: 'B'}], rememberReaderPosition() {}, clearExplanationSelection() {},
  persistReaderStory() { if (failed) throw Error('disk'); saved++; },
  updateReader(keep) { updates.push(keep); }, requestAnimationFrame: fn => fn()
};
vm.createContext(c);
vm.runInContext(slice('function closeReaderActions(', 'function renderReaderActions('), c);
vm.runInContext(slice('for (const name of READER_PANELS) $', "$('furigana-toggle').addEventListener"), c);
box('path-control').hidden = true;
box('reader-navigation-toggle').events.click();
assert.equal(box('reader-navigation-panel').hidden, false);
assert.equal(box('chapter-select').focused, true, 'single path focuses Chapter');
assert.equal(box('reader-navigation-toggle').attributes['aria-expanded'], 'true');
assert.equal(box('reader-navigation-panel').style.left, '26px', 'panel stays within narrow safe bounds');
assert.equal(box('reader-actions-menu').hidden, true);
box('reader-preferences-toggle').events.click();
assert.equal(box('reader-navigation-panel').hidden, true, 'opening Aa closes navigation');
assert.equal(box('reader-text-size').focused, true);
box('reader-text-size').value = '99'; box('reader-text-size').events.input();
assert.equal(c.state.readerFontSize, 30); assert.equal(box('reader-story').style.fontSize, '30px');
assert.equal(box('reader-text-size').attributes['aria-valuetext'], '30 pixels');
assert.equal(saved, 0, 'live preview does not write settings');
box('reader-text-size').events.change(); assert.equal(saved, 1);
box('reader-text-size').value = '1'; box('reader-text-size').events.input(); assert.equal(c.state.readerFontSize, 15);
let prevented = false, stopped = false;
documentEvents.keydown({key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; }});
assert(prevented && stopped, 'Escape is consumed before reader dismissal');
assert.equal(box('reader-preferences-panel').hidden, true); assert.equal(box('reader-preferences-toggle').focused, true);
assert.equal(box('reader-preferences-toggle').focusOptions.preventScroll, true, 'returning focus must not scroll a pinned control back to its document position');
box('path-control').hidden = false; box('reader-navigation-toggle').events.click();
assert.equal(box('path-select').focused, true, 'multiple paths focus Story path');
documentEvents.pointerdown({target: {closest: () => true}}); assert.equal(box('reader-navigation-panel').hidden, false);
documentEvents.pointerdown({target: {closest: () => null}}); assert.equal(box('reader-navigation-panel').hidden, true);
// Path changes preserve existing remembered positions and recover failed writes.
vm.runInContext(slice("$('path-select').addEventListener", "$('chapter-prev').addEventListener"), c);
box('reader-navigation-toggle').events.click(); box('path-select').value = 'alt'; box('path-select').events.change();
assert.equal(story.activePathId, 'alt'); assert.equal(c.state.readerChapter, 0); assert.equal(reader.scrollTop, 20);
assert.equal(updates.at(-1), true); assert.equal(box('reader-navigation-panel').hidden, false);
failed = true; box('path-select').value = 'original'; box('path-select').events.change();
assert.equal(story.activePathId, 'alt'); assert.equal(reader.scrollTop, 20); assert.deepEqual(messages, ['disk']);
c.state.readerEditBusy = true; box('path-select').value = 'original'; box('path-select').events.change();
assert.equal(box('path-select').value, 'alt'); assert.equal(story.activePathId, 'alt');
// Chapter choice closes navigation and restores its trigger before rendering.
vm.runInContext(slice("$('chapter-select').addEventListener", "$('path-select').addEventListener"), c);
box('chapter-select').value = '1'; box('chapter-select').events.change();
assert.equal(c.state.readerChapter, 1); assert.equal(box('reader-navigation-panel').hidden, true);
assert.equal(box('reader-navigation-toggle').focused, true);
// Scrolling panel contents leaves them open; reader scrolling dismisses them.
vm.runInContext(slice("readerPanel().addEventListener('scroll'", 'function sentenceContext('), c);
c.state.readerEditBusy = false; box('reader-preferences-toggle').events.click();
reader.events.scroll({target: box('reader-preferences-panel')}); assert.equal(box('reader-preferences-panel').hidden, false);
reader.events.scroll({target: reader}); assert.equal(box('reader-preferences-panel').hidden, true);
assert(notesClosed > 0);
// Pinned styling follows geometry and safe areas without changing content or scroll position.
box('reader-dialog').open = true; reader.scrollTop = 300; navigationTop = 12;
c.updateReaderNavigation(); assert(navigationClasses.has('is-floating')); assert.equal(reader.scrollTop, 300);
navigationTop = 100; c.updateReaderNavigation(); assert(!navigationClasses.has('is-floating'));
c.getComputedStyle = element => element === reader ? {paddingTop: '36px'} : {top: '0px'}; navigationTop = 36; c.updateReaderNavigation(); assert(navigationClasses.has('is-floating'));
reader.scrollTop = 0; c.updateReaderNavigation(); assert(!navigationClasses.has('is-floating'));
console.log('PASS compact reader: panel exclusivity, viewport bounds, focus/dismissal, live size/persistence, path positions/write rollback and generation lock');
