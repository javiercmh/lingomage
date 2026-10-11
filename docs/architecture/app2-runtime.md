# App² runtime migration

## Decision

The primary LingoMage runtime is now a plain-file App² subapp at the repository root. The previous Kotlin application remains under `android/` as historical implementation and source of product decisions. It is not automatically converted into an App² workspace.

The workspace uses the App² starter template's local development server and `js/bridge.js`. Native AI credentials, provider configuration and requests remain App²-owned. Users connect an AI provider in App² **Settings → AI**; LingoMage discovers connected providers and their available models.

## Current files and data

- `index.html`, `css/style.css`, and `js/app.js` implement the mobile-first interface and workflow without a build step. `js/reader-text.js` owns canonical text rendering, glossary-range matching and selection offsets; `js/request-lifecycle.js` owns save-before-acknowledgement sequencing.
- `js/bridge.js` is the only app module that touches host capabilities, including App² text-to-speech.
- `data/stories.json` stores saved stories and provenance: provider, model, prompt version, freeform practice text, topic, language, canonical story/title, glossary and reading annotations. New records add ordered chapters, alternate chapter versions and selection help attached to canonical offsets; old records are treated as one chapter in memory.
- `data/settings.json` stores provider, model, reasoning, per-target-language reading defaults, self-assessments language expectations, reader text-size and furigana preferences, and the dark appearance preference. Furigana is shown by default and can be hidden by choice. All languages start unselected. Selected target languages expand to show their profile controls. The main picker contains enabled target languages, or all target languages when none are enabled; stories can be generated for any language shown in the picker. The Story difficulty picker starts at the saved Reading starting point when available and allows a per-story override; see [PED-001](../pedagogy/PED-001-learner-self-report.md). GPT-6 Luna remains the preferred model where available; the app resolves it against the connected provider's discovered catalog and requires a manual choice if that preference is unavailable.
- `manifest.json` lists the App² workspace files.

Story generation calls the App² `ai` bridge and expects a JSON object with canonical `title` and `story`, optional exact-concatenating reading segments, and a glossary array of useful notes inferred from the optional freeform practice text. That one field can contain vocabulary, concepts such as grammar points, or both; the model interprets the text. Glossary meanings remain in English. Every request includes the selected story level, a language-specific reading self-report, and the learner’s optional self-assessment and language expectations. Expectations may specify regional variety, register, spelling, or other language preferences. Completed story records preserve the exact profile snapshot, selected story level and profile/prompt versions. The app checks the response shape before presenting it. This is basic format validation; it does not establish semantic correctness, naturalness, level, or language quality. The former Android word-count and script validators are not yet reproduced in the App² implementation.

Japanese `story` and `title` are kept independently from `storySegments` and `titleSegments`. Display adds readings only from segment annotations whose text concatenates exactly to the canonical source. Copy uses canonical text. The model supplies readings, so reading correctness remains unverified.

The reader is a focused full-screen view with chapter and version navigation, adjustable text, optional furigana, inline glossary notes, follow-up chapter generation and current-chapter rewrites. Completed stories are saved before the reader opens and before the AI result is acknowledged. Save or acknowledgement failures retain an explicit retry path and block further inference. Text selection offers Explain in the LingoMage toolbar. Explain uses canonical selection offsets and saves help against the exact story chapter version. In App², Copy and Speak remain in Android’s native selection menu; the host supplies the selected text’s inherited BCP 47 language to Android’s configured speech engine. Spoken text follows the WebView selection, while explanations use canonical text that excludes ruby readings. Explanation selection starts with a long press, uses compact checkboxes and a sticky count/delete/check toolbar, and exits when the final item is deselected. Explain focuses on the exact selection, with canonical sentence-relative UTF-16 offsets identifying its occurrence. Context clarifies the fragment or word without becoming a full-sentence lesson. The profile silently adapts wording; explanations omit learner difficulty judgments. The card displays a relevant source excerpt with the selected occurrence highlighted, an optional context translation, and one short explanatory paragraph. More detail opens an optional one-line question before inference; Generate examples directly requests three sentences demonstrating the same contextual function. Follow-ups include previous explanations and preserve their action type, question and response in an additive `followUps` array with individual provenance. Legacy `more` and `detailProvenance` remain readable. Help snapshots the reading profile and is saved with its source chapter version. See [PED-002](../pedagogy/PED-002-contextual-reading-support.md).

## Local preview and limitations

Run `python3 dev_server.py --mock-ai` at the repository root. The server writes to actual `data/` files and returns a fixed, visibly labelled development response. It supports UI, bridge and persistence checks without external requests or plan usage. It does not prove live App² AI, runtime insets, installation shortcuts, native behavior, or target-language quality.

The development mock is deliberately a fixed sample and may not include requested vocabulary in its story body. Its glossary values and language text are fixtures, not validated learning material.

## Prompt and provenance

The App² prompt version is `2026-10-11.7`. It uses the selected story level, learner self-assessment and optional language expectations to adapt stories. These descriptions guide generation; they are not validated proficiency measures. Spanish is presented generically and has no assumed regional variety; learners can specify one in Settings. Saved records retain the prompt/profile versions and the selected profile snapshot. Reader explanations and examples retain their JSON response contracts; More detail returns plain text, while the decoder also reads legacy JSON detail responses. Existing Android prompt assets and saved-story formats are left intact; migration/import of Android Room records is not implemented.

## Validation status

The last recorded local preview and device import checks are in
[the 2026-10-10 validation record](../validation/2026-10-10-app2.md). That check
predates the latest UI redesign and single-field practice input; those changes
have not been revalidated. Real generation and Japanese, German, Russian and
Spanish language review remain pending in App². No CEFR certification or
learning-effectiveness claim is made.

When no learning languages are selected, the Create screen offers a dismissible Settings prompt to help learners tailor stories. All target languages remain available and generation stays enabled. Dismissal is saved as `languageSetupDismissed` in `data/settings.json` and persists across reloads. This personalization guidance is a product assumption, not a claim of proven learning results.

Navigation follows the App² starter: a fixed bottom bar with icons above Create and My stories labels, an accent-colored active page, safe-area spacing, and keyboard visibility handling. Content and toasts reserve space above the bar.

Reader requests capture their destination story/chapter/version and model before inference. A completed result remains in page memory if persistence fails, blocks further inference, and offers an explicit save retry when its story is reopened. After a durable save, acknowledgement failures offer a release retry without reapplying or regenerating content. Unsaved completed results are not recovered after page recreation; keep the page open to retry. Reading locations (chapter and actual reader-panel scroll offset) survive closing and reopening within the same page session.

Shared visual rules are recorded in [DESIGN.md](../../DESIGN.md), based on the App² starter and host palette. The reader groups chapter and reading controls, uses separate explanation cards, and collapses story actions.

Focused explanations and steered follow-ups were checked in the deterministic browser preview; see [focused-help validation](../validation/2026-10-11-focused-help.md). This does not validate live model language quality or Android behavior.

## Contextual-help response contract

Selection requests use `action: initial | detail | examples`, full canonical `sourceText`, absolute zero-based UTF-16 `start`/`end` (end exclusive), the exact passage, sentence-relative offsets, learner context and prior help. The initial response is `{contextStart, contextEnd, contextTranslation?, explanation}`. Context boundaries are absolute offsets into `sourceText`; the app copies and highlights canonical text rather than accepting an AI quotation. Invalid or non-containing boundaries fall back to the containing sentence and discard the context translation. The explanatory paragraph is separate from the optional translation.

Detail returns `{explanation}`. Examples returns exactly three records in `{examples: [{sentence, translation, highlightStart, highlightEnd, segments?}]}`. Highlight offsets reference each example's canonical sentence. Empty content, invalid ranges (including split surrogate pairs), and annotations that do not concatenate exactly to the sentence are rejected without silent inference retries. Japanese example readings are separate segment annotations. Copy from source excerpts and examples excludes readings; the furigana preference applies to both.

New help records preserve context boundaries/translation and the concise paragraph in `text`. Additive `followUps` records distinguish `detail` and `examples`, retaining the question, text or structured examples and per-response provenance. Earlier untyped follow-ups and legacy `more` remain detail; no existing explanation is rewritten. Latest-detail compatibility fields remain available to older readers. The development fixtures are inspectable in `data/reader-help-fixtures.json`, shipped as a managed file; they demonstrate a specific selection per language and make no inference. Unsupported selections display a fixture limitation rather than pretending to have an explanation.
