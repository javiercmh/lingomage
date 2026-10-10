# LingoMage App² contributor instructions

## Product and content

- The current product is a plain HTML, CSS and JavaScript App² workspace at the repository root. `android/` retains the earlier native Android implementation.
- Keep the interface and glossary explanations in English. Current targets are German, Japanese, Russian and Spanish (Chile).
- Keep workspace domain data in inspectable JSON files under `data/`. Keep rationale, research, language decisions and validation records in `docs/`.
- Update affected documentation when prompts or learning behavior change. Increment `PROMPT_VERSION` in `js/app.js` and preserve saved-story provenance.
- Label product assumptions and evidence limitations; do not claim certified CEFR alignment or proven learning effectiveness.
- Preserve canonical Japanese text separately from furigana annotations. Copied Japanese text must omit readings. Russian uses Cyrillic without Latin transliteration.

## App² platform

- Follow the plain-file starter structure: `index.html`, `css/style.css`, `js/app.js`, `js/bridge.js`, `manifest.json`, and `data/`.
- Keep the host API calls in `js/bridge.js`; app logic uses its exported wrappers. Keep the project dependency-free and do not add a build step.
- Keep `manifest.json`'s `main` and `files` entries current. Domain records and preferences belong in `data/stories.json` and `data/settings.json`, not opaque host preferences.
- Use the App² managed `ai` bridge. Connect and choose models only through App² library Settings → AI. Never store credentials or request headers in the workspace.
- Save completed story data before acknowledging an AI request. Do not silently retry inference.
- Respect edge-to-edge safe-area variables, provide touch targets of at least 44px, and do not use system `alert()` or `confirm()` dialogs.
- Keep user-generated text rendered with `textContent` or text nodes.

## Development and verification

- Run the local workspace with `python3 dev_server.py --mock-ai`; open `http://localhost:8888`. The development mock is deterministic and makes no external requests.
- Use the development server for browser checks. Native AI, alarms, Android insets and install shortcuts require App² on Android and should be marked pending unless actually verified there.
- Record only checks actually run. Do not export credentials or log tokens, callback URLs or account identifiers.
- The Python server requires Python 3.9 or newer and no dependencies.
