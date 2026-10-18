// Preference-save feedback. The reader is a modal dialog, so a page-level panel would sit behind it:
// the same notice is rendered in the page and inside the reader, and only the visible one is a live alert.
// A notice is rebuilt only when its content changes, so repeated failures neither move keyboard focus
// nor re-announce the same alert.

// Why a reload would lose the learner's work; an empty string when it is safe.
export function unsavedWorkReason({state, pipeline, persistence}) {
  if (persistence?.pending) return 'A preference change has not been saved yet. Use Retry save first.';
  if (pipeline?.busy || state.requestId || state.readerEditBusy || state.readerHelpBusy) return 'An AI request is running. Cancel it or wait for it to finish before reloading.';
  if (state.pendingReaderResult || state.pendingGeneration || state.pendingStoryRequestId || state.pendingReaderRequestId) return 'A completed response has not been saved. Save or release it before reloading.';
  return '';
}

export function createSettingsFeedback({$, document, persistence, readerOpen = () => false}) {
  let current = null, origin = null;
  const places = [['settings-write-error', false], ['reader-settings-error', true]];
  const readerNotice = $('reader-settings-error'), panel = readerNotice.closest?.('.reader-panel');
  // A fixed notice must leave enough scroll space for the chapter's final actions.
  // Measure its layout height so wrapping, enlarged text and narrow widths remain usable.
  function reserveReaderSpace() {
    if (!panel) return;
    panel.classList.toggle('has-settings-notice', !readerNotice.hidden);
    if (readerNotice.hidden) panel.style.removeProperty('--settings-notice-height');
    else panel.style.setProperty('--settings-notice-height', `${readerNotice.offsetHeight}px`);
  }
  const Observer = document.defaultView?.ResizeObserver;
  if (panel && Observer) new Observer(reserveReaderSpace).observe(readerNotice);
  function messageFor(info, inReader) {
    if (info.code === 'write_failed') return `${info.message} Your previous settings are still in effect.`;
    if (info.code === 'store_invalid') return `${info.message}${inReader ? ' Close the reader, then use Retry loading.' : ''}`;
    return info.message;
  }
  function render() {
    for (const [id, inReader] of places) {
      const box = $(id), open = readerOpen(), visible = Boolean(current) && (!inReader || open);
      const live = visible && inReader === open, key = JSON.stringify([visible, live, current]);
      if (box.dataset.key === key) continue;
      box.dataset.key = key; box.textContent = ''; box.hidden = !visible;
      if (live) box.setAttribute('role', 'alert'); else box.removeAttribute('role');
      if (!visible) { if (inReader) reserveReaderSpace(); continue; }
      const heading = document.createElement('strong'); heading.textContent = 'Preference not saved';
      const message = document.createElement('p'); message.className = 'form-error'; message.textContent = messageFor(current, inReader);
      box.append(heading, message);
      if (!current.retryable) { if (inReader) reserveReaderSpace(); continue; }
      const status = document.createElement('p'); status.className = 'helper'; status.setAttribute('role', 'status');
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-btn'; retry.textContent = 'Retry save';
      retry.setAttribute('aria-label', 'Retry saving the preference change');
      retry.addEventListener('click', () => {
        const held = document.activeElement === retry;
        if (persistence.retry()) { if (held && origin?.isConnected !== false) origin?.focus?.(); return; }
        status.textContent = 'Still could not save. Your previous settings are unchanged.';
      });
      const actions = document.createElement('div'); actions.className = 'recovery-actions'; actions.append(retry);
      box.append(actions, status);
      if (inReader) reserveReaderSpace();
    }
  }
  // After a successful retry the notice disappears; focus returns to the control the learner was using.
  return {
    show(info) {
      const active = document.activeElement;
      if (!places.some(([id]) => $(id).contains(active))) origin = active;
      current = info; render();
    },
    clear() { if (!current) return; current = null; render(); },
    // Called when the reader opens or closes so the notice follows the visible surface.
    sync() { render(); },
    get current() { return current; }
  };
}
