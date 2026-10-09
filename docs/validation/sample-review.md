# Initial sample review — 2026-10-09

Reviewer: Codex AI assistant. Qualifications: automated multilingual text review;
no native-speaker, language-teaching credential, or independent human reviewer is
claimed. This is a preliminary issue-finding review, not content certification.
The non-personal samples were generated on the physical Android, validated and
saved locally. Their JSON preserves canonical text, glossary, annotation offsets,
model and prompt version. Only one sample per language was inspected.

| Language | Sample | Length | Preliminary findings |
| --- | --- | --- | --- |
| German | [Ein Tag mit Max](samples/de.json) | 118 words | All five items appear. Noun capitalization, umlauts, articles and present-tense agreement appear consistent. `Haus` maps to both `Haus` and idiomatic `Hause`; the glossary distinguishes house/home. Extra words such as `Schüssel` and the separable `zurückbringen` construction may need support for a complete beginner. |
| Japanese | [友達との一日](samples/ja.json) | 10 sentences | All five selected items appear. Script uses preserved kanji and kana, with no romaji. Every kanji-bearing segment has a kana reading, including compounds such as `学校/がっこう`, `友達/ともだち`, and okurigana such as `読みます/よみます`. `今日/きょう` and `一日/いちにち` fit the contexts. Title and glossary readings are present. Polite forms are consistent. Particles `には` and additional vocabulary still require beginner review. Numerical structure checks do not prove reading accuracy. |
| Russian | [День с другом](samples/ru.json) | 108 words | Cyrillic is preserved, including ё, with no transliteration or added stress. Glossary maps cases such as `дом/доме/домом`, `собака/собакой`, and `вода/воду`. Agreement appears consistent. The phrase `но мы скоро хотим есть` is potentially awkward in the narrative and should receive native-speaker review; case and motion-verb variety may exceed some beginners' knowledge. |
| Spanish | [Un día con mi amigo](samples/es.json) | 119 words | All five selected items appear. Accents and present-tense agreement appear consistent. No conflicting regional address forms appear. Glossary meanings fit context. Irregular forms such as `volvemos`, and extra prepositions/vocabulary, need curriculum-specific beginner review. |

The lexical count uses the implementation's Unicode word rule. Japanese sentence
count uses sentence-ending punctuation. Neither is a validated readability score.
English glossary meanings were inspected for these samples; the validator can
only check that an explanation exists and includes Latin letters, not prove
English fluency or semantic truth. No app-specific effectiveness claim follows.

Next: ask qualified reviewers to assess grammar, naturalness, reading accuracy,
lexical load and assumed prior knowledge across varied topics and inflections.
Record qualifications and disagreements. Do not silently relabel these samples
as human-approved material.

## Japanese follow-up after the user report

[Prompt-.2 sample](samples/ja-kanji-only.json), `友達と一日`, generated and saved
on the phone after the okurigana correction. It has 10 sentences. Kanji runs such
as 行/い, 読/よ, 好/す, 飲/の and 話/はな have readings above them; きます,
みます, き, and します remain ordinary kana in the canonical text. Compounds
学校/がっこう, 友達/ともだち and 今日/きょう remain grouped. No repeated
ます was observed in these annotations. The title is terse and may sound less
natural than 友達との一日; a qualified reviewer should assess it. This second
sample does not establish that every future AI reading will be correct.
