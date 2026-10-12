# App² subapp runtime

LingoMage is a dependency-free HTML/CSS/JavaScript App² subapp at the repository root. `dev_server.py` provides Python 3.9+ browser testing with deterministic `--mock-ai` responses or optional development-only `--chatgpt` through the Codex CLI login. There is no native LingoMage app, Gradle build or production Python service. Historical Kotlin source remains in Git; [the safeguard audit](language-safeguards.md) records what was adopted, adapted and rejected.

## Ownership and data

Only `js/bridge.js` calls host capabilities. App² owns production AI configuration, credentials, speech, device translation and update installation. Choose providers/models in App² Settings → AI; the workspace never stores credentials or request headers.

- `data/stories.json`: canonical stories, ordered chapters, immutable alternate versions and paths, rolling memory and version-scoped explanations/examples. Old one-story records are interpreted additively and keep their provenance.
- `data/settings.json`: models/reasoning, learner profiles and regional preferences, reading preferences and shared `storyLength` (`short`, `medium`, `long`, default `short`).
- `data/generation-checkpoints.json`: at most one unfinished content operation, seeded empty. Captures ID, kind, destination/path lineage, learner input, prompt and safeguard versions, AI configuration, length, stage, validated content and outstanding request ID. No credentials are included.
- `data/learning-profiles.json` and `data/language-safeguards.json`: shipped managed definitions.

Manifest ownership distinguishes managed definitions/code from user data. Packaging seeds empty user defaults, never local stories/settings/checkpoints.

## Content and learning

Prompt version `2026-10-12.4` retains current profiles, learner wishes, optional topics/practice, adjustable difficulty and regional preferences. Every chapter requests learning/practice material and useful English notes even when practice is blank. At least one structurally valid note is mandatory. Notes stay integrated as underlined exact chapter forms opening contextual popovers; headword presentation is unchanged.

Shared content validation applies to creation, continuation, rewrite and examples. Target-script checks enforce Japanese without romaji and Russian Cyrillic without Latin transliteration. Russian stress is absent by default but permitted when requested; intent is prompt guidance, not a categorical validator ban. Correct orthography and natural grammar are requested without the former beginner curriculum restrictions. Definitions and limitations are in [the safeguard register/audit](language-safeguards.md).

Short chapters require 100–150 lexical words or 8–12 Japanese sentence-ending groups; Medium doubles these targets and Long quadruples them. Length remains separate from difficulty and sentence complexity. The selected length is captured at request start and stored in new version provenance with the safeguard-definition version.

## Japanese readings and recovery

First generate and validate canonical prose. The app then extracts contiguous kanji compounds from title/story or example sentences, with occurrence-specific IDs, UTF-16 offsets and context, and requests only kana readings. Validate exact ID coverage and construct annotations in the app. Kana-only content skips the reading call. Popover headwords are excluded.

Every validated stage is persisted in checkpoints before acknowledgement. Final story application is idempotent via `operationId`; partial prose never appears as a completed story. Resume reuses saved stages and captured configuration. Discard explicitly cancels/releases any outstanding request and removes progress. Cancellation stops subsequent stages. No inference automatically retries. Save/release failures retain recoverable progress, block new generation and offer explicit Resume or Save / finish. A confirmed `not_found` request may be released locally after a host/server restart; other release failures remain actionable. Malformed checkpoint files block generation rather than silently replacing data.

Checkpoint persistence provides recovery across page recreation, unlike the earlier in-memory-only completed-response workflow. Definitions from an older prompt/safeguard version must be discarded rather than resumed under changed rules. Checkpoints contain learner text and must be treated as user data.

## Reader, memory and help

The full-screen reader keeps canonical selection/copy/speech separate from ruby, with adjustable size, opt-in notes, path/chapter navigation, continuation and alternate rewrites. Existing stories and explanations are not revalidated or rewritten on load.

Narrative memory remains bounded and lineage-specific: 8,000-unit summary chunks, a 12,000-unit serialized memory cap, and bounded recent prose. Rewrites include the current chapter revision source but exclude its events from preceding context. Summary stages preserve the existing save-before-acknowledgement workflow. Removal prunes only unreferenced versions/help/memory and preserves shared path content.

Initial contextual help returns source UTF-16 excerpt boundaries, optional English context translation and one concise explanation. Detail returns plain text with legacy JSON compatibility. Examples return three canonical sentences, English translations and validated highlight ranges; Japanese readings use the staged pipeline. Existing follow-ups retain history and provenance.

## Verification

Run `python3 scripts/check.py` with Node 22 and Python 3.9+. Browser checks use disposable workspace copies because the server saves JSON files. Mock fixtures establish interface/contract behavior only. Native App² insets, selection, speech, device translation, install/update and live AI require separate device checks. Linguistic accuracy, concept novelty and learning effects are not certified by validators. See [device checklist](../validation/device-checklist.md) and dated validation records.
