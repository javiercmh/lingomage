import assert from 'node:assert/strict';
import {MAX_CONTENT_UNITS,parseContent,validateNotes,validateContentSize} from '../js/learning-validation.js';
import {hasGlossaryForm,findGlossaryMatches,firstGlossaryMatches} from '../js/reader-text.js';
const keys=Array.from({length:250},(_,i)=>'Wort'+i),prose={title:'Viele Wörter',story:keys.join(' ')};
const glossary=keys.map(word=>({word,meaning:'a distinct example expression',forms:[word]}));
assert.equal(validateNotes({glossary},prose,'de').glossary.length,250);
assert.equal(firstGlossaryMatches(prose.story,glossary).length,250);
const raw=JSON.stringify({x:'a'.repeat(MAX_CONTENT_UNITS-8)});assert.equal(raw.length,MAX_CONTENT_UNITS);assert.equal(parseContent(raw).x.length,MAX_CONTENT_UNITS-8);
assert.throws(()=>parseContent(raw+' '),/technical size/);
assert.throws(()=>validateContentSize({x:'a'.repeat(MAX_CONTENT_UNITS)}),/technical size/);
assert.deepEqual(validateNotes({glossary:[{...glossary[0],forms:['Wort0','missing']}]},prose,'de').glossary[0].forms,['Wort0']);
assert.throws(()=>validateNotes({glossary:[{...glossary[0],word:'Nichts',forms:['missing']}]},prose,'de'),/None of the AI vocabulary notes/);
// More repeated notes no longer multiplies the match-candidate allocation.
const repeated=Array.from({length:1500},(_,i)=>({word:'町',meaning:'meaning '+i,forms:['町']}));
assert.equal(firstGlossaryMatches('町。'.repeat(1000),repeated).length,1);
assert.equal(firstGlossaryMatches('町。'.repeat(1000),repeated)[0].notes.length,1500);
// Differential comparison preserves the existing longest-overlap and note ordering rules.
// Self-contained reference ordering algorithm, including shallow CI checkouts.
function referenceMatches(canonical, glossary = []) {
  const candidates = [];
  const wordCharacter = value => Boolean(value && /[\p{L}\p{N}\p{M}_]/u.test(value));
  for (const note of glossary) {
    for (const form of Array.isArray(note?.forms) ? note.forms : []) {
      if (typeof form !== 'string' || !form.length || !note?.meaning) continue;
      const usesJapaneseScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(form);
      let from = 0;
      while (from <= canonical.length - form.length) {
        const start = canonical.indexOf(form, from);
        if (start < 0) break;
        const end = start + form.length;
        const bounded = usesJapaneseScript || (!wordCharacter(form[0]) || !wordCharacter(canonical[start - 1])) && (!wordCharacter(form[form.length - 1]) || !wordCharacter(canonical[end]));
        if (bounded) candidates.push({ start, end, form, note });
        from = start + 1;
      }
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const chosen = [];
  for (const candidate of candidates) {
    const identical = chosen.find(item => item.start === candidate.start && item.end === candidate.end);
    if (identical) {
      if (!identical.notes.some(note => note.word === candidate.note.word && note.meaning === candidate.note.meaning)) identical.notes.push(candidate.note);
      continue;
    }
    if (chosen.some(item => candidate.start < item.end && candidate.end > item.start)) continue;
    chosen.push({ start: candidate.start, end: candidate.end, form: candidate.form, notes: [candidate.note] });
  }
  return chosen.sort((a, b) => a.start - b.start);
}

let seed=7;const random=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
const chunks=['ab','bc','abc','a b','町','町へ','へ','13','3','_ab_','café','cafe\u0301','город','го́род'];
for(let round=0;round<150;round++){
 const text=Array.from({length:20},()=>chunks[random(chunks.length)]).join(' ');
 const notes=Array.from({length:35},(_,i)=>({word:i%7?'item'+i%5:undefined,meaning:'meaning'+i%3,forms:[chunks[random(chunks.length)],chunks[random(chunks.length)]]}));
 assert.deepEqual(JSON.parse(JSON.stringify(findGlossaryMatches(text,notes))),JSON.parse(JSON.stringify(referenceMatches(text,notes))));
 for(const form of chunks)assert.equal(hasGlossaryForm(text,form),referenceMatches(text,[{word:form,meaning:'test',forms:[form]}]).length>0);
}
console.log('PASS 250 notes, inclusive payload boundary, oversized rejection, missing-form enforcement, repeated-note scaling and 150 matcher equivalence cases');
