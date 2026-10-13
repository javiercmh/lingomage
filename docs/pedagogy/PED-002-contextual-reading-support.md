# PED-002: Contextual help for selected text

- Date: 2026-10-11
- Status: implemented; learner usefulness and language quality unvalidated
- Scope: reading support for German, Japanese, Russian and Spanish stories
- Evidence basis: product requirement and evidence-informed extrapolation; no direct evaluation of this feature

## Decision and learner need

Readers may select a word or phrase and request a concise English explanation with its contextual meaning, relevant grammar or usage, adapted silently to their saved reading profile. The reader may open More detail and optionally enter a one-line question before requesting a follow-up. Opening the field makes no AI request. Generate examples directly requests three short sentences demonstrating the same meaning or grammatical function in varied contexts, each with a relevant-form highlight and English translation. Responses remain attached to the exact story chapter version and selection for offline reference. Follow-up prompts add chapters; rewrite prompts create alternate paths through a new version of the current chapter; see [PED-003](PED-003-story-memory-and-paths.md).

Generated glossary forms appear inline with a subtle underline. A tap or keyboard activation opens their existing English note; matching uses exact glossary forms and does not generate further explanations. In App², learners can hear selected text through the native Android selection menu. The reader supplies the story language through HTML `lang`, while voice selection uses Android’s configured text-to-speech engine and voice. These presentation and pronunciation choices are product assumptions; no direct study evaluates them or their effect on learning.

Help explains the exact selected text, including fragments within words, using surrounding words or clauses only to clarify its function. The card shows an AI-chosen contiguous source excerpt containing the selection, with the exact occurrence highlighted by the app. A short context translation is optional when useful. The initial explanation is one short paragraph; it does not explain unrelated vocabulary, teach assumed-known scripts, recap the profile, or assess the learner's ability. Fragments may have no standalone translation. These rules apply to German, Japanese, Russian and Spanish. Language expectations can guide regional usage and register. Japanese support preserves canonical Japanese and furigana as a separate display annotation; Russian support does not transliterate Cyrillic. Follow-ups remain focused on the same selection and can build on earlier explanations.

These interaction choices are product assumptions. No study cited here tests this implementation, the four target languages, or AI-generated explanations. Saved explanation cards appear newest first. A long press enters compact checkbox selection so learners can remove multiple explanations together. The mode exits when the last explanation is deselected or the learner taps the green checkmark. This interaction does not change generated explanations or provenance.

## Evidence and limits

Self-reports can inform adaptation but do not establish an individual's proficiency. The appraisal of self-assessment evidence in [the self-assessment review](../research/self-assessment.md) cites `liZhang2021SelfAssessment` and `tigchelaarEtAl2017CanDoValidity`; those studies do not validate LingoMage's free-text profile or model-based difficulty estimates.

The [reading and glossing review](../research/reading-and-glossing.md) finds support for glossed reading with heterogeneous, partial outcomes. This supports offering contextual help as an option, not claiming that it improves learning or predicts retention. The glossing meta-analysis is recorded as `yanagisawaWebbUchihara2020Glossing` ([DOI](https://doi.org/10.1017/S0272263119000688)); it does not establish an optimal frequency for displaying notes.

## Implementation

The full-screen reader stores ordered chapters, alternate versions, and passage help in `data/stories.json`; legacy one-story records are interpreted as one chapter in memory. Reading text size and furigana preference are stored in `data/settings.json`. Saved help records the passage offsets, source version, learner profile snapshot, model and prompt version. The reader displays explanations newest first while preserving stored order and keeps follow-ups attached to their explanation. My stories uses long-press bulk selection and a confirmation before deleting stories and their contained learning records.

Implementation: [App² reader](../../js/app.js), [canonical reader text](../../js/reader-text.js), [reader UI](../../index.html), [reader styles](../../css/style.css), [runtime contract](../architecture/app2-runtime.md). Prompt version: `2026-10-11.7`.

## Alternatives and revisit conditions

Keep help opt-in and brief. Revisit the focus and follow-up interaction after qualified language review and learner evaluation. Revisit the ruby selection implementation if Android testing shows that visible furigana blocks reliable selection of the base text; disabling furigana is not a selection workaround.

See [context and examples validation](../validation/2026-10-11-context-examples.md), [focused-help validation](../validation/2026-10-11-focused-help.md) and [earlier reader validation](../validation/2026-10-11-reading-mode.md); Android selection behavior and content review remain pending until actually checked.

Audit refinement: continuation always appends after all existing active chapters, regardless of the chapter currently displayed. Contextual requests include the story difficulty alongside the current learner profile. More-detail responses preserve their own profile/model/prompt provenance. These remain product choices, not additional evidence of effectiveness.

Selection requests include canonical sentence text and UTF-16 offsets identifying the selected occurrence. Saved follow-ups add the question, response and their own profile/model/prompt provenance; existing saved explanations remain unchanged. Focusing help and silently adapting it are product assumptions, not additional evidence of learning effectiveness.

Context boundaries reference canonical story text; invalid excerpts fall back to the containing sentence without retaining a possibly mismatched translation. Examples have validated UTF-16 highlight boundaries and separate Japanese reading annotations. Saved follow-ups explicitly distinguish detail and examples; previous untyped follow-ups remain detail responses. Three examples and this output structure are product assumptions with no direct validation of learning effects. Language accuracy remains a separate review requirement.

More detail asks for a useful contextual explanation in plain English paragraphs and returns plain text, removing JSON parsing for this text-only response. The decoder continues to accept legacy JSON detail objects with a non-empty `explanation` string, preserving saved history compatibility. Earlier validation records mention prose-prefixed responses, but the exact cause of the reported Android failures has not been confirmed from a captured response. There is no silent inference retry; failures retain a manual retry path and submitted question. The reader keeps saved explanations visible during generation and binds each loading panel to the relevant story version and explanation card. Long-press selection begins only on non-text card surfaces so learners can still select explanation text and use native text actions. One Explanations section groups all saved help, while examples remain within their card behind a divider. These interaction decisions are product assumptions and have not been evaluated for usability or learning outcomes.


Formatting refinement (prompt `2026-10-11.8`): detail responses remain text rather than JSON, with optional bold, italic and inline code for display. The renderer also handles saved and legacy detail text without changing its provenance or stored content. Unsupported syntax stays literal and model HTML is never interpreted. Explanation selection uses a floating bottom bar; partial-selection activation selects all explanations in the displayed version, and full-selection activation clears selection and exits. These are presentation and interaction product assumptions, with no additional evidence of learning effectiveness.

### Story-led creation and chapter support (prompt `2026-10-11.9`)

Create starts with a story brief and topics to explore before language and difficulty. The brief may include genre, tone or format; topics may describe vocabulary domains, situations, grammar concepts or particular expressions. Each generated chapter or rewrite requests its own contextual glossary, carrying forward original topics and learner context. Each output advances the narrative and leaves a natural reason to continue unless the learner explicitly requests closure. Saved chapters remain separate, and old records are unchanged.

Vocabulary notes offer Listen beside the displayed headword through native App² speech, without Japanese readings in canonical spoken text. Continuation and rewrite use cancellable status cards while existing reading content remains available. These are product assumptions about engagement, discoverability and continuity; no cited research validates this design or AI narrative endings. The existing evidence and limitations above (`liZhang2021SelfAssessment`, `tigchelaarEtAl2017CanDoValidity`, and the reading/glossing review) remain applicable; no additional effectiveness claim is made.

Optional chapter prompts (prompt `2026-10-11.10`): learners may submit Continue or Rewrite with a blank prompt. Continuation proceeds naturally from existing active chapters; rewrite creates a fresh telling preserving the chapter’s main events and narrative role. Existing topics, learner context, fresh glossary guidance and open-ended default remain in effect. Save the actual empty prompt, rather than inventing learner instructions. These defaults are product assumptions; no new evidence or learning-effectiveness claim is made.

Multilingual input invitation: Create explicitly permits English, the learning language, or mixed-language ideas and topics. Story idea invites optional target-language writing, and chapter prompt placeholders accept ideas in any language. Inputs continue to guide narrative generation; the app does not promise correction or assessment of learner writing. This is a discoverability and practice opportunity assumption, not evidence of learning effects. Copy-only changes leave prompt versions and saved provenance unchanged.


Current generation profiles and narrative scope follow [PED-004](PED-004-level-guided-generation.md). Its standardized self-selected targets supersede older broad-band/freeform-profile references for new requests; contextual explanation behavior and saved provenance remain in effect.

### First-occurrence glossary display (prompt `2026-10-13.13`)

Show each glossary explanation only at its first eligible occurrence in the displayed chapter version. Later occurrences remain plain text and can still be selected for Explain. Resolve longest-form overlaps before selecting first occurrences. Identity consists of the headword and English meaning, normalized to NFC with trimmed/collapsed whitespace; preserve case and punctuation. Alternate forms and equivalent duplicate records share an identity; different meanings remain distinct. Rendering, chapter navigation and alternate versions each recompute this local selection without changing stored glossary or provenance.

Japanese matches spanning annotation segments retain complete ruby readings and canonical copy text. Their fragments share one popup anchor and one keyboard control. Cancellation buttons record intent even while a stage is starting, so a newly returned request ID is cancelled before waiting or starting the next stage.

First-only display is the learner's requested product preference for reducing repeated help, not an evidence-based optimum or a claim of better retention. `yanagisawaWebbUchihara2020Glossing` ([DOI](https://doi.org/10.1017/S0272263119000688)) supports glossed reading broadly; it does not directly test this display policy, these four languages or AI explanations. No density cap or mandatory glossary coverage is introduced. See [validation](../validation/2026-10-13-first-glossary-occurrence.md).
## Device translation (2026-10-12)

The selected-text toolbar offers Translate alongside Speak and Explain. Translate opens the user-configured device translation tool with canonical selected text, omitting Japanese readings. The external tool controls language detection and output language; this does not change the English explanation contract. Availability depends on the host and installed translation handlers. This is an optional reading-support product assumption, with no direct evidence of effectiveness for this implementation. Prompt provenance advances to `2026-10-12.1`; existing saved records retain their original provenance.

Whole-chapter listening (prompt provenance `2026-10-12.2`): the reader provides an opt-in Listen icon beside its title, reading canonical prose from the displayed chapter in the story locale. This extends the existing pronunciation support without changing AI prompts or saved text. Whole-chapter listening is a product assumption; no additional learning-effectiveness claim is made. Long prose uses sequential utterances and stops on cancellation or reader navigation.

## App² furigana placement correction — 2026-10-12

Prompt provenance `2026-10-12.3` requires readings only on contiguous kanji runs, retaining whole compounds and leaving kana, okurigana, punctuation and whitespace unannotated. App² continues to use one story inference request. The app extracts kanji runs and aligns supplied readings against fixed written text; katakana anchors may match their hiragana equivalents. New title/story annotations and Japanese help examples must reconstruct canonical text and have exactly one valid alignment with nonempty kana readings for every kanji run. Missing, invalid or ambiguous readings reject the response without automatic inference retry or partial saving.

Saved story and example annotations are normalized for display only when alignment is unique, including sentence-wide legacy readings. Ambiguous legacy annotations retain their original display; canonical text, stored annotation data and original prompt provenance remain unchanged. Copy and speech continue to omit readings. This restores the existing kanji-only presentation convention; it is a product correctness choice, not a new claim of learning effectiveness. Alignment cannot establish linguistic correctness of a pronunciation; Japanese content review remains necessary. See [validation](../validation/2026-10-12-furigana.md).

## Current learning safeguards — prompt 2026-10-12.4

Every chapter intentionally supplies expressions or concepts for learning/practice based on the learner profile, story and wishes, including blank practice input. A nonempty glossary is required, but there is no fixed pedagogical quota beyond one structurally valid note; underlines keep help learner-controlled. Japanese stories/examples use app-owned contextual reading stages with durable checkpoints. Popover headwords are unchanged. These are product choices, not proven learning effects; the existing evidence limitations and citation keys `liZhang2021SelfAssessment` and `tigchelaarEtAl2017CanDoValidity` remain applicable. Deterministic checks cannot prove novelty, semantic correctness or pedagogical suitability. See [safeguard audit](../architecture/language-safeguards.md).

### Integrated checkpoint and reader support (prompt `2026-10-13.14`)

First-only glossary display coexists with app-owned Japanese reading boundaries, chapter Copy/Listen, floating selection actions, device translation and generation status. The unified story pipeline adds planning before prose/readings and saves intermediate results in the checkpoint user file before release. Examples reuse prose/readings without a story language plan. Numeric length quotas are explicitly retired by PED-004; nonempty useful notes, structural bounds and script/reading checks remain enforced. This supersedes older generation storage/annotation descriptions without changing saved-story provenance. Existing citations and evidence limits remain applicable; no new efficacy claim is made.
