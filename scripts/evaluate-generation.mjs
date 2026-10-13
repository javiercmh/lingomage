// Development-only live evaluation. No credentials; uses the explicit local --chatgpt bridge.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createPipeline} from '../js/generation-pipeline.js';
import {PLAN_INSTRUCTIONS,decodePlan} from '../js/story-generation.js';
import {parseContent,validateStory,readingPlan,attachReadings,READING_INSTRUCTIONS,SAFEGUARD_VERSION} from '../js/learning-validation.js';
import {findGlossaryMatches} from '../js/reader-text.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const suite=option('--suite','models'),endpoint=option('--endpoint','http://localhost:8889'),model=option('--model','gpt-6.1-sol'),effort=option('--effort','low');
const output=path.resolve(option('--output',path.join(root,'docs/validation/generation-evaluation',suite)));
const limit=Number(option('--limit','Infinity'));const retry=args.includes('--retry');const languageFilter=option('--language','');
if(!['models','pilot','followups'].includes(suite))throw Error('Expected models, pilot or followups suite.');
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint))throw Error('Use the local development bridge only.');
fs.mkdirSync(output,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));const write=(p,value)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');const promptVersion=/const PROMPT_VERSION = '([^']+)'/.exec(app)[1];
function loadPrompt(source){const context={};vm.createContext(context);vm.runInContext(source,context);return context;}
const revisedPrompts=loadPrompt(app.slice(app.indexOf('function storyInstructions('),app.indexOf('function storyInput(')));
const baseline=read(path.join(root,'docs/validation/generation-evaluation/baseline.json'));
const original=loadPrompt(baseline.storyInstructionsSource).storyInstructions;
const revised=revisedPrompts.storyInstructions;
const profiles=read(path.join(root,'data/learning-profiles.json'));
const languages={de:'German',ja:'Japanese',ru:'Russian','es-CL':'Spanish'};
const briefs=['Two friends at a railway station discover their tickets are for different destinations.','A customer and a shopkeeper misunderstand which parcel belongs to whom.'];
function input(language,difficulty,brief=0,scope='scene'){
 const level=profiles.standardizedLevels[language].levels.find(l=>l.id===difficulty);
 return {language:languages[language],languageCode:language,difficulty,framework:profiles.standardizedLevels[language].framework,levelDescription:level.guide,readingSelfReport:level.description,scope,scopeDescription:profiles.scopes[scope].description,topic:briefs[brief],practice:'',languageExpectations:''};
}
async function bridge(command){const response=await fetch(endpoint+'/__bridge/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const value=await response.json();if(value?.error)throw Object.assign(Error(value.error.message),{code:value.error.code});if(!response.ok)throw Error('Development bridge request failed.');return value;}
const info=await (await fetch(endpoint+'/__bridge/info')).json();if(!info.liveAi&&!args.includes('--mock'))throw Error('Live evaluation requires --chatgpt. Use --mock only for harness verification.');
const available=(await bridge({action:'models',providerId:'chatgpt'})).models;
let cases=[];
for(const language of Object.keys(languages))for(const difficulty of language==='ja'?['N5','N3','N1']:['A1','B1','C1']) {
 const variants=suite==='models'?[['sol-low','gpt-6.1-sol','low'],['luna-high','gpt-6-luna','high']]:[['baseline',model,effort],['revised',model,effort]];
 if(suite==='followups')continue;
 for(let brief=0;brief<(suite==='models'?1:2);brief++)for(const [variant,m,e] of variants)cases.push({id:`${language}-${difficulty}-${brief}-${variant}`,variant,model:m,effort:e,input:input(language,difficulty,brief),kind:'create'});
}
if(suite==='followups')for(const language of Object.keys(languages))for(const kind of ['continue','rewrite','chapter']){
 const difficulty=language==='ja'?'N5':'A1';
 const parentFile=path.join(root,'docs/validation/generation-evaluation/pilot',`${language}-${difficulty}-0-revised.json`);
 if(!fs.existsSync(parentFile)||!read(parentFile).result)throw Error(`A completed pilot source is required: ${path.basename(parentFile)}`);
 const parent=read(parentFile).result;
 const value=input(language,difficulty,0,['chapter'].includes(kind)?kind:'scene');
 if(['continue','rewrite'].includes(kind)){value.recentProse=parent.story;value.storyMemory={characters:[],facts:[],plot:[],unresolved:[],uncertainties:[],situation:[]};value.prompt='';if(kind==='rewrite')value.currentChapter={title:parent.title,story:parent.story};}
 cases.push({id:`${language}-${difficulty}-${kind}`,variant:'revised',model,effort,input:value,kind:['continue','rewrite'].includes(kind)?kind:'create'});
}
for(const item of cases){if(args.includes('--mock')){item.model='development-mock';item.effort='';}const found=available.find(m=>m.id===item.model);if(!found||item.effort&&!found.reasoningLevels.includes(item.effort))throw Error(`Unavailable evaluation setting: ${item.model} ${item.effort}`);}
if(languageFilter)cases=cases.filter(item=>item.input.languageCode===languageFilter);
write(path.join(output,languageFilter?'suite-'+languageFilter+'.json':'suite.json'),{suite,live:!!info.liveAi,promptVersion,safeguardVersion:SAFEGUARD_VERSION,profileVersion:profiles.version,cases});
let count=0;
for(const spec of cases){
 const filename=path.join(output,spec.id+'.json');let record=fs.existsSync(filename)?read(filename):{...spec,live:!!info.liveAi,promptVersion:spec.variant==='baseline'?baseline.promptVersion:promptVersion,stages:[],records:[],createdAt:new Date().toISOString()};
 if(record.result)continue;if(record.error&&!retry){console.log(spec.id+': failed attempt retained; --retry required');continue;}if(count++>=limit)break;
 if(record.promptVersion!==(spec.variant==='baseline'?baseline.promptVersion:promptVersion))throw Error('Prompt changed; use a new output directory.');
 const save=()=>write(filename,record);delete record.error;save();
 const ai={async start(data){const stage=JSON.parse(data.input).kind;const trace={stage,input:JSON.parse(data.input),instructions:data.instructions,model:data.model,effort:data.reasoningEffort||'',startedAt:new Date().toISOString()};record.stages.push(trace);save();const id=await bridge({action:'start',data});trace.requestId=id;save();return id;},
 async wait(id){let trace=record.stages.find(s=>s.requestId===id);const deadline=Date.now()+600000;while(Date.now()<deadline){let raw;try{raw=await bridge({action:'result',requestId:id});}catch(error){trace.error=error.message;save();throw error;}if(raw!==null){trace.raw=raw;trace.finishedAt=new Date().toISOString();trace.seconds=(Date.parse(trace.finishedAt)-Date.parse(trace.startedAt))/1000;save();return raw;}await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('Evaluation request timed out; explicit retry or cancellation required.');},
 async acknowledge(id){await bridge({action:'acknowledge',requestId:id});const trace=record.stages.find(s=>s.requestId===id);if(trace){trace.released=true;save();}},async cancel(id){await bridge({action:'cancel',requestId:id});}};
 const config={providerId:'chatgpt',model:spec.model,reasoning:spec.effort};
 let instructions=(spec.variant==='baseline'?original:revised)(spec.input.language,spec.input.difficulty,spec.input.levelDescription);
 if(['continue','rewrite'].includes(spec.kind))instructions=revisedPrompts.chapterInstructions(spec.input.language,spec.input.difficulty,spec.input.levelDescription,spec.kind);
 try {
 if(spec.variant==='baseline'){
   // Original combined writer baseline, with durable per-stage results before release.
   const stage=async(kind,data,prompt,validate)=>{let saved=record.stages.find(s=>s.stage===kind&&s.validated);if(saved){if(!saved.released)await ai.acknowledge(saved.requestId);return saved.validated;}const pending=record.stages.find(s=>s.stage===kind&&!s.released&&s.requestId);const id=pending?.requestId||await ai.start({...config,reasoningEffort:config.reasoning,instructions:prompt,input:JSON.stringify(data)});const raw=await ai.wait(id);let value;try{value=validate(raw);}catch(error){await ai.acknowledge(id);throw error;}record.stages.find(s=>s.requestId===id).validated=value;save();await ai.acknowledge(id);return value;};
   const plan=await stage('language-plan',{...spec.input,kind:'language-plan'},PLAN_INSTRUCTIONS,raw=>decodePlan(raw,spec.input.languageCode));
   let result=await stage(spec.kind,{...spec.input,kind:spec.kind,languagePlan:plan},instructions,raw=>validateStory(parseContent(raw),spec.input.languageCode));
   if(spec.input.languageCode==='ja'){const plan=readingPlan(result);if(plan.spans.length)result=await stage('readings',{kind:'readings',languageCode:'ja',spans:plan.spans},READING_INSTRUCTIONS,raw=>attachReadings(result,plan,parseContent(raw)));}
   record.result=result;save();
 }else {
   const pipeline=createPipeline({records:record.records,persist:save,ai,apply(op){record.result=op.result;save();}});
   const op=record.records[0]||pipeline.create({planned:true,kind:spec.kind,language:spec.input.languageCode,input:spec.input,instructions,config,promptVersion,safeguardVersion:SAFEGUARD_VERSION});await pipeline.run(op);
 }
 record.metrics={notes:record.result.glossary.length,matchedOccurrences:findGlossaryMatches(record.result.story,record.result.glossary).length,canonicalUnits:record.result.story.length};record.completedAt=new Date().toISOString();save();console.log(spec.id+': complete ('+record.metrics.notes+' notes)');
 }catch(error){record.error=error.message;save();console.log(spec.id+': rejected: '+error.message);if(error.code||record.records[0]?.request||record.stages.some(s=>s.requestId&&!s.released))throw error;}
}
