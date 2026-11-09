# LingoMage documentation

Two audiences: coding agents changing the app (start at [`AGENTS.md`](../AGENTS.md)) and a future paper about the app's methods. Retired material lives only in Git history.

## Map

The full catalog, with what each file contains and when to read it, is in [`AGENTS.md`](../AGENTS.md#where-to-look). Folders:

| Folder | Holds |
| --- | --- |
| [architecture/](architecture/overview.md) | How the app works: overview, data and storage, generation pipeline, learner tracking, safeguards |
| [pedagogy/](pedagogy/README.md) | Pedagogical decisions (PED-NNN): why the app teaches the way it does |
| [research/](research/README.md) | Evidence reviews and `references.bib` |
| [languages/](languages/README.md) | Per-language rules |
| [product/](product/features.md) | Current features and future directions |
| [evaluation/](evaluation/learning-evaluation-plan.md) | Learning evaluation plan, Android checklist, generation tests |

For a paper: decisions and rationale in `pedagogy/`, evidence in `research/`, methods and results of model and prompt tests in `evaluation/generation-tests/`, planned learning evaluation in `evaluation/learning-evaluation-plan.md`, system description in `architecture/`.

## Policy

**Docs hold decisions, evidence and current rules, not activity.** A file earns its place if a future contributor or paper author needs it.

- **Current state, concise.** Describe how things are now, one purpose per file, rules stated directly. Do not repeat a rule held elsewhere; link it. Replace outdated text instead of appending dated sections; Git is the archive.
- **Methodological record.** PEDs and research reviews keep every decision, its rationale, citation keys with DOIs, study characteristics, access levels and stated limits, plus a one-line decision history per material change. Condense wording, never evidence.
- **Labels.** Distinguish confirmed requirements, product assumptions, research-supported findings and open questions. Product preferences and AI output are not evidence. Never claim certified level alignment or proven learning effectiveness.
- **Same-change updates.** UI → `DESIGN.md`. Prompts, reading aids, levels or tracking → the PED and language file, plus `PROMPT_VERSION`. Safeguards → `architecture/language-safeguards.md` and `data/language-safeguards.json`. Data, modules, pipeline or tracking → the matching `architecture/` file.
- **Checks go in commits.** Tests run, screenshots inspected and what remains unverified go in the commit message. The Android checklist lists checks only, never results, status or dates; no file accumulates a history of done and pending checks.
- **Evaluation evidence** gets a durable summary (method, results, limits) under `evaluation/`; raw outputs are archived to Git history and referenced by commit.
- **Plans are temporary.** Keep them in the conversation or PR; move lasting rationale into `DESIGN.md` or a PED once implemented.
- **Delete superseded docs** and fix inbound links in the same change.
- **Images** only when a kept document shows them.
- **Privacy.** Never record credentials, tokens, callback URLs, account or device identifiers.
