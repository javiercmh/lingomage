# Lexical units and vocabulary-note terminology

This is the single source of truth for LingoMage's terminology rationale and
recommendation. Other documents link here rather than restating it.

Scoped terminology review, not a systematic review. Only abstracts and publisher
or standards records were inspected; no research full text was read. Current
implementation facts were checked against `js/learning-validation.js`,
`js/reader-text.js`, `js/app.js` and `js/workspace-storage.js` at prompt version
`2026-10-14.21`.

## Research question

What name best describes a LingoMage entry that gives a context-specific English
explanation for a target-language word, a particular sense, an inflected form,
or a useful multiword expression?

## Review provenance

| Item | Record |
| --- | --- |
| Review date | 2026-10-19 |
| Discovery tool | Consensus (relevance-ranked search; abstracts, not full text) |
| Exact Consensus query (2026-10-19) | “In second language vocabulary teaching and learning, what is the most appropriate term for a learnable vocabulary entry that may be a single word, inflected form, sense, idiom, or multiword expression: word, term, vocabulary item, lexical item, or lexical unit? Clarify distinctions and recommended label for a learner-facing glossary.” |
| Bogaards (2001) | Cambridge Core record (title, volume, issue, pages, online date 2001-09-25, abstract) rechecked in a second pass; the Consensus record was not re-accessed then. Full text not read |
| Brown et al. (2022; online 2020) | Oxford Academic record (authors, 43(3), June 2022, pp. 596–602, online 2020-11-27, abstract) rechecked in a second pass; the Consensus record was not re-accessed then. Full text not read |
| ISO 12616-1:2021 | Official ISO Online Browsing Platform record, accessed 2026-10-19. In a second pass ISO pages returned HTTP 403, so only the title, edition 1 and 2021-09 date were confirmed (via an ISO store-page search listing); clause 3.8 was not re-verified (see [`references.bib`](references.bib)) |

**Selection rationale (a product-review judgment, not a systematic screen).**
Bogaards was chosen because it explicitly introduces *lexical unit* for the vagueness of
*word* in L2 vocabulary learning. Brown et al. were chosen as a recent review
of which unit (word family, lemma, flemma) suits L2 vocabulary research and
pedagogy. ISO 12616-1 was chosen to test whether *term* is the better umbrella,
because *term* is a plausible alternative label. Other candidate sources were not
systematically searched, so this selection can omit relevant or contrary work.

## Evidence

**Abstract-level claims.** Every claim below rests on an abstract or a standards
record. Check each against the full text before citing it in academic work.

### L2 vocabulary learning uses units broader than orthographic words

Bogaards, P. (2001). *Lexical units and the learning of foreign language
vocabulary*. Studies in Second Language Acquisition, 23(3), 321–343.
[DOI: 10.1017/S0272263101003011](https://doi.org/10.1017/S0272263101003011).
Key: `bogaards2001LexicalUnits`.

Abstract-level claim (verify in full text): the article introduces Cruse's (1986)
concept of *lexical unit* to address the vagueness of *word* in L2 vocabulary learning, and its abstract
describes new lexical units, multiword items and new senses of familiar forms.
This supports *lexical unit* as a research-facing umbrella for learnable units
not limited to single written words. It does not establish one universally
preferred unit for every teaching or assessment purpose.

### The unit depends on the vocabulary task

Brown, D., Stoeckel, T., McLean, S., & Stewart, J. (2022; first published online
2020). *The most appropriate lexical unit for L2 vocabulary research and
pedagogy: A brief review of the evidence*. Applied Linguistics, 43(3), 596–602.
[DOI: 10.1093/applin/amaa061](https://doi.org/10.1093/applin/amaa061). Key:
`brownEtAl2020LexicalUnit`.

Abstract-level claim (verify in full text): broad word-family groupings can
exceed what learners can reliably infer, and the lemma or flemma may be a more
appropriate unit for L2 vocabulary research and pedagogy. This concerns grouping
and counting vocabulary, such as word lists and tests. It does not prescribe
labels or entry boundaries for a contextual glossary that also explains phrases
and particular contextual senses.

### “Term” has a related but more concept-oriented use

International Organization for Standardization. (2021). *Terminology work
in support of multilingual communication — Part 1: Fundamentals of
translation-oriented terminography* (ISO 12616-1:2021). Key:
`iso12616_1_2021Terminography`. Official reference: ISO Online Browsing Platform,
<https://www.iso.org/obp/ui/#iso:std:iso:12616:-1:ed-1:v1:en>.

| Field | Value |
| --- | --- |
| Clause | 3.8, definition of *term* |
| Short definition quote | “designation (3.7) that represents a general concept (3.6) by linguistic means” |
| Source note | The definition cites ISO 1087:2019, 3.4.2; ISO 12616-1:2021, 3.8. |

On that definition, *term* is valid in terminology work, but that literature is
organized around concepts and their designations. It is not the umbrella used by
the reviewed L2 vocabulary-learning sources.

## Operational definitions in the current implementation

These describe what the code does today. They are not claims about linguistic
correctness or learning effect. Prompt text is `NOTES_INSTRUCTIONS` in
`js/learning-validation.js`.

| Concept | Operational definition (as implemented) | Limitation, not settled |
| --- | --- | --- |
| Note | One `glossary` entry `{word, meaning, forms[]}` generated in a separate request after canonical prose is saved. At least one note is required; there is no count quota or cap. The validator drops listed forms that the chapter does not contain and discards a note left with no attested form. | Semantic correctness, usefulness and level suitability are not checked; deterministic checks cannot establish them. |
| Lexical unit | No structural type exists in the data. The prompt asks for “vocabulary and useful expressions”, including idioms and constructions. Accepted entries are anything whose forms match the chapter text. | There is no definition of a lexical unit, and no check separates a single word from a phrase. |
| Headword / word field | `word`: the model's “canonical target-language headword”, up to 500 UTF-16 units, in the target script. Validation checks only script and length. The reader shows the clicked surface text first, then “Dictionary form: …” when it differs. | Whether `word` is a lemma, a contextual sense label, a multiword expression or a surface form is not enforced. |
| Meaning | `meaning`: a concise contextual English explanation (up to 4000 units, must contain a Latin letter), for “the meaning used here”, not a list of dictionary senses. | Sense accuracy is unvalidated. The prompt asks the model to distinguish meanings, and the display identity treats different meanings as distinct notes. |
| Attested forms | `forms`: 1–20 strings that must occur in the chapter as complete words or expressions (Unicode word boundaries; Japanese script matches by substring). A tolerant repair step (case, accents, ё/е, punctuation and spacing) returns exact chapter text. Discontinuous forms split at `...` into separately attested parts. If none match, the headword (or the headword minus a German or Spanish article) is tried. | Phrase boundaries are not determined by any rule beyond the matching above. Which inflections belong in one note is the model's grouping choice; the prompt allows grouping forms only with the same contextual meaning. |

Display identity (first-occurrence display) is the NFC-normalized headword plus
meaning. Equivalent records share an identity and different meanings stay
separate; see [PED-002](../pedagogy/PED-002-contextual-reading-support.md).

## Terminology mapping

This is a proposal for review. It does not change any UI copy or schema key.

| Research terminology | Current UI / schema wording | Proposed copy (not applied) |
| --- | --- | --- |
| Lexical unit (or lexical item, when following a source that uses it) | UI: “Word note”, as the fallback heading and the `aria-label` “Word note for …”. Progress and error text: “vocabulary notes”. | “Vocabulary note” as the broad learner-facing label |
| Headword / lemma (canonical lookup form) | Schema key `word`; UI “Dictionary form: …” | Keep “Dictionary form”. The `word` key stays |
| Contextual sense | Schema key `meaning` | Keep |
| Attested form (surface form in the chapter) | Schema key `forms` | Keep |
| Term (terminology-work sense) | `term` exists only as a legacy compatibility alias input, normalized to `word`; see `js/workspace-storage.js` | Do not use as a label |

## Recommendation

**Research-facing documents:** use *lexical unit* for the learnable word or
expression and *headword* for the stored target-language citation string.
Describe the note as explaining that unit in a selected contextual sense. The
`word` schema key is a name, not a claim that every note holds one orthographic
word. *Lemma* and *headword* label the lookup form that anchors the note, a
different level from *lexical unit*, which may be a multiword expression.

**Product copy:** *Vocabulary note* is the clearest broad learner-facing label.
*Word note* is understandable but can suggest every entry is one orthographic
word. *Term* is not recommended: it is not the L2 vocabulary-learning umbrella in
the reviewed sources and suggests concept-oriented terminology work.

**Evidence status.** The research-facing choice is supported by abstract-level
evidence (above). The product-copy choice is a terminology and usability
judgment. It has no tested learning benefit and no learner comprehension test.

**Storage.** Keep `word` as the schema key. The `term` and `text` aliases in
[`workspace-storage.js`](../../js/workspace-storage.js) are temporary
compatibility inputs; their presence is no endorsement of either label.

## Limits and questions for future publication

The sources address L2 vocabulary theory, word-list units and terminology
standards, not LingoMage's AI-generated contextual notes, its four target
languages or interface comprehension. Abstract-level review cannot establish the
papers' full arguments or methods. The terminology choice does not show that
notes are accurate, useful, learnable or effective.

A paper about LingoMage should state an operational definition of a note and
unit: whether an entry targets a lemma, a contextual sense, a multiword
expression or a surface form; how inflectional forms are grouped; and how phrase
boundaries are decided. The table above shows these are currently unresolved in
the implementation.
