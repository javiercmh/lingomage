# Language-specific learning decisions

The featured target languages are:

| Language | Decision file | Interface and glossary |
| --- | --- | --- |
| German | [german.md](german.md) | English |
| Japanese | [japanese.md](japanese.md) | English |
| Russian | [russian.md](russian.md) | English |
| Spanish | [spanish-chile.md](spanish-chile.md) | English |

Each file records that language's script presentation, vocabulary representation,
grammar progression, reading aids, prompt requirements, and content review
criteria. These are design requirements and decisions, not a claim that every rule
is enforced in the current App² prompt. Current App² behavior and known prompt
gaps are listed in [App² runtime](../architecture/app2-runtime.md). The prompt
source links in individual language files refer to the earlier Android
implementation. Shared behavior remains in the [MVP specification](../product/mvp.md).

Do not copy a learning rule from one language into another without considering
its applicability. For example, Japanese reading annotation and segmentation
require different decisions from German noun forms and capitalization.

## Maintaining a decision

For shared pedagogical choices, use the [decision log and template](../pedagogy/README.md). Keep language-specific details here and link the relevant decision ID rather than duplicating its rationale. Current learner-profile and generation rationale: [PED-004](../pedagogy/PED-004-level-guided-generation.md); [PED-001](../pedagogy/PED-001-learner-self-report.md) is historical.

Record:

- Status: confirmed requirement, proposed design, supported finding, or open question.
- Decision and learner need.
- Evidence reference, or an explicit statement that this is a product assumption.
- Applicability limits, including learner population and proficiency level.
- Implications for prompts, reader presentation, stored content, and review.
- Review results and date when available.

Use [the research policy](../research/README.md) for source records. These language
documents are the starting design records, not completed literature reviews.
