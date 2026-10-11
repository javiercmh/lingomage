# Reader management validation

Generation instructions and prompt version `2026-10-11.11` remain unchanged.

## Automated checks

- `node tests/reader-management-regression.cjs`: passed. Covers middle-to-end and last-chapter removal, truncating before a fork, deleting Original and an alternate, shared versions/explanations/follow-ups, memory-prefix pruning, legacy root mirrors, persistent naming, reload interpretation, atomic save rollback/retry, stale confirmations, pending AI/result guards, Chapter 1/final-path routing and focus restoration. Exercises the production generation handler after truncation: continuation uses the retained ending, and rewriting after deleting an alternate produces a new unique name with the correct parent path ID.
- `node tests/reader-regression.cjs`: passed, including existing generation, explanation, cancellation, save/release and reader navigation checks.
- `node tests/story-memory-regression.cjs`: passed.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 10 tests passed outside the sandbox, which permits local sockets.
- JavaScript module syntax and `git diff --check`: passed.

## Browser and visual checks

Ran `python3 dev_server.py --mock-ai` at localhost:8888 from an isolated copy in `/tmp/lingomage-management-preview`, using invented disposable chapter/path fixtures. Real workspace stories/settings were not modified.

Inspected desktop 1280×900 and mobile 390×844 screenshots of Story actions, chapter-range confirmation and path confirmation. Checked toolbar wrapping, spacing, readable labels, unclipped menus/dialogs, focus indicators and 44px targets. Cancel received initial focus; Cancel restored Story actions and preserved all chapters. Escape closed the disclosure and restored focus without closing the reader. Single-path fixture hid Story path, offered Delete story, and used singular wording for removing the final chapter. Whole-story confirmation opened and cancelled cleanly. During mock context preparation, both destructive actions were visibly disabled with the finish/save explanation; cancelled inference returned to the editable prompt.

Screenshots: [desktop menu](../images/reader-management-desktop.png), [mobile menu](../images/reader-management-mobile.png), [mobile confirmation](../images/reader-management-confirm.png). Preview server stopped once during later checks; restarted it and opened a fresh preview tab to finish single-path verification. Reset viewport overrides afterward.

Permanent deletion and save failure/retry were exercised in the production-function regression harness, rather than by confirming browser deletion. The browser checks inspected confirmations and cancellation; no real user content was deleted. Native App² insets, Android Back/focus interactions and host save failures remain pending. No commit, push or publication was performed.
