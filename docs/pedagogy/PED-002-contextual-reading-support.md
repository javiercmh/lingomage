# PED-002: Contextual help for selected text

- Date: 2026-10-11
- Status: implemented; learner usefulness and language quality unvalidated
- Scope: reading support for German, Japanese, Russian and Spanish stories
- Evidence basis: product requirement and evidence-informed extrapolation; no direct evaluation of this feature

## Decision and learner need

Readers may select a word or phrase and request a concise English explanation with its contextual meaning, relevant grammar or usage, adapted silently to their saved reading profile. The reader may open More detail and optionally enter a one-line question before requesting a follow-up. Opening the field makes no AI request. Generate examples directly requests three short sentences demonstrating the same meaning or grammatical function in varied contexts, each with a relevant-form highlight and English translation. Responses remain attached to the exact story chapter version and selection for offline reference. Follow-up prompts add chapters; rewrite prompts create alternate versions of the current chapter.

Generated glossary forms appear inline with a subtle underline. A tap or keyboard activation opens their existing English note; matching uses exact glossary forms and does not generate further explanations. In App², learners can hear selected text through the native Android selection menu. The reader supplies the story language through HTML `lang`, while voice selection uses Android’s configured text-to-speech engine and voice. These presentation and pronunciation choices are product assumptions; no direct study evaluates them or their effect on learning.

Help explains the exact selected text, including fragments within words, using surrounding words or clauses only to clarify its function. The card shows an AI-chosen contiguous source excerpt containing the selection, with the exact occurrence highlighted by the app. A short context translation is optional when useful. The initial explanation is one short paragraph; it does not explain unrelated vocabulary, teach assumed-known scripts, recap the profile, or assess the learner's ability. Fragments may have no standalone translation. These rules apply to German, Japanese, Russian and Spanish. Language expectations can guide regional usage and register. Japanese support preserves canonical Japanese and furigana as a separate display annotation; Russian support does not transliterate Cyrillic. Follow-ups remain focused on the same selection and can build on earlier explanations.

These interaction choices are product assumptions. No study cited here tests this implementation, the four target languages, or AI-generated explanations. Saved explanation cards appear newest first. A long press enters compact checkbox selection so learners can remove multiple explanations together. The mode exits when the last explanation is deselected or the learner taps the green checkmark. This interaction does not change generated explanations or provenance.

## Evidence and limits

Self-reports can inform adaptation but do not establish an individual's proficiency. The appraisal of self-assessment evidence in [the self-assessment review](../research/self-assessment.md) cites `liZhang2021SelfAssessment` and `tigchelaarEtAl2017CanDoValidity`; those studies do not validate LingoMage's free-text profile or model-based difficulty estimates.

The [reading and glossing review](../research/reading-and-glossing.md) finds support for glossed reading with heterogeneous, partial outcomes. This supports offering contextual help as an option, not claiming that it improves learning or predicts retention. Its meta-analysis references do not yet have stable BibTeX entries in `references.bib`; no new citation key is invented here.

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
