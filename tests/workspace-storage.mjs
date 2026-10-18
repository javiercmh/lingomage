import assert from 'node:assert/strict';
import {createWorkspaceStorage, validStories, validSettings, validCheckpoints, settingsSnapshot, restoreSettingsSnapshot, createSettingsPersistence} from '../js/workspace-storage.js';
const paths=['data/stories.json','data/settings.json','data/generation-checkpoints.json'];
function fixture(initial={}) {
  const files=new Map(Object.entries(initial)); let writes=0, failRead=false, failWrite=false;
  const storage=createWorkspaceStorage({read:path=>{if(failRead)throw Error('disk unavailable');return files.get(path) ?? '';},exists:path=>files.has(path),write:(path,value)=>{writes++;if(failWrite)return false;files.set(path,JSON.stringify(value));return true;}});
  return {files, storage, writes:()=>writes, failRead:value=>failRead=value, failWrite:value=>failWrite=value};
}
for (const path of paths) {
  for (const bad of ['{broken','null','"text"','42',path.endsWith('settings.json')?'[]':'{}','']) {
    const h=fixture({[path]:bad});
    assert.equal(h.storage.load(path).status,'invalid');
    assert.throws(()=>h.storage.save(path,path.endsWith('settings.json')?{}:[]),/preserved/);
    assert.equal(h.files.get(path),bad);assert.equal(h.writes(),0);
  }
  const h=fixture();assert.equal(h.storage.load(path).status,'missing');h.storage.save(path,path.endsWith('settings.json')?{}:[]);assert.equal(h.storage.entries.get(path).status,'valid');
  h.failRead(true);assert.equal(h.storage.load(path).status,'invalid');assert.throws(()=>h.storage.assertWritable([path]));h.failRead(false);assert.equal(h.storage.load(path).status,'valid');
}
const legacy={id:'legacy',language:'ja',title:'日本',story:'日本です。',promptVersion:'old',custom:{preserve:true}};
assert(validStories([legacy]));
assert(!validStories([{...legacy,words:{}}]));assert(!validStories([{...legacy,topic:42}]));
assert(!validStories([null]));assert(!validStories([legacy,legacy]));
assert(!validStories([{...legacy,chapters:[{id:'c',versions:[]}]}]));
assert(!validStories([{...legacy,paths:[{id:'p',name:'Original',entries:[{chapterId:'missing',versionId:'v'}]}]}]));
for (const key of ['term','text']) {
  const alias={...legacy,chapters:[{id:'c',versions:[{id:'v',story:'Text',glossary:[{[key]:'headword',meaning:'meaning'}]}]}]};
  assert(!validStories([alias]),`strict validation no longer accepts glossary alias ${key}`);
}
assert(!validStories([{...legacy,chapters:[{id:'c',versions:[{id:'v',story:'Text',glossary:[{meaning:'missing headword'}]}]}]}]));
assert(!validSettings({languageOrder:'de'}));assert(!validSettings({readingPreferences:[]}));
assert(!validCheckpoints([{id:'op',kind:'create',stage:'ready',input:{},config:{}}]));
const h=fixture({'data/stories.json':JSON.stringify([legacy]),'data/settings.json':'{"futureSetting":true}'});
h.storage.load('data/stories.json');h.storage.load('data/settings.json');
h.storage.save('data/stories.json',h.storage.entries.get('data/stories.json').value);assert.deepEqual(JSON.parse(h.files.get('data/stories.json')),[legacy]);
h.failWrite(true);assert.throws(()=>h.storage.save('data/stories.json',[]),/not saved/);assert.deepEqual(h.storage.entries.get('data/stories.json').value,[legacy]);
const state={providerId:'mock',model:'original',reasoning:'',languageOrder:['de'],targetLanguages:{de:'enabled'},standardizedLevels:{de:'A1'},learnerProfiles:{},languageExpectations:{},languageSetupDismissed:false,furigana:true,readerFontSize:19,speechRate:1,followAlong:true};
const snapshot=settingsSnapshot(state);state.model='unsaved';state.targetLanguages.de='changed';state.readerFontSize=30;restoreSettingsSnapshot(state,snapshot);assert.deepEqual(settingsSnapshot(state),snapshot);
console.log('PASS workspace storage: missing/valid/invalid states, preserved corrupt bytes, blocked writes, explicit reload, write failure, additive legacy data and settings rollback snapshots');

const settingsFixture=fixture({'data/settings.json':'{"futureSetting":true,"readingPreferences":{"futurePreference":7}}'});
settingsFixture.storage.load('data/settings.json');let rollbacks=0,errors=0;
const settingsPersistence=createSettingsPersistence({storage:settingsFixture.storage,state,onRollback:()=>rollbacks++,onError:()=>errors++});
settingsPersistence.remember();state.model='selected';settingsPersistence.save();
let persisted=JSON.parse(settingsFixture.files.get('data/settings.json'));
assert(persisted.futureSetting);assert.equal(persisted.readingPreferences.futurePreference,7);
settingsFixture.failWrite(true);state.model='unsaved';state.languageOrder.reverse();state.readerFontSize=30;
assert.throws(()=>settingsPersistence.save(),/not saved/);assert.equal(state.model,'selected');assert.equal(state.readerFontSize,19);assert.equal(rollbacks,1);assert.equal(errors,1);
assert.equal(JSON.parse(settingsFixture.files.get('data/settings.json')).model,'selected');
console.log('PASS settings persistence: production transaction restores state on failure and preserves unknown settings fields');

// Missing-file detection accepts the host phrasings the previous loader accepted; other failures stay invalid.
for (const message of ['ENOENT: no such file','Not found','file not found','does not exist']) {
  const storage=createWorkspaceStorage({read:()=>{throw Error(message);},exists:()=>false,write:()=>true});
  assert.equal(storage.load('data/settings.json').status,'missing',message);
}
assert.equal(createWorkspaceStorage({read:()=>{throw Error('permission denied');},exists:()=>true,write:()=>true}).load('data/settings.json').status,'invalid');
// An existing blank file is invalid even when existence is reported; an unknown listing fails closed.
assert.equal(createWorkspaceStorage({read:()=>'',exists:()=>true,write:()=>true}).load('data/stories.json').status,'invalid');
assert.equal(createWorkspaceStorage({read:()=>'',exists:()=>{throw Error('listing unavailable');},write:()=>true}).load('data/stories.json').status,'invalid');
// Null optional fields written by older versions are treated as absent.
assert(validStories([{...legacy,title:null,topic:null,practice:null,words:null,glossary:null,paths:null,memories:null,chapters:null}]));
// Failure kinds are distinguishable: invalid stores, rejected shapes and failed writes.
{
  const invalid=fixture({'data/settings.json':'{broken'});invalid.storage.load('data/settings.json');
  assert.throws(()=>invalid.storage.save('data/settings.json',{}),error=>error.code==='store_invalid');
  const ok=fixture({'data/settings.json':'{}'});ok.storage.load('data/settings.json');
  assert.throws(()=>ok.storage.save('data/settings.json',[]),error=>error.code==='invalid_data');
  ok.failWrite(true);assert.throws(()=>ok.storage.save('data/settings.json',{}),error=>error.code==='write_failed');
  const throwing=createWorkspaceStorage({read:()=>'{}',exists:()=>true,write:()=>{throw Error('Development storage writeFile failed (500).');}});throwing.load('data/settings.json');
  assert.throws(()=>throwing.save('data/settings.json',{}),error=>error.code==='write_failed'&&/not saved/.test(error.message));
}

// Ordinary saves keep nested unknown and legacy settings; deliberate edits and removals still apply.
const admit={targetLanguages:code=>['de','ja'].includes(code),standardizedLevels:(code,level)=>code==='de'&&['A1','A2'].includes(level)||code==='ja'&&level==='N5',learnerProfiles:(code,value)=>['de','ja'].includes(code)&&typeof value==='string',languageExpectations:(code,value)=>['de','ja'].includes(code)&&typeof value==='string',languageOrder:code=>['de','ja'].includes(code)};
const longProfile='p'.repeat(900);
const stored={futureTop:{keep:true},model:'m1',theme:'light',targetLanguages:{de:'enabled',ja:'enabled',fr:'enabled'},languageOrder:['fr','ja','de','sv'],standardizedLevels:{de:'A2',ja:'N0',fr:'B1'},learnerProfiles:{de:longProfile,fr:'future'},languageExpectations:{ja:'formal',fr:'tu'},readingPreferences:{fontSize:12,speechRate:1.15,futurePreference:7}};
const runtime=()=>({providerId:'',model:'m1',reasoning:'',languageOrder:['ja','de'],targetLanguages:{de:'enabled',ja:'enabled'},standardizedLevels:{de:'A2'},learnerProfiles:{de:longProfile.slice(0,600)},languageExpectations:{ja:'formal'},languageSetupDismissed:false,furigana:true,readerFontSize:15,speechRate:1,followAlong:true});
function mergeFixture(change=()=>{}) {
  const h=fixture({'data/settings.json':JSON.stringify(stored)});h.storage.load('data/settings.json');
  const live=runtime(),persistence=createSettingsPersistence({storage:h.storage,state:live,admit});persistence.remember();change(live);persistence.save();
  return {h,live,saved:JSON.parse(h.files.get('data/settings.json')),persistence};
}
{
  const {saved,live}=mergeFixture(state=>{state.followAlong=false;});
  assert.deepEqual(saved.futureTop,{keep:true});assert.equal(saved.theme,'light');
  assert.deepEqual(saved.targetLanguages,{fr:'enabled',de:'enabled',ja:'enabled'});
  assert.deepEqual(saved.standardizedLevels,{ja:'N0',fr:'B1',de:'A2'});
  assert.equal(saved.learnerProfiles.de,longProfile,'untouched legacy text is not truncated');assert.equal(saved.learnerProfiles.fr,'future');
  assert.equal(saved.languageExpectations.fr,'tu');
  assert.deepEqual(saved.languageOrder,['fr','ja','de','sv'],'unknown codes keep their place');
  assert.deepEqual(saved.readingPreferences,{fontSize:12,speechRate:1.15,futurePreference:7,furigana:true,followAlong:false});
  assert.equal(live.standardizedLevels.ja,undefined,'retired and future values never become active runtime settings');
  assert.equal(live.readerFontSize,15);
}
{
  const {saved}=mergeFixture(state=>{
    delete state.targetLanguages.ja;delete state.standardizedLevels.de;state.standardizedLevels.ja='N5';
    delete state.languageExpectations.ja;state.learnerProfiles.de='short';
    state.languageOrder=['de','ja'];state.readerFontSize=22;state.speechRate=1.25;
  });
  assert.equal(saved.targetLanguages.ja,undefined,'a removed known language is not reintroduced');assert.equal(saved.targetLanguages.fr,'enabled');
  assert.deepEqual(saved.standardizedLevels,{ja:'N5',fr:'B1'});
  assert.equal(saved.languageExpectations.ja,undefined);assert.equal(saved.languageExpectations.fr,'tu');
  assert.equal(saved.learnerProfiles.de,'short');
  assert.deepEqual(saved.languageOrder,['fr','de','ja','sv']);
  assert.equal(saved.readingPreferences.fontSize,22);assert.equal(saved.readingPreferences.speechRate,1.25);assert.equal(saved.readingPreferences.futurePreference,7);
}
// A deliberately re-saved value replaces a legacy value; saving twice is stable.
{
  const first=mergeFixture(state=>{state.readerFontSize=19;});assert.equal(first.saved.readingPreferences.fontSize,19);
  first.persistence.save();assert.deepEqual(JSON.parse(first.h.files.get('data/settings.json')),first.saved);
}

// A failed write keeps the intended change; Retry repeats exactly that change and never anything else.
{
  const {h,live}=mergeFixture();
  const calls={rollback:0,reapply:[],errors:[],saved:0};
  const watched=createSettingsPersistence({storage:h.storage,state:live,admit,onRollback:()=>calls.rollback++,onReapply:details=>calls.reapply.push(details.changes.map(change=>change.path.join('.'))),onError:info=>calls.errors.push(info),onSaved:()=>calls.saved++});
  watched.remember();
  h.failWrite(true);live.speechRate=1.5;live.followAlong=false;
  assert.throws(()=>watched.save(),error=>error.code==='write_failed');
  assert.equal(live.speechRate,1,'state is rolled back');assert.equal(live.followAlong,true);
  assert.equal(calls.errors.at(-1).retryable,true);assert.equal(calls.errors.at(-1).code,'write_failed');assert.equal(watched.pending.changes.length,2);
  // An unrelated failure adds to the pending change instead of replacing it.
  live.readerFontSize=25;assert.throws(()=>watched.save(),/not saved/);assert.equal(watched.pending.changes.length,3);
  // Retry while still failing keeps the same intended change available and reports false.
  assert.equal(watched.retry(),false);assert.equal(watched.pending.changes.length,3);assert.equal(live.speechRate,1,'failed retry rolled back again');
  assert.equal(JSON.parse(h.files.get('data/settings.json')).readingPreferences.speechRate,1.15,'nothing was written');
  h.failWrite(false);
  assert.equal(watched.retry(),true);
  assert.equal(watched.pending,null);assert.equal(live.speechRate,1.5);assert.equal(live.followAlong,false);assert.equal(live.readerFontSize,25);
  assert.deepEqual(calls.reapply.at(-1).sort(),['readingPreferences.followAlong','readingPreferences.fontSize','readingPreferences.speechRate']);
  const written=JSON.parse(h.files.get('data/settings.json'));
  assert.equal(written.readingPreferences.speechRate,1.5);assert.equal(written.readingPreferences.fontSize,25);assert.equal(written.readingPreferences.futurePreference,7);
  assert.equal(calls.saved,1);
}
// A field the learner changed (and saved) since the failure is not overwritten by Retry.
{
  const {h,live}=mergeFixture();
  const watched=createSettingsPersistence({storage:h.storage,state:live,admit});watched.remember();
  h.failWrite(true);live.speechRate=1.5;assert.throws(()=>watched.save());h.failWrite(false);
  live.speechRate=0.75;watched.save();
  assert.equal(watched.retry(),true);assert.equal(live.speechRate,0.75);assert.equal(JSON.parse(h.files.get('data/settings.json')).readingPreferences.speechRate,0.75);
}
// An unreadable settings store is reported as non-retryable and is never written.
{
  const h=fixture({'data/settings.json':'{broken'});h.storage.load('data/settings.json');
  const live=runtime(),errors=[];const persistence=createSettingsPersistence({storage:h.storage,state:live,admit,onError:info=>errors.push(info)});persistence.remember();
  live.readerFontSize=28;assert.throws(()=>persistence.save());
  assert.equal(errors[0].code,'store_invalid');assert.equal(errors[0].retryable,false);assert.equal(persistence.pending,null);assert.equal(live.readerFontSize,15);
  assert.equal(h.files.get('data/settings.json'),'{broken');assert.equal(h.writes(),0);
}
console.log('PASS settings merge keeps unknown nested/legacy values and honours learner edits; write failures keep the intended change for Retry; unreadable stores are non-retryable');

// One-time glossary alias migration (temporary; delete with the migration block in the next major release).
{
  const STORIES='data/stories.json';
  const story=(id,glossary,extra={})=>({id,language:'de',title:'T',topic:'x',custom:{keep:[1,{a:null}]},chapters:[{id:'c',help:[{any:1}],versions:[{id:'v',story:'Text',reading:'r',glossary,unknown:{k:true}}]}],memories:[{m:1}],...extra});
  const canonical=story('ok',[{word:'Haus',meaning:'house',forms:['Häuser']}]);
  const original=[story('a',[{term:'Katze',meaning:'cat',extra:5},{word:'Hund',meaning:'dog'}]),story('b',[{meaning:'tree',text:'Baum'}]),canonical];
  const expected=[story('a',[{word:'Katze',meaning:'cat',extra:5},{word:'Hund',meaning:'dog'}]),story('b',[{meaning:'tree',word:'Baum'}]),canonical];
  const bytes=JSON.stringify(original);

  // term and text are normalized, every other field is preserved, aliases are gone and the file is rewritten once.
  const h=fixture({[STORIES]:bytes});
  const entry=h.storage.load(STORIES);
  assert.equal(entry.status,'valid');assert.deepEqual(entry.value,expected);assert.equal(h.writes(),1);
  assert.deepEqual(JSON.parse(h.files.get(STORIES)),expected);
  const notes=entry.value.flatMap(item=>item.chapters[0].versions[0].glossary);
  assert(notes.every(note=>!('term' in note)&&!('text' in note)&&typeof note.word==='string'));
  h.storage.save(STORIES,entry.value);// the migrated store is writable
  // Reloading normalized data is idempotent: no further migration write, identical value.
  const writesBefore=h.writes();
  const again=h.storage.load(STORIES);
  assert.equal(again.status,'valid');assert.deepEqual(again.value,expected);assert.equal(h.writes(),writesBefore);

  // Top-level (unchaptered) glossary is normalized too; an alias equal to `word` is simply dropped.
  const flat={id:'flat',language:'ja',story:'Text',glossary:[{term:'x',meaning:'m'},{word:'y',text:'y',meaning:'n'}]};
  const flatFixture=fixture({[STORIES]:JSON.stringify([flat])});
  assert.deepEqual(flatFixture.storage.load(STORIES).value,[{...flat,glossary:[{word:'x',meaning:'m'},{word:'y',meaning:'n'}]}]);

  // Conflicting values fail closed and the original bytes are preserved, with no write attempted.
  for (const note of [{word:'a',term:'b',meaning:'m'},{word:'a',text:'b',meaning:'m'},{term:'a',text:'b',meaning:'m'}]) {
    const bad=JSON.stringify([story('c',[note])]);
    const c=fixture({[STORIES]:bad});
    assert.equal(c.storage.load(STORIES).status,'invalid');assert.match(c.storage.entries.get(STORIES).error,/preserved/);
    assert.equal(c.files.get(STORIES),bad);assert.equal(c.writes(),0);
    assert.throws(()=>c.storage.save(STORIES,[]),error=>error.code==='store_invalid');assert.equal(c.files.get(STORIES),bad);
  }

  // A failed migration write (false or thrown) is not reported as success, loses nothing and is retried by the next load.
  const failing=fixture({[STORIES]:bytes});failing.failWrite(true);
  const failed=failing.storage.load(STORIES);
  assert.equal(failed.status,'invalid');assert.match(failed.error,/not changed/);assert.deepEqual(failed.value,[]);
  assert.equal(failing.files.get(STORIES),bytes);assert.equal(failing.writes(),1);
  assert.throws(()=>failing.storage.assertWritable([STORIES]),error=>error.code==='store_invalid');
  assert.throws(()=>failing.storage.save(STORIES,[]),error=>error.code==='store_invalid');assert.equal(failing.files.get(STORIES),bytes);
  failing.failWrite(false);
  assert.deepEqual(failing.storage.load(STORIES).value,expected);assert.deepEqual(JSON.parse(failing.files.get(STORIES)),expected);
  const throwing=createWorkspaceStorage({read:()=>bytes,exists:()=>true,write:()=>{throw Error('disk full');}});
  assert.equal(throwing.load(STORIES).status,'invalid');

  // Migration applies only to stories; invalid data is not persisted by it.
  const unrelated=fixture({[STORIES]:JSON.stringify([{id:'u',language:'de',story:'Text',glossary:[{term:'t'}]}])});
  assert.equal(unrelated.storage.load(STORIES).status,'invalid');assert.equal(unrelated.writes(),0);
  const settings=fixture({'data/settings.json':'{"glossary":[{"term":"x"}]}'});
  settings.storage.load('data/settings.json');assert.equal(settings.writes(),0);
}
console.log('PASS glossary alias migration: term/text normalized once, conflicts fail closed, reload is idempotent, failed writes keep the original file');
