# PED-004: Standardized reading targets and planned story language

- Date: 2026-10-13
- Status: implemented; language and pedagogical validation pending
- Supersedes: [PED-001](PED-001-learner-self-report.md) for new settings and generation
- Scope: German and Spanish CEFR A1–C2, Japanese JLPT N5–N1, Russian Elementary/Basic/TORFL-I–IV (with A1–C2 references)
- Evidence basis: evidence-informed extrapolation; no direct evaluation

## Decisions

- **Level:** one self-selected Reading level per language with a short English reading-task description, plus separate regional and tone preferences; per-story and per-version overrides. Labels orient generation; they do not measure proficiency. CEFR names are explanatory shorthand; JLPT and TORFL keep their own labels. New generation requires an explicit selection; no conversion from old bands is guessed.
- **Scope instead of quotas:** Scene (default) or Chapter replaces numeric word and sentence quotas (safeguard LANG-001 retired). Longer passage was dropped because it was hard to distinguish from Chapter (product decision); saved `longer` reads as Chapter. A 30000-unit technical bound remains.
- **Language plan:** a bounded optional plan first (at most five vocabulary candidates and two grammar focuses, possibly none), then natural prose, then contextual notes ([PED-002](PED-002-contextual-reading-support.md)), then Japanese readings. Focuses are optional practice targets, not an allowed-language list or a repetition schedule; coherence and suitable surrounding language take priority over coverage. The five candidates do not cap the glossary. Underlines are support links, not measured unknown-word coverage.
- **No adaptive progression:** no reader feedback or automatic level change. Lookup signals ([PED-005](PED-005-consultation-signals.md)) never change the level, guidance or plan.
- Stages are checkpointed before acknowledgement; retries are explicit ([runtime](../architecture/generation-pipeline.md#generation)).

## Evidence

Source records: [level-guided generation review](../research/level-guided-generation.md), [level descriptors](../research/level-descriptors.md).

| Key | Motivates | Limit |
| --- | --- | --- |
| `liZhang2021SelfAssessment` ([DOI](https://doi.org/10.1177/0265532220932481)) | Cautious self-selection | Moderate correlation; not placement |
| `ashton2014ReadingSelfAssessment` ([DOI](https://doi.org/10.1016/j.system.2013.11.006)) | Reading-specific, language-sensitive descriptions | Does not validate our descriptions |
| `hermanLeeser2022LexicalCoverage` ([DOI](https://doi.org/10.1111/modl.12761)) | Limiting unnecessary unfamiliar vocabulary | Cannot identify individual knowledge |
| `crossleyAllenMcNamara2012Simplification` ([DOI](https://doi.org/10.1177/1362168811423456)), `odo2025ModifiedInput` ([DOI](https://doi.org/10.18823/asiatefl.2025.22.2.4.253)) | Accessible syntax, cohesion and elaboration | Not generated text |
| `glandorfMeurers2024GrammarControl` ([record](https://consensus.app/papers/towards-finegrained-pedagogical-control-over-english-glandorf-meurers/17f1501f56d65358904e9a22f594501a/)) | Explicit grammar guidance in generation | Does not validate our planning method |
| `malikEtAl2024CALM` ([DOI](https://doi.org/10.48550/arxiv.2406.03030)) | Evaluating actual outputs | Not our languages or prompts |
| `yanagisawaWebbUchihara2020Glossing` ([DOI](https://doi.org/10.1017/S0272263119000688)) | Contextual glosses | Format and L1 limits |
| `uchiharaEtAl2019Repetition` ([DOI](https://doi.org/10.1111/lang.12343)), `sangersEtAl2025ExtensiveReading` ([DOI](https://doi.org/10.1007/s10648-025-10068-6)) | Optional focuses rather than a repetition schedule; modest reading effects | No encounter count established; neither tests generated stories |

**Product assumptions:** the stage split, focus bounds, simplified descriptors, app-authored level guides and narrative scopes. Script prerequisites are product requirements. No certified CEFR/JLPT/TORFL alignment, measured lexical coverage or learning effect is claimed.

## Implementation

- Definitions: `data/learning-profiles.json`. Orchestration: `js/story-generation.js`, `js/generation-pipeline.js`, `js/learning-validation.js`, `js/app.js`.
- Settings keep old enablement and self-assessment values and add standardized selections. Each generated version keeps plan, level and framework, scope, exact learner context and provider, model, prompt and profile provenance.
- Active safeguards LANG-002–009 and GEN-001–004 ([register](../architecture/safeguards.md)); Russian stress allowed when requested.
- Tests: `tests/story-generation-regression.cjs`, `tests/learning-safeguards.mjs`.

## Open experiment

A candidate planning/writing prompt (development `prose` suite) uses `guidance` to identify likely vocabulary and construction load and accessible phrasings, and checks avoidable difficulty against the level guide while keeping natural language. Same schemas, stages and request counts. Not shipped; requires notes-prompt selection, separate level-fit, naturalness and continuity review, and a new `PROMPT_VERSION`. See the [comparison instructions](../evaluation/generation-tests/notes-prompt-experiment/README.md).

## Revisit when

Level choices confuse learners, generated prose is consistently unsuitable for the chosen level, or a measured placement requirement emerges.

## Decision history

- 2026-10-13: standardized targets, scope and planning (prompt 2026-10-13.14); LANG-001 retired; cancellation at stage boundaries, script validation and shared glossary matching corrected in an implementation audit; notes split into their own stage.
- 2026-10-14: prose candidate prepared (not shipped).
- 2026-10-19: evidence note on repetition and extensive reading; no behavior change.
- 2026-11-08: lookup signals confirmed not to affect the level.
