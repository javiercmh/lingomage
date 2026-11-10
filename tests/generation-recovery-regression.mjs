import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPipeline,pendingRequests} from '../js/generation-pipeline.js';
import {failureInfo,recoverySummary,operationLabel} from '../js/generation-errors.js';
import {createAiSession} from '../js/ai-session.js';
const prose={title:'Brot',story:'Mia kauft Brot.'};
const notes={glossary:[{word:'Brot',meaning:'bread',forms:['Brot']}]};
const examples={examples:Array.from({length:3},()=>({sentence:'Brot',translation:'Bread',highlightStart:0,highlightEnd:4}))};
// Labels identify the saved destination, including continuation from an earlier viewed chapter.
const paths=[{id:'original',name:'Original',entries:[{chapterId:'c1',versionId:'v1'},{chapterId:'c2',versionId:'v2'}]}, {id:'alt',name:'Alternate 1',entries:[{chapterId:'c1',versionId:'v1'},{chapterId:'c3',versionId:'v3'}]}];
const labelStories=[{id:'story',title:'Der Markt',paths,chapters:[{id:'c1'},{id:'c2'},{id:'c3'}]}];
const target={storyId:'story',pathId:'alt',entries:paths[1].entries,index:0};
assert.equal(operationLabel({kind:'continue',target},labelStories),'Continuing “Der Markt” · Chapter 3 · Branch 1');
assert.equal(operationLabel({kind:'rewrite',target:{...target,index:1}},labelStories),'Rewriting “Der Markt” · Chapter 2 · Branch 1');
assert.equal(operationLabel({kind:'examples',target:{storyId:'story',chapterId:'c3',versionId:'v3'}},labelStories),'Examples for “Der Markt” · Chapter 2 · Branch 1');
assert.equal(operationLabel({kind:'create',language:'es-CL',input:{difficulty:'A1'}},[],'Spanish'),'New Spanish story · A1');
assert.equal(operationLabel({kind:'continue',target},[]),'Continuing a saved story · Chapter 3');
assert.equal(operationLabel({kind:'rewrite',target:{storyId:'missing'}},[]),'Rewriting a saved story');
for (const kind of ['create','continue','rewrite','examples']) {
  for (const failure of ['start','wait','invalid','save','release']) {
    let failing=true,starts=0,applied=0,durable=[],stage='';
    const pipeline=createPipeline({records:[],persist(records){if(failure==='save' && failing && records[0]?.stage==='ready'){failing=false;throw Error('Could not save content');}durable=structuredClone(records);},ai:{
      async start(args){starts++;stage=JSON.parse(args.input).kind;if(failure==='start'&&failing){failing=false;throw Object.assign(Error('Service failed'),{code:'service'});}return 'fixture';},
      async wait(){if(failure==='wait'&&failing){failing=false;throw Object.assign(Error('Service failed'),{code:'service'});}if(failure==='invalid'&&failing){failing=false;return '{}';}return JSON.stringify(stage==='notes'?notes:kind==='examples'?examples:prose);},
      async acknowledge(){if(failure==='release'&&failing){failing=false;throw Error('Release failed');}},async cancel(){}
    },apply(){applied++;}});
    const op=pipeline.create({kind,language:'de',input:{},config:{},instructions:'fixture'});
    await assert.rejects(pipeline.run(op));assert.equal(pipeline.busy,false);assert.equal(applied,0);assert.ok(op.failure);assert.equal(durable[0].error,op.error);
    const before=starts;
    if(failure==='release') {await pipeline.finishRequest(op);assert.equal(starts,before);assert.equal(op.request,null);}
    await pipeline.run(op);assert.equal(applied,1);assert.equal(pipeline.records.length,0);
    if(failure==='save') assert.equal(starts,before);
    if(['wait','start'].includes(failure)) assert.equal(op.failure,undefined);
    await assert.rejects(pipeline.run(op),/no longer pending/);
    await pipeline.discard(op);assert.equal(pipeline.records.length,0);
  }
}
const source=fs.readFileSync('js/app.js','utf8');
const op={kind:'create',stage:'prose',promptVersion:'test',safeguardVersion:'test',error:'service'};
let runs=0,results=0,resolve;
const aiSession=createAiSession({ai:{}});
const context={backgroundRun:null,aiSession,pendingRequests,state:{readerEditDraft:null},PROMPT_VERSION:'test',SAFEGUARD_VERSION:'test',pipeline:{records:[op],busy:false,async run(){runs++;this.busy=true;await new Promise(r=>resolve=r);this.records=[];this.busy=false;}},readerGeneration:null,setReaderGeneration(value){context.readerGeneration=value;},showOperationResult(){results++;},toast(){},renderCheckpointRecovery(){},revealRecovery(){},failureInfo};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function resumeCheckpoint('),source.indexOf('function revealRecovery(')),context);
const retry=context.resumeCheckpoint(op);assert.equal(runs,1);await context.resumeCheckpoint(op);assert.equal(runs,1);resolve();await retry;assert.equal(results,1);await context.resumeCheckpoint(op);assert.equal(runs,1);
assert.match(recoverySummary({kind:'create',stage:'notes',prose,error:'service',failure:failureInfo(Object.assign(Error('Service failed'),{code:'service'}),'notes')}),/vocabulary notes.*Completed prose is preserved/);
assert.equal(failureInfo(Error('Cannot set properties of null'),'prose').category,'internal');
assert.equal(failureInfo(Error('Release failed'),'ready','release').category,'release');
assert.ok(!failureInfo(Error('https://example.test/callback?token=secret Bearer secret api_key=secret request_id=abc'),'prose').message.includes('secret'));
assert.ok(!failureInfo(Error('session_id=secret sessionId: secret'),'prose').message.includes('secret'),'session ids are redacted like request and account ids');
// Resume obeys the same status rules: only explicit in-app cancellation clears it; external interruptions point to recovery, Create has no story id.
for (const [message, kind, expected] of [['Request cancelled. Resume to explicitly retry, or discard this attempt.','continue','error'],['Service failed','continue','error'],['Request cancelled.','create','error'],['Service failed','create','error'],['Generation cancelled.','create',null]]) {
  const failing={kind,stage:'prose',promptVersion:'test',safeguardVersion:'test',error:'',target:kind==='create'?undefined:{storyId:'story'}};
  const ctx={backgroundRun:null,aiSession,pendingRequests,state:{readerEditDraft:null},PROMPT_VERSION:'test',SAFEGUARD_VERSION:'test',pipeline:{records:[failing],busy:false,async run(){throw Object.assign(new Error(message),message==='Generation cancelled.'?{code:'generation_cancelled'}:{});}},readerGeneration:null,setReaderGeneration(value){ctx.readerGeneration=value;},showOperationResult(){},toast(){},renderCheckpointRecovery(){},revealRecovery(){},failureInfo};
  vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function resumeCheckpoint('),source.indexOf('function revealRecovery(')),ctx);
  await ctx.resumeCheckpoint(failing);
  assert.equal(ctx.readerGeneration?.phase ?? null,expected,`${kind} resume failure "${message}"`);
}
console.log('PASS all content kinds: inference/validation/save/release failures, explicit recovery, release-only no inference, stale/double Retry, Create null draft and bounded redacted diagnostics');
