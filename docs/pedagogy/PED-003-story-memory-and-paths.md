# PED-003: Bounded narrative memory and alternate story paths

- Date: 2026-10-11
- Status: implemented; model narrative fidelity and learning effects unvalidated
- Scope: continuation and rewrite in all four target languages
- Evidence basis: product assumption; no empirical claim or new research citation

## Decision

Before a follow-up, summarize each source chapter from the saved preceding memory and canonical prose. The writer receives structured English memory and exact recent target-language prose, alongside the original brief, topics, learner preferences and optional follow-up prompt. Memory separates characters, established facts, important plot events, unresolved threads, uncertainties and current situation. Character beliefs must not become established facts; missing information must not be invented. Japanese readings and glossary/help content are excluded.

Continuation summarizes through the selected path's ending. Rewrite uses memory only through the preceding chapter, its recent prose and the full current chapter as the revision source. Empty rewrite requests retain the main events and narrative role. Explicit changes may alter them. A rewrite starts an alternate path ending at that chapter, preserving original descendants and explanations. The Story path selector replaces independent version selection so the app cannot silently combine incompatible histories.

## Product defaults and limitations

Memory JSON is bounded to 12,000 JavaScript characters; input chunks are at most 8,000 characters. Long chapters are consumed sequentially without omission, preserving surrogate pairs. Recent prose includes the whole chapter up to 8,000 characters, otherwise its last 4,000, preferring a sentence or paragraph boundary. These are character budgets, not model token limits. The rewrite source remains complete. These choices reduce history growth and duplication, but do not guarantee fidelity, eliminate summary drift, or establish improved learning. Long stories with no cached memory need several initial requests. No live model review was performed.

Memory is cached by exact ordered version lineage, chunk index, memory format version and prompt version. Shared path prefixes reuse memory. Records retain provider/model/prompt provenance. Completed checkpoints are saved before acknowledgement; cancellation or errors stop subsequent stages and require explicit retry. Summaries are inspectable in `data/stories.json`.

## Compatibility

Legacy stories derive paths lazily from version-source and chapter predecessor links. Same-chapter rewrite links are traced back to their original predecessor. Where provenance is absent, use the saved selected sequence and mark continuity uncertain. Preserve all stored chapters, versions and help. There is no bulk data migration. Completed checkpoints survive reload; unsaved completed responses still require the existing in-page recovery workflow.

## Validation

Behavior is covered by `tests/story-memory-regression.cjs`. Deterministic mock output and schema tests cannot establish narrative accuracy, language quality, or pedagogical effectiveness. Revisit budgets and summary instructions after live-model review of long stories and branched narratives.


## Reader management (2026-10-12)

Learners can remove a chapter and its successors from the selected path or delete an entire path through Story actions. Shared chapter versions, explanations and memory remain available on other paths; exclusively unreferenced content is permanently removed after confirmation. Removing the beginning of the final path deletes the story. The app uses one durable save with rollback on failure, blocks removal while AI work or a result awaits saving/release, and clears positions/drafts for deleted content. Names use a persistent counter so a later rewrite cannot reuse a deleted alternate's name. This is a product assumption about keeping narrative continuity understandable, not evidence of learning effectiveness. Generation instructions and prompt version are unchanged. Covered by `tests/reader-management-regression.cjs`.

### Continuity experiment prepared — 2026-10-14

The separate experimental prose writer internally checks who knows what, possession and ownership, character/object location, chronology and unresolved events. Continuation begins from supplied narrative state; rewrite treats the current chapter as its revision source and preceding history as constraints. Natural unresolved endings remain unless closure is requested. Checks occur in the existing writing request with the same schema. Production continuity instructions and saved records are unchanged pending the notes-selection prerequisite and separate prose evaluation. This remains a product assumption without direct evidence; no fidelity or learning-effect claim is made. See [controlled comparison](../validation/generation-evaluation/contextual-notes/README.md).
