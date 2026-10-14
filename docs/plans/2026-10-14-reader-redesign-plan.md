# Reader redesign plan

Status: **implemented 2026-10-14** (a50232c, 77757c9, a5ff9de, 246a78b, 4e162b8, f459b41, 92c9935). Below is the original proposal, kept as rationale; `DESIGN.md` is authoritative for shipped behavior, and Android-only behavior is still pending device verification.

Original status: proposal awaiting approval. Based on reading `index.html`, `css/style.css`, `js/app.js`, `js/reader-text.js`, `js/bridge.js` and `DESIGN.md`. Nothing was run in a browser for this plan; verification steps below are for implementation time. Every item changes interface behavior, so each needs a `DESIGN.md` update, desktop and narrow-mobile screenshot inspection, and `python3 scripts/check.py`. Android-only behavior (native selection menu, insets, haptics) stays "pending device verification".

## 1. "Show" scrolls too far (corrected after re-reading the original request)

**Requested behavior.** Tapping "Show" / "View result" should scroll only far enough to reveal the bottom of the new explanation, not align it to the top of the screen. (An earlier version of this plan had this backwards.)

**Now.** The status bar's "View result" handler (`js/app.js` ~L78-95) calls `updateReader()`, then `card.scrollIntoView({block:'start', behavior:'smooth'})`, which always top-aligns.

**Plan.**
- Replace `block:'start'` with minimal-scroll logic: if the card's bottom is already above the viewport's usable bottom (viewport minus safe area and the floating status/selection bars), do not scroll; otherwise scroll by just `cardBottom - usableBottom + 12px`. If the card is taller than the usable viewport, align its top instead so the start is readable.
- Hide the status bar first, then compute and scroll in `requestAnimationFrame`, so removing the bar's 160px bottom padding cannot change the result mid-scroll.
- Briefly pulse the card border (about 1.2s, off under reduced motion) and focus it with `preventScroll:true`.
- The chapter-heading target (continue/rewrite results) keeps top alignment, since the heading is the start of new content.

## 2. Tap-to-passage affordance and highlighting linked expressions

**Now.** Explanation cards show an excerpt (`.help-quote`) with the exact selection highlighted, but tapping a card does nothing outside selection mode, and the story text shows no trace of which expressions have explanations. Cards already store `start`/`end` offsets into `version.story`.

**Plan.**
- *Highlight in the text.* In `annotatedText` (`js/reader-text.js`), accept the chapter version's saved help ranges and wrap them in `<mark class="explained-expression" data-help-id>` elements, with a subtle background and a 2px accent underline that is visually distinct from the dotted glossary underline. Split marks at ruby boundaries as the glossary code already does. Overlaps: nest by shortest range; glossary triggers remain buttons inside or outside as needed. Recompute on every `updateReader`, like glossary links.
- *Tap on a highlight in the story* scrolls to and pulses its card (same landing behavior as item 1). Because several explanations may share a range, a tap on overlapping ranges goes to the newest and shows "1 of N" in a toast, or a small chooser if N > 1 (decision below).
- *Tap on a card* gets an explicit button, not a whole-card tap, since the whole card must stay selectable text and long-press selection mode exists. Add a 44px "Show in text" control in the card header (icon: arrow up to a text line, accessible label "Show this passage in the story"). This is the clear, discoverable tap target and does not collide with long-press (selection) or with text selection inside the card.
- *Optional secondary:* tapping the excerpt quote (`.help-quote`) also triggers it, styled as a link-like quote with the same affordance icon. Keep it off if it harms text selection.
- After scrolling to the passage, flash the highlight (pulse) and keep the explanation reachable via a "Back to explanation" chip near the passage that disappears on the next scroll or after 6 seconds. This replaces losing one's place.
- Selection mode (long press) is unchanged and disables both tap behaviors, as for follow-ups.

**Decisions needed.** (a) Whether highlights show always, or via a "Show explained expressions" toggle next to Furigana (recommended: always on, subtle; toggle only if it harms reading). (b) Chooser vs newest-wins for overlaps (recommended: newest wins plus count).

**Docs/tests.** `DESIGN.md` reading section and PED-002 note (product assumption: highlights support return-to-context, not shown to improve learning). Extend `tests/reader-regression.cjs` for mark placement with ruby and offsets.

## 3. Swipe-to-delete redesign (My stories)

**Now.** Swipe left at 60px reveals an 80px red area; the trash opens a confirm dialog; gesture-only, no keyboard path except bulk selection.

**Best-practice gaps.** Hidden gesture with no hint; the destructive control needs two extra steps with no undo; one accessible path only through bulk selection; no touch of overshoot/full-swipe behavior.

**Plan (recommended).**
- *Reveal with a labelled action:* swipe reveals a "Delete" button (icon plus text, red, 44px minimum, 96px wide) with row translation tracking the finger and a snap, not a 60px threshold jump. Follow the drag 1:1, settle open past 40% of the action width, or fling by velocity.
- *Replace the modal for single swipe deletes with delete-then-undo:* tapping Delete removes the card immediately (animated height collapse, instant under reduced motion) and shows a toast "Story deleted · Undo" for about 8 seconds. Persistence is deferred until the toast expires or the user leaves the view, so Undo is a real restore without any save churn. Keep the app confirmation dialog for bulk deletion (multi-story is higher blast radius) and for any case where persistence has already happened.
- *Accessibility:* each card gets a keyboard- and screen-reader path that does not depend on the gesture: a "Story actions" overflow button (visible, 44px) with Delete, Select. This replaces the hidden `Select story` focus button and removes the documented gesture-only limitation. Expose actions via `aria-label` and `aria-describedby` hint, announce results through a live region ("Story deleted. Undo available").
- *Discoverability:* first-run only hint (peek animation, dismissed after first successful swipe, stored in `data/settings.json`), plus the overflow button above.
- Keep: 1.5x horizontal-intent rule, one revealed card at a time, long-press cancel on swipe, outside-tap closes.

**Tradeoff to decide.** Undo-toast means deletion is not durable for about 8 seconds; AGENTS.md says "Save completed story data before acknowledging" for AI work only, so no conflict, but reader-open stories or in-flight generation must block deferred deletes (reuse `pendingDeletionBlocked`). Alternative that keeps today's semantics: keep the confirm dialog but add the labelled button and overflow menu (smaller change, weaker UX).

## 4. Native context menu

**Now.** `selectionMenu.setSuppressed(true)` (`js/app.js` ~L1561, `js/bridge.js` L355) hides Android's floating menu for the whole page load, and the app shows its own `#selection-toolbar` only for the story body (`selectedPassage` is bound to `#reader-story`). `DESIGN.md` still says Copy/Speak stay in the native menu in App², which contradicts that code; the doc must be reconciled.

**Plan.**
- Confirm the intent: the request reads "suppress the system menu, keep it for the title but give the title the custom menu". The host call is page-global, so there is no per-element exception; the title therefore cannot keep the native menu. Interpretation: system menu suppressed everywhere in the reader, title selection gets the custom toolbar. Please confirm.
- Generalize the toolbar to selections inside `#reader-title`: Translate, Listen (selected text, using the title's locale), Copy; no Explain (explanations are anchored to story offsets, titles are not in `version.story`). Show Explain disabled-hidden rather than disabled to avoid a dead control.
- Selections in explanation cards and prompt fields: keep the app toolbar off for editable fields (they need native editing menus; AGENTS/DESIGN say editable fields keep normal menus) and on for read-only explanation text with Copy/Speak/Translate only. If the host cannot unsuppress per focus, fall back: call `setSuppressed(false)` while an editable field is focused, true otherwise.
- Block the browser/Android long-press context menu on story text with `contextmenu` preventDefault only where the custom toolbar replaces it, plus `-webkit-touch-callout:none` (iOS irrelevant, harmless).

**Risks.** Needs Android verification (mark pending). Browser preview shows the OS menu unless prevented; development server must mimic via `contextmenu` handling.

## 5. Title area, story controls and navigation

**Problems seen in markup/CSS.** The `h2` title sits in `.reader-heading` with only a 14px margin and no visual link to the story controls below it; the Listen button next to it reads the whole chapter body and excludes the title (DESIGN.md L70), so it looks like "listen to title"; the Copy chapter icon beside Listen is a second ambiguous icon; Story actions has only Remove chapters and Delete, while Continue and Rewrite live separately below the text; navigation, path selector, actions and text controls are four loose rows.

**Plan (recommended layout).**
1. *Title block as a header card:* title (larger, left), under it a quiet meta line (language tag, level, "Chapter 2 of 5", path name). One container with a bottom divider, so title, chapter navigation and controls read as one unit attached to the story.
2. *Playback bar instead of an icon beside the title:* a labelled "Listen to chapter" button (speaker icon plus text, becomes Stop while playing) placed under the title in the header block, so scope is explicit. Optional later: Listen to title (tap on the title opens the custom menu from item 4, with Listen).
3. *Move Copy chapter into the overflow:* remove the standalone icon; put "Copy chapter" in a single Story menu (item 6).
4. *Navigation row:* Previous / Chapter select / Next as one segmented group; path selector appears inline with it only when more than one path exists; reading preferences (A-, A+, furigana) collapse into a "Text" control group on the right, or an Aa popover on narrow screens.
5. *One Story menu (kebab or "Story ▾"),* grouped: Continue story, Rewrite chapter (non-destructive, top), Copy chapter, then a divider and destructive Remove chapter(s) / Delete this path / Delete story. This gives Continue and Rewrite parity with Delete as requested. Keep the equal-width Continue / Rewrite buttons under the text as the primary path and surface the same actions in the menu (decision below).
6. Keep: disabled-with-explanation when AI work is pending, Escape closes and restores focus, 44px targets.

**Decisions needed.** (a) Keep the bottom Continue/Rewrite buttons in addition to the menu (recommended: yes, they are the natural end-of-chapter action), or move them to the menu only. (b) Overflow as a kebab icon vs a "Story actions" text button (recommended: text plus chevron on desktop, icon on narrow widths).

## Suggested order and scope

1. Item 1 (small, isolated bug fix). 2. Item 5 and item 4 together, since both touch the heading and toolbar. 3. Item 2. 4. Item 3 (library only).

Each ships as its own commit to `main`, with docs (`DESIGN.md`, PED-002 where learning behavior is implicated), regression tests in `tests/`, and `PROMPT_VERSION` untouched since no prompts change. Screenshots to inspect per item: desktop 1280px and mobile 375px, with and without furigana (Japanese story), with a single and multiple paths, with one and several explanations, and the loading/error states for item 1.

## Open questions

1. Item 2: overlapping explanation ranges, newest wins with count or chooser?
2. Item 3: undo-toast (deferred delete) or keep the confirmation dialog for single deletes?
3. Item 4: confirm that the native menu is suppressed everywhere and the title gets the custom toolbar.
4. Item 5: keep bottom Continue/Rewrite buttons as well as menu entries?
