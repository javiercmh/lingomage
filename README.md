# LingoMage

Android application project. The Android Studio project lives in `android/`.

LingoMage creates short beginner stories for **German, Japanese, Russian,
and Spanish (Chile)**, with an **English interface and English glossary**. Choose or edit
5–10 words, confirm them, and generate a story using your connected ChatGPT plan.
Stories save locally for offline reading, language filtering, deletion, and reuse.
Japanese titles and stories show kana readings above kanji by default; Russian
uses Cyrillic without transliteration. Account and model controls are in Settings.

Physical-device sign-in and completed inference passed on 2026-10-09. Review the
[validation records](docs/README.md) for actual checks and remaining limitations.
Generated difficulty is an estimate, not certified CEFR alignment or evidence that
LingoMage improves retention. Documentation distinguishes research from product assumptions.

## Repository structure

- `android/`: Android application, build configuration, and tests.
- [`docs/`](docs/README.md): Product requirements, research evidence, and design decisions.
- [`docs/languages/`](docs/languages/README.md): Separate learning and presentation decisions for each featured language.

Start with the [MVP specification](docs/product/mvp.md) and the
[evidence documentation policy](docs/research/README.md).

## Getting started

1. Open the `android/` directory in Android Studio.
2. Install the Android SDK components requested by the project and let Gradle sync.
3. Run the `app` module on an emulator or connected Android device.

Android Studio creates `android/local.properties` for your local SDK path. This file, build outputs, IDE state, and signing keys are excluded from Git.

## Command-line build

With a compatible Java installation and the Android SDK configured:

```sh
cd android
./gradlew assembleDebug
./gradlew testDebugUnitTest
./gradlew lintDebug
```

Use the Android Studio JDK (JDK 25 for the current Gradle daemon configuration)
and the installed Android SDK. Minimum supported Android version is API 26.
The sign-in test uses the system browser and requires an eligible account with
ChatGPT plan permission. Native Android compatibility must be validated on a
physical device; a successful build alone does not establish it.

## Push to GitHub

Create an empty GitHub repository without adding a README, license, or `.gitignore`, then run these commands from the repository root (replace `YOUR_USERNAME`):

```sh
git remote add origin https://github.com/YOUR_USERNAME/lingomage.git
git push -u origin main
```
