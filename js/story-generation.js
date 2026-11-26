
function canonicalScript(text, language) {
  const allowed = language === 'ru' ? /\p{Script=Cyrillic}/u : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆]/u;
  return Array.from(text).every(char => !/\p{L}/u.test(char) || allowed.test(char));
}

export function decodePlan(text, language) {
  let plan;
  try { plan = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw Object.assign(new Error('The language plan was not valid JSON. Discard this attempt to plan again.'), { code: 'invalid_json' }); }
  const fields = (items, maximum, keys) => Array.isArray(items) && items.length <= maximum && items.every(item => item && keys.every(key => typeof item[key] === 'string' && item[key].trim() && item[key].length <= 600));
  if (!plan || !fields(plan.vocabulary, 5, ['word', 'meaning']) || !fields(plan.grammar, 2, ['focus', 'explanation']) || typeof plan.guidance !== 'string' || plan.guidance.length > 3000) throw new Error('The language plan was incomplete or invalid. Discard this attempt to plan again.');
  if (['ja', 'ru'].includes(language) && plan.vocabulary.some(item => !canonicalScript(item.word, language))) throw new Error('Planned headwords must use canonical target-language script. Discard this attempt to plan again.');
  return { vocabulary: plan.vocabulary, grammar: plan.grammar, guidance: plan.guidance };
}
