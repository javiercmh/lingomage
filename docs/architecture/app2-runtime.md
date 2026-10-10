# App² runtime migration

## Decision

The primary LingoMage runtime is now a plain-file App² subapp at the repository root. The previous Kotlin application remains under `android/` as historical implementation and source of product decisions. It is not automatically converted into an App² workspace.

The workspace uses the App² starter template's local development server and `js/bridge.js`. Native AI credentials, provider configuration and requests remain App²-owned. Users connect ChatGPT in the App² library's **Settings → AI**; LingoMage discovers the models available to that account.

## Current files and data

- `index.html`, `css/style.css`, and `js/app.js` implement the mobile-first interface and workflow without a build step.
- `js/bridge.js` is the starter bridge wrapper and is the only app module that touches host capabilities.
- `data/stories.json` stores saved stories and provenance: model, prompt version, selected words, topic, language, canonical story/title, glossary and reading annotations.
- `data/settings.json` stores model and reasoning selections and fixes the app appearance to light. GPT-6 Luna is the live model preference: the app resolves it against App²'s discovered model IDs/names and will ask for a manual choice instead of silently falling back if it is unavailable.
- `manifest.json` lists the App² workspace files.

Story generation calls the App² `ai` bridge and expects a JSON object with canonical `title` and `story`, optional exact-concatenating reading segments, and one English glossary item per selected word. The app checks the response shape and glossary coverage before presenting it. This is basic format validation; it does not establish semantic correctness, naturalness, level, or language quality. The former Android word-count and script validators are not yet reproduced in the App² implementation.

Japanese `story` and `title` are kept independently from `storySegments` and `titleSegments`. Display adds readings only from segment annotations whose text concatenates exactly to the canonical source. Copy uses canonical text. The model supplies readings, so reading correctness remains unverified.

## Local preview and limitations

Run `python3 dev_server.py --mock-ai` at the repository root. The server writes to actual `data/` files and returns a fixed, visibly labelled development response. It supports UI, bridge and persistence checks without external requests or plan usage. It does not prove live App² AI, runtime insets, installation shortcuts, native behavior, or target-language quality.

The development mock is deliberately a fixed sample and may not include requested vocabulary in its story body. Its glossary values and language text are fixtures, not validated learning material.

## Prompt and provenance

The App² prompt version is `2026-10-10.1`. It asks for simple beginner-oriented language, natural reuse of selected vocabulary, and a structured glossary. Saved records retain this version and the chosen model. Existing Android prompt assets and saved-story formats are left intact; migration/import of Android Room records is not implemented.

## Validation status

Local Python-server checks cover the App² workspace. Real generation and Japanese, German, Russian and Spanish (Chile) language review remain pending in App². No CEFR certification or learning-effectiveness claim is made.
