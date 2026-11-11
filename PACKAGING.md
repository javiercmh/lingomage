# Packaging, updates and host APIs

How LingoMage ships through App². Branch and release rules are in [`AGENTS.md`](AGENTS.md#branches-and-releases); data files are described in [`docs/architecture/data-and-storage.md`](docs/architecture/data-and-storage.md#data-files).

## Manifest

- `manifest.json` lists the entry point and every file App² needs (`files`). Relative imports and JSON paths resolve from the subapp's isolated workspace. Add new files to `files` and, for code and managed data, to `app2Update.managedFiles`.
- `app2Update` declares publisher identity (`com.wynh.lingomage`) and file ownership:
  - **User files**, seeded from `seedDefaults` only when absent and preserved by updates: `data/stories.json`, `data/settings.json`, `data/generation-checkpoints.json`, `data/usage.json` (`{"version":1,"days":{}}`), `data/learning-signals.json` (`{"version":1,"languages":{}}`).
  - **Managed files**, replaced by updates: code plus `data/learning-profiles.json` and `data/language-safeguards.json`.
  - All other files are left untouched.
- Keep `"branch": "main"` in `app2Update.github` for older App² builds; remove it only when the released host no longer needs it, then publish the same manifest to `main`. The manifest is identical on both branches.

## Updates

- App² follows `javiercmh/lingomage` branch `main` by default, pinned to one commit during download, and offers any change to managed files (a version bump is not required for App² to notice, but every published release increments `version`).
- App² Dev build 11+ keeps a source branch per installation: Library → LingoMage menu → Update app → Change source → `dev` to try unreleased work, `main` to return. Each switch shows as a source change and needs Update.
- `updates.available` and `updates.open()` (App² version code 4+) open native review; installation always needs confirmation. Browser previews hide the control. The control belongs in Settings when added.

## Packaging

Package with App²'s `scripts/package_subapp.py`. It writes empty declared seed defaults and never copies local stories, settings, checkpoints or history. ZIP installation belongs to the App² library; Share & Package is export-only.

## Host APIs

All host calls go through `js/bridge.js`.

AI completion uses pushed host messages with polling fallback, including polling persisted IDs after page recreation. Background operation sessions, host-version differences and AI error meanings are described in the [generation pipeline](docs/architecture/generation-pipeline.md#background-operation-sessions).

- **AI:** connect providers only in App² Settings → AI (ChatGPT, OpenRouter, or one Combined provider). LingoMage discovers the connected provider and its models at runtime; Combined model IDs are opaque and names include their source. A provider change clears unavailable model and reasoning choices; pending checkpoints keep their original configuration. Any provider's output must pass LingoMage validation; nothing retries automatically. Save completed content before acknowledging a request.
- **Device translation:** `translation.availability()` → `{available: boolean}`; `translation.open({text})` → `{opened: true}`. App² forwards text to the configured Android ACTION_TRANSLATE handler; it returns no translation and takes no language settings. Call only after a user action, with canonical text without readings. Browsers and older hosts report unavailable. Blank text or more than 100000 UTF-16 units is rejected. Errors (`invalid_request`, `unavailable`, `timeout`) are shown without retry. The external tool may process text online.
- **Choosing a file (Import story…):** a standard `<input type="file" accept="application/json,.json">`; App² serves Android's document picker. There is no App² API, bridge call, permission, manifest opt-in or incoming-share receiver. Open it with `input.click()` inside the button's click (Android ignores it outside a gesture) after clearing `input.value` so the same file can be chosen again. Cancelling leaves `input.files` empty and may fire `cancel` or no event: change nothing and show nothing. `accept` is only a hint: check `file.size` (at most 16 MiB, the `writeFile` text limit), read with `file.text()`, and validate everything (`importStoryFile` in `js/story-share.js`). Choosing a file writes nothing; the import persists through the normal `data/stories.json` save and reports success only after it. Imported text is rendered as text.
- **Speech, selection menu, files:** see `js/bridge.js` and [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Local preview

`python3 dev_server.py --mock-ai` (offline, deterministic) or `codex login` then `python3 dev_server.py --chatgpt` (live, development only: uses the Codex ChatGPT login and may use plan allowance; keeps no credentials and no pending requests across restarts). The server binds to localhost and implements the file bridge. App files come from the workspace; learner files (`seedFiles` and development preferences) live in the gitignored `.dev-data/`, seeded from `seedDefaults` on first start, so committed seeds never change. Delete `.dev-data/` to start fresh. The preview does not establish Android behavior, insets, translation quality or learning effect.

## Story sharing

`share.available`, `share.text({title, text})` and `share.file({name, mimeType, content})` wrap `window.AppShare` exclusively in the bridge. Requests use JSON `{id, action, options}` and replies `{id, value}` or `{id, error:{code, message}}`, like translation. `{launched:true}` means the Sharesheet opened; it does not establish completion. Host error codes are preserved; a missing reply gives `timeout`. Cancellation is silent; other failures are shown without automatic fallback or retry. Without AppShare, text copies to the clipboard. Each Share dialog action uses one channel and never falls back to another (`js/story-share.js`): **Download story file** uses `save.text({name, mimeType, content})`, which wraps `window.AppSave` (Save as, the Android create-document picker; UTF-8 text up to 10 MiB, `application/json`; same message shape, no wrapper timeout because the picker is user-paced), or a browser Blob download in previews; **Share story file** and text **Share** use AppShare; **Copy** uses the clipboard. Save as resolves `{saved:true, name}` only after the write, or `{saved:false, cancelled:true}`; errors keep host codes (`unavailable`, `too_large`, `busy`, `not_foreground`, `write_failed`, …). The host reduces saved names to an ASCII basename. App² WebViews do not handle `<a download>`, so Download is hidden on an App² that has AppShare but no AppSave. Story files come back in through Library → Import story… (see Host APIs).
