# Whole-chapter Listen validation

The reader title now includes the same speaker SVG used in glossary tooltips, with a 44px touch target and an English Listen to this chapter label. It reads the displayed chapter's canonical prose in its story language, without title, glossary, explanation or furigana content. Chapters use bounded sequential utterances; cancellation or a changed reader stops the sequence.

Passed `node tests/chapter-speech-regression.cjs`: complete text preserved across chunks, Unicode-safe boundaries, source locale, native cancellation and navigation guard. Existing reader regressions passed. JavaScript syntax and whitespace checks passed.

Visually inspected development-server screenshots at 1280 × 720 and 360 × 780: speaker icon aligned beside the title, long title wrapped without clipping, chapter controls and text retained spacing, browser-disabled state visible. No stored story content changed during these checks.

Actual App² speech playback, native Stop and Android lifecycle transitions remain pending device verification. No host change is needed.
