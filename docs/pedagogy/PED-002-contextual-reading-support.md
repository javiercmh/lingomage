# PED-002: Contextual help for selected text

- Date: 2026-10-11
- Status: implemented; learner usefulness and language quality unvalidated
- Scope: reading support for German, Japanese, Russian and Spanish stories
- Evidence basis: product requirement and evidence-informed extrapolation; no direct evaluation of this feature

## Decision and learner need

Readers may select a word or phrase and request a concise English explanation with its contextual meaning, relevant grammar or usage, and an estimate of likely difficulty relative to their saved reading profile. The reader may request more detail. Responses remain attached to the exact story chapter version and selection for offline reference. Follow-up prompts add chapters; rewrite prompts create alternate versions of the current chapter.

The difficulty note is a model-generated estimate from the reported learner profile and selected story level. It is not a proficiency score, a mastery claim, or certified CEFR alignment. Language expectations can guide regional usage and register. Japanese support preserves canonical Japanese and furigana as a separate display annotation; Russian support does not transliterate Cyrillic.

These interaction choices are product assumptions. No study cited here tests this implementation, the four target languages, or AI-generated explanations.

## Evidence and limits

Self-reports can inform adaptation but do not establish an individual's proficiency. The appraisal of self-assessment evidence in [the self-assessment review](../research/self-assessment.md) cites `liZhang2021SelfAssessment` and `tigchelaarEtAl2017CanDoValidity`; those studies do not validate LingoMage's free-text profile or model-based difficulty estimates.

The [reading and glossing review](../research/reading-and-glossing.md) finds support for glossed reading with heterogeneous, partial outcomes. This supports offering contextual help as an option, not claiming that it improves learning or predicts retention. Its meta-analysis references do not yet have stable BibTeX entries in `references.bib`; no new citation key is invented here.

## Implementation

The full-screen reader stores ordered chapters, alternate versions, and passage help in `data/stories.json`; legacy one-story records are interpreted as one chapter in memory. Reading text size and furigana preference are stored in `data/settings.json`. Saved help records the passage offsets, source version, learner profile snapshot, model and prompt version.

Implementation: [App² reader](../../js/app.js), [reader UI](../../index.html), [reader styles](../../css/style.css), [runtime contract](../architecture/app2-runtime.md). Prompt version: `2026-10-11.2`.

## Alternatives and revisit conditions

Keep help opt-in and brief. Revisit the content and difficulty framing after qualified language review and learner evaluation. Revisit the ruby selection implementation if Android testing shows that visible furigana blocks reliable selection of the base text; disabling furigana is not a selection workaround.

See [reader validation](../validation/2026-10-11-reading-mode.md); Android selection behavior and content review remain pending until actually checked.

Audit refinement: continuation always appends after all existing active chapters, regardless of the chapter currently displayed. Contextual requests include the story difficulty alongside the current learner profile. More-detail responses preserve their own profile/model/prompt provenance. These remain product choices, not additional evidence of effectiveness.
