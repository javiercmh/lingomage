# More detail response validation

## Checks run

- `node tests/reader-regression.cjs` passed. Coverage includes plain Japanese detail with quotes, backslashes and paragraph breaks; blank and repeated follow-ups; legacy JSON detail; empty response rejection; initial/example JSON validation; and save-before-acknowledgement retries.
- `python3 -m unittest discover -s tests -p 'test_dev_server.py'` passed (8 tests).
- Ran the `--mock-ai` browser flow in a disposable `/tmp` workspace: selected Japanese `く`, opened More detail, submitted an empty question, and confirmed the fixture response remained attached after reload.
- `git diff --check` passed.

## Limits

No Android device was connected for a live reproduction. The app-level failure path is confirmed: detail text is passed to `decodeHelp`, which previously required `JSON.parse` before reading `explanation`. The exact text returned in the reported Android failure was not captured, so the provider-side trigger remains unconfirmed.
