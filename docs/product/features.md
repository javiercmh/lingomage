# Features and scope

What LingoMage does now, its confirmed requirements and its defaults. Interaction details: [`DESIGN.md`](../../DESIGN.md). Rationale and evidence: [pedagogy log](../pedagogy/README.md). Long-term research directions: [future directions](future-directions.md).

## Learner-facing features

| Area | Feature | Decision |
| --- | --- | --- |
| Create | Story from one optional idea-and-topics brief (any language mix), level and scope | [PED-002](../pedagogy/PED-002-contextual-reading-support.md), [PED-004](../pedagogy/PED-004-level-guided-generation.md) |
| Levels | One self-selected standardized reading level per language, per-story override | [PED-004](../pedagogy/PED-004-level-guided-generation.md) |
| Reader | Canonical text, furigana (Japanese), text size, vocabulary notes at first occurrence | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Help | Explain a selection, More detail, examples, device Translate, Speak | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Listening | Chapter listening with a sentence player | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Story growth | Continue, Rewrite as alternate paths, remove chapters or paths, rebuild derived story memory from saved chapters | [PED-003](../pedagogy/PED-003-story-memory-and-paths.md) |
| Library | Local stories, latest-activity hero, sort, language filter, bulk delete | `DESIGN.md` (navigation only) |
| Profile | Time in LingoMage, Most looked up with detail sheet, language list and levels | [PED-005](../pedagogy/PED-005-consultation-signals.md) |
| Recovery | Checkpointed generation with explicit Resume, Retry, Discard | [runtime](../architecture/generation-pipeline.md#generation) |

Stories can be shared from the reader or Library: canonical chapter or selected-path whole-story text, with optional vocabulary notes, or a complete JSON story file. Native sharing falls back to copying text; browser story files download. Story-file import is not available yet.

## Confirmed requirements

- Target languages German, Japanese, Russian and Spanish; English interface and English notes for all.
- Language-specific presentation rather than one template ([languages](../languages/README.md)): Japanese furigana above kanji by default and no romaji; Russian Cyrillic without transliteration; Spanish broadly understandable unless the learner requests a variety. No full-story translation.
- AI only through App²'s managed connection; providers and accounts belong to the App² library.
- Everything is saved locally on the device in inspectable JSON.
- No learning languages are enabled at first. Create then shows a dismissible prompt (Open Profile) and still allows generation, but always requires an explicit level. Dismissal persists as `languageSetupDismissed`.

- In-app generation cancellation discards the unfinished attempt and retains form inputs. External interruptions preserve completed steps for explicit recovery. Failed cancellation cleanup remains visible and retryable without inference.

## Defaults (product assumptions)

- Scope Scene (default) or Chapter; no numeric length quotas.
- Language plan of up to five vocabulary candidates and two grammar focuses, possibly none.
- Notes for most meaningful words and expressions, no density cap.
- Reasoning choices only where the provider advertises them, plus provider default; higher reasoning may add latency and usage. Model and reasoning are stored in `data/settings.json`, not per account.
- Background story context (Settings → Story memory, on by default): each new chapter's story memory is summarized while the learner reads, so Continue usually starts with planning. Costs one AI request per new chapter, also when never continued.
- Existing Spanish stories keep `es-CL`; new ones honor the requested variety.

Never claim certified CEFR/JLPT/TORFL alignment, map one framework to another, or claim proven learning effectiveness. Model-suggested vocabulary and difficulty are estimates.

## Not in scope

- **Deferred features:** images, cloud sync, more languages.
- **Research candidates** (not commitments): retrieval or spaced review, reuse across stories, contextual instruction, story-linked listening, writing or speaking tasks, learner-language feedback, an in-app evaluation capability. They need evidence review, language review, usability checks and the [evaluation gates](../evaluation/learning-evaluation-plan.md#evaluation-gates) before any learning claim. Intended outcomes: [learning evaluation plan](../evaluation/learning-evaluation-plan.md).
- **Formal learning trials** have not been run.
