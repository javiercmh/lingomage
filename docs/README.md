# LingoMage documentation

Product rationale, learning decisions, research evidence and the checks that are still pending. The current App² workspace is at the repository root. Retired material (the native Android app and its docs, implemented plans, per-change check reports and raw evaluation outputs) lives only in Git history.

## Where things live

| Kind | Location | Kept current? |
| --- | --- | --- |
| Interface conventions, layout, interaction and accessibility | [`DESIGN.md`](../DESIGN.md) | Yes, updated in the same change as the UI |
| Contributor rules | [`AGENTS.md`](../AGENTS.md) | Yes |
| Packaging and App² updates | [`PACKAGING.md`](../PACKAGING.md) | Yes |
| Shared product requirements and long-term strategy | [`product/`](product/mvp.md), [strategy](product/evidence-informed-strategy.md) | Yes |
| Language-specific requirements | [`languages/`](languages/README.md) | Yes |
| Pedagogical decisions with evidence and limits | [`pedagogy/`](pedagogy/README.md) | Yes, one PED file per decision |
| Research notes and citations | [`research/`](research/README.md), [`references.bib`](research/references.bib) | Append and correct |
| Current runtime and safeguards | [`architecture/`](architecture/app2-runtime.md) | Yes |
| Behavior still unverified on Android | [`validation/device-checklist.md`](validation/device-checklist.md) | Yes |
| Live-generation evidence and language review | [`validation/generation-evaluation/`](validation/generation-evaluation/README.md), [`validation/sample-review.md`](validation/sample-review.md) | Summaries only |

## Index

- [Pedagogical decision log](pedagogy/README.md): stable decision IDs, implementation links, evidence limits and template.
- [MVP specification](product/mvp.md): shared requirements and delivery sequence.
- [Evidence-informed strategy](product/evidence-informed-strategy.md): long-term research-linked directions, limits and evaluation gates (not a plan or feature commitment).
- [Learning outcomes and evaluation](product/learning-outcomes-and-evaluation.md): intended learner outcomes and a future optional in-app evaluation direction, measurement principles and privacy stance (nothing implemented).
- [Language decisions](languages/README.md): language-specific requirements and research questions.
- [Research and evidence policy](research/README.md): how findings become documented decisions.
- [Research index](research/README.md#research-index): reviews grouped by topic and the decision each informs. [Lexical-unit terminology](research/lexical-units.md) is the single source for vocabulary-note naming.
- [App² runtime](architecture/app2-runtime.md): runtime, workspace data and validation limits.
- [Language safeguard audit](architecture/language-safeguards.md): registered safeguards and their regression coverage.
- [Device checklist](validation/device-checklist.md): pending Android checks and recorded device results.
- [Generation evaluation](validation/generation-evaluation/README.md) and its [summary](validation/generation-evaluation/summary.md): live-model comparisons, prompt pilot and limits, and the opt-in [AI evals](validation/generation-evaluation/README.md#learning-quality-evaluations-ai-evals) (implemented, not yet run live).
- [Initial language samples](validation/sample-review.md): early sample review and its limitations.

## Documentation policy

**Write down decisions and evidence, not activity.** A document earns a place in `docs/` if a future contributor needs it to make a correct change. A record of what someone did on a given day does not.

- **Labels.** Distinguish confirmed requirements, product assumptions, research-supported findings and open questions. A product preference or an AI-generated explanation is not research evidence. Never claim certified level alignment or proven learning effectiveness.
- **Same-change updates.** Changes to the interface update `DESIGN.md`. Changes to prompts, reading aids or difficulty rules update the affected PED decision and language file, and increment `PROMPT_VERSION`. Changes to safeguards update `architecture/language-safeguards.md` and `data/language-safeguards.json`.
- **Check reports go in the commit message.** For each change, state in the commit body which tests ran, which screenshots were inspected (screens and widths) and what remains unverified. Do not add a dated validation file for routine engineering checks.
- **Pending device behavior goes in the checklist.** Add or update an item in `validation/device-checklist.md` whenever a change needs Android verification. Record results there when a device check is actually run.
- **Evidence gets a durable summary.** Live-model evaluations and language reviews keep a short summary with method, results and limits under `validation/`. Raw outputs are not committed wholesale; commit them for traceability if needed, then archive them to Git history and reference the commit from the summary.
- **Plans are temporary.** Draft plans in the conversation or pull request. If a plan file is committed, delete it once implemented and move any lasting rationale into `DESIGN.md` or the relevant PED decision.
- **Delete superseded docs.** When a document describes retired behavior, remove it rather than labelling it historical. Git history is the archive. Fix inbound links in the same change.
- **Screenshots.** Commit an image only when a kept document shows it. Inspection screenshots belong in the commit description or conversation, not the repository.
- **Privacy.** Never record credentials, tokens, callback URLs, account or device identifiers.
