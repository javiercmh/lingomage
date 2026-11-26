# Generation test results

The production workflow is language plan → canonical prose → contextual English notes → Japanese readings, when applicable → saved chapter. Completed stages are checkpointed before releasing requests. An explicit notes retry reuses the completed prose. Example requests retain their separate workflow.

The learner requested more definitions, including common words. Prompt policy .19, retained in current prompt .20, therefore asks for broad contextual coverage without a fixed note quota. This is a product preference, not evidence of improved learning or certified level alignment. See PED-002 and PED-004.

The fixed 100-note limit was replaced, with explicit user approval, by a serialized content limit of 1,000,000 UTF-16 units. Existing per-field, canonical prose, script, exact-form, Japanese reading and checkpoint safeguards remain. The matcher was optimized and compared with the original behavior in randomized overlap cases; 250-note rendering and repeated-meaning scaling cases pass.

## Split notes comparison (2026-11-25)

Question: is one notes request, three paragraph parts or about six smaller parts better for speed and note quality? `scripts/compare-note-splits.mjs` ran the production notes prompt (`2026-11-25.1`), splitting, validation and merging on six frozen corpus chapters (German B1/C1, Russian B1/C1, Japanese N3/N1). Generator: GPT-6 Luna, low effort, plus a single-request medium-effort reference. Parts ran concurrently through separate development bridges. Judge: one anonymous GPT-6.2 Sol medium review per chapter covering all variants. 67 requests; raw runs stay in the ignored `ai-evals/runs/`.

| Variant | Median time to all notes | Notes per chapter (median) | Judge accuracy (1–5, median) | Major errors (total) | Unparseable replies |
| --- | --- | --- | --- | --- | --- |
| One request, low | 43.5 s | 78 | 3 | 5 (5 chapters) | 1 of 6 |
| 3 parts, low | 30.2 s | 102 | 3 | 3 (5 chapters) | 1 of 17 |
| ~6 parts, low (half minimum part size) | 19.3 s | 106 | 2 | 12 (6 chapters) | 0 of 32 |
| One request, medium | 33.4 s | 60 | 3 | 7 (6 chapters) | 0 of 6 |

Times are medians over all six chapters, including the run with an unparseable reply; notes, accuracy and errors cover completed runs only. Interpretation, with limits: six chapters, one uncalibrated judge reply per chapter from the same model family, and wall times that vary with provider load. Splitting shortened time to all notes, most for Russian and Japanese, where single replies are long. Parts also produced more notes (smaller focus means denser coverage; the judge's coverage scores rose and missing-support counts fell), so total output grew and German B1 was not faster. Three parts kept accuracy at the single-request level; about six parts added clearly more major errors (case and aspect explanations) and more headwords with several notes, and would exceed App²'s default six starts per minute alone. Medium effort was neither consistently more accurate nor faster than low. Japanese chapters mostly stay one request at the 600-unit minimum; these Japanese results used a 250-unit minimum, which production adopted for Japanese. Two of 61 generation replies were invalid JSON; with split notes only that part needs a retry. No learning effect or certified accuracy is claimed.

## Note density comparison (2026-11-26)

Question: how do three notes selection rules (Fewer = production prompt `2026-11-26.2`; Standard; More, both with a shared closed-class skip list) and two models compare in note count, underlined share, coverage and accuracy? `scripts/compare-note-density.mjs` ran each rule with GPT-6 Luna and GPT-6.2 Sol, both low effort, with production splitting (3 parts), validation and merging, on eight frozen corpus chapters in two runs: beginners (de-A1-0, ja-N5-0, ru-A1-0, es-CL-A1-0; 44 requests) and advanced (de-C1-0, ja-N1-1, ru-C1-1, es-CL-C1-0; 80 requests). Judge: one anonymous GPT-6.2 Sol low review per model per chapter, comparing that model's three glossaries for errors, missing support for a learner who has just started the level, and redundant notes. "Underlined" is the share of `Intl.Segmenter` word tokens inside a displayed note under the reader's first-occurrence rule (`firstGlossaryMatches`); Japanese segmentation splits particles and endings, so compare its figures only within Japanese. Raw runs stay in the ignored `ai-evals/runs/`.

Beginner chapters (means of four):

| Variant | Notes | Underlined | Judge coverage (1–5) | Missing | Major errors (total) |
| --- | --- | --- | --- | --- | --- |
| Luna Fewer | 14 | 14% | 2 | 21 | 0 |
| Luna Standard | 29 | 23% | 3.75 | 10 | 1 |
| Luna More | 31 | 25% | 4.25 | 7 | 2 |
| Sol Fewer | 28 | 21% | 3 | 14 | 0 |
| Sol Standard | 35 | 26% | 4.25 | 6 | 0 |
| Sol More | 37 | 26% | 4 | 7 | 0 |

Advanced chapters (means over completed runs):

| Variant | Notes | Underlined | Judge coverage | Missing | Redundant | Major errors (total) | Wall time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Luna Fewer | 41 | 14% | 3.25 | 20 | 3 | 1 | 11–16 s |
| Luna Standard (2 of 4 completed) | 80 | 25% | 4 | 12 | 7 | 2 | 14–26 s |
| Luna More (3 of 4 completed) | 126 | 35% | 4 | 10 | 31 | 2 | 39–52 s |
| Sol Fewer | 68 | 18% | 4 | 15 | 2 | 1 | 34–50 s |
| Sol Standard | 112 | 29% | 5 | 3 | 5 | 0 | 63–83 s |
| Sol More | 239 | 47% | 5 | 2.5 | 71 | 0 | 94–119 s |

Interpretation, with limits: one chapter per language and level, one uncalibrated judge reply per model and chapter from the same model family as one generator, and wall times that vary with provider load. Fewer left beginners without notes on many words the judge considered needed. Standard equalled More at beginner level by design and tapered at C1, where More added many redundant notes. Sol produced about twice as many notes as Luna under Fewer, completed every run and had no major errors under Standard or More, but took two to four times longer; three of Luna's twelve advanced dense-rule runs failed validation (one invalid JSON, two notes without an English explanation). Many "missing" items were free word combinations the prompt deliberately excludes; possessives (*deine Fahrkarte*, *su billete*, *свой билет*) and *У меня есть* were genuine gaps and were added to Standard and More afterwards (prompt `2026-11-26.4`, not re-tested). No learning effect, measured coverage or certified accuracy is claimed.

## Evaluation interpretation

The corrected model comparison contains 24 matched prose/notes samples: German, Russian, Japanese and Chilean Spanish, three requested levels per language, GPT-6.1 Sol low versus GPT-6 Luna high. The earlier GPT-6 Sol comparison is archived separately and excluded. Original prompt/validator provenance and failed requests are retained.

Offline revalidation under the new size policy accepts 11/12 Sol notes outputs and 8/12 Luna outputs. These are deterministic structure/form checks, not semantic quality scores. Three Japanese annotation stages were prevented by the old note cap or interrupted locally. All three were subsequently completed from saved prose/notes in separate `supplementalReadings` traces and passed annotation validation. Original review inputs and failures remain unchanged; their missing-reading comments describe the earlier incomplete stage, not model reading quality. Supplemental readings have structural validation only, not a separate qualified semantic review.

An anonymous preliminary AI review preferred Sol in 11 of 12 pairs and Luna for German B1. The judge was GPT-6.1 Sol low; family bias, a small fixed brief set and lack of calibrated qualified reviewers limit this finding. Sol low is the provisional development choice. Both models can produce inaccurate contextual explanations, above-target constructions and narrative continuity problems. Counts alone do not establish quality.

The original-versus-revised pilot covers two briefs, four languages and three requested levels (48 attempts): 45 completed, with three exact-form rejections (Russian B1 revised, C1 revised parcel, and C1 baseline railway). The completed original samples have 8–11 notes (median 10); revised samples have 41–220 (median 129.5). Different sampled prose and unequal rejected cases mean this is a descriptive comparison, not a controlled learning-effect estimate. Raw prompts, responses, checkpoints, errors and preliminary review records are archived in Git history at commit `7fd046c` (see [README](method.md)). Follow-up cases cover Scene continuation, Scene rewrite and Chapter creation in each language; retired Longer passage preferences are covered by compatibility tests.

No official CEFR/JLPT/TORFL certification or measured learning effectiveness is claimed. Qualified language review remains necessary before stronger alignment claims. Evaluation uses the explicitly authorized development-only Codex bridge; released behavior continues through App² managed AI.

The preliminary pilot review also finds a breadth/accuracy tradeoff. For example, the German B1 parcel revised output groups `ihrem` under a first-person possessive explanation even though it refers to Lena, and its `sie` note overlooks singular uses. The Spanish A1 railway note describes `mi tren` as ownership rather than the train the speaker plans to take. These expressions pass substring matching, demonstrating the semantic limitation of deterministic safeguards. More links do not guarantee better definitions; contextual correctness needs language review.


All 24 pilot pairs received a preliminary anonymous AI review: 23 preferred the revised workflow and one preferred the original. The arithmetic means below describe this judge’s uncalibrated ordinal scores; they are diagnostic, not measurements of educational benefit.

| Pilot variant | Level fit | Naturalness | Note accuracy | Note breadth | Narrative |
| --- | --- | --- | --- | --- | --- |
| Original | 4.12 | 4.04 | 4.79 | 2.12 | 4.00 |
| Revised | 4.08 | 4.17 | 4.17 | 4.96 | 3.92 |

This supports increased coverage, while indicating an accuracy cost and no demonstrated level-fit improvement. The app continues to require exact-form checks and explicit recovery. Human review of contextual senses and constructions remains a quality limitation.

The 12 live follow-up cases finished with 11 completed outputs and one Japanese N5 Chapter rejection: an initial provider failure was explicitly retried using saved progress, then the notes response violated the no-Latin Japanese script requirement. The failed output and earlier review are preserved. Continuation and rewrite passed in all four languages; Chapter creation passed in German, Russian and Spanish. Each of the 12 cases has a preliminary AI review, including the rejected Japanese output. No silent inference retry was used.

## Offline semantic failure review

[semantic-failures.json](semantic-failures.json) contains three small, traceable cases from saved pilot output: German possessive reference, German singular/plural `sie`, and Spanish association versus train ownership. Original notes, source excerpts and UTF-16 ranges reference archived commit `7fd046c`; these are diagnostic samples, not a new generated corpus. `tests/semantic-review.mjs` checks record integrity and, when `7fd046c` is in the local history, that each excerpt's UTF-16 range, original note, language and prompt version match the archived output; shallow or offline checkouts report the archive as unavailable instead of passing (set `SEMANTIC_REVIEW_REQUIRE_ARCHIVE=1` to fail instead). That establishes traceability only, not linguistic correctness. Review is **unreviewed** for every case: prior AI findings are suspected errors, not qualified adjudications, and human qualification remains pending.

A qualified reviewer reads the excerpts and, where needed, retrieves the full source with `git show 7fd046c:<source.path>`. Record qualification, disposition (`confirmed error`, `acceptable explanation`, or `unresolved`) and a rationale in the case. Missing qualifications, disputed context or insufficient evidence keep the case unresolved. Preserve the original note and provenance. Do not add a semantic pass assertion based on keywords, substring matching or model agreement. Ordinary tests check the review record's integrity only.

This review makes no new inference requests, uses no AI judge and promotes no prompt changes. The existing focused comparison cases remain available for a separately authorized and budgeted future evaluation. Human linguistic review and Android checks remain pending; no stronger learning or level-alignment claim follows from this engineering change.

## Earlier sample review (Android, 2026-10-09)

One sample per language from the retired Android design (100–150 words, five learner-chosen items) received a preliminary AI review (no qualified human reviewer). It found consistent script, agreement and glossary mapping with some extra vocabulary beyond beginner level, and confirmed the okurigana correction in a second Japanese sample (readings only above kanji runs). The record and samples are in Git history before commit `f47e17d` (`docs/validation/sample-review.md`, `docs/validation/samples/`).
