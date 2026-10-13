# Level-guided generation verification — 2026-10-13

Implementation: [PED-004](../pedagogy/PED-004-level-guided-generation.md). Prompt 2026-10-13.12; profile definitions 2026-10-13.2. Local workspace only; no commit, push, publication or live inference performed.

## Automated checks actually run

- `node tests/story-generation-regression.cjs`: bounded/empty/malformed plans; canonical-script plan checks; exact glossary forms and word boundaries; acceptance of long stories; missing Japanese readings; stage order; plan checkpoint before acknowledgement; writer response left unreleased until final save; checkpoint/save/release failures; malformed-plan and cancellation stops; persisted-request bridge wait without page-local cache; journal-clear save failure with idempotent release retry; completed-response recovery without model/provider discovery and original provenance retained.
- `node tests/reader-regression.cjs`: reader text/annotations, contextual help, speech, version-scoped explanations, save-before-ack, continuation/rewrite, failed prompts, cancellation and reading-position regression checks passed. The generation stub now supplies the new planning/provenance interface; the separate generation harness tests stage sequencing.
- `node tests/reader-management-regression.cjs`: chapter/path removal, shared content/memory, rollback, pending-AI guards and continuation/rewrite after truncation passed.
- `node tests/story-memory-regression.cjs`: bounded chunks, lineage, shared-cache reuse and memory save/release recovery passed.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 11 tests passed. Includes deterministic plans in all languages, scope-dependent fixture sizes and exact segment reconstruction, plus existing server/subprocess tests. Live-path tests use an isolated fake CLI, not live ChatGPT.
- JavaScript syntax checks, JSON parsing, declared manifest files/managed ownership and `git diff --check` passed.

## Browser interactions actually checked

Used `python3 dev_server.py --mock-ai` at localhost:8888 through the in-app browser. Settings choices checked: German A1, Japanese N5, Russian TORFL-I/B1 and Spanish B2. Create, blank continuation, rewrite to A2 and scope selection worked; generated records retained plan/level/framework/scope and original model/prompt/profile provenance.

Reloaded during planning: saved request and frozen inputs were recovered explicitly. This exposed the old page-local-only bridge wait helper; it now polls persisted IDs. Resuming the retained Japanese request completed without another plan request. Cancelled planning, reloaded, and explicitly resumed a Russian job. Saved jobs disable a fresh generation and display their original language/level/scope. An invalid Japanese fixture response was rejected and explicitly discarded before the corrected fixture was tested; no silent repair/inference occurred.

A synthetic legacy intermediate profile did not select a CEFR level and generation was blocked until a level was chosen. Selecting A1 preserved the original band, free-text self-report and inactive-language preferences in storage. Existing legacy story normalization/provenance is covered by the reader regression harness.

The final mock Spanish C1 Longer passage contained 200 whitespace-delimited words and was accepted. Japanese Longer passage repeated the five-sentence fixture five times and retained exact annotations; it exceeded the former sentence quota. Repetition is deliberate fixture behavior, not a recommended writing style or evidence of learning quality.

## Screenshots visually inspected

- Desktop 1280×900: expanded German Settings; Create with Spanish C1 and Longer passage; reader continuation fields with level/scope and action buttons; synthetic completed-response recovery with frozen-input summary and Save/Discard controls. Checked spacing, field/helper association, hierarchy, control widths and scrolling below the fold.
- Narrow mobile 390×844: expanded German Settings; Japanese N5/Russian TORFL-I Settings; Create; scrolled reader level/scope fields and Cancel/Continue actions; saved-generation and synthetic completed-response recovery summary/actions; Japanese canonical text with separate furigana. Checked line wrapping, touch controls, safe bottom navigation clearance and absence of horizontal clipping.
- Planning progress and completed reader states were observed through the accessibility tree. Screenshots were inspected in tool output; no screenshot file archive is claimed.

Test settings/stories were backed up before browser writes and restored after QA. Functional fixture checks do not establish lexical coverage, naturalness, meaning, reading-level accuracy or learning effectiveness. Qualified language review across low/middle/high levels remains pending, as do native App² managed AI, Android cancellation/recreation behavior, insets and installation/update checks. No live language-quality sample review was performed.
