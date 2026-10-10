# Story generation and local library

> The Android architecture below records the earlier native implementation. The current App² behavior and its reduced validation coverage are documented in [App² runtime migration](app2-runtime.md).

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

The App² workspace presents **Spanish** and lets learners request a regional
variety through per-language expectations. It retains the `es-CL` code so saved
stories and existing settings continue to load; that code no longer implies a
Chilean variety for new stories. Existing stories keep their original text and
prompt provenance. The earlier Android implementation used a separate
Spanish (Chile) prompt and is documented as historical behavior in
`docs/languages/spanish-chile.md`.

### Japanese text consistency — prompt 2026-10-09.3

Japanese generation now omits duplicate `text` and `title` fields. Canonical
story and title text are concatenated from `segments` and `titleSegments`,
preserving every character and deriving annotation offsets from that same
source. This removes a redundant model-generated copy that could disagree.
Length, sentence count, vocabulary, glossary and furigana checks still apply.
Legacy responses containing explicit text must still match their segments
exactly; stored stories are unchanged. This is an engineering reliability
decision, not a new learning-effectiveness claim.

## App-owned kanji segmentation — 2026-10-09.5

A device read of the reported error confirmed the surface segment was
`ホテルは駅`: the detector correctly found the kanji 駅, but the model grouped
it with kana and omitted its reading. Stronger one-pass prompt instructions
did not eliminate this failure.

Japanese generation now has two sequential stages: generate canonical title,
text and glossary, then request contextual readings for app-extracted kanji
spans. The app scans Unicode code points using the Han script property, keeps
contiguous kanji compounds together, and preserves kana, punctuation and
okurigana as plain text. Each span has a unique id, section and UTF-16 offsets
plus context; repeated spellings receive separate ids to allow contextual
pronunciations. `ja-readings.txt` is versioned together with `ja.json`. The
model supplies readings, never annotation boundaries or rewritten story text.

The app requires exactly one valid kana reading per id, rejects missing,
duplicate or unknown ids, and constructs segments whose text exactly reproduces
the canonical source. The existing final validator checks length, vocabulary,
glossary, script and annotations before saving. Cancellation applies to both
stages; a failed stage is not automatically retried and no partial story is
saved. Japanese generation uses two inference calls when kanji are present,
which adds latency and usage. Kana-only text needs no reading call.

This removes model-controlled segmentation and kana/kanji classification. It
does not certify that a supplied kana pronunciation is linguistically correct.
