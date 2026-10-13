# App² runtime migration

## Current level-guided generation (2026-10-13)

[PED-004](../pedagogy/PED-004-level-guided-generation.md) supersedes older profile/length descriptions below. Settings use a standardized Reading level per language and separate Language preferences; the freeform knowledge field is removed from new requests. German/Spanish use CEFR A1–C2, Japanese JLPT N5–N1, Russian Elementary/Basic/TORFL-I–IV. Labels guide reading, not certification or assessment.

`standardizedLevels` is a per-language map in settings, separate from legacy `targetLanguages` enablement/defaults and retained `learnerProfiles`. No guessed migration converts old bands. Create and reader edits require an explicit standard level. Reading scope is scene/chapter/longer, default scene, with no numerical story-length quotas.

The first AI request returns up to five vocabulary candidates, two grammar focuses and guidance; the second returns canonical story/title, segments and glossary. Plans are optional practice guidance, not mandatory coverage or known-word inventories. Both use the same frozen level, brief, preferences and narrative context. Continuation/rewrite retain bounded narrative memory before planning. There is no reader-feedback feature.

`generationJob` in settings holds one immutable input/config/instruction snapshot, stage request IDs and response checkpoints, stable story/version/chapter IDs, source path context, and prompt/profile versions. Plan is saved before acknowledgement; final response is checkpointed and remains unacknowledged until story/version data is persisted in stories. Resume reuses checkpoints; explicit failed-stage retry releases the failed request before another inference. Changed inputs require discard/new generation. Cancellation does not silently retry. New versions include languagePlan, framework, difficulty, scope and learnerContext provenance. Legacy records remain readable. Japanese annotation reconstruction/kana readings, glossary occurrences and Cyrillic requirements are structural checks; they do not prove level, meaning or naturalness.

The App² prompt version is 2026-10-13.13. Local mock fixtures are deterministic and do not simulate standardized-level differences. Domain records remain in inspectable JSON and host API calls remain in the bridge.

## Decision

The primary LingoMage runtime is now a plain-file App² subapp at the repository root. The previous Kotlin application remains under `android/` as historical implementation and source of product decisions. It is not automatically converted into an App² workspace.

The workspace uses the App² starter template's local development server and `js/bridge.js`. Native AI credentials, provider configuration and requests remain App²-owned. Users connect an AI provider in App² **Settings → AI**; LingoMage discovers connected providers and their available models.

## Current files and data

- `index.html`, `css/style.css`, and `js/app.js` implement the mobile-first interface and workflow without a build step. `js/reader-text.js` owns canonical text rendering, glossary-range matching and selection offsets; `js/request-lifecycle.js` owns save-before-acknowledgement sequencing.
- `js/bridge.js` is the only app module that touches host capabilities, including App² text-to-speech.
- `data/stories.json` stores saved stories and provenance: provider, model, prompt version, freeform practice text, topic, language, canonical story/title, glossary and reading annotations. New records add ordered chapters, alternate chapter versions and selection help attached to canonical offsets; old records are treated as one chapter in memory.
- `data/settings.json` stores provider, model, reasoning, language enablement, standardized reading-level selections, retained legacy self-assessments, generation checkpoints, language expectations, reader text-size and furigana preferences, and the dark appearance preference. Furigana is shown by default and can be hidden by choice. All languages start unselected. Selected target languages expand to show their profile controls. The main picker contains enabled target languages, or all target languages when none are enabled; stories can be generated for any language shown in the picker. The Reading level picker starts at the saved standardized selection and allows a per-story override; see [PED-004](../pedagogy/PED-004-level-guided-generation.md). GPT-6 Luna remains the preferred model where available; the app resolves it against the connected provider's discovered catalog and requires a manual choice if that preference is unavailable.
- `manifest.json` lists the App² workspace files.

Story generation calls the App² `ai` bridge and expects a JSON object with canonical `title` and `story`, optional exact-concatenating reading segments, and a glossary array of useful notes inferred from the optional freeform practice text. The Create view labels the saved `practice` field Topics to explore: it accepts vocabulary domains, communication situations, grammar concepts, or specific expressions. The saved `topic` field is a multiline story brief including premise, genre, tone or format. Existing records keep these fields without migration. Glossary meanings remain in English. Every new generation request includes the self-selected reading target, its descriptor, narrative scope and language preferences; writing also receives the saved language plan. Expectations may specify regional variety, register, spelling, or other language preferences. Completed story records preserve the exact profile snapshot, selected story level and profile/prompt versions. The app checks the response shape before presenting it. This is basic format validation; it does not establish semantic correctness, naturalness, level, or language quality. The current App² validates exact glossary occurrences, Japanese annotation reconstruction/kana readings, and Cyrillic requirements; it does not enforce historical Android word counts.

Japanese `story` and `title` are kept independently from `storySegments` and `titleSegments`. Display adds readings only from segment annotations whose text concatenates exactly to the canonical source. Copy uses canonical text. The model supplies readings, so reading correctness remains unverified.

The reader is a focused full-screen view with chapter and story-path navigation, adjustable text, optional furigana, inline glossary notes, follow-up chapter generation and current-chapter rewrites. Completed stories are saved before the reader opens and before the AI result is acknowledged. Save or acknowledgement failures retain an explicit retry path and block further inference. Text selection offers Explain in the LingoMage toolbar. Explain uses canonical selection offsets and saves help against the exact story chapter version. In App², Copy and Speak remain in Android’s native selection menu; the host supplies the selected text’s inherited BCP 47 language to Android’s configured speech engine. Spoken text follows the WebView selection, while explanations use canonical text that excludes ruby readings. Explanation selection starts with a long press, uses compact checkboxes and a sticky count/delete/check toolbar, and exits when the final item is deselected. Explain focuses on the exact selection, with canonical sentence-relative UTF-16 offsets identifying its occurrence. Context clarifies the fragment or word without becoming a full-sentence lesson. The profile silently adapts wording; explanations omit learner difficulty judgments. The card displays a relevant source excerpt with the selected occurrence highlighted, an optional context translation, and one short explanatory paragraph. More detail opens an optional one-line question before inference; Generate examples directly requests three sentences demonstrating the same contextual function. Follow-ups include previous explanations and preserve their action type, question and response in an additive `followUps` array with individual provenance. Legacy `more` and `detailProvenance` remain readable. Help snapshots the reading profile and is saved with its source chapter version. See [PED-002](../pedagogy/PED-002-contextual-reading-support.md).

## Local preview and limitations

Run `python3 dev_server.py --mock-ai` at the repository root. The server writes to actual `data/` files and returns a fixed, visibly labelled development response. It supports UI, bridge and persistence checks without external requests or plan usage. It does not prove live App² AI, runtime insets, installation shortcuts, native behavior, or target-language quality.

The development mock deliberately repeats a fixed sample according to scope and may not include requested vocabulary in its story body. Its glossary values and language text are fixtures, not validated learning material.

## Prompt and provenance

The App² prompt version is `2026-10-13.13`. It uses standardized self-selected reading targets, language plans and optional language preferences to guide stories. These descriptions guide generation; they are not validated proficiency measures. Spanish is presented generically and has no assumed regional variety; learners can specify one in Settings. Saved records retain the prompt/profile versions and the selected profile snapshot. Reader explanations and examples retain their JSON response contracts; More detail returns plain text, while the decoder also reads legacy JSON detail responses. Existing Android prompt assets and saved-story formats are left intact; migration/import of Android Room records is not implemented.

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

### Story creation refinements (prompt `2026-10-11.9`)

Initial generation, continuation and rewrite share language, narrative scope, standardized reading target, planning, annotations, glossary and narrative-ending guidance. Reader requests include the original `topic` and `practice` (with legacy `words` fallback), current learner profile and chapter context. Every output requests fresh English glossary notes with exact forms from that output. The reader uses the displayed version’s own glossary. Chapters advance the narrative and leave a natural unresolved thread unless the learner explicitly requests closure; this is prompt guidance, not deterministic semantic validation. Continuations remain separate chapters and rewrites remain alternate versions.

Reader generation has an action-specific cancellable status card bound to its story; editing is locked until completion and failures retain the prompt. Vocabulary popovers offer native Listen for the displayed canonical headword through the existing locale/voice helper. Browser playback remains unavailable. Initial saved story inputs use the request snapshot. Older records and their provenance are unchanged.

The offline mock now returns matching glossary fixtures across all four languages and all story request kinds. Fixed samples do not validate narrative quality, vocabulary selection, requested genre, or open endings.

Prompt `2026-10-11.10` accepts empty/whitespace chapter prompts, trims them to an empty string and preserves that value in provenance. Blank continuation advances naturally; blank rewrite retells the same main events. Settings uses `settingsDescriptions` for concise display copy, while full `languages` descriptions continue to supply generation context and saved self-report snapshots. No migration or saved-story provenance change is needed.


## Narrative memory and paths (PED-003)

Prompt `2026-10-11.11` removes full-history generation fields and duplicated concatenated context. Follow-up input includes `storyMemory`, `recentProse`, optional rewrite-only `currentChapter`, the original topic/practice, learner profile and prompt. `summary` uses the managed AI bridge and returns arrays of strings under `characters`, `facts`, `plot`, `unresolved`, `uncertainties`, and `situation`. Canonical chapter text is consumed sequentially in chunks of at most 8,000 UTF-16 characters. Serialized memory is capped at 12,000 characters. Recent prose is complete up to 8,000 characters, otherwise at most the final 4,000 characters with a preferred sentence boundary. Character limits do not guarantee a token budget; rewrite deliberately includes the complete revision source.

Additive story fields: `paths` contains `{id, name, entries:[{chapterId, versionId}], forkChapter?, parentPathName?, uncertain?}`; `activePathId` selects the displayed history. `memories` contains validated structured memory, a cache key composed of memory/prompt versions, exact version lineage and chunk index, and provider/model/time provenance. New chapter versions also record `contextLineage` and `memoryVersion`. Existing chapter/version/help storage is retained. No user file is replaced and no bulk migration runs. Legacy predecessor links reconstruct paths lazily; missing links produce a visible continuity warning. Version IDs represent immutable prose.

Summarization checkpoints and prose each use save-before-acknowledgement and explicit save/release recovery. Sequential stages stop on cancellation, malformed response, save failure or acknowledgement failure. Retry reuses persisted checkpoints. AI configuration is captured at the start of the follow-up so settings changes cannot alter provenance during its stages. The deterministic summary mock exercises the contract only and does not model semantic summarization. Model fidelity and native App² behavior remain pending. See [PED-003](../pedagogy/PED-003-story-memory-and-paths.md).


## Reader content management

Story actions removes the displayed chapter and all later entries only from the selected path, or deletes a complete selected path. Removing Chapter 1 maps to path deletion; deleting the final path maps to the existing whole-story deletion flow. A confirmation snapshots the path ID and entries, and rejects stale references or pending inference/save/release work. No AI request is made for removal.

Build a candidate story, prune chapter versions and their version-scoped help/follow-ups only when unreferenced by surviving paths, and prune memory checkpoints unless their exact lineage remains a prefix of a surviving path. Preserve shared content. Refresh legacy root prose/annotation/glossary/provenance mirrors from the first chapter of the remaining selected path. Save the complete candidate once; restore the original story on failure. Only after success clear invalid reading positions/drafts and update navigation. Whole-story removal clears the reader/current-story fallback before closing to My stories.

`nextAlternateNumber` is an additive persistent counter, initialized from existing path names without bulk migration and never reduced by deletion. Rewrites record `parentPathId` alongside the existing parent name. A fork note omits references to a parent no longer present; truncation before the fork clears its metadata. Removing an original path does not rename remaining alternatives. Generation instructions and prompt version remain unchanged for these management controls. See [PED-003](../pedagogy/PED-003-story-memory-and-paths.md) and [validation](../validation/2026-10-12-reader-management.md).

Glossary validation uses all exact occurrences from `findGlossaryMatches`. Rendering separately uses `firstGlossaryMatches`: after overlap resolution, it retains only previously unseen NFC/whitespace-normalized headword/meaning identities in text order. No saved schema changes or migration are needed. Cross-annotation fragments share the primary popup trigger and keyboard focus. Story Cancel buttons call the durable cancellation helper even before a request ID returns; the stage runner checks intent after starting and before handoff. The host's atomic start/request-ID persistence gap remains a platform limitation.
