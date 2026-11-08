# LingoMage contributor instructions

LingoMage is a plain HTML/CSS/JavaScript App² subapp at the repository root (no native app, build step or dependencies; the Python server is development-only). Read this file first, then the doc for the area you change.

## Where to look

| Changing | Read and update in the same change |
| --- | --- |
| Interface, copy, layout, accessibility | [`DESIGN.md`](DESIGN.md) |
| Modules, data files, generation pipeline, storage, tracking | [`docs/architecture/app2-runtime.md`](docs/architecture/app2-runtime.md) |
| Generation, validation, safeguards | [`docs/architecture/language-safeguards.md`](docs/architecture/language-safeguards.md), `data/language-safeguards.json` |
| Learning behavior (prompts, reading aids, levels, tracking) | [`docs/pedagogy/README.md`](docs/pedagogy/README.md) and the relevant PED; citations from `docs/research/references.bib` |
| One language's rules | [`docs/languages/`](docs/languages/README.md) |
| Manifest, packaging, updates, host APIs | [`PACKAGING.md`](PACKAGING.md) |
| Something that needs Android verification | add or edit a row in [`docs/validation/device-checklist.md`](docs/validation/device-checklist.md) |
| Docs themselves | policy in [`docs/README.md`](docs/README.md) |

## Product and content

- Interface and glossary text are English. Targets: German, Japanese, Russian, Spanish (Chile); learners request regional varieties in language preferences.
- Label product assumptions and evidence limits. Never claim certified CEFR alignment or proven learning effectiveness.
- When prompts or learning behavior change: update the PED and language docs, increment `PROMPT_VERSION` in `js/app.js`, and preserve saved-story provenance.
- Japanese canonical text stays separate from furigana; copy and speech omit readings. Russian uses Cyrillic without transliteration.

## Code rules

- Structure: `index.html`, `css/style.css`, `js/app.js`, `js/bridge.js`, `manifest.json`, `data/`. Keep `manifest.json` `files` and `app2Update` current.
- Only `js/bridge.js` calls host APIs. No dependencies, no build step.
- Domain data lives in inspectable JSON under `data/`, never in opaque host preferences. Optional stores (`data/usage.json`, `data/learning-signals.json`) must never block stories, settings or generation and are never overwritten while unreadable. Saved records must stay readable; there is no general migration.
- AI only through the App² managed `ai` bridge (providers in App² Settings → AI). Never store credentials or request headers. Every `ai.start` passes `title`/`body` from `js/ai-notification.js`. Save completed data before acknowledging a request. Never retry inference silently.
- 44px touch targets, safe-area insets, no `alert()`/`confirm()`, user and model text via `textContent` or text nodes.

## Safeguards

- The current app is the specification; legacy code is not a curriculum spec.
- Account for every registered safeguard. Weakening or retiring one needs a documented product decision and matching test changes; never replace enforcement with a prompt silently.
- Every deterministic safeguard has behavioral tests; prompt requirements have prompt-contract tests and stated semantic limits.
- Completed intermediate stages go to `data/generation-checkpoints.json` before releasing requests. Never publish or package learner checkpoints; seed empty. Resume and retry are explicit; completed stages never regenerate.

## Development and verification

- Run `python3 dev_server.py --mock-ai` and open `http://localhost:8888` (deterministic, no external requests). Optional live testing: `codex login`, then `python3 dev_server.py --chatgpt` (uses ChatGPT plan allowance; development only).
- The server keeps learner files in the gitignored `.dev-data/`, seeded from `seedDefaults`; committed seeds never change. Delete `.dev-data/` for a fresh install. Never commit learner data.
- Run `python3 scripts/check.py` (Node 22.12+, Python 3.9+) before completing any change.
- For interface or copy changes, inspect screenshots at desktop and narrow mobile widths (spacing, wrapping, hierarchy, clipping, touch targets); DOM checks are not enough.
- Record checks actually run, and what remains unverified, in the commit message. Results never go in docs; the device checklist lists checks only.
- AI evals (`scripts/ai-eval.mjs`) are opt-in and never part of checks, hooks, CI or packaging; without `--live` they make no request. See `docs/validation/generation-evaluation/README.md`.
- Never log or export credentials, tokens, callback URLs or account identifiers.

## Branches and releases

- All changes, including these instructions and release fixes, go through `dev`. `main` moves only on publication.
- Release: bump `version` in `manifest.json` on `dev`, then `git merge --ff-only dev` into `main` and push both, so they point to the same commit. No separate copies of a change on both branches and no release-only commits on `main`; bring any unavoidable main-only fix back into `dev` first.
- Commit and push only on explicit instruction. Local changes reach App² users only once published.
- Authorship: the human responsible for the work, with their own name and email. Never list an AI tool as author or co-author.
