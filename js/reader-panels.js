// Nonmodal reader panel interactions with explicit lifecycle and injected DOM.
export function createReaderPanels({state, $, window, document, getComputedStyle, readerPanel, closeWordNote, persistSettings, toast}) {
  function closeReaderActions(restoreFocus = false) {
    $('reader-actions-menu').hidden = true; $('reader-actions-toggle').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('reader-actions-toggle').focus();
  }
  // Nonmodal reader panels share dismissal and viewport-safe positioning.
  const READER_PANELS = ['navigation', 'preferences'];
  function closeReaderPanels(restoreFocus = false) {
    for (const name of READER_PANELS) {
      const panel = $(`reader-${name}-panel`), toggle = $(`reader-${name}-toggle`);
      const wasOpen = !panel.hidden;
      panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus && wasOpen) toggle.focus({ preventScroll: true });
    }
  }
  function positionReaderPanel(name) {
    const panel = $(`reader-${name}-panel`), rect = $(`reader-${name}-toggle`).getBoundingClientRect();
    // Measure within the dialog's safe-area-aware content bounds.
    const bounds = readerPanel().getBoundingClientRect(), style = getComputedStyle(readerPanel());
    const left = Math.max(12, bounds.left + parseFloat(style.paddingLeft || 0));
    const right = Math.min(window.innerWidth - 12, bounds.right - parseFloat(style.paddingRight || 0));
    const top = Math.max(12, bounds.top + parseFloat(style.paddingTop || 0));
    const bottom = Math.min(window.innerHeight - 12, bounds.bottom - parseFloat(style.paddingBottom || 0));
    panel.style.width = `${Math.min(280, right - left)}px`;
    panel.style.maxHeight = `${Math.max(44, bottom - top)}px`;
    const { width, height } = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(left, Math.min(rect.left, right - width))}px`;
    panel.style.top = `${Math.max(top, Math.min(rect.bottom + height + 6 > bottom ? rect.top - height - 6 : rect.bottom + 6, bottom - height))}px`;
  }
  function toggleReaderPanel(name) {
    const panel = $(`reader-${name}-panel`), wasOpen = !panel.hidden;
    closeReaderPanels(); closeReaderActions(); closeWordNote();
    if (wasOpen) return;
    panel.hidden = false; $(`reader-${name}-toggle`).setAttribute('aria-expanded', 'true');
    positionReaderPanel(name);
    const first = name === 'preferences' ? $('reader-text-size') : !$('path-control').hidden ? $('path-select') : $('chapter-select');
    first.focus({ preventScroll: true });
  }
  function setReaderTextSize(value) {
    state.readerFontSize = Math.max(15, Math.min(30, Number(value) || 19));
    $('reader-story').style.fontSize = `${state.readerFontSize}px`;
    $('reader-text-size').value = String(state.readerFontSize);
    $('reader-text-size').setAttribute('aria-valuetext', `${state.readerFontSize} pixels`);
  }
  function updateReaderNavigation() {
    if (!$('reader-dialog').open) return;
    const bar = $('reader-navigation-bar');
    const inset = (parseFloat(getComputedStyle(bar).top) || 0) + (parseFloat(getComputedStyle(readerPanel()).paddingTop) || 0);
    const pinned = readerPanel().scrollTop > 0 && bar.getBoundingClientRect().top <= readerPanel().getBoundingClientRect().top + inset + .5;
    bar.classList.toggle('is-floating', pinned);
  }

  let cleanup = [];
  function dispose() { for (const remove of cleanup.splice(0)) remove(); closeReaderPanels(); }
  function initialize() {
    dispose();
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanup.push(() => target.removeEventListener(type, handler, options));
    };
    for (const name of READER_PANELS) listen($(`reader-${name}-toggle`), 'click', () => toggleReaderPanel(name));
    listen($('reader-text-size'), 'input', () => setReaderTextSize($('reader-text-size').value));
    listen($('reader-text-size'), 'change', () => { try { persistSettings(); } catch (error) { toast(error.message); } });
    listen(document, 'pointerdown', event => {
      if (!event.target.closest?.('.reader-floating-panel, #reader-navigation-toggle, #reader-preferences-toggle')) closeReaderPanels();
    });
    // Wheel scrolling outside a floating panel is deliberate dismissal; layout scrolls are not.
    listen(document, 'wheel', event => {
      if (!event.target.closest?.('.reader-floating-panel')) closeReaderPanels();
    }, { passive: true });
    listen(document, 'keydown', event => {
      if (event.key === 'Escape' && READER_PANELS.some(name => !$(`reader-${name}-panel`).hidden)) {
        event.preventDefault(); event.stopPropagation(); closeReaderPanels(true);
  }
}, true);
  }
  return {closeReaderActions,closeReaderPanels,positionReaderPanel,toggleReaderPanel,setReaderTextSize,updateReaderNavigation,initialize,dispose};
}
