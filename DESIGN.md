# LingoMage design

## Reference and visual language

Follow the App² starter template and host slate palette. The reference is App²'s `app/src/main/assets/starter_template/css/style.css` and native `res/values/colors.xml`. Keep LingoMage's blue reading accents within that shared visual language. This document describes the current design; it does not establish usability or learning effectiveness.

Use the shared CSS tokens: `--paper` (#090d16), slate reader surface (#0f172a), `--card`, `--line`, `--field`, `--ink`, `--muted` (#94a3b8), `--accent`, and `--accent-strong` (#3b82f6). Use 18px card corners, 12px field/button corners, subtle borders and restrained elevation. Avoid introducing a separate reader color theme.

## Layout and controls

Keep the mobile-first Create, My stories and Settings navigation with icons above labels, matching the App² starter. Reserve space for the bottom bar and combine host and browser safe-area insets. Controls have at least 44px touch targets, visible keyboard focus and English accessible labels. Respect reduced motion. Use shared button and field classes instead of feature-specific replacements.

The reader is full-screen, with a centered column no wider than 780px. Its header returns to the shelf and identifies the language. Separate chapter/version navigation from text-size and furigana controls, letting the groups wrap on narrow screens. Give canonical story text comfortable line spacing and keep Japanese readings as separate annotations. Glossary forms have a subtle underline and open a small anchored note on tap or keyboard activation; note controls must keep story text selectable. Beneath the story, place equal-width Continue story and Rewrite chapter buttons, then the prompt panel when opened, then saved explanations newest first. Keep Delete story at the bottom.

Selecting text offers Explain, Copy and Speak. Speak uses the story’s source language and offers Stop with a live status. Browser previews explain when native speech is unavailable. Spanish prefers a Chilean voice, then another Latin American Spanish voice, then any Spanish voice; show the selected voice locale. Stop playback when the reader closes or its chapter/version changes.

Long-press a saved explanation to select it. Use compact checkbox marks in 44px touch targets, a sticky selection count, trash control and green checkmark to finish. Tapping a card or checkbox toggles it; clearing the last selection exits the mode. Hide follow-up actions while selecting. Provide a keyboard-accessible Select explanation control on focus and let Escape exit selection. Preserve scroll position and focus as selection changes. Deleting selected explanations also removes their attached follow-ups.

On My stories, open a story with a normal tap and enter bulk selection with a long press or the accessible Select stories control. Show checkboxes and a selection toolbar in that mode; remove the per-card delete control. The trash button opens an app-styled confirmation that names the selected story count and warns that chapters, versions and explanations are removed. Cancel preserves selection. These interaction choices are product assumptions, not evidence of usability or learning effects.

Selection checkboxes have 44px touch targets. Cancel a pending long press when the pointer leaves the card, moves beyond the hold threshold, is released or cancelled, or the page scrolls.

## Selection help and follow-ups

Explain, Copy and Speak act on the exact canonical selection. Use separate bordered cards for saved explanations, with an accent rule marking the relevant source excerpt. The model chooses a contiguous source excerpt; the app copies canonical text and highlights only the user’s exact selection. Context translations are optional and appear beneath the excerpt when useful. Initial help is one short paragraph. English help uses the interface font; story text keeps its reading typography. Wrap long content without horizontal scrolling.

More detail reveals a labelled, one-line, optional question field with Cancel and Explain further. Opening or cancelling the field must not request AI. Enter submits; an empty question requests general detail on the same selection. Display each submitted question with its saved follow-up response. Alongside More detail, Generate examples directly requests three short examples of the same contextual function. Each example shows a highlighted relevant form and an English translation under an Examples heading. Both actions remain available; additional follow-ups append in order. Use text nodes for all learner and model content. Keep request cancellation and explicit save/release retry controls available.

## Verification

Check desktop and narrow mobile layouts, visible furigana, large reading text, keyboard focus, disclosures and follow-up submission in the deterministic development server. Mock checks establish UI behavior only. Host insets, Android keyboard and selection behavior require App² device verification.
