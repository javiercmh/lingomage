# Architecture overview

What the app is made of: platform, modules, version constants and tests. Architecture docs: [overview]() · [data and storage](data-and-storage.md) · [generation pipeline](generation-pipeline.md) · [learner tracking](learner-tracking.md) · [safeguards](safeguards.md). Interface rules: [`DESIGN.md`](../../DESIGN.md).

## Overview

- Dependency-free HTML/CSS/JavaScript App² subapp at the repository root; no build step, framework, native code or production server. Historical Kotlin is in Git; the [safeguard audit](safeguards.md) records what was adopted.
- `dev_server.py` (Python 3.9+) serves the workspace for browser testing with deterministic `--mock-ai`, or development-only `--chatgpt` through the Codex CLI login.
- Versions: prompt `PROMPT_VERSION` in `js/app.js`, safeguards `SAFEGUARD_VERSION` in `js/learning-validation.js`, memory `MEMORY_VERSION` and memory prompts `SUMMARY_PROMPT_VERSION`/`COMPACTION_PROMPT_VERSION` in `js/story-memory.js`, app `version` in `manifest.json`.

## Modules

- `js/bridge.js`: the only caller of host APIs (`ai`, `speech`, `translation`, `share`, `updates`, `selectionMenu`, files). App² owns AI configuration and credentials (App² Settings → AI), speech, translation and update installation; the workspace never stores credentials or request headers.
- `js/app.js`: composes the UI, help, speech and request flows.
- `js/workspace-storage.js`: store definitions, validators and missing/valid/invalid states.
- `js/story-model.js`: legacy chapters and exact-version paths. `js/story-memory.js`: bounded lineage-specific memory. `js/generation-controller.js`: idempotent final application. `js/generation-pipeline.js`: staged generation. `js/generation-errors.js`: failure categories and recovery wording.
- `js/reader-panels.js`: nonmodal panel positioning, focus and listeners. `js/selection-menu.js`: host selection-menu routing. `js/settings-feedback.js`: preference-save notices and the reload guard.
- `js/ai-session.js`: the `ai.start` wrapper and operation sessions. `js/ai-notification.js`: task-specific `title`/`body` for every `ai.start` (presentation only; never affects prompts, versions or saved data).
- `js/usage-tracker.js`, `js/usage-stats.js`: time tracking. `js/consultation-signals.js`, `js/reading-exposure.js`: lookup history and probable reading. `js/library-activity.js`: Library ordering and dates.
- `js/story-share.js` provides pure canonical text formatting, full-record export, story-file import validation and re-identification, and injected delivery selection. `js/app.js` supplies a saved snapshot, dialog and browser download; only `js/bridge.js` accesses `AppShare`.
- Dependencies are injected so tests import production modules.

## Testing

- `python3 scripts/check.py` (Node 22.12+, Python 3.9+) runs every Node and Python test.
- `python3 scripts/browser_smoke.py` prints a runner URL; Run smoke checks needs its disposable-workspace marker and offline mock. It covers the four language flows, notes, reopening, continuation and rewrite, cancel/reload/resume, malformed and blank stores with Retry loading, unreadable settings and injected settings write failures. `tests/browser/inspect.html` gives screenshot fixtures for recovery and write-failure states. `tests/app-startup.mjs` boots `js/app.js` against a stub DOM.
- Mock fixtures establish interface and contract behavior only. Host (Android) behavior is tested in App², not here; live-model evidence is in the [generation test results](../evaluation/generation-tests/results.md).
