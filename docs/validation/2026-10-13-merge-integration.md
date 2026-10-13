# Merge integration validation

Date: 2026-10-13. App 1.2.15, prompt 2026-10-13.14, safeguards 2026-10-13.2.

## Decisions

Integrated level-guided generation/first-only glossary changes with newer main f49ef50. The authoritative generation pipeline now saves a bounded language plan, canonical prose, and optional app-owned Japanese readings in `data/generation-checkpoints.json`. Examples skip story planning. Numeric length safeguard LANG-001 is explicitly retired under PED-004; all other registered safeguards remain active. Technical content bounds and useful nonempty exact-form notes remain enforced. Russian stress retains the main-branch preference-based policy. Stored stories and provenance remain readable. Provider-exposure discovery, publisher com.wynh.lingomage, chapter Copy/Listen, floating selection/status, translation and native source retirement are preserved.

## Checks actually run

`python3 scripts/check.py` passed all JavaScript suites, active safeguard coverage, manifest ownership checks and 12 Python tests using an escalated local-server test run. The initial sandbox run could not bind HTTP sockets. Added merged-pipeline tests exercise plan/prose/readings order, saved plan reuse after reload and cancellation during pending stage starts and plan release for Create/Continue/Rewrite. The actual Create cancellation handler is included. Existing reader, path, memory, translation, speech, AI exposure and Japanese reading-ID checks passed. Module syntax and diff whitespace checks passed.

Used the deterministic mock server at localhost:8888 with no external AI requests. Generated German A1 longer passage and continued with A2/scene; the saved story contained two chapters. Generated Japanese N5 longer passage through plan/prose/readings and inspected 75 retained ruby readings with two logical glossary controls (three visual fragments). Clicking the います fragment opened the shared 買う popup. Checked rendered screenshots at desktop 1280×900 and narrow mobile 390×844 for the combined reader, popup and expanded level/language-preference controls: wrapping, spacing, hierarchy, kanji readings, viewport bounds and retained 44px reader buttons. A transient screenshot taken immediately after resizing was clipped; the settled desktop viewport was separately observed and visually inspected without clipping. Browser console error inspection returned none. Screenshots were inspected in tool output, not archived.

The browser-session clipboard read returned empty after clicking Copy chapter, so this does not establish host clipboard behavior. Production copy-handler regression verifies that canonical stored story text is passed to the clipboard API; Android clipboard and selection remain pending device verification. Native AI, speech, translation, insets and install/update remain pending. Fixtures do not validate language naturalness, level alignment or learning effectiveness.

Closed the temporary preview, reset viewport, stopped the mock server and restored stories/settings/checkpoints byte-for-byte from pre-QA backups. Ignored historical local Android build/IDE artifacts remain untouched; no native source is reintroduced.
