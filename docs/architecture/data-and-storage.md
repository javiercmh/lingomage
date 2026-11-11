# Data files and storage

Every JSON file the app reads or writes, what it holds, and how unreadable or failed stores behave. Architecture docs: [overview](overview.md) · [data and storage](data-and-storage.md) · [generation pipeline](generation-pipeline.md) · [learner tracking](learner-tracking.md) · [safeguards](safeguards.md). Interface rules: [`DESIGN.md`](../../DESIGN.md).

## Data files

| File | Owner | Contents |
| --- | --- | --- |
| `data/stories.json` | user, required | Stories, ordered chapters, immutable alternate versions and paths, rolling memory (`memories`: summary records with `updateReport`, condensed records with `compactedFrom`, `condensedEvents` (event ids), `excerpts`, `sizeBefore`, `sizeAfter`; a memory record's `promptVersion` is its memory prompt's version; memory format in PED-003), version-scoped explanations and examples, reading positions, `lastActivityAt`; optional `memoryRebuild` captures `{pathId, pathName, entries}` for explicit summary repair and reload recovery |
| `data/settings.json` | user, required | Model and reasoning, language enablement and order, standardized reading targets, legacy self-assessments, regional preferences, `backgroundStoryContext` (boolean, absent means on), `shareVocabularyNotes` (boolean, absent means off: the Share sheet’s Include vocabulary notes switch), `readingPreferences` |
| `data/generation-checkpoints.json` | user, required, seeded empty | At most one unfinished operation: ID, kind, destination and path lineage, learner input, prompt and safeguard versions, AI configuration, scope, stage, validated plan and content, outstanding request ID. Optional `discardRequested: true` records an explicit in-app cancellation or Discard; it permits cleanup only, including after reload. Absent means ordinary recovery. Contains learner text; never packaged |
| `data/usage.json` | user, optional | Time-tracking aggregates, seed `{"version":1,"days":{}}` |
| `data/learning-signals.json` | user, optional | Lookup history and probable reading, seed `{"version":1,"languages":{}}` |
| `data/learning-profiles.json` | managed | Level definitions, generation guides, scopes |
| `data/language-safeguards.json` | managed | Safeguard register |

User files are seeded only when absent, preserved by updates and never packaged with local content. Saved records stay readable across versions; no general migration exists (one temporary glossary-alias migration, `term`/`text` → `word`, lives in `js/workspace-storage.js` until the next major release).

## Storage states

- **Required stores** (stories, settings, checkpoints): a missing file uses its seed default; a blank file, malformed JSON, incompatible minimum shape or failed read marks the store invalid and blocks its writes. Nothing is reset or repaired automatically. A file counts as missing when the host reports `ENOENT`, "not found" or "does not exist", or reads empty while `listFiles` omits it. Any invalid required store blocks generation and makes Settings read-only; other stores stay readable.
- **Optional stores** (usage, learning signals): an unreadable file is preserved byte for byte and blocks only its own writes; counting continues in memory and merges into the file after Retry loading. They never block stories, settings, generation or the Workspace needs attention panel (`assertWritable()` covers only required stores).
- **Preservation:** validators check only the shape needed to read. Optional story fields written as `null` read as absent. Unknown story and settings fields, unknown entries in `readingPreferences`, `targetLanguages`, `standardizedLevels`, `learnerProfiles`, `languageExpectations` and `languageOrder`, and unchanged legacy values are written back unchanged; runtime state never holds them. A known entry the learner removed is not restored.
- **Save errors** carry `store_invalid` (never written), `invalid_data` or `write_failed`. A failed preference write restores the last saved snapshot and syncs every affected control while keeping focus and uncommitted typing; Retry save repeats exactly the intended change.
- The development server writes to a temporary file in the same directory, flushes, then replaces. Native write atomicity needs an Android check.

## Library activity

`lastActivityAt` (optional ISO string on a story) orders the Library and drives "Updated". It is stamped in the same save as new content: on first save of a new story with `lastActivityKind: "created"`, and on saving a continue, rewrite, examples, explanation or detail result (`updated`). It is also stamped (`updated`) on an imported story. It rolls back with the content if the save fails, is never lowered, and is not stamped by opening, scrolling, reader positions, pre-request saves, path switching, removals, deletion, failed or cancelled requests, checkpoint stages or story-memory rebuilds; re-applying an operation does not restamp. Stories without it derive activity from the latest valid `createdAt` among story, chapters, versions, explanations and follow-ups (ignoring invalid values and those over a day in the future). Presentation only: prompts, provenance and `PROMPT_VERSION` are unaffected; nothing is backfilled.

## Story export

A `.lingomage.json` file contains `{format:"lingomage-story", formatVersion:1, appVersion, exportedAt, story}`. The story is a deep clone of the saved record, including unknown fields, all paths and versions, explanations, memories and memory rebuild state. No settings, checkpoints, usage or learning signals are exported. Share → Download backup saves it (App² Save as, or a browser download) and Share story file sends it through the share sheet; it is never copied. Sharing never writes a store.

## Story import

Library → Import story… reads one chosen `.lingomage.json` file (at most 16 MiB) and accepts only `format:"lingomage-story"` with `formatVersion:1` (a higher version asks the learner to update LingoMage) and a story that passes the `data/stories.json` validator on its own. The story is deep-cloned with every field kept, given a new `id` (never colliding with a saved story) and `importedAt`, and stamped as `updated` Library activity; the original `createdAt` stays. Legacy single-text stories get their derived chapter written out first so version IDs are unchanged. It is added at the front of `data/stories.json` through the normal save; existing stories are never replaced or merged, and the same file imported twice gives two stories. Envelope fields (`appVersion`, `exportedAt`) are not stored. Cancelling, an unreadable, oversized or invalid file, an invalid stories store or a failed save leaves the saved stories unchanged.
