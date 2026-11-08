# App² packaging notes

This workspace is a plain HTML/CSS/JavaScript subapp. `manifest.json` lists the entry point and all files needed by App². Relative imports and JSON paths resolve from the subapp's isolated workspace.

## Data and language text

- `data/stories.json` contains saved story records, including language, canonical title and story, app-owned Japanese reading segments, glossary, vocabulary, topic, model, prompt version and creation time.
- `data/settings.json` stores the selected model and reasoning preference. ChatGPT credentials remain in App² and are not exposed to the subapp.
- Japanese uses language planning, canonical prose, contextual notes and app-owned kanji reading requests; validated stages save before acknowledgement. Japanese `story` and `title` remain the canonical strings. `storySegments` and `titleSegments` add optional reading annotations for display. Copying uses canonical text and excludes readings.
- `data/usage.json` stores compact daily time aggregates (milliseconds by local date, language and activity); seed it empty.
- `data/learning-signals.json` stores local lookup history and probable-reading aggregates per language (PED-005); seed it empty.
- `data/generation-checkpoints.json` stores unfinished generation stages and captured context; seed it empty. `data/language-safeguards.json` is a managed definition.
- Russian output is validated as Cyrillic. English glossary meanings are retained for all four target languages.

## AI

The app imports `ai`, `readFile` and `writeFile` from `js/bridge.js`. It discovers providers and models at runtime, sends a versioned profile-aware learning instruction and freeform wishes, validates technical chapter bounds, scripts, field bounds and nonempty inline learning notes, saves completed stories locally, then acknowledges the completed request. Generation errors do not trigger automatic retries.

Connect ChatGPT through App² library **Settings → AI**. Browser preview supports the explicitly enabled offline `--mock-ai` responses. For optional live desktop testing, sign in with `codex login` and run `python3 dev_server.py --chatgpt`; this uses Codex's ChatGPT account and may use plan allowance. The development server keeps no credentials, uses ephemeral threads in a temporary directory and does not retain pending requests across restart. This local development mode is an exception to the App²-only connection rule; released app behavior still uses App²'s managed AI bridge. Mock outputs are fixed examples and do not establish translation quality or learning effectiveness.

## Local preview

Run `python3 dev_server.py --mock-ai` from this workspace for offline development, or `python3 dev_server.py --chatgpt` after `codex login` for live desktop inference. The server binds to localhost and implements the starter file bridge. App files are read from the workspace, while learner files (`seedFiles`) are kept in the gitignored `.dev-data/` folder, seeded from `seedDefaults`, so committed seeds stay empty; delete it to start over. Native Android behavior and App² safe-area insets are not validated by this preview.

## App updates

App² version code 4 or later supports `updates.available` and `updates.open()` from
`js/bridge.js`. The Settings button opens native review; installation always needs
confirmation. Browser previews hide the button. App² follows
`javiercmh/lingomage` branch `main` by default, pinned to one commit during download.

Branches: all changes, including contributor instructions and release fixes, go
through `dev`. `main` only moves when publishing those changes. For an app release,
bump `version` in `manifest.json` on `dev`, then fast-forward `main` to the tested
`dev` commit with `git merge --ff-only dev`. Push both branches; they should point
to the same commit immediately after publication. Between releases, `dev` may be
ahead of `main`. Do not make separate copies of a change on both branches or add
release-only commits to `main`. If a main-only fix is unavoidable, bring it back
into `dev` before continuing development.

Keep the manifest identical across branches. Retain `"branch": "main"` in
`app2Update.github` for compatibility with older App² builds. App² Dev build 11+
keeps the selected branch per installation; to try unreleased work, open App²
Library → LingoMage menu → Update app → Change source and select `dev`. Select
`main` to return to releases. Each switch is shown as a source change and needs
Update anyway. Remove the compatibility field on `dev` only when supported by the
released host, then publish that same manifest to `main`.
A version bump on `dev` is optional before publication, since App² offers any
change to managed files.

`manifest.json.app2Update` declares publisher identity and file ownership.
`data/stories.json`, `data/settings.json`, `data/generation-checkpoints.json`, `data/usage.json` and `data/learning-signals.json` are user files seeded only when absent. Usage is seeded as `{"version":1,"days":{}}` and learning signals as `{"version":1,"languages":{}}`; both are preserved by updates and never packaged from local history.
`data/learning-profiles.json` and `data/language-safeguards.json` are shipped managed definitions and updates with the
code. All other unowned files remain untouched. Keep these declarations current.
Existing saved records must remain readable; v1 has no general data migration. The one exception is a temporary
glossary-alias migration in `js/workspace-storage.js` (`term`/`text` → `word` in `data/stories.json`); remove it in the next major release.
Increment the app version for a published update. Commit and push require explicit
user instructions; local changes are unavailable to GitHub updates until published.

Package with App²'s `scripts/package_subapp.py`; it uses empty declared seed
defaults rather than copying local stories or settings. ZIP installation belongs
to the App² library; Share & Package is export-only.

## Device translation

`translation` from `js/bridge.js` exposes `availability()` → `{available: boolean}` and `open({text})` → `{opened: true}`. App² forwards text via Android ACTION_TRANSLATE to the configured handler or resolver. It returns no translation and accepts no language settings. Call only after a user action, with canonical text without readings. Browsers and older hosts report unavailable. Blank text or more than 100000 UTF-16 code units is rejected by the host. Handle `.code`/`.message` errors (`invalid_request`, `unavailable`, `timeout`) without automatic retry. The external translation tool may process text online.

## Host-controlled AI providers

App² Settings → AI exposes ChatGPT, OpenRouter or one Combined provider. LingoMage
discovers the connected exposed provider and uses its existing model selector; it
does not need provider-specific credentials or response parsing. Combined model IDs
are opaque and model names include their source. A provider change clears unavailable
model/reasoning choices. Pending generation checkpoints retain their original config.
OpenRouter models may return valid text that fails LingoMage's JSON/content validation;
existing safeguards remain authoritative and no inference is retried automatically.
