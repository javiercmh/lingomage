const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/story-generation.js', 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync('js/reader-text.js','utf8').replaceAll('export ', ''), c); vm.runInContext(source, c);
const valid = JSON.stringify({ vocabulary: [{word:'Markt',meaning:'market'}], grammar: [], guidance: 'Clear context.' });
assert.equal(c.decodePlan(valid).vocabulary.length, 1);
assert.throws(()=>c.decodePlan(valid,'ru'),/script/);
assert.throws(()=>c.decodePlan(valid,'ja'),/script/);
assert.equal(c.decodePlan(JSON.stringify({vocabulary:[],grammar:[],guidance:''})).grammar.length,0);
assert.throws(() => c.decodePlan('{}'));
assert.throws(() => c.decodePlan(JSON.stringify({vocabulary:Array(6).fill({word:'a',meaning:'a'}),grammar:[],guidance:''})));
assert.throws(() => c.decodePlan(JSON.stringify({vocabulary:[],grammar:Array(3).fill({focus:'a',explanation:'a'}),guidance:''})));
const story={title:'A market',story:'A Markt. '+'word '.repeat(300),glossary:[{word:'Markt',meaning:'market',forms:['Markt']}]};
c.validateGlossary(story,'de');
assert.throws(()=>c.validateGlossary({...story,story:'Marktplatz.'},'de'));
assert.throws(()=>c.validateGlossary({...story,glossary:[{word:'Markt',meaning:'market',forms:['missing']}]},'de'));
c.validateGlossary({title:'公園',story:'公園へ行きます。',glossary:[{word:'行く',meaning:'go',forms:['行きます']}]},'ja');
assert.throws(()=>c.validateGlossary({title:'рынок',story:'Latin',glossary:[]},'ru'));
assert.throws(()=>c.validateGlossary({title:'рынок',story:'市場',glossary:[]},'ru'));
assert.throws(()=>c.validateGlossary({title:'рынок',story:'αβγ',glossary:[]},'ru'));
assert.throws(()=>c.validateGlossary({title:'рынок',story:'ры́нок',glossary:[]},'ru'));
assert.throws(()=>c.validateGlossary({...story,story:'_Markt_'},'de'));
assert.throws(()=>c.validateGlossary({title:'数字',story:'13',glossary:[{word:'三',meaning:'three',forms:['3']}]},'ja'));
assert.throws(()=>c.decodePlan(JSON.stringify({vocabulary:[{word:'市場',meaning:'market'}],grammar:[],guidance:''}),'ru'),/script/);
assert.throws(()=>c.decodePlan(JSON.stringify({vocabulary:[{word:'αβγ',meaning:'letters'}],grammar:[],guidance:''}),'ja'),/script/);
c.validateGlossary({title:'スーパー',story:'スーパーへ行きます。',glossary:[]},'ja');
const notes=['Brot','Markt','Fluss'].map(word=>({word,meaning:'fixture note',forms:[word]}));
const shortText='Mia kauft Brot. Mia sieht den Markt. Mia geht zum Fluss. Brot liegt am Markt. Der Fluss ist sehr ruhig.';
const longText=shortText+' '+Array(10).fill('Sie geht weiter und sieht ihre Freundin dort.').join(' ');
const density=text=>{const matches=c.firstGlossaryMatches(text,notes);const tokens=[...text.matchAll(/\S+/g)];return {total:tokens.length,linked:tokens.filter(token=>matches.some(match=>token.index<match.end&&token.index+token[0].length>match.start)).length};};
assert.deepEqual(density(shortText),{total:20,linked:3});assert.deepEqual(density(longText),{total:100,linked:3});
console.log('PASS controlled underline density: same three glossary entries link 3/20 words (15%) versus 3/100 words (3%); only first occurrences are linked');
const appSource=fs.readFileSync('js/app.js','utf8');
vm.runInContext(appSource.slice(appSource.indexOf('function decodeResponse('), appSource.indexOf('async function cancelStoryJob(')),c);
assert.throws(()=>c.decodeResponse(JSON.stringify({title:'日本',story:'日本。',glossary:[],titleSegments:[{text:'日本'}],storySegments:[{text:'日本。'}]}),'ja'),/readings/);
const defs=JSON.parse(fs.readFileSync('data/learning-profiles.json'));
for(const lang of ['de','es-CL','ru']) assert.deepEqual(defs.standardizedLevels[lang].levels.map(x=>x.id),['A1','A2','B1','B2','C1','C2']);
assert.deepEqual(defs.standardizedLevels.ja.levels.map(x=>x.id),['N5','N4','N3','N2','N1']);
assert.equal(Object.keys(defs.scopes).length,3);
(async()=>{
  let events=[], failPersist=false, failAck=false, failWait=false, durable;
  const job={input:{difficulty:'A1',scope:'scene'}};
  const io={status(){}, persist(){events.push('persist');if(failPersist)throw Error('disk');durable=JSON.parse(JSON.stringify(job));}, async start(stage,input){events.push('start '+stage);if(stage==='write')assert.equal(input.languagePlan.vocabulary[0].word,'Markt');return stage;},async wait(id){events.push('wait '+id);if(failWait)throw Error('provider');return id==='plan'?valid:JSON.stringify(story);},async acknowledge(id){events.push('ack '+id);assert.ok(durable.plan);if(failAck)throw Error('release');}};
  const response=await c.runStoryJob(job,io);assert.equal(JSON.parse(response).story,story.story);
  assert.deepEqual(events.filter(x=>x!=='persist'),['start plan','wait plan','ack plan','start write','wait write']);
  assert.equal(durable.writeResponse,response);assert.ok(!events.includes('ack write'));
  events=[];await c.runStoryJob(JSON.parse(JSON.stringify(job)),io);assert.deepEqual(events,[]);
  const job2={input:{}};failPersist=true;await assert.rejects(c.runStoryJob(job2,io),/disk/);assert.equal(job2.planRequestId,'plan');failPersist=false;
  // A failed response checkpoint must not acknowledge or start writing.
  let checkpointFail=true;const job3={input:{}};let ackCount=0;
  const io3={...io,persist(){if(job3.planResponse&&checkpointFail)throw Error('disk');},acknowledge:async()=>{ackCount++;}};
  await assert.rejects(c.runStoryJob(job3,io3),/disk/);assert.equal(ackCount,0);assert.ok(!job3.writeRequestId);
  checkpointFail=false;await c.runStoryJob(job3,io3);assert.equal(ackCount,1);
  const job4={input:{}};let releaseFail=true, starts=[];
  const io4={...io,persist(){},start:async(stage)=>{starts.push(stage);return stage;},acknowledge:async()=>{if(releaseFail)throw Error('release');}};
  await assert.rejects(c.runStoryJob(job4,io4),/release/);assert.deepEqual(starts,['plan']);releaseFail=false;await c.runStoryJob(job4,io4);assert.deepEqual(starts,['plan','write']);
  const job5={input:{}};await assert.rejects(c.runStoryJob(job5,{...io,persist(){},wait:async()=>'{invalid'}));assert.ok(!job5.writeRequestId);
  const job6={input:{}};await assert.rejects(c.runStoryJob(job6,{...io,persist(){},wait:async()=>{throw Error('cancelled');}}),/cancelled/);assert.equal(job6.failedStage,'plan');assert.ok(!job6.writeRequestId);
  // Cancelling while a stage is starting or while plan acknowledgement is in
  // progress must not consume a writing inference.
  const cancelling=(job,id)=>{if(job.cancelRequested)throw Error('cancelled');};
  const transitionJob={input:{}};let transitionStarts=[];
  await assert.rejects(c.runStoryJob(transitionJob,{...io,persist(){},start:async stage=>{transitionStarts.push(stage);return stage;},acknowledge:async()=>{transitionJob.cancelRequested=true;},checkCancelled:id=>cancelling(transitionJob,id)}),/cancelled/);
  assert.deepEqual(transitionStarts,['plan']);
  const startingJob={input:{}};let startingWaits=0;
  await assert.rejects(c.runStoryJob(startingJob,{...io,persist(){},start:async stage=>{startingJob.cancelRequested=true;return stage;},wait:async()=>{startingWaits++;return valid;},checkCancelled:id=>cancelling(startingJob,id)}),/cancelled/);
  assert.equal(startingWaits,0);assert.equal(startingJob.planRequestId,'plan');
  const writerCancelJob={input:{}};let writingWaits=0;
  await assert.rejects(c.runStoryJob(writerCancelJob,{...io,persist(){},start:async stage=>{if(stage==='write')writerCancelJob.cancelRequested=true;return stage;},wait:async id=>{if(id==='write')writingWaits++;return valid;},acknowledge:async()=>{},checkCancelled:id=>cancelling(writerCancelJob,id)}),/cancelled/);
  assert.ok(writerCancelJob.plan);assert.equal(writingWaits,0);
  // Exercise production UI orchestration too, rather than only a fake io hook.
  for (const mode of ['create', 'continue', 'rewrite']) for (const phase of ['plan-start', 'plan-ack', 'writer-start']) {
    let starts=[], cancels=[], waits=[];
    const button={events:{},addEventListener(name,fn){this.events[name]=fn;},remove(){}};
    const panel={append(node){this.button=node;},querySelector:()=>({textContent:''})};
    const click=()=>mode==='create'?button.events.click():panel.button.events.click();
    const h={state:{models:[{id:'mock'}]},crypto:{randomUUID:()=> 'fixture-id'},PROFILE_DEFINITIONS:{version:'fixture'},PROMPT_VERSION:'fixture',persistSettings(){},$:()=>button,toast(message){throw Error(message);},document:{createElement:()=>button},ai:{
      start:async request=>{const kind=JSON.parse(request.input).kind;starts.push(kind);if((phase==='writer-start'&&kind===mode)||(phase==='plan-start'&&kind==='language-plan')) {assert.equal(h.state.requestId,null);await click();}return kind;},
      wait:async id=>{waits.push(id);return id==='language-plan'?valid:JSON.stringify(story);},
      cancel:async id=>{cancels.push(id);},
      acknowledge:async id=>{if(phase==='plan-ack'&&id==='language-plan')await click();}
    }};
    vm.createContext(h);vm.runInContext(fs.readFileSync('js/reader-text.js','utf8').replaceAll('export ', '')+source+appSource.slice(appSource.indexOf('async function cancelStoryJob('),appSource.indexOf('function generationProvenance('))+appSource.slice(appSource.indexOf('async function plannedStory('),appSource.indexOf('function renderJobRecovery(')),h);
    vm.runInContext(appSource.slice(appSource.indexOf("$('cancel-generation').addEventListener"),appSource.indexOf('function renderRecoveryPanel(')),h);
    await assert.rejects(h.plannedStory(mode,{languageCode:'de'},'write',panel, {providerId:'mock',model:'mock'}),/Generation cancelled/);
    if(phase==='plan-start') {assert.deepEqual(starts,['language-plan']);assert.deepEqual(cancels,['language-plan']);assert.deepEqual(waits,[]);}
    else if(phase==='plan-ack') {assert.deepEqual(starts,['language-plan']);assert.deepEqual(cancels,[]);}
    else {assert.deepEqual(starts,['language-plan',mode]);assert.deepEqual(cancels,[mode]);}
    if(phase!=='plan-start')assert.ok(h.state.generationJob.plan);assert.equal(h.state.requestId,null);
  }
  const bridgeSource=fs.readFileSync('js/bridge.js','utf8');
  const bridgeContext={AI:null,DEV:{mockAi:true},aiResults:new Map(),setTimeout,aiCall:async(action,args)=>{assert.equal(action,'result');assert.equal(args.requestId,'persisted-id');return 'retained text';}};
  vm.createContext(bridgeContext);vm.runInContext(bridgeSource.slice(bridgeSource.indexOf('export const ai ='),bridgeSource.indexOf('// --- Preferences')).replace('export const ai =','globalThis.ai ='),bridgeContext);
  assert.equal(await bridgeContext.ai.wait('persisted-id'),'retained text');
  let journalSaves=0, releases=0;
  const journalContext={state:{generationJob:{writeRequestId:'saved-writer'}},ai:{acknowledge:async()=>{if(++releases>1)throw Error('Request not found');}},persistSettings(){if(++journalSaves===1)throw Error('disk');},renderJobRecovery(){}};
  vm.createContext(journalContext);vm.runInContext(appSource.slice(appSource.indexOf('async function releaseCheckpointRequest('),appSource.indexOf('function renderJobRecovery(')),journalContext);
  await assert.rejects(journalContext.acknowledgeStoryRequest('saved-writer'),/disk/);assert.ok(journalContext.state.generationJob);
  await journalContext.acknowledgeStoryRequest('saved-writer');assert.equal(journalContext.state.generationJob,null);assert.equal(releases,2);
  let completedSaved=false;
  const completedJob={input:{languageCode:'de',difficulty:'A1',framework:'CEFR',scope:'scene',readingSelfReport:'Simple reading'},config:{providerId:'original-provider',model:'original-model'},plan:{vocabulary:[],grammar:[],guidance:''},writeResponse:JSON.stringify(story),writeRequestId:'writer',createdAt:'original-date',storyId:'stable-story',chapterId:'stable-chapter',versionId:'stable-version',profileVersion:'original-profile',promptVersion:'original-prompt'};
  const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',disabled:false});return elements.get(id);};
  const completedContext={state:{generationJob:completedJob,resumeGeneration:true},ai:{available:false,providers(){throw Error('must not discover for a saved response');}},$:element,LANGUAGES:{de:'German'},PROFILE_DEFINITIONS:{version:'new-profile'},PROMPT_VERSION:'new-prompt',guideFor:()=>'',storyInstructions:()=>'',plannedStory:async()=>completedJob.writeResponse,decodeResponse:text=>JSON.parse(text),persistSettings(){},renderJobRecovery(){},saveGeneratedStory:async()=>{completedSaved=true;}};
  vm.createContext(completedContext);vm.runInContext(appSource.slice(appSource.indexOf('function generationProvenance('),appSource.indexOf('async function plannedStory('))+appSource.slice(appSource.indexOf('async function generate(event)'),appSource.indexOf("$('story-form').addEventListener")),completedContext);
  await completedContext.generate({preventDefault(){}});assert.equal(completedSaved,true);assert.equal(completedContext.state.current.id,'stable-story');assert.equal(completedContext.state.current.model,'original-model');assert.equal(completedContext.state.current.promptVersion,'original-prompt');assert.equal(completedContext.state.current.profileVersion,'original-profile');
  console.log('PASS standardized levels, bounded plans, glossary forms, long stories, sequential checkpoints, reload reuse, save/release failures, malformed plans and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
