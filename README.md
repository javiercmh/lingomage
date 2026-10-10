# LingoMage

LingoMage creates beginner-oriented stories from selected vocabulary in **German, Japanese, Russian and Spanish (Chile)**. The interface and glossary are in English. Generated stories can be saved locally and read offline.

The current app is an App² workspace implemented with plain HTML, CSS and JavaScript. The earlier Android Studio application remains in [`android/`](android/) as reference source; it is no longer the primary runtime.

## Run in a browser

Python 3.9+ is required; no packages or build step are needed.

```sh
python3 dev_server.py --mock-ai
```

Open [http://localhost:8888](http://localhost:8888). The offline mock returns sample stories and does not use ChatGPT. Files in `data/` are read and written by the server.

## Run in App²

Import this directory as a workspace in App² or create a subapp from the included files. Connect ChatGPT in the App² library under **Settings → AI** to generate live stories. The app discovers available models and saves stories and model preferences in editable JSON files.

See [App² runtime and migration notes](docs/architecture/app2-runtime.md), the [MVP](docs/product/mvp.md), [language decisions](docs/languages/README.md), and [evidence limits](docs/research/README.md).

Developers changing learning behavior should start with the [pedagogical decision log](docs/pedagogy/README.md). It links decisions to evidence, implementation and a shared [BibTeX bibliography](docs/research/references.bib).

Generated difficulty is an estimate, not certified CEFR alignment or evidence that LingoMage improves retention. The offline mock is for UI and persistence checks, not language review.
