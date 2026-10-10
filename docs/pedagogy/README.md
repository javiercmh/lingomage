# Pedagogical decision log

Start here before changing learner profiles, story difficulty, prompts, or reading support. Decisions explain **why**; research reviews describe **what the evidence says**; language and architecture documents describe **how the app behaves**.

| ID | Decision | Status | Evidence |
| --- | --- | --- | --- |
| [PED-001](PED-001-learner-self-report.md) | Revisable reading profiles and English examples of concrete abilities | Implemented; exact instrument unvalidated | [Self-assessment review](../research/self-assessment.md) |
| [PED-002](PED-002-contextual-reading-support.md) | Optional contextual explanations and learner-relative difficulty estimates | Implemented; feature quality unvalidated | [Self-assessment](../research/self-assessment.md); [reading and glossing](../research/reading-and-glossing.md) |

## Maintenance

1. For a new pedagogical choice, copy [the template](TEMPLATE.md) into `PED-NNN-short-name.md`, taking the next unused ID. Add one row above. Keep related choices together; do not create a record for every copy edit.
2. Cite research by its stable BibTeX key from [references.bib](../research/references.bib), with a DOI link at the claim. Put full source details, access level and findings in the relevant research review. Add new references once; never rename an existing key just to change formatting.
3. Link the implementation to the decision ID where the rationale is easy to lose. Keep exact UI copy in code and profile definitions in JSON; do not duplicate them here.
4. Update the record and affected docs in the same change as behavior. Increment the prompt version when generation instructions or learning behavior change; copy-only changes do not require it.
5. Separate implementation status from evidence strength. A requirement can be implemented without being experimentally validated. Record only reviews and checks actually performed.
6. Revise a record for refinements. For a reversal, create a new decision, mark the old one superseded and link both. Git retains the edit history; no separate manual change log is needed.

This log does not retrospectively certify older design choices. Existing language and research documents remain the record for choices not yet indexed here. Add them when revisited.
