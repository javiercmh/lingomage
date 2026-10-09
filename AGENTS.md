# LingoMage contributor instructions

## Product and documentation

- Keep the interface and glossary explanations in English. Current targets are German, Japanese, Russian and Spanish (Chile).
- Keep implementation in `android/` and rationale, research, language decisions and validation in `docs/`.
- Update affected documentation when prompts or learning behavior change. Increment prompt versions and preserve saved-story provenance.
- Label product assumptions and evidence limitations; do not claim certified CEFR alignment or proven learning effectiveness.
- Preserve canonical Japanese text separately from furigana. Copied Japanese text must omit readings. Russian uses Cyrillic without Latin transliteration.

## Debugging the app

Use the provided Android VM first. Only request a smartphone connection when the VM cannot validate the behavior.

Start it with `~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_37.0`, optionally with `-no-window`.
Use `~/Library/Android/sdk/platform-tools/adb devices` to find it, and specify `-s <serial>` in every device command when multiple devices are available.

Build from `android/` using Android Studio's bundled JDK if the shell JDK is incompatible. Run debug build, unit tests, lint and instrumentation checks relevant to the change. Record only checks actually run.

Install debug APKs with `adb install -r` to preserve local stories and sign-in data. On a signed-in physical installation, install the test APK and invoke `am instrument` directly: Gradle connected-test cleanup can uninstall the app and erase credentials.

Live inference tests require explicit opt-in arguments and consume ChatGPT plan usage. Prefer mocked tests for routine verification. Never export credentials or log tokens, browser callback URLs or account identifiers. Restrict diagnostics to relevant app content, and remove temporary device diagnostic files afterward.

Do not bypass a phone lock screen. Use the VM for UI checks when a physical device is locked. Keep pending physical-device or qualified language-review checks clearly marked in validation records.
