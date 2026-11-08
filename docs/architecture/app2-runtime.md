# App² subapp runtime

How the running app is built: modules, data files, the generation pipeline, storage rules and tracking. Interface rules are in [`DESIGN.md`](../../DESIGN.md); safeguards in [language-safeguards.md](language-safeguards.md).

## Overview

- Dependency-free HTML/CSS/JavaScript App² subapp at the repository root; no build step, framework, native code or production server. Historical Kotlin is in Git; the [safeguard audit](language-safeguards.md) records what was adopted.
- `dev_server.py` (Python 3.9+) serves the workspace for browser testing with deterministic `--mock-ai`, or development-only `--chatgpt` through the Codex CLI login.
- Versions: prompt `PROMPT_VERSION` in `js/app.js`, safeguards `SAFEGUARD_VERSION` in `js/learning-validation.js`, memory `MEMORY_VERSION` in `js/story-memory.js`, app `version` in `manifest.json`.

## Modules

- `js/bridge.js`: the only caller of host APIs (`ai`, `speech`, `translation`, `updates`, `selectionMenu`, files). App² owns AI configuration and credentials (App² Settings → AI), speech, translation and update installation; the workspace never stores credentials or request headers.
- `js/app.js`: composes the UI, help, speech and request flows.
- `js/workspace-storage.js`: store definitions, validators and missing/valid/invalid states.
- `js/story-model.js`: legacy chapters and exact-version paths. `js/story-memory.js`: bounded lineage-specific memory. `js/generation-controller.js`: idempotent final application. `js/generation-pipeline.js`: staged generation. `js/generation-errors.js`: failure categories and recovery wording.
- `js/reader-panels.js`: nonmodal panel positioning, focus and listeners. `js/selection-menu.js`: host selection-menu routing. `js/settings-feedback.js`: preference-save notices and the reload guard.
- `js/ai-session.js`: the `ai.start` wrapper and operation sessions. `js/ai-notification.js`: task-specific `title`/`body` for every `ai.start` (presentation only; never affects prompts, versions or saved data).
- `js/usage-tracker.js`, `js/usage-stats.js`: time tracking. `js/consultation-signals.js`, `js/reading-exposure.js`: lookup history and probable reading. `js/library-activity.js`: Library ordering and dates.
- Dependencies are injected so tests import production modules.

## Data files

| File | Owner | Contents |
| --- | --- | --- |
| `data/stories.json` | user, required | Stories, ordered chapters, immutable alternate versions and paths, rolling memory, version-scoped explanations and examples, reading positions, `lastActivityAt` |
| `data/settings.json` | user, required | Model and reasoning, language enablement and order, standardized reading targets, legacy self-assessments, regional preferences, `readingPreferences` |
| `data/generation-checkpoints.json` | user, required, seeded empty | At most one unfinished operation: ID, kind, destination and path lineage, learner input, prompt and safeguard versions, AI configuration, scope, stage, validated plan and content, outstanding request ID. Contains learner text; never packaged |
| `data/usage.json` | user, optional | Time-tracking aggregates, seed `{"version":1,"days":{}}` |
| `data/learning-signals.json` | user, optional | Lookup history and probable reading, seed `{"version":1,"languages":{}}` |
| `data/learning-profiles.json` | managed | Level definitions, generation guides, scopes |
| `data/language-safeguards.json` | managed | Safeguard register |

User files are seeded only when absent, preserved by updates and never packaged with local content. Saved records stay readable across versions; no general migration exists (one temporary glossary-alias migration, `term`/`text` → `word`, lives in `js/workspace-storage.js` until the next major release).

## Generation

- **Targets** ([PED-004](../pedagogy/PED-004-level-guided-generation.md)): CEFR A1–C2 (German, Spanish), JLPT N5–N1 (Japanese), Elementary/Basic/TORFL-I–IV (Russian). Self-selected orientation, not assessed proficiency. Settings keep explicit selections separate from legacy enablement and self-assessments; no guessed conversion.
- **Inputs:** level, one optional story idea and topics brief, narrative scope (`scene` or `chapter`; saved `longer` reads as chapter), regional and register preferences. No word or sentence quotas.
- **Stages** for Create, Continue and Rewrite: optional bounded vocabulary/grammar plan → validated canonical prose → contextual glossary notes (at least one structurally valid note required) → Japanese readings when kanji are present. Examples skip the plan and notes. Plans guide writing; coverage is not required and no word knowledge is claimed.
- **Japanese readings:** after notes validate, the app extracts contiguous kanji compounds from title, story or example sentences with occurrence IDs, UTF-16 offsets and context, requests only kana readings, validates exact ID coverage and builds annotations itself. Kana-only content skips the call. Popover headwords are excluded.
- **Checkpoints:** every validated stage is saved to `data/generation-checkpoints.json` before its request is acknowledged; checkpoints, not settings, are authoritative for unfinished work. Resume reuses saved stages and captured configuration; completed stages never regenerate. Discard cancels and releases any outstanding request and removes progress. Cancel persists intent even before a new request ID returns and is checked before waits and stage handoffs. A failed notes request keeps the prose.
- **Final application** is idempotent through `operationId` and stable derived IDs; partial prose never appears as a finished story. No inference retries automatically.
- **Release failures** keep progress, block new generation and offer Resume or Save / finish; `finishRequest()` releases a completed stage without starting the next. A confirmed `not_found` may be released locally (the host already released it). Known limit: the host's atomic start/request-ID persistence gap.
- **Failure metadata:** records keep the legacy `error` string and may add `failure` (`category`, `stage`, `phase`, `code`, bounded redacted `message`). Categories: service, validation, configuration, storage, cancellation, release, internal; no provider cause is inferred.
- **Version changes:** checkpoints from an older prompt or safeguard version stay inspectable but must be discarded, never resumed under new rules; saved stories and provenance are untouched.
- **Retry guards:** stale handlers and repeated clicks cannot rerun an operation; Create Retry clears a draft error only when a matching reader draft exists; captured Create fields are restored after preferences load, then frozen. Explanation and detail retries keep the passage and question; failed acknowledgement IDs block new requests until released. Explanation and detail responses use in-memory save recovery (not durable across reload); chapters, examples and readings use durable checkpoints.

## Validation and bounds

- Shared validation for creation, continuation, rewrite and examples. Japanese without romaji; Russian Cyrillic without transliteration; Russian stress absent unless requested (prompt guidance, not a validator ban). Details in the [safeguard register](language-safeguards.md).
- Bounds: chapter content 30000 UTF-16 units; total response and assembled content 1000000; per-field maxima for title, notes, forms and examples; at most 20 forms per note; no cap on note count. Validators do not certify linguistic accuracy, complexity or learning effect.
- Glossary validation checks every exact occurrence (repeated forms cached); display links only the first eligible occurrence of each normalized headword/meaning after overlap resolution, processing candidates by form length without materializing duplicates. A shorter listed form inside a longer chosen phrase keeps its own note. A note opened from text leads with the exact matched wording (which Listen speaks) and shows the dictionary headword after it when different.
- Saved content is never revalidated or rewritten on load.

## Reader, memory and help

- Canonical text is kept separate from ruby for selection, copy and speech.
- Memory: 8000-unit summary chunks, 12000-unit serialized memory cap, bounded recent prose, all lineage-specific. Rewrites include the current chapter as source but exclude its events from preceding context. Removal prunes only unreferenced versions, help and memory.
- Initial help returns UTF-16 excerpt boundaries in the source, an optional English context translation and one short explanation. Detail returns plain text (legacy JSON accepted). Examples return three canonical sentences with English translations and validated highlight ranges; Japanese readings use the staged pipeline.

## Storage states

- **Required stores** (stories, settings, checkpoints): a missing file uses its seed default; a blank file, malformed JSON, incompatible minimum shape or failed read marks the store invalid and blocks its writes. Nothing is reset or repaired automatically. A file counts as missing when the host reports `ENOENT`, "not found" or "does not exist", or reads empty while `listFiles` omits it. Any invalid required store blocks generation and makes Settings read-only; other stores stay readable.
- **Optional stores** (usage, learning signals): an unreadable file is preserved byte for byte and blocks only its own writes; counting continues in memory and merges into the file after Retry loading. They never block stories, settings, generation or the Workspace needs attention panel (`assertWritable()` covers only required stores).
- **Preservation:** validators check only the shape needed to read. Optional story fields written as `null` read as absent. Unknown story and settings fields, unknown entries in `readingPreferences`, `targetLanguages`, `standardizedLevels`, `learnerProfiles`, `languageExpectations` and `languageOrder`, and unchanged legacy values are written back unchanged; runtime state never holds them. A known entry the learner removed is not restored.
- **Save errors** carry `store_invalid` (never written), `invalid_data` or `write_failed`. A failed preference write restores the last saved snapshot and syncs every affected control while keeping focus and uncommitted typing; Retry save repeats exactly the intended change.
- The development server writes to a temporary file in the same directory, flushes, then replaces. Native write atomicity needs an Android check.

## Library activity

`lastActivityAt` (optional ISO string on a story) orders the Library and drives "Updated". It is stamped in the same save as new content: on first save of a new story with `lastActivityKind: "created"`, and on saving a continue, rewrite, examples, explanation or detail result (`updated`). It rolls back with the content if the save fails, is never lowered, and is not stamped by opening, scrolling, reader positions, pre-request saves, path switching, removals, deletion, failed or cancelled requests, or checkpoint stages; re-applying an operation does not restamp. Stories without it derive activity from the latest valid `createdAt` among story, chapters, versions, explanations and follow-ups (ignoring invalid values and those over a day in the future). Presentation only: prompts, provenance and `PROMPT_VERSION` are unaffected; nothing is backfilled.

## Background operation sessions

A running request continues in App²'s native service in the background, but the web steps between requests (validation, saving, the next `ai.start`) run only while Android lets the page run, and Android refuses to start a foreground service from the background. LingoMage therefore holds one operation session (`js/ai-session.js`, host `ai.sessions`) across multi-request operations.

- A session is a bounded hold on the host service, begun with the first request's provider and model (same AI permission as `ai.start`). It starts no inference and does not keep the page running; if web steps stall, the checkpoint stays at its stage for Resume.
- Opened lazily at the first `ai.start` in a scope; ended when the outermost scope finishes. The host also ends it after about 90 s without a running request, after 30 minutes, at Android's foreground-service limit, on notification Cancel, AI revocation, or page replacement. The app never reopens an ended session; only the next explicit Create, Continue, Rewrite, Examples, Resume or Retry opens one.
- Scope: Create (plan, prose, notes, readings); Continue and Rewrite including the story-context summary requests (`readerAi` joins the outer scope and never ends it); Examples; Resume.
- Finish request, Save response, acknowledge, release and discard never open a session or probe capabilities. Resume with an outstanding request polls, saves and acknowledges first.
- Single requests (Explain and follow-ups) use no session, but every `ai.start` uses the wrapper: a hidden page without a session makes no host call and pauses with `background_paused`.
- Old hosts: the wrapper asks `capabilities` once and caches only `{sessions:1}` or exactly `invalid_request` "Unsupported AI command."; timeouts, other errors and malformed answers reject. A `sessions.begin` without a usable bounded `sessionId` is an error. `dev_server.py` answers like an old host, so sessions are tested only offline (`tests/ai-session.mjs`) and on Android.
- Rotation loads a new page that cannot hold the old session; the host releases it while the request continues, and the new page polls, saves and acknowledges by saved ID. Closing the task cancels both.
- Stored diagnostics redact session, request and account IDs. Recovery wording is in `DESIGN.md`.

## Time tracking

Profile → My practice shows Today, Last 7 days (today plus six prior local dates) and All time. Counting rules (product decisions, not learning evidence):

- **App time:** page visible, no idle timeout.
- **Reading** (activity `reading`, story language): visible time with the reader open, including notes, explanations, selection and listening. It is a subset of app time, never added separately.
- **Background chapter audio:** counts app, language and reading while an utterance is in flight, even hidden; paused, stopped, cancelled or failed audio does not. It keeps the story it started with. Only chapter Listen and player audio count (via the `speech` wrapper in `js/usage-tracker.js`), not selected-text speech.
- No interval is counted twice.
- **Clock:** credits monotonic `performance.now()` deltas between observations (events, or a 30 s heartbeat while visible or playing). The wall clock only picks local dates: intervals split at local midnight (DST-safe); a delta whose wall and monotonic lengths disagree is credited at its monotonic length to the current date. Future-dated days (clock moved back) appear only in All time.
- **Suspension:** a gap over 60 s between observations is discarded entirely; no duration is inferred from text length. Long suspended playback and throttled timers are therefore undercounted, and a crash or kill loses time since the last save (nominally 30 s, no guaranteed bound).
- **Storage:** `{"version":1,"days":{"YYYY-MM-DD":{"app":ms,"languages":{"de":{"reading":ms}}}}}`, integer ms, unknown fields tolerated. `validUsage` checks version, dates, whole non-negative ms, safe keys and activity ≤ app. Rewritten whole, never appended: every 30 s when changed, on visibility change or pagehide, reader open or close, audio pause, stop, cancel or error, and when a listening run ends. No per-day cap (a date can repeat after clock changes). A failed write keeps counters and Stats offers Retry save. Deletion, language disabling and updates never touch it.

## Lookup history and probable reading

[PED-005](../pedagogy/PED-005-consultation-signals.md). Shape: `{"version":1,"languages":{"de":{"items":{…},"reading":{"YYYY-MM-DD":{"words":n,"paragraphs":n}},"readMarks":{"storyId/versionId":{"paragraphIndex":"YYYY-MM-DD"}}}}}`.

- **Items** are keyed by text (NFC, collapsed spaces, lowercase); a glossary note and a selection of the same text share one item. Old `note:<headword>|<meaning>` and `sel:<text>` keys merge on load without a write. Each item has `kind` (`note` once any note was opened, else `selection`), `word` (canonical, no readings), `meaning` (latest) and `meanings` (all, latest first, `{text, count, first, last, sentence}`), per-action `counts` (`note`, `listen`, `explain`, `detail`, `examples`, `translate`), distinct `days`, `first`, `last`, up to three `contexts`, `exposures`, `seenSinceLookup`, `lastExposure`.
- **Writes:** the whole file after each change. The same item and action within two minutes counts once. Recording follows success: explanations and follow-ups after saving, Translate after the translator opens. Title selections and the Profile detail sheet never record.
- **Probable reading:** `js/reading-exposure.js` samples once per second while a chapter shows; a paragraph is text between line breaks. Dwell accrues only while the page is visible, the learner interacted within 60 s, and half the paragraph (or half the viewport) is visible; sample gaps over 5 s are discarded. A paragraph counts when dwell reaches its `Intl.Segmenter` word count at 400 wpm (minimum 1.5 s), at most once per version and local day. Note items are seen through `findGlossaryMatches`; selection items through literal occurrences.
- Optional store (see Storage states). Clear list removes one language after confirmation. No caps; only touched items are stored.

## Testing

- `python3 scripts/check.py` (Node 22.12+, Python 3.9+) runs every Node and Python test.
- `python3 scripts/browser_smoke.py` prints a runner URL; Run smoke checks needs its disposable-workspace marker and offline mock. It covers the four language flows, notes, reopening, continuation and rewrite, cancel/reload/resume, malformed and blank stores with Retry loading, unreadable settings and injected settings write failures. `tests/browser/inspect.html` gives screenshot fixtures for recovery and write-failure states. `tests/app-startup.mjs` boots `js/app.js` against a stub DOM.
- Mock fixtures establish interface and contract behavior only. Android behavior is listed in the [device checklist](../validation/device-checklist.md); live-model evidence is in the [generation evaluation summary](../validation/generation-evaluation/summary.md).
