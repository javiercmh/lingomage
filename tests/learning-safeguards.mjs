import { bindGeneration } from './support/controllers.mjs';
import { failureInfo, recoverySummary } from '../js/generation-errors.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { validateProse, validateNotes, NOTES_INSTRUCTIONS, validateStory, validateExamples, validateScript, wordCount, sentenceCount, readingPlan, attachReadings, SAFEGUARD_VERSION } from '../js/learning-validation.js';
import { createPipeline } from '../js/generation-pipeline.js';
import { annotatedText, getCanonicalSelection, japaneseSegments } from '../js/reader-text.js';
import {MEMORY_VERSION} from '../js/story-memory.js';
const tested = id => console.log(`SAFEGUARD ${id}`);
const story = (language='de', length='short') => {
  const count=language === 'ja' ? 8 : 100;
  if (language === 'ja') return {title:'小さな一日',story:'今日は町へ行きます。'.repeat(count),glossary:[{word:'町',meaning:'town',forms:['町']}]};
  const token=language==='ru' ? 'город' : language==='es-CL' ? 'ciudad' : 'Stadt';
  return {title:token,story:Array(count).fill(token).join(' '),glossary:[{word:token,meaning:'city',forms:[token]}]};
};
// PED-004 retires numerical length quotas; technical bounds still apply.
for (const language of ['de','ja','ru','es-CL']) {
  const good=story(language);
  assert.ok(validateStory(good,language));
  good.story=language==='ja' ? '町。' : good.title;
  assert.ok(validateStory(good,language));
  good.story=language==='ja' ? '町。'.repeat(100) : (good.title+' ').repeat(1000);
  assert.ok(validateStory(good,language));
}
assert.equal(wordCount("l’homme gut–bekannt très-bien café"),4); assert.equal(sentenceCount('一。二！？三！'),3);
for (const language of ['ja','ru']) {
  for (const invalid of ['Tokyo','ромадзи Latin','日本 romaji']) assert.throws(()=>validateScript(invalid,language),/target script/);
  const good=story(language); good.glossary[0].word='Latin'; assert.throws(()=>validateStory(good,language),/target script/);
}
validateScript('街へ。カフェー𠮷', 'ja'); validateScript('Го́род, Москва и ёлка.', 'ru'); tested('LANG-002');
const good=story();
for (const glossary of [[],null,[{word:'Stadt',meaning:'',forms:['Stadt']}],[{word:'Stadt',meaning:'city',forms:[]}],[{word:'Stadt',meaning:'市',forms:['Stadt']}]] ) assert.throws(()=>validateStory({...good,glossary},'de'));
for (const form of ['absent','Sta']) assert.deepEqual(validateStory({...good,glossary:[{word:'Stadt',meaning:'city',forms:[form]}]},'de').glossary[0].forms,['Stadt']); // only exact chapter text survives; partial forms are never kept
assert.throws(()=>validateStory({...good,glossary:[{word:'Fluss',meaning:'river',forms:['Sta']}]},'de'),/None of the AI vocabulary notes/);
assert.ok(validateStory(good,'de')); tested('LANG-003');
for (const [field,max] of [['title',500],['story',30000]]) {const bad=structuredClone(good);bad[field]='x'.repeat(max+1);assert.throws(()=>validateStory(bad,'de'),/at most/);}
for (const [field,max] of [['word',500],['meaning',4000]]) {const bad=structuredClone(good);bad.glossary[0][field]='x'.repeat(max+1);assert.throws(()=>validateStory(bad,'de'),/at most/);}
const badForms=structuredClone(good);badForms.glossary[0].forms=Array(21).fill('Stadt');assert.throws(()=>validateStory(badForms,'de'),/1–20/);
assert.equal(validateStory({...good,glossary:Array(101).fill(good.glossary[0])},'de').glossary.length,101);
assert.throws(()=>validateStory({...good,glossary:Array(300).fill({...good.glossary[0],meaning:'a'.repeat(4000)})},'de'),/technical size/);tested('LANG-004');
const canonical={title:'今日',story:'今日は町へ行きます。今日も町へ行きます。𠮷'};
const plan=readingPlan(canonical);assert.equal(plan.spans.filter(s=>s.text==='今日').length,3);assert.equal(plan.spans.at(-1).end-plan.spans.at(-1).start,2);
const response={readings:plan.spans.map(s=>({id:s.id,reading:s.text==='今日'?'きょう':'まち'}))};
const rendered=attachReadings(canonical,plan,response); assert.equal(rendered.storySegments.map(s=>s.text).join(''),canonical.story);
assert.ok(rendered.storySegments.filter(s=>s.reading).every(s=>/^\p{Script=Han}+$/u.test(s.text)));
for (const bad of [{readings:[]},{readings:[...response.readings,response.readings[0]]},{readings:response.readings.map(s=>({...s,id:99}))},{readings:response.readings.map(s=>({...s,reading:'Latin'}))},{...response,story:'rewritten'},{readings:response.readings.map(s=>({...s,text:'rewritten'}))}]) assert.throws(()=>attachReadings(canonical,plan,bad));
assert.throws(()=>readingPlan({title:'町'.repeat(201),story:'かな'}),/technical/);
assert.throws(()=>attachReadings(canonical,plan,{readings:response.readings.map(s=>({...s,reading:'あ'.repeat(601)}))}),/kana/);
assert.deepEqual(attachReadings({title:'かな',story:'かな。'},readingPlan({title:'かな',story:'かな。'}),{readings:[]}).storySegments,[{text:'かな。'}]); const nfc=attachReadings({title:'学校',story:'学校'},readingPlan({title:'学校',story:'学校'}),{readings:[{id:1,reading:' か\u3099っこう\n'},{id:0,reading:'がっこう'}]});assert.equal(nfc.storySegments[0].reading,'がっこう');
const hotel=readingPlan({title:'ホテル',story:'ホテルは駅へ行きます。学校です。'});assert.deepEqual(hotel.spans.map(s=>s.text),['駅','行','学校']);
tested('LANG-005');
const example={sentence:'町へ行きます。',translation:'I go to town.',highlightStart:0,highlightEnd:1};
const examples=validateExamples({examples:Array(3).fill(example)},'ja');assert.ok(attachReadings(examples,readingPlan(examples,'examples'),{readings:readingPlan(examples,'examples').spans.map(s=>({id:s.id,reading:'まち'}))},'examples').examples.every(e=>e.segments));
assert.throws(()=>validateExamples({examples:[example]},'ja'));assert.throws(()=>validateExamples({examples:Array(3).fill({...example,highlightEnd:100})},'ja'));
assert.throws(()=>validateExamples({examples:Array(3).fill({...example,sentence:'𠮷へ',highlightEnd:1})},'ja'));tested('LANG-006');
assert.deepEqual(japaneseSegments('行きます',[{text:'行きます',reading:'いきます'}]),[{text:'行',reading:'い'},{text:'きます'}]);
const legacy=[{text:'食べ物',reading:'たべべもの'}];assert.deepEqual(japaneseSegments('食べ物',legacy),legacy);assert.equal(legacy[0].text,'食べ物');tested('LANG-007');
const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const promptSection=source.slice(source.indexOf('function storyInstructions('),source.indexOf('function storyInput('));
const prompts={};vm.createContext(prompts);vm.runInContext(promptSection,prompts);
for (const language of ['German','Japanese','Russian','Spanish']) {
  const prompt=prompts.storyInstructions(language,'advanced','Nuanced usage.','long');
  for (const text of ['languagePlan','languageExpectations','no numerical length quota','not a claim of certified CEFR, JLPT or TORFL alignment','Do not impose a fixed beginner curriculum','unless explicitly requested','German preserves noun capitalization','Spanish preserves accents']) assert.ok(prompt.includes(text),text);
  assert.ok(!prompt.includes('return an empty array'));
}
for (const text of ['Define most meaningful vocabulary','including common words','fixed canonical chapter','Every form must be copied exactly','English explanations only','At least one useful note','do not pad a quota']) assert.ok(NOTES_INSTRUCTIONS.includes(text),text);
assert.ok(prompts.storyInstructions('Russian','A1','test').includes('canonical title and story'));
tested('LANG-008');
// Exercise the production renderer: notes stay inline and canonical text is intact.
function element(tag) { return {tagName:tag,children:[],events:{},append(...nodes){this.children.push(...nodes);},setAttribute(){},addEventListener(n,f){this.events[n]=f;},set textContent(v){this.children=v?[{textContent:v}]:[];},get textContent(){return this.children.map(n=>n.textContent).join('');}}; }
const previousDocument=globalThis.document;globalThis.document={createElement:element,createTextNode:text=>({textContent:text})};
const root=element('div');annotatedText(root,'Stadt',null,{language:'de-DE',glossary:good.glossary});assert.equal(root.children[0].className,'gloss-note-trigger');assert.equal(root.textContent,'Stadt');
const legacyRoot=element('div');annotatedText(legacyRoot,'Stadt',null,{language:'de-DE',glossary:[]});assert.equal(legacyRoot.textContent,'Stadt');globalThis.document=previousDocument;
tested('LANG-009');
// Stage persistence, cancellation, reload, save/release failures and idempotence.
function harness(options={}) {
  let durable=[], next=0, starts=0, applies=0; const results=new Map(), acknowledgements=[], saved=new Set();
  const flags={failPersist:false,failAck:false,failApply:false,invalidReadings:false,cancelled:false};
  const records=[];
  const callbacks={records,persist:records=>{if(flags.failPersist)throw Error('disk');durable=structuredClone(records);},ai:{
    start:async args=>{starts++;const id=String(++next), input=JSON.parse(args.input);results.set(id,input.kind==='notes'?{glossary:story(options.language || 'ja').glossary}:input.kind==='readings'?{readings:input.spans.map(s=>({id:s.id,reading:flags.invalidReadings?'Latin':'まち'}))}:story(options.language || 'ja'));return id;},
    wait:async id=>{if(flags.cancelled)throw Error('Request cancelled.');return JSON.stringify(results.get(id));},
    acknowledge:async id=>{assert.ok(durable.some(o=>o.request?.id===id&&o.request.completed),'release precedes durable stage');if(flags.failAck)throw Error('ack');acknowledgements.push(id);},cancel:async()=>{flags.cancelled=true;}
  },apply:async op=>{if(flags.failApply)throw Error('final disk');if(!saved.has(op.id)){saved.add(op.id);applies++;}}};
  const pipeline=createPipeline(callbacks);
  const spec={kind:'create',language:options.language||'ja',length:'short',input:{storyLength:'short'},instructions:'test',config:{providerId:'mock',model:'model'},promptVersion:'test'};
  return {pipeline,spec,flags,callbacks,get durable(){return durable;},get starts(){return starts;},get applies(){return applies;},acknowledgements};
}
let h=harness();let op=h.pipeline.create(h.spec);await h.pipeline.run(op);assert.equal(h.starts,3);assert.equal(h.applies,1);assert.equal(h.pipeline.records.length,0);tested('GEN-001');
h=harness();op=h.pipeline.create(h.spec);h.flags.failAck=true;await assert.rejects(h.pipeline.run(op),/ack/);assert.equal(op.stage,'notes');assert.equal(h.starts,1);
h.flags.failAck=false;const restored=structuredClone(h.durable);const reloaded=createPipeline({...h.callbacks,records:restored});await reloaded.run(restored[0]);assert.equal(h.starts,3);assert.equal(h.applies,1);
h=harness();op=h.pipeline.create(h.spec);h.flags.failApply=true;await assert.rejects(h.pipeline.run(op),/final disk/);assert.equal(op.stage,'ready');h.flags.failApply=false;await h.pipeline.run(op);assert.equal(h.starts,3);assert.equal(h.applies,1);
h=harness({language:'de'});op=h.pipeline.create(h.spec);h.flags.failPersist=true;await assert.rejects(h.pipeline.run(op),/disk/);assert.equal(h.starts,0);h.flags.failPersist=false;await h.pipeline.run(op);assert.equal(h.starts,2);
// Fail the first durable result write, retain in-memory completion, retry without inference.
h=harness();op=h.pipeline.create(h.spec);let writes=0;const records=[op];const failing=createPipeline({...h.callbacks,records,persist:value=>{writes++;if(writes===3)throw Error('stage disk');h.callbacks.persist(value);}});
await assert.rejects(failing.run(op),/stage disk/);assert.equal(op.stage,'notes');await failing.run(op);assert.equal(h.starts,3);
tested('GEN-002');
h=harness();op=h.pipeline.create(h.spec);h.flags.invalidReadings=true;await assert.rejects(h.pipeline.run(op),/kana/);assert.equal(op.stage,'readings');assert.equal(h.starts,3);h.flags.invalidReadings=false;await h.pipeline.run(op);assert.equal(h.starts,4);
h=harness();op=h.pipeline.create(h.spec);h.flags.cancelled=true;await assert.rejects(h.pipeline.run(op),/cancelled/);assert.equal(h.starts,1);await h.pipeline.discard(op);assert.equal(h.pipeline.records.length,0);
tested('GEN-003');
h=harness();op=h.pipeline.create({...h.spec,input:{storyLength:'short',learnerKnowledge:'snapshot'},config:{providerId:'old',model:'old'}});h.spec.input.storyLength='long';assert.equal(op.input.storyLength,'short');assert.equal(op.config.model,'old');assert.equal(op.safeguardVersion,SAFEGUARD_VERSION);assert.throws(()=>h.pipeline.create(h.spec),/pending/);
const appContext={state:{stories:[],current:null},normalizeChapters:s=>s.chapters,ensureStoryPaths(){},persistReaderStory:s=>{if(!appContext.state.stories.some(a=>a.id===s.id))appContext.state.stories.push(s);},savedFollowUps:h=>h.followUps||[],structuredClone};vm.createContext(appContext);
bindGeneration(appContext);
const create={...op,result:story('de'),kind:'create',input:{difficulty:'beginner'}};appContext.applyContentOperation(create);appContext.applyContentOperation(create);assert.equal(appContext.state.stories.length,1);
const stored=appContext.state.stories[0];stored.paths=[{id:'original',name:'Original',entries:[{chapterId:stored.chapters[0].id,versionId:stored.chapters[0].versions[0].id}]}];stored.nextAlternateNumber=1;
const base=structuredClone(stored);
for (const kind of ['continue','rewrite']) {const sample=structuredClone(base);appContext.state.stories=[sample];const entries=structuredClone(sample.paths[0].entries);const follow={...create,id:`op-${kind}`,kind,target:{storyId:sample.id,pathId:'original',chapterId:sample.chapters[0].id,sourceVersionId:entries[0].versionId,entries,index:0},input:{prompt:'',learnerProfile:{}}};appContext.applyContentOperation(follow);appContext.applyContentOperation(follow);assert.equal(sample.chapters.reduce((n,c)=>n+c.versions.filter(v=>v.operationId===follow.id).length,0),1);assert.equal(sample.chapters[0].versions[0].story,base.story);assert.equal(sample.chapters.flatMap(c=>c.versions).find(v=>v.operationId===follow.id).memoryVersion,MEMORY_VERSION,'saved provenance uses the single memory version');}
// Continue appends to its own request path but never changes the selected path; Rewrite still selects its new alternate.
for (const selected of ['original','alt']) {const sample=structuredClone(base);sample.paths.push({id:'alt',name:'Alternate 1',forkChapter:1,entries:structuredClone(sample.paths[0].entries)});sample.nextAlternateNumber=2;sample.activePathId=selected;appContext.state.stories=[sample];const entries=structuredClone(sample.paths[0].entries);
  const follow={...create,id:`op-keep-${selected}`,kind:'continue',target:{storyId:sample.id,pathId:'original',chapterId:sample.chapters[0].id,sourceVersionId:entries[0].versionId,entries,index:0},input:{prompt:'',learnerProfile:{}}};
  const failing=structuredClone(sample);
  appContext.applyContentOperation(follow);assert.equal(sample.activePathId,selected,'Continue keeps the learner\'s selected path');assert.equal(sample.paths[0].entries.length,2,'the new chapter joins the request path');assert.equal(sample.paths[1].entries.length,1,'other paths are untouched');
  appContext.state.stories=[failing];const original=appContext.persistReaderStory;appContext.persistReaderStory=()=>{throw new Error('disk full');};assert.throws(()=>appContext.applyContentOperation({...follow,id:`op-fail-${selected}`}),/disk full/);appContext.persistReaderStory=original;assert.equal(failing.activePathId,selected,'a failed save restores the selection');assert.equal(failing.paths[0].entries.length,1,'a failed save adds no chapter');
  const rewrite=structuredClone(base);rewrite.activePathId='original';appContext.state.stories=[rewrite];appContext.applyContentOperation({...follow,id:`op-rw-${selected}`,kind:'rewrite',target:{...follow.target,entries:structuredClone(rewrite.paths[0].entries)}});assert.match(rewrite.activePathId,/^path-op-rw-/,'Rewrite navigation is unchanged');}
const sample=structuredClone(base);sample.chapters[0].help=[{id:'help',followUps:[]}];appContext.state.stories=[sample];const exampleOp={...create,id:'example-op',kind:'examples',result:{examples:[example,example,example]},input:{profile:{}},target:{storyId:sample.id,chapterId:sample.chapters[0].id,versionId:sample.chapters[0].versions[0].id,helpId:'help',start:0,end:5,passage:'Stadt'}};appContext.applyContentOperation(exampleOp);appContext.applyContentOperation(exampleOp);assert.equal(sample.chapters[0].help[0].followUps.length,1);
tested('GEN-004');
// The actual Python fixtures pass the same production validators as live results.
const fixtures=JSON.parse(execFileSync('python3',['-c',`import json
from dev_server import Handler
print(json.dumps([dict(language=l,length=n,content=json.loads(Handler.mock_story(json.dumps({'languageCode':l,'storyLength':n})))) for l in ['de','ja','ru','es-CL'] for n in ['short','medium','long']]))`],{encoding:'utf8'}));
for (const fixture of fixtures) validateStory(fixture.content,fixture.language,fixture.length);
for (const fixture of fixtures) {
  const notes=JSON.parse(execFileSync('python3',['-c',`import json,sys
from dev_server import Handler
print(Handler.mock_notes(json.load(sys.stdin)))`],{encoding:'utf8',input:JSON.stringify({languageCode:fixture.language,chapter:fixture.content})}));
  const supported=validateNotes(notes,fixture.content,fixture.language);
  assert.ok(supported.glossary.length>fixture.content.glossary.length,'Broad fixture should add useful note opportunities');
  assert.equal(supported.story,fixture.content.story);
}

const japaneseFixture=fixtures.find(f=>f.language==='ja');const fixturePlan=readingPlan(japaneseFixture.content);
const fixtureReadings=JSON.parse(execFileSync('python3',['-c',`import json,sys
from pathlib import Path
from types import SimpleNamespace
from dev_server import Handler
print(Handler.mock_readings(SimpleNamespace(server=SimpleNamespace(workspace=Path('.'))),json.load(sys.stdin)))`],{encoding:'utf8',input:JSON.stringify({spans:fixturePlan.spans})}));
attachReadings(japaneseFixture.content,fixturePlan,fixtureReadings);
// UI recovery must work for a fresh Create operation with no reader status.
const boxes=new Map();const box=id=>{if(!boxes.has(id)){const b=element('section');b.hidden=true;b.dataset={};boxes.set(id,b);}return boxes.get(id);};
const recovery={failureInfo,recoverySummary,appendFailureDetails(){},PROMPT_VERSION:'test',SAFEGUARD_VERSION:'test',pipeline:{records:[{kind:'create',stage:'readings'}],busy:true},readerGeneration:null,state:{readerId:null},$:box,document:{createElement:element},renderReaderGeneration(){},resumeCheckpoint(){},setScopeDisabled(){}};
vm.createContext(recovery);vm.runInContext(source.slice(source.indexOf('function applyGenerationLocks('),source.indexOf('async function resumeCheckpoint(')),recovery);recovery.renderCheckpointRecovery();
assert.equal(box('generation-status').textContent,'Adding kanji readings…');assert.equal(box('checkpoint-recovery-reader').hidden,true);
recovery.pipeline.records[0]={kind:'continue',stage:'notes',target:{storyId:'story'}};recovery.state.readerId='story';recovery.readerGeneration={storyId:'story',phase:'ready'};
recovery.renderCheckpointRecovery();assert.equal(box('reader-edit-submit').disabled,true);assert.equal(box('reader-prompt').disabled,true);assert.equal(recovery.readerGeneration.phase,'working');assert.equal(recovery.readerGeneration.message,'Adding vocabulary notes…');
const heading={};recovery.state.activeChapterRequest={storyId:'story',loading:{querySelector:()=>heading}};recovery.renderCheckpointRecovery();assert.equal(heading.textContent,'Adding vocabulary notes…');assert.equal(box('checkpoint-recovery-reader').hidden,true);delete recovery.state.activeChapterRequest;

recovery.pipeline.records[0]={kind:'create',stage:'notes',promptVersion:'test',safeguardVersion:'test'};

recovery.pipeline.busy=false;
recovery.pipeline.records[0].error='The AI included a vocabulary note for a word or phrase that does not appear in the chapter. Explicitly retry or discard this request.';
recovery.renderCheckpointRecovery();
assert.equal(box('checkpoint-recovery-create').children.at(-1).children[0].textContent,'Retry');
assert.ok(box('checkpoint-recovery-create').children[0].textContent.includes('Story generation stopped during vocabulary notes'));
assert.ok(!box('checkpoint-recovery-create').textContent.includes('Explicitly retry'));
// An unchanged panel is not rebuilt: focus survives and an existing alert is not announced again.
const renderedActions=box('checkpoint-recovery-create').children.at(-1);recovery.renderCheckpointRecovery();assert.equal(box('checkpoint-recovery-create').children.at(-1),renderedActions,'unchanged recovery panel was rebuilt');
recovery.pipeline.records[0].stage='ready';recovery.renderCheckpointRecovery();
assert.equal(box('checkpoint-recovery-create').children.at(-1).children[0].textContent,'Save response');
recovery.pipeline.records[0].promptVersion='old';recovery.renderCheckpointRecovery();
assert.equal(box('checkpoint-recovery-create').children.at(-1).children[0].disabled,true);
assert.match(box('checkpoint-recovery-create').children[0].textContent,/older app definition/);
assert.equal(box('generate').disabled,true);
assert.equal(JSON.parse(fs.readFileSync(new URL('../data/language-safeguards.json',import.meta.url))).version,SAFEGUARD_VERSION);
console.log('PASS current language requirements and staged generation regressions');
