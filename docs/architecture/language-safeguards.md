# Current language safeguards and legacy audit

The current App² product is the specification. The former Kotlin application supplies selected implementation techniques and test cases, not a curriculum to reinstate. Its last retained source is [commit f8fef125](https://github.com/javiercmh/lingomage/tree/f8fef1255e608240301a13202168d4f6c41a1fea/android). Git preserves it; no copied native source is needed in the subapp.

## Adopted, adapted and rejected decisions

| Legacy candidate | Decision | Current behavior and rationale |
| --- | --- | --- |
| Canonical text distinct from readings; kanji-only ruby | Adopted | Plain text remains authoritative for copy, speech and offsets. Display normalization never rewrites saved annotations. |
| App-owned Japanese spans and contextual readings | Adopted | Separate occurrence IDs, contextual kana, exact coverage and UTF-16 offsets prevent model-owned annotation boundaries. Stories and examples use this pipeline. |
| Mandatory Japanese glossary-headword readings | Rejected | Keep current word-note headword presentation unchanged; only title, story and examples receive readings. |
| Fixed 100–150 words / 8–12 Japanese sentences | Adapted | Retired by PED-004 during integration: scene/chapter/longer narrative scope replaces numerical quotas; technical bounds remain active. |
| Japanese without romaji; Russian Cyrillic without Latin transliteration | Adopted | Script checks include canonical title, story, headwords/forms and examples; names use the target script. |
| Unconditional Russian stress-mark ban | Rejected | Default normal spelling, but permit explicitly requested stress marks. The validator does not claim to infer learner intent or linguistic correctness. |
| Exact real story forms; no substring coverage trick | Adopted | Notes use the same exact forms and word-boundary matching as reader underlines. |
| Exactly one glossary entry per selected vocabulary item | Rejected | Practice is optional freeform context, not a required vocabulary list. Every new chapter instead requires at least one useful valid learning note. |
| Vocabulary suggestion confirmation and 5–10 distinct words | Rejected | That workflow is absent from the current app. |
| Old beginner tense, clause, register and address restrictions | Rejected | Current standardized reading target and preferences guide language complexity and register. |
| German orthography, Spanish accents/punctuation, natural grammar | Adapted | Correctness guidance applies at every level without reintroducing curriculum sequencing. Semantic correctness needs language review. |
| Chilean Spanish vocabulary and tú/ustedes as universal defaults | Rejected | Current Spanish has no fixed regional variety; learner preferences guide usage. |
| Old field limits (120-character titles, 600-character meanings, 20-character compounds) | Rejected | Current generous technical bounds support longer chapters and explanations; see the validator for exact maxima. |
| Native canonical fallback synthesized from segment text | Rejected for new output | New generation requires explicit canonical strings. Existing saved App² records remain readable. |
| Failure preserves input; save retry without inference retry | Adopted | Durable stage checkpoints, explicit Resume/Discard and idempotent final application. |
| Native OAuth, tokens, networking, Room, DataStore, Gradle/MVVM | Rejected as subapp ownership | App² owns production AI connection and host features; JSON owns learning data. The Python server is development-only. |

## Enforcement and regression coverage

[data/language-safeguards.json](../../data/language-safeguards.json) is the versioned register. `js/learning-validation.js` enforces structural content rules. `js/generation-pipeline.js` saves validated stages before releasing requests. `js/app.js` captures context, exposes recovery and applies results using operation IDs.

Every active register ID must be emitted by a passing behavioral or prompt-contract test. `python3 scripts/check.py` runs those tests, existing reader/memory/host-bridge regression harnesses, manifest checks and Python server checks. CI runs the same command on Node 22 and Python 3.9. It needs no third-party test dependencies or production build step.

Migrated cases from `StoryValidatorTest`, `JapaneseReadingPlanTest`, `FuriganaPlacementTest` and `StoryViewModelTest` cover fictitious/substring glossary forms, scripts, length, contextual/repeated/supplementary kanji, exact ID coverage, decomposed kana normalization, okurigana, ambiguous legacy display, cancellation and save/release recovery. Suggestion and unconditional stress-rejection cases are deliberately retired.

Register coverage does not certify arbitrary future tests: reviewers must verify that assertions still exercise the stated behavior. Migrations must account for every safeguard. Retiring or weakening one requires a documented, explicit product decision and corresponding test updates.

## Evidence limits

Structural validity cannot establish whether a concept is new, whether a reading or English explanation is correct, or whether a chapter teaches effectively. Prompt tests verify the learning instruction, not model compliance. This work carries forward the evidence limitations and stable citations in PED-001 and PED-002; it adds no claim of certified proficiency alignment or measured learning benefit.

## Integration decision — 2026-10-13

LANG-001 is explicitly retired by the learner-requested [PED-004](../pedagogy/PED-004-level-guided-generation.md) decision to remove numerical length quotas. Short and longer valid content are now accepted within LANG-004 technical maxima. Other registered safeguards remain active and tested. Generation adds a durable language-planning stage before prose; Japanese reading extraction and exact occurrence-ID coverage remain app-owned. Inline notes display once per explanation per chapter version, while validation still checks every form. This integration adds no certification or effectiveness claim. See [merge validation](../validation/2026-10-13-merge-integration.md).
