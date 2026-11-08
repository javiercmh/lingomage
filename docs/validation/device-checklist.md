# App² device verification checklist

What to verify on Android that browser and mock tests cannot establish, and how. This is a fixed list, not a log: it lists checks, never their results or status. Record each run's results (date, device or emulator, Android/WebView and App² versions, tested revision, scenarios and outcomes) in the commit message of the change it verifies. Add or edit a row when a feature changes what needs checking; remove a row when the feature goes away.

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

## Checks

Automation methods are candidates, not claims that tests already exist. Keep deterministic failures as small fixtures; reserve live inference for a bounded sample with explicit automated assertions. Semantic quality is outside this checklist.

### Shell, settings and storage

| Check | How to verify |
| --- | --- |
| Launch, bottom navigation (Create, Library, Profile), Profile gear → Settings → Back to Profile, language prompts and dismissal across reloads | Browser state tests; Android relaunch/persistence tests |
| Profile: By-language disclosure rows (TalkBack, 44px targets, enlarged font), My practice then My languages scroll, safe areas and keyboard insets | Android TalkBack/configuration tests; screenshots |
| Safe areas, sticky bars, keyboard insets, enlarged system font and pinch zoom across all screens | Android configuration/IME tests, gesture injection, geometry and screenshot captures; browser geometry as an early check |
| Managed updates preserve stories, settings, checkpoints and unowned files | Package ownership tests; Android import/update into disposable workspaces; assert publisher identity and native confirmation flow; compare file hashes |
| Languages: expand rows, chevrons, Add/Stop learning, persisted Create order | Browser state; Android taps, reorder gestures, page-scroll conflict/edge-scroll assertions, cancellation, accessibility focus and reload assertions |
| Time tracking (Stats, `data/usage.json`) on Android | Real App² host: elapsed-time comparisons, native speech callbacks, Home/lock, playback controls, persisted-file checks and relaunch; configuration/fault-injection tests for remaining cases |
| Missing versus empty/malformed settings, stories and checkpoints | Native filesystem fixtures plus real `readFile`/`listFiles`; byte comparisons and blocked-action assertions |
| Retry loading after file repair; refuse reload with unsaved work | Browser tests; native repair/reload and active-operation fixtures |
| Preference write failure, rollback, retained focus/typing and Retry save in Settings and reader | Browser tests; native permission-denied fixtures for every control; assert bytes, values and no reload |
| Native write atomicity, storage-full and interrupted writes | Dedicated disposable emulator storage/fault-injection and restart tests |

### Generation and recovery

| Check | How to verify |
| --- | --- |
| Create, Continue, Rewrite; scope/level persistence and original story/path attachment after navigation | Offline scripted AI fixtures for orchestration; Android managed-bridge integration; bounded live-model samples |
| Cancel planning/prose/notes/readings; persist completed stages, reopen, Resume/Discard; no partial publication or regeneration | Deterministic staged responses and native lifecycle/relaunch tests; count requests and compare checkpoint bytes |
| Examples, More detail and recovered results attach to the correct story/path | Browser fixtures and native navigation/lifecycle assertions |
| Provider errors, correct recovery, no silent retries | Scripted bridge failures; native disconnected/error fixtures; request-count assertions |
| Multi-request operations survive backgrounding between stages: one operation session spans Continue/Rewrite summary preparation and every stage (Create and Examples too); a denied or lost background start, idle expiry, time limit and notification Cancel each leave the checkpoint at the right stage with the accurate recovery wording and an explicit Retry; Finish request and Save response never open a session | App² host fake-provider tests (`AiSessionDeviceTest`, `AiSessionBridgeDeviceTest`, Test37 emulator, debug build) plus offline workspace tests (`tests/ai-session.mjs`, `tests/app-startup.mjs`) |

### Reader and Library

| Check | How to verify |
| --- | --- |
| Reader closure, chapter/path/Aa panels, outside dismissal and Back | Browser state; Android Back dispatcher, predictive Back gesture, nested-panel focus and touch/outside-dismiss tests |
| Sticky compact/expanded reader, wrapped titles, Listen alignment, popover anchors and chapter/path removal bars | Android scroll/geometry tests and screenshots at multiple font sizes |
| Text-size slider: live reflow, expanded/pinned panel stability, save on release, repeated adjustment | Android real gesture sequence, accessibility range actions, persistence and bounds assertions |
| Japanese furigana grouping/toggle/persistence; canonical copy and speech input without readings; Russian Cyrillic | Unit fixtures; native render, clipboard and speech-request assertions |
| Selection routing: story/title custom actions; fields, explanations, popovers and errors retain native menus; other UI unselectable | Android long-press/selection/menu assertions, handle/toolbar bounds and keyboard switching tests |
| Selection-toolbar action feedback: Copy clears after clipboard write, Translate after the translator opens, Explain after AI task creation, and Speak after selected-text playback; keyboard focus remains distinct | Android long-press/tap assertions with delayed bridge replies, clipboard inspection, speech completion/error callbacks and keyboard navigation |
| Vocabulary-first note over a saved explanation: tap or Enter/Space opens the vocabulary note directly; its full-width “View saved explanation ↓” button (44px) closes the note and reveals the card; vocabulary-only notes and explanation-only highlights unchanged | Android tap, TalkBack/keyboard and gesture assertions; button bounds, divider and note placement at 320px and enlarged fonts; Back dismissing an open note before leaving the reader; outside-tap dismissal; Japanese secondary ruby fragments |
| Speak/Listen/Pause/Resume/Previous/Next/Follow/speed/slider; canonical title and full chapter; sentence highlight | Native speech events, configured voice/rate assertions and lifecycle tests; stub engine for timing/failure states, real engine integration for callbacks |
| Stop during lookup, utterance and between chunks; rapid restart, errors, natural completion, navigation and backgrounding | Controlled speech engine callbacks; Android lifecycle tests; measure callback latency and assert no later chunks start |
| Translation handler launch, unavailable/no-handler/timeout and return recovery | Android intent assertions/test handler, configured-handler launch/return and injected failures; existing browser contract tests |
| Lookup history and probable reading (PED-005): note, Listen, Explain, follow-up, examples and Translate record once each in `data/learning-signals.json`; paragraphs count only after on-screen dwell; Most looked up list, detail sheet with Listen, Clear list confirmation, unreadable-file notice and Retry | Android reading session with file inspection; scroll, idle, background and rotation sequences; 320px and large-font screenshots |
| Copy chapter writes canonical text to system clipboard | Native clipboard content assertions |
| Reader multiword selection keeps Android's native context menu hidden, including selections spanning annotated text nodes and handle drags; custom reader actions remain available | Android instrumentation with real long-press/handle gestures and native menu visibility assertions across plain and annotated prose |
| Explained passage highlight, card links and Show/View result scroll clearance | Browser and Android bounds/scroll and focus-visibility assertions with saved fixture explanations |
| Library Actions popover: tap/long-press/scroll separation, popover placement and flip with host insets and the bottom bar, Escape/Back dismissal, no gesture side effects | Android tap, scroll and long-press sequences with state and bounds assertions |
| Library TalkBack and system font scaling: card names include title, language and "Updated"/"Created" dates; chips and Sort remain 44px and usable at large text; hero (with Read cue) and rows reflow without clipping | Android TalkBack traversal and 200% font-scale screenshots |
| Library activity stamp persists across backgrounding: a long request finishing while the story is not open updates its "Updated" date and the hero after the app resumes, with no re-render under an open selection or popover | Android lifecycle test with the deterministic fake provider and `data/stories.json` inspection |
| Bulk selection, chapter/path/story removal and confirmation | Browser state tests; Android gestures, confirmation/focus assertions and persistence checks using disposable data |
| Running-request notification: LingoMage's task-specific title/body appear beside the host-derived app name for create, continue, rewrite, examples, notes, readings, explain and summary requests; Cancel affects only LingoMage's request | Android notification assertions with the deterministic fake provider in the App² test host |
| In-app generation status (all tasks) beside the native running-request notification: page-level bar above the Android navigation/tab bar and host insets on every tab, in a closed reader and inside another story's reader dialog; Cancel from the page bar; no stale "working" after cancel or failure; polite announcement without focus change under TalkBack and at large font scale | Android run of Create, Continue, Rewrite and Explain with the notification shade open, tab switching, reader closing and backgrounding; TalkBack traversal |
| Continue completion keeps the viewed chapter, path, scroll offset and focus (also after switching paths or reopening the story during the request); View result opens the exact result path and chapter, and the selection survives restart. View result from another story's reader returns to the Library with a single Back | Android Continue on a two-path story with the app backgrounded during generation; Back-button sequence after View result |
| Reader listening and pronunciation on a host without native playback UI: no native Speaking bar; Follow keeps sentences clear of the in-app player | Android speech playback with screenshots and bounds assertions |
| Selection-menu press feedback: buttons highlight throughout touch press; releasing Copy copies canonical text, clears handles and dismisses the menu with only Android's clipboard confirmation and no duplicate toast; release outside or cancel does not copy. Cancelling an explanation or detail leaves no recovery status, keeps existing help and questions, and allows another request; an injected host cleanup failure offers Finish request | Android long-press/touch sequences, clipboard assertions and injected cleanup failures |
| Japanese Create and Continue progress: the waiting checklist and segmented bar advance through each stage, the active step timer counts up, Cancel stops the request, and TalkBack announces the step summary once per change | Android managed-bridge run with staged responses, timer and accessibility-event assertions |
