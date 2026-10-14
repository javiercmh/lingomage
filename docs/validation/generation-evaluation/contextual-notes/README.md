# Controlled contextual-notes comparison

Implementation prepared on 2026-10-14; live execution requires separate authorization. Production prompts are unchanged until acceptance. `prompts.json` contains exact current and candidate notes instructions. `corpus.json` freezes 24 canonical chapters (two briefs × four languages × three targets), their saved profiles/plans, source hashes, prompt versions, and exact validator/matcher sources. Completed writer responses are used even when subsequent notes failed. Historical records and reviews remain untouched. The seven passages in `focused.json` are review cases, not assertions that the candidate has passed semantic review.

Use a dedicated development-only server; never package this corpus or results. Sol `gpt-6.1-sol` with low reasoning is an experimental control. The runner verifies availability and refuses substitution. It never reads or modifies learner files. No additional production request/stage is introduced.

```sh
# A new frozen comparison (offline); source corpus already supplied here:
node scripts/compare-notes.mjs --freeze --output /tmp/new-notes-comparison
# Only after separate live authorization:
python3 dev_server.py 8889 --chatgpt
node scripts/compare-notes.mjs --run --live --endpoint http://localhost:8889
# Failed requests require explicit --retry. Completed variants are skipped.
node scripts/compare-notes.mjs --run --live --retry --limit 2
# Offline anonymous review preparation and acceptance reporting:
node scripts/compare-notes.mjs --review-pack --report
```

Each variant saves exact instructions/input, input and corpus hashes, model/effort, live/mock status, raw response, request/release state and attempt history. Raw and delivered outputs are persisted before acknowledgement. Current validation is used unchanged. Each note records original/delivered forms, removed/added forms, and whether the whole note was dropped. Repaired explanations are not assumed correct. Entirely unmatched output is rejected but still retains its raw response and drop report. Structural/script rejection retains raw output and the validation error. Transport interruptions retain the saved request and require explicit retry; no automatic new inference occurs. A lost server request remains an actionable failure rather than silently regenerating.

`--output`, `--pilot`, `--language`, and `--limit` allow isolation. Mock checks require `--mock` and a separate copied corpus/output directory; no semantic conclusions follow from mock results. Validator changes require a new freeze. Do not run concurrent workers on the same files.

Review packs show anonymous sample IDs, identical prose/profile/plan, raw notes and delivered notes with repairs. Variant mappings are separate `.mapping.json` files; keep them away from reviewers until judgments are recorded. Inspect every note for concrete sense/grammar errors and identify exact missing useful expressions. Record quote, severity (`material` or `minor`), correction, uncertainty, and adjudication (`pending`, `confirmed`, `dismissed`, `disputed`). After unblinding, enter judgments under `samples.current`/`samples.candidate`; record reviewer ID and language qualifications and set `completed` only after full inspection. Focused cases additionally require `candidateCorrect: true` based on inspected output. AI issue-finding can assist but cannot fill the qualified-review requirement.

`acceptance.json` currently reports **not accepted**, with all 31 reviews pending. The 24 corpus cases supply aggregate material-error/missing-support counts and per-language checks. Focused cases are a separate mandatory correctness gate. Confirmed material errors must decrease overall without increasing within a language; missing useful expressions must not increase overall or within a language. Missing reviews, missing qualifications, incomplete issue records and disputes prevent acceptance. Counts and overall preference are secondary to exact errors. These are engineering release criteria, not educational-effect measurements.

## Separate prose iteration

Only after notes selection, save a JSON file containing `instructions` (exact selected notes prompt) and `selectionProvenance` (acceptance/review record and selection rationale). The runner requires that file and records it in every attempt. Candidate additions live in `scripts/evaluation/prose-candidate.mjs`.

```sh
node scripts/evaluate-generation.mjs --suite prose --selected-notes /tmp/selected-notes.json --output /tmp/prose-comparison
node scripts/review-generation.mjs --input /tmp/prose-comparison
```

This compares both variants across the 24 matched create briefs plus matched fixed low-level continuation, rewrite and Chapter contexts per language. Both use the selected notes prompt. Candidate planning uses existing guidance; candidate writing checks load and continuity internally. Existing response schemas and request stages remain unchanged. The suite freezes the exact experimental instructions; changes require a new output directory. Review level fit, naturalness and continuity separately from notes. Production promotion requires its own prompt-version increment; no candidate has yet been selected or shipped.
