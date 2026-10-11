# Focused selection help and reader design validation

## Checks run

- `node tests/reader-regression.cjs` passed: focused request context across German, Japanese, Russian and Spanish; sentence boundaries and repeated-fragment offsets; empty fragment translations; steered and blank follow-ups; legacy detail retention; follow-up provenance and save-before-acknowledge. Existing reader lifecycle, cancellation, canonical ruby selection, chapter/version and position checks also passed.
- `node --check js/app.js`, Python syntax parsing with the Python 3.9 grammar, manifest file-existence/managed-ownership checks, and `git diff --check` passed.
- Browser checks used an isolated workspace copy at `http://localhost:8888` with `python3 dev_server.py --mock-ai`. Repository stories and settings were not used for preview writes. Generated a Japanese mock story, opened the reader, and drag-selected exactly `く` with visible furigana. Explain saved a card quoting exactly `く`.
- More detail opened a labelled single-line input. Submitted “Why is it く rather than い here?” with Enter; the question and deterministic follow-up appeared in the saved card. Reloaded and reopened from the shelf; both remained visible.
- Opening and cancelling the follow-up field returned to the existing explanation. Submitting an empty field produced general detail while retaining the previous question/response. More detail remained available for another follow-up.
- Visually inspected the reader at desktop and 390×844 viewport sizes. Navigation and reading preferences wrap into separate groups. At 390px the reader panel's client width and scroll width were both 360px, confirming no horizontal overflow in this fixture.
- Captured [reader follow-up screenshot](../images/reader-follow-up.png). It contains visibly labelled deterministic mock content, not a reviewed language explanation.

## Content-review acceptance checklist — pending actual model review

For all four languages: explain only the selection, quote a containing word or relevant clause when necessary, use the profile silently, avoid unrelated vocabulary and difficulty judgments, and answer a follow-up without broadening into a sentence lesson.

- Japanese: `く` in `空は青く、風はやさしいです。` should explain `青い → 青く` and its clause-linking role without teaching kana, using romaji, or explaining the other words.
- German: `dem` in `Wir gehen mit dem Kind.` should explain the selected article's form in this construction without glossing every word. Also review a whole word and a multiword phrase.
- Russian: `ом` in `Я говорю с другом.` should explain the ending through `другом` and the relevant construction, using Cyrillic without transliteration. Also review a whole word and phrase.
- Spanish: `Lo` in `Lo vi ayer.` should explain its contextual pronoun role and acknowledge referent ambiguity when necessary. Also review a word ending and phrase, respecting a requested regional variety.

These are review targets and product assumptions, not proof of naturalness, grammatical correctness or learning effectiveness. Live AI quality and Android selection, insets and keyboard behavior remain pending. New prompt version: `2026-10-11.3`; existing saved help is unchanged until a learner explicitly requests a follow-up.
