# Story generation and local library

Implemented after physical-device authentication and completed inference passed.

## Boundaries

Authentication and encrypted credentials remain separate from inference,
generation, library, and settings repositories. MVVM keeps drafts and requests
across activity rotation. Room stores validated stories; DataStore retains the
last target language and model preference per issued account registration.
Credentials never enter either learning store. Models retain account-specific
server order; a saved visible model is reused, otherwise the first visible model
is selected. The UI remains English in all four languages.

## Prompts and validation

[Prompt assets](../../android/app/src/main/assets/prompts/) contain a common JSON
contract and four independent language files. Initial version `2026-10-09.1` and Japanese/Spanish revisions `2026-10-09.2` are saved
with their corresponding stories, alongside its model, language, selected vocabulary, topic,
canonical text, glossary, annotations, and creation time. Prompts request simple,
familiar, A1-oriented language and natural reuse. These are product assumptions;
see [evidence limits](../research/reading-and-glossing.md).

Vocabulary must contain 5–10 distinct items, each containing letters. Suggestions are editable and cannot
be generated into a story until confirmed. Editing words, topic, or language
invalidates confirmation. Russian text/headwords/forms are checked for Cyrillic
letters without added stress marks; Japanese excludes romaji. German and Spanish
preserve Unicode orthography. Stories require 100–150 whitespace-delimited lexical
words (hyphen/apostrophe compounds count as one) or 8–12 sentence endings for
Japanese. This is a pragmatic target, not a CEFR readability test.

Only completed SSE output is parsed. Exactly one glossary item must cover each
selected item and declare actual story forms. Non-Japanese coverage uses letter
boundaries, preventing substring matches; Japanese uses surface containment.
Japanese segment reconstruction must equal title/story text exactly and all
kanji-containing segments must have kana readings. The validator does not prove
semantic accuracy, correct inflection, correct furigana, or beginner readability.

## Failures, cancellation, and storage

No automatic repeated generation occurs. English errors preserve the draft and
confirmation for explicit retry. A failed save retains the completed story and
offers saving again without a second inference request. Idempotent insert by
unique story ID avoids duplicate saves after interruption. Cancellation stops
transport through coroutine cancellation; partial output is never saved.

The local library can filter by language, reopen offline, delete after explicit
confirmation, and reuse selected vocabulary. Offline reading has no token/API
requirement. Room schema version 1 is exported under `android/app/schemas/`;
future schema changes need migrations, without destructive fallback. Backups and
device transfer are excluded for credentials, preferences, and stories. Deleting
or uninstalling the app can lose this local library; no cloud sync is provided.

## Adding languages and regional variants

Each selectable variant has its own `TargetLanguage` entry, display name, BCP 47
tag, prompt asset named after that tag, and language decision file. The current
Spanish option is **Spanish (Chile)** (`es-CL`), with `prompts/es-CL.json` and
`docs/languages/spanish-chile.md`. A future Spanish (Spain) option can use
`es-ES` and its own prompt and decision file. Add appropriate script validation
and review criteria when adding an option.

The existing `SPANISH` enum identifier remains stable so saved stories still
decode. Legacy `es` preferences resolve to Spanish (Chile); new preferences and
story records use `es-CL`. Old story text and prompt versions remain unchanged:
their earlier generation is not retroactively evidence of Chilean usage.
