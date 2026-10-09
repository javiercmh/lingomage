# Beginner story-reading MVP

Status: initial Android implementation present; device and content validation in progress.

## Confirmed requirements

- Featured target languages: **German, Japanese, Russian, and Spanish (Chile)**.
- Interface language: **English** for every target language.
- Glossary explanations: **English** for every target language.
- Start with text-only stories aimed at A1 beginners.
- Allow learners to enter vocabulary or edit AI-suggested vocabulary.
- Require confirmation of 5–10 vocabulary items before generating a story.
- Include a story title, story text, and an English glossary.
- Offer an optional topic.
- Save completed stories locally with reopen and delete controls.
- Support generating another story using the same vocabulary.
- Use eligible ChatGPT subscription access through documented Sign in with ChatGPT.
- Use language-specific learning and presentation decisions, rather than applying
  one teaching template to all languages. See the [language index](../languages/README.md).

## Starting defaults

These are product assumptions, not established optimal learning parameters:

- German, Russian, and Spanish (Chile): approximately 100–150 words per story.
- Japanese: approximately 8–12 short sentences; do not use whitespace word counts.
- Request simple grammar, familiar situations, and natural reuse of selected words.
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

1. Establish research notes and language-specific design rationale.
2. Prove the documented OAuth loopback callback, token validation, and one
   authenticated inference request on a physical Android device.
3. Implement vocabulary selection, language-specific generation, the reader,
   glossary, and local library.
4. Review content separately in each featured language and record results.

If the documented authentication protocol cannot work on Android, record the
blocker before proceeding with dependent features. Do not introduce undocumented
authentication workarounds.

## Deferred features

Audio, images, quizzes, spaced repetition, cloud sync, formal learning trials,
additional languages, and higher difficulty levels.
