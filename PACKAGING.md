# App² packaging notes

This workspace is a plain HTML/CSS/JavaScript subapp. `manifest.json` lists the entry point and all files needed by App². Relative imports and JSON paths resolve from the subapp's isolated workspace.

## Data and language text

- `data/stories.json` contains saved story records, including language, canonical title and story, optional Japanese reading segments, glossary, vocabulary, topic, model, prompt version and creation time.
- `data/settings.json` stores the selected model and reasoning preference. ChatGPT credentials remain in App² and are not exposed to the subapp.
- Japanese `story` and `title` remain the canonical strings. `storySegments` and `titleSegments` add optional reading annotations for display. Copying uses canonical text and excludes readings.
- Russian output is expected in Cyrillic. English glossary meanings are retained for all four target languages.

## AI

The app imports `ai`, `readFile` and `writeFile` from `js/bridge.js`. It discovers providers and models at runtime, sends a versioned beginner-story instruction and selected words, validates the returned JSON shape and glossary coverage, saves completed stories locally, then acknowledges the completed request. Generation errors do not trigger automatic retries.

Connect ChatGPT through App² library **Settings → AI**. Browser preview supports the explicitly enabled offline `--mock-ai` responses. For optional live desktop testing, sign in with `codex login` and run `python3 dev_server.py --chatgpt`; this uses Codex's ChatGPT account and may use plan allowance. The development server keeps no credentials, uses ephemeral threads in a temporary directory and does not retain pending requests across restart. This local development mode is an exception to the App²-only connection rule; released app behavior still uses App²'s managed AI bridge. Mock outputs are fixed examples and do not establish translation quality or learning effectiveness.

## Local preview

Run `python3 dev_server.py --mock-ai` from this workspace for offline development, or `python3 dev_server.py --chatgpt` after `codex login` for live desktop inference. The server binds to localhost and implements the starter file bridge so JSON data is saved to actual workspace files. Native Android behavior and App² safe-area insets are not validated by this preview.

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
