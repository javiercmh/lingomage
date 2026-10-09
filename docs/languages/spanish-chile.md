# Spanish (Chile)

Status: initial implementation; South American Spanish with Chilean vocabulary preference.

## Confirmed requirements

- English interface and English glossary explanations.
- Beginner stories from learner-confirmed vocabulary.
- Use South American Latin American Spanish, preferring everyday words used in
  Chile: **palta**, **auto**, **maní**, **computador**, when relevant.
- Apply this preference to stories and vocabulary suggestions. Preserve the
  learner's selected items even when they come from another variety.

## Product decision — 2026-10-09.2

This supersedes the initial broadly shared-vocabulary default. It is the user's
regional preference, not a claim of improved learning effectiveness or a universal
South American standard. Examples are contextual preferences, not obligatory
words in every story. Correct spelling includes the accent in **maní**.

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

## Prompt and review

Source: [es-CL.json](../../android/app/src/main/assets/prompts/es-CL.json), version
2026-10-09.2, recorded with new stories. Existing stories retain their original
text and prompt provenance. Increment the version when generation behavior changes.

Review contextual Chilean vocabulary, accents, punctuation, agreement,
conjugation, address consistency, naturalness, glossary meanings and beginner
readability. The structural validator checks coverage and declared used forms;
it cannot certify regional usage, inflection or language accuracy. Qualified
human review remains necessary.
