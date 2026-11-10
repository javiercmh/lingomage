import assert from 'node:assert/strict';
import {createPipeline} from '../js/generation-pipeline.js';
import {recoverySummary} from '../js/generation-errors.js';
import {validCheckpoints} from '../js/workspace-storage.js';

const deferred = () => { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve=>setImmediate(resolve));
const missing = () => Object.assign(new Error('Request not found.'),{code:'not_found'});
const prose={title:'Markt',story:'Anna geht zum Markt.'};
const spec={kind:'create',language:'de',input:{topic:'market'},config:{},instructions:'fixture'};

function harness({pendingStart=false,failCancel=false,failRemove=false,failRelease=false}={}) {
  const started=deferred(), response=deferred(), events=[];
  let durable=[], failure=failCancel, removeFailure=failRemove, releaseFailure=failRelease;
  const io={records:[],persist(records){
    if (!records.length && removeFailure) throw Object.assign(new Error('Disk write failed'),{code:'write_failed'});
    durable=structuredClone(records);
  },ai:{
    async start(){events.push('start'); return pendingStart ? started.promise : 'request';},
    async wait(){events.push('wait'); return response.promise;},
    async cancel(){events.push('cancel'); if(failure)throw Object.assign(new Error('Cannot reach host'),{code:'network'});},
    async acknowledge(){events.push('ack');if(releaseFailure)throw Object.assign(new Error('Cannot release'),{code:'network'});throw missing();}
  },apply(){events.push('apply');}};
  const pipeline=createPipeline(io),op=pipeline.create(spec);
  return {pipeline,op,io,events,started,response,get durable(){return durable;},repair(){failure=false;removeFailure=false;releaseFailure=false;}};
}

// Cancel while start is outstanding: the returned ID is cancelled without polling or applying.
{
  const h=harness({pendingStart:true}),run=h.pipeline.run(h.op);
  await tick();await h.pipeline.cancel();await h.pipeline.cancel();
  assert.equal(h.pipeline.busy,true);assert.equal(h.durable[0].discardRequested,true);
  h.started.resolve('late-request');await assert.rejects(run,{code:'generation_cancelled'});
  assert.deepEqual(h.events,['start','cancel','ack']);assert.deepEqual(h.durable,[]);
}
// Both a missing request and a late successful response after Cancel are intentional cancellation.
for(const late of ['missing','response']) {
  const h=harness(),run=h.pipeline.run(h.op);await tick();
  await h.pipeline.cancel();
  if(late==='missing')h.response.reject(missing());else h.response.resolve(JSON.stringify(prose));
  await assert.rejects(run,{code:'generation_cancelled'});
  assert.deepEqual(h.durable,[]);assert.ok(!h.events.includes('apply'));assert.equal(h.pipeline.busy,false);
  assert.doesNotThrow(()=>h.pipeline.create(spec));
}
// Real cleanup failures retain discard intent and permit cleanup-only retry, including after reload.
for(const failure of ['failCancel','failRemove','failRelease']) {
  const h=harness({[failure]:true}),run=h.pipeline.run(h.op);await tick();
  const rejected=assert.rejects(run);
  try { await h.pipeline.cancel(); } catch {}
  await rejected;assert.equal(h.pipeline.busy,false);assert.equal(h.pipeline.records.length,1);
  assert.equal(h.durable[0].discardRequested,true);assert.equal(validCheckpoints(h.durable),true);
  assert.equal(h.op.failure.category,failure==='failRemove'?'storage':'release');
  const message={failCancel:"Couldn't stop the AI request. Try again.",failRemove:"Couldn't remove saved progress. Try again.",failRelease:"Couldn't clear the finished AI request. Try again."}[failure];
  assert.equal(recoverySummary(h.op),message);
  assert.equal(h.events.filter(e=>e==='cancel').length,1,'failed cancellation is not silently retried');
  const records=structuredClone(h.durable);assert.equal(recoverySummary(records[0]),message,'reload retains the specific failure wording');h.repair();
  const restored=createPipeline({...h.io,records});await restored.discard(records[0]);
  assert.equal(restored.records.length,0);assert.deepEqual(h.durable,[]);
  assert.equal(h.events.filter(e=>e==='start').length,1,'cleanup never starts inference');
}
// Without in-app intent, missing and host-cancelled requests stay resumable and correctly classified.
for(const code of ['not_found','session_cancelled']) {
  const h=harness(),run=h.pipeline.run(h.op);await tick();
  h.response.reject(Object.assign(new Error(code==='not_found'?'Request not found.':'Background work was cancelled.'),{code}));
  await assert.rejects(run,{code});
  assert.equal(h.durable.length,1);assert.ok(!h.durable[0].discardRequested);
  assert.equal(h.op.failure.phase,'wait');assert.equal(h.op.failure.category,code==='not_found'?'unavailable':'cancelled');
}
// Cancellation during final persistence never rolls back already saved content.
{
  const applied=deferred(),release=deferred(),events=[];let p;
  p=createPipeline({records:[],persist(){},ai:{},async apply(){events.push('saved');applied.resolve();await release.promise;}});
  const op=p.create(spec);op.stage='ready';op.result=prose;
  const run=p.run(op);await applied.promise;await p.cancel();release.resolve();await run;
  assert.deepEqual(events,['saved']);assert.equal(p.records.length,0);
}
console.log('PASS generation cancellation: pending starts, missing requests, late responses, repeated Cancel, cleanup failures/reload, explicit cleanup-only retry, external interruption and saved final content');
