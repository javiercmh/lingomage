# Detail formatting and floating selection validation

Prompt version: `2026-10-11.8`.

- `node tests/reader-regression.cjs` passed, including safe detail formatting, paragraphs, nested italic in bold, inline code, literal HTML, unmatched markers, mixed select-all then clear behavior, legacy help rendering, and existing save/provenance and deletion regressions.
- Opened the local `python3 dev_server.py --mock-ai` browser preview using the existing saved German story. Confirmed its saved detail displayed, entered explanation selection, and verified the toolbar had fixed positioning, a checked select-all checkbox and 100px bottom padding.
- At 390 × 844, scrolled to the final card. The bar remained 12px above the viewport bottom, stayed within the viewport, and the final card was visible above it. Space on the toolbar checkbox exited selection, restored detail actions and returned focus to Select explanation.
- Reloaded the preview successfully. No stories or settings were edited by these checks.

Browser formatting assertions use the regression DOM harness; the existing browser story had no Markdown markers. Native Android safe areas, clipboard and selection remain pending. Live model formatting and learning effectiveness are unvalidated.
