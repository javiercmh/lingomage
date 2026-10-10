# App² runtime migration

## Decision

The primary LingoMage runtime is now a plain-file App² subapp at the repository root. The previous Kotlin application remains under `android/` as historical implementation and source of product decisions. It is not automatically converted into an App² workspace.

The workspace uses the App² starter template's local development server and `js/bridge.js`. Native AI credentials, provider configuration and requests remain App²-owned. Users connect an AI provider in App² **Settings → AI**; LingoMage discovers connected providers and their available models.

## Current files and data

- `index.html`, `css/style.css`, and `js/app.js` implement the mobile-first interface and workflow without a build step.
- `js/bridge.js` is the starter bridge wrapper and is the only app module that touches host capabilities.
- `data/stories.json` stores saved stories and provenance: provider, model, prompt version, freeform practice text, topic, language, canonical story/title, glossary and reading annotations.
- `data/settings.json` stores provider, model, reasoning, fluent-language selections, per-target-language reading defaults and learner knowledge descriptions, and the dark appearance preference. The main picker contains enabled target languages; its story-level picker starts at that language’s saved reading default and allows a per-story override. GPT-6 Luna remains the preferred model where available; the app resolves it against the connected provider's discovered catalog and requires a manual choice if that preference is unavailable.
- `manifest.json` lists the App² workspace files.

Story generation calls the App² `ai` bridge and expects a JSON object with canonical `title` and `story`, optional exact-concatenating reading segments, and a glossary array of useful notes inferred from the optional freeform practice text. That one field can contain vocabulary, concepts such as grammar points, or both; the model interprets the text. Fluent-language preferences are passed as context for explanations, while glossary meanings remain in English. Every request includes the selected story level, a language-specific reading self-report, and the learner’s optional knowledge description. Completed story records preserve the exact profile snapshot, selected story level and profile/prompt versions. The app checks the response shape before presenting it. This is basic format validation; it does not establish semantic correctness, naturalness, level, or language quality. The former Android word-count and script validators are not yet reproduced in the App² implementation.

Japanese `story` and `title` are kept independently from `storySegments` and `titleSegments`. Display adds readings only from segment annotations whose text concatenates exactly to the canonical source. Copy uses canonical text. The model supplies readings, so reading correctness remains unverified.

## Local preview and limitations

Run `python3 dev_server.py --mock-ai` at the repository root. The server writes to actual `data/` files and returns a fixed, visibly labelled development response. It supports UI, bridge and persistence checks without external requests or plan usage. It does not prove live App² AI, runtime insets, installation shortcuts, native behavior, or target-language quality.

The development mock is deliberately a fixed sample and may not include requested vocabulary in its story body. Its glossary values and language text are fixtures, not validated learning material.

## Prompt and provenance

The App² prompt version is `2026-10-10.5`. It uses the selected story level and the learner’s saved reading profile to adapt vocabulary, grammar and English glossary support. These descriptions guide story generation; they are not validated proficiency measures. Saved records retain the prompt/profile versions and the selected profile snapshot. Existing Android prompt assets and saved-story formats are left intact; migration/import of Android Room records is not implemented.

## Validation status

Local Python-server checks cover the App² workspace. Real generation and Japanese, German, Russian and Spanish (Chile) language review remain pending in App². No CEFR certification or learning-effectiveness claim is made.

## Reading self-report

Settings define three reading starting points per language in `data/learning-profiles.json`, along with an optional knowledge description saved in `data/settings.json`. Japanese assumes hiragana and katakana literacy; Russian assumes Cyrillic literacy. The learner can revise these descriptions as they progress. Choosing a different story level leaves the saved reading self-report intact. The evidence and limits are recorded in [self-assessment research](../research/self-assessment.md).
