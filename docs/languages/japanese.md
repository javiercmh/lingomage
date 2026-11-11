# Japanese

Shared rules: [languages README](README.md).

## Current requirements

- **Furigana shown by default** (product requirement): kana readings above the kanji they annotate; hiragana and katakana for the rest; kanji are preserved (a kana-only rewrite or a glossary reading does not satisfy the requirement). The reader shows furigana on the chapter title as well as the story. Learners can turn furigana off for both in the reader's Aa panel; the choice is saved in `readingPreferences`. Supporting the display is a product decision, not a claim about its learning effect.
- **No romaji** anywhere in stories or examples. Kana literacy is assumed at every level; kanji familiarity is described by the level.
- **Canonical text vs annotations:** canonical title and story are stored as plain strings; `titleSegments`/`storySegments` are ordered `{text, reading}` annotations for display. Selection, glossary matching, copy, speech and accessibility use canonical text. Concatenated segment text must reproduce canonical text exactly.
- **Reading placement:** readings only on contiguous kanji runs, whole compounds kept together (学校/がっこう); kana, okurigana, punctuation and whitespace unannotated (行/い + きます; 食/た + べ + 物/もの). Katakana anchors may match their hiragana equivalents during alignment.
- **App-owned readings stage:** after canonical prose and notes validate, the app scans code points by the Han script property, extracts contiguous kanji runs from title, story or example sentences with unique occurrence IDs, section, UTF-16 offsets and context (repeated spellings get separate IDs for contextual pronunciation), and asks the model only for kana readings. It requires exactly one valid nonempty kana reading per ID, rejects missing, duplicate or unknown IDs, aligns readings against the fixed written text, and builds segments itself. Missing, invalid or ambiguous alignments reject the stage without automatic retry or partial saving. Kana-only content skips the call. Glossary popover headwords are not annotated.
- **Legacy display normalization:** saved annotations (including sentence-wide readings) are normalized for display only when alignment is unique; ambiguous ones keep their original display. Stored data and provenance are unchanged.
- **Story memory budgets:** chapter pieces for summaries and the recent prose sent to the writer are budgeted in estimated tokens, counting kana, kanji and CJK punctuation as one each, so a Japanese piece holds about 2000 characters (German about 8000) and ends at 「。！？」 without needing a following space ([PED-003](../pedagogy/PED-003-story-memory-and-paths.md)).
- **Reader:** each annotated segment stays together at line breaks with room for the reading; scalable text must not clip annotations; screen readers must not repeat content. Glossary entries with kanji include the kana reading and a contextual English meaning.

## Rationale and limits

- Model-controlled segmentation was unreliable (see Earlier designs); app-owned extraction removes model control of boundaries and kana/kanji classification. It costs one extra inference call when kanji are present. It does not certify that a supplied pronunciation is correct.
- Annotating only kanji runs follows the standard display convention and avoids implying kana should be read twice; it is a correctness choice, not a measured learning benefit.

## Earlier designs

- **Android prompt 2026-10-09.1–.2:** 8–12 short sentences, polite です/ます, every kanji annotated in one model response. Version .1 allowed readings over whole inflected words (行きます/いきます); the learner found this looked like double reading, so .2 annotated only kanji runs.
- **2026-10-09.3:** removed the duplicate model-generated `text`/`title` copy; canonical text was concatenated from segments so the two could not disagree.
- **2026-10-09.4:** complete examples, required `reading` on every segment, NFC and whitespace trimming, distinct diagnostics for missing, non-kana and oversized segments.
- **2026-10-09.5:** a device error showed the model grouping 駅 with kana (`ホテルは駅`) and omitting its reading even with stronger prompts. Generation split into canonical generation plus app-extracted kanji readings, the basis of the current stage.
- **App² 2026-10-12.3:** returned to one request with app-side alignment; superseded by the current separate readings stage (2026-10-12.4).
- **2026-10-10:** three broad reading bands with free-text self-assessment; replaced by PED-004 standardized targets (2026-10-13).

## Open questions

- Which kana and kanji knowledge each level should assume.
- Which grammar and lexical constraints give readable beginner prose without unnatural Japanese.
- How compounds and inflections should connect to learner-chosen vocabulary.

## Content review criteria

Contextual kana readings, kanji-to-reading alignment, natural script use, glossary accuracy, grammar and readability for the level; multi-character compounds, punctuation, long annotations, wrapping and large fonts on a device. Record reviewer qualifications and unresolved issues.
