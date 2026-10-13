import assert from 'node:assert/strict';
import {createPipeline} from '../js/generation-pipeline.js';
import {validateProse,validateNotes,NOTES_INSTRUCTIONS} from '../js/learning-validation.js';
const prose={title:'Am Bahnhof',story:'Mia kauft Brot. Mia geht zum Bahnhof.'};
const glossary=[{word:'kaufen',meaning:'buy; kauft is singular present',forms:['kauft']},{word:'Brot',meaning:'bread',forms:['Brot']},{word:'Bahnhof',meaning:'railway station',forms:['Bahnhof']}];
assert.deepEqual(validateProse({...prose,glossary:[{forms:['absent']}]},'de'),prose);
assert.throws(()=>validateNotes({glossary,story:'rewritten'},prose,'de'),/without rewriting/);
assert.throws(()=>validateNotes({glossary:[{...glossary[0],forms:['kauft','kaufen']}]},prose,'de'),/does not appear/);
assert.throws(()=>validateNotes({glossary:[]},prose,'de'),/1–100/);
assert.throws(()=>validateNotes({glossary:[{word:'дом',meaning:'home',forms:['Latin']}]},{title:'Дом',story:'Дом'},'ru'),/target script/);
for(const term of ['including common words','Skip routine proper names','Group alternate forms','not a list of dictionary senses','do not assume words are known'])assert.ok(NOTES_INSTRUCTIONS.includes(term));
function harness(fail='') {
  const events=[];let durable=[],pipeline,currentKind,invalid=fail==='invalid',stop=fail==='cancel',ackFail=fail==='ack',saveFail=fail==='save';
  const io={records:[],persist(records){if(saveFail&&records[0]?.stage==='ready'){saveFail=false;throw Error('notes disk');}durable=structuredClone(records);},ai:{
    async start(args){currentKind=JSON.parse(args.input).kind;events.push(currentKind);if(currentKind==='notes'){assert.deepEqual(JSON.parse(args.input).chapter,prose);if(stop)await pipeline.cancel();}return currentKind;},
    async wait(id){if(id==='language-plan')return JSON.stringify({vocabulary:[],grammar:[],guidance:'Natural prose.'});if(id==='notes')return JSON.stringify({glossary:invalid?[{word:'Haus',meaning:'house',forms:['Haus']}]:glossary});return JSON.stringify(prose);},
    async acknowledge(id){const op=durable[0];assert.ok(op.request.completed);if(id==='create')assert.deepEqual(op.prose,prose);if(id==='notes'&&!op.request.invalid){assert.deepEqual(op.prose.story,prose.story);if(ackFail){ackFail=false;throw Error('notes release');}}},async cancel(id){events.push('cancel '+id);}
  },apply(op){assert.equal(op.result.story,prose.story);assert.deepEqual(op.result.glossary,glossary);events.push('apply');}};
  pipeline=createPipeline(io);const op=pipeline.create({planned:true,kind:'create',language:'de',input:{difficulty:'A1',practice:''},instructions:'prose only',config:{model:'fixture'}});
  return {pipeline,op,events,io,get durable(){return durable;},repair(){invalid=false;stop=false;}};
}
let h=harness('invalid');await assert.rejects(h.pipeline.run(h.op),/does not appear/);assert.equal(h.op.stage,'notes');assert.deepEqual(h.durable[0].prose,prose);assert.ok(!h.events.includes('apply'));
h.repair();const records=structuredClone(h.durable);const reloaded=createPipeline({...h.io,records});await reloaded.run(records[0]);assert.deepEqual(h.events,['language-plan','create','notes','notes','apply']);
for(const failure of ['ack','save']){h=harness(failure);await assert.rejects(h.pipeline.run(h.op),failure==='ack'?/notes release/:/notes disk/);await h.pipeline.run(h.op);assert.deepEqual(h.events,['language-plan','create','notes','apply']);}
h=harness('cancel');await assert.rejects(h.pipeline.run(h.op),/cancelled/);assert.equal(h.op.stage,'notes');assert.deepEqual(h.op.prose,prose);h.repair();await h.pipeline.run(h.op);assert.deepEqual(h.events,['language-plan','create','notes','cancel notes','notes','apply']);
// Examples still use only prose; the story-note stage is not applicable.
let stages=[];const examples={examples:Array(3).fill({sentence:'Brot',translation:'Bread',highlightStart:0,highlightEnd:4})};
const pipeline=createPipeline({records:[],persist(){},ai:{start:async args=>{stages.push(JSON.parse(args.input).kind);return 'examples';},wait:async()=>JSON.stringify(examples),acknowledge:async()=>{}},apply(){}});
await pipeline.run(pipeline.create({kind:'examples',language:'de',input:{},instructions:'examples',config:{}}));assert.deepEqual(stages,['examples']);
console.log('PASS fixed prose, broad-note prompt, exact forms, note-only reload/retry, cancellation, durable save/release recovery and examples bypass');
