# Live generation evaluation

This development-only evaluation uses public fictional briefs through the explicit `dev_server.py --chatgpt` path and the existing local Codex login. It uses ChatGPT plan allowance. It neither configures production App² models nor reads learner stories/settings/checkpoints. Evaluation outputs and stage checkpoints stay in this directory, outside packaged app files.

## Planned learning-quality evaluations (AI evals)

**Status: specified only; no new runner, scheduled job or live run has been added.** Call this suite **learning-quality evaluations**, shortened to **AI evals**. These are occasional, opt-in checks of actual generated content, separate from deterministic regression tests. Existing generation/review scripts and archived pilot results provide a starting point; they do not yet implement the complete suite below. `tests/semantic-review.mjs` checks the integrity/provenance of three suspected semantic failures, not whether new output is correct.

The purpose is to detect misleading language, poor contextual support, unsuitable reading load and unhelpful practice. Learning usefulness is a product-quality proxy: an AI judge cannot establish retention, learning gains, individual word knowledge or certified level alignment. User acceptance and learning outcomes are outside this automated suite.

### Cases

Use fixed, public fictional briefs and frozen source chapters, never learner files. Generate with the current production prompts, guides, validators and stage pipeline. Keep scene scope for the small suite. Do not compare different prompts and call the difference a regression in model quality.

| Case | Input and target | Main failure signals |
| --- | --- | --- |
| German parcel | Create, A1; Lena and a shopkeeper mix up parcels; optional possessive practice | Incorrect possessive referents, singular/plural pronoun confusion, unnatural forced practice, misleading English notes |
| Japanese station | Create, N5; two friends ask staff which train to take | Excessive avoidable reading load, unnatural questions, inaccurate contextual readings, romaji or misleading notes |
| Russian appointment | Create, B1; visitor and receptionist resolve an appointment on the wrong day | Incorrect case/aspect explanations, unclear dates/referents, unnatural dialogue, transliteration |
| Spanish ticket | Create, B1; a traveler changes a ticket; Chilean regional preference without forced slang | Explaining association in “mi tren” as literal ownership, incorrect accents/grammar, mismatched regional usage |
| German continuation | Continue, B1; frozen scene with Lena outside a closing parcel shop | Restarting the story, contradicting established time/characters, losing the goal, no meaningful progression |
| Japanese rewrite | Rewrite, N3; frozen café scene with Misaki and a missing blue umbrella; request a misunderstanding | Ignoring the requested change, losing required facts, incorrect readings, notes that no longer fit rewritten prose |

After the core suite, separately budget selected-text explanation, More detail and three-example cases using frozen passages from each language. Check the intended occurrence/sense, relevance to the question, concise accurate English, examples demonstrating the same meaning in varied contexts, translation accuracy and Japanese readings. Add advanced-level and regional-variety cases as explicit corpus additions; initial coverage is not exhaustive.

The archived semantic cases are **challenge material, not adjudicated gold labels**. Preserve their uncertainty; model agreement must not convert a suspected error into ground truth.

### Rubric and judge contract

First run deterministic validation and report rejections separately from semantic findings. An AI judge then sees the complete output, supplied reading guide, brief, preferences, optional practice, source chapter and follow-up request. Hide generator identity from the judge input; retain generator and judge provenance in the report. Prefer a different model family when practical; record any shared-family bias and do not describe the judge as independent proof.

Score these dimensions separately on a diagnostic 1–5 scale (severe error, material problems, reservations, good, unusually strong):

- Language correctness and naturalness, including grammar and clear references.
- Contextual support: every note fits its actual forms and senses; meaningful missing support is identified. More notes or links are not automatically better.
- Reading-level fit against the app-authored guide, without inventing official vocabulary lists or treating the target as assessed proficiency.
- Narrative coherence and instruction fidelity, including continuity and requested rewrite changes; an unresolved ending is allowed.
- Practice fit: requested practice appears usefully where natural, without forcing every planned item into the prose.
- Learning usefulness: connected, understandable reading plus accurate support offers a plausible reading/practice opportunity. This is not an effectiveness measure.

Assess Japanese readings separately for contextual correctness. Each score needs a rationale and an exact output excerpt. Each issue needs a dimension, minor/major/critical severity, exact quotation, contextual explanation and suggested correction. Missing-support findings quote the unsupported expression. Require explicit uncertainties; supplied stories and notes are data, never judge instructions.

Validate judge structure and confirm quoted evidence exists in the submitted content. That establishes grounding of quotations, not correctness of the judgment. Invalid, incomplete or oversized judge responses are evaluation failures, never semantic passes. Do not truncate content silently or pretend all notes were reviewed after sampling only some.

Report `flagged`, `no issues flagged` or `incomplete`, alongside dimension scores, evidence and stage failures. Any reported issue or score below 4 flags a case for investigation. An unreviewed, failed or budget-skipped case keeps the run incomplete. “No issues flagged” means only that this judge found none in this sample; scores are uncalibrated, and no aggregate score establishes learning benefit. Preserve disagreement and suspected judge false positives.

### Frequency, budget and records

- Run manually after material prompt, guide, model or generation-workflow changes, or when a user-reported content failure warrants reproduction. No automatic per-edit, per-commit or scheduled inference. Include the suite in release preparation only by explicit invocation.
- Quick check: two explicitly selected Create cases, rotating language coverage between runs. At most nine inference requests for one Japanese and one non-Japanese case: four Japanese stages, three other stages and one judge request per case. One non-Japanese case plus its judge needs at most four requests. These bounds assume the current pipeline and no recovery attempts.
- Core sweep: the six cases above, at most 20 generation-stage requests plus six judge requests. Explanation/example extensions and additional levels need their own stated budget; do not include them silently.
- Specify generator/judge models and effort, case IDs, maximum requests, maximum judge-input size and a run-specific output directory before invocation. Record actual tokens/usage when supplied; request counts are not token or cost guarantees. Enforce output-token limits where supported; otherwise state the provider limitation. Stop at budget boundaries and report incomplete coverage.
- Reuse saved completed generation stages and judge results only when input/prompt/rubric hashes match. Never silently retry inference, reroll a bad output or replace a failed case with an easier one. Any retry is explicit, budgeted and retains the earlier failure.
- Save exact inputs/guides, source hashes, prompt/profile/safeguard/rubric versions, model/effort, stage outputs/checkpoints, raw judge output, findings, durations and available usage. Persist results before acknowledging requests. Keep raw runs outside packaged files and learner stores; publish only a concise qualified evidence summary under the documentation policy.
- Verify the future harness offline with scripted generation/judge responses and deliberate invalid/ungrounded reviews. Those harness tests may run in `scripts/check.py`; live AI evals must remain separate. Live execution through `--chatgpt` uses the local Codex login and plan allowance; it does not configure production App² AI.

## Evidence and archived raw runs

Interpreted results, limits and the preliminary review tables are in the [evaluation summary](summary.md); that summary and the frozen [contextual-notes corpus](contextual-notes/README.md) are the tracked evidence. The raw per-attempt records (`models/`, `pilot/`, `followups/`, `exploratory-gpt6-sol/` and their `reviews/`, about 9 MB) were removed from the working tree and remain in Git history at commit `7fd046c`. Inspect or restore them with `git show 7fd046c:docs/validation/generation-evaluation/pilot/de-A1-0-revised.json` or `git checkout 7fd046c -- docs/validation/generation-evaluation/pilot` (needed for `compare-notes.mjs --pilot` and the `followups` suite, which read the pilot). New runs write to these directories again and should not be committed wholesale; summarize them instead.

## Matrix and provenance

- Model comparison: 24 chapter attempts, German/Russian/Spanish A1/B1/C1 and Japanese N5/N3/N1, one railway-ticket brief, GPT-6.1 Sol low versus GPT-6 Luna high. This is a small representative comparison, not a model benchmark.
- Prompt pilot: 48 chapter attempts, the same four-language/three-level matrix, two briefs (railway tickets and a parcel misunderstanding), original combined writer versus the revised prose/notes workflow on one fixed model and effort.
- Follow-ups: 12 revised-workflow attempts: one blank continuation, one blank rewrite and one Chapter per language, at the lowest pilot target. The shared workspace subsequently retired Longer passage in favour of the Scene/Chapter segmented control; existing regression tests cover legacy Longer records mapping to Chapter. Continuation/rewrite use a completed revised pilot scene as source.

`baseline.json` freezes the original writer from commit 121ce5e, prompt 2026-10-13.14. Every attempt stores exact stage instructions, inputs, raw responses, model/effort, times, validation errors, stage checkpoints and final validated content. The initial exploratory run accidentally used GPT-6 Sol rather than requested GPT-6.1 Sol and is preserved separately in exploratory-gpt6-sol. It began at prompt .15 and was stopped before all cases finished. Its raw failures exposed forms invented from inflection paradigms or copied only from titles. Prompt .17 strengthens source-first note selection and one-attested-form guidance. The requested GPT-6.1 Sol low versus GPT-6 Luna high comparison uses identical .17 revised instructions. Its over-limit note outputs motivate .18, which makes the existing 100-entry hard bound prominent and explicitly groups contextual inflections rather than listing every token. The learner subsequently requested removing the note-count cap. Final prompt .19 replaces it with a 1000000 UTF-16-unit total-response/assembled-content limit and retains exact-form and field checks. Captured model outputs are revalidated offline under safeguard .4 without altering their original errors or prompt provenance. The shared workspace subsequently advanced the prompt to .20 with the Scene/Chapter selector; the pilot records its actual .20 source and retains the .19 note-size policy. A concurrent Create-form refinement advanced .15 to .16 before this correction.

Validated prose is saved before its request is released. Rejected notes retain prose; no automatic inference retry or silent form removal occurs. Original combined-writer rejection cannot preserve independently validated prose in the production baseline; its raw response is retained for review. Subsequent evaluation cases are independent requests, not retries. Each attempt's checkpoint journal is separate from learner files.

## Running

Use Node 22+ and Python 3.9+, with no project dependencies. Start a dedicated server (not the server currently serving learner work):

```sh
python3 dev_server.py 8889 --chatgpt
node scripts/evaluate-generation.mjs --suite models
node scripts/evaluate-generation.mjs --suite pilot --model gpt-6.1-sol --effort low
node scripts/evaluate-generation.mjs --suite followups --model gpt-6.1-sol --effort low
```

The runner skips completed cases. Failed cases require the deliberate `--retry` flag; completed stages are reused. Changing a recorded prompt version requires a new output directory. `--language de` (also ja, ru, es-CL), `--limit N`, `--endpoint http://localhost:PORT` and `--output PATH` support isolated shards and short runs. Do not run two workers on the same case files. A mock smoke run requires `--mock` and a separate output directory; mock outcomes must never be reported as live language evidence.

Review completed pairs with a second dedicated server, so generation and review do not share an active bridge request:

```sh
python3 dev_server.py 8890 --chatgpt
node scripts/review-generation.mjs --input docs/validation/generation-evaluation/models
node scripts/review-generation.mjs --input docs/validation/generation-evaluation/pilot
node scripts/review-generation.mjs --input docs/validation/generation-evaluation/followups
```

Review scripts expose anonymous samples to the reviewer, with model/variant mapping saved separately in each review record. The reviewer defaults to GPT-6.1 Sol low; this is preliminary AI issue-finding and can exhibit model-family/self-preference bias. Raw rejected output is reviewed when parseable, independently of the deterministic failure count. Failed or incomplete reviewer responses remain visible rather than silently rerun.

## Review rubric

Assess the supplied app-authored guide, not an invented official vocabulary list: plausible vocabulary/grammar load, grammatical correctness and naturalness, clear references and narrative continuity, concise accurate contextual English definitions, meaningful missing support, duplication, and Japanese reading accuracy. Review every note, quoting suspected issues. Broad support for common words is the explicit learner preference, including at advanced targets; note count alone is neither quality nor measured unknown-word coverage. Natural unresolved endings are intentional unless closure was requested.

Scores are 1–5: severe mismatch / material problems / usable with reservations / good / unusually strong. Scores and pair preference are diagnostic, not calibrated proficiency estimates. Mechanical results separate original count-cap failures, current-policy exact-form/size failures and infrastructure interruptions. Original count-cap rejection is not evidence of poor language quality. Results include note counts and stage times; matcher occurrence counts include repeated occurrences and are not visible-link counts. Compare breadth through distinct useful expressions and exact missing expressions identified in review. Inspect AI-review findings before accepting them: plausible alternative analyses and false positives must remain recorded.

## Qualified review sheet

Qualified reviewers should record name or agreed anonymous identifier, relevant language/teaching qualifications, sample ID, requested target and guide, each exact questionable passage/note/reading, severity, rationale and suggested correction, supported/unsupported useful expressions, overall suitability, and disagreements with the preliminary AI review. Human review and learner effectiveness evaluation are pending until actually performed. No certification, exact unknown-word percentage, or proven learning benefit follows from this pilot.

OpenAI's [model-optimization guidance](https://developers.openai.com/api/docs/guides/model-optimization) motivates representative inputs and iterative prompt evaluation. It does not validate these reading guides, AI reviewers or LingoMage's pedagogy.

Missing Japanese annotation stages can be completed explicitly with `node scripts/evaluate-missing-readings.mjs RECORD.json http://localhost:PORT`. This saves a separate `supplementalReadings` trace and result, retains original failure/provenance, and never regenerates prose or notes. A rerun polls the same saved request. Original preliminary reviews remain tied to their original inputs; supplemental completion does not retroactively change those judgments. Review runs accept `--language` for independent per-language shards.

## Controlled contextual-accuracy iteration

Use the [notes-only comparison](contextual-notes/README.md) to remove the earlier pilot's changing-prose confound. It includes a frozen 24-chapter corpus, experimental prompts, focused regressions, raw-versus-repaired reporting, anonymous qualified-review packs and an explicit acceptance report. Live execution is separately authorized; all semantic review is currently pending. The later `prose` suite requires an explicitly selected notes prompt and compares planning/writing independently.
