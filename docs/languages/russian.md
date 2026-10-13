# Russian

Current behavior follows PED-004: standardized self-selected reading targets and narrative scope; older dated requirements below are historical. App-owned Japanese readings and all active structural safeguards remain enforced.

Status: design requirements recorded; App² requests Cyrillic; deeper
pedagogical review pending.

## Confirmed requirements

- Russian stories with an English interface and English glossary explanations.
- Beginner stories may use the learner's optional freeform vocabulary or concept
  guidance, as described in the current [MVP](../product/mvp.md).
- Always use **Cyrillic** for Russian story text, vocabulary suggestions, and
  Russian glossary headwords. Do not replace or supplement Russian text with
  Latin transliteration. English explanations remain in English.

## Language-specific decisions to resolve

- Assumed Cyrillic knowledge and whether learners need Cyrillic script instruction.
- Stress marks: whether and where to display them in stories and glossary entries.
- Vocabulary representation: dictionary forms, gender, and inflected story forms.
- Grammar progression: cases, verb aspect, agreement, and tense choices.
- Treatment of spelling and pronunciation aids, including ё.

Cyrillic is a confirmed product requirement. Stress annotation remains an open
decision. Review relevant evidence separately from the German and Japanese design.

Initial default: do not add stress marks. This is a product simplification,
not a research-established teaching rule; normal Russian spelling is preserved.

## Content review

Review Cyrillic text, inflection, agreement, aspect, natural vocabulary use,
glossary accuracy, beginner readability, and absence of Russian transliteration.
If stress annotations are introduced,
include their accuracy in the review criteria.

## Legacy Android prompt decision — 2026-10-09.1

Write Russian in 100–150 words. All title, text, vocabulary headwords and story forms must use Cyrillic. Never give Latin transliteration or added stress marks. English glossary meanings remain English. Favor short everyday clauses and common present-tense patterns; use cases, number, gender, and verb agreement correctly. Avoid advanced participial constructions. Match selected dictionary forms to actual inflected forms in the glossary.

These grammar and orthography constraints are **product assumptions** and linguistic
correctness requirements, not an empirically validated curriculum. Shared reading,
glossing and natural reuse rationale is in the [initial evidence review](../research/reading-and-glossing.md).
The validator verifies declared used forms occur in the text; it cannot establish
that an inflected form is linguistically related to the chosen lemma or that a
reading is correct in context. Separate language review remains necessary.

Historical Android prompt source: [ru.json](https://github.com/javiercmh/lingomage/blob/f8fef1255e608240301a13202168d4f6c41a1fea/android/app/src/main/assets/prompts/ru.json).
Current App² prompt status is in [App² runtime](../architecture/app2-runtime.md).

## App² reading self-report — 2026-10-10

Settings offer three reading-task descriptions and an optional knowledge/difficulties description. These guide each story request and are revisable learner reports, not assessed proficiency. Russian assumes Cyrillic literacy; vocabulary, word endings, and sentence comprehension can be described separately. Generation uses Cyrillic without transliteration. Definitions are in `data/learning-profiles.json`; evidence and limits are in [the self-assessment record](../research/self-assessment.md).

## Current requirements — 2026-10-12.4

The current App² profiles, difficulty and learner wishes remain authoritative. Legacy decisions above are historical; adopted, adapted and rejected rules are recorded in the [safeguard audit](../architecture/language-safeguards.md). New chapters require useful integrated English learning notes, validated target-script forms and technical bounds; narrative scope replaces numerical length quotas. Orthography and contextual correctness guidance do not reinstate the old beginner curriculum or regional defaults. Linguistic and pedagogical quality remain review requirements.

Russian stress marks are absent by default but permitted if explicitly requested; the old unconditional stress rejection is retired. Target-script validation still rejects Latin transliteration, including names.


## Current App² reading targets — 2026-10-13

[PED-004](../pedagogy/PED-004-level-guided-generation.md) replaces broad reading bands/freeform self-assessment for new generation. The managed standardized-level definitions and app-authored guides are in `data/learning-profiles.json`. German/Spanish use CEFR A1–C2, Japanese JLPT N5–N1 and Russian Elementary/Basic/TORFL-I–IV with A1–C2 references. Canonical script requirements remain. Numeric story lengths in the earlier implementation above are historical; new generation uses narrative scope and a separate language-planning stage. Self-selected levels do not establish certified alignment or individual vocabulary knowledge. Existing saved content/provenance is preserved.
