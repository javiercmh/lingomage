# Story-reading MVP

Status: App² workspace implemented. The last documented preview and device import
checks are dated 2026-10-10 and predate the latest UI and freeform-practice edits.
Those latest edits have not been revalidated. Live generation and qualified
language review remain pending.

## Confirmed requirements

- Featured target languages: **German, Japanese, Russian, and Spanish**. Learners can specify a regional variety in language preferences.
- Interface language: **English** for every target language.
- Glossary explanations: **English** for every target language.
- Start with no learning languages selected. Let learners enable any combination, with a Beginner, Intermediate or Advanced **Reading starting point** per selected language. The main **Story difficulty** selector defaults to that starting point and permits a temporary override. If none are enabled, show an inline setup message and Open Settings button, leave the language picker empty, and disable generation. See [PED-001](../pedagogy/PED-001-learner-self-report.md).
- Use concise, language-specific reading descriptions as generation guidance; these are product assumptions, not proficiency scores or CEFR claims.
- Let learners optionally enter freeform vocabulary or concepts such as grammar
  points in one field for the story to consider.
- Include a story title, story text, and an English glossary.
- Offer an optional topic.
- Save completed stories locally with reopen and delete controls.
- Support generating another story using the same practice text.
- Use a connected AI provider through App²'s managed AI connection; account setup
  is owned by the App² library.
- Use language-specific learning and presentation decisions, rather than applying
  one teaching template to all languages. See the [language index](../languages/README.md).

## Starting defaults

These are product assumptions, not established optimal learning parameters:

- German, Russian, and Spanish: approximately 100–150 words per story.
- Japanese: approximately 8–12 short sentences; do not use whitespace word counts.
- Request simple grammar, familiar situations, and consideration of the supplied
  practice text.
- Japanese displays furigana above kanji by default; other story text uses
  hiragana and katakana. See [Japanese](../languages/japanese.md).
- Russian text always uses Cyrillic, without Latin transliteration. English
  explanations remain English. See [Russian](../languages/russian.md).
- Spanish uses broadly understandable Spanish by default. Learners can request a
  regional variety, register, spelling, or other language preference in Settings.
  See [Spanish](../languages/spanish-chile.md).
- No full story translation or romaji in the initial version.

Settings let learners expand each selected language and add a self-assessment and optional expectations or general instructions. Both descriptions guide story generation alongside the selected story level; they are revisable personalization choices, not validated assessments. Existing Spanish stories keep their `es-CL` language code, while new Spanish stories use the generic label and honor the learner's requested variety.

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
and additional languages.

The result Copy action includes the canonical title and story plus glossary
meanings; Japanese furigana is omitted. Settings show model-specific reasoning
choices where the provider advertises them, plus a provider-default option. The
selected provider, model, reasoning choice, and target-language defaults are
stored in the workspace's `data/settings.json`; they are not
account-specific. Higher reasoning levels may increase request latency and usage.

Settings also allow a short description of what the learner knows and where they need help. Every story request uses the saved description for that language. This guided self-report is a revisable personalization choice; its exact descriptors and prompt adaptation are not a validated assessment. See [reading self-assessment evidence](../research/self-assessment.md).
