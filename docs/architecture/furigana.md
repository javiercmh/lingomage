# Furigana rendering

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
