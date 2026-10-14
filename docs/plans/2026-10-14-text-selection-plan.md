# Text selection audit and plan

Status: **implemented 2026-10-14** in dc16e68 (text unselectable by default, selection menus routed by zone). Below is the original plan, kept as rationale; `DESIGN.md` is authoritative. Android menu behavior is pending device verification.

## Problem

On the Create screen a long press selects the app title, the "Build a story" headline, the intro paragraph and field labels. Selection handles appear but no menu, because the native Android menu is suppressed for everything outside fields (f459b41). The result is a half-working selection on text that was never meant to be selected.

## Current behavior (from code)

- `css/style.css` has **no default `user-select`**. Everything is selectable unless a rule opts out. Existing rules only opt in (`.selectable-story`, `.help-card`, `.help-text-selectable`, `.reader-title`) or hide ruby readings (`.story-text ruby rt`).
- The custom selection toolbar (Speak, Translate, Explain, Copy; `#selection-toolbar`) is driven by `selectionchange` → `showSelectionToolbar()` → `selectedPassage()`. It only appears for a selection inside `#reader-story` (`selectedBodyPassage`) or the reader title (`selectedTitle`). Selections anywhere else show no toolbar.
- Native menu control is one page-wide host flag, `selectionMenu.setSuppressed` (`js/bridge.js:355`). f459b41 sets it to `true` by default and flips it to `false` on `pointerdown` inside `input, textarea, select, [contenteditable]`, back to `true` on `focusout` from a field (`js/app.js:1675-1682`).
- Side effect of that toggle: the flag is `true` for **every non-field target**, including explanation-card text (`.help-text-selectable`). Those areas are deliberately selectable (DESIGN.md line 24) but currently have **neither** the toolbar nor the native menu, so Copy is unavailable there. This is a gap, not only a Create-screen issue.
- The browser (dev server) has no native Android menu, so the suppression only matters in App². Browser checks cover `user-select` and toolbar behavior; menu behavior is pending device verification.

## Principle

Deny by default, allow by whitelist. Add `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none` on `body`, then opt in only where reading, copying or acting on text is the point. Fields opt back in explicitly (`input, textarea, select-with-text, [contenteditable]` get `user-select: text`) so typing, caret handles and Cut/Copy/Paste keep working.

## Plan table

Menu column: **Toolbar** = LingoMage toolbar, native menu suppressed. **Native** = Android menu, flag `false`. **None** = not selectable.

| Screen | Element | Selectable? | Menu | Notes |
|---|---|---|---|---|
| Shell | App title "LingoMage" (`h1`) | No | None | Chrome |
| Shell | Bottom tab bar, tab labels, story-count badge | No | None | Buttons; no text selection |
| Shell | Toast | No | None | Transient status |
| Create | Headline "Build a story…", intro paragraph | No | None | Reported bug |
| Create | Field labels, segmented-control labels, helper/description text, character hints | No | None | Instructions |
| Create | Story brief `textarea`, any text input | Yes | **Native** | Must keep Cut/Copy/Paste |
| Create | `select` (language, difficulty) | No text selection; opens picker | n/a | Picker is OS UI |
| Create | Reading scope segmented buttons, Create button | No | None | Buttons |
| Create | Loading card ("Writing your story…", status) | No | None | Transient |
| Create | Generation/checkpoint recovery panels (headings, buttons) | No | None | Buttons and instructions |
| Create | Recovery error text (`form-error`) | Yes (opt in) | **Native** | Users copy errors for bug reports; see decision 2 |
| My stories | Eyebrow, "My stories" heading, language filter | No | None | Chrome |
| My stories | Story card (language tag, title, meta, tray, Select/Delete) | No | None | Long-press/swipe gestures own this surface; `user-select: none` also avoids selection fighting `wireLongPress` |
| My stories | Selection toolbar (count, delete, finish) | No | None | Chrome |
| My stories | Empty-state text | No | None | Instructions |
| Settings | Eyebrow, heading, legends, helper text, "Saves on this device" | No | None | Instructions |
| Settings | AI setup instructions (“Connect an AI provider…”) | No | None | Instructions; no value in copying |
| Settings | Language preference textareas (`expectations-*`), any text inputs | Yes | **Native** | Fields |
| Settings | Model/reasoning `select`, language checkboxes | No | None | Controls |
| Reader | Meta line (language, Chapter n of m) | No | None | Chrome |
| Reader | **Title** (`#reader-title`) | Yes | **Toolbar** | Already supported (`selectedTitle`) |
| Reader | **Story body** (`#reader-story`) | Yes | **Toolbar** | Primary use. Keep ruby `rt` unselectable so copied Japanese omits readings |
| Reader | Kebab menu, Listen, chapter nav, text-size, Furigana label, path select | No | None | Controls |
| Reader | Chapter context note, chapter status | No | None | Instructions/status |
| Reader | Reader edit panel: follow-up `textarea` | Yes | **Native** | Field |
| Reader | Reader edit panel: labels, helpers, scope buttons | No | None | |
| Reader | "Explanations" heading | No | None | Chrome |
| Reader | **Explanation card text** (quote, body, context translation, follow-up Q/A, examples) | Yes | **Native** (proposed) | Today: neither menu. See decision 1 |
| Reader | Explanation card non-text surface, checkboxes, buttons, follow-up input | Card surface: no (long-press selects card). Follow-up `input`: yes | Input: **Native** | Preserves DESIGN.md line 24 behavior |
| Reader | Vocabulary note popover (`#word-note-popover`) | Yes | **Native** (proposed) | Short glossary text users may want to copy |
| Reader | Generation bar message, recovery panels | No (errors: yes, **Native**) | | Same rule as Create |
| Dialogs | Confirm dialogs (remove chapters, replace explanation, delete stories): titles, messages, buttons | No | None | Short, owner reads once |
| Dialogs | Dialog `form-error` text | Yes | **Native** | Copyable errors |

## Implementation outline (after approval)

1. **CSS (`css/style.css`)**: `body` default `none` plus `-webkit-touch-callout: none`. Add one opt-in group: fields (`input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea`), `.selectable-story`, `.reader-title`, `.help-card .help-text-selectable`, `.word-note-popover`, and `.form-error`. Remove the now-redundant individual `user-select: text` rules where the group covers them. Keep `ruby rt { user-select: none }`.
2. **Menu routing (`js/app.js:1675-1682`)**: replace `FIELD_SELECTOR` with two named selectors, `NATIVE_MENU_SELECTOR` (fields, `.help-text-selectable`, `.word-note-popover`, `.form-error`) and the toolbar zones (`#reader-story`, `.reader-title`). Flag is `false` for native-menu targets and `true` otherwise. Keep the existing `focusout` re-suppression and the “no repeat host call” guard.
3. **Gesture conflicts**: confirm `wireLongPress` on story cards and explanation cards is unaffected (it already ignores text targets via `ignoreTarget`); confirm explanation-card long-press selection still works when `user-select: none` is the inherited default on the card surface.
4. **Tests**: extend `tests/selection-menu-regression.cjs` (field, explanation text, popover, error text → native; story body/title/chrome → suppressed). Add a CSS-contract test asserting body default is `none` and every opt-in selector is present. Run `python3 scripts/check.py`.
5. **Docs**: update `DESIGN.md` (new selection model and zone table). Also fix its existing contradiction: lines 21 and 22 still say Copy and Speak remain in Android's native menu, while the toolbar now carries Speak and Copy and the native menu is suppressed over story text. `manifest.json` version bump per AGENTS.md since this is a published behavior change.
6. **Verification**: dev server screenshots at desktop and ~390px for Create, My stories, Settings, reader and a confirm dialog, showing chrome unselectable (try a long press / drag-select) and fields, story body and explanation text selectable. Record what was inspected. Native-menu behavior, handle rendering and the toolbar/handle overlap stay **pending on App² for Android**.

## Risks

- `user-select: none` on `body` can break caret placement in some Android WebViews unless fields set `user-select: text` explicitly. The opt-in group covers this; verify typing, cursor handles and paste on device.
- The page-wide flag is racy by nature: it flips on `pointerdown`, so a first long press right after switching zones relies on the host reading the flag at menu time. f459b41 already accepts this; the plan does not make it worse.
- Making labels unselectable is intentional but removes the ability to copy instructions text. Accepted per the request.

## Decisions needed

1. **Explanation cards and vocabulary popover**: use the native Android menu (recommended, small change, gives Copy and Speak) or leave them with no menu as today, or extend the LingoMage toolbar to them (larger change; Explain/Translate semantics don't apply there).
2. **Error messages** (`form-error`): selectable with native menu (recommended) or unselectable like other chrome.
3. **Settings AI setup text**: confirm it stays unselectable.
