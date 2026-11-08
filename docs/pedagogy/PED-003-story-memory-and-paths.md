# PED-003: Bounded narrative memory and alternate story paths

- Date: 2026-10-11
- Status: implemented; narrative fidelity and learning effects unvalidated
- Scope: continuation and rewrite in all four languages
- Evidence basis: product assumption; no empirical claim

## Decisions

- **Memory:** before a follow-up, each source chapter is summarized from the preceding memory and its canonical prose into structured English memory: characters, established facts, important events, unresolved threads, uncertainties and current situation. Character beliefs must not become facts; missing information must not be invented. Japanese readings and help content are excluded. The writer receives this memory, exact recent target-language prose, the original brief, topics, preferences and the optional prompt.
- **Continue** summarizes through the selected path's end. **Rewrite** uses memory through the preceding chapter, its recent prose and the full current chapter as revision source; a blank rewrite keeps main events and narrative role, an explicit request may change them.
- **Paths:** a rewrite starts an alternate path ending at that chapter, preserving original descendants and explanations. One Story path selector replaces independent version selection so incompatible histories are never silently combined.
- **Removal:** learners can remove a chapter and its successors from a path, or a whole path. Content shared with other paths survives; content referenced nowhere else is permanently removed after confirmation; removing the start of the last path deletes the story. One durable save with rollback; blocked while AI work or an unsaved result is pending. Path names use a persistent counter so a deleted alternate's name is never reused.

## Product defaults and limits

- Budgets (JavaScript characters, not tokens): memory JSON at most 12000; input chunks at most 8000, consumed sequentially without omission (surrogate pairs preserved); recent prose is the whole chapter up to 8000, otherwise its last 4000, preferring a sentence or paragraph boundary. The rewrite source is complete.
- Memory is cached by exact ordered version lineage, chunk index, `MEMORY_VERSION` and prompt version; shared path prefixes reuse it. Summaries are inspectable in `data/stories.json` with provider, model and prompt provenance. Completed summary stages are saved before acknowledgement.
- These choices limit history growth and duplication but do not guarantee fidelity, prevent summary drift or establish improved learning. Long uncached stories need several initial requests. No live-model review of long or branched stories has been done.

## Compatibility

Legacy stories derive paths lazily from version-source and predecessor links (same-chapter rewrite links traced to their original predecessor). Without provenance, the saved selected sequence is used and continuity is marked uncertain. No bulk migration; all stored chapters, versions and help are preserved.

## Implementation and tests

`js/story-model.js`, `js/story-memory.js`, `js/app.js`. Tests: `tests/story-memory-regression.cjs`, `tests/reader-management-regression.cjs`. Mock output cannot establish narrative accuracy, language quality or pedagogical value.

## Open experiment

A candidate prose writer (development only) internally checks who knows what, possession and ownership, character and object location, chronology and unresolved events, within the same request and schema. It is not shipped; it waits for notes-prompt selection and a separate prose evaluation. See the [controlled comparison](../validation/generation-evaluation/contextual-notes/README.md).

## Revisit when

Live-model review of long and branched stories shows drift or omissions; then revisit budgets and summary instructions.

## Decision history

- 2026-10-11: memory and paths introduced.
- 2026-10-12: chapter and path removal.
- 2026-10-14: continuity-checking prose candidate prepared (not shipped).
