# LingoMage documentation

This directory contains product rationale, language decisions, research and
validation. The current App² workspace is at the repository root; the earlier
native Android implementation remains in `android/`.

The architecture documents for Android authentication, generation, furigana, and
text selection/reasoning preserve details of that earlier implementation. The
current workspace behavior is in [App² runtime migration](architecture/app2-runtime.md).
Dated validation records describe only the build and checks named in each record;
use the current validation status in the product and App² runtime documents.

## Product and learning design

- [Pedagogical decision log](pedagogy/README.md): Stable decision IDs, implementation links, evidence limits and maintenance template.
- [BibTeX bibliography](research/references.bib): Stable citation keys for indexed pedagogical decisions.
- [MVP specification](product/mvp.md): Shared requirements and delivery sequence.
- [Language decisions](languages/README.md): Language-specific requirements and research questions.
- [Research and evidence policy](research/README.md): How findings become documented design decisions.
- [Reading and glossing review](research/reading-and-glossing.md): Initial research records and applicability limits.
- [Japanese furigana discovery](research/japanese-furigana.md): Preliminary evidence and verification gaps.
- [Authentication architecture](architecture/authentication.md): Legacy Android sign-in and inference components.
- [Generation and local storage](architecture/generation.md): Legacy Android prompts, validation, persistence and failure behavior.
- [App² runtime migration](architecture/app2-runtime.md): Current runtime, workspace data and validation limits.
- [Furigana rendering](architecture/furigana.md): Legacy Android annotation structure, layout and accessibility.
- [Text selection and reasoning preferences](architecture/selection-and-reasoning.md): Earlier Android implementation details.
- [Physical-device checklist](validation/device-checklist.md): Legacy Android authentication gate and remaining manual checks.
- [Story implementation checks](validation/2026-10-09-stories.md): Historical Android build, device and generation outcomes.
- [Initial language samples](validation/sample-review.md): Historical sample review and limitations.
- [Initial implementation checks](validation/2026-10-09-authentication.md): Historical Android results and pending checks.

## Documentation conventions

Distinguish **confirmed requirements**, **proposed implementation**,
**research-supported findings**, and **open questions**. A product preference or
an AI-generated explanation is not research evidence.

Shared requirements belong in the product specification. Language-specific
learning, script, vocabulary, grammar, and reading decisions belong in the
corresponding language file. Technical implementation must respect both.

As implementation proceeds, add architecture decisions under `docs/architecture/`
and reproducible device checks and content reviews under `docs/validation/`.
Create those records when there is a concrete decision or result to document.
Do not label planned checks as completed validation.

Changes to generation prompts, reading aids, or difficulty rules should update
the affected language decisions and evidence records in the same change.
