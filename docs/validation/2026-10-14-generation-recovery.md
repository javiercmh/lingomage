# Generation recovery verification

The reported Create Retry crash is reproduced by the production handler regression with `readerEditDraft: null` and no operation target. The corrected handler runs once, saves its result, ignores a second click while busy, and ignores a stale handler afterward. The underlying generic native service failure cannot be identified from the supplied screenshots; this change exposes the stage and available diagnostic code without asserting a provider cause.

`python3 scripts/check.py` passed (all JavaScript harnesses, active safeguard coverage, manifest ownership and 12 Python server tests). `git diff --check` passed. The available runtime was Node 26.10.0; Node 22 was not separately tested.

Automated checks include start, wait, invalid-response, save and release failures for Create, Continue, Rewrite and Examples; release-only recovery and failed-save recovery must not call inference. Existing coverage exercises planned-stage ordering, Japanese readings, checkpoint reload, cancellation, fixed-prose note recovery, memory preparation, saved provenance and idempotent application. Production explanation/detail handler tests retain the original selection and question despite a changed selection and save exactly one result. Reader acknowledgement tests retain failed release IDs and clear already-released requests. Fixed-bar scroll tests model a visible bar with `offsetParent: null`.

Browser checks used `python3 dev_server.py --mock-ai` in an isolated `/tmp` copy with empty learner records. One-shot fault injection existed only in that temporary server; a temporary selection button invoked the production explanation handler with the canonical German `zum` fixture. No live AI requests or real learner records were used. Actual successful Create, Continue and Rewrite were inspected. A Create notes-stage service failure was retried after reload and completed; its captured A1 level was restored and prose remained preserved. Explanation, More detail and Examples each failed once and completed after explicit Retry. The detail question remained visible after failure, and Examples resumed its checkpoint after reload.

Screenshots were visually inspected at 360×800 and 1200×900: Create summaries and expanded diagnostics, reader detail recovery, captured level/helper grouping, wrapping, button spacing/focus, and clearance above bottom navigation and the floating reader bar. The first mobile inspections exposed hidden actions; fixes add Create scroll clearance and measure fixed reader bars by client rectangles. Final screenshots show complete actions without overlap:

- [Create mobile](../images/generation-recovery-mobile.jpg)
- [Create desktop with diagnostics](../images/generation-recovery-desktop.jpg)
- [Detail mobile](../images/detail-recovery-mobile.jpg)
- [Detail desktop](../images/detail-recovery-desktop.jpg)

Native App² AI/provider causes, Android safe-area behavior and device rendering remain pending. Browser fixtures establish workflow and layout behavior, not semantic AI quality or learning effectiveness. Prompts and `PROMPT_VERSION` remain unchanged.

## Disclosure affordance follow-up

Removed the redundant service-summary instruction to open Technical details. The native `details`/`summary` disclosure now has a downward chevron when collapsed and an upward chevron when expanded, with the native marker hidden to avoid duplicate arrows. The label and 44px tap target remain unchanged. A temporary development-server fixture used the production error presenter and stylesheet; collapsed and expanded screenshots were visually inspected at 360×800 and 1200×900 for chevron placement, spacing and wrapping. Clicking toggled both states and Enter collapsed the focused disclosure. Screenshots: [mobile collapsed](../images/generation-disclosure-mobile.jpg) and [desktop expanded](../images/generation-disclosure-desktop.jpg). This fixture did not use learner records or AI calls.


## Design lesson

The learner found the instruction to open Technical details redundant and requested a visible expansion cue. Record the reusable convention in [DESIGN.md](../../DESIGN.md#interface-copy-and-visual-cues): words explain the failure, preserved progress, choices and consequences; familiar visual cues explain interaction mechanics. Keep the labelled disclosure and its accessible expanded/collapsed state, and use the chevron to make its affordance visible. This is feedback from this interaction plus the recorded visual checks, not evidence that every learner will understand every icon without a label.
