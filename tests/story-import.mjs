import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {storyExportFile, importStoryFile, STORY_IMPORT_MAX_BYTES} from '../js/story-share.js';
import {createStoryModel} from '../js/story-model.js';
import {createWorkspaceStorage, validStories} from '../js/workspace-storage.js';
import {markStoryActivity} from '../js/library-activity.js';

const {normalizeChapters} = createStoryModel({state:{}, readerStory:() => null});
const version = {id:'v', title:'買い物', story:'買います。', storySegments:[{text:'買', reading:'か'}, {text:'います。'}], glossary:[{word:'買う', meaning:'buy', forms:['買います']}]};
const alternate = {...version, id:'a', title:'別', story:'帰ります。'};
const story = {id:'S', language:'ja', title:'日本の話', createdAt:'2026-10-01T00:00:00.000Z', unknown:{future:true},
  memories:[{lineage:['v'], text:'memory'}], memoryRebuild:{entries:[]}, readerPositions:{original:{chapter:0}},
  chapters:[{id:'c', versions:[version, alternate], help:[{text:'explanation', followUp:[{q:'why'}]}]}],
  paths:[{id:'original', name:'Original', entries:[{chapterId:'c', versionId:'v'}]}, {id:'alt', name:'Alternate 1', forkChapter:1, entries:[{chapterId:'c', versionId:'a'}]}], activePathId:'alt'};
const exported = storyExportFile(story, {appVersion:'1.3.1', now:'2026-11-10T00:00:00Z'}).content;
const ids = ['S', 'S', 'NEW'];

// Round trip: everything is kept except a new identity and the import stamp; the source is not mutated.
{
  const before = JSON.stringify(story);
  const imported = importStoryFile(exported, {existingIds:['S'], newId:() => ids.shift(), now:'2026-11-11T08:00:00Z'});
  assert.equal(imported.id, 'NEW', 'an ID colliding with a saved story is replaced');
  assert.equal(imported.importedAt, '2026-11-11T08:00:00.000Z');
  const {id, importedAt, ...rest} = imported, {id: oldId, ...original} = story;
  assert.deepEqual(rest, original, 'all paths, versions, explanations, memories and unknown fields survive');
  assert.equal(JSON.stringify(story), before);
  assert.ok(validStories([story, imported]), 'imported copy can be saved next to the original');
  for (const key of ['format', 'formatVersion', 'appVersion', 'exportedAt']) assert.equal(imported[key], undefined, 'envelope fields are not stored');
  // Exporting the imported copy and importing again stays lossless.
  const again = importStoryFile(storyExportFile(imported, {appVersion:'1.3.1'}).content, {existingIds:['S', 'NEW'], newId:() => 'NEWER', now:'2026-11-12T00:00:00Z'});
  assert.deepEqual({...again, id:'NEW', importedAt}, imported);
  // A UTF-8 byte-order mark from another app is tolerated.
  assert.equal(importStoryFile(`\uFEFF${exported}`, {newId:() => 'B'}).id, 'B');
}
console.log('PASS story import round trip keeps the full record with a new identity and import stamp');

// Legacy single-text stories keep their derived version IDs after re-identification.
{
  const legacy = {id:'L', language:'de', title:'Alt', story:'Ein Text.', glossary:[], memories:[{lineage:['legacy-L']}]};
  const imported = importStoryFile(storyExportFile(legacy).content, {newId:() => 'L2', normalizeChapters});
  assert.equal(imported.id, 'L2');
  assert.equal(imported.chapters[0].versions[0].id, 'legacy-L');
  assert.equal(imported.chapters[0].versions[0].story, 'Ein Text.');
  assert.deepEqual(normalizeChapters(imported).map(chapter => chapter.versions[0].id), ['legacy-L']);
  assert.ok(validStories([imported]));
}
console.log('PASS legacy story import pins derived chapter and version IDs');

// Rejected files carry a learner-facing reason.
{
  const envelope = JSON.parse(exported);
  const cases = [
    ['', 'invalid_file'], ['   ', 'invalid_file'], ['{not json', 'invalid_file'], ['[]', 'invalid_file'], ['null', 'invalid_file'],
    [JSON.stringify(story), 'invalid_file'],
    [JSON.stringify({...envelope, format:'other'}), 'invalid_file'],
    [JSON.stringify({...envelope, formatVersion:2}), 'unsupported_version'],
    [JSON.stringify({...envelope, formatVersion:'1'}), 'invalid_file'],
    [JSON.stringify({...envelope, formatVersion:undefined}), 'invalid_file'],
    [JSON.stringify({...envelope, story:null}), 'invalid_story'],
    [JSON.stringify({...envelope, story:[story]}), 'invalid_story'],
    [JSON.stringify({...envelope, story:{...story, language:''}}), 'invalid_story'],
    [JSON.stringify({...envelope, story:{...story, chapters:[{id:'c', versions:[]}]}}), 'invalid_story'],
    [JSON.stringify({...envelope, story:{...story, paths:[{id:'p', name:'P', entries:[{chapterId:'c', versionId:'missing'}]}]}}), 'invalid_story'],
  ];
  for (const [text, code] of cases) assert.throws(() => importStoryFile(text, {newId:() => 'X'}), error => error.code === code && typeof error.userMessage === 'string', `${code}: ${text.slice(0, 60)}`);
  assert.throws(() => importStoryFile(exported, {existingIds:['X'], newId:() => 'X'}), /new identity/);
}
console.log('PASS story import rejects non-LingoMage, newer, malformed and invalid story files');

// Real app wiring: the Library handler, the normal stories save, cancellation and rollback.
{
  const app = fs.readFileSync('js/app.js', 'utf8');
  const start = app.indexOf('// Library → Import story…'), end = app.indexOf("$('reader-share').addEventListener");
  assert.ok(start > 0 && end > start);
  const persistStories = app.slice(app.indexOf('function persistStories()'), app.indexOf('function persistReaderStory('));
  const setup = (saved = [story], {write = () => true} = {}) => {
    const files = new Map([['data/stories.json', JSON.stringify(saved)]]), writes = [];
    const workspaceStorage = createWorkspaceStorage({read:path => files.get(path) ?? '', exists:path => files.has(path), write:(path, value) => { writes.push(path); if (!write()) return false; files.set(path, JSON.stringify(value)); return true; }});
    const elements = new Map(), toasts = [];
    const $ = id => { if (!elements.has(id)) elements.set(id, {value:'', files:null, disabled:false, addEventListener(name, fn) { this[name] = fn; }, click() { this.clicked = (this.clicked || 0) + 1; }, focus() { this.focused = true; }}); return elements.get(id); };
    const context = {$, state:{}, workspaceStorage, normalizeChapters, importStoryFile, markStoryActivity, STORY_IMPORT_MAX_BYTES, libraryChanged() { context.changed = (context.changed || 0) + 1; }, toast:message => toasts.push(message), console:{warn() {}}, Date};
    vm.createContext(context);
    vm.runInContext(`${persistStories}\n${app.slice(start, end)}`, context);
    context.state.stories = JSON.parse(JSON.stringify(workspaceStorage.load('data/stories.json').value));
    return {context, $, files, writes, toasts};
  };
  const choose = async (env, file) => { env.$('import-story').click(); env.$('import-story-input').files = file ? [file] : []; await env.$('import-story-input').change(); };
  const fileOf = (text, size = text.length) => ({size, text:async () => text});

  let env = setup();
  env.$('import-story-input').value = 'C:\\fakepath\\old.json';
  env.$('import-story').click();
  assert.equal(env.$('import-story-input').clicked, 1, 'the button opens the picker inside its click');
  assert.equal(env.$('import-story-input').value, '', 'the same file can be chosen again');
  await choose(env, fileOf(exported));
  const saved = JSON.parse(env.files.get('data/stories.json'));
  assert.equal(saved.length, 2); assert.deepEqual(saved[1], story, 'the existing story is untouched');
  assert.notEqual(saved[0].id, 'S'); assert.equal(saved[0].title, story.title); assert.equal(saved[0].lastActivityKind, 'updated');
  assert.deepEqual(env.context.state.stories, saved, 'runtime state matches the saved file');
  assert.deepEqual(env.toasts, ['Imported “日本の話”']); assert.equal(env.context.changed, 1);
  assert.equal(env.$('import-story').disabled, false); assert.equal(env.$('import-story').focused, true);
  await choose(env, fileOf(exported));
  assert.equal(JSON.parse(env.files.get('data/stories.json')).length, 3, 'importing the same file twice adds a second copy');

  const unchanged = async (env, file, message) => {
    const bytes = env.files.get('data/stories.json'), stories = JSON.stringify(env.context.state.stories), toasts = env.toasts.length;
    await choose(env, file);
    assert.equal(env.files.get('data/stories.json'), bytes); assert.equal(JSON.stringify(env.context.state.stories), stories);
    if (message) assert.match(env.toasts.at(-1), message); else assert.equal(env.toasts.length, toasts, 'cancellation is silent');
  };
  env = setup();
  await unchanged(env, null);
  await unchanged(env, fileOf('{"format":"other"}'), /not a LingoMage story file/);
  await unchanged(env, fileOf(JSON.stringify({...JSON.parse(exported), formatVersion:9})), /newer LingoMage/);
  await unchanged(env, fileOf(exported, STORY_IMPORT_MAX_BYTES + 1), /too large/);
  await unchanged(env, {size:10, text:async () => { throw new Error('gone'); }}, /Could not read/);
  assert.equal(env.writes.length, 0, 'rejected files never write');

  env = setup([story], {write:() => false});
  await unchanged(env, fileOf(exported), /Could not save data\/stories\.json/);
  assert.equal(env.writes.length, 1); assert.equal(env.context.state.stories.length, 1, 'a failed save rolls back the in-memory Library');

  env = setup(); env.files.set('data/stories.json', '{broken'); env.context.workspaceStorage.load('data/stories.json'); env.writes.length = 0;
  await unchanged(env, fileOf(exported), /Could not load data\/stories\.json/);
  assert.equal(env.writes.length, 0, 'an unreadable stories file is never overwritten by an import');
}
console.log('PASS Library import saves through the stories store; cancel, invalid files and failed saves change nothing');
