# App² device verification checklist

This is the single list of behavior that browser and mock checks cannot establish. Everything here is **pending** until it is checked in App² on Android. When a check is run, add a dated line under "Results" and leave the item in place. When a feature changes, update or remove its items in the same change.

Install/import LingoMage through the App² library; there is no LingoMage APK or Kotlin build. Provider setup belongs to App² Settings → AI. Use a disposable learning workspace and never record credentials, tokens, callback URLs or account identifiers.

## Shell and layout

- Launch, safe-area insets (top, bottom, keyboard), keyboard navigation and 44px touch targets on every screen.
- Bottom navigation, Settings prompts and dismissal persist across reloads.
- Review updates through App²; installation needs native confirmation. Existing user stories, settings and checkpoints survive managed-file updates.

## Generation and recovery

- Create, Continue and Rewrite with real provider output in all four target languages and scripts; Scene/Chapter scope and reading level persist.
- Cancel in each stage (planning, prose, notes, readings); close and reopen with saved progress; explicitly Resume/Discard. No partial story appears and no completed stage is regenerated.
- Continuation, rewrite, examples, More detail and saved-stage recovery stay attached to their original story and path after reader navigation.
- Provider errors show the correct cause and recovery controls; no automatic retry happens.

## Reader

- Japanese: kanji-only furigana, compound grouping, furigana toggle, and canonical copy and speech without readings.
- Selection routing: long-press story text and title shows the LingoMage toolbar with no native menu; fields, explanation-card text, the vocabulary popover and form errors keep the native menu (including spelling correction in fields); app title, labels, buttons and story cards stay unselectable. Native selection handles do not overlap the toolbar.
- Speak, Listen to chapter and Stop use native speech with the correct voice, and survive app backgrounding.
- Listening player (older hosts show the native Speaking bar beneath it; newer hosts with `speech.capabilities()` and `showControl` hide it): floating pill under the sticky row at narrow widths and safe areas; Pause/Resume, Previous/Next, speed (rate on the real engine), slider and Follow; sentence highlight in Android WebView and on Japanese text without furigana; gap between sentences, Stop/skip latency, and backgrounding (pauses at the sentence).
- Translate launches the configured Android translator; no-handler and unavailable cases show errors. Translation may process text online and returns nothing to LingoMage.
- Copy chapter places canonical text on the system clipboard.
- Explained passages are highlighted and link to their cards; Show/View result scrolls only far enough to reveal the explanation; the Story menu and title section respect insets.
- Chapter and path removal, explanation selection mode and its bottom bar sit above the safe area.

## My stories

- Swipe left and the Actions button both reveal the Select/Delete tray; card and button slide together, tray taps work after a swipe, vertical scroll is preserved, only one card is open.
- Long-press bulk selection and confirmed deletion.

## Results

Record date, device and host versions, tested app commit, the items checked, actual outcomes and sanitized error categories. Passing a mock or browser test establishes neither native device behavior nor language or learning quality.

- 2026-10-12, Samsung SM-S921B, existing App² install, synthetic test subapp built from the translation-recovery change (33b48f9): 20 consecutive launches of the reader Translate button opened Google Translate each time and the button stayed enabled after every return. Native timeout/failure injection was not performed. Original subapps were byte-identical after the test. Every other item above is unverified on device.

- Pending Android verification: Languages row toggling and 48px chevrons, Add/Stop learning, grip-handle touch drag (no page scroll while dragging, edge auto-scroll, release saves, cancel restores), TalkBack arrow-key reordering and persisted Create language order.

- Pending Android verification: compact reader toolbar at narrow widths and safe areas; borderless Story actions touch/focus behavior; chapter/path and Aa floating panels, outside dismissal and Back behavior; native range adjustment with TalkBack; Japanese furigana persistence; Listen speaks canonical title followed by the complete chapter and stops on navigation/background interruption.

- Pending Android verification: expanded reader with Listen vertically centered beside multiline titles; clear Previous/Next chevrons; reduced sticky navigation at the top safe area, expansion on scrolling back, popover anchors while pinned, and keyboard/TalkBack focus clearance under the bar.

- Pending Android verification: hold and drag the text-size slider through several sizes in expanded and pinned reader states; live reflow must not dismiss or move the panel, settings save on release, repeated adjustment remains available, and outside tap/Escape still dismiss it.

- Pending Android verification: brighter/larger title Listen icon, close spacing beside wrapped titles and grey pressed state; tap Listen then tap the pressed grey speaker during voice lookup, within an utterance and between long-chapter chunks; no later chunks may start. Check native Stop, rapid stop/start, natural completion, stop errors and navigation/reader closure while stopping.
