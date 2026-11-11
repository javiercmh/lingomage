const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/app.js', 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
let columns = 20;
const panel = {scrollTop: 200, getBoundingClientRect: () => ({top: 0})};
const story = {id: 's'};
const elements = {'reader-story': {textContent: 'x'.repeat(1000)}, 'reader-dialog': {open: true}};
const history = {state: {lingomageView: 'library'}, replaceState(value) { this.state = value; }};
const context = {window: {innerWidth: 360, innerHeight: 800}, history, state: {readerPositions: {}},
  $: id => elements[id], readerPanel: () => panel, activeVersion: () => ({id: 'v', story: 'x'.repeat(1000)}),
  readerStory: () => story, selectedPath: () => ({id: 'p'}), activeChapter: () => ({id: 'c'}),
  canonicalRange: (_root, start) => ({getBoundingClientRect: () => ({top: Math.floor(start / columns) * 20 - panel.scrollTop, bottom: Math.floor(start / columns) * 20 + 20 - panel.scrollTop})})};
vm.createContext(context);
vm.runInContext(between('// Canonical offsets exclude', '// Positions live in memory'), context);
context.rememberReaderPosition();
context.rememberReaderLocation();
const position = context.state.readerPositions['s:p'];
assert.equal(position.textOffset, 260);
assert.equal(history.state.lingomagePosition.textOffset, 260);
columns = 40;
context.restoreReaderPosition(position);
assert.equal(panel.scrollTop, 60, 'same text line stays at the same viewport height after rotation');
columns = 20;
context.restoreReaderPosition(position);
assert.equal(panel.scrollTop, 200, 'rotating back restores the passage');
context.restoreReaderPosition({...position, versionId: 'other'});
assert.equal(panel.scrollTop, 200, 'different version uses pixel fallback');
context.restoreReaderPosition({scrollTop: 85});
assert.equal(panel.scrollTop, 85, 'legacy positions remain readable');
// Layout scrolls before resize cannot overwrite the cached reading location.
context.state.readerPositions['s:p'] = position;
context.window.innerWidth = 800; columns = 40; panel.scrollTop = 0;
context.rememberReaderPosition();
assert.equal(context.state.readerPositions['s:p'], position);
let resize, frame;
context.window.addEventListener = (_type, fn) => { resize = fn; };
Object.assign(context, {closeReaderActions() {}, closeWordNote() {}, updateReaderNavigation() {}, renderReaderGeneration() {}, positionReaderPanel() {}, requestAnimationFrame: fn => { frame = fn; }});
elements['reader-navigation-panel'] = {hidden: true}; elements['reader-preferences-panel'] = {hidden: false};
vm.runInContext(between("window.addEventListener('resize', () => {\n  closeReaderActions(); closeWordNote();", "$('chapter-select').addEventListener"), context);
resize();
assert.equal(panel.scrollTop, 60);
assert.equal(elements['reader-preferences-panel'].hidden, false, 'rotation keeps preferences open');
context.rememberReaderPosition();
assert.equal(context.state.readerPositions['s:p'], position, 'restoration scroll cannot overwrite the anchor');
frame();
// Recreated pages reuse the reader history entry and restore the selected tab.
let opened;
Object.assign(context, {setView: name => { context.view = name; }, openReader: value => { opened = value; }});
context.state.stories = [story];
history.state = {lingomageView: 'library', lingomageReader: 's', lingomagePosition: position};
vm.runInContext(source.slice(source.indexOf('// A recreated page keeps')), context);
assert.equal(context.view, 'library'); assert.equal(opened, story); assert.equal(context.state.readerHistoryEntry, true);
console.log('reader rotation: text anchor, legacy fallback and page recreation pass');
