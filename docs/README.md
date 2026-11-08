# LingoMage documentation

Two audiences: coding agents changing the app (start at [`AGENTS.md`](../AGENTS.md)), and a future paper about the app's methods (start at the [pedagogy log](pedagogy/README.md)). Retired material lives only in Git history.

## Map

| Need | File |
| --- | --- |
| Contributor rules, where to look | [`AGENTS.md`](../AGENTS.md) |
| Interface rules by screen | [`DESIGN.md`](../DESIGN.md) |
| Manifest, packaging, updates, host APIs | [`PACKAGING.md`](../PACKAGING.md) |
| Modules, data files, generation, storage, tracking | [architecture/app2-runtime.md](architecture/app2-runtime.md) |
| Registered safeguards and their tests | [architecture/language-safeguards.md](architecture/language-safeguards.md) |
| What the product does and does not do | [product/mvp.md](product/mvp.md) |
| Research-linked directions and evaluation gates (not a plan) | [product/evidence-informed-strategy.md](product/evidence-informed-strategy.md) |
| Intended learning outcomes, future in-app evaluation (not implemented) | [product/learning-outcomes-and-evaluation.md](product/learning-outcomes-and-evaluation.md) |
| Per-language rules | [languages/](languages/README.md) |
| Pedagogical decisions (why) | [pedagogy/](pedagogy/README.md), one PED per decision |
| Evidence reviews (what studies show) | [research/](research/README.md), keys in [references.bib](research/references.bib); note terminology in [lexical units](research/lexical-units.md) |
| What to verify on Android, and how | [validation/device-checklist.md](validation/device-checklist.md) |
| Live-generation evaluations, AI evals, language samples | [validation/generation-evaluation/](validation/generation-evaluation/README.md) ([summary](validation/generation-evaluation/summary.md), [contextual-notes comparison](validation/generation-evaluation/contextual-notes/README.md)), [validation/sample-review.md](validation/sample-review.md) |

## Policy

**Docs hold decisions, evidence and current rules, not activity.** A file earns its place if a future contributor or paper author needs it.

- **Current state, concise.** Describe how things are now, one purpose per file, rules stated directly. Do not repeat a rule held elsewhere; link it. Replace outdated text instead of appending dated sections; Git is the archive.
- **Methodological record.** PEDs and research reviews keep every decision, its rationale, citation keys with DOIs, study characteristics, access levels and stated limits, plus a one-line decision history per material change. Condense wording, never evidence.
- **Labels.** Distinguish confirmed requirements, product assumptions, research-supported findings and open questions. Product preferences and AI output are not evidence. Never claim certified level alignment or proven learning effectiveness.
- **Same-change updates.** UI → `DESIGN.md`. Prompts, reading aids, levels or tracking → the PED and language file, plus `PROMPT_VERSION`. Safeguards → `architecture/language-safeguards.md` and `data/language-safeguards.json`. Data or modules → the runtime doc.
- **Checks go in commits.** Tests run, screenshots inspected and what remains unverified go in the commit message. The device checklist lists checks only, never results, status or dates; no file accumulates a history of done and pending checks.
- **Evaluation evidence** gets a durable summary (method, results, limits) under `validation/`; raw outputs are archived to Git history and referenced by commit.
- **Plans are temporary.** Keep them in the conversation or PR; move lasting rationale into `DESIGN.md` or a PED once implemented.
- **Delete superseded docs** and fix inbound links in the same change.
- **Images** only when a kept document shows them.
- **Privacy.** Never record credentials, tokens, callback URLs, account or device identifiers.
