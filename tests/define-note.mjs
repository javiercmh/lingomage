// Define (PED-002): an on-demand vocabulary note must pass chapter-note repair and cover the selection.
import assert from 'node:assert/strict';
import { validateDefinedNote } from '../js/learning-validation.js';
import { DEFINE_INSTRUCTIONS } from '../js/prompts.js';

const prose = { title: 'Der Markt', story: 'Am Morgen geht Lena zum Markt. Sie kauft frische Äpfel. Der Markt ist voll.' };
const at = text => { const start = prose.story.indexOf(text); return { start, end: start + text.length }; };

// Whole-word selection: the note keeps the chapter forms and is marked as added by the learner.
const note = validateDefinedNote({ glossary: [{ word: 'frisch', meaning: 'fresh', forms: ['frische'] }] }, prose, 'de', at('frische'));
assert.deepEqual(note, { word: 'frisch', meaning: 'fresh', forms: ['frische'], addedBy: 'learner' });

// A selection inside a word is covered by a note on the whole word.
const partial = at('Äpfel'); partial.end -= 2;
assert.equal(validateDefinedNote({ glossary: [{ word: 'der Apfel', meaning: 'apple', forms: ['Äpfel'] }] }, prose, 'de', partial).word, 'der Apfel');

// The note covering the selection is chosen when the model returns more than one.
assert.equal(validateDefinedNote({ glossary: [{ word: 'voll', meaning: 'full', forms: ['voll'] }, { word: 'der Markt', meaning: 'market', forms: ['Markt'] }] }, prose, 'de', at('Markt')).word, 'der Markt');

// A note elsewhere in the chapter, an invented form or an empty reply is rejected for the learner to retry.
assert.throws(() => validateDefinedNote({ glossary: [{ word: 'voll', meaning: 'full', forms: ['voll'] }] }, prose, 'de', at('frische')), /did not match the selected text/);
assert.throws(() => validateDefinedNote({ glossary: [{ word: 'frisch', meaning: 'fresh', forms: ['frisches'] }] }, prose, 'de', at('frische')), /did not match the selected text/);
assert.throws(() => validateDefinedNote({ glossary: [] }, prose, 'de', at('frische')), /did not match the selected text/);
assert.throws(() => validateDefinedNote({ glossary: [{ word: 'frisch', meaning: 'fresh', forms: ['frische'] }], story: 'x' }, prose, 'de', at('frische')), /only a glossary/);

// Russian stress marks on the model's forms are removed before matching and kept as stress positions.
const ru = { title: 'Рынок', story: 'Утром Лена идёт на рынок.' };
const start = ru.story.indexOf('рынок');
const russian = validateDefinedNote({ glossary: [{ word: 'ры́нок', meaning: 'market', forms: ['ры́нок'] }] }, ru, 'ru', { start, end: start + 5 });
assert.equal(russian.word, 'рынок'); assert.deepEqual(russian.stress, [1]); assert.deepEqual(russian.forms, ['рынок']);

// The prompt asks for exactly one note in the chapter-note shape, with forms copied from the chapter.
assert.match(DEFINE_INSTRUCTIONS, /exactly one note/);
assert.match(DEFINE_INSTRUCTIONS, /"glossary":\[\{"word"/);
assert.match(DEFINE_INSTRUCTIONS, /forms must include the exact form at the selection/);
console.log('PASS Define note validation, selection coverage, Russian stress and prompt contract');
