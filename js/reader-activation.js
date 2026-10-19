// Reader text can carry a vocabulary note (glossary trigger) and a saved explanation (mark) on the same
// characters, nested in either order. These helpers decide what an activation reaches and route it.
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
    if (info && fragment.querySelector(MARK)) info.trigger.setAttribute('aria-label', `Word note for ${info.surface}, with a saved explanation`);
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
    // must also reach an explanation attached only to one of the later fragments.
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
// Vocabulary comes first: text with a note opens it and passes any saved explanation id for the note's
// "View saved explanation" action; explanation-only text jumps straight to the saved card.
export function createReaderActivation({ root, glossaryFor, hasExplanation, selectionCollapsed, closeNote, showNote, showExplanation }) {
  const handled = new WeakSet();
  return function activate(event) {
    if (handled.has(event)) return;
    const found = resolveReaderActivation(event, { root, glossaryFor, hasExplanation });
    if (!found) return;
    handled.add(event);
    if (event.type === 'keydown') event.preventDefault();
    // The click that ends a selection gesture must not navigate or open anything.
    if (!selectionCollapsed()) return;
    const { vocab, helpId } = found;
    if (vocab) showNote(vocab, helpId);
    else { closeNote(); showExplanation(helpId); }
  };
}
