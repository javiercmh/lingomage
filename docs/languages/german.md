# German

Status: initial implementation present; deeper pedagogical review pending.

## Confirmed requirements

- German stories with an English interface and English glossary explanations.
- Beginner stories generated from learner-confirmed vocabulary.

## Language-specific decisions to resolve

- Noun entries: articles, grammatical gender, plural forms, and capitalization.
- Vocabulary matching: how selected dictionary forms connect to inflected story forms.
- Grammar progression: cases, verb position, separable verbs, and tense choices.
- Glossary treatment of compounds and meanings specific to the story context.

These remain curriculum research questions. The initial product defaults below
are deliberately labeled assumptions rather than evidence-based grammar progression.

## Content review

Review grammatical agreement, articles, capitalization, word order, natural
vocabulary use, glossary accuracy, and beginner readability. Validate vocabulary
coverage without relying solely on exact matches to dictionary forms.

## Implemented prompt decision — 2026-10-09.1

Write German in 100–150 words. Preserve noun capitalization, umlauts, and ß. Favor short main clauses, common present-tense patterns and explicit subjects. Use correct articles, case, agreement, and separable verbs when selected vocabulary requires them; avoid unnecessary subordinate clauses. Link inflected story forms to the learner’s exact selected item in glossary.

These grammar and orthography constraints are **product assumptions** and linguistic
correctness requirements, not an empirically validated curriculum. Shared reading,
glossing and natural reuse rationale is in the [initial evidence review](../research/reading-and-glossing.md).
The validator verifies declared used forms occur in the text; it cannot establish
that an inflected form is linguistically related to the chosen lemma or that a
reading is correct in context. Separate language review remains necessary.

Prompt source: [de.json](../../android/app/src/main/assets/prompts/de.json).
Update this decision and increment the prompt version when behavior changes.

## App² reading self-report — 2026-10-10

Settings offer three reading-task descriptions and an optional knowledge/difficulties description. These guide each story request and are revisable learner reports, not assessed proficiency. German examples can note familiar sentence patterns, vocabulary, and word-order difficulties. Definitions are in `data/learning-profiles.json`; evidence and limits are in [the self-assessment record](../research/self-assessment.md).
