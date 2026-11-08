# PED-001: Revisable reading profiles and concrete ability examples

- Date: 2026-10-10
- Status: superseded for new generation by [PED-004](PED-004-level-guided-generation.md); kept as rationale for saved stories and as the origin of the self-report approach
- Scope: German, Japanese, Russian and Spanish learners of generated reading stories
- Evidence basis: product requirements and evidence-informed extrapolation; profiles and examples never validated

## Decision (as implemented 2026-10-10 to 2026-10-13)

- Three revisable reading starting points per enabled language (beginner, intermediate, advanced), labelled **Reading starting point**, with a per-story override (**Story difficulty**), plus an optional free-text personal description.
- The three bands were kept because free text alone was not established as a reliable replacement for an explicit content target.
- With no language enabled, generation was disabled with an Open Settings action; the app never assigned a default language or inferred ability.
- Description examples were English, first-person accounts of concrete things understood in familiar situations and where help was needed (invitations, arrangements, travel notices, directions): no grammar lists, target-language snippets, terminology or restated bands. Learners were asked about things actually understood, not hypothetical competence. Examples illustrated answers; they were not a questionnaire or test.
- Script prerequisites: Japanese assumed kana literacy (unfamiliar-kanji support could still be described); Russian assumed Cyrillic literacy. Product requirements, not findings.
- A later Short/Medium/Long chapter-length setting (Medium ×2, Long ×4 the Short targets) was a product assumption, retired with numeric quotas by PED-004.

## Evidence and limits

Source records and access levels: [self-assessment review](../research/self-assessment.md).

| Key | Finding | Use and limit |
| --- | --- | --- |
| `liZhang2021SelfAssessment` ([DOI](https://doi.org/10.1177/0265532220932481)) | Meta-analysis, 67 studies: overall self-assessment/performance correlation .466 | Self-report can inform personalization; does not establish accurate placement by free text or three bands |
| `ashton2014ReadingSelfAssessment` ([DOI](https://doi.org/10.1016/j.system.2013.11.006)) | Reading self-assessment in German, Japanese and Urdu: common factors, language-specific progression | Supports language-specific reading tasks; does not validate our examples |
| `suzuki2015JapaneseSelfAssessment` ([DOI](https://doi.org/10.1177/0265532214541885)) | Japanese self-assessment error larger for tasks with little experience | Motivates asking about actual familiar experiences; does not show our wording improves accuracy |
| `tigchelaarEtAl2017CanDoValidity` ([DOI](https://doi.org/10.1111/flan.12286)) | 382 undergraduate Spanish learners: 15 of 50 speaking can-do items misfit (vagueness, unfamiliar experiences, multi-skill items) | Informs concrete wording; our free-text examples are not that instrument |
| `brownDeweyCox2014CanDoValidity` ([DOI](https://doi.org/10.1111/flan.12082)) | Russian internship can-do reports reliable, moderately correlated with oral proficiency interviews | Speaking and retrospective gains differ from current reading knowledge |
| `luchkinaEtAl2021RussianProficiency` ([DOI](https://doi.org/10.3390/languages6020083)) | Validated cloze test plus background and self-report measures | Validity does not transfer to an invented short quiz |

None of these establishes certified CEFR/JLPT/TORFL alignment, curricular stages, automatic level inference or learning effectiveness for this app.

## Alternatives considered

- Grammar checklist: requires terminology and implies an unsupported curriculum.
- Short placement test: needs suitable items, scoring and validation.
- Chosen: voluntary plain-English self-report for low-stakes personalization.

## Why it was superseded

PED-004 replaced broad bands and free-text profiles with one self-selected standardized level per language plus separate regional and tone preferences, keeping the same self-report evidence base. Saved stories keep their profile and prompt provenance; no conversion between band and level is guessed.
