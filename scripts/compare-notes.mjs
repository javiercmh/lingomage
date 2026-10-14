// Development-only. Freeze/review/report are offline; --run requires explicit --live or --mock.
import fs from 'node:fs';import path from 'node:path';
import {hash,read,write,freezeChapter,deliveredReport,anonymousPair,acceptance} from './evaluation/notes-comparison.mjs';
const args=process.argv.slice(2),option=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const base='docs/validation/generation-evaluation/contextual-notes';
const directory=path.resolve(option('--output',base)),pilot=path.resolve(option('--pilot','docs/validation/generation-evaluation/pilot'));
fs.mkdirSync(directory,{recursive:true});
const manifestFile=path.join(directory,'corpus.json');
if(args.includes('--freeze')){
 if(fs.existsSync(manifestFile))throw Error('Frozen corpus exists; choose a new output directory.');
 const cases=[];
 for(const language of ['de','ja','ru','es-CL'])for(const level of language==='ja'?['N5','N3','N1']:['A1','B1','C1'])for(const brief of [0,1]){
  const source=path.join(pilot,`${language}-${level}-${brief}-revised.json`);cases.push(freezeChapter(read(source),path.relative(process.cwd(),source)));
 }
 const prompts=read(path.join(base,'prompts.json'));
 const validatorFiles=['js/learning-validation.js','js/reader-text.js'];
 write(manifestFile,{promptVersions:{current:/const PROMPT_VERSION = '([^']+)'/.exec(fs.readFileSync('js/app.js','utf8'))[1],candidate:'contextual-notes-candidate-1'},createdAt:new Date().toISOString(),cases,prompts,model:'gpt-6.1-sol',effort:'low',validatorSources:Object.fromEntries(validatorFiles.map(f=>[f,fs.readFileSync(f,'utf8')])),focused:read(path.join(base,'focused.json'))});
}
const manifest=read(manifestFile),cases=[...manifest.cases,...manifest.focused];
if(args.includes('--run')){
 if(!args.includes('--live')&&!args.includes('--mock'))throw Error('Explicit --live authorization or --mock required.');
 const endpoint=option('--endpoint','http://localhost:8889');if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint))throw Error('Local development bridge required.');
 for(const [file,source] of Object.entries(manifest.validatorSources))if(fs.readFileSync(file,'utf8')!==source)throw Error('Validator changed; freeze a new comparison.');
 const info=await(await fetch(endpoint+'/__bridge/info')).json();if(Boolean(info.liveAi)!==args.includes('--live'))throw Error('Bridge mode mismatch.');
 const bridge=async command=>{const r=await fetch(endpoint+'/__bridge/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const v=await r.json();if(v?.error)throw Object.assign(Error(v.error.message),{code:v.error.code});if(!r.ok)throw Error('Bridge failure');return v;};
 const model=args.includes('--mock')?'development-mock':manifest.model,effort=args.includes('--mock')?'':manifest.effort;
 const available=(await bridge({action:'models',providerId:'chatgpt'})).models;
 if(!available.some(m=>m.id===model&&(!effort||m.reasoningLevels.includes(effort))))throw Error('Experimental control unavailable; do not silently substitute models.');
 let count=0;
 runCases: for(const spec of cases)for(const variant of ['current','candidate']){
  if(option('--language','')&&spec.input.languageCode!==option('--language',''))continue;
  const filename=path.join(directory,spec.id+'-'+variant+'.json');
  let record=fs.existsSync(filename)?read(filename):{id:spec.id+'-'+variant,variant,promptVersion:manifest.promptVersions[variant],sourceProvenance:{source:spec.source||'focused regression',sourceHash:spec.sourceHash||null,writerHash:spec.writerHash||null},input:spec.input,inputHash:hash(spec.input),corpusHash:hash(manifest),instructions:manifest.prompts[variant],model,effort,live:!!info.liveAi,released:false,attempts:[]};
  if(record.corpusHash!==hash(manifest)||record.model!==model||record.effort!==effort)throw Error('Provenance changed; use a new directory.');
  if(record.completed&&record.released)continue;
  if(record.error&&!args.includes('--retry'))continue;
  if(count++>=Number(option('--limit','Infinity')))break runCases;
  const save=()=>write(filename,record);
  if(record.error&&record.released){record.attempts.push({raw:record.raw,delivery:record.delivery,error:record.error,requestId:record.requestId,released:record.released,kind:'failed attempt'});if(record.requestId&&!record.released)throw Error('Unreleased failed request; resolve it explicitly before new inference.');delete record.raw;delete record.delivery;delete record.requestId;delete record.error;record.released=false;}
  delete record.error;save();
  try{
   if(!record.requestId){record.attempts.push({kind:record.attempts.length?'explicit retry':'initial',startedAt:new Date().toISOString()});save();record.requestId=await bridge({action:'start',data:{providerId:'chatgpt',model,reasoningEffort:effort||undefined,instructions:record.instructions,input:JSON.stringify(record.input)}});save();}
   if(record.raw===undefined){const deadline=Date.now()+600000;while(Date.now()<deadline){const raw=await bridge({action:'result',requestId:record.requestId});if(raw!==null){record.raw=raw;save();break;}await new Promise(r=>setTimeout(r,1000));}if(record.raw===undefined)throw Error('Timeout; saved request requires explicit resume.');}
   try{record.delivery=deliveredReport(record.raw,record.input);record.error=record.delivery.error;record.completed=!record.error;}catch(error){record.error=error.message;}
   record.finishedAt=new Date().toISOString();save(); // raw and delivered output durable before release
   if(!record.released){await bridge({action:'acknowledge',requestId:record.requestId});record.released=true;save();}
  }catch(error){record.error=error.message;save();throw error;}
 }
}
if(args.includes('--review-pack')){
 const reviewDirectory=path.join(directory,'reviews');fs.mkdirSync(reviewDirectory,{recursive:true});
 for(const spec of cases){const files=['current','candidate'].map(v=>path.join(directory,spec.id+'-'+v+'.json'));if(!files.every(fs.existsSync))continue;
  const pair=anonymousPair(...files.map(read));const filename=path.join(reviewDirectory,spec.id+'.json');if(fs.existsSync(filename))continue;
  write(path.join(reviewDirectory,spec.id+'.mapping.json'),{mapping:pair.mapping});
  delete pair.mapping;
  write(filename,{id:spec.id,language:spec.input.languageCode,focused:!!spec.focused,completed:false,reviewer:{id:'',qualifications:'',kind:'qualified language review'},...pair,rubric:'Inspect every raw and delivered note against identical prose. Record errors and missing useful expressions with exact quote, severity (material/minor), correction, uncertainty, adjudication (pending/confirmed/dismissed/disputed). Inspect semantic compatibility after form repair. Counts and preference are secondary. Keep disputes; do not infer correctness from AI preference.',samples:{current:{errors:[],missing:[]},candidate:{errors:[],missing:[]}},candidateCorrect:null});
 }
}
if(args.includes('--report')){const reviewDirectory=path.join(directory,'reviews');const reviews=fs.existsSync(reviewDirectory)?fs.readdirSync(reviewDirectory).filter(f=>f.endsWith('.json')&&!f.endsWith('.mapping.json')).map(f=>read(path.join(reviewDirectory,f))):[];write(path.join(directory,'acceptance.json'),acceptance(reviews,cases.map(c=>c.id)));}
