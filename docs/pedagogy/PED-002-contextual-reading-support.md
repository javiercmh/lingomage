# PED-002: Contextual help for selected text and vocabulary notes

- Date: 2026-10-11; current state at prompt version `2026-10-14.21`
- Status: implemented; learner usefulness and language quality unvalidated; qualified language review pending
- Scope: reading support in German, Japanese, Russian and Spanish stories
- Evidence basis: product requirements and evidence-informed extrapolation; no direct evaluation of this feature

Interaction details are in [`DESIGN.md`](../../DESIGN.md); pipeline and storage in the [runtime doc](../architecture/app2-runtime.md); Japanese script handling in [japanese.md](../languages/japanese.md).

## Decisions

### Explain selected text

- The learner selects any word, phrase or fragment and asks for a concise English explanation of its contextual meaning and relevant grammar or usage, silently adapted to the learner's level. It covers the exact selection, including fragments within words; surrounding text only clarifies function. Fragments may have no standalone translation.
- Initial help is one short paragraph: no unrelated vocabulary, no teaching of assumed scripts, no profile recap, no assessment.
- The card shows a model-chosen contiguous source excerpt containing the selection, with the exact occurrence highlighted by the app, and an optional short context translation. An invalid excerpt falls back to the containing sentence, dropping any possibly mismatched translation.
- **More detail** is opt-in (opening the field makes no request) with an optional one-line question; follow-ups stay on the same selection and may build on earlier answers. Plain English paragraphs; light formatting only, model HTML never interpreted.
- **Generate examples:** three short sentences showing the same meaning or grammatical function in varied contexts, each with a validated highlight and English translation.
- Help stays attached to the exact chapter version and selection for offline reference; saved help is never rewritten.
- **Translate** opens the learner's device translation tool with canonical text (no readings); the external tool chooses languages and may process text online. It does not change the English explanation contract.
- **Listening:** selected text, note headwords and whole chapters can be spoken through Android TTS in the story language, always canonical text without readings, glossary or explanations. Sentence controls are conveniences: Pause stops and Resume repeats the sentence (the host exposes no native pause or word position); sentence boundaries come from `Intl.Segmenter` or punctuation and may differ from a teacher's; one utterance per sentence adds short gaps.

### Vocabulary notes

- Every chapter has a nonempty set of English notes; at least one structurally valid note is required, with no pedagogical quota or cap (the former 100-note cap was removed at the learner's request). Underlines keep help learner-controlled.
- Notes come from a separate request after canonical prose is validated and checkpointed. It asks for most meaningful words and useful expressions (common words, contextual inflections, idioms, constructions, pronouns, possessives, determiners, useful function words), skipping routine proper names and duplicate meanings. The level guides explanation complexity; it is not a presumption that words are known.
- Schema: English meaning, headword (`word`, a schema name, not a claim of one orthographic word) and exact `forms`. Forms are resolved tolerantly to attested chapter text; unattested forms are dropped, and a note with none is discarded rather than failing the chapter. Forms only in the title or plan do not count.
- Grouped forms need compatible explanations. The prompt distinguishes referents, person and number, association versus ownership, prefers disambiguating attested phrases, and explains discontinuous constructions without assigning their meaning to an isolated particle.
- Display: each note appears once, at its first eligible occurrence in the displayed version (identity = headword + meaning, NFC, trimmed and collapsed whitespace, case and punctuation preserved; longest overlaps first); later occurrences stay selectable for Explain. Recomputed on render without changing stored data.
- Terminology for notes: [lexical-unit review](../research/lexical-units.md).

### Creation and continuation

- Create leads with one combined story idea and topics brief (genre, tone, format, vocabulary domains, situations, grammar concepts, expressions), in English, the target language or both; the app does not promise to correct learner writing. Older stories keep separate topic and practice values.
- Each chapter or rewrite gets its own glossary and carries forward the original topics and learner context. Chapters advance the narrative and leave a natural reason to continue unless closure is requested.
- Blank Continue proceeds naturally; blank Rewrite retells the main events and narrative role. The actual empty prompt is saved; no instructions are invented. Paths: [PED-003](PED-003-story-memory-and-paths.md). Levels and scope: [PED-004](PED-004-level-guided-generation.md).

## Evidence and limits

- **Self-report** informs adaptation but does not establish proficiency (`liZhang2021SelfAssessment`, `tigchelaarEtAl2017CanDoValidity`; [self-assessment review](../research/self-assessment.md)).
- **Glossed reading** has support with heterogeneous, partial outcomes ([reading and glossing review](../research/reading-and-glossing.md)). `yanagisawaWebbUchihara2020Glossing` ([DOI](https://doi.org/10.1017/S0272263119000688)) supports offering contextual help as an option; it does not test first-occurrence display, these languages or AI explanations, and does not fix an optimal frequency.
- **Reading-first practice** has small-to-medium, possibly overestimated support, mostly for sustained classroom reading, not one-off AI chapters: `sangersEtAl2025ExtensiveReading` ([DOI](https://doi.org/10.1007/s10648-025-10068-6)); `hamada2020ExtensiveReadingBias` ([DOI](https://doi.org/10.3389/fpsyg.2020.00617)) lowered one estimate after correcting selection bias.
- **Repeated encounters** correlate with incidental learning without a required count (`uchiharaEtAl2019Repetition`, [DOI](https://doi.org/10.1111/lang.12343)), so natural reuse remains a product assumption.
- **Product assumptions** (no direct evidence): focused and silently adapted help, three examples, first-occurrence display, broad note coverage, no density cap, Listen and Translate, sentence playback controls, story-led creation, multilingual input, open-ended endings, and all presentation choices.
- Structural validation cannot establish semantic accuracy, useful coverage, level suitability or pedagogical value; language review is separate. The cause of reported Android failures with prose-prefixed detail responses was never confirmed from a captured response.
- Retrieval, review and instruction are not implemented; they are research candidates in the [strategy](../product/evidence-informed-strategy.md).

## Implementation

- Code: `js/app.js` (reader, help requests), `js/reader-text.js` (canonical text, glossary display), `js/learning-validation.js` (validation, notes prompt `NOTES_INSTRUCTIONS`).
- Provenance: saved help records passage offsets, source version, profile snapshot, model and prompt version; follow-ups add question, response and their own provenance; legacy JSON detail objects remain readable. Prompt or learning-behavior changes increment `PROMPT_VERSION`; copy and presentation changes do not; saved records never relabel.
- Lookups of notes, explanations, follow-ups, examples and translations are recorded under [PED-005](PED-005-consultation-signals.md); recording changes no help content or prompt.

## Open evaluation

A controlled contextual-accuracy comparison of notes prompts is designed but not run: 24 frozen revised-pilot chapters plus seven focused cases. Promotion requires qualified adjudication, fewer material errors overall, no increase per language or in missing useful support, correct focused outputs, and a new `PROMPT_VERSION`; AI preference alone is insufficient. See the [comparison design](../validation/generation-evaluation/contextual-notes/README.md) and [generation evaluation](../validation/generation-evaluation/README.md).

## Revisit when

- Qualified language review or learner evaluation finds notes or explanations confuse learners or do not support comprehension.
- Android testing shows visible furigana blocks reliable selection of base text (disabling furigana is not an acceptable workaround).

## Decision history

- 2026-10-11: contextual Explain, follow-ups and examples introduced.
- 2026-10-13: notes moved to a separate request after prose; 100-note cap removed.
- 2026-10-14: consolidated at prompt `2026-10-14.21`.
- 2026-10-19: evidence revision (extensive reading, repetition) with no behavior change.
- 2026-11-08: lookups recorded under PED-005.
