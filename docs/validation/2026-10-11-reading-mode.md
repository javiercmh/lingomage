# Reading mode and contextual help validation

Checks run in the local deterministic preview at `http://localhost:8889` using `python3 dev_server.py 8889 --mock-ai`:

- Opened a generated Japanese story in the full-screen reader. Furigana remained visible and word notes started collapsed.
- Drag-selected Japanese base text with furigana visible. The app-owned Explain/Copy toolbar appeared while the base text stayed selected.
- Requested an explanation and expanded detail. The response included a contextual English translation and an explicitly labelled mock difficulty estimate; it persisted with its chapter/version selection and appeared after reloading the story from the shelf.
- Appended a follow-up chapter, navigated between chapters, rewrote chapter one, and switched between the original and alternate versions. The later chapter remained present.
- `node --check js/app.js`, `python3 -m py_compile dev_server.py`, `git diff --check`, and manifest path existence checks passed.

This preview uses fixed mock text; it does not validate language quality, learner-relative difficulty, real AI output, clipboard contents, or persistence-failure recovery. Android WebView long-press/drag selection with visible furigana, native copy behavior, safe-area/inset handling, keyboard navigation, large-text layout, and qualified review of all four target languages remain pending.

## Audit fixes verified

- `node tests/reader-regression.cjs` passed isolated checks for save-failure retention, blocking inference while a completed response is unsaved, acknowledgement failure without rollback or duplication, explicit save/release retry, response anchoring after changing stories, captured model provenance, canonical text offsets at root/ruby/text boundaries, additive legacy loading, continuation from an earlier chapter using all active chapters, chapter-only rewrite with unchanged later chapters, cancellation, and restoration of chapter/panel scroll offset.
- Rechecked browser generation and continuation in an isolated workspace copy at `http://localhost:8890` with `python3 dev_server.py 8890 --mock-ai`. Returning to the shelf and reopening restored chapter two. Repository stories/settings were not used for preview writes.
- These stub-based failure tests do not certify native bridge failures or actual Android selection. The Android and language-review checks above remain pending. Unsaved response recovery lasts only for the current page session.
