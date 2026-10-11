# Optional chapter prompts and shorter Settings copy

Prompt version: `2026-10-11.10`.

- `node tests/reader-regression.cjs`: passed, including new blank/whitespace continuation and rewrite cases. Tests check that requests start, default guidance is supplied, and empty learner prompts remain empty in saved provenance. Existing chapter, glossary, cancellation and durable-save regressions pass.
- Offline development browser: submitted Continue and Rewrite with empty fields; confirmed a new chapter and alternate version were saved. Inspected saved prompts and confirmed both remained empty.
- Visual screenshot inspection: desktop Settings and reader (including 1280×900), plus 390×844 mobile Settings and optional continuation form. Checked wrapping, helper-to-field spacing, separation from subsequent labels, textarea examples, optional labels and default placeholders. Inspected both the reading-profile and language-preferences portions of Settings. Reset viewport overrides afterward.
- Restored the saved-story and Settings backup after browser checks. No live inference was used.

Short Settings summaries live in `settingsDescriptions` in the managed learning-profile definitions; the full `languages` descriptions remain unchanged for generation and saved reading-profile snapshots. No data migration is needed. Optional blank prompts and rewrite/continuation defaults are product assumptions, not evidence of improved learning. Native Android layout and linguistic quality of defaults remain pending verification.

## Multilingual input invitation

Added one language-input note above Create fields and a brief target-language writing invitation beneath Story idea. Both story inputs reference the language note through `aria-describedby`. Both chapter actions use “Add ideas in any language, or leave blank.” Screenshot inspection covered desktop Create (1280×900), mobile Create and continuation prompt (390×844); also opened rewrite and confirmed its shared placeholder. Checked wrapping, spacing and optional labels. Reader regressions passed. No inference was needed for this copy check; prompt version remains `2026-10-11.10`. Restored Settings/stories from the pre-check backup and reset viewport overrides. These invitations do not promise writing correction or proven learning effects.
