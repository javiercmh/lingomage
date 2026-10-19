# Spaced retrieval and repeated encounters

Review date: 2026-10-19. Scoped, not systematic. Discovery used Consensus search; bibliographic metadata was checked in Crossref; the original publication was read only where the access line says so. Consensus is discovery and cross-checking, not evidence.

**Questions.** (1) Does revisiting vocabulary over time, with retrieval, produce more durable learning than massed or single-session study? (2) What do repeated encounters in reading add? (3) Which findings might apply to optional review of words met in LingoMage stories?

**Status.** Nothing here is implemented. LingoMage has no retrieval, quiz or scheduling feature (see [strategy](../product/evidence-informed-strategy.md)). Findings are research candidates for [Horizon 2](../product/evidence-informed-strategy.md#horizon-2-investigate-durable-learning). They do not set a schedule.

## Access levels used

| Level | Meaning |
| --- | --- |
| Full text (summarized) | Open full text fetched through a summarizing tool; not read line by line |
| Abstract + metadata | Publisher or Crossref abstract summary and metadata; full text not read |
| Provisional | Abstract seen only in a Consensus record. Quarantined: shown as a counter-signal or caveat, not relied on |

## Sources

| Key | Access | Design, sample | Finding | Limits for LingoMage |
| --- | --- | --- | --- | --- |
| `kimWebb2022SpacedPractice` ([DOI](https://doi.org/10.1111/lang.12479)) | Abstract + metadata (Language Learning 72(1)) | Meta-analysis, 48 experiments, N = 3,411, 98 effect sizes | Medium-to-large spacing effect. Shorter spacing matched longer on immediate tests but was weaker on delayed tests. No significant difference was reported between equal and expanding schedules; this does not establish equivalence for every setting. Effects varied with learning target, number of sessions, practice type, activity type, feedback timing and retention interval | Moderators vary widely. The abstract gives no schedule that suits a reading app. Mostly controlled studies; not LLM-generated stories |
| `riceTokowicz2020LabVocabularyTraining` ([DOI](https://doi.org/10.1017/S0272263119000500)) | Abstract + metadata only (SSLA 42(2)); full text unavailable | Narrative review of laboratory training studies with adult learners | Massed L1-to-L2 repetition is generally ineffective alone; it becomes effective when paired with methods that strengthen form-meaning links, for example spaced retrieval practice or semantic elaboration with user-generated responses | Laboratory, adult, paired-associate emphasis. Abstract-level only, so the review's own caveats were not examined |
| `nakataElgort2021SpacingContext` ([DOI](https://doi.org/10.1177/0267658320927764)) | Abstract + metadata (SLR 37(2)) | Japanese speakers; 48 English words in informative sentences; meaning-inference with feedback | Spacing helped meaning recall and meaning-form matching; semantic priming (tacit knowledge) was similar under massed and spaced | One language pair, sentences rather than narrative, university learners. Suggests spacing helps explicit, not necessarily automatic, knowledge |
| `nakataEtAl2021CumulativeTests` ([DOI](https://doi.org/10.1002/tesq.596)) | Abstract + metadata (TESOL Quarterly 55(1)) | 72 Japanese university students, 80 English words, nine weekly classes; cumulative versus non-cumulative quizzes | Cumulative quizzes reported as roughly twice (receptive) or three times (productive) as effective | One course context, intact quiz design. Teacher-run quizzes, not self-directed app review |
| `karatasEtAl2025MultidomainVocabulary` ([DOI](https://doi.org/10.1177/13621688211053525)) | Abstract + metadata (LTR 29(1), online 2021) | 48 Turkish university students, 64 English words, 17 days; typical restudy versus spaced, expanding retrieval practice with feedback | Optimized group improved more at tests 1 and 11 days later, mainly for high-frequency words | Small sample, short follow-up, bundled techniques (cannot isolate retrieval from spacing). Only narrow support for combining memory techniques; it is not evidence that a hybrid of input, instruction and production beats single methods |
| `suzukiDeKeyser2017Proceduralization` ([DOI](https://doi.org/10.1177/1362168815617334)) | Abstract + metadata (LTR 21(2)) | Learners of Japanese; one morphological target | Massed practice matched distributed practice for accuracy and may give faster utterances | Contradicts a blanket spacing advantage; target was grammar proceduralization, not vocabulary |
| `webbEtAl2020IntentionalActivities` ([DOI](https://doi.org/10.1111/modl.12671)) | Abstract-level (MLJ 104(4)): Crossref metadata; abstract via an OpenAlex record, matching the Consensus abstract. Publisher page not read | Meta-analysis, 22 studies, 100 effect sizes; flashcards, word lists, writing, fill-in-the-blank | Average gains were about 60% on immediate meaning- and form-recall posttests and lower on delayed posttests, with the larger drop for form recall (the Consensus abstract gives 39.4% meaning and 25.1% form). Activity-level means varied widely (about 18% to 77% immediate; 24% to 73% delayed) | These are pooled study-level percentages, not within-learner retention of an earlier gain; studies differ in delay length, design and learners. Not a measure of spontaneous use. Upgraded from provisional to abstract-level only |
| `yanZhou2023SpacingChineseStudents` ([DOI](https://doi.org/10.1016/j.system.2023.103049)) | **Provisional**: Consensus abstract only; Crossref metadata (System 115) | 67 Chinese university students | Reported better long-term accuracy for massed practice, more for receptive knowledge | Counter-signal only. Cannot be weighed against Kim & Webb until read at the source |
| `miyatsuMcDaniel2019KeywordRetrieval` ([DOI](https://doi.org/10.3758/s13421-019-00936-2)) | **Provisional**: Consensus abstract only | Foreign-language word pairs; at most two retrievals per item | With two retrievals, retrieval practice alone showed no advantage over restudy at 48 h and 1 week; a keyword-retrieval combination did | Warns that brief or single retrieval may not help. Candidate caveat |
| `liEtAl2024RetrievalFeedbackL3` ([DOI](https://doi.org/10.1080/14790718.2022.2102172)) | **Provisional**: Consensus abstract only | Chinese-English bilinguals, French word pairs, 30-minute retention interval | Without feedback repeated study beat retrieval; with feedback retrieval won | Very short interval. Candidate caveat that feedback after retrieval may be necessary |

## Repeated encounters in reading

`uchiharaEtAl2019Repetition` ([DOI](https://doi.org/10.1111/lang.12343); Language Learning 69(3)): abstract checked. 26 studies, 45 effect sizes, N = 1,918, correlational. Medium association (r = .34) between encounters and incidental learning. Moderators included learner variables (age, vocabulary knowledge), treatment variables (spacing, visual support, engagement, range of encounters) and methodological features. `webbEtAl2023IncidentalMetaAnalysis` ([DOI](https://doi.org/10.1017/S0261444822000507); Language Teaching 56(2)): abstract re-checked; the earlier review records full-text methods. Reading gains were partial and heterogeneous (17% immediate, 15% delayed for reading), with spacing listed among moderators. Neither study sets a required number of encounters or tests reuse across AI-generated stories.

## Applicability and gaps

- **Direct evidence:** none evaluating LingoMage, its AI-generated stories or an in-app review feature. Some studies involve Japanese as a target language; that does not validate this app or establish generalization across all four targets.
- **Extrapolated:** retrieval with feedback and spacing may help durable knowledge of words first met in stories. Most studies use English as the target, adults or university students, controlled word lists and short horizons (days to weeks).
- **Contradictory or limiting findings:** several studies report no spacing advantage for some targets or outcomes (`suzukiDeKeyser2017Proceduralization`; provisional `yanZhou2023SpacingChineseStudents`); retrieval may need feedback and enough rounds (provisional); benefits can differ between explicit and tacit knowledge (`nakataElgort2021SpacingContext`). Effects of any schedule depend on the retention interval and test type.
- **Unvalidated:** an optimal interval, session length or daily dose. Do not set one from this review.

## Decision link

Informs the investigation items in the [strategy](../product/evidence-informed-strategy.md) and the "Natural reuse" assumption in [PED-002](../pedagogy/PED-002-contextual-reading-support.md#evidence-and-limits). No PED changes behavior. Reconsider when an optional review feature is proposed, when a prospective review shows a delayed-retention effect in a comparable setting, or when the provisional sources are verified.
