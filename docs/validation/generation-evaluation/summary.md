# Generation evaluation summary

The production workflow is language plan → canonical prose → contextual English notes → Japanese readings, when applicable → saved chapter. Completed stages are checkpointed before releasing requests. An explicit notes retry reuses the completed prose. Example requests retain their separate workflow.

The learner requested more definitions, including common words. Prompt policy .19, retained in current prompt .20, therefore asks for broad contextual coverage without a fixed note quota. This is a product preference, not evidence of improved learning or certified level alignment. See PED-002 and PED-004.

The fixed 100-note limit was replaced, with explicit user approval, by a serialized content limit of 1,000,000 UTF-16 units. Existing per-field, canonical prose, script, exact-form, Japanese reading and checkpoint safeguards remain. The matcher was optimized and compared with the original behavior in randomized overlap cases; 250-note rendering and repeated-meaning scaling cases pass.

## Evaluation interpretation

The corrected model comparison contains 24 matched prose/notes samples: German, Russian, Japanese and Chilean Spanish, three requested levels per language, GPT-6.1 Sol low versus GPT-6 Luna high. The earlier GPT-6 Sol comparison is archived separately and excluded. Original prompt/validator provenance and failed requests are retained.

Offline revalidation under the new size policy accepts 11/12 Sol notes outputs and 8/12 Luna outputs. These are deterministic structure/form checks, not semantic quality scores. Three Japanese annotation stages were prevented by the old note cap or interrupted locally. All three were subsequently completed from saved prose/notes in separate `supplementalReadings` traces and passed annotation validation. Original review inputs and failures remain unchanged; their missing-reading comments describe the earlier incomplete stage, not model reading quality. Supplemental readings have structural validation only, not a separate qualified semantic review.

An anonymous preliminary AI review preferred Sol in 11 of 12 pairs and Luna for German B1. The judge was GPT-6.1 Sol low; family bias, a small fixed brief set and lack of calibrated qualified reviewers limit this finding. Sol low is the provisional development choice. Both models can produce inaccurate contextual explanations, above-target constructions and narrative continuity problems. Counts alone do not establish quality.

The original-versus-revised pilot covers two briefs, four languages and three requested levels (48 attempts): 45 completed, with three exact-form rejections (Russian B1 revised, C1 revised parcel, and C1 baseline railway). The completed original samples have 8–11 notes (median 10); revised samples have 41–220 (median 129.5). Different sampled prose and unequal rejected cases mean this is a descriptive comparison, not a controlled learning-effect estimate. Raw prompts, responses, checkpoints, errors and preliminary review records are archived in Git history at commit `7fd046c` (see [README](README.md)). Follow-up cases cover Scene continuation, Scene rewrite and Chapter creation in each language; retired Longer passage preferences are covered by compatibility tests.

No official CEFR/JLPT/TORFL certification or measured learning effectiveness is claimed. Qualified language review remains necessary before stronger alignment claims. Evaluation uses the explicitly authorized development-only Codex bridge; released behavior continues through App² managed AI.

The preliminary pilot review also finds a breadth/accuracy tradeoff. For example, the German B1 parcel revised output groups `ihrem` under a first-person possessive explanation even though it refers to Lena, and its `sie` note overlooks singular uses. The Spanish A1 railway note describes `mi tren` as ownership rather than the train the speaker plans to take. These expressions pass substring matching, demonstrating the semantic limitation of deterministic safeguards. More links do not guarantee better definitions; contextual correctness needs language review.


All 24 pilot pairs received a preliminary anonymous AI review: 23 preferred the revised workflow and one preferred the original. The arithmetic means below describe this judge’s uncalibrated ordinal scores; they are diagnostic, not measurements of educational benefit.

| Pilot variant | Level fit | Naturalness | Note accuracy | Note breadth | Narrative |
| --- | --- | --- | --- | --- | --- |
| Original | 4.12 | 4.04 | 4.79 | 2.12 | 4.00 |
| Revised | 4.08 | 4.17 | 4.17 | 4.96 | 3.92 |

This supports increased coverage, while indicating an accuracy cost and no demonstrated level-fit improvement. The app continues to require exact-form checks and explicit recovery. Human review of contextual senses and constructions remains a quality limitation.

The 12 live follow-up cases finished with 11 completed outputs and one Japanese N5 Chapter rejection: an initial provider failure was explicitly retried using saved progress, then the notes response violated the no-Latin Japanese script requirement. The failed output and earlier review are preserved. Continuation and rewrite passed in all four languages; Chapter creation passed in German, Russian and Spanish. Each of the 12 cases has a preliminary AI review, including the rejected Japanese output. No silent inference retry was used.
