// Offline policy revalidation of captured outputs. Never performs inference or rewrites history.
import fs from 'node:fs';import path from 'node:path';
import {parseContent,validateStory,validateNotes,validateProse,validateContentSize,readingPlan,attachReadings,SAFEGUARD_VERSION} from '../js/learning-validation.js';
const directory=path.resolve(process.argv[2]||'docs/validation/generation-evaluation/models');
for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.json')&&!n.startsWith('suite'))){
 const filename=path.join(directory,name),record=JSON.parse(fs.readFileSync(filename));if(!record.stages)continue;
 const revalidation={validatorVersion:SAFEGUARD_VERSION,kind:'offline revalidation of original captured raw output; no new generation',originalError:record.error||null,checkedAt:new Date().toISOString()};
 try{
  const writer=record.stages.findLast(s=>['create','continue','rewrite'].includes(s.stage)&&s.raw);if(!writer)throw Error('No completed prose response available.');
  const raw=parseContent(writer.raw),notes=record.stages.findLast(s=>s.stage==='notes'&&s.raw);
  let content=notes?validateNotes(parseContent(notes.raw),validateProse(raw,record.input.languageCode),record.input.languageCode):validateStory(raw,record.input.languageCode);
  const readings=record.stages.findLast(s=>s.stage==='readings'&&s.raw);
  if(record.input.languageCode==='ja'){
   if(readings)content=attachReadings(content,readingPlan(content),parseContent(readings.raw));
   revalidation.readingsStatus=readings?'validated':'not completed in original attempt';
  }
  validateContentSize(content);revalidation.content=content;revalidation.notes=content.glossary.length;
 }catch(error){revalidation.error=error.message;}
 record.revalidation=revalidation;fs.writeFileSync(filename+'.tmp',JSON.stringify(record,null,2)+'\n');fs.renameSync(filename+'.tmp',filename);
 console.log(record.id+': '+(revalidation.error?'rejected: '+revalidation.error:'notes valid ('+revalidation.notes+')'));
}
