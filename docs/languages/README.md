# Language-specific learning decisions

The featured target languages are:

| Language | Decision file | Interface and glossary |
| --- | --- | --- |
| German | [german.md](german.md) | English |
| Japanese | [japanese.md](japanese.md) | English |
| Russian | [russian.md](russian.md) | English |
| Spanish | [spanish.md](spanish.md) | English |

Each file owns that language's script presentation, vocabulary representation,
grammar progression, reading aids, prompt requirements, and content review
criteria. Shared behavior remains in the [MVP specification](../product/mvp.md).

Do not copy a learning rule from one language into another without considering
its applicability. For example, Japanese reading annotation and segmentation
require different decisions from German noun forms and capitalization.

## Maintaining a decision

Record:

- Status: confirmed requirement, proposed design, supported finding, or open question.
- Decision and learner need.
- Evidence reference, or an explicit statement that this is a product assumption.
- Applicability limits, including learner population and proficiency level.
- Implications for prompts, reader presentation, stored content, and review.
- Review results and date when available.

Use [the research policy](../research/README.md) for source records. These language
documents are the starting design records, not completed literature reviews.
