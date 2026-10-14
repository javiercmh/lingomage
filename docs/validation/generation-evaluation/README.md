# Live generation evaluation

This development-only evaluation uses public fictional briefs through the explicit `dev_server.py --chatgpt` path and the existing local Codex login. It uses ChatGPT plan allowance. It neither configures production App² models nor reads learner stories/settings/checkpoints. Evaluation outputs and stage checkpoints stay in this directory, outside packaged app files.

## Evidence and archived raw runs

Interpreted results, limits and the preliminary review tables are in the [broad contextual notes record](../2026-10-14-broad-notes.md); that summary and the frozen [contextual-notes corpus](contextual-notes/README.md) are the tracked evidence. The raw per-attempt records (`models/`, `pilot/`, `followups/`, `exploratory-gpt6-sol/` and their `reviews/`, about 9 MB) were removed from the working tree and remain in Git history at commit `7fd046c`. Inspect or restore them with `git show 7fd046c:docs/validation/generation-evaluation/pilot/de-A1-0-revised.json` or `git checkout 7fd046c -- docs/validation/generation-evaluation/pilot` (needed for `compare-notes.mjs --pilot` and the `followups` suite, which read the pilot). New runs write to these directories again and should not be committed wholesale; summarize them instead.

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
