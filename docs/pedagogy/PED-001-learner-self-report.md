# PED-001: Revisable reading profiles and concrete ability examples

- Date: 2026-10-10
- Status: superseded for new generation by [PED-004](PED-004-level-guided-generation.md); retained as historical rationale
- Scope: German, Japanese, Russian and Spanish learners using generated reading stories
- Evidence basis: product requirements and evidence-informed extrapolation; exact profiles and examples unvalidated

## Decision and learner need

Use three revisable reading starting points (beginner, intermediate, advanced) per enabled language, plus an optional personal description. Settings supply the default difficulty; a learner can override it for one story. The personal description adds detail beyond the broad reading bands.

Keep the three choices because free text alone has not been established as a reliable replacement for the explicit content target. Label the saved choice **Reading starting point** and the temporary override **Story difficulty**. This distinction is a product design choice, not validation of the bands. When no language is enabled, keep the main picker empty, disable generation and show an inline message with an **Open Settings** action. Do not silently offer every language or assign a default language. This setup behavior enforces the learner's explicit selection and requires no inference about ability.

Write the optional description examples entirely in English, as first-person accounts of specific things a learner can understand in familiar situations and where they need help. Use everyday tasks such as understanding an invitation, meeting arrangements, travel notices or directions. Avoid grammar-form lists, target-language snippets, technical terminology and restatements of the three categories. Ask about something the learner has actually understood rather than hypothetical competence. These are examples of how to answer, not a questionnaire, mandatory checklist or scored test.

Japanese examples assume hiragana/katakana literacy; Russian examples assume Cyrillic literacy. These prerequisites are product requirements, not research findings. Japanese unfamiliar-kanji support can still be mentioned. Language-specific scenarios are illustrative choices, not a validated grammar sequence or proficiency threshold.

## Evidence and limits

Full source records, review access levels and findings: [self-assessment review](../research/self-assessment.md). Bibliography: [references.bib](../research/references.bib). Stable keys below can be used in citations and literature searches.

- `liZhang2021SelfAssessment`: the meta-analysis found an overall self-assessment/performance correlation of .466 across 67 studies. Self-report can inform personalization, but does not establish accurate placement by our free text or three bands. [DOI](https://doi.org/10.1177/0265532220932481).
- `ashton2014ReadingSelfAssessment`: reading self-assessment in German, Japanese and Urdu showed common factors and differences in progression. Supports examining language-specific reading tasks; it does not validate our adult-facing examples. [DOI](https://doi.org/10.1016/j.system.2013.11.006).
- `suzuki2015JapaneseSelfAssessment`: Japanese self-assessment errors varied with experience, with greater misalignment for tasks participants had little experience of. This motivates the request for actual familiar experiences. It does not prove our wording improves accuracy. [DOI](https://doi.org/10.1177/0265532214541885).
- `tigchelaarEtAl2017CanDoValidity`: in 382 undergraduate Spanish learners, 15 of 50 speaking self-assessment items misfit; suspected reasons included vagueness, unfamiliar experiences and multiple skills in an item. This informs concrete wording. Our reading examples are illustrative free text, not a replication of that instrument. [DOI](https://doi.org/10.1111/flan.12286).
- `brownDeweyCox2014CanDoValidity`: Russian internship can-do reports were reliable but only moderately correlated with oral proficiency interviews. Speaking and retrospective gains differ from current reading knowledge. [DOI](https://doi.org/10.1111/flan.12082).
- `luchkinaEtAl2021RussianProficiency`: a Russian proficiency study included a validated cloze test and background/self-report measures. Its validity does not transfer to an invented short quiz. [DOI](https://doi.org/10.3390/languages6020083).

The studies do not establish certified CEFR/JLPT/TORFL alignment, exact curricular stages, accurate automatic level inference or learning effectiveness for this app.

## Implementation

- [js/app.js](../../js/app.js): `renderTargetLanguageSettings` owns the English examples and helper; `storyInput` supplies the saved report; `storyInstructions` uses it as adaptation context. Selected story difficulty controls generation. `populateTargetPicker` manages the setup message and disabled controls; `generate` rejects submissions without an enabled language before any AI call.
- [learning-profiles.json](../../data/learning-profiles.json): reading bands, prerequisites and generation guides; [settings.json](../../data/settings.json): per-language defaults and personal reports.
- Completed stories preserve profile and prompt versions plus the report used. Example-copy changes do not change the prompt version or rewrite saved reports/stories.
- Earlier reading-profile engineering checks did not validate the current English examples pedagogically. Language review and learner evaluation of the new wording are pending.

## Alternatives and revisit conditions

A grammar checklist could require terminology and imply an unsupported curriculum. A short placement test needs suitable items, scoring and validation. Keep voluntary plain-English self-report for current low-stakes personalization.

Revisit if learners misunderstand the examples, copy them as their own reports, cannot describe their experience, or consistently receive unsuitable stories. Evaluate wording with learners and qualified language reviewers. If accurate placement becomes a requirement, select and evaluate an appropriate reading measure rather than treating these examples as a test.

Settings copy refinement: `settingsDescriptions` in the managed learning-profile definitions provides shorter display summaries for each reading band. Full `languages` descriptions remain the generation and saved-report source; existing reports and profile versions are unchanged. Shorter textarea examples still describe understood material and a need for help, with Japanese kana/kanji and Russian Cyrillic distinctions retained in the band summaries. This copy has not been validated with learners.

## Chapter length — 2026-10-12.4

A shared Short/Medium/Long setting changes total chapter length separately from difficulty and sentence complexity. Short keeps current targets; Medium doubles them and Long quadruples them. Each operation captures the preference for provenance. These bands are product assumptions, not validated learning doses or assessed proficiency. The current learner profiles and wishes continue to govern content; legacy beginner curriculum rules are not reinstated.
