# LingoMage — Learn languages through stories

**Turn the words and ideas you want to practise into stories you want to read.** LingoMage creates AI stories for learners of German, Japanese, Russian and Spanish, with English explanations and adjustable difficulty.

LingoMage is an **[App²](https://github.com/javiercmh/appapp) subapp**: it runs inside App² on Android and uses its shared AI connection.

<img src="docs/images/reading-mode.jpg" width="640" alt="LingoMage reading mode showing a Japanese story with optional furigana and chapter controls">

*Japanese reading mode with sample text from the offline browser preview.*

## What you can do

- **Make it personal:** choose a topic, vocabulary, difficulty and language preferences.
- **Read comfortably:** adjust text size, toggle Japanese furigana and open word notes when needed.
- **Get contextual help:** select a passage and tap Explain for its English meaning and usage.
- **Shape the story:** add chapters with follow-up prompts or rewrite a chapter while keeping the original.
- **Read again offline:** save stories and explanations in your workspace.

## Get started

1. In App², tap **Import** and paste `https://github.com/javiercmh/lingomage`.
2. Connect an AI provider in the App² library under **Settings → AI**.
3. Open LingoMage, choose your language and model, and generate a story.

Difficulty and explanations are AI estimates, not certified proficiency assessments.

## For developers

Plain HTML, CSS and JavaScript; no dependencies or build step. Preview with Python 3.9+:

```sh
python3 dev_server.py --mock-ai
```

Open [localhost:8888](http://localhost:8888). The mock is offline; the server writes workspace files, so use a disposable copy for testing.

See the [runtime guide](docs/architecture/app2-runtime.md) and [pedagogical decisions](docs/pedagogy/README.md). The earlier Android app remains in [`android/`](android/) for reference.
