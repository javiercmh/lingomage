# App² packaging notes

This workspace is a plain HTML/CSS/JavaScript subapp. `manifest.json` lists the entry point and all files needed by App². Relative imports and JSON paths resolve from the subapp's isolated workspace.

## Data and language text

- `data/stories.json` contains saved story records, including language, canonical title and story, optional Japanese reading segments, glossary, vocabulary, topic, model, prompt version and creation time.
- `data/settings.json` stores the selected model and reasoning preference. ChatGPT credentials remain in App² and are not exposed to the subapp.
- Japanese `story` and `title` remain the canonical strings. `storySegments` and `titleSegments` add optional reading annotations for display. Copying uses canonical text and excludes readings.
- Russian output is expected in Cyrillic. English glossary meanings are retained for all four target languages.

## AI

The app imports `ai`, `readFile` and `writeFile` from `js/bridge.js`. It discovers providers and models at runtime, sends a versioned beginner-story instruction and selected words, validates the returned JSON shape and glossary coverage, saves completed stories locally, then acknowledges the completed request. Generation errors do not trigger automatic retries.

Connect ChatGPT through App² library **Settings → AI**. Browser preview uses only the explicitly enabled `--mock-ai` server response, which is a fixed sample and not evidence of translation quality or language pedagogy.

## Local preview

Run `python3 dev_server.py --mock-ai` from this workspace. The server binds to localhost and implements the starter file bridge so JSON data is saved to actual workspace files. Native Android behavior, App² safe-area insets and live inference are not validated by this preview.
