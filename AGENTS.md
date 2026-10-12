# LingoMage App² contributor instructions

## Product and content

- The current product is a plain HTML, CSS and JavaScript App² workspace at the repository root. `android/` retains the earlier native Android implementation.
- Keep the interface and glossary explanations in English. Current targets are German, Japanese, Russian and Spanish; let learners request a regional variety in their language preferences.
- Keep workspace domain data in inspectable JSON files under `data/`. Keep rationale, research, language decisions and validation records in `docs/`.
- Before changing learning behavior, consult `docs/pedagogy/README.md`. Update the relevant pedagogical decision in the same change; use stable citation keys from `docs/research/references.bib`, and distinguish evidence from product assumptions.
- Update affected documentation when prompts or learning behavior change. Increment `PROMPT_VERSION` in `js/app.js` and preserve saved-story provenance.
- Label product assumptions and evidence limitations; do not claim certified CEFR alignment or proven learning effectiveness.
- Preserve canonical Japanese text separately from furigana annotations. Copied Japanese text must omit readings. Russian uses Cyrillic without Latin transliteration.

## Interface design

- Follow `DESIGN.md` for shared App² visual rules, reader layout, accessibility and follow-up interaction. Update it when these conventions change.

## App² platform

- Follow the plain-file starter structure: `index.html`, `css/style.css`, `js/app.js`, `js/bridge.js`, `manifest.json`, and `data/`.
- Keep the host API calls in `js/bridge.js`; app logic uses its exported wrappers. Keep the project dependency-free and do not add a build step.
- Keep `manifest.json`'s `main` and `files` entries current. Domain records and preferences belong in `data/stories.json` and `data/settings.json`, not opaque host preferences.
- Released app behavior uses the App² managed `ai` bridge. Connect and choose models only through App² library Settings → AI. Never store credentials or request headers in the workspace. The local development server may offer an explicit `--chatgpt` mode through the Codex CLI login for desktop testing; this exception must remain development-only.
- Save completed story data before acknowledging an AI request. Do not silently retry inference.
- Respect edge-to-edge safe-area variables, provide touch targets of at least 44px, and do not use system `alert()` or `confirm()` dialogs.
- Keep user-generated text rendered with `textContent` or text nodes.

## Development and verification

- Run the local workspace with `python3 dev_server.py --mock-ai`; open `http://localhost:8888`. The development mock is deterministic and makes no external requests. Optional live desktop testing uses `codex login` followed by `python3 dev_server.py --chatgpt`; requests may use ChatGPT plan allowance, and Codex is an optional external dependency.
- For every interface or copy change, visually inspect screenshots from the development server at desktop and narrow mobile widths before declaring it complete. Check spacing, wrapping, hierarchy, field/helper grouping, clipping, and touch targets; DOM checks alone do not establish layout quality. Record what was actually inspected.
- Use the development server for browser checks. Native AI, alarms, Android insets and install shortcuts require App² on Android and should be marked pending unless actually verified there.
- Record only checks actually run. Do not export credentials or log tokens, callback URLs or account identifiers.
- The Python server requires Python 3.9 or newer and no dependencies.

## App updates

App² version code 4 or later supports `updates.available` and `updates.open()` from
`js/bridge.js`. The Settings button opens native review; installation always needs
confirmation. Browser previews hide the button. App² follows
`javiercmh/lingomage` branch `main`, pinned to one commit during download.

`manifest.json.app2Update` declares publisher identity and file ownership.
`data/stories.json` and `data/settings.json` are user files seeded only when absent.
`data/learning-profiles.json` is a shipped managed definition and updates with the
code. All other unowned files remain untouched. Keep these declarations current.
Existing saved records must remain readable; v1 has no automatic data migration.
Increment the app version for a published update. Commit and push require explicit
user instructions; local changes are unavailable to GitHub updates until published.

Package with App²'s `scripts/package_subapp.py`; it uses empty declared seed
defaults rather than copying local stories or settings. ZIP installation belongs
to the App² library; Share & Package is export-only.

## Device translation

`translation` from `js/bridge.js` exposes `availability()` → `{available: boolean}` and `open({text})` → `{opened: true}`. App² forwards text via Android ACTION_TRANSLATE to the configured handler or resolver. It returns no translation and accepts no language settings. Call only after a user action, with canonical text without readings. Browsers and older hosts report unavailable. Blank text or more than 100000 UTF-16 code units is rejected by the host. Handle `.code`/`.message` errors (`invalid_request`, `unavailable`, `timeout`) without automatic retry. The external translation tool may process text online.
