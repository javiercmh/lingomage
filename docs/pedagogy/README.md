# Pedagogical decision log

Read before changing levels, prompts, reading support or learner tracking. Decisions (PED) say **why**; [research reviews](../research/README.md) say **what the evidence shows**; language and architecture docs say **how the app behaves**. Together they are the methodological record for publication: every decision keeps its rationale, evidence keys and limits.

| ID | Decision | Status | Evidence |
| --- | --- | --- | --- |
| [PED-001](PED-001-learner-self-report.md) | Revisable reading profiles and concrete ability examples | Superseded by PED-004 | [Self-assessment](../research/self-assessment.md) |
| [PED-002](PED-002-contextual-reading-support.md) | Contextual explanations, follow-ups, examples and vocabulary notes | Implemented; quality unvalidated | [Reading and glossing](../research/reading-and-glossing.md), [lexical units](../research/lexical-units.md), [self-assessment](../research/self-assessment.md) |
| [PED-003](PED-003-story-memory-and-paths.md) | Bounded narrative memory and alternate story paths | Implemented; fidelity unvalidated | Product assumption |
| [PED-004](PED-004-level-guided-generation.md) | Standardized reading targets, narrative scope, language planning | Implemented; level control unvalidated | [Level-guided generation](../research/level-guided-generation.md), [level descriptors](../research/level-descriptors.md) |
| [PED-005](PED-005-consultation-signals.md) | Lookup history, probable-reading exposure, recency/repetition ranking; LLM analysis proposed | Level 1 implemented; ranking unvalidated | [Consultation signals](../research/consultation-signals.md) |

Not pedagogical decisions (no record needed): Library ordering and dates, and other navigation conventions in `DESIGN.md`.

## Writing a decision

1. Copy [the template](TEMPLATE.md) to `PED-NNN-short-name.md` with the next ID and add a row above. One record per concrete choice, not per copy edit. Candidates that are not yet decisions live in the [strategy](../product/evidence-informed-strategy.md); intended outcomes in [learning outcomes](../product/learning-outcomes-and-evaluation.md).
2. Cite by stable key from [references.bib](../research/references.bib) with a DOI link at the claim; full study details and access level go in the research review. Add a key once; never rename one.
3. State the evidence, the product assumptions, the intended outcome and the revisit conditions. Verify new or materially revised claims as the [learning change policy](../research/README.md#learning-change-policy) requires.
4. Keep implementation status separate from evidence strength; record only reviews and checks actually performed (results of engineering checks go in commit messages).
5. Update the record in the same change as the behavior; increment `PROMPT_VERSION` for prompt or learning-behavior changes (not copy changes). Link code to the PED ID where the rationale is easy to lose; keep UI copy in code and definitions in JSON.
6. Refine a record in place and add a decision-history line. For a reversal, create a new PED, mark the old one superseded and link both.
