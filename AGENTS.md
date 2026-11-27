# LingoMage contributor instructions

LingoMage is a plain HTML/CSS/JavaScript App² subapp at the repository root (no native app, build step or dependencies; the Python server is development-only). Read this file first, then the doc for the area you change.

## Where to look

Every doc, what it contains, and when to read or update it. Update the matching doc in the same change as the code.

**App behavior (read before changing code)**

| File | What you'll find | Read or update when |
| --- | --- | --- |
| [`DESIGN.md`](DESIGN.md) | Interface rules by screen: Create, Library, Reader, generation status and recovery, Profile, Settings, workspace recovery, verification | Any UI, copy, layout or accessibility change |
| [`docs/architecture/overview.md`](docs/architecture/overview.md) | Platform, module responsibilities, version constants, how to run tests | Adding or moving a module; changing test tooling |
| [`docs/architecture/data-and-storage.md`](docs/architecture/data-and-storage.md) | Every `data/*.json` file, required vs optional stores, invalid-file and save-failure rules, Library activity stamps | Touching saved data, validators or storage errors |
| [`docs/architecture/generation-pipeline.md`](docs/architecture/generation-pipeline.md) | Generation stages, checkpoints, recovery, validation bounds, memory, help requests, background AI sessions | Changing prompts' plumbing, AI requests, retries or recovery |
| [`docs/architecture/learner-tracking.md`](docs/architecture/learner-tracking.md) | Time tracking and lookup history/probable reading: counting rules and file formats | Changing what is counted or recorded about the learner |
| [`docs/architecture/safeguards.md`](docs/architecture/safeguards.md) + `data/language-safeguards.json` | Registered language and generation safeguards and their tests | Changing generation or validation |
| [`PACKAGING.md`](PACKAGING.md) | Manifest ownership, Chimera standalone build (`chimera.json`), App² updates, packaging, host APIs (AI, translation), local preview | Adding files, changing the manifest or host calls |

**Learning design and evidence (read before changing learning behavior)**

| File | What you'll find | Read or update when |
| --- | --- | --- |
| [`docs/pedagogy/`](docs/pedagogy/README.md) | One PED per pedagogical decision: decision, evidence table, assumptions, revisit conditions, history | Changing prompts, reading aids, levels or learner tracking |
| [`docs/research/`](docs/research/README.md) | Evidence reviews per topic with sources, access levels and limits; `references.bib` holds citation keys | Citing or adding evidence |
| [`docs/languages/`](docs/languages/README.md) | Per-language rules (script, readings, orthography), earlier designs, review criteria | Changing anything language-specific |

**Product scope and evaluation**

| File | What you'll find | Read or update when |
| --- | --- | --- |
| [`docs/product/features.md`](docs/product/features.md) | What the app does now, confirmed requirements, defaults, what is out of scope | Adding or removing a feature |
| [`docs/product/future-directions.md`](docs/product/future-directions.md) | Research-linked ideas not yet built (reading, retrieval, listening, writing, feedback) | Proposing a new learning feature |
| [`docs/evaluation/learning-evaluation-plan.md`](docs/evaluation/learning-evaluation-plan.md) | How learning would be measured: outcomes, evaluation gates, in-app check design, protocol (nothing implemented) | Making or testing any learning claim |
| [`docs/evaluation/generation-tests/`](docs/evaluation/generation-tests/method.md) | Live model and prompt comparisons: `method.md`, `results.md`, `ai-evals.md` (opt-in learning-quality evals), `notes-prompt-experiment/` (pending) | Running or interpreting model, prompt or AI-eval tests |
| [`docs/README.md`](docs/README.md) | Documentation policy | Writing or reorganizing docs |

## Product and content

- Interface and glossary text are English. Targets: German, Japanese, Russian, Spanish; learners request regional varieties in language preferences.
- Label product assumptions and evidence limits. Never claim certified CEFR alignment or proven learning effectiveness.
- When prompts or learning behavior change: update the PED and language docs, increment `PROMPT_VERSION` in `js/generation/prompts.js` (where all prompts except story memory live), and preserve saved-story provenance.
- Japanese canonical text stays separate from furigana; copy and speech omit readings. Russian uses Cyrillic without transliteration.

## Code rules

- Structure: `index.html`, `css/style.css`, `js/app.js`, `js/bridge.js`, area folders `js/core/`, `js/generation/`, `js/reader/`, `js/screens/`, `js/tracking/`, `manifest.json`, `data/`. Keep `manifest.json` `files` and `app2Update` current.
- `js/app.js` only composes the app: state, the shared `runtime` bindings and one `create…(deps)` call per UI module, in a fixed order. Follow the module convention in [overview](docs/architecture/overview.md#module-convention) before moving code between modules. Shared mutable bindings go on `runtime`, never in accessor/setter pairs.
- Test new module behavior through its factory with `tests/support/factory-harness.mjs`, not by slicing source text. Modules listed in `MODULES_SLICED` (`tests/support/app-source.cjs`) are still sliced by older tests: keep their marker functions together and in order, or migrate those tests first.
- Only `js/bridge.js` calls host APIs. No dependencies, no build step.
- Domain data lives in inspectable JSON under `data/`, never in opaque host preferences. Optional stores (`data/usage.json`, `data/learning-signals.json`) must never block stories, settings or generation and are never overwritten while unreadable. Saved records must stay readable; there is no general migration.
- AI only through the App² managed `ai` bridge (providers in App² Settings → AI). Never store credentials or request headers. Every `ai.start` passes `title`/`body` from `js/core/ai-notification.js`. Save completed data before acknowledging a request. Never retry inference silently. Two automatic resends exist: a start the host refused with `session_idle` before any inference (`js/core/ai-session.js`), and, by the learner's product decision, automatic resends of a failed generation step (unreadable or invalid reply, provider or network error, timeout, failed start), at most three per stage or part, when Settings → Advanced → Retry failed steps automatically is on (default); never after a rate limit (`usage_limit`), a cancellation, or errors a resend cannot fix (`NO_RESEND`). These are never silent: each one is announced (toast and "retry N of 3" in progress) and counted in `op.retried`; after the limit recovery is explicit (`js/generation/generation-pipeline.js`).
- Active multi-request operations must advance through promises, never timer delays or animation frames. `ai.wait` listens for pushed host completion/errors; polling remains a fallback and is required for persisted IDs after page recreation. Keep session and hidden-page guards intact; optional background story-context preparation remains unsessioned. See [generation pipeline](docs/architecture/generation-pipeline.md#background-operation-sessions).
- Keep host error codes and useful reasons. Use `failureInfo` for bounded diagnostics and displayed host messages: sensitive fragments are omitted without `[redacted]` placeholders. Never infer cancellation, a provider cause or a time limit from an unknown failure; preserve explicit recovery and saved progress. Recovery copy belongs in `DESIGN.md`.
- 44px touch targets, safe-area insets, no `alert()`/`confirm()`, user and model text via `textContent` or text nodes.

## Safeguards

- The current app is the specification; legacy code is not a curriculum spec.
- Account for every registered safeguard. Weakening or retiring one needs a documented product decision and matching test changes; never replace enforcement with a prompt silently.
- Every deterministic safeguard has behavioral tests; prompt requirements have prompt-contract tests and stated semantic limits.
- Completed intermediate stages go to `data/generation-checkpoints.json` before releasing requests. Never publish or package learner checkpoints; seed empty. Resume and retry are explicit; completed stages never regenerate.

## Development and verification

- Run `python3 dev_server.py --mock-ai` and open `http://localhost:8888` (deterministic, no external requests). Optional live testing: `codex login`, then `python3 dev_server.py --chatgpt` (uses ChatGPT plan allowance; development only). It runs Codex with a private temporary `CODEX_HOME` that links only `auth.json`, so a global `~/.codex/AGENTS.md` or `config.toml` never reaches LingoMage requests; do not work around the instruction-source check. For live tests that write data, run the server from a throwaway copy of the app (as `scripts/browser_smoke.py` builds), never against an existing `.dev-data/`. Agent live tests use the newest GPT Luna model (currently `gpt-6-luna`) with low reasoning for both the story model and the light tasks model: seed the throwaway `.dev-data/data/settings.json` with `{"providerId":"chatgpt","model":"gpt-6-luna","reasoning":"low","lightModel":"gpt-6-luna","lightReasoning":"low"}` before opening the app, and confirm the selection in Settings.
- The server keeps learner files in the gitignored `.dev-data/`, seeded from `seedDefaults`; committed seeds never change. Delete `.dev-data/` for a fresh install. Never commit learner data.
- Run `python3 scripts/check.py` (Node 22.15+, Python 3.12+) before completing any change. It uses whichever `node` is first on PATH and prints its version; record that version with the checks. When a change touches test tooling, module loading or Node APIs, also run it on Node 22 (see [overview → Testing](docs/architecture/overview.md#testing) for selecting it).
- For interface or copy changes, inspect screenshots at desktop and narrow mobile widths (spacing, wrapping, hierarchy, clipping, touch targets); DOM checks are not enough. Share before and after screenshots with the requester in the conversation, not just a description.
- Use `python3 scripts/browser_smoke.py` for disposable screenshot fixtures; never reset an existing `.dev-data/` workspace to prepare screenshots. Frozen-timer and fake-host tests verify app behavior, not Android lifecycle or host compatibility on a device.
- LingoMage has no Android tests. Verify everything with unit tests and the Python dev server. Host behavior (bridge, storage, AI requests and notifications, speech, translation, selection menus, insets, Back, WebView lifecycle) is tested in [App²](https://github.com/javiercmh/appapp) on its emulator, following App²’s AGENTS.md “Android emulator and device testing”. Only when emulator checks are insufficient does the agent in that conversation ask the human to try a specific step on their device. A change depending on new host behavior ships with its App² prompt including those emulator checks.
- Record checks actually run, and what remains unverified, in the commit message. Results never go in docs.
- AI evals (`scripts/ai-eval.mjs`) are opt-in and never part of checks, hooks, CI or packaging; without `--live` they make no request. See `docs/evaluation/generation-tests/ai-evals.md`.
- Never log or export credentials, tokens, callback URLs or account identifiers.

## Branches and releases

- All changes, including these instructions and release fixes, go through `dev`. `main` moves only on publication.
- Release: bump `version` in `manifest.json` on `dev`, then `git merge --ff-only dev` into `main` and push both, so they point to the same commit. No separate copies of a change on both branches and no release-only commits on `main`; bring any unavoidable main-only fix back into `dev` first.
- Commit and push only on explicit instruction. Local changes reach App² users only once published.
- Authorship: the human responsible for the work, with their own name and email. Never list an AI tool as author or co-author.
