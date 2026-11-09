# Learner tracking

How time in the app, lookups and probable reading are measured and stored. Rationale for lookups: [PED-005](../pedagogy/PED-005-consultation-signals.md). Architecture docs: [overview](overview.md) · [data and storage](data-and-storage.md) · [generation pipeline](generation-pipeline.md) · [learner tracking](learner-tracking.md) · [safeguards](safeguards.md). Interface rules: [`DESIGN.md`](../../DESIGN.md).

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
- Optional store (see [storage states](data-and-storage.md#storage-states)). Clear list removes one language after confirmation. No caps; only touched items are stored.
