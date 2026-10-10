# Russian

Status: initial implementation present; deeper pedagogical review pending.

## Confirmed requirements

- Russian stories with an English interface and English glossary explanations.
- Beginner stories generated from learner-confirmed vocabulary.
- Always use **Cyrillic** for Russian story text, vocabulary suggestions, and
  Russian glossary headwords. Do not replace or supplement Russian text with
  Latin transliteration. English explanations remain in English.

## Language-specific decisions to resolve

- Assumed Cyrillic knowledge and whether learners need Cyrillic script instruction.
- Stress marks: whether and where to display them in stories and glossary entries.
- Vocabulary representation: dictionary forms, gender, and inflected story forms.
- Grammar progression: cases, verb aspect, agreement, and tense choices.
- Treatment of spelling and pronunciation aids, including ё.

Cyrillic is a confirmed product requirement. Stress annotation remains an open
decision. Review relevant evidence separately from the German and Japanese design.

Initial default: do not add stress marks. This is a product simplification,
not a research-established teaching rule; normal Russian spelling is preserved.

## Content review

Review Cyrillic text, inflection, agreement, aspect, natural vocabulary use,
glossary accuracy, beginner readability, and absence of Russian transliteration.
If stress annotations are introduced,
include their accuracy in the review criteria.

## Implemented prompt decision — 2026-10-09.1

Write Russian in 100–150 words. All title, text, vocabulary headwords and story forms must use Cyrillic. Never give Latin transliteration or added stress marks. English glossary meanings remain English. Favor short everyday clauses and common present-tense patterns; use cases, number, gender, and verb agreement correctly. Avoid advanced participial constructions. Match selected dictionary forms to actual inflected forms in the glossary.

These grammar and orthography constraints are **product assumptions** and linguistic
correctness requirements, not an empirically validated curriculum. Shared reading,
glossing and natural reuse rationale is in the [initial evidence review](../research/reading-and-glossing.md).
The validator verifies declared used forms occur in the text; it cannot establish
that an inflected form is linguistically related to the chosen lemma or that a
reading is correct in context. Separate language review remains necessary.

Prompt source: [ru.json](../../android/app/src/main/assets/prompts/ru.json).
Update this decision and increment the prompt version when behavior changes.

## App² reading self-report — 2026-10-10

Settings offer three reading-task descriptions and an optional knowledge/difficulties description. These guide each story request and are revisable learner reports, not assessed proficiency. Russian assumes Cyrillic literacy; vocabulary, word endings, and sentence comprehension can be described separately. Generation uses Cyrillic without transliteration. Definitions are in `data/learning-profiles.json`; evidence and limits are in [the self-assessment record](../research/self-assessment.md).
