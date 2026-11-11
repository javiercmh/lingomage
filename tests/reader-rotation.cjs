const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
// Story characters on a grid: 10px wide, 20px lines, `columns` per line; character 999 is an unrendered line break.
let columns = 20;
const view = {top: 0, bottom: 400, left: 0, right: 200};
const panel = {scrollTop: 200, getBoundingClientRect: () => view};
const story = {id: 's'};
const elements = {'reader-story': {textContent: 'x'.repeat(1000)}, 'reader-dialog': {open: true}};
const history = {state: {lingomageView: 'library'}, replaceState(value) { this.state = value; }};
const rect = index => {
  const top = Math.floor(index / columns) * 20 - panel.scrollTop, left = (index % columns) * 10;
  return index === 999 ? {top: 0, bottom: 0, left: 0, right: 0, height: 0} : {top, bottom: top + 20, left, right: left + 10, height: 20};
};
const context = {window: {innerWidth: 360, innerHeight: 800}, history, state: {readerPositions: {}},
  $: id => elements[id], readerPanel: () => panel, activeVersion: () => ({id: 'v', story: 'x'.repeat(1000)}),
  readerStory: () => story, selectedPath: () => ({id: 'p'}), activeChapter: () => ({id: 'c'}),
  canonicalRange: (_root, start) => ({getBoundingClientRect: () => rect(start)})};
vm.createContext(context);
vm.runInContext(between('// The reading location is the story character', '$(\'reader-dialog\').addEventListener(\'close\''), context);
const middleOf = offset => { const box = rect(offset); return (box.top + box.bottom) / 2; };

// Line 20 crosses the middle (y 200); its character nearest x 100 is column 10.
context.rememberReaderPosition();
context.rememberReaderLocation();
const position = context.state.readerPositions['s:p'];
assert.equal(position.textOffset, 410);
assert.equal(position.textTop, undefined, 'only the middle character is stored');
assert.equal(history.state.lingomagePosition.textOffset, 410);

// Rotation: wider lines, shorter view. The same character moves to the new middle.
columns = 40; Object.assign(view, {bottom: 200, right: 400});
context.restoreReaderPosition(position);
assert.equal(middleOf(410), 100, 'middle character stays at the middle after rotation');
columns = 20; Object.assign(view, {bottom: 400, right: 200});
context.restoreReaderPosition(position);
assert.equal(middleOf(410), 200, 'rotating back centres the same passage');
context.restoreReaderPosition({...position, versionId: 'other'});
assert.equal(panel.scrollTop, 200, 'different version uses pixel fallback');
context.restoreReaderPosition({scrollTop: 85});
assert.equal(panel.scrollTop, 85, 'legacy positions remain readable');

// Middle in the title area (above the prose) keeps the pixel offset alone.
panel.scrollTop = -300; context.rememberReaderPosition();
assert.equal(context.state.readerPositions['s:p'].textOffset, undefined);
// Middle past the prose keeps the pixel offset alone.
panel.scrollTop = 1200; context.rememberReaderPosition();
assert.equal(context.state.readerPositions['s:p'].textOffset, undefined);
// A short last line: the nearest character is the line's last one.
elements['reader-story'].textContent = 'x'.repeat(1000);
context.activeVersion = () => ({id: 'v', story: 'x'.repeat(405)});
panel.scrollTop = 200; context.rememberReaderPosition();
assert.equal(context.state.readerPositions['s:p'].textOffset, 404);
context.activeVersion = () => ({id: 'v', story: 'x'.repeat(1000)});

// Layout scrolls before resize cannot overwrite the cached reading location.
context.state.readerPositions['s:p'] = position;
context.window.innerWidth = 800; columns = 40; panel.scrollTop = 0;
context.rememberReaderPosition();
assert.equal(context.state.readerPositions['s:p'], position);
let resize, frame;
context.window.addEventListener = (_type, fn) => { resize = fn; };
Object.assign(context, {fitReaderTitle() {}, closeReaderActions() {}, closeWordNote() {}, updateReaderNavigation() {}, renderReaderGeneration() {}, positionReaderPanel() {}, requestAnimationFrame: fn => { frame = fn; }});
elements['reader-navigation-panel'] = {hidden: true}; elements['reader-preferences-panel'] = {hidden: false};
vm.runInContext(between("window.addEventListener('resize', () => {\n  closeReaderActions(); closeWordNote();", "$('chapter-select').addEventListener"), context);
Object.assign(view, {bottom: 200, right: 400});
resize();
assert.equal(middleOf(410), 100);
assert.equal(elements['reader-preferences-panel'].hidden, false, 'rotation keeps preferences open');
context.rememberReaderPosition();
assert.equal(context.state.readerPositions['s:p'], position, 'restoration scroll cannot overwrite the anchor');
frame();

// Text size and furigana reflow keep the remembered middle character centred, through repeated steps.
context.window.innerWidth = 360; context.readerViewport = {width: 360, height: 800};
vm.runInContext('readerViewport = { width: window.innerWidth, height: window.innerHeight };', context);
for (const size of [30, 26, 22]) {
  columns = size; panel.scrollTop = 0;
  context.keepReaderLocation(() => {});
  assert.equal(middleOf(410), 100, `text reflow to ${size} columns keeps the middle`);
  context.rememberReaderPosition();
  assert.equal(context.state.readerPositions['s:p'], position, 'reflow scroll cannot replace the anchor');
  frame();
  context.rememberReaderPosition();
  assert.equal(context.state.readerPositions['s:p'], position, 'a late scroll event at the restored offset keeps the anchor');
}
// A real scroll afterwards picks the new middle.
panel.scrollTop += 40; context.rememberReaderPosition();
assert.notEqual(context.state.readerPositions['s:p'], position);
context.state.readerPositions['s:p'] = position;
// A position from another chapter is not applied to the open chapter.
context.state.readerPositions['s:p'] = {...position, chapterId: 'other'}; panel.scrollTop = 33;
context.keepReaderLocation(() => {});
assert.equal(panel.scrollTop, 33);

// Recreated pages reuse the reader history entry and restore the selected tab.
let opened;
Object.assign(context, {setView: name => { context.view = name; }, openReader: value => { opened = value; }});
context.state.stories = [story];
history.state = {lingomageView: 'library', lingomageReader: 's', lingomagePosition: position};
vm.runInContext(source.slice(source.indexOf('// A recreated page keeps')), context);
assert.equal(context.view, 'library'); assert.equal(opened, story); assert.equal(context.state.readerHistoryEntry, true);
console.log('reader rotation: middle anchor, reflow, legacy fallback and page recreation pass');
