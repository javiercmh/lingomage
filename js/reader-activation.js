// Reader text can carry a vocabulary note (glossary trigger) and a saved explanation (mark) on the same
// characters, nested in either order. These helpers decide what an activation reaches and show the chooser.
import { firstGlossaryMatches } from './reader-text.js';

const GLOSSARY = '.gloss-note-trigger';
const MARK = 'mark.explained-expression';
const elementOf = node => (node && node.nodeType === 3 ? node.parentElement : node) || null;

// Every rendered glossary fragment (including secondary ruby fragments) shares its match's notes and primary control.
// The index is rebuilt from the same deterministic matcher annotatedText uses, so reader-text.js stays unchanged.
const triggerNotes = new WeakMap();
export function glossaryForTrigger(trigger) { return triggerNotes.get(trigger) || null; }
export function indexGlossaryTriggers(root, canonical, glossary = []) {
  const matches = firstGlossaryMatches(canonical, glossary, { nested: true });
  const primaries = new Map();
  let offset = 0;
  const visit = node => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { offset += child.nodeValue.length; continue; }
      if (child.nodeType !== 1 || child.matches('rt')) continue;
      if (child.matches(GLOSSARY)) {
        // The innermost covering match owns the fragment; an outer phrase owns only the text around an inner form.
        const match = matches.filter(item => item.start <= offset && offset < item.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
        if (match) {
          if (!primaries.has(match)) primaries.set(match, child);
          triggerNotes.set(child, { trigger: primaries.get(match), notes: match.notes, surface: canonical.slice(match.start, match.end) });
        }
      }
      visit(child);
    }
  };
  visit(root);
}

// Glossary controls own their marked text's keyboard action. Keep one independent control for
// each explanation's first fragment outside a glossary, without nesting button roles.
export function normalizeReaderControls(root) {
  for (const fragment of root.querySelectorAll(GLOSSARY)) {
    const info = glossaryForTrigger(fragment);
    if (info) info.trigger.setAttribute('aria-label', `Word note for ${info.surface}`);
  }
  const marks = [...root.querySelectorAll(MARK)], labels = new Map(), seen = new Set();
  for (const mark of marks) if (mark.getAttribute('aria-label')) labels.set(mark.dataset.helpId, mark.getAttribute('aria-label'));
  for (const mark of marks) {
    const id = mark.dataset.helpId;
    mark.removeAttribute('role'); mark.removeAttribute('tabindex'); mark.removeAttribute('aria-label');
    if (mark.closest(GLOSSARY) || seen.has(id)) continue;
    seen.add(id); mark.setAttribute('role', 'button'); mark.tabIndex = 0;
    mark.setAttribute('aria-label', labels.get(id) || 'Show saved explanation');
  }
  for (const fragment of root.querySelectorAll(GLOSSARY)) {
    const info = glossaryForTrigger(fragment);
    if (info && fragment.querySelector(MARK)) info.trigger.setAttribute('aria-label', `Vocabulary note or saved explanation for ${info.surface}`);
  }
}

// Resolve the destinations of one click or key press inside `root`. Returns null when it hit neither.
// A key press lands on the focused control, which may be the outer element of the pair, so the inner one is found by descent.
export function resolveReaderActivation(event, { root, glossaryFor, hasExplanation }) {
  const target = elementOf(event.target);
  if (!target || !root.contains(target)) return null;
  const keyboard = event.type === 'keydown';
  let trigger = target.closest(GLOSSARY), mark = target.closest(MARK);
  if (keyboard && !mark && trigger) {
    const primary = glossaryFor(trigger)?.trigger;
    // A single Japanese glossary control can span multiple ruby fragments. Its keyboard action
    // must also offer an explanation attached only to one of the later fragments.
    mark = trigger.querySelector(MARK) || [...root.querySelectorAll(GLOSSARY)]
      .filter(fragment => primary && glossaryFor(fragment)?.trigger === primary)
      .map(fragment => fragment.querySelector(MARK)).find(Boolean);
  }
  if (keyboard && !trigger && mark) trigger = mark.querySelector(GLOSSARY);
  const vocab = trigger ? glossaryFor(trigger) : null;
  const helpId = mark && mark.dataset?.helpId && hasExplanation(mark.dataset.helpId) ? mark.dataset.helpId : '';
  if (!vocab && !helpId) return null;
  return { vocab, helpId, mark: helpId ? mark : null, anchor: mark || trigger };
}

// One dispatcher owns every tap, Enter and Space on story text, so nested or overlapping controls activate once.
// A single destination opens directly; a vocabulary note over a saved explanation asks which to open.
export function createReaderActivation({ root, chooser, glossaryFor, hasExplanation, selectionCollapsed, closeNote, showNote, showExplanation }) {
  const handled = new WeakSet();
  return function activate(event) {
    if (handled.has(event)) return;
    const found = resolveReaderActivation(event, { root, glossaryFor, hasExplanation });
    if (!found) return;
    handled.add(event);
    if (event.type === 'keydown') event.preventDefault();
    // The click that ends a selection gesture must not navigate or open anything.
    if (!selectionCollapsed()) return;
    const { vocab, helpId, mark, anchor } = found;
    const openNote = () => showNote(vocab);
    if (vocab && helpId) {
      if (chooser.key === anchor) { chooser.close(true); return; }
      closeNote();
      const siblings = [...root.querySelectorAll('mark.explained-expression')].filter(node => node.dataset.helpId === helpId);
      chooser.show({
        anchor, returnFocus: [anchor, mark, vocab.trigger, ...siblings].find(node => node && node.tabIndex >= 0),
        options: [{ label: 'Vocabulary note', run: openNote }, { label: 'Saved explanation', run: () => showExplanation(helpId) }]
      });
    } else if (vocab) { chooser.close(); openNote(); }
    else { chooser.close(); closeNote(); showExplanation(helpId); }
  };
}

// Anchored, nonmodal two-action popover. It owns focus, Escape, outside-press, scroll and resize dismissal.
export function createSourceChooser({ element, document, window }) {
  let open = null;
  const isOpen = () => open !== null;
  function close(restoreFocus = false) {
    if (!open) return;
    const { returnFocus, key } = open; open = null;
    element.hidden = true; element.textContent = '';
    if (restoreFocus && returnFocus?.isConnected !== false) returnFocus?.focus?.({ preventScroll: true });
    return key;
  }
  function place(anchor) {
    const rect = anchor.getBoundingClientRect(), width = window.innerWidth, height = window.innerHeight;
    const box = element.getBoundingClientRect();
    element.style.left = `${Math.max(12, Math.min(width - (box.width || 220) - 12, rect.left))}px`;
    const below = rect.bottom + 8, fits = below + (box.height || 100) <= height - 12;
    element.style.top = `${fits ? below : Math.max(12, rect.top - (box.height || 100) - 8)}px`;
  }
  // `key` identifies the activated control: activating it again closes the chooser instead of reopening it.
  function show({ anchor, key = anchor, returnFocus = null, options }) {
    if (open && open.key === key) { close(true); return false; }
    close();
    element.textContent = '';
    const buttons = options.map(option => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'source-chooser-option'; button.textContent = option.label;
      button.addEventListener('click', () => { close(); option.run(); });
      element.append(button); return button;
    });
    open = { key, anchor, returnFocus: returnFocus || anchor };
    element.hidden = false; place(anchor);
    buttons[0].focus({ preventScroll: true });
    return true;
  }
  document.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    const arrow = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    const buttons = [...element.querySelectorAll('button')], index = buttons.indexOf(event.target);
    if (arrow && index >= 0) { event.preventDefault(); buttons[(index + arrow + buttons.length) % buttons.length].focus({ preventScroll: true }); }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!open) return;
    const target = elementOf(event.target);
    // A press on text that can open the chooser lets the following click replace or toggle it.
    if (element.contains(target) || target?.closest?.(`${GLOSSARY}, ${MARK}`)) return;
    close();
  }, true);
  document.addEventListener('scroll', event => { if (open && !element.contains(event.target)) close(); }, true);
  window.addEventListener('resize', () => close());
  return { show, close, isOpen, get key() { return open?.key ?? null; }, contains: node => element.contains(node) };
}
