// Explicit supplemental stage evaluation; preserves original failures and canonical prose.
import fs from 'node:fs';
import {parseContent,validateStory,readingPlan,attachReadings,READING_INSTRUCTIONS} from '../js/learning-validation.js';
const [filename,endpoint]=process.argv.slice(2);
if(!filename||!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(endpoint||''))throw Error('Record and local bridge required.');
const record=JSON.parse(fs.readFileSync(filename,'utf8'));
if(record.input.languageCode!=='ja')throw Error('Japanese record required.');
const content=record.revalidation?.content||record.result;
if(!content)throw Error('Previously validated prose and notes required.');
validateStory(content,'ja');
if(record.supplementalReadings?.result)process.exit(0);
const save=()=>{fs.writeFileSync(filename+'.tmp',JSON.stringify(record,null,2)+'\n');fs.renameSync(filename+'.tmp',filename);};
async function bridge(command){const r=await fetch(endpoint+'/__bridge/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const x=await r.json();if(x?.error)throw Error(x.error.message);if(!r.ok)throw Error('Bridge failed.');return x;}
const plan=readingPlan(content);
const trace=record.supplementalReadings||{kind:'explicit completion of missing annotation stage; no prose/notes regeneration',model:record.model,effort:record.effort,startedAt:new Date().toISOString(),input:{kind:'readings',languageCode:'ja',spans:plan.spans},instructions:READING_INSTRUCTIONS};
record.supplementalReadings=trace;delete trace.error;save();
try{
 const id=trace.requestId||await bridge({action:'start',data:{providerId:'chatgpt',model:trace.model,reasoningEffort:trace.effort,instructions:trace.instructions,input:JSON.stringify(trace.input)}});trace.requestId=id;save();
 let raw=trace.raw;const deadline=Date.now()+600000;
 while(raw==null&&Date.now()<deadline){raw=await bridge({action:'result',requestId:id});if(raw==null)await new Promise(r=>setTimeout(r,1000));}
 if(raw==null)throw Error('Supplemental reading request timed out; explicit retry required.');trace.raw=raw;save();
 trace.result=attachReadings(content,plan,parseContent(raw));trace.finishedAt=new Date().toISOString();save();
 await bridge({action:'acknowledge',requestId:id});trace.released=true;save();console.log(record.id+': missing readings completed');
}catch(error){trace.error=error.message;save();throw error;}
