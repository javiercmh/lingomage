# LingoMage documentation

This directory lives alongside `android/` so product rationale and learning
evidence can evolve independently of Android implementation details.

## Product and learning design

- [MVP specification](product/mvp.md): Shared requirements and delivery sequence.
- [Language decisions](languages/README.md): Language-specific requirements and research questions.
- [Research and evidence policy](research/README.md): How findings become documented design decisions.
- [Reading and glossing review](research/reading-and-glossing.md): Initial research records and applicability limits.
- [Japanese furigana discovery](research/japanese-furigana.md): Preliminary evidence and verification gaps.
- [Authentication architecture](architecture/authentication.md): Verified sign-in and inference components.
- [Generation and local storage](architecture/generation.md): Prompts, validation, persistence and failure behavior.
- [Furigana rendering](architecture/furigana.md): Annotation structure, layout and accessibility.
- [Physical-device checklist](validation/device-checklist.md): Authentication gate and remaining manual checks.
- [Story implementation checks](validation/2026-10-09-stories.md): Build, device and generation outcomes.
- [Initial language samples](validation/sample-review.md): Separate preliminary review and limitations.
- [Initial implementation checks](validation/2026-10-09-authentication.md): Actual results and pending checks.

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
