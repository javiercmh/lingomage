# Learning outcomes and future in-app evaluation

Status: durable product direction. **Nothing here is implemented or promised.** There is no probe, assessment UI, tracking, recording, evaluation request, saved assessment data or runtime schema, and none may be added without a separate change that follows the [research policy](../research/README.md#learning-change-policy). Evidence basis is separate: [retention, transfer, spontaneous production and measurement](../research/outcomes-and-measurement.md) and the [strategy](evidence-informed-strategy.md). Intended outcomes below are product intent; they are not research findings and carry no validated cutoffs.

## Intended learner outcomes

LingoMage is reading-first. The core outcome is **reading comprehension**: understanding stories and new texts at the learner's chosen level with decreasing reliance on help over time. Three further outcomes describe what lasting learning from reading could look like. They are **overlapping dimensions, not independent scales or a ladder**: transfer and production can share tasks (a typed sentence in a new situation is both), and retention can be receptive (recognizing a word) or productive (recalling or using it).

| Outcome | Conceptual meaning | Example observations (illustrative, not a test battery) |
| --- | --- | --- |
| Reading comprehension (core) | Understands the content of a story or a new text, including meaning that depends on unfamiliar items, without help during the assessed response | Answering questions about a new passage read without notes; summarizing the main events |
| Retention | Recognizes or recalls previously met material after a delay, receptively or productively | Choosing or supplying the meaning or form of a story word after days or weeks |
| Transfer | Applies learning to material, contexts or tasks that were not practiced: new passages, new sentences, new topics, new word combinations | Understanding a held-out text that reuses learned words; using a learned form in an unfamiliar situation |
| Spontaneous production | Retrieves and combines language under real-time communicative constraints without supplied target wording, rehearsal or advance preparation | Responding to an unfamiliar communicative situation where meaning is conveyed successfully; a situation prompt is allowed, but it must not cue the target form or provide an answer |

What success would mean, conceptually: a learner understands new text with less reliance on help, can bring back material after a delay, can use it somewhere it was not taught, and eventually can communicate without supplied language or rehearsal. Interpret help use alongside comprehension, since fewer lookups alone may reflect avoidance. Do not collapse these outcomes into a single number or a CEFR/JLPT/TORFL equivalent. No cutoff for "learned" is established; any future cutoff needs its own validation.

## What does not establish learning on its own

- **Engagement** (time spent, streaks, enjoyment, taps, reading volume, help use) is a usage signal. It may motivate a feature but is not learning.
- **AI text quality** (readable, accurate notes, level-fit as judged by a reviewer or model) concerns the product, not the learner.
- **Task performance** on a practiced item or repeated task may reflect learning, familiarity or both. It does not establish durable or transferable ability without further assessment.
- **Self-report** and AI-estimated difficulty are orientation, not measurement.
- **Observation versus attribution.** A change between two observations does not show the app caused it. Causal claims need comparisons designed for them (see below), and even then apply to the study sample.

## Future in-app evaluation direction

The direction is a voluntary, optional, learner-initiated check, designed so that it can later be run as research. It is not a mandatory test and never interrupts reading.

1. **Separate practice from assessment.** Practice with help (explanations, feedback, review) is a different mode from an assessment that gives no assistance until after the response is submitted. Assessment responses are recorded before any feedback, answer or correction is shown.
2. **Optional baseline, immediate and delayed probes.** A baseline before the target reading measures prior knowledge where feasible; it must not assume the learner has never met an item elsewhere. An immediate probe follows reading, with delayed probes later. Exact timestamps of recorded exposure, each probe and each response are retained so delay is measured, not assumed. Learners can decline, postpone or stop a probe without penalty; no forced interruption of reading; no timed pressure imposed on reading.
3. **Separate target history from context novelty.** Retention probes assess trained targets after a delay. Transfer probes use those trained targets in passages, sentences or communicative tasks withheld from practice. Separate untrained control targets, matched for level and frequency where feasible, help interpret changes unrelated to target practice. A held-out context can contain trained vocabulary; an untrained control target must not be deliberately taught before its comparison probe. Record incidental encounters rather than assuming withholding guarantees no exposure.
4. **Item history and contamination.** Record which items were encountered, in which stories, how often, with or without help, and whether they were tested before. Treat same-item retests as potential practice (testing effect) and prior exposure elsewhere as unknown. Do not mix an item's practice trials with its assessment trials.
5. **Appropriate comparisons.** Observing one learner's change does not show an effect. Where an effect is the question, use matched or counterbalanced comparisons (for example, items assigned to a feature or to reading only), reported at the item and learner level.
6. **First targets.** Reading-related vocabulary retention (recognition, then recall) and comprehension of novel passages. Typed responses to unfamiliar prompts are a **limited production proxy**, not spontaneous oral proficiency. Do not describe typed, prompted, unpressured text as spontaneous speech.
7. **Spontaneous speech is out of reach for now.** Genuine spontaneous speech needs audio capture, latency measurement, transcription (with ASR validity for each language) and qualified scoring. None is assumed to exist in this workspace. Communicative success (was the message understood?) should be judged before proxy metrics such as raw speed, pauses or complexity.

### Feasibility against the current bridge

Inspected `js/bridge.js` and `docs/architecture/app2-runtime.md` on 2026-10-19. Only that file calls host capabilities.

| Needed capability | Present in the bridge wrappers | Gap or constraint |
| --- | --- | --- |
| Local, user-owned JSON assessment records | `readFile`, `writeFile`, `deleteFile`, `listFiles` for workspace `data/` files | No assessment file or schema exists; any future file needs an owned-file declaration in the manifest, seeded empty, and an unpublishable-learner-data rule like checkpoints |
| AI-assisted item generation or scoring | `ai.start/result/wait/cancel/acknowledge` using App²'s managed connection | Requests go to the learner's configured provider via App²; do **not** promise local-only scoring. Each call needs a concise task-specific title/body and must not store credentials. No retry without explicit action. Reliability for these languages is unvalidated |
| Scheduling delayed probes | `scheduleNotification`, `canScheduleWhileClosed` | Needs notification permission and learner opt-in; may be unavailable on browser previews and older hosts; still unverified on Android per the device checklist |
| Typed responses | Standard page text input | Canonical text rules apply; no keystroke or timing capture is planned |
| Spoken audio capture, latency, transcription | **Not exposed.** `speech` provides voices, capabilities, speak and stop (output only) | Microphone access, recording, ASR and scorers would be new host capabilities; whether the host offers any is unverified. Do not design around them yet |
| Exact timing | Page clock, wall time | Reliability across suspended pages and device time changes is unverified |
| Research export | None; Share & Package is export-only for the app, not learner data | A consented research export would be a separate, explicit action, never automatic |

## Measurement and reporting principles

- **No single mastery or proficiency score.** Report each outcome and measure separately, with the items, task type and delay. Do not compare languages, scripts or modes (reading, typed, spoken) unless evidence supports that comparison.
- **Observations are not attributions.** Label results as descriptions unless a comparison was designed to support attribution.
- **Uncertainty and missingness.** Show confidence or range where meaningful. Mark "not assessed", declined and missing follow-ups; never impute a pass or fail.
- **Provenance.** Record, for every item and response: item source and history, prompt/rubric/scorer identity, model and version, prompt version and date of generation or scoring, plus exact timing. Existing story provenance is preserved.
- **Text handling.** Keep Japanese canonical text separate from furigana annotations (copy and scoring use canonical text); Russian stays in Cyrillic without transliteration; use language-sensitive rubrics rather than a single template.
- **Feedback comes after the response.** Corrections, answers and explanations are shown only after the assessment response is submitted.
- **AI evaluation is assistive.** AI-generated items and AI scores are checked against qualified human ratings in each language before any automated interpretive claim; until then they are labelled as unvalidated. The review found moderate human-AI agreement from few studies and sparse evidence outside English, so no autonomous scoring is assumed ([evidence](../research/outcomes-and-measurement.md#measurement-evidence)).
- **Eligibility and floors.** Beginners may score near zero on production or novel-text probes. Define eligibility and report floor and ceiling effects instead of treating low scores as failure; do not offer probes the learner could not plausibly attempt.
- **Primary versus exploratory.** Choose a small number of primary outcomes before looking at data (for example, delayed recognition of trained items and novel-passage comprehension). Everything else is exploratory and reported as such.
- **Communicative success before proxies.** For production, judge whether meaning was conveyed before reporting speed, pause or complexity indices.

## Data and privacy direction

If assessment is ever implemented, its records would be inspectable local JSON in the learner's workspace, owned by the learner and covered by the existing no-credential and no-token rules. Declare an empty seed default, created only when absent; packaging must use that empty default rather than learner records, and App² updates must preserve existing records. Conceptually each record needs: item identity and history; response; timing; assessment version and rubric/scorer/model provenance; and the consent state. **Nothing is collected now.**

The strategy's rule that evaluations do not use learner files is clarified here: development evaluations and AI evals use public fictional briefs and frozen sources, never learner files. A **future voluntary in-app assessment** may use story targets the learner explicitly selects, with consent, and a **separate, explicit, consented research export** may exist. Learner data stays user-owned, with no telemetry, no automatic export and no silent upload. Where AI is used for items or scoring, the content goes to the learner's configured provider, which the learner must be told in plain English before opting in.

## Example research protocol (not a requirement)

An illustrative design only. It is not an established optimum, not a schedule for the product and not a launch requirement.

- **Timing:** an immediate probe after exposure, a delayed probe around four weeks and another around three months, each with exact elapsed time recorded. Delays are example values chosen for feasibility; the evidence reviewed does not establish them.
- **Material:** trained items, held-out items matched for level, and a novel passage reusing learned words.
- **Outcomes:** primary (for example, delayed recognition of trained words; comprehension of a novel passage), exploratory (recall, typed use of target words in a new situation, communicative success of a typed task). Candidate production indices (rate, pause location, syntactic complexity, accuracy, lexical diversity) are measures to evaluate, not a validated LingoMage battery.
- **Comparison:** reading-only versus reading with a candidate feature, with items counterbalanced across learners where feasible; analysis and sample size planned with statistical advice before data collection.

## Prototypes versus learning evidence

A prototype is an engineering artifact that may be built to test whether a probe or review flow works (usability, reliability, language review, consent flow). It does not claim learning gains and need not wait for a trial. **Learning claims** (that a feature improves retention, transfer or production) require the [evaluation gates](evidence-informed-strategy.md#evaluation-before-learning-claims): reviewed quality, comprehension, delayed retention against a comparison, and transfer to unseen material. Do not require a completed trial before any prototype, and do not describe a prototype as evidence.

## Revisit when

A probe or review prototype is proposed; qualified language review of generated items or scoring exists; bridge capabilities for audio or scheduling change; a pilot shows learners decline, are distressed or change reading behavior because of probes; or the provisional sources behind the evidence are verified or fail verification.
