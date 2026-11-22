# Russian

Shared rules: [languages README](README.md).

## Current requirements

- **Cyrillic only** (confirmed requirement) for story text, notes and headwords, including names; no Latin transliteration anywhere. Target-script validation rejects Latin text. Cyrillic literacy is assumed.
- **Stress marks** absent by default (product simplification preserving normal spelling) in story prose and generated examples unless the learner requests them. Vocabulary notes show lexical stress on the form as it appears in the text, with ё retained as written; the dictionary form is shown unmarked. Headwords and forms are saved without combining acute marks, with optional stress positions (`stress`, `formStress`) for display.
- Correct case, number, gender, aspect and agreement; notes link inflected forms to dictionary headwords.

## Earlier designs

- **Android prompt 2026-10-09.1:** 100–150 words, short everyday clauses, present tense, no advanced participial constructions, no stress marks. Product assumptions, retired with numeric quotas under PED-004.
- **2026-10-10:** reading bands with free-text self-assessment (vocabulary, endings, comprehension); replaced by Elementary/Basic/TORFL targets (2026-10-13).

## Open questions

- Whether learners need Cyrillic instruction.
- Vocabulary representation: dictionary form, gender, inflected forms.
- Grammar progression: cases, aspect, agreement, tenses.

## Content review criteria

Cyrillic text with no transliteration, inflection, agreement, aspect, natural vocabulary, glossary accuracy and readability for the level; stress accuracy whenever stress is shown.
