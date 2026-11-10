import assert from 'node:assert/strict';
import {createPipeline, pendingRequests} from '../js/generation-pipeline.js';
import {progressSteps, progressSummary} from '../js/generation-progress.js';
import {readingPlan, validateProse} from '../js/learning-validation.js';
// Japanese notes and readings run together, each checkpointed and released on its own.
const prose={title:'今日',story:'今日は町へ行きます。',glossary:[{word:'町',meaning:'town',forms:['町']}]};
const plan={vocabulary:[],grammar:[],guidance:'Clear.'};
function harness({failReadings=false,cancelAt=''}={}) {
  const events=[];let durable=[],inFlight=0,peak=0,n=0;const kinds=new Map();let pipeline;
  const ai={
    async start(args){const kind=JSON.parse(args.input).kind,id=kind+(++n);kinds.set(id,kind);events.push('start '+kind);if(cancelAt===kind)await pipeline.cancel();return id;},
    async wait(id){const kind=kinds.get(id);inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,kind==='notes'?15:5));inFlight--;
      if(failReadings&&kind==='readings')throw Object.assign(new Error('Service failed'),{code:'service'});
      return JSON.stringify(kind==='language-plan'?plan:kind==='create'?{title:prose.title,story:prose.story}:kind==='notes'?{glossary:prose.glossary}:{readings:readingPlan(prose).spans.map(s=>({id:s.id,reading:'まち'}))});},
    async acknowledge(id){events.push('ack '+kinds.get(id));},async cancel(id){events.push('cancel '+kinds.get(id));}
  };
  pipeline=createPipeline({records:[],persist(r){durable=structuredClone(r);},ai,parallel:true,apply(op){events.push('apply');assert.equal(op.result.story,prose.story);assert.equal(op.result.glossary.length,1);assert.equal(op.result.storySegments.map(p=>p.text).join(''),prose.story);}});
  const op=pipeline.create({planned:true,kind:'create',language:'ja',input:{difficulty:'N5',scope:'scene',topic:'t'},config:{providerId:'m',model:'m'},instructions:'x',promptVersion:'t'});
  return {pipeline,op,events,get durable(){return durable;},get peak(){return peak;}};
}
let h=harness();await h.pipeline.run(h.op);
assert.equal(h.peak,2,'notes and readings are in flight together');
assert.equal(h.events.filter(e=>e.startsWith('start')).length,4);
assert.ok(h.events.indexOf('start notes')<h.events.indexOf('ack readings')&&h.events.indexOf('start readings')<h.events.indexOf('ack notes'));
assert.equal(h.events.at(-1),'apply');assert.equal(h.pipeline.records.length,0);
// A failed part keeps the finished one; resume runs only the failed part.
h=harness({failReadings:true});await assert.rejects(h.pipeline.run(h.op),/Service failed/);
assert.equal(h.op.stage,'enrich');assert.ok(h.op.parallel.notes.done&&!h.op.parallel.readings.done);assert.deepEqual(pendingRequests(h.op),[]);
assert.equal(progressSummary(h.op).text,'Step 4 of 4 · Kanji readings');
const before=h.events.filter(e=>e.startsWith('start')).length;
h.pipeline.records[0].parallel.readings.request=null;
const ok=createPipeline({records:h.pipeline.records,persist(){},parallel:true,ai:{start:async()=>'r',wait:async()=>JSON.stringify({readings:readingPlan(prose).spans.map(s=>({id:s.id,reading:'まち'}))}),acknowledge:async()=>{},cancel:async()=>{}},apply(op){assert.equal(op.result.glossary.length,1);}});
await ok.run(h.op);assert.equal(ok.records.length,0);assert.equal(before,4);
// Cancel stops both requests and leaves a resumable record.
h=harness({cancelAt:'readings'});await assert.rejects(h.pipeline.run(h.op),/cancelled/);
assert.ok(!h.events.includes('apply'));assert.equal(h.op.stage,'enrich');
// Progress presentation.
const steps=progressSteps({kind:'create',language:'ja',stage:'enrich',parallel:{notes:{done:true},readings:{done:false}}});
assert.deepEqual(steps.map(s=>s.state),['done','done','done','active']);
assert.deepEqual(progressSteps({kind:'create',language:'ja',stage:'enrich',parallel:{notes:{done:false},readings:{done:false}}}).map(s=>s.state),['done','done','active','active']);
assert.deepEqual(progressSteps({kind:'continue',language:'de',stage:'prose'}).map(s=>s.state),['done','done','active','pending']);
assert.deepEqual(progressSteps({kind:'continue',language:'de',stage:'context'}).map(s=>[s.key,s.state]),[['context','active'],['plan','pending'],['prose','pending'],['notes','pending']],'Continue shows story memory as its first step');
assert.equal(progressSummary({kind:'continue',language:'de',stage:'context'}).text,'Step 1 of 4 · Story context');
assert.deepEqual(progressSteps({kind:'rewrite',language:'de',stage:'plan',target:{index:0}}).map(s=>s.key),['plan','prose','notes'],'rewriting chapter 1 has no earlier chapters to summarize');
assert.deepEqual(progressSteps({kind:'rewrite',language:'de',stage:'plan',target:{index:2}}).map(s=>[s.key,s.state]).slice(0,2),[['context','done'],['plan','active']]);
assert.equal(progressSummary({kind:'examples',language:'de',stage:'prose'}).text,'Writing examples');
console.log('PASS parallel Japanese enrichment: concurrency, partial failure reuse, cancellation and progress steps');
// A host with a one-request cap refuses the second start before inference; the part runs after the first.
{
  let active=0,n=0;const kinds=new Map(),order=[];
  const ai={async start(args){const kind=JSON.parse(args.input).kind;if(active)throw Object.assign(new Error('A request is already running'),{code:'request_in_progress'});active++;const id=kind+(++n);kinds.set(id,kind);order.push('start '+kind);return id;},
    async wait(id){await new Promise(r=>setTimeout(r,5));const kind=kinds.get(id);return JSON.stringify(kind==='language-plan'?plan:kind==='create'?{title:prose.title,story:prose.story}:kind==='notes'?{glossary:prose.glossary}:{readings:readingPlan(prose).spans.map(s=>({id:s.id,reading:'まち'}))});},
    async acknowledge(){active--;},async cancel(){}};
  let applied=0;const p=createPipeline({records:[],persist(){},ai,parallel:true,apply(){applied++;}});
  const op=p.create({planned:true,kind:'create',language:'ja',input:{},config:{providerId:'m',model:'m'},instructions:'x',promptVersion:'t'});
  await p.run(op);assert.equal(applied,1);assert.equal(order.length,4,'each stage started exactly once');
  console.log('PASS parallel enrichment falls back to one-at-a-time on a single-request host');
}
