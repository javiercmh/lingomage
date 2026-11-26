# Features and scope

What LingoMage does now, its confirmed requirements and its defaults. Interaction details: [`DESIGN.md`](../../DESIGN.md). Rationale and evidence: [pedagogy log](../pedagogy/README.md). Long-term research directions: [future directions](future-directions.md).

## Learner-facing features

| Area | Feature | Decision |
| --- | --- | --- |
| Create | Story from one optional idea-and-topics brief (any language mix), level and scope | [PED-002](../pedagogy/PED-002-contextual-reading-support.md), [PED-004](../pedagogy/PED-004-level-guided-generation.md) |
| Levels | One self-selected standardized reading level per language, per-story override | [PED-004](../pedagogy/PED-004-level-guided-generation.md) |
| Reader | Canonical text, furigana (Japanese), text size, vocabulary notes at first occurrence | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Help | Explain a selection, Define a word as a saved vocabulary note, More detail, edit and delete saved follow-up questions, examples, device Translate, Speak | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Listening | Chapter listening with a sentence player | [PED-002](../pedagogy/PED-002-contextual-reading-support.md) |
| Story growth | Continue, Rewrite as alternate paths, remove chapters or paths, rebuild derived story memory from saved chapters | [PED-003](../pedagogy/PED-003-story-memory-and-paths.md) |
| Library | Local stories, latest-activity hero, sort, language filter, bulk delete | `DESIGN.md` (navigation only) |
| Profile | Time in LingoMage, Most looked up with detail sheet, language list and levels | [PED-005](../pedagogy/PED-005-consultation-signals.md) |
| Recovery | Checkpointed generation with explicit Resume, Retry, Discard | [runtime](../architecture/generation-pipeline.md#generation) |
| Waiting | Time left while running, estimated from earlier chapters on this device; opt-in ready notification | [runtime](../architecture/generation-pipeline.md#timing-and-estimates) |

Stories can be shared from the reader or Library: canonical chapter or selected-path whole-story text, with optional vocabulary notes, or a complete JSON story file. The Share sheet offers each action directly: Share or Save backup of the story file, and Copy or Share chapter or whole-story text. A story file is never copied. Library → Import story… adds a shared story file back as a new story, never replacing an existing one.

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
- Notes only for words and fixed expressions likely to be difficult for a learner just starting the selected level, noting doubtful words (never free word combinations), no density cap.
- Reasoning choices only where the provider advertises them, plus provider default; higher reasoning may add latency and usage. Model and reasoning are stored in `data/settings.json`, not per account.
- Settings → Story writer shows suggested ChatGPT models as reference: GPT-6.2 Sol at low effort for stories (preselected on first use when offered) and GPT-6 Luna at low effort for light tasks. Specific AI options sit in a collapsed Advanced section.
- Retry failed steps automatically (Advanced, on by default): a failed step (unreadable or invalid reply, provider or network error, timeout) is resent automatically, at most three times per step or part, with a notice each time; never after a rate limit. After that, Retry is explicit.
- Vocabulary notes amount (Settings → Vocabulary notes, default Standard): Fewer notes only likely difficult words; Standard aims for near-complete support for a learner who has just started the level, noting nearly every content word at A1/N5 and fewer common words at higher levels; More notes every content word and fixed expression except closed-class grammar words. Applies to chapters started afterwards; see PED-002.
- Reading while notes are written: a new story, chapter or branch opens once its opening paragraph has notes (and, for Japanese, furigana; the rest of the furigana arrives with each block's notes); vocabulary notes appear as their parts finish, with progress and Cancel in the status bar. Define works meanwhile; a Define note stays and wins over a generated note for the same occurrence.
- Rebuild vocabulary notes (reader ⋮ menu): rewrites the notes of the chapter version being read with the current Vocabulary notes amount and notes model, keeping notes added with Define; text, readings and explanations stay.
- Split vocabulary notes (Settings → Advanced, on by default): long chapters get notes in paragraph parts of about 1,000 UTF-16 units (400 for Japanese), at most 8, plus a short lead part for the opening paragraph of a new chapter, each with the whole chapter as context. Off gives one notes request. Allow concurrent requests (Settings → Advanced, on by default) runs up to six parts at once; off runs them one at a time. Rate limits stop with saved parts and explicit Resume; they are never retried automatically.
- Light model (Settings → AI models, a collapsed row, default Same as story model): a second model and effort, with **Use it for** checkboxes choosing its tasks: vocabulary notes (including Define), Japanese readings, story context summaries and condensing (on by default), explanations and follow-ups, and examples (off by default). Language plans and story prose always use the story model. A light model the provider no longer offers falls back to the story model; changing provider clears it.
- Background story context (Settings → Story memory, on by default): each new chapter's story memory is summarized while the learner reads, so Continue usually starts with planning. Costs one AI request per new chapter, also when never continued.
- Existing Spanish stories keep `es-CL`; new ones honor the requested variety.

Never claim certified CEFR/JLPT/TORFL alignment, map one framework to another, or claim proven learning effectiveness. Model-suggested vocabulary and difficulty are estimates.

## Not in scope

- **Deferred features:** images, cloud sync, more languages.
- **Research candidates** (not commitments): retrieval or spaced review, reuse across stories, contextual instruction, story-linked listening, writing or speaking tasks, learner-language feedback, an in-app evaluation capability. They need evidence review, language review, usability checks and the [evaluation gates](../evaluation/learning-evaluation-plan.md#evaluation-gates) before any learning claim. Intended outcomes: [learning evaluation plan](../evaluation/learning-evaluation-plan.md).
- **Formal learning trials** have not been run.
