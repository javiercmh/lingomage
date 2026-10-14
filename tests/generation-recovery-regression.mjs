import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPipeline} from '../js/generation-pipeline.js';
import {failureInfo,recoverySummary} from '../js/generation-errors.js';
const prose={title:'Brot',story:'Mia kauft Brot.'};
const notes={glossary:[{word:'Brot',meaning:'bread',forms:['Brot']}]};
const examples={examples:Array.from({length:3},()=>({sentence:'Brot',translation:'Bread',highlightStart:0,highlightEnd:4}))};
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
const context={state:{readerEditDraft:null},PROMPT_VERSION:'test',SAFEGUARD_VERSION:'test',pipeline:{records:[op],busy:false,async run(){runs++;this.busy=true;await new Promise(r=>resolve=r);this.records=[];this.busy=false;}},readerGeneration:null,showOperationResult(){results++;},toast(){},renderCheckpointRecovery(){},revealRecovery(){},failureInfo};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function resumeCheckpoint('),source.indexOf('function revealRecovery(')),context);
const retry=context.resumeCheckpoint(op);assert.equal(runs,1);await context.resumeCheckpoint(op);assert.equal(runs,1);resolve();await retry;assert.equal(results,1);await context.resumeCheckpoint(op);assert.equal(runs,1);
assert.match(recoverySummary({kind:'create',stage:'notes',prose,error:'service',failure:failureInfo(Object.assign(Error('Service failed'),{code:'service'}),'notes')}),/vocabulary notes.*Completed prose is preserved/);
assert.equal(failureInfo(Error('Cannot set properties of null'),'prose').category,'internal');
assert.equal(failureInfo(Error('Release failed'),'ready','release').category,'release');
assert.ok(!failureInfo(Error('https://example.test/callback?token=secret Bearer secret api_key=secret request_id=abc'),'prose').message.includes('secret'));
console.log('PASS all content kinds: inference/validation/save/release failures, explicit recovery, release-only no inference, stale/double Retry, Create null draft and bounded redacted diagnostics');
