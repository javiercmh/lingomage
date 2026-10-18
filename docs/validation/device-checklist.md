# App² device verification checklist

This checklist tracks automated verification, including native behavior that browser and mock tests cannot establish. Human acceptance checks are handled by users and are outside this engineering checklist. **Android-required does not mean manual or physical-phone-only:** most native integration checks can run automatically on an emulator. A locked Mac blocks desktop UI control, but does not prevent ADB, Android instrumentation or screenshots captured by the test runner.

Install/import LingoMage through the App² library; there is no LingoMage APK or Kotlin production build. Instrumentation belongs to the App² Android test host and loads the packaged LingoMage workspace. Provider setup belongs to App² Settings → AI. Use disposable learning workspaces; preserve existing apps and never record credentials, tokens, callback URLs or account identifiers.

## Verification methods and limits

| Method | What it establishes | What it cannot establish |
| --- | --- | --- |
| Browser/unit automation | Storage state logic, rollback and merge rules, prompt contracts, canonical text, generation orchestration, DOM state and repeatable layout geometry | Android bridge behavior, native menus, actual speech, keyboard or Android lifecycle |
| Android instrumentation on an emulator | Real WebView and bridge behavior, filesystem failures, persistence/relaunch, native Back, clipboard, intents, lifecycle and Android configuration changes | Behavior on every OEM, real touch comfort, audible speech quality or language correctness |
| Automated Android gestures and screenshots | Touch-event paths, drag/swipe/long-press behavior, menu visibility, bounds and image regressions on a specified emulator configuration | Readability and usability beyond the asserted geometry and image comparisons |
| Bounded live-provider automation | Real output compatibility, schema/contract checks and reproducible failures for the sampled model/language/configuration | Semantic correctness, certified level alignment or proven learning effectiveness |

Native gestures and accessibility semantics/focus transitions can have automated assertions. Android hardware/OEM integration tests can also run on a selected physical device when needed; ordinary native storage and WebView checks can use an emulator. Live model checks can run on desktop; managed App² AI integration requires Android. Speech tests cover requests, engine callbacks and lifecycle behavior, without establishing pronunciation or listening quality.

## Coverage and remaining work

**Status refers to recorded evidence, not whether automation is possible.** “Partial” means only the named scenario/configuration passed. “Pending” means no passing result is recorded here. Automation candidates below are not claims that tests already exist. Keep deterministic failures as small fixtures; reserve live inference for a bounded sample with explicit automated assertions. Semantic quality is outside this checklist.

### Shell, settings and storage

| Check | Automation method | Current evidence / remaining work |
| --- | --- | --- |
| Launch, bottom navigation, Settings prompts and dismissal across reloads | Browser state tests; Android relaunch/persistence tests | Pending comprehensive native coverage |
| Safe areas, sticky bars, keyboard insets, enlarged system font and pinch zoom across all screens | Android configuration/IME tests, gesture injection, geometry and screenshot captures; browser geometry as an early check | Partial: reader error notice and final actions inspected on API 36. Other screens, keyboard, scaling and 44px targets pending |
| Managed updates preserve stories, settings, checkpoints and unowned files | Package ownership tests; Android import/update into disposable workspaces; assert publisher identity and native confirmation flow; compare file hashes | Pending end-to-end update verification |
| Languages: expand rows, chevrons, Add/Stop learning, persisted Create order | Browser state; Android taps, reorder gestures, page-scroll conflict/edge-scroll assertions, cancellation, accessibility focus and reload assertions | Partial: native failed Add rolls back and Retry save persists it. Normal Stop/reordering/touch coverage pending |
| Missing versus empty/malformed settings, stories and checkpoints | Native filesystem fixtures plus real `readFile`/`listFiles`; byte comparisons and blocked-action assertions | Partial: all three stores absent, blank settings/checkpoints and malformed stories passed. Remaining invalid-file combinations, exact `listFiles` names/errors and navigation with intact stories pending |
| Retry loading after file repair; refuse reload with unsaved work | Browser tests; native repair/reload and active-operation fixtures | Partial: native settings repair/reload passed. Active AI/unsaved-response refusal on Android pending |
| Preference write failure, rollback, retained focus/typing and Retry save in Settings and reader | Browser tests; native permission-denied fixtures for every control; assert bytes, values and no reload | Partial: native text-size and language-Add rollback/retry, unknown-field preservation and reader notice clearance passed. Furigana, speed, Follow, model/reasoning, focus/typing and concurrent generation pending |
| Native write atomicity, storage-full and interrupted writes | Dedicated disposable emulator storage/fault-injection and restart tests | Pending. Permission denied is not evidence of full-storage handling or crash-safe atomic writes |

### Generation and recovery

| Check | Automation method | Current evidence / remaining work |
| --- | --- | --- |
| Create, Continue, Rewrite; scope/level persistence and original story/path attachment after navigation | Offline scripted AI fixtures for orchestration; Android managed-bridge integration; bounded live-model samples | Native/live coverage pending here; mock passes cannot establish semantic correctness. Occasional output-quality checks are specified separately in the [planned AI evals](generation-evaluation/README.md#planned-learning-quality-evaluations-ai-evals); they need no Android device except for managed-bridge integration |
| Cancel planning/prose/notes/readings; persist completed stages, reopen, Resume/Discard; no partial publication or regeneration | Deterministic staged responses and native lifecycle/relaunch tests; count requests and compare checkpoint bytes | Pending native stage-by-stage coverage |
| Examples, More detail and recovered results attach to the correct story/path | Browser fixtures and native navigation/lifecycle assertions | Pending native coverage |
| Provider errors, correct recovery, no silent retries | Scripted bridge failures; native disconnected/error fixtures; request-count assertions | Pending native coverage; live calls are unnecessary for most error paths |

### Reader and My stories

| Check | Automation method | Current evidence / remaining work |
| --- | --- | --- |
| Reader closure, chapter/path/Aa panels, outside dismissal and Back | Browser state; Android Back dispatcher, predictive Back gesture, nested-panel focus and touch/outside-dismiss tests | Partial: actual reader closed on three repeated native Back-dispatcher calls. Back gesture, nested panels and dismissal pending |
| Sticky compact/expanded reader, wrapped titles, Listen alignment, popover anchors and chapter/path removal bars | Android scroll/geometry tests and screenshots at multiple font sizes | Partial: long-chapter final actions clear failed-save notice. Remaining states pending |
| Text-size slider: live reflow, expanded/pinned panel stability, save on release, repeated adjustment | Android real gesture sequence, accessibility range actions, persistence and bounds assertions | Pending gesture coverage. Programmatic value/change events in the save-failure test do not establish dragging behavior |
| Japanese furigana grouping/toggle/persistence; canonical copy and speech input without readings; Russian Cyrillic | Unit fixtures; native render, clipboard and speech-request assertions | Pending native checks; deterministic contracts do not establish linguistic correctness |
| Selection routing: story/title custom actions; fields, explanations, popovers and errors retain native menus; other UI unselectable | Android long-press/selection/menu assertions, handle/toolbar bounds and keyboard switching tests | Partial: API 37 Russian story custom toolbar and story-idea native menu inspected on 2026-10-17. Other surfaces and Gboard language switching pending |
| Speak/Listen/Pause/Resume/Previous/Next/Follow/speed/slider; canonical title and full chapter; sentence highlight | Native speech events, configured voice/rate assertions and lifecycle tests; stub engine for timing/failure states, real engine integration for callbacks | Pending native speech/player checks |
| Stop during lookup, utterance and between chunks; rapid restart, errors, natural completion, navigation and backgrounding | Controlled speech engine callbacks; Android lifecycle tests; measure callback latency and assert no later chunks start | Pending; specify that backgrounding pauses at the sentence rather than assuming uninterrupted playback |
| Translation handler launch, unavailable/no-handler/timeout and return recovery | Android intent assertions/test handler, configured-handler launch/return and injected failures; existing browser contract tests | Partial: 20 real Google Translate launches/returns on Samsung passed on 2026-10-12. Native failure cases pending; translator may process text online |
| Copy chapter writes canonical text to system clipboard | Native clipboard content assertions | Pending native check |
| Explained passage highlight, card links and Show/View result scroll clearance | Browser and Android bounds/scroll and focus-visibility assertions with saved fixture explanations | Pending native check |
| Swipe and Actions tray: card/button move together, one tray open, vertical scroll preserved, tray taps work | Android swipe/tap/long-press sequences and state assertions | Pending native coverage |
| Bulk selection, chapter/path/story removal and confirmation | Browser state tests; Android gestures, confirmation/focus assertions and persistence checks using disposable data | Pending native coverage |

## Results

Record date, Android/WebView and host versions, tested app revision (and dirty/package identity), exact scenarios and outcomes, and sanitized error categories. Preserve earlier results; qualify conclusions to the tested configuration. Passing browser tests does not establish native behavior; passing emulator tests does not establish human usability or language/learning quality.

The 2026-10-18 eight-test instrumentation runner was built in a temporary App² source checkout and is not part of this repository's `scripts/check.py`. Its passing result is a one-run result, not an installed continuous test gate. Retaining a reusable Android test harness is still automation work.

- 2026-10-18, Medium_Phone Android API 36 arm64 emulator, WebView 133.0.6943.137, App² debug host from `156f301`, LingoMage package from `39c711a` plus the uncommitted audit implementation (ZIP SHA-256 `52115020a9319a46f53b321177d473e0d042387eca827a73223b2a3b7ba2f600`): eight Android instrumentation tests passed with the Mac locked. Tests loaded the packaged app into separate disposable native workspaces, used the real storage bridge, and removed only their own fixtures. Missing stores started normally; blank settings/checkpoints and malformed stories were preserved and blocked generation; Retry loading recovered after settings repair. Removing write permission from the fixture settings file and data directory produced real native failures: reader text size and Settings language Add rolled back, original bytes stayed intact, and Retry save persisted the intended change after restoring permission, including an unknown settings field. The long-chapter actions cleared the fixed reader error notice; its screenshot was visually inspected for wrapping, spacing, readable Retry save and bottom gesture-bar clearance. Three repeated native Back-dispatcher calls closed the actual reader without finishing the runtime. Existing library metadata was preserved. These checks used programmatic control changes and Back dispatch, not touch gestures or TalkBack; they do not establish full-storage behavior, write atomicity, live generation, speech, translation, keyboard insets or system font scaling.

- 2026-10-17, Test37 Android API 37 arm64 emulator (`emulator-5554`), App² debug built from `156f301`, LingoMage Preview packaged revision `9fd87f1`: visually inspected real long-press gestures. Russian story prose selected with handles and LingoMage custom actions, without Android's native toolbar. The story-idea input retained Android's Cut/Copy/Select all/Read aloud menu. From the input keyboard, Gboard Settings → Languages → Add keyboard opened and displayed the language list. Spacebar language switching remains unverified: Gboard had only English (US) configured and a spacebar hold did not open a picker. No physical-device checks performed. The broad native regression suite was interrupted and is not a passing result.

- 2026-10-12, Samsung SM-S921B, existing App² install, synthetic test subapp built from the translation-recovery change (33b48f9): 20 consecutive launches of the reader Translate button opened Google Translate each time and the button stayed enabled after every return. Native timeout/failure injection was not performed. Original subapps were byte-identical after the test. That run did not verify the other checklist items.
