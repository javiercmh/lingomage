# PED-005: Lookup history and probable-reading exposure

- Date: 2026-11-08
- Status: implemented (Level 1 lookup ranking and exposure); proposed (Level 2 LLM analysis)
- Scope: all target languages; reader help (word notes, Explain, follow-ups, examples, Translate, Listen) and reading time on chapters
- Evidence basis: evidence-informed extrapolation; weights and thresholds are product assumptions; no direct evaluation

## Decision and learner need

Learners need practice and level suggestions that reflect what *they* found hard. Until now LingoMage kept no record of this. The only learner choice was the self-selected reading level (PED-004).

The app now keeps a local **lookup history** and a **probable-reading record** for each language in `data/learning-signals.json`.

**What is recorded:**
- Each word note opened, Listen on a note, saved explanation, saved follow-up, generated example set, and opened device translation. Each word or passage is one item, keyed by its text (NFC, collapsed spaces, case-insensitive), with up to three recent context sentences. Glossary meanings are written per chapter, so they are not part of the identity; a selection of a noted word merges with the note.
- Every glossary meaning an item was looked up with, most recent first, each with its own lookup count, first and last date, and latest sentence. The profile shows only the latest. Keeping them all preserves the evidence needed to split homographs later (see Level 2).
- Paragraphs that stayed on screen long enough to read. Each one adds to the day's words read and to the "seen" count of the items already in the history that it contains.

**Level 1 (implemented)** ranks items with:

```text
weighted lookups × recency × repetition × exposure damping
```

The terms are:
- **Weights:** follow-up 3, explain 2, examples 2, translate 1.5, note 1, listen 0.5.
- **Recency:** the score halves every 14 days since the last lookup.
- **Repetition:** `1 + log2(distinct days looked up)`.
- **Exposure damping:** `1 / (1 + encounters since the last lookup / 4)`.

The profile shows the top 10 items per language with their lookup count. A row opens a read-only detail sheet with every meaning, its count and sentence, the days and last date looked up, and encounters since the last lookup ("seen N times since"). Viewing records nothing.

**Probable reading (implemented)** follows these rules:
- A paragraph counts once its on-screen time reaches its word count at 400 words per minute, and never less than 1.5 s.
- Time accrues only while the page is visible, at least half the paragraph (or half the viewport) is shown, and the learner interacted within the last 60 s.
- Each paragraph counts at most once per chapter version and local day.

**Product assumptions:** the weights, the 14-day half-life, the damping constant, the 400 wpm ceiling, the idle limit and the visibility rule are all unvalidated product choices.

The record means **"looked up" and "probably read"**. It never means *unknown*, *known* or *understood*. It does not change the self-selected level, generation, prompts or `PROMPT_VERSION`.

**Level 2 (proposed, not built)** is a learner-initiated analysis:
- **Trigger:** an "Analyse my reading" action in the profile, after enough items. It sends one AI request with a task notification and never retries silently.
- **Input:** a bounded digest, never the whole file:
  - the top ~60 items by Level 1 score, each with at most two sentences and seen/looked-up counts
  - words read and lookups per 1,000 words
  - the self-selected level, the profile text and the previous analysis
- **Output, saved with provenance:**
  - for each item: a category (vocabulary, multiword expression, grammar, script/reading, other), its dictionary form and a short reason
  - for items whose stored meanings name different senses (homographs such as の as question marker and as possessive): the senses, each mapped to the stored meanings it covers. The list can then show one row per sense, and counts per sense come from the per-meaning counts. Per-chapter rewordings of one sense stay one sense. Exact string matching cannot tell rewordings from senses, which is why this is left to Level 2.
  - at most five focus areas
  - a non-binding comment on level
- **Limits:** it must never set the level, and it needs prompt-contract tests before release.
- **Later uses:** generation could reuse focus items so they come up again, and a practice mode could use retrieval and spacing (see [future directions](../product/future-directions.md)).

## Evidence and limits

Full notes are in the [consultation signals review](../research/consultation-signals.md).

- **Lookups are worth recording.**
  - Consulting meanings during reading supports L2 vocabulary learning (`zhangXuZhang2020DictionaryMeta`, [doi](https://doi.org/10.1093/ijl/ecaa010); `knight1994DictionaryReading`, [doi](https://doi.org/10.1111/j.1540-4781.1994.tb02043.x); `yanagisawaWebbUchihara2020Glossing`).
  - The studies are mostly short lab or classroom texts with EFL learners.
- **A lookup is a difficulty signal, not a knowledge test.**
  - Learners vary in how selectively they look things up. About a quarter of lookups in one study were not essential to the text (`prichard2008SelectiveDictionary`, [doi](https://doi.org/10.64152/10125/66820)).
  - A lookup can mislead when the wrong sense is chosen (`luppescuDay1993Dictionaries`, [doi](https://doi.org/10.1111/j.1467-1770.1992.tb00717.x)).
  - Word difficulty is idiosyncratic (`goodingTragut2022PersonalComplexity`, preprint, [doi](https://doi.org/10.48550/arxiv.2205.02564)).
  - Dictionary look-up is usable as a word-complexity signal (`strohmaierEtAl2025DLU`, [doi](https://doi.org/10.18653/v1/2025.conll-1.32)).
  - So the interface says "looked up". Not looking something up is never treated as knowing it.
- **Repetition and spacing.**
  - Encounter frequency predicts incidental learning (`uchiharaEtAl2019Repetition`). Form and meaning recognition grow over roughly 6–10 encounters (`pellicerSanchez2015Incidental`, [doi](https://doi.org/10.1017/s0272263115000224); `rott1999ExposureFrequency`, [doi](https://doi.org/10.1017/s0272263199004039)).
  - This motivates the repetition factor and the exposure damping. Our encounters are inferred, not observed.
- **Recency decay.**
  - Exponential forgetting models are standard in spaced-repetition systems (`settlesMeeder2016HLR`, [doi](https://doi.org/10.18653/v1/p16-1174); `tabibianEtAl2019Memorize`, [doi](https://doi.org/10.1073/pnas.1815156116)).
  - Our fixed half-life is not fitted to recall data, which we do not collect.
  - Simple learner models can predict future performance poorly (`schuetzeEtAl2025KnowledgeTracing`, [doi](https://doi.org/10.1007/s40593-025-00508-3)). The ranking is therefore a list ordering, not a memory prediction.
- **Reading-speed ceiling.**
  - Adult L1 silent reading averages about 238 wpm for non-fiction and 260 wpm for fiction, with most readers of fiction at 200–320 wpm. L2 readers are slower (`brysbaert2019ReadingRate`, [doi](https://doi.org/10.1016/j.jml.2019.104047)). Time on screen faster than 400 wpm is more likely scanning than reading.
  - Dwell and scroll are coarse proxies. Gaze and touch-kinematic signals predict comprehension and engagement better (`guoWang2018MobileReading`, [doi](https://doi.org/10.1145/3242969.3243011); `chenEtAl2023DeepSkimReading`, [doi](https://doi.org/10.1145/3544548.3581174)), but we deliberately do not collect them.
- **Practice later.**
  - Reprocessing looked-up words after reading ("input plus") improves retention (`petersEtAl2009InputPlus`, [doi](https://doi.org/10.1111/j.1467-9922.2009.00502.x); `eckerthTavakoli2012Elaboration`, [doi](https://doi.org/10.1177/1362168811431377)).
  - Cumulative, spaced retrieval with feedback is supported (`nakataEtAl2021CumulativeTests`, `kimWebb2022SpacedPractice`, `liEtAl2024RetrievalFeedbackL3`).
  - None of this is implemented here.
- **Grammar questions.**
  - Metalinguistic explanations during reading can aid incidental grammar learning (`ryuChoi2024Metalinguistic`, [doi](https://doi.org/10.1177/13621688241286668)). The role of conscious noticing is contested (`truscott1998Noticing`, [doi](https://doi.org/10.1191/026765898674803209)).
  - Classifying free selections as grammar is left to Level 2.
- **LLM analysis.**
  - LLM assessment can be consistent but varies by model and over time (`packEtAl2024LLMScoring`, [doi](https://doi.org/10.1016/j.caeai.2024.100234); `cainesEtAl2023LLMLanguageTeaching`, [doi](https://doi.org/10.48550/arxiv.2307.08393); `alghamdiAlghizzi2026LLMAssessment`).
  - Self-assessment remains the authoritative level choice (`liZhang2021SelfAssessment`).
- **Coverage.**
  - Comfortable reading is associated with about 95–98% known-word coverage (`lauferRavenhorstKalovski2010LexicalThreshold`, [doi](https://doi.org/10.64152/10125/66648); `hermanLeeser2022LexicalCoverage`). Lookups alone cannot estimate coverage.

## Implementation

- **Storage:**
  - `js/workspace-storage.js` defines `SIGNALS_PATH` and `validSignals`, and makes the store optional, like usage history.
  - An unreadable file never blocks stories, settings or generation, and is never overwritten.
  - Deleting stories or languages leaves it intact.
  - The repository seed is empty.
- **Tracking:**
  - `js/consultation-signals.js` holds recording, the two-minute dedupe, exposure counting, ranking and merge-on-repair.
  - `js/reading-exposure.js` holds paragraphs, `Intl.Segmenter` word counts and the dwell rules.
- **Hooks in `js/app.js`:**
  - word note open and Listen
  - Explain and follow-ups, recorded after the result is saved
  - examples
  - Translate, recorded after the translator opens
  - title selections are excluded
  - exposure starts with each rendered chapter
- **Interface:** "Most looked up" in the profile; see `DESIGN.md`.
- **Provenance:** no prompt changes. Selected text is stored canonically, without furigana.
- **Tests:** `tests/consultation-signals.mjs` and `tests/reading-exposure.mjs`.
- **Android checks:** listed in the [Android checklist](../evaluation/android-checklist.md).

## Alternatives and revisit conditions

**Rejected:**
- Gaze, camera or sensor inference of unknown words: privacy, hardware and permission cost.
- A placement or vocabulary-size test: PED-001 and PED-004 keep self-selected levels.
- Storing every token read: there is no lemmatizer, and tokens add little before a vocabulary model exists.
- Automatic Level 2 runs: AI requests stay learner-initiated.

**Revisit when any of these happens:**
- Coverage or vocabulary-size estimates become a requirement. Then add a lemmatizer or frequency bands.
- Learner feedback shows the list misranks items.
- A practice mode needs recall outcomes, which would allow fitting the decay.
- Device checks show the 400 wpm or idle rules misclassify normal reading.

Evaluation is pending.

## Decision history

- 2026-11-08: Level 1 lookup ranking and probable-reading exposure implemented (app 1.3.0); Level 2 proposed.
- 2026-11-08: items keyed by text alone (meanings are written per chapter); every meaning kept per item to allow later homograph splitting; read-only detail sheet in Profile.
