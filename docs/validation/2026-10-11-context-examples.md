# Context excerpts and two follow-up actions

## Checks run

- `node tests/reader-regression.cjs` passed. Coverage includes sentence and repeated-fragment offsets, invalid-excerpt fallback with translation discarded, surrogate-pair boundaries, safe text rendering, source highlights and ruby readings, legacy cards, the two action handlers, steered/blank detail requests, three-example validation, overlapping help requests, example history, save-failure rollback, acknowledgement retry without duplication, cancellation and existing chapter/version lifecycle behavior.
- `node --check js/app.js`, Python parsing with the 3.9 grammar, manifest path/ownership/duplicate checks and `git diff --check` passed.
- Exercised the deterministic mock response fixtures directly for German, Japanese, Russian and Spanish. Verified initial/detail/examples response shapes, UTF-16 offsets with a supplementary character before the source sentence, three examples per language, canonical highlight substrings, exact Japanese annotation concatenation and unsupported-selection behavior.
- Browser checks ran at `http://localhost:8888` using `python3 dev_server.py --mock-ai` in an isolated workspace copy. Preview writes used empty test stories/settings; repository user data was unchanged.
- Generated and saved the Japanese story fixture. Drag-selected exactly `く` with furigana visible. A boundary inside a preceding reading initially hid the toolbar; after mapping reading boundaries to canonical offsets, the same browser selection opened Explain/Copy and returned the intended source excerpt.
- Explain displayed `空は青く、風はやさしいです。` with only `く` highlighted and the short English explanatory paragraph. Generate examples requested directly and appended three sentences, each with a highlighted `く`, separate readings and English translation.
- More detail opened the one-line field after examples were saved. Submitted “How do I form this ending?” with Enter; the question/detail appended without replacing examples. Opening/cancelling the field restored the action buttons. Reloaded and reopened the shelf story; the source excerpt, explanation, example set and question/detail persisted. A blank detail submission appended general detail, with both actions still available.
- At a 390×844 viewport, the reader panel's client width and scroll width were both 375px. The selected-context highlight was exactly `く`, and the example list contained three items. Restored the normal viewport after testing.
- Saved [context and examples screenshot](../images/reader-context-examples.png). It shows the deterministic Japanese fixture; its content is not live AI output.

## Remaining review

Actual App² model responses and qualified language review remain pending for all four languages. Fixture and schema checks do not establish grammatical accuracy, naturalness, correct readings, helpful context choice or same-function examples from a live model. Review each language's initial paragraph, optional context translation, detail answers and example sets separately. Native Android selection, clipboard, safe-area insets and keyboard behavior remain pending. The browser drag-boundary fix is not Android verification.

Prompt version: `2026-10-11.4`. Contextual help and three-example defaults are product assumptions, not evidence of learning effectiveness. Existing saved explanations remain unchanged; new context fields and typed follow-ups are additive.
