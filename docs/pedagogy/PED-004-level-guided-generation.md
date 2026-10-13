# PED-004: Standardized reading targets and planned story language

- Date: 2026-10-13
- Status: implemented; language and pedagogical validation pending
- Supersedes: [PED-001](PED-001-learner-self-report.md) for new Settings and generation; historical provenance remains intact.
- Scope: German/Spanish CEFR A1–C2, Japanese JLPT N5–N1, Russian Elementary/Basic/TORFL-I–IV (A1–C2).

## Decision

Use one self-selected Reading level with a short English reading-task description, plus separate regional/tone preferences. Keep per-story and per-version overrides. Level labels orient generation rather than measure proficiency. Replace numerical story word/sentence quotas with Scene, Chapter and Longer passage; default Scene.

Generate a bounded language plan first (at most five vocabulary candidates and two grammar focuses, possibly none), then natural prose and its contextual glossary. These are optional practice focuses, not an exhaustive allowable language list. Prefer coherence and suitable surrounding language to mandatory coverage. No reader-feedback feature or automatic level progression is implemented. Persist checkpoints and final story data before request acknowledgement; inference retry is explicit.

## Evidence and assumptions

See [the evidence review](../research/level-guided-generation.md) for access levels and source records. `liZhang2021SelfAssessment` ([DOI](https://doi.org/10.1177/0265532220932481)) motivates cautious self-selection. `ashton2014ReadingSelfAssessment` ([DOI](https://doi.org/10.1016/j.system.2013.11.006)) motivates reading-specific language-sensitive descriptions. `hermanLeeser2022LexicalCoverage` ([DOI](https://doi.org/10.1111/modl.12761)) motivates limiting unnecessary unfamiliar vocabulary but cannot identify individual knowledge. `crossleyAllenMcNamara2012Simplification` ([DOI](https://doi.org/10.1177/1362168811423456)) and `odo2025ModifiedInput` ([DOI](https://doi.org/10.18823/asiatefl.2025.22.2.4.253)) motivate accessible syntax, cohesion and elaboration. `glandorfMeurers2024GrammarControl` ([record](https://consensus.app/papers/towards-finegrained-pedagogical-control-over-english-glandorf-meurers/17f1501f56d65358904e9a22f594501a/)) motivates explicit grammar guidance without validating our planning method. `malikEtAl2024CALM` ([DOI](https://doi.org/10.48550/arxiv.2406.03030)) motivates evaluating actual outputs. `yanagisawaWebbUchihara2020Glossing` ([DOI](https://doi.org/10.1017/S0272263119000688)) supports contextual glosses with format/L1 limitations.

The stage split, practice-focus bounds, simplified descriptors, app-authored level guides and narrative scopes are unvalidated product choices. Script prerequisites remain product requirements. No certified CEFR/JLPT/TORFL alignment, measured lexical coverage or proven learning effectiveness is claimed.

## Implementation and compatibility

Managed definitions: `data/learning-profiles.json`; orchestration: `js/story-generation.js`, `js/generation-pipeline.js`, `js/learning-validation.js` and `js/app.js`. User settings retain old target language enablement/self-assessment values and add separate standardized selections; no broad-band conversion is guessed. Old stories remain readable. New generation requires an explicit standard-level selection. Each generated version retains plan, level/framework, scope, exact learner context and provider/model/prompt/profile provenance. Current merged prompt version is 2026-10-13.14.

One frozen operation in `data/generation-checkpoints.json` saves the plan, canonical prose and optional Japanese readings before acknowledging their requests. App-owned kanji spans replace model-owned annotation boundaries. Stable operation-derived IDs make final application idempotent. Resume is explicit and reuses completed stages; changed inputs require discard/new generation. Completed content remains recoverable after final save failure. Incompatible historical operation definitions are retained for explicit discard rather than silently rewritten.

During integration with newer main, numeric length safeguard LANG-001 is explicitly retired to honor this decision. LANG-002–009 and GEN-001–004 remain active: target script, useful nonempty English notes, exact forms, technical bounds, app-owned readings, examples, legacy alignment, contextual instruction, inline help, durable stages, recovery, cancellation and captured provenance. Russian stress is allowed when requested, retaining the newer main decision rather than imposing an unconditional ban. These are engineering/product decisions without new learning-effectiveness claims. The existing citations and limitations above still apply.

## Validation

Engineering and screenshot checks are recorded in [2026-10-13-level-guided-generation](../validation/2026-10-13-level-guided-generation.md). Native App² and qualified language review remain pending. Revisit if level choices confuse learners, generated prose is consistently unsuitable, or a measured placement requirement emerges.


Follow-up [implementation audit](../validation/2026-10-13-generation-audit.md) corrected cancellation at stage boundaries, canonical-script validation and shared glossary matching. Underlines are contextual support links, not measured unknown-word coverage; the five vocabulary candidates do not cap the final glossary. No underline-density policy or generation-prompt change was introduced.
