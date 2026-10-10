# Reading-profile checks — 2026-10-10

Checks actually run against `python3 dev_server.py --mock-ai` at `http://localhost:8888`, with no external inference:

- JavaScript module syntax passed `node --input-type=module --check`.
- Local browser rendered the three reading starting points, optional knowledge description and language-specific examples for all four languages.
- Enabled target languages appeared in the main picker. Japanese defaulted to Intermediate after selecting it in Settings.
- Entered a Japanese knowledge description and generated/saved a deterministic mock story at Beginner. The saved record retained the Intermediate reading starting point and its self-report, the saved knowledge description, Beginner story difficulty, profile-definition version and prompt version `2026-10-10.5`.
- Make another restored the selected language's Intermediate default.
- Spanish (Chile) Advanced default and knowledge description persisted across a browser reload.
- Verified the definitions contain all three bands for all four languages, the manifest packages the profile JSON, and every manifest path exists.
- Inspected the restored Settings screenshot after applying the kana/Cyrillic entry assumptions. Diff whitespace check passed.

Temporary sample stories and knowledge descriptions were removed by restoring the pre-check data. The preview-only model selection was reset to the normal GPT-6 Luna preference. Existing story file contents were preserved byte-for-byte.

The deterministic mock ignores profile adaptation; these checks do not validate target-language quality, actual difficulty, learning effectiveness or native AI behavior. Live App² generation, Android behavior, and qualified language review remain pending. The exact self-report descriptors and optional free-text adaptation have not undergone psychometric validation.
