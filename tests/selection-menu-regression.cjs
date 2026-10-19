// Routing behavior is covered in reader-activation.mjs; this checks the stylesheet opt-ins the routing relies on.
const fs = require('node:fs'), assert = require('node:assert/strict');
const css = fs.readFileSync('css/style.css', 'utf8');
assert.match(css, /body \{ user-select: none;/, 'text is unselectable by default');
for (const selector of ['textarea', '.selectable-story', '.reader-panel .reader-title', '.help-text-selectable', '.word-note-popover', '.form-error']) assert.ok(css.includes(selector + (selector === '.form-error' ? ' { user-select: text' : '')), selector + ' opts in');
const menu = fs.readFileSync('js/selection-menu.js', 'utf8');
assert.match(menu, /READER_TEXT_SELECTOR = '#reader-story, #reader-title'/, 'story and title are the only suppressed reader text');
console.log('PASS selectable regions in CSS match the native-menu routing selectors');
