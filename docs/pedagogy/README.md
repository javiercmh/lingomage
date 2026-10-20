# Pedagogical decision log

Start here before changing learner profiles, story difficulty, prompts, or reading support. Decisions explain **why**; research reviews describe **what the evidence says**; language and architecture documents describe **how the app behaves**.

| ID | Decision | Status | Evidence |
| --- | --- | --- | --- |
| [PED-004](PED-004-level-guided-generation.md) | Standardized reading targets, narrative scope and two-stage language planning | Implemented; level control unvalidated | [Level-guided generation](../research/level-guided-generation.md) |
| [PED-001](PED-001-learner-self-report.md) | Revisable reading profiles and English examples of concrete abilities | Superseded by PED-004 for new generation | [Self-assessment review](../research/self-assessment.md) |
| [PED-002](PED-002-contextual-reading-support.md) | Focused contextual explanations, inline word notes, pronunciation and learner-steered detail | Implemented; feature quality unvalidated | [Self-assessment](../research/self-assessment.md); [reading and glossing](../research/reading-and-glossing.md) |
| [PED-003](PED-003-story-memory-and-paths.md) | Bounded narrative memory and alternate story paths | Implemented; fidelity and learning effects unvalidated | Product assumption; no direct evaluation |

## Maintenance

1. For a new pedagogical choice, copy [the template](TEMPLATE.md) into `PED-NNN-short-name.md`, taking the next unused ID. Add one row above. Keep related choices together; do not create a record for every copy edit.
2. Cite research by its stable BibTeX key from [references.bib](../research/references.bib), with a DOI link at the claim. Put full source details, access level and findings in the relevant research review. Add new references once; never rename an existing key just to change formatting.
3. Record the evidence relied on, assumptions, intended learning outcome and revisit conditions in each decision, and verify new or materially revised research claims as the [learning change policy](../research/README.md#learning-change-policy) requires. Features that are research candidates, not decisions, live in the [evidence-informed strategy](../product/evidence-informed-strategy.md), and intended learner outcomes in [learning outcomes and evaluation](../product/learning-outcomes-and-evaluation.md); create a PED only when a concrete choice is made.
4. Link the implementation to the decision ID where the rationale is easy to lose. Keep exact UI copy in code and profile definitions in JSON; do not duplicate them here.
5. Update the record and affected docs in the same change as behavior. Increment the prompt version when generation instructions or learning behavior change; copy-only changes do not require it.
6. Separate implementation status from evidence strength. A requirement can be implemented without being experimentally validated. Record only reviews and checks actually performed.
7. Revise a record for refinements. For a reversal, create a new decision, mark the old one superseded and link both. Git retains the edit history; no separate manual change log is needed.

This log does not retrospectively certify older design choices. Existing language and research documents remain the record for choices not yet indexed here. Add them when revisited.

Library ordering and its Updated/Created labels are navigation conventions, not pedagogical decisions: they make no progress, completion or learning-effect claim and need no record here (see DESIGN.md).
