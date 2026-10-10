# Beginner story-reading MVP

Status: App² workspace implemented; local preview checks in progress; live generation and language review pending.

## Confirmed requirements

- Featured target languages: **German, Japanese, Russian, and Spanish (Chile)**.
- Interface language: **English** for every target language.
- Glossary explanations: **English** for every target language.
- Start with text-only stories aimed at A1 beginners.
- Let learners optionally enter freeform vocabulary or concepts such as grammar
  points in one field for the story to consider.
- Include a story title, story text, and an English glossary.
- Offer an optional topic.
- Save completed stories locally with reopen and delete controls.
- Support generating another story using the same practice text.
- Use a connected AI provider through App²'s managed AI connection; account setup
  is owned by the App² library.
- Let learners save which languages they are fluent in as context for explanations.
- Use language-specific learning and presentation decisions, rather than applying
  one teaching template to all languages. See the [language index](../languages/README.md).

## Starting defaults

These are product assumptions, not established optimal learning parameters:

- German, Russian, and Spanish (Chile): approximately 100–150 words per story.
- Japanese: approximately 8–12 short sentences; do not use whitespace word counts.
- Request simple grammar, familiar situations, natural reuse of selected words,
  and consideration of any supplied concepts.
- Japanese displays furigana above kanji by default; other story text uses
  hiragana and katakana. See [Japanese](../languages/japanese.md).
- Russian text always uses Cyrillic, without Latin transliteration. English
  explanations remain English. See [Russian](../languages/russian.md).
- Spanish (Chile) uses South American Latin American Spanish, preferring everyday
  Chilean vocabulary such as palta, auto, maní and computador when relevant.
  See [Spanish (Chile)](../languages/spanish-chile.md).
- No full story translation or romaji in the initial version.

AI-suggested vocabulary and difficulty are estimates. Do not claim certified CEFR
alignment, map A1 directly to another proficiency framework, or claim that the
app has proven learning effectiveness.

## Delivery sequence

1. Keep research notes and language-specific design rationale current.
2. Validate the workspace with App²'s local Python server and mock AI.
3. Validate real generation through App²'s managed AI connection.
4. Review content separately in each featured language and record results.

## Deferred features

Audio, images, quizzes, spaced repetition, cloud sync, formal learning trials,
additional languages, and higher difficulty levels.

Story and glossary text can be selected and copied. Japanese copying excludes
furigana. Settings offer model-specific reasoning levels, including a model-default
option, saved independently for each account and model. Higher levels may increase
request latency and plan usage.
