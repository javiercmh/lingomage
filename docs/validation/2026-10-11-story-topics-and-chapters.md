# Story topics, chapter vocabulary and generation status validation

Prompt version: `2026-10-11.9`.

- `node tests/reader-regression.cjs`: passed. Added coverage verifies carried-forward story briefs/topics, shared fresh-glossary and open-ending prompt guidance, glossary storage on continuations and rewrites, canonical glossary speech text and locale, browser playback unavailability, popover focus return, story-bound loading cards, cancellation cleanup, and anchored failed prompts. Existing save-before-acknowledgement, explicit recovery, canonical Japanese, speech voice ordering, explanation and chapter-version checks remain passing.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 9 tests passed, including matching glossary forms and exact-concatenating annotations for initial/continuation/rewrite mock outputs in German, Japanese, Russian and Spanish. Local socket tests required execution outside the filesystem/network sandbox.
- Browser through `python3 dev_server.py --mock-ai`: verified the story-first field order and multiline brief at desktop and 390×844 mobile viewport sizes. Verified new story generation, chapter continuation and alternate rewrite versions with inline vocabulary notes. Verified the vocabulary popover, visible Listen icon disabled with an App² explanation, and Escape dismissal. Verified continuation/rewrite status cards, locked edit controls, and mobile layout. Cancelled a continuation and confirmed its status card disappeared, the prompt remained, and no chapter was appended.
- An interrupted local preview server produced a storage failure before continuation inference; the prompt and manual retry remained visible. After restarting the server, explicit retry completed successfully.
- Temporary browser-test stories and settings were restored from the pre-generation backup. No live AI was used. Viewport overrides were reset.

Limitations: the deterministic mock validates interface and request/storage behavior, not topic coverage, genre fidelity, narrative openings, linguistic quality, or learning effectiveness. Open endings are model guidance rather than semantic validation. Native App² audio, Android keyboard/selection/insets and installed voices remain pending device verification.

## Follow-up: Create helper layout correction

The earlier visual check overlooked the helper spacing defect visible in the user’s Android screenshot: generic field bottom margins separated descriptions from their own controls and brought them too close to the following labels. It was not sufficient to establish layout quality.

Shortened the two new descriptions and examples, grouped each label/control/helper together, set the field-to-helper gap to 6px and the following group gap to 22px, and added internal textarea padding. Screenshot inspection through the offline development server covered the desktop layout, 390×844 and 320×740 mobile layouts, including the setup notice displayed and dismissed. Checked helper association, wrapping, label separation and field padding. The narrowest view prompted a further shortening of the Topics example to avoid placeholder clipping. Android layout remains pending device verification. Contributor and design documentation now explicitly require screenshot-based visual checks for every UI/copy change.
