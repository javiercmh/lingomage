// js/app.js plus the screen modules split out of it, as one text, for tests that check or evaluate app
// source. Each module holds a former app.js section verbatim inside its create… factory. `export ` before
// declarations is dropped so sliced functions still evaluate as plain scripts.
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '../..');
// app.js comes last: some tests evaluate from a marker to the end of app.js.
const MODULES = ['js/reader-view.js', 'js/create-flow.js', 'js/generation-status-ui.js', 'js/reader-help.js', 'js/language-settings.js', 'js/library-view.js', 'js/reader-player-ui.js', 'js/share-dialog.js', 'js/stats-view.js'];
const APP_SOURCES = [...MODULES, 'js/app.js'];
function appSource() {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  // A module is reduced to the former app.js section: its imports, the factory's opening and returned
  // exports, and the factory indent are dropped, so the text matches the old section; an end marker follows.
  // Evaluated slices get their dependencies from the test context.
  const module = file => read(file)
    .replace(/^import .*\n/gm, '')
    .replace(/^export function create\w+\(\{[^}]*\}\) \{\n/m, '')
    .replace(/\n {2}return \{[^}]*\};\n\}\n?$/, '\n')
    // Undo the factory's two-space indent. Exact because moved code has no multi-line template literals
    // (the extraction leaves their continuation lines unindented); keep it that way or this changes text.
    .replace(/^ {2}/gm, '')
    .replace(/^export (?=(async )?function |const |let )/gm, '') + `// end of ${file}\n`;
  return [...MODULES.map(module), read('js/app.js')].join('\n');
}
module.exports = appSource;
module.exports.APP_SOURCES = APP_SOURCES;
