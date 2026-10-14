import assert from 'node:assert/strict';
import {validateNotes} from '../js/learning-validation.js';
import {findGlossaryMatches} from '../js/reader-text.js';
// Cases are taken from real model responses in docs/validation/generation-evaluation that
// previously failed the whole chapter with "vocabulary note for a word ... that does not appear".
const note=(word,forms,meaning='an English explanation')=>({word,meaning,forms});
const run=(language,story,glossary)=>validateNotes({glossary},{title:language==='ru'?'Билет':'Titel',story},language).glossary;

// German: plural/lemma not in the chapter; recover from the headword minus its article.
const de='Mia nimmt ihre Fahrkarte aus der Tasche. „Meine Fahrkarte ist für Bonn“, sagt sie. Ben hält seine Fahrkarte in der Hand.';
assert.deepEqual(run('de',de,[note('die Fahrkarte',['Fahrkarten'])])[0].forms,['Fahrkarte']);
// German: discontinuous separable verb becomes its attested parts; unrelated absent forms are dropped.
const sep='Jonas winkte den Kellner heran. Mara winkte Nora herüber, und sie kam.';
assert.deepEqual(run('de',sep,[note('herüberwinken',['winkte ... herüber'])])[0].forms,['winkte','herüber']);
assert.throws(()=>run('de',de,[note('das Ticket',['Tickets'])]),/None of the AI vocabulary notes/);

// Spanish: wrong conjugation dropped, but the note survives through its headword/other forms.
const es='Ana mira su pasaje. Leo mira el reloj. —Mi pasaje es para Rancagua —dice él.';
assert.deepEqual(run('es-CL',es,[note('mirar',['miró','mira'])])[0].forms,['mira']);
assert.deepEqual(run('es-CL',es,[note('el pasaje',['pasajes'])])[0].forms,['pasaje']);

// Russian: capitalization from a quotation, ё/е, quote styles, and absent case forms.
const ru='На нём было написано: «До Казани». Игорь купил билет. Маша сказала: „Нёс“. Поезд Маши отправлялся с третьей платформы.';
assert.deepEqual(run('ru',ru,[note('до',['до Казани'])])[0].forms,['До Казани']);
assert.deepEqual(run('ru',ru,[note('билет',['билета','билетом'])])[0].forms,['билет']);
assert.deepEqual(run('ru',ru,[note('нести',['нёс'])])[0].forms,['Нёс']);
assert.deepEqual(run('ru',ru,[note('платформа',['платформы','платформе'])])[0].forms,['платформы']);
assert.deepEqual(run('ru',ru,[note('сказать',['сказал','сказала'])])[0].forms,['сказала']);

// Repaired forms are exact chapter text, so the reader underlines them; case folding never matches mid-word.
const repaired=run('ru',ru,[note('до',['до Казани'])]);
assert.equal(findGlossaryMatches(ru,repaired).length,1);
assert.throws(()=>run('ru','Игорь купил билеты.',[note('лет',['лет'])]),/None of the AI vocabulary notes/);
assert.throws(()=>run('de','Das Fahrkartenhaus ist offen.',[note('die Fahrkarte',['fahrkarte'])]),/None of the AI vocabulary notes/);

// Mixed response: valid notes are kept and only the unsupported note disappears.
const mixed=run('de',de,[note('die Tasche',['Tasche']),note('das Ziel',['Ziele']),note('die Hand',['Hand','Händen'])]);
assert.deepEqual(mixed.map(n=>[n.word,n.forms]),[['die Tasche',['Tasche']],['die Hand',['Hand']]]);
// Script safeguards are unchanged: Latin transliteration is still rejected, not repaired.
assert.throws(()=>run('ru',ru,[note('билет',['bilet'])]),/target script/);
console.log('PASS glossary repair keeps attested forms, drops unsupported forms and still rejects fully unsupported or transliterated notes');
