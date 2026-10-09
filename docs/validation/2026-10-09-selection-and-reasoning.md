# Selection and reasoning validation — 2026-10-09

The preceding Japanese generation changes were committed first as `7237afb`.

Implemented direct selection for story titles, body, glossary headwords, forms
and English explanations. Japanese visual ruby children are excluded from
selection; alternate inline text preserves canonical kanji/kana for copying.
The initially considered separate selection mode was removed after native
clipboard verification succeeded for annotated text.

Added per-account, per-model reasoning preferences, a model-default option,
catalog-based effort choices with conservative documented-family fallbacks,
and `reasoning.effort` in authenticated Responses requests. Unsupported saved
preferences are excluded using the loaded catalog. No automatic request retry
is introduced.

Validation:

- Debug app and instrumentation APK builds succeeded; all 52 unit tests passed;
  lint completed with no errors.
- API 37 emulator initially failed because Espresso 3.5.1 reflected on a removed
  InputManager method. Updated Espresso to 3.7.0 and AndroidX test JUnit to 1.3.0.
- Native Copy menu checks inspect all interactive accessibility windows, because
  Samsung's floating toolbar was not in the active app root. The older mocked
  toolbar hook did not receive the actual menu callback.
- Six emulator UI tests passed: English sign-in, cancellation, supported reasoning
  picker callback, narrow/large-font furigana accessibility, plain canonical copy
  and annotated kanji copy without its kana reading.
- An explicit physical-device live reasoning check passed earlier: preference
  save/read, account/model separation and authenticated inference. It restored
  the previous preference afterward. No credentials were exported.

The final app is installed on the API 37 emulator. The phone was subsequently
locked/disconnected; no further phone connection was requested. Wider selection
handle ergonomics and manual TalkBack review remain pending.
