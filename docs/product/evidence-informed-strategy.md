# Evidence-informed product strategy

Status: durable direction, not an implementation plan. Nothing here is a committed feature, date or ranking. First written 2026-10-19 from the scoped reviews listed below. Revisit under the conditions in each row and under the [research policy](../research/README.md#learning-change-policy).

## Purpose and rules

LingoMage is a reading-first workspace of AI-generated stories with contextual help ([MVP](mvp.md)). This document records where research suggests the product could develop, what is known, what is not, and how an idea must be evaluated before it ships.

- **Reading stays the core.** Other modes are options around a story, never a replacement for reading.
- **Evidence is not a roadmap ranking.** The reviews show where studies exist, not which feature would work best here. An external synthesis that ranks methods was audited and was not used for ordering ([audit](../research/README.md#audit-of-a-candidate-synthesis)).
- **Label every claim:** research-supported finding, extrapolation, product assumption or open question. Most items below are extrapolations: the evidence is mostly adult or university learners of English, controlled materials and short horizons, not AI-generated stories in German, Japanese, Russian or Spanish.
- **No unvalidated schedules.** No optimal review interval, session length or time split between activities is claimed.
- **Quality is not learning.** Good AI text, passing validators or an AI judge's approval do not show comprehension, retention or transfer.
- **Privacy.** Learner stories, settings and checkpoints stay local. Development evaluations and AI evals use public fictional briefs and frozen sources, never learner files. A future voluntary in-app assessment could use story targets the learner explicitly selects, with consent, and any research export would be separate, explicit and consented, with no telemetry or automatic export ([outcomes and evaluation](learning-outcomes-and-evaluation.md#data-and-privacy-direction)).
- **Outcomes.** What counts as learning (reading comprehension, retention, transfer, spontaneous production) and which signals cannot establish it alone (engagement, AI text quality, practiced-task performance) is defined in [learning outcomes and evaluation](learning-outcomes-and-evaluation.md).

Source reviews: [reading and glossing](../research/reading-and-glossing.md), [retrieval and spacing](../research/retrieval-and-spacing.md), [outcomes and measurement](../research/outcomes-and-measurement.md), [instruction, feedback and production](../research/instruction-feedback-and-production.md), [level-guided generation](../research/level-guided-generation.md), [self-assessment](../research/self-assessment.md).

## Current baseline

Implemented ([PED-002](../pedagogy/PED-002-contextual-reading-support.md), [PED-003](../pedagogy/PED-003-story-memory-and-paths.md), [PED-004](../pedagogy/PED-004-level-guided-generation.md)): self-selected level targets; optional vocabulary and grammar focuses planned before prose; contextual notes with first-occurrence underlines; on-demand Explain, More detail and examples; saved narrative memory and alternate paths; device chapter and selected-text speech; "another story from the same practice text". Not implemented: quizzes, review, scheduling, learner production, feedback on learner language, dialogue, any measure of learning. Learning effectiveness of any of this is unvalidated.

## Horizon 1: strengthen reading

| Opportunity | Learner need | Evidence and limits | Current behavior | Evaluation questions | Reconsider when |
| --- | --- | --- | --- | --- | --- |
| Level fit and avoidable difficulty | Readable text with a few new items, not constant lookup | Level-control and coverage studies in [level-guided generation](../research/level-guided-generation.md); no measure of a learner's known words; LLM level control unvalidated | Level guides, planned focuses, no coverage measure | Do qualified reviewers judge level fit by language? Does usability testing show unneeded lookups? | Reviewer or learner reports of unsuitable level; a measured placement need |
| Support quality of notes and explanations | Accurate, brief help that does not distract | Glossed reading helps on average but formats vary and learning is partial (`yanagisawaWebbUchihara2020Glossing`, `webbEtAl2023IncidentalMetaAnalysis`); no study of AI notes | Contextual notes, Explain, no density cap | Material error rates by language (see the notes comparison); is help used and understood? | Qualified review finds recurring errors, or tests show help is ignored or over-used |
| Sustained reading and return | Reason to keep reading across stories | Extensive reading: small-to-medium, possibly overestimated effects; larger with limited text choice and accountability (`sangersEtAl2025ExtensiveReading`, `hamada2020ExtensiveReadingBias`); not tested for AI one-off chapters | Open brief, continuations, saved library | Do learners read more over weeks with continuations? Does limiting choice change comprehension or motivation? | Usage data from a consented pilot; evidence on accountability formats |
| Natural vocabulary recurrence within a story | Meeting new items more than once | Encounters correlate with incidental learning (`uchiharaEtAl2019Repetition`); no required count; forced repetition can harm naturalness | Prompts ask for natural reuse; no counting | Does recurrence feel natural to reviewers? Is recurring-item recognition higher at a delay? | Review indicates stilted reuse or no recurrence |

## Horizon 2: investigate durable learning

Question: can optional retrieval, reuse across stories and contextual instruction improve delayed retention and use on unseen text, without displacing reading? These are investigations, not features.

| Opportunity | Learner need | Evidence and limits | Current behavior | Evaluation questions | Reconsider when |
| --- | --- | --- | --- | --- | --- |
| Optional retrieval of words met in stories | Remember items after the story is closed | Spaced practice has a medium-to-large effect overall, with schedule effects moderated by many factors (`kimWebb2022SpacedPractice`); retrieval paired with spacing can be effective (`riceTokowicz2020LabVocabularyTraining`); counter-signals: massed equal to spaced for some grammar outcomes (`suzukiDeKeyser2017Proceduralization`), feedback and number of retrievals may matter (provisional entries). No optimal interval | None | Does optional retrieval with feedback beat re-reading at a delay, in these languages and from story context? Does it raise abandonment or quiz-like stress? | A prototype passes quality and usability review; learning comparisons are completed before effectiveness claims; provisional evidence is verified before adoption |
| Reuse across stories | Meet saved words again in new contexts | Spacing in sentence contexts benefited explicit but not tacit knowledge (`nakataElgort2021SpacingContext`); no study of AI-generated reuse | "Another story" from the same practice text | Do unseen-context items improve over reading once? Do reviewers find the reuse natural and correct? | Qualified review of generated reuse; a delayed comparison |
| Contextual explicit instruction | Understanding why a form works | Explicit instruction shows moderate-to-large effects but test format matters (`liSun2024ExplicitInstruction`); no study of AI explanations inside reading | On-demand explanations; no instruction sequence | Does a short targeted note raise delayed accuracy on unseen sentences compared with Explain on demand alone? | Reviewers find explanations accurate by language |

## Horizon 3: explore story-linked listening, writing and feedback

| Opportunity | Learner need | Evidence and limits | Current behavior | Evaluation questions | Reconsider when |
| --- | --- | --- | --- | --- | --- |
| Story-linked listening | Hear target language tied to known text | Mixed: reading-while-listening lowered comprehension versus silent reading in one registered report (`huiGodfroid2026ReadingWhileListening`); vocabulary gains across modes similar and heterogeneous (`webbEtAl2023IncidentalMetaAnalysis`); not tested for synthesized speech or these languages | Device speech for chapters and selections | Does listening help or hinder comprehension for beginners with device speech? | Device audio quality review; comparison data |
| Short writing or speaking tied to a story | Productive use of new language | Task and dialogue systems show medium effects in mostly pre-LLM studies (`houMin2026DialogueCALL`, `bibauwEtAl2022DialogueSystems`); the TBLT program figure is disputed (`bryfonskiMcKay2019TBLT`, `xuanEtAl2025TBLTComment`, `boersFaez2026TBLTMetaAnalysis`); gains on repeated speaking tasks are better shown than gains on unrelated spontaneous speech ([outcomes and measurement](../research/outcomes-and-measurement.md#spontaneous-production)) | None | Does a story-linked task improve delayed productive use on unseen prompts versus reading alone? | Qualified review of AI interlocutor or feedback accuracy |
| Corrective feedback on learner language | Know what to fix | Feedback has durable effects in human-led studies, with type and setting differences (`li2010CorrectiveFeedback`, `lysterSaito2010OralFeedback`); AI feedback accuracy and effects untested here | The app does not assess learner writing | Is AI feedback accurate by language per qualified reviewers? Do learners revise correctly later? | Review shows accurate feedback; a consented delayed comparison |

## Evaluation before learning claims

Work in gates; a later gate does not replace an earlier one. These gates define evaluation for proposed extensions; they do not imply that existing engineering checks or content reviews have not occurred. App-specific learning evaluations remain pending.

1. **Qualified language review and usability.** A qualified reviewer per language checks accuracy, naturalness and level fit; a small usability session checks comprehension of the interface and whether the feature is used as intended. Without this, stop.
2. **Quality proxies.** Deterministic safeguards and the opt-in [AI evals](../validation/generation-evaluation/README.md#learning-quality-evaluations-ai-evals) can find errors early. They measure output quality only, and an AI judge's scores are not proof of learning.
3. **Comprehension.** Test understanding of the story during or just after reading, separate from word knowledge.
4. **Delayed retention.** Re-test target items after a delay chosen in advance and justified in the protocol (for example, days and weeks), against a reading-only comparison with the same time on task. Include a control for words learned elsewhere.
5. **Transfer to unseen material.** Test the same items in new sentences or a new passage, and where relevant productive use, not only recognition of the exact story sentences.

Engineering prototypes (to test whether a probe or review flow works, is usable and passes language review) may precede these gates; only **learning claims** need them, and a prototype is never evidence of learning. The concrete in-app direction, measurement principles and an example research protocol (not a requirement) are in [learning outcomes and evaluation](learning-outcomes-and-evaluation.md). Typed unfamiliar-task responses are a limited production proxy; spontaneous speech assessment needs audio capture, transcription and qualified scoring that this workspace does not provide.

Feasibility: a within-subject design that counterbalances which items get the feature, small consented pilots first, local data only, preregistered measures and analysis, and statistical advice on sample size before any confirmatory claim. Report limits, effect uncertainty and drop-out; never claim certified level alignment.

## Reconsideration and rejected claims

- Revisit this document on relevant feature work, major new evidence, contradictory evaluation results, or when a provisional source is verified or fails verification.
- Not used for product direction: matching to learning styles (no supporting source was reviewed; tangential to this strategy), an optimal activity time split, the claim that one combined method is best across skills, and any ranking drawn from the shared synthesis.
- Deferred features remain research candidates until a proposal follows the policy; prototypes can precede trials, while learning claims require the gates above; see [MVP](mvp.md#deferred-features-and-research-candidates).
