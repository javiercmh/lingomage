// Offline utilities share the production validator, without changing repair policy.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseContent, validateProse, validateNotes, SAFEGUARD_VERSION} from '../../js/learning-validation.js';
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export function write(file,value){fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);}
export function freezeChapter(record,source){
 const writer=record.stages.findLast(s=>['create','continue','rewrite'].includes(s.stage)&&s.raw);
 if(!writer)throw Error('Missing completed prose: '+source);
 const chapter=validateProse(parseContent(writer.raw),record.input.languageCode);
 const languagePlan=writer.input.languagePlan;
 if(!languagePlan)throw Error('Missing saved language plan: '+source);
 const input={...record.input,kind:'notes',chapter,languagePlan};
 return {id:record.id.replace(/-revised$/,''),input,source,sourceHash:hash(record),writerHash:hash(writer),inputHash:hash(input),sourcePromptVersion:record.promptVersion};
}
export function deliveredReport(raw,input){
 const value=parseContent(raw);
 const changes=[];
 // Validate single notes with the same canonical prose so dropped notes retain their identity.
 for(const [index,note] of (value.glossary||[]).entries()){
  let delivered;
  try{delivered=validateNotes({glossary:[note]},input.chapter,input.languageCode).glossary[0];}
  catch(error){if(!error.message.startsWith('None of the AI vocabulary notes'))throw error;}
  const before=note.forms,after=delivered?.forms||[];
  changes.push({index,word:note.word,meaning:note.meaning,originalForms:before,deliveredForms:after,removedForms:before.filter(f=>!after.includes(f)),addedForms:after.filter(f=>!before.includes(f)),dropped:!delivered});
 }
 let content,error;
 try{content=validateNotes(value,input.chapter,input.languageCode);}catch(e){error=e.message;}
 return {validatorVersion:SAFEGUARD_VERSION,content,error,changes,repairedNotes:changes.filter(c=>!c.dropped&&(c.removedForms.length||c.addedForms.length)).length,droppedNotes:changes.filter(c=>c.dropped).length};
}
export function anonymousPair(current,candidate){
 if(current.inputHash!==candidate.inputHash||current.model!==candidate.model||current.effort!==candidate.effort)throw Error('Unmatched controls');
 const ordered=hash(current.id)<hash(candidate.id)?[current,candidate]:[candidate,current];
 return {mapping:ordered.map((r,i)=>({sample:'sample-'+(i+1),variant:r.variant,recordHash:hash(r)})),input:{chapter:current.input.chapter,profile:current.input, samples:ordered.map((r,i)=>({id:'sample-'+(i+1),raw:r.raw,delivered:r.delivery?.content?.glossary||null,repair:r.delivery?.changes||[],validationError:r.error||r.delivery?.error||null}))}};
}
export function acceptance(reviews,expectedIds){
 const totals={current:{material:0,missing:0},candidate:{material:0,missing:0}},languages={};
 const pending=[],disputes=[];
 for(const id of expectedIds){
  const review=reviews.find(r=>r.id===id);
  if(!review||!review.completed||review.reviewer?.kind!=='qualified language review'||!review.reviewer.id||!review.reviewer.qualifications){pending.push(id);continue;}
  const lang=review.language;languages[lang]??={current:{material:0,missing:0},candidate:{material:0,missing:0}};
  for(const variant of ['current','candidate']){
   const sample=review.samples?.[variant];if(!sample||!Array.isArray(sample.errors)||!Array.isArray(sample.missing)){pending.push(id);continue;}
   for(const issue of [...(sample.errors||[]),...(sample.missing||[])]){
    if(issue.adjudication==='disputed'||issue.adjudication==='pending'){disputes.push({id,variant,issue});continue;}
    if(!issue.quote||!issue.correction||!['material','minor'].includes(issue.severity)||typeof issue.uncertainty!=='string'||!['confirmed','dismissed'].includes(issue.adjudication)){pending.push(id);continue;}
    if(issue.adjudication!=='confirmed')continue;
    const key=(sample.missing||[]).includes(issue)?'missing':issue.severity==='material'?'material':null;
    if(key&&!review.focused){totals[variant][key]++;languages[lang][variant][key]++;}
   }
  }
  if(review.focused&&(review.candidateCorrect!==true||review.samples?.candidate?.errors?.some(i=>i.adjudication==='confirmed')))pending.push(id);
 }
 const passes=!pending.length&&!disputes.length&&totals.candidate.material<totals.current.material&&totals.candidate.missing<=totals.current.missing&&Object.values(languages).every(l=>l.candidate.material<=l.current.material&&l.candidate.missing<=l.current.missing);
 return {status:passes?'accepted':'not accepted',totals,languages,pending:[...new Set(pending)],disputes,limitations:'Engineering release criteria only; AI preference is insufficient. Disputed findings require qualified review.'};
}
