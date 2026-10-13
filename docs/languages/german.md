# German

Current behavior follows PED-004: standardized self-selected reading targets and narrative scope; older dated requirements below are historical. App-owned Japanese readings and all active structural safeguards remain enforced.

Status: design requirements recorded; App² uses profile-aware difficulty and correctness guidance;
deeper pedagogical review pending.

## Confirmed requirements

- German stories with an English interface and English glossary explanations.
- Beginner stories may use the learner's optional freeform vocabulary or concept
  guidance, as described in the current [MVP](../product/mvp.md).

## Language-specific decisions to resolve

- Noun entries: articles, grammatical gender, plural forms, and capitalization.
- Vocabulary matching: how selected dictionary forms connect to inflected story forms.
- Grammar progression: cases, verb position, separable verbs, and tense choices.
- Glossary treatment of compounds and meanings specific to the story context.

These remain curriculum research questions. The initial product defaults below
are deliberately labeled assumptions rather than evidence-based grammar progression.

## Content review

Review grammatical agreement, articles, capitalization, word order, natural
vocabulary use, glossary accuracy, and beginner readability. Validate vocabulary
coverage without relying solely on exact matches to dictionary forms.

## Legacy Android prompt decision — 2026-10-09.1

Write German in 100–150 words. Preserve noun capitalization, umlauts, and ß. Favor short main clauses, common present-tense patterns and explicit subjects. Use correct articles, case, agreement, and separable verbs when selected vocabulary requires them; avoid unnecessary subordinate clauses. Link inflected story forms to the learner’s exact selected item in glossary.

These grammar and orthography constraints are **product assumptions** and linguistic
correctness requirements, not an empirically validated curriculum. Shared reading,
glossing and natural reuse rationale is in the [initial evidence review](../research/reading-and-glossing.md).
The validator verifies declared used forms occur in the text; it cannot establish
that an inflected form is linguistically related to the chosen lemma or that a
reading is correct in context. Separate language review remains necessary.

Historical Android prompt source: [de.json](https://github.com/javiercmh/lingomage/blob/f8fef1255e608240301a13202168d4f6c41a1fea/android/app/src/main/assets/prompts/de.json).
Current App² prompt status is in [App² runtime](../architecture/app2-runtime.md).

## App² reading self-report — 2026-10-10

Settings offer three reading-task descriptions and an optional knowledge/difficulties description. These guide each story request and are revisable learner reports, not assessed proficiency. German examples can note familiar sentence patterns, vocabulary, and word-order difficulties. Definitions are in `data/learning-profiles.json`; evidence and limits are in [the self-assessment record](../research/self-assessment.md).

## Current requirements — 2026-10-12.4

The current App² profiles, difficulty and learner wishes remain authoritative. Legacy decisions above are historical; adopted, adapted and rejected rules are recorded in the [safeguard audit](../architecture/language-safeguards.md). New chapters require useful integrated English learning notes, validated target-script forms and technical bounds; narrative scope replaces numerical length quotas. Orthography and contextual correctness guidance do not reinstate the old beginner curriculum or regional defaults. Linguistic and pedagogical quality remain review requirements.


## Current App² reading targets — 2026-10-13

[PED-004](../pedagogy/PED-004-level-guided-generation.md) replaces broad reading bands/freeform self-assessment for new generation. The managed standardized-level definitions and app-authored guides are in `data/learning-profiles.json`. German/Spanish use CEFR A1–C2, Japanese JLPT N5–N1 and Russian Elementary/Basic/TORFL-I–IV with A1–C2 references. Canonical script requirements remain. Numeric story lengths in the earlier implementation above are historical; new generation uses narrative scope and a separate language-planning stage. Self-selected levels do not establish certified alignment or individual vocabulary knowledge. Existing saved content/provenance is preserved.
