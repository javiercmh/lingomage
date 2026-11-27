// Routes Android's native selection menu: suppressed on story and title text (the LingoMage toolbar
// replaces it), available in fields, explanation text, vocabulary notes and errors. The host flag is
// page-wide, so it follows the touch or selection target. Selection gestures are never prevented.
export const FIELD_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// Targets that keep Android's native menu. All other chrome is unselectable.
export const NATIVE_MENU_SELECTOR = `${FIELD_SELECTOR}, .help-text-selectable, .word-note-popover, .form-error`;
export const READER_TEXT_SELECTOR = '#reader-story, #reader-title';

const elementOf = node => (node && node.nodeType === 3 ? node.parentElement : node) || null;
const insideNative = node => Boolean(elementOf(node)?.closest?.(NATIVE_MENU_SELECTOR));
const insideReaderText = node => Boolean(elementOf(node)?.closest?.(READER_TEXT_SELECTOR));
const selectionTouchesReader = window => {
  const selection = window.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && (insideReaderText(selection.anchorNode) || insideReaderText(selection.focusNode)));
};

export function createSelectionMenuRouter({ host, document, window }) {
  // Only a value the host acknowledged is cached; a failed or unavailable host is asked again on the next event.
  let confirmed = null;
  function apply(suppressed) {
    if (confirmed === suppressed) return true;
    let acknowledged = false;
    try { acknowledged = host.setSuppressed(suppressed) === true; } catch { acknowledged = false; }
    if (acknowledged) confirmed = suppressed;
    return acknowledged;
  }
  const routeTarget = target => apply(!insideNative(target));
  // A selection is routed by where it lives; one touching story or title text always uses the LingoMage toolbar.
  function routeSelection() {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.anchorNode) return false;
    if (insideReaderText(selection.anchorNode) || insideReaderText(selection.focusNode)) return apply(true);
    // A field selection reports the field's container, so the focused field decides.
    if (document.activeElement?.matches?.(FIELD_SELECTOR)) return apply(false);
    return apply(!insideNative(selection.anchorNode));
  }
  document.addEventListener('pointerdown', event => routeTarget(event.target), true);
  document.addEventListener('focusin', event => { if (event.target?.matches?.(FIELD_SELECTOR)) apply(false); }, true);
  document.addEventListener('focusout', event => {
    if (event.target?.closest?.(FIELD_SELECTOR) && !event.relatedTarget?.closest?.(NATIVE_MENU_SELECTOR)) apply(true);
  }, true);
  document.addEventListener('selectionchange', routeSelection);
  // Only the long-press menu on story and title text is cancelled; fields, notes, explanations and errors keep theirs.
  document.addEventListener('contextmenu', event => {
    const element = elementOf(event.target);
    // Android may dispatch the menu event at the selection's common ancestor (or the document),
    // rather than at the word that was long-pressed. Route by the live selection as well.
    const selectedReaderText = selectionTouchesReader(window);
    if ((!element?.closest?.(READER_TEXT_SELECTOR) && !selectedReaderText) || (insideNative(element) && !selectedReaderText)) return;
    apply(true);
    event.preventDefault();
  }, true);
  apply(true);
  return {
    // Reader entry starts from a clean suppressed state even if an earlier host call was not acknowledged.
    reset: () => { confirmed = null; return apply(true); },
    route: routeTarget,
    get confirmed() { return confirmed; }
  };
}
