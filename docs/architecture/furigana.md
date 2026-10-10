# Furigana rendering

> This describes the earlier native Android renderer. The App² workspace uses
> model-provided segments; see [App² runtime](app2-runtime.md) for its current
> storage and display contract.

The generator returns ordered word/compound segments rather than model-invented
numeric offsets. Validation reconstructs canonical title/story text exactly and
requires kana readings for every segment containing kanji. Japanese prompt
version 2026-10-09.2 places them only over kanji runs and leaves okurigana plain. Local code derives
UTF-16 offsets and stores the annotations separately from canonical text. Kana
and punctuation segments have no reading. Glossary kanji headwords have a full
kana reading. Word grouping and reading correctness need human Japanese review;
structural checks cannot establish them.

`FuriganaText` uses measured Compose inline content. A compound and reading form
one layout unit; the kana reading sits above the preserved base text. Both scale
with system fonts, with a minimum reading size, a width cap and reserved vertical
space. Narrow layouts can wrap unusually long units internally rather than
clipping them. Plain kana remains normal text. Titles, glossary headwords and story-form snippets use
the same renderer. Plain and annotated text resolve the same Material content
color for contrast in dark and light themes. Accessibility exposes canonical reading order with kana in
parentheses and clears child semantics to prevent duplicate announcements.

The default always shows furigana. This fulfills a product requirement, not a
proven optimal method for kanji retention. See the [furigana evidence candidate](../research/japanese-furigana.md)
for the original-source verification gap. Large fonts, compounds and narrow
layout are covered by a device test; screen-reader behavior still needs a manual
TalkBack review before accessibility acceptance is complete.

## Existing whole-word readings

`FuriganaPlacement` aligns fixed kana within a legacy word against its full
reading, requiring a unique solution. Thus 行きます/いきます renders 行 with
い above it, followed by plain きます. Internal and prefix kana are handled
similarly; all-kanji compounds stay grouped. Memoized alignment bounds work by
surface parts and reading offsets. New ambiguous/mismatched output is rejected;
ambiguous legacy data is preserved. This is display normalization, not a rewrite
of canonical story text or a pronunciation dictionary.

### Japanese text consistency — prompt 2026-10-09.3

Japanese generation now omits duplicate `text` and `title` fields. Canonical
story and title text are concatenated from `segments` and `titleSegments`,
preserving every character and deriving annotation offsets from that same
source. This removes a redundant model-generated copy that could disagree.
Length, sentence count, vocabulary, glossary and furigana checks still apply.
Legacy responses containing explicit text must still match their segments
exactly; stored stories are unchanged. This is an engineering reliability
decision, not a new learning-effectiveness claim.

Prompt 2026-10-09.4 adds complete sentence/title examples and explicit reading
completeness checks. Reading strings are trimmed and Unicode NFC-normalized;
canonical text is not normalized. Missing readings, non-kana readings and
oversized segments remain validation failures with separate messages naming
the surface text and whether it occurs in the title or story.

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
