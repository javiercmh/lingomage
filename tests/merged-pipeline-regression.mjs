import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPipeline} from '../js/generation-pipeline.js';
import {readingPlan, validateProse} from '../js/learning-validation.js';
const app=fs.readFileSync('js/app.js','utf8');
const prose={title:'今日',story:'今日は町へ行きます。町へ行きます。',glossary:[{word:'町',meaning:'town',forms:['町']}]};
const plan={vocabulary:[{word:'町',meaning:'town'}],grammar:[],guidance:'Clear references.'};
function harness({phase,language='ja',kind='create'}={}) {
  const events=[],titles=[];let durable=[],cancelClick;const button={addEventListener(name,fn){cancelClick=fn;}};
  let pipeline;const context={pipeline:null,$:()=>button,toast(message){throw Error(message);}};
  vm.createContext(context);vm.runInContext(app.slice(app.indexOf("$('cancel-generation').addEventListener"),app.indexOf('function renderRecoveryPanel(')),context);
  const click=async()=>{if(kind==='create') await cancelClick();else await pipeline.cancel();};
  const ai={
    async start(args){const input=JSON.parse(args.input);events.push('start '+input.kind);titles.push(args.title);assert.ok(args.body&&Object.keys(args).every(key=>['providerId','model','reasoningEffort','instructions','input','title','body'].includes(key)));
      if((phase==='plan-start'&&input.kind==='language-plan')||(phase==='prose-start'&&input.kind===kind)||(phase==='notes-start'&&input.kind==='notes')||(phase==='readings-start'&&input.kind==='readings'))await click();
      if(input.kind===kind)assert.deepEqual(input.languagePlan,plan);
      return input.kind;
    },
    async wait(id){events.push('wait '+id);return JSON.stringify(id==='language-plan'?plan:id===kind?prose:id==='notes'?{glossary:prose.glossary}:{readings:readingPlan(prose).spans.map(s=>({id:s.id,reading:'まち'}))});},
    async acknowledge(id){events.push('ack '+id);if(durable[0]?.request?.invalid)return;if(id==='language-plan'){assert.deepEqual(durable[0].plan,plan);if(phase==='plan-ack')await click();}if(id===kind)assert.deepEqual(durable[0].prose,validateProse(prose,language));if(id==='notes')assert.deepEqual(durable[0].prose,prose);},
    async cancel(id){events.push('cancel '+id);}
  };
  pipeline=createPipeline({records:[],persist(records){durable=structuredClone(records);},ai,apply(op){events.push('apply');assert.equal(op.result.story,prose.story);if(language==='ja')assert.equal(op.result.storySegments.map(p=>p.text).join(''),prose.story);}});
  context.pipeline=pipeline;
  const op=pipeline.create({planned:true,kind,language,input:{difficulty:'N5',scope:'scene',topic:'Captured'},config:{providerId:'mock',model:'mock'},instructions:'Story instructions',promptVersion:'fixture'});
  return {pipeline,op,events,titles,get durable(){return durable;}};
}
const complete=harness();await complete.pipeline.run(complete.op);
assert.deepEqual(complete.events,['start language-plan','wait language-plan','ack language-plan','start create','wait create','ack create','start notes','wait notes','ack notes','start readings','wait readings','ack readings','apply']);
assert.deepEqual(complete.titles,['Planning your story','Writing your story','Writing study notes','Adding readings']);
for(const kind of ['create','continue','rewrite']) for(const phase of ['plan-start','plan-ack','prose-start','notes-start','readings-start']) {
  const h=harness({phase,kind});await assert.rejects(h.pipeline.run(h.op),/cancelled/);
  assert.ok(!h.events.includes('apply'));
  if(phase==='plan-start')assert.ok(!h.events.includes('wait language-plan'));
  if(['plan-ack','prose-start'].includes(phase))assert.ok(!h.events.includes('wait '+kind));
  if(phase==='notes-start')assert.ok(!h.events.includes('wait notes'));
  if(phase==='readings-start')assert.ok(!h.events.includes('wait readings'));
  if(phase!=='plan-start')assert.deepEqual(h.op.plan,plan);
  if(phase==='readings-start')assert.deepEqual(h.op.prose,prose);
}
// Reload after a persisted plan: frozen input is reused; planning is not repeated.
const h=harness({phase:'plan-ack'});await assert.rejects(h.pipeline.run(h.op),/cancelled/);
let calls=[];const records=structuredClone(h.durable);
const resumed=createPipeline({records,persist(){},ai:{start:async args=>{calls.push(JSON.parse(args.input));return 'writer';},wait:async()=>JSON.stringify(calls.at(-1).kind==='notes'?{glossary:[{word:'Stadt',meaning:'town',forms:['Stadt']}]}:{title:'Stadt',story:'Stadt'}),acknowledge:async()=>{}},apply(op){assert.equal(op.input.topic,'Captured');assert.deepEqual(op.plan,plan);}});
records[0].language='de';await resumed.run(records[0]);assert.equal(calls.length,2);assert.equal(calls[0].kind,'create');assert.deepEqual(calls[0].languagePlan,plan);
console.log('PASS merged plan/prose/readings ordering, durable reuse, actual Create cancel handler, and pending-stage/handoff cancellation across story kinds');
let copyAction,copied;
const copyContext={readerStory:()=>({}),activeChapter:()=>({}),activeVersion:()=>({story:'買います。',storySegments:[{text:'買',reading:'か'},{text:'います。'}]}),$:()=>({addEventListener(name,fn){copyAction=fn;}}),navigator:{clipboard:{async writeText(value){copied=value;}}},toast(){}};
vm.createContext(copyContext);vm.runInContext(app.slice(app.indexOf("$('reader-copy').addEventListener"),app.indexOf('// Android\'s own selection menu')),copyContext);await copyAction();assert.equal(copied,'買います。');
console.log('PASS actual chapter-copy handler sends canonical text without title or furigana');
