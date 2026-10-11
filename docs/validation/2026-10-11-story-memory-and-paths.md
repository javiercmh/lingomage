# Story memory and paths validation

Prompt version: `2026-10-11.11`.

## Automated checks

- `node tests/reader-regression.cjs`: passed. Production follow-up handler uses saved memory/recent prose without full-history duplication; rewrite receives empty prior memory for chapter 1 and the exact revision text. Alternate paths retain original later chapters and glossary/help version behavior. Existing cancellation and durable-save regressions pass.
- `node tests/story-memory-regression.cjs`: passed. Covers pinned legacy predecessor lineage, alternate prefixes, bounded chunks with exact full-text reconstruction and surrogate preservation, memory validation/oversize rejection, cache reuse, multi-chunk checkpoints, save rollback/retry, release retry and cancellation after a completed checkpoint.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: initially blocked by sandbox socket permissions; passed outside the sandbox; final suite has 10 tests including the summary endpoint/checkpoint/release contract.
- JavaScript module syntax check passed.

## Browser checks

Used `python3 dev_server.py --mock-ai` at localhost:8888, offline. Continued an existing story; observed context preparation followed by prose generation and Chapter 2 saved. Rewrote Chapter 1; Alternate 1 contained only the new version while Original retained Chapter 2 and its original explanation. Continued Alternate 1 independently, including from an earlier displayed chapter. Reloaded and confirmed persisted path selection and chapters. Cancelled during context preparation: no chapter was appended, path selection was re-enabled, and the prompt remained with Generation cancelled.

Visually inspected desktop 1280×900 and narrow mobile 390×844 reader screenshots: path label/selector, chapter controls, reading controls, fork note, canonical prose and equal-width actions. Checked wrapping, spacing, hierarchy, clipping and touch targets. Inspected desktop generation status and mobile cancellation/error prompt layout. Screenshots: [desktop](../images/story-path-desktop.png), [mobile](../images/story-path-mobile.png), [cancelled prompt](../images/story-path-cancel.png). Restored original stories/settings after browser checks and reset viewport overrides.

## Limits

Mock summaries preserve bounded fixture snippets, not narrative semantics. Live-model fidelity, long-story language quality and native Android/App² AI lifecycle/layout remain pending. Automated failures were simulated in regression harnesses; browser save/release failures were not induced. Unsaved responses remain recoverable only while the page is open. No commit, push or publication was performed.
