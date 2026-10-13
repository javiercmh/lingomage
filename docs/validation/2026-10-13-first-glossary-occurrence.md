# First-occurrence glossary and cancellation validation

Date: 2026-10-13. Prompt version: `2026-10-13.13`. Local changes only.

## Behavior and rationale

The reader selects first eligible headword/English-meaning identities after longest-form overlap resolution. NFC and trimmed/collapsed whitespace identify equivalent records; case, punctuation and different meanings remain distinct. Validation still checks all occurrences. Japanese fragments retain complete readings and activate a common primary control. Cancel buttons record intent before request IDs return and during stage handoff. Existing saved glossary and provenance require no migration. See [PED-002](../pedagogy/PED-002-contextual-reading-support.md) for the cited evidence and product preference distinction.

## Checks actually run

- All four dependency-free JavaScript suites passed: `story-generation-regression.cjs`, `reader-regression.cjs`, `reader-management-regression.cjs`, `story-memory-regression.cjs`.
- New reader regressions cover alternate forms, duplicate normalized identities, NFC, distinct meanings/case, new meanings at already-seen shared ranges, overlap precedence, repeated renders, repeated Japanese readings and one keyboard control across annotation segments.
- Actual production Create/Continue/Rewrite cancel button handlers were exercised during pending planner start, planner acknowledgement and pending writer start. Cancellation prevented waiting on newly cancelled requests or beginning writing after handoff; completed plans remained reusable.
- The controlled 20/100-word fixture links three first occurrences: 15%/3%, replacing the previous six all-occurrence links (30%/6%). This is a fixture illustration, not a prediction of generated content or student-level quality.
- All 11 Python development-server tests passed after running outside the sandbox, which blocks local server binds. The initial sandbox run failed on that restriction.
- Module syntax checks passed for app, story generation and reader text; manifest JSON/file existence and `git diff --check` passed.

## Browser and visual inspection

Used `python3 dev_server.py --mock-ai` at localhost:8888, with no external inference. Visually inspected rendered screenshots at desktop 1280×900 and narrow mobile 390×844 for German A1 and Japanese N5 longer-passage fixtures and open vocabulary popups. Checked spacing, wrapping, control hierarchy, ruby readings, popup bounds and clipping. Navigation and Listen controls retain their existing 44px targets; inline words remain text-sized reader links. Mobile preferences wrap onto a separate row without clipping. All five occurrences of each fixture word remained in the prose; only the first explanation had a logical link.

Japanese produced three fragment spans for two logical links: 買 (one keyboard button), います (plain-role pointer fragment), and 公園 (one keyboard button). All 75 ruby elements retained readings. Clicking います opened the 買う/to buy popup anchored to 買; clicking the primary closed the same popup. Enter opened it and Escape returned focus to the primary. Desktop and mobile screenshots confirmed full readings and later unlinked repetitions. Screenshots were inspected through browser output; no screenshot archive was created.

Closed the temporary browser tab, reset the viewport override, stopped the mock server and restored the original stories/settings byte-for-byte after testing.

## Pending limitations

Native Android selection/copy, App² cancellation/recovery and speech remain pending device verification. Existing canonical-selection regressions passed, but browser screenshots do not establish Android behavior. Deterministic fixtures do not validate naturalness, meaning, standardized reading-level quality or learning effectiveness. The host start/request-ID persistence gap remains a platform limitation. First-only display is a requested product preference, not a proven optimal glossing frequency.
