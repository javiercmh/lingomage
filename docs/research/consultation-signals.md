# Consultation signals: lookups, exposure and learner modelling

Supports [PED-005](../pedagogy/PED-005-consultation-signals.md).

Sources were found through the Consensus paper search on 2026-11-08. All DOIs resolved at doi.org on that date. Unless a note says otherwise, only abstracts and search-record metadata were reviewed, not full texts.

## What a lookup means

| Key | Design | Finding relevant to LingoMage | Limit |
| --- | --- | --- | --- |
| `zhangXuZhang2020DictionaryMeta` | Meta-analysis: 44 studies, 125 effect sizes, 3,475 participants | Dictionary use has large effects on L2 vocabulary acquisition; effects are moderated by proficiency, dictionary type and assessment | Mostly intentional or lab conditions |
| `knight1994DictionaryReading` | Experiment, L2 Spanish readers | Dictionary access while reading increased vocabulary learning, especially for lower verbal ability | Older study; paper dictionaries |
| `luppescuDay1993Dictionaries` | 293 Japanese EFL students | Dictionary users scored higher on vocabulary but read about half as fast; picking the wrong sense misled some readers | Bilingual paper dictionaries |
| `prichard2008SelectiveDictionary` | Japanese university EFL readers | A third of the participants over-consulted; about a quarter of lookups were neither essential nor frequent words | So a lookup is not evidence that a word was needed or unknown |
| `strohmaierEtAl2025DLU` | Dataset and modelling | Dictionary look-up prediction is proposed as a word-complexity task; a feature-based model beat LLMs | English; supports lookups as a difficulty signal |
| `goodingTragut2022PersonalComplexity` | Preprint; active learning | Personal models predict an individual's word complexity better than generic ones | Not peer reviewed |

**Implication:** record lookups and label them as lookups. Do not infer knowledge from the absence of a lookup.

## Repetition, exposure and recency

| Key | Design | Finding | Limit |
| --- | --- | --- | --- |
| `uchiharaEtAl2019Repetition` | Meta-analysis, 26 studies | Medium correlation (r = .34) between encounters and incidental learning; spacing and engagement moderate it | Already cited in PED-002 and PED-004 |
| `pellicerSanchez2015Incidental` | Eye tracking, L2 English | After eight exposures, learners recognised 86% of nonword forms and 75% of meanings, and recalled 55%; reading sped up after 3–4 encounters | Nonwords in one story |
| `rott1999ExposureFrequency` | Intermediate learners | Six exposures produced more vocabulary knowledge than two or four; retention was mixed | Small samples |
| `settlesMeeder2016HLR` | Half-life regression on Duolingo data | Exponential memory half-life predicts recall better than baselines | Needs recall outcomes, which LingoMage does not collect |
| `tabibianEtAl2019Memorize` | Optimal-control scheduling | Review timing tied to recall probability improves memorisation in Duolingo data | Same as above |
| `schuetzeEtAl2025KnowledgeTracing` | Longitudinal evaluation | Common knowledge-tracing models fail at predicting future sessions and the spacing effect | A caution against overclaiming |

**Implication:** a fixed half-life and the repetition and damping factors are a transparent ordering heuristic. They are not a calibrated memory model.

## Inferring reading

| Key | Design | Finding | Limit |
| --- | --- | --- | --- |
| `brysbaert2019ReadingRate` | Meta-analysis, 190 studies | Adult silent reading averages 238 wpm for non-fiction and 260 wpm for fiction (most readers 175–320); L2 readers are slower; rates in other languages scale with how many words they need | English-centred; we use the figures as an upper plausibility bound |
| `guoWang2018MobileReading` | 25 participants, smartphones | Gaze saccades and touch kinematics predict comprehension and engagement better than dwell time | Signals we choose not to collect |
| `chenEtAl2023DeepSkimReading` | 29 participants | Deep reading and skimming can be distinguished from eye movements and interaction data (AUC up to 0.82) | Lab-induced reading styles |

**Implication:** treat dwell-based reading as "probably read", with a speed ceiling and an idle cut-off.

## Using signals later

| Key | Finding |
| --- | --- |
| `petersEtAl2009InputPlus` | Looking words up and processing them again after reading ("input plus") boosts retention compared with input alone |
| `eckerthTavakoli2012Elaboration` | Retention depended more on elaborate form–meaning processing than on exposure frequency |
| `ryuChoi2024Metalinguistic` | Metalinguistic explanations during reading improved incidental grammar acquisition without hurting comprehension, but did not transfer to constructions that were not explained |
| `truscott1998Noticing` | Critical review: noticing may be needed for metalinguistic knowledge but not for competence |
| `packEtAl2024LLMScoring` | GPT-4 essay scoring showed good validity and reliability, but every model fluctuated over time |
| `cainesEtAl2023LLMLanguageTeaching` | LLMs did not beat specialised systems on grading or error-correction benchmarks; output needs shaping |
| `lauferRavenhorstKalovski2010LexicalThreshold` | 95% coverage (4,000–5,000 word families) as the minimal threshold and 98% (about 8,000) as the optimal one for reading comprehension |

These support the proposed Level 2 analysis and a future practice mode. They do not establish that LingoMage's signals improve learning, and no such evaluation has been run.
