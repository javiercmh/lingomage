# Lexical units and vocabulary-note terminology

Review date: 2026-10-19. Discovery: Consensus; publication records and abstracts
reviewed. The ISO terminology definition was checked in the official ISO Online
Browsing Platform. This is a scoped terminology review, not a systematic review;
the original research full texts were not inspected.

## Research question

What name best describes a LingoMage entry that gives a context-specific English
explanation for a target-language word, a particular sense, an inflected form,
or a useful multiword expression?

## Evidence

### L2 vocabulary learning uses units broader than orthographic words

Bogaards, P. (2001). *Lexical units and the learning of foreign language
vocabulary*. Studies in Second Language Acquisition, 23(3), 321–343.
[DOI: 10.1017/S0272263101003011](https://doi.org/10.1017/S0272263101003011).
Stable key: `bogaards2001LexicalUnits`.

Access: publisher abstract via Cambridge Core and Consensus; full text not
reviewed. The article introduces “lexical unit” to address the vagueness of
“word” in L2 vocabulary learning. Its abstract describes work on new lexical
units, multiword items, and new senses of familiar forms. This supports using
*lexical unit* as a research-facing umbrella for learnable units that are not
limited to single written words. The abstract does not establish one universally
preferred unit for every teaching or assessment purpose.

### The unit depends on the vocabulary task

Brown, D., Stoeckel, T., McLean, S., & Stewart, J. (2020). *The most appropriate
lexical unit for L2 vocabulary research and pedagogy: A brief review of the
evidence*. Applied Linguistics. [DOI: 10.1093/applin/amaa061](https://doi.org/10.1093/applin/amaa061).
Stable key: `brownEtAl2020LexicalUnit`.

Access: Consensus abstract; full text not reviewed. The review argues that broad
word-family groupings can exceed what learners can reliably infer and suggests
the lemma or flemma may be a more appropriate unit for L2 vocabulary research
and pedagogy. This concerns grouping and counting vocabulary, including word
lists and tests. It does not directly prescribe labels or entry boundaries for
a contextual glossary that also explains phrases and particular contextual
senses.

### “Term” has a related but more concept-oriented use

International Organization for Standardization. (2021). *Terminology work
supporting multilingual communication — Part 1: Fundamentals of
translation-oriented terminography* (ISO 12616-1:2021).
[ISO Online Browsing Platform](https://www.iso.org/obp/ui?_escaped_fragment_=iso%3Astd%3Aiso%3A12616%3A-1%3Aed-1%3Av1%3Aen).
Stable key: `iso12616_1_2021Terminography`.

Access: official ISO terminology excerpt. The standard defines a term as a
linguistic designation representing a general concept and situates designation
in a subject field. *Term* is therefore a valid word in terminology work, but
that literature is oriented around concepts and their designations. It is not
the main umbrella found in the reviewed L2 vocabulary-learning sources.

## Terminology decision for LingoMage

**Research-facing concept:** use *lexical unit* (or *lexical item* when following
a source that uses that wording) for the learnable word or expression. Describe
the note as explaining that unit in a selected contextual sense. Use *lemma* or
*headword* for the canonical lookup form that anchors the note and organizes
related forms. These labels describe different levels; a lexical unit may be a
multiword expression.

**Product copy recommendation:** *Vocabulary note* is the clearest broad
learner-facing label. *Word note* remains understandable, but can suggest that
every entry is one orthographic word. *Term* is not recommended as the default
label because it is not the L2 vocabulary-learning umbrella identified in this
review and can suggest concept-oriented terminology work. This is a terminology
and usability judgment, not a tested learning benefit. It does not change the
current interface copy.

**Storage:** keep the existing `word` schema key for the target-language
headword or expression that anchors the note.
The temporary `term` and `text` aliases in
[`workspace-storage.js`](../../js/workspace-storage.js) are compatibility inputs
normalized to `word`; their presence is not a theoretical endorsement of either
label. Stored `forms` remain exact forms attested in the chapter. See
[PED-002](../pedagogy/PED-002-contextual-reading-support.md) for the current
vocabulary-note behavior.

## Limits and questions for future publication

The sources address L2 vocabulary theory, word-list units, and terminology
standards, not LingoMage's AI-generated contextual notes, target-language set,
or interface comprehension. Abstract-level review cannot establish the full
arguments or methods of the research papers. This terminology choice does not
show that notes are semantically accurate, useful, learnable, or effective.

A paper about LingoMage should state its operational definition of a note and
unit explicitly: whether an entry targets a lemma, a contextual sense, a
multiword expression, or a surface form; how inflectional forms are grouped;
and how phrase boundaries are determined. Those are research-method decisions,
not settled by choosing a UI label or JSON key.
