# Swipe story deletion — 2026-10-11

Implemented gesture-only single-story deletion on My stories; removed reader deletion. These interaction choices are product assumptions, not established usability evidence.

Checks run:
- `node tests/reader-regression.cjs`: passed, including simulated touch/mouse thresholds, vertical intent, pointer cancellation, click suppression, selection guard, confirmed removal, save rollback, pending-AI guard and initial Cancel focus.
- `git diff --check`: passed.
- Browser preview on the existing deterministic mock development server at localhost:8888: desktop left drag revealed trash without opening the reader; confirmation named the story, warned about permanent removal, focused Cancel, and Cancel preserved the story.
- At 390×844: checked card layout, left drag reveal, Escape cancellation, right drag dismissal, and normal story opening. Reader contained no Delete story button. Viewport override reset afterward.

No real saved story was deleted during browser verification. Actual touchscreen vertical scrolling, native Android gesture behavior and safe areas remain pending device verification. Browser checks establish UI behavior only.

Visual refinement: the padded reading surface now slides as a single layer over an 80px-wide full-height red action area with a white trash icon. Verified the revealed styling on desktop and at 390×844, and checked that tapping the red area still opens the named confirmation and Cancel preserves the story. Regression harness and diff whitespace check passed again.
