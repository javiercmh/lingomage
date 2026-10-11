# LingoMage design

## Reference and visual language

Follow the App² starter template and host slate palette. The reference is App²'s `app/src/main/assets/starter_template/css/style.css` and native `res/values/colors.xml`. Keep LingoMage's blue reading accents within that shared visual language. This document describes the current design; it does not establish usability or learning effectiveness.

Use the shared CSS tokens: `--paper` (#090d16), slate reader surface (#0f172a), `--card`, `--line`, `--field`, `--ink`, `--muted` (#94a3b8), `--accent`, and `--accent-strong` (#3b82f6). Use 18px card corners, 12px field/button corners, subtle borders and restrained elevation. Avoid introducing a separate reader color theme.

## Layout and controls

Keep the mobile-first Create, My stories and Settings navigation with icons above labels, matching the App² starter. Reserve space for the bottom bar and combine host and browser safe-area insets. Controls have at least 44px touch targets, visible keyboard focus and English accessible labels. Respect reduced motion. Use shared button and field classes instead of feature-specific replacements.

The reader is full-screen, with a centered column no wider than 780px and no top bar. Use the story title, then separate chapter/version navigation from text-size and furigana controls, letting the groups wrap on narrow screens. Android Back returns to My stories while the reader is open. Give canonical story text comfortable line spacing and keep Japanese readings as separate annotations. Glossary forms have a subtle underline and open a small anchored note on tap or keyboard activation; note controls must keep story text selectable. Beneath the story, place equal-width Continue story and Rewrite chapter buttons, then the prompt panel when opened, then one Explanations section with saved cards newest first. Keep Delete story at the bottom.

Selecting text offers Explain in the LingoMage toolbar. In App², Copy and Speak remain in Android’s native selection menu; Speak uses the selected text’s language and Android’s configured voice. Keep the Explain toolbar available in every environment. Stop native playback when the reader closes or its chapter/version changes.

Long-press the non-text surface of a saved explanation card to select it; text inside the card remains available for native selection and context menus. Padding and gaps are selection surfaces. Use compact checkbox marks in 44px touch targets, a sticky selection count, trash control and green checkmark to finish. Tapping a non-text card surface or checkbox toggles it; text remains selectable while selection mode is active. Clearing the last selection exits the mode. Hide follow-up actions while selecting. Provide a keyboard-accessible Select explanation control on focus and let Escape exit selection. Preserve scroll position and focus as selection changes. Deleting selected explanations also removes their attached follow-ups.

On My stories, open a story with a normal tap and enter bulk selection with a long press or the accessible per-story Select story control, shown on keyboard focus. Show compact checkbox marks in 44px touch targets and a sticky selection toolbar in that mode; remove the global Select stories button and any per-card delete control. The trash button opens an app-styled confirmation that names the selected story count and warns that chapters, versions and explanations are removed. Cancel preserves selection. Tapping a story card toggles it while selection is active; clearing the last selection exits the mode. These interaction choices are product assumptions, not evidence of usability or learning effects.

Selection checkboxes have 44px touch targets. Cancel a pending long press when the pointer leaves the card, moves beyond the hold threshold, is released or cancelled, or the page scrolls.

## Selection help and follow-ups

Explain acts on the exact canonical selection. Group saved cards under one Explanations heading, with separate bordered cards and an accent rule marking the relevant source excerpt. The model chooses a contiguous source excerpt and the app highlights only the user’s exact selection. Context translations are optional and appear beneath the excerpt when useful. Initial help is one short paragraph. English help uses the interface font; story text keeps its reading typography. Wrap long content without horizontal scrolling. Keep saved explanations visible while a request runs. Show a compact, cancellable loading panel above the cards for initial help and inside the matching card for details and examples; retain the question after a failed detail request. Examples remain inside their explanation card, separated by a divider.

More detail reveals a labelled, one-line, optional question field with Cancel and Explain further. Opening or cancelling the field must not request AI. Enter submits; an empty question requests general detail on the same selection. Display each submitted question with its saved follow-up response. Alongside More detail, Generate examples directly requests three short examples of the same contextual function. Each example shows a highlighted relevant form and an English translation under an Examples heading. Both actions remain available; additional follow-ups append in order. Use text nodes for all learner and model content. Keep request cancellation and explicit save/release retry controls available.

## Verification

Check desktop and narrow mobile layouts, visible furigana, large reading text, keyboard focus, disclosures and follow-up submission in the deterministic development server. Mock checks establish UI behavior only. Host insets, Android keyboard and selection behavior require App² device verification.
