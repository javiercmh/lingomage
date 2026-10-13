# Generation implementation audit — 2026-10-13

Follow-up to [implementation verification](2026-10-13-level-guided-generation.md), focused on underline density and request-stage correctness. No live inference or new screenshot inspection was performed in this audit; interface layout and generation prompts were unchanged.

## Underline behavior verified

`findGlossaryMatches` in `js/reader-text.js` receives canonical text and glossary entries, without a proficiency level. It links every matching occurrence, merges identical ranges and prefers longer overlapping matches. Japanese forms may match inside connected script text. A grammar note may describe a phrase or ending rather than a whole word. One Japanese occurrence may create multiple DOM triggers across annotation boundaries; counting triggers is not a word-coverage measure.

The language plan permits up to five vocabulary candidates and two grammar focuses. That is not a limit on the final glossary: the writer can include additional useful notes. There is no level-dependent glossary quota or computed unknown-word percentage. Shorter or more repetitive stories can have higher linked-text density, but neither higher nor lower density at beginner levels has been demonstrated with live model outputs.

A production-matcher test uses the same three glossary entries (Brot, Markt, Fluss): six occurrences in a 20-word text link 30% of whitespace-delimited word tokens; extending that text to 100 words without further occurrences links 6%. This controlled example demonstrates denominator/repetition effects, not an actual CEFR-level comparison or learner vocabulary knowledge. No numeric underline cap or new learning policy was added.

## Defects found and corrected

1. Cancellation during planning acknowledgement could still start writing; cancellation while a new request ID was being acquired could target the old stage. The job now tracks its active stage, clears stale UI request IDs, retains cancellation intent, and checks that intent before starting a stage and immediately after its new ID arrives. Tests exercise production orchestration during plan acknowledgement and writer start, plus direct runner checks for both stages.
2. The canonical-script checks rejected Latin text but accepted other inappropriate scripts. Russian and Japanese now validate letters against their permitted scripts; Russian rejects added stress marks. Tests include Greek/CJK in Russian, Greek in Japanese plans, and valid Japanese prolonged-sound marks.
3. Glossary validation and rendering used different boundary rules. A validator-approved form could produce no underline (for example Markt within _Markt_, or Japanese numeric form 3 inside 13). Validation now uses the production matcher for each surface form, so an accepted form has an actual renderable occurrence. This does not establish its semantic meaning at every occurrence.

## Checks actually run

- `node tests/story-generation-regression.cjs`: controlled density, script and boundary cases, production cancellation handoffs, checkpoint/save/release failures, reload reuse, retained provenance and offline completed-response recovery passed.
- `node tests/reader-regression.cjs`, `node tests/reader-management-regression.cjs`, `node tests/story-memory-regression.cjs`: passed.
- `python3 -m unittest discover -s tests -p 'test_*.py'`: 11 tests passed; subprocess/live-path tests use a fake CLI.
- Production ES-module import of `js/story-generation.js` and its shared matcher passed; JavaScript syntax and whitespace checks passed.

## Remaining limits

The level guides and planning/writing split remain app-authored, unvalidated guidance. Final text difficulty, semantic glossary accuracy, furigana correctness and individual known vocabulary are not independently measured. Native App² cancellation/recreation remains pending. The managed bridge does not provide an atomic transaction combining inference start with saving its returned request ID; interruption exactly within that gap is not guaranteed recoverable by these checkpoints.

The subsequent [first-occurrence refinement](2026-10-13-first-glossary-occurrence.md) supersedes this audit's all-occurrence underline-density figures and fixes the actual button guards during pending request starts. Earlier figures describe the behavior checked at that time.
