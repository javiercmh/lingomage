# Research and evidence policy

LingoMage's learning design should be grounded in research. That does not mean
every product default is a proven intervention or that generated stories have
demonstrated learning effectiveness.

## Research workflow

1. State a focused question and identify the relevant language, proficiency,
   learner population, and learning outcome.
2. Use Consensus when useful for finding research, then inspect original publications.
3. Prioritize relevant reviews and well-designed primary studies; consider
   contradictory findings and limits to applicability.
4. Record the evidence before turning it into a learning rule.
5. Link the resulting decision to the relevant language file or shared product requirement.

## Evidence record

Use [references.bib](references.bib) for shared bibliographic metadata and stable citation keys. Link implemented choices from the [pedagogical decision log](../pedagogy/README.md); research reviews retain study findings and access limitations. The bibliography holds the sources cited by the reviews (self-assessment, level-guided generation, glossing, lexical-unit terminology and level-descriptor web sources). It does not cover every historical research candidate: some review notes still cite sources by link only. Where volume, issue, pages or an access date could not be confirmed, the record says so in its `note` field instead of guessing.

Add a Markdown record under this directory for each reviewed topic. Include:

- Research question and review date.
- Authors, year, title, publication, DOI, and source link.
- Access level: full text, abstract only, or secondary summary.
- Study design, sample, languages, proficiency, intervention, comparison, and outcomes.
- Relevant findings and methodological limitations.
- Applicability to LingoMage; distinguish direct evidence from extrapolation.
- Related design decision and unresolved questions.

Do not infer causal effects from correlational studies or transfer findings from
one language, learner population, or reading intervention without qualification.
Document AI-generated text quality separately from evidence of learning gains.

## Research index

Each review states its question, review date, access level for every source and
the decision it informs. Add new reviews to the matching row. Reviews are scoped,
not systematic, unless a review says otherwise.

| Topic | Review | Decision it informs |
| --- | --- | --- |
| Learner self-report and levels | [Reading self-assessment](self-assessment.md), [level descriptors](level-descriptors.md) | [PED-001](../pedagogy/PED-001-learner-self-report.md) |
| Generation at a target level | [Level-guided generation](level-guided-generation.md) | [PED-004](../pedagogy/PED-004-level-guided-generation.md) |
| Reading support and glossing | [Reading and glossing](reading-and-glossing.md), [lexical-unit terminology](lexical-units.md) | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Japanese script support | [Japanese furigana](japanese-furigana.md) (preliminary; sources unverified) | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |

Starting publications for glossing and incidental vocabulary learning:

- [How do different forms of glossing contribute to L2 vocabulary learning from reading?](https://doi.org/10.1017/S0272263119000688)
- [How effective is second language incidental vocabulary learning? A meta-analysis](https://doi.org/10.1017/S0261444822000507)

Research on reading and glosses does not by itself establish that LingoMage's
AI-generated beginner stories improve retention. Specific learning claims require
appropriate evidence, and app-specific effectiveness remains untested.
