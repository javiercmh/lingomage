import assert from 'node:assert/strict';
import {MAX_CONTENT_UNITS,parseContent,validateNotes,validateContentSize} from '../js/learning-validation.js';
import {hasGlossaryForm,findGlossaryMatches,firstGlossaryMatches} from '../js/reader-text.js';
import vm from 'node:vm';import {execFileSync} from 'node:child_process';
const keys=Array.from({length:250},(_,i)=>'Wort'+i),prose={title:'Viele Wörter',story:keys.join(' ')};
const glossary=keys.map(word=>({word,meaning:'a distinct example expression',forms:[word]}));
assert.equal(validateNotes({glossary},prose,'de').glossary.length,250);
assert.equal(firstGlossaryMatches(prose.story,glossary).length,250);
const raw=JSON.stringify({x:'a'.repeat(MAX_CONTENT_UNITS-8)});assert.equal(raw.length,MAX_CONTENT_UNITS);assert.equal(parseContent(raw).x.length,MAX_CONTENT_UNITS-8);
assert.throws(()=>parseContent(raw+' '),/technical size/);
assert.throws(()=>validateContentSize({x:'a'.repeat(MAX_CONTENT_UNITS)}),/technical size/);
assert.throws(()=>validateNotes({glossary:[{...glossary[0],forms:['Wort0','missing']}]},prose,'de'),/does not appear/);
// More repeated notes no longer multiplies the match-candidate allocation.
const repeated=Array.from({length:1500},(_,i)=>({word:'町',meaning:'meaning '+i,forms:['町']}));
assert.equal(firstGlossaryMatches('町。'.repeat(1000),repeated).length,1);
assert.equal(firstGlossaryMatches('町。'.repeat(1000),repeated)[0].notes.length,1500);
// Differential comparison preserves the existing longest-overlap and note ordering rules.
const previous=execFileSync('git',['show','121ce5e:js/reader-text.js'],{encoding:'utf8'}).replaceAll('export function ','function ');
const context={};vm.createContext(context);vm.runInContext(previous,context);
let seed=7;const random=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
const chunks=['ab','bc','abc','a b','町','町へ','へ','13','3','_ab_','café','cafe\u0301','город','го́род'];
for(let round=0;round<150;round++){
 const text=Array.from({length:20},()=>chunks[random(chunks.length)]).join(' ');
 const notes=Array.from({length:35},(_,i)=>({word:i%7?'item'+i%5:undefined,meaning:'meaning'+i%3,forms:[chunks[random(chunks.length)],chunks[random(chunks.length)]]}));
 assert.deepEqual(JSON.parse(JSON.stringify(findGlossaryMatches(text,notes))),JSON.parse(JSON.stringify(context.findGlossaryMatches(text,notes))));
 for(const form of chunks)assert.equal(hasGlossaryForm(text,form),context.findGlossaryMatches(text,[{word:form,meaning:'test',forms:[form]}]).length>0);
}
console.log('PASS 250 notes, inclusive payload boundary, oversized rejection, missing-form enforcement, repeated-note scaling and 150 matcher equivalence cases');
