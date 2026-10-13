# Translation button recovery — 2026-10-12

Availability is checked when selection reveals the toolbar or changes the canonical passage. There is no startup, return-to-foreground, or post-launch availability request. Confirmed availability survives rejected checks; newer selections and page backgrounding invalidate older replies. Launch progress is separate and always clears in finally.

Verification:
- Full `python3 scripts/check.py` passed after all regression tests were added.
- Behavioral tests execute production toolbar/controller and click-handler code with controlled bridge promises: 20 launches, duplicate taps, canonical text, timeout, stale negative replies, background invalidation, explicit unavailability and recovery, plus initial failure and hidden checks.
- Browser screenshots inspected at 1100×850 and 360×800 through the mock development server. Selected text toolbar remained within the viewport, with readable labels, correct desktop placement and mobile bottom placement. Browser Translate and Speak were disabled as expected without native channels. No layout or CSS changes were needed.
- Medium_Phone emulator booted on Android 36 and resolves ACTION_TRANSLATE to Google Search. Emulator translation interactions were not exercised; physical-phone verification below covers the native flow.
- No commits or publication performed. Phone verification used only a separate synthetic test subapp after a verified full-library backup.

## Physical-phone verification

- Target: Samsung SM-S921B, ADB serial `adb-R3CXC04E53K-qSdWHG._adb-tls-connect._tcp`, existing App² installation in main profile/user 0. No host APK update.
- Created full-library backup through Settings → Subapp backup → Back up all subapps; copied it to `/tmp/app2-phone-before-lingomage-test.zip`. ZIP integrity, all recorded file sizes and SHA-256 hashes passed. Original apps: LingoMage (13 stories), Hours (20 entries), Translation Bridge Test (disposable).
- Imported `/tmp/lingomage-translation-test.zip` through New app → Choose ZIP file as a separate LingoMage Translation Test with one synthetic Japanese story and no personal records. Opened My stories → 大学のカフェテリア. No AI requests or edits to original subapps.
- Exercised 20 successful launches using Lingomage's bottom Translate button, not Android's native selection menu: repeated same-selection launches, changed selections from cycle 8, and four quick Back returns after observing Google Translate as the resumed activity. UI hierarchy confirmed Translate enabled before each launch and after each return. Google Translate opened on every cycle. A few long-press gestures failed to select text and were retried; these were gesture misses, not disabled-button failures.
- Post-test full-library backup `/tmp/app2-phone-after-lingomage-test.zip` passed integrity and all file checks. Every workspace file in each of the three original apps is byte-identical to the pre-test backup. Library count is four solely because the separate test app remains installed.
- Installed test-copy `js/app.js`, extracted from the post-test backup, matches repository source byte-for-byte. SHA-256: `e5b3f353f49697318151317777bc27243a70a2c6ca786c2f8ad38a626b177ee4`.
- Evidence: `/tmp/lingomage-phone-test-report.json`, `/tmp/lingomage-phone-cycles.json`, per-cycle UI XML, `/tmp/lingomage-phone-after-20.png`, and the two verified backups. Screenshot after cycle 20 shows the enabled Translate button with a valid selection. Test passed without reproducing a permanently disabled button.
- Real native command timeout/failure injection was not performed on the phone; deterministic regression tests cover those cases. The original LingoMage installation remains at its prior code version; only the separate test copy contains this unpublished fix.
