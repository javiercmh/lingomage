# App² device verification checklist

Install/import LingoMage through the App² library; there is no LingoMage APK or Kotlin build. Provider setup belongs to App² Settings → AI. Use a disposable learning workspace and record only checks actually performed; never record credentials, tokens, callback URLs or account identifiers.

- Confirm launch, safe-area insets, keyboard navigation and 44px touch targets.
- Verify Short/Medium/Long persists and affects future chapters independently of difficulty.
- Generate Japanese with both stages; verify kanji-only furigana, compound grouping, selection, canonical copy and speech without readings.
- Check integrated notes, English meanings, learner preferences and all four target scripts with real provider output; content accuracy requires separate review.
- Cancel in each stage; close/reopen with saved progress; explicitly Resume/Discard. Verify no partial story appears and no completed stage is regenerated.
- Exercise continuation, rewrite, examples and saved-stage recovery against their original source/path even after reader navigation.
- Check native speech, external translation and availability errors. Translation is user-initiated, may process text online and returns no translation to LingoMage.
- Review updates through App²; installation needs native confirmation. Confirm existing user stories/settings/checkpoints survive managed-file updates.

Record date, device/host versions, tested app commit, actual outcomes and sanitized error categories. Unchecked items stay pending. Passing a mock/browser test establishes neither native device behavior nor language/learning quality.

Historical native authentication checks remain documented in dated validation records and [Git history](https://github.com/javiercmh/lingomage/tree/f8fef1255e608240301a13202168d4f6c41a1fea/android); they are not instructions for the current subapp.
