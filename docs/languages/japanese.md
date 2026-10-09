# Japanese

Status: initial requirements recorded; initial implementation present; deeper pedagogical review pending.

## Confirmed presentation requirements

- English interface and English glossary explanations.
- Display **furigana by default**: kana readings above the kanji they annotate.
- Use hiragana and katakana for the rest of the Japanese story text.
- Preserve kanji in the story; a separate kana-only replacement or a glossary
  reading does not satisfy the furigana requirement.

These are user-defined product requirements. Their learning effects still need
research review; do not describe them as experimentally validated by LingoMage.

See the [furigana discovery record](../research/japanese-furigana.md) for the
initial evidence candidate and unresolved original-source verification.

## Reader contract for the post-authentication stage

- Represent reading annotations as ordered text segments, each containing base
  text and an optional kana reading. Keep annotation data separate from rendered UI.
- Attach a reading to the word or compound it belongs to, rather than assigning
  independent readings mechanically to individual kanji.
- Preserve canonical story text alongside annotations so storage, selection,
  glossary matching, and accessibility do not depend on layout.
- Render the reading above its base text. Keep each annotated segment together
  at line breaks and reserve sufficient vertical space for the reading.
- Glossary entries containing kanji also include their kana reading and an
  English meaning in the story's context.
- Generation and validation must account for inflected forms and context-dependent
  readings; generated annotations require Japanese-specific content review.
- Support scalable text without clipping annotations. Screen-reader output must
  preserve reading order without unintentionally repeating the same content.

## Initial learning assumptions

- Use short sentences rather than whitespace-based word-length targets.
- Treat A1 as a beginner-oriented target, not as a guarantee or a JLPT N5 mapping.
- Do not use romaji in the initial story experience.

## Research questions

- How does always-visible furigana affect comprehension and kanji learning for beginners?
- Which kana and kanji knowledge should the first stories assume?
- What grammar, sentence structure, and lexical constraints produce readable
  beginner stories without unnatural Japanese?
- How should compound words and inflections connect to learner-selected vocabulary?

## Content and reader review

Check kana readings in context, kanji-to-reading alignment, natural script use,
vocabulary coverage, glossary accuracy, beginner grammar, and sentence readability.
Check multi-character compounds, punctuation, long annotations, wrapping, and
large font settings on a device. Record reviewer qualifications and unresolved issues.

## Implemented prompt decision — 2026-10-09.2

Write Japanese in exactly 8–12 short sentences ending in 。 or ！ or ？. Favor everyday vocabulary, simple particles and consistent polite です/ます forms. Do not imply equivalence to JLPT N5. Preserve appropriate kanji; use hiragana and katakana for the rest. Never use romaji. Annotate EVERY kanji in BOTH text and title by replacing the empty segments/titleSegments arrays with ordered {"text":"surface","reading":"kana"} segments. Concatenating segment text must EXACTLY reconstruct the canonical text/title, including punctuation and whitespace. Place readings ONLY above kanji runs. Keep compounds made entirely of kanji together, not split mechanically by character. Written kana (including okurigana and prefixes) must be separate segments with reading:null. For example 行きます becomes [{"text":"行","reading":"い"},{"text":"きます","reading":null}], 食べます becomes 食/た + べます/null, and 学校 stays 学校/がっこう. Never annotate 行きます with いきます or duplicate its written kana in the reading. Each segment containing kanji must have its full kana reading. Kana-only and punctuation segments use reading:null. Keep individual kanji-containing segments under 20 characters. In glossary entries whose headword includes kanji, supply the full headword reading in kana. English meanings stay English.

These are product assumptions and linguistic presentation requirements, not a
validated curriculum. Shared rationale remains in the [reading review](../research/reading-and-glossing.md).
Prompt source: [ja.json](../../android/app/src/main/assets/prompts/ja.json).

### Okurigana correction

Version 2026-10-09.1 permitted readings above whole inflected words, such as
行きます/いきます. The user identified that this can look like kana should be
read twice. Version .2 annotates only kanji runs: 行/い + きます, 食/た + べます,
while retaining whole kanji compounds such as 学校/がっこう. Mixed words such as
食べ物 use 食/た + べ + 物/もの. This is a standard display convention and a
product correction, not an experimentally established learning benefit.

New annotations align fixed written kana against the proposed reading and reject
mismatched or ambiguous alignments. Existing stories are normalized for display
only when the alignment is unique; canonical text, original annotation data and
saved prompt version remain unchanged. An ambiguous legacy annotation retains
its original display rather than inventing pronunciation. This does not detect
every wrong kanji reading; human Japanese review remains necessary.
