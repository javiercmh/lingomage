# Research and evidence policy

LingoMage's learning design should be grounded in research. That does not mean
every product default is a proven intervention or that generated stories have
demonstrated learning effectiveness.

## Research workflow

1. State a focused question and identify the relevant language, proficiency,
   learner population, and learning outcome.
2. Use Consensus for finding and cross-checking research, then inspect original publications. Consensus is discovery assistance, not evidence. Verification with a Consensus search is required before adopting a new or materially revised research claim (see [learning change policy](#learning-change-policy)).
3. Prioritize relevant reviews and well-designed primary studies; consider
   contradictory findings and limits to applicability.
4. Record the evidence before turning it into a learning rule.
5. Link the resulting decision to the relevant language file or shared product requirement.

## Evidence record

Use [references.bib](references.bib) for shared bibliographic metadata and stable citation keys. Link implemented choices from the [pedagogical decision log](../pedagogy/README.md); research reviews retain study findings and access limitations. The bibliography holds sources cited by the reviews, including self-assessment, level-guided generation, reading and glossing, retrieval and spacing, instruction, feedback, listening and production, lexical-unit terminology and level descriptors. It does not cover every historical research candidate: some review notes still cite sources by link only. Where volume, issue, pages or an access date could not be confirmed, the record says so in its `note` field instead of guessing.

Add a Markdown record under this directory for each reviewed topic. Include:

- Research question and review date.
- Authors, year, title, publication, DOI, and source link.
- Access level: full text, abstract only (publisher or Crossref), metadata only, secondary summary (for example an abstract seen only in a Consensus record, which stays provisional and is not adopted evidence) or unverified. Never infer sample, design or metadata that was not seen.
- Study design, sample, languages, proficiency, intervention, comparison, and outcomes.
- Relevant findings and methodological limitations.
- Applicability to LingoMage; distinguish direct evidence from extrapolation.
- Related design decision and unresolved questions.

Do not infer causal effects from correlational studies or transfer findings from
one language, learner population, or reading intervention without qualification.
Document AI-generated text quality separately from evidence of learning gains.

## Learning change policy

Any change to learning behavior (prompts, reading support, difficulty, a new activity) records in its PED decision or the [strategy](../product/evidence-informed-strategy.md):

- the evidence relied on, with stable bibliography keys and DOI links, and author/year at the claim;
- the assumptions that are product choices rather than findings;
- the intended learning outcome and how it would be evaluated (see the strategy's evaluation gates: reviewed quality, comprehension, delayed retention and transfer are different things, and AI scoring is not proof of learning);
- the conditions under which the decision will be revisited.

Before adopting a new or materially revised research claim, verify it with a Consensus search, including contradictory findings and applicability gaps, then inspect the original abstract or text. If Consensus access is unavailable, adoption is blocked: record the gap, do not substitute another source for the check. Sources seen only as Consensus abstracts remain provisional candidates and may be cited only with that label.

Review is due when relevant feature work starts, when major new evidence appears, or when an evaluation contradicts a recorded decision. Keep existing bibliography keys stable; add new keys rather than renaming.

## Audit of a candidate synthesis

On 2026-10-19 a user-supplied ChatGPT conversation (a ranked summary of adult L2 methods, with effect sizes blank in the accessible page) was audited against the original sources. It is untrusted candidate material, not evidence, and its ranking is not the roadmap ranking.

| Candidate claim | Audit result |
| --- | --- |
| Spacing: medium-to-large, 48 experiments, 3,411 participants; longer spacing better at delay; equal and expanding similar | Matches the abstract of `kimWebb2022SpacedPractice`; moderators and counter-signals add important limits ([review](retrieval-and-spacing.md)) |
| Rice & Tokowicz: retrieval plus elaboration beats memorizing translations | Consistent with the abstract (spaced retrieval or user-generated elaboration); laboratory, adult, abstract only |
| Explicit instruction: 28 reports, 3,754 learners, substantial benefit | Matches `liSun2024ExplicitInstruction` (published in the 2024 issue); outcome-measure type moderated effects |
| Extensive reading: small-to-medium benefits across domains | Matches the abstract of `sangersEtAl2025ExtensiveReading`; omitted that effects were larger with limited text choice and accountability; "gradual challenge" has no support in the abstract. A separate, earlier analysis (`hamada2020ExtensiveReadingBias`) found smaller estimates after accounting for selection bias; it does not reanalyze the 2025 synthesis |
| Corrective feedback: 33 studies, medium effect that persists, implicit better maintained | Matches the abstract of `li2010CorrectiveFeedback`; lab, short-treatment and foreign-language-context effects were larger |
| Task-based conversation/writing: large effect, 52 studies | Mischaracterized: it is a program-implementation meta-analysis (d = 0.93) that was reanalyzed to g = 0.61 and described as not yet ripe for relative comparisons |
| Dialogue systems: moderate speaking effect, not equal to human tutors | Effect (g = .61, 16 studies) matches; the article reports no human-tutor comparison and most systems were not generative AI |
| Combination of methods beats any single method; ranking of methods; 60-minute split | Unsupported: no reviewed source compares combined with single methods or tests that allocation. Not repeated in product guidance |
| Learning styles, universal best app | Not relevant; not used |

A second audited excerpt (a research summary on retention, transfer and spontaneous production, with "long-term" labels, a qualitative strength table and an immediate/4-week/3-month design suggestion) is audited in [outcomes and measurement](outcomes-and-measurement.md#audit-of-the-supplied-evidence-excerpt). Effect sizes from unlike study pools or metrics (d, g, r, percentage gains) are never compared directly in project documents.

## Research index

Each review states its question, review date, access level for every source and
the decision it informs. Add new reviews to the matching row. Reviews are scoped,
not systematic, unless a review says otherwise.

| Topic | Review | Decision it informs |
| --- | --- | --- |
| Learner self-report and levels | [Reading self-assessment](self-assessment.md), [level descriptors](level-descriptors.md) | [PED-001](../pedagogy/PED-001-learner-self-report.md) |
| Generation at a target level | [Level-guided generation](level-guided-generation.md) | [PED-004](../pedagogy/PED-004-level-guided-generation.md) |
| Reading support, glossing, extensive reading and repeated encounters | [Reading and glossing](reading-and-glossing.md), [lexical-unit terminology](lexical-units.md) | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Spaced retrieval and review (not implemented) | [Retrieval and spacing](retrieval-and-spacing.md) | [Strategy](../product/evidence-informed-strategy.md) |
| Explicit instruction, corrective feedback, listening and production (not implemented) | [Instruction, feedback and production](instruction-feedback-and-production.md) | [Strategy](../product/evidence-informed-strategy.md) |
| Retention, transfer, spontaneous production and measurement (not implemented) | [Outcomes and measurement](outcomes-and-measurement.md) | [Learning outcomes and evaluation](../product/learning-outcomes-and-evaluation.md) |
| Long-term product direction | [Evidence-informed strategy](../product/evidence-informed-strategy.md) | Horizons and evaluation gates |
| Japanese script support | [Japanese furigana](japanese-furigana.md) (preliminary; sources unverified) | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |

Starting publications for glossing and incidental vocabulary learning:

- [How do different forms of glossing contribute to L2 vocabulary learning from reading?](https://doi.org/10.1017/S0272263119000688)
- [How effective is second language incidental vocabulary learning? A meta-analysis](https://doi.org/10.1017/S0261444822000507)

Research on reading and glosses does not by itself establish that LingoMage's
AI-generated beginner stories improve retention. Specific learning claims require
appropriate evidence, and app-specific effectiveness remains untested.
