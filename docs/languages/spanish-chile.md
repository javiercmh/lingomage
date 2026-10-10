# Spanish

Current App² behavior: Spanish is presented without a fixed regional variety.
Learners can request a regional variety, register, or other language preference
in Settings. Language review remains pending.

## Confirmed requirements

- English interface and English glossary explanations.
- Beginner stories may use the learner's optional freeform vocabulary or concept
  guidance, as described in the current [MVP](../product/mvp.md).
- Use broadly understandable Spanish by default. Apply learner preferences when
  supplied and preserve learner-supplied wording from their chosen variety.

## Historical Chilean Spanish preference — Android prompt 2026-10-09.2

The earlier Android prompt used a Chilean Spanish preference. This remains useful
historical rationale for stories saved with that prompt, not a current default or
a claim of improved learning effectiveness or a universal South American
standard. Examples are contextual preferences, not obligatory words in every
story. Correct spelling includes the accent in **maní**.

For consistent beginner address forms, request standard tú conjugations and
ustedes for plural address; avoid mixing vosotros and vos forms. This simplifies
the initial product and does not represent every Chilean conversational variety.
Avoid dense slang and phonetic spellings; maintain 100–150 words, short clauses,
present-tense patterns and normal accents/punctuation. English explanations can
clarify regional meanings. Grammar progression remains a research question.

Lexicographic checks: ASALE's *Diccionario de americanismos* includes Chile in
its usage records for [palta](https://www.asale.org/damer/palta),
[maní](https://www.asale.org/damer/man%C3%AD), and
[computador](https://www.asale.org/damer/computador). These are usage references,
not teaching-effectiveness studies. Auto is also an explicitly requested product
example. The general learning rationale and transfer limits remain in the
[initial evidence review](../research/reading-and-glossing.md).

## Historical Android prompt and review

Source: [es-CL.json](../../android/app/src/main/assets/prompts/es-CL.json), version
2026-10-09.2, recorded with new stories. Existing stories retain their original
text and prompt provenance. Increment the version when generation behavior changes.

Review contextual Chilean vocabulary, accents, punctuation, agreement,
conjugation, address consistency, naturalness, glossary meanings and beginner
readability. The structural validator checks coverage and declared used forms;
it cannot certify regional usage, inflection or language accuracy. Qualified
human review remains necessary.

## App² reading self-report and preferences — 2026-10-10

Settings offer three reading-task descriptions, an optional self-assessment, and optional expectations or general instructions. These guide each story request and are revisable learner reports, not assessed proficiency. Spanish has no assumed regional variety in the current App² prompt; learners can state their preference. Definitions are in `data/learning-profiles.json`; evidence and limits are in [the self-assessment record](../research/self-assessment.md).
