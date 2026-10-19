# Story-reading MVP

Status: App² workspace implemented. Standardized reading targets, narrative scope
and language planning were checked in the offline browser preview on 2026-10-13.
Native App² generation is pending in the [device checklist](../validation/device-checklist.md);
qualified language review remains pending.

## Confirmed requirements

- Featured target languages: **German, Japanese, Russian, and Spanish**. Learners can specify a regional variety in language preferences.
- Interface language: **English** for every target language.
- Glossary explanations: **English** for every target language.
- Start with no learning languages selected. Settings offer one self-selected **Reading level** per language: CEFR A1–C2 for German/Spanish, JLPT N5–N1 for Japanese, and Elementary/Basic/TORFL-I–IV with A1–C2 references for Russian. Create defaults to the saved selection and permits a per-story override; reader edits default to the source version. If no languages are enabled, Create offers all targets but still requires an explicit level selection. See [PED-004](../pedagogy/PED-004-level-guided-generation.md).
- Use concise English reading-task descriptions and app-authored language-specific guidance. These orient generation, not scored proficiency or certified alignment.
- Plan suitable vocabulary and grammar before writing the story and its final-text glossary. Candidates are optional practice focuses rather than mandatory coverage; no reader-feedback or automatic level-advancement feature is included.
- Let learners optionally enter freeform vocabulary or concepts such as grammar
  points in one field for the story to consider.
- Include a story title, story text, and an English glossary. Link each explanation only at its first eligible occurrence per displayed chapter version; later occurrences remain selectable for Explain.
- Offer an optional topic.
- Save completed stories locally with reopen and delete controls.
- Support generating another story using the same practice text.
- Use a connected AI provider through App²'s managed AI connection; account setup
  is owned by the App² library.
- Use language-specific learning and presentation decisions, rather than applying
  one teaching template to all languages. See the [language index](../languages/README.md).

## Starting defaults

These are product assumptions, not established optimal learning parameters:

- Reading scope: Scene or Chapter, default Scene (side-by-side segmented control). The earlier Longer passage option was retired as confusing next to Chapter; saved records that used it are read as Chapter. No numeric word/sentence quota applies.
- Language plans offer up to five vocabulary candidates and two grammar focuses, possibly none; these counts are unvalidated product choices.
- Request level-guided vocabulary/grammar, narrative cohesion, contextual support and natural use of practice topics.
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

Native App² speech supports selected text, vocabulary headwords and chapter listening. Browser previews show its availability limits; native behavior remains subject to the device checklist.

## Deferred features and research candidates

**Deferred product features** (not planned for the current version): images, cloud sync and additional languages.

**Research candidates** (investigated before any commitment; not features, schedules or promises): optional retrieval or spaced review of story words, reuse across stories, contextual instruction, story-linked listening, writing or speaking tasks and learner-language feedback. Prototype work needs evidence review, qualified language review and usability checks; claims of learning benefits need the learning evaluations defined in the strategy. See the [evidence-informed strategy](evidence-informed-strategy.md) and its evaluation gates; intended learner outcomes and the future optional in-app evaluation direction (none of it implemented) are in [learning outcomes and evaluation](learning-outcomes-and-evaluation.md). Quizzes and spaced repetition were previously listed here as deferred; they are now treated as research candidates.

**Formal learning trials** have not been run. They are part of the strategy's evaluation gates, not a delivered capability.

The result Copy action includes the canonical title and story plus glossary
meanings; Japanese furigana is omitted. Settings show model-specific reasoning
choices where the provider advertises them, plus a provider-default option. The
selected provider, model, reasoning choice, and target-language defaults are
stored in the workspace's `data/settings.json`; they are not
account-specific. Higher reasoning levels may increase request latency and usage.

Settings also allow a short description of what the learner knows and where they need help. Every story request uses the saved description for that language. This guided self-report is a revisable personalization choice; its exact descriptors and prompt adaptation are not a validated assessment. See [reading self-assessment evidence](../research/self-assessment.md).

When no learning languages are selected, the Create screen offers a dismissible Settings prompt to help learners tailor stories. All target languages remain available and generation stays enabled. Dismissal is saved as `languageSetupDismissed` in `data/settings.json` and persists across reloads. This personalization guidance is a product assumption, not a claim of proven learning results.
