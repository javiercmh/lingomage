// Generation status: the one status record (runtime.readerGeneration) for Create, continuation, rewrite and explanation
// requests, painted in the reader bar or the page-level bar; the Ready countdown, swipe to dismiss, the bar's action
// (Cancel, Read, Review, View result) and jumping to the working card. See DESIGN.md (generation status).
// The code is the former app.js section, moved verbatim; app.js calls createGenerationBar where it used to be.

export function createGenerationBar({
  $, activeChapter, activeVersion, maybeStartBackgroundContext, notesProgressMessage, openReader,
  persistReaderPosition, persistReaderStory, readerPanel, readerStory, releaseInvalidReaderResponse,
  rememberReaderPosition, revealRecovery, runtime, savePendingReaderResult, selectedPath, setView, state, toast,
  updateReader
}) {
  // One status record covers Create, continuation, rewrite and explanation requests. It is shown in the reader bar
  // while that story is open and in the page-level bar everywhere else (any tab, reader closed, or another story's reader).
  function setReaderGeneration(value) {
    runtime.readerGeneration = value;
    renderReaderGeneration();
  }
  // "Working" is displayed only while a request is actually live, so a cancelled, failed or abandoned request never leaves a stale status.
  function generationLive() { return Boolean(runtime.creatingStory || runtime.backgroundRun || runtime.pipeline?.busy || state.readerEditBusy || state.readerHelpBusy || state.requestId); }
  function definePopoverOpen() { const popover = $('word-note-popover'); return Boolean(popover && !popover.hidden && popover.dataset.define === 'true'); }
  function isViewingChapter(target) {
    if (!target?.storyId || !target.chapterId || !target.versionId) return false;
    if (!$('reader-dialog').open || state.readerId !== target.storyId) return false;
    const story = typeof readerStory === 'function' ? readerStory() : state.stories?.find?.(item => item.id === state.readerId);
    if (!story) return false;
    const path = typeof selectedPath === 'function' ? selectedPath(story) : null;
    if (target.pathId && path?.id !== target.pathId) return false;
    const chapter = typeof activeChapter === 'function' ? activeChapter(story) : null;
    const version = typeof activeVersion === 'function' ? activeVersion(chapter, story) : null;
    return Boolean(chapter && version && chapter.id === target.chapterId && version.id === target.versionId);
  }
  function generationView(status) {
    if (!status) return null;
    const pending = state.pendingReaderResult;
    if (pending && pending.story.id === status.storyId) return { message: pending.saved ? 'Response saved. Finish request.' : 'Response needs saving.', action: pending.saved ? 'Finish request' : 'Save response', dismiss: false };
    // Define shows its progress and Cancel in the note popover at the word, so the bar stays hidden while that is open.
    if (status.phase === 'working' && status.kind === 'define' && definePopoverOpen()) return null;
    if (status.phase === 'working') {
      if (!generationLive()) return null;
      if (status.readyTarget) return { message: status.message, action: `Read Ch. ${status.readyTarget.chapterNumber}`, dismiss: false, working: true, readyJump: true };
      return { message: status.message, action: 'Cancel', dismiss: false, working: true };
    }
    return { message: status.message, action: { cleanup: 'Finish request', error: 'Review', ready: status.actionLabel || 'View result' }[status.phase] || '', dismiss: true };
  }
  function paintGenerationBar(bar, view) {
    bar.hidden = !view;
    if (!view) { bar.classList?.toggle?.('dismissible', false); return; }
    const pageBar = bar.id === 'generation-status-bar';
    const [message, action, dismiss, jumpId] = pageBar
      ? ['generation-status-message', 'generation-status-action', 'generation-status-dismiss', 'generation-status-jump']
      : ['reader-generation-message', 'reader-generation-action', 'reader-generation-dismiss', 'reader-generation-jump'];
    // Rewriting identical live-region text can be announced again, so only changed text is written.
    if ($(message).textContent !== view.message) $(message).textContent = view.message;
    $(action).hidden = !view.action; $(action).textContent = view.action;
    $(action).disabled = Boolean(view.working && !view.readyJump) && !cancelAvailable();
    $(dismiss).hidden = !view.dismiss;
    bar.classList.toggle('working', Boolean(view.working)); // the compact bar shows a spinner while work runs
    bar.classList?.toggle?.('dismissible', Boolean(view.dismiss));
    const jump = $(jumpId);
    if (jump) {
      jump.disabled = !view.canJump;
      jump.classList?.toggle?.('can-jump', Boolean(view.canJump));
      jump.setAttribute?.('aria-label', view.canJump ? `${view.message}. Jump to generation details` : view.message);
    }
  }
  // Cancel is possible only while an operation stage or a memory request is live; the chapter card follows the bar.
  function cancelAvailable() { return !runtime.pipeline?.records?.[0]?.discardRequested && Boolean(runtime.pipeline?.busy || state.activeChapterRequest && !state.activeChapterRequest.cancelledByUser || document.querySelector('.reader-ai-cancel')); }
  // Ready hides itself after READY_STATUS_MS unless marked persistent; the result stays in the reader. Hovering or focusing
  // the bar, or a hidden page, postpones it, and returning to the page restarts the full countdown. Working, errors,
  // cleanup and unsaved responses stay until handled.
  const READY_STATUS_MS = 8000;
  let readyTimer = null, readyStatus = null;
  function scheduleReadyDismiss(status, view) {
    const ready = Boolean(view?.dismiss) && status?.phase === 'ready' && !status?.persistent;
    if (ready && readyStatus === status) return;
    clearTimeout(readyTimer); readyTimer = null; readyStatus = ready ? status : null;
    if (ready) readyTimer = setTimeout(expireReadyStatus, READY_STATUS_MS);
  }
  function expireReadyStatus() {
    const status = readyStatus; readyTimer = null;
    if (!status || runtime.readerGeneration !== status || status.phase !== 'ready') { readyStatus = null; return; }
    const held = ['reader-generation-bar', 'generation-status-bar'].some(id => { const bar = $(id); return !bar.hidden && (bar.matches?.(':hover') || bar.contains?.(document.activeElement)); });
    if (held || document.visibilityState === 'hidden') { readyTimer = setTimeout(expireReadyStatus, READY_STATUS_MS); return; }
    readyStatus = null; setReaderGeneration(null);
  }
  function restartReadyCountdown() {
    if (!readyStatus) return;
    clearTimeout(readyTimer); readyTimer = setTimeout(expireReadyStatus, READY_STATUS_MS);
  }
  function elementInView(card, inReader) {
    if (!card || card.hidden || !card.getClientRects?.().length) return false;
    const rect = card.getBoundingClientRect();
    const top = inReader ? $('reader-navigation-bar')?.getBoundingClientRect?.().bottom || 0 : 0;
    const bottom = inReader ? window.innerHeight : document.querySelector?.('.tabbar')?.getBoundingClientRect?.().top || window.innerHeight;
    // Ignore a sliver behind fixed navigation; do not use the status bar itself as a boundary.
    return rect.right > 0 && rect.left < window.innerWidth && Math.min(rect.bottom, bottom) - Math.max(rect.top, top) >= Math.min(44, rect.height);
  }
  function recoveryCardInView(status) {
    if (status?.phase !== 'error') return false;
    const inReader=$('reader-dialog').open, op=runtime.pipeline?.records?.[0];
    if (inReader && status.storyId !== state.readerId) return false;
    const checkpoint=op && (op.target?.storyId ?? null) === (status.storyId ?? null);
    const cards=checkpoint
      ? (inReader ? [$('checkpoint-recovery-reader')] : [$('checkpoint-recovery-create'),$('checkpoint-recovery-profile')])
      : inReader ? [...(document.querySelectorAll?.('.help-request-recovery') || []), $('reader-memory-recovery')] : [];
    return cards.some(card => elementInView(card, inReader));
  }
  function workingCardInView(status) {
    if (status?.phase !== 'working' || state.pendingReaderResult) return false;
    if (status.storyId == null) {
      const createCard = $('loading-card');
      if (!$('view-create').classList.contains('active') || $('reader-dialog').open || createCard.hidden) return false;
      // Live browsers measure viewport overlap so scrolling past Create's card reveals the pill; layoutless test mocks treat an unhidden card as visible.
      return createCard.getClientRects?.().length ? elementInView(createCard, false) : true;
    }
    if (!$('reader-dialog').open || status.storyId !== state.readerId) return false;
    const cards = [
      ...(state.activeChapterRequest?.storyId === status.storyId ? [$('reader-chapter-status')] : []),
      ...(document.querySelectorAll?.('#reader-help .help-loading') || [])
    ];
    return cards.some(card => elementInView(card, true));
  }
  function canJumpToWorkingCard(status, view) {
    if (!view?.working || runtime.backgroundRun) return false;
    if (status.storyId == null) return !$('loading-card').hidden;
    const sameReader = $('reader-dialog').open && status.storyId === state.readerId;
    const chapterCard = state.activeChapterRequest?.storyId === status.storyId && !state.activeChapterRequest.opened && (!$('reader-chapter-status').hidden || !sameReader);
    const helpCard = sameReader ? Boolean(document.querySelector?.('#reader-help .help-loading')) : false;
    return Boolean(chapterCard || helpCard);
  }
  function renderReaderGeneration() {
    const bar = $('reader-generation-bar'), appBar = $('generation-status-bar');
    if (!bar || !appBar) return;
    if (runtime.readerGeneration?.phase === 'ready' && !runtime.readerGeneration.helpId && isViewingChapter(runtime.readerGeneration)) {
      runtime.readerGeneration = null;
    } else if (runtime.readerGeneration?.phase === 'working' && runtime.readerGeneration.readyTarget && isViewingChapter(runtime.readerGeneration.readyTarget)) {
      delete runtime.readerGeneration.readyTarget;
      const op = runtime.pipeline?.records?.[0];
      if (op?.earlyApplied) runtime.readerGeneration.message = typeof notesProgressMessage === 'function' ? notesProgressMessage(op) : 'Adding notes…';
      if (state.activeChapterRequest?.storyId === state.readerId) state.activeChapterRequest.opened = true;
      $('reader-chapter-status').hidden = true;
    }
    const status = runtime.readerGeneration;
    const view = recoveryCardInView(status) || workingCardInView(status) ? null : generationView(status);
    if (view) view.canJump = canJumpToWorkingCard(status, view);
    scheduleReadyDismiss(status, view);
    const inReader = Boolean(view) && status.storyId != null && status.storyId === state.readerId && $('reader-dialog').open;
    const page = view && !inReader ? view : null;
    const inDialog = Boolean(page) && $('reader-dialog').open;
    document.querySelectorAll('.chapter-cancel').forEach(button => { button.disabled = !cancelAvailable(); });
    paintGenerationBar(bar, inReader ? view : null);
    paintGenerationBar(appBar, page);
    // Inside an open reader the page-level bar occupies the same bottom edge as the reader bar, so it shares its scroll and notice offsets.
    readerPanel().classList.toggle('has-generation-status', inReader || inDialog);
    const shown = inReader ? bar : inDialog ? appBar : null, panelStyle = readerPanel().style;
    if (shown && shown.offsetHeight) panelStyle?.setProperty('--generation-bar-height', `${shown.offsetHeight}px`); else panelStyle?.removeProperty?.('--generation-bar-height');
    document.body.classList.toggle('has-app-generation-status', Boolean(page) && !inDialog);
    // A modal dialog makes the page inert, so the page-level bar moves into the topmost open dialog, as the toast does.
    if (page) { const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body; if (appBar.parentNode !== host) host.append(appBar); }
    maybeStartBackgroundContext();
  }
  for (const id of ['reader-generation-dismiss', 'generation-status-dismiss']) $(id).addEventListener('click', () => setReaderGeneration(null));
  let recoveryVisibilityFrame=0;
  function scheduleRecoveryVisibility() {
    if (!['error', 'working'].includes(runtime.readerGeneration?.phase) || recoveryVisibilityFrame) return;
    recoveryVisibilityFrame=requestAnimationFrame(()=>{ recoveryVisibilityFrame=0; renderReaderGeneration(); });
  }
  // Resolves after the reader's own close handler has run (the close event is dispatched asynchronously).
  function closeReader() {
    const dialog = $('reader-dialog');
    if (!dialog.open) return Promise.resolve();
    return new Promise(resolve => { dialog.addEventListener('close', resolve, { once: true }); dialog.close(); });
  }
  // Opens the story's reader. Switching from another story's reader keeps and replaces that reader's history entry
  // instead of going back and pushing again, so a single Back still returns to the Library.
  async function ensureReaderOpen(story) {
    if ($('reader-dialog').open && state.readerId === story.id) return;
    if ($('reader-dialog').open) { state.switchingReader = true; try { await closeReader(); } finally { state.switchingReader = false; } }
    openReader(story);
  }
  async function cancelGeneration() {
    if (runtime.pipeline?.busy) { try { await runtime.pipeline.cancel(); } catch (error) { toast(error.message); } return; }
    if (state.activeChapterRequest) { state.activeChapterRequest.cancelledByUser=true; state.activeChapterRequest.stopped=true; }
    document.querySelector('.reader-ai-cancel')?.click();
  }
  async function openTargetChapter(target) {
    const story = state.stories.find(item => item.id === target.storyId);
    if (!story) { toast('That story is no longer available.'); setReaderGeneration(null); return null; }
    await ensureReaderOpen(story);
    // The result's own path is used, not whichever path happens to hold the same chapter version first.
    const holds = item => item.entries.some(entry => entry.chapterId === target.chapterId && entry.versionId === target.versionId);
    const path = story.paths.find(item => item.id === target.pathId && holds(item)) || story.paths.find(holds);
    if (!path) { toast('That result is no longer available.'); setReaderGeneration(null); return null; }
    if (story.activePathId !== path.id) {
      rememberReaderPosition();
      const previous = story.activePathId; story.activePathId = path.id;
      try { persistReaderStory(story); } catch (error) { story.activePathId = previous; toast(error.message); return null; }
    }
    state.readerChapter = path.entries.findIndex(entry => entry.chapterId === target.chapterId && entry.versionId === target.versionId);
    state.readerPositions[`${story.id}:${path.id}`] = { chapterId: target.chapterId, scrollTop: 0 }; persistReaderPosition();
    updateReader();
    return target.helpId ? [...$('reader-help').querySelectorAll('.help-card')].find(card => card.dataset.helpId === target.helpId) : $('reader-title');
  }
  async function generationAction() {
    const status = runtime.readerGeneration; if (!status) return;
    const pending = state.pendingReaderResult;
    if (pending) {
      // Acknowledging the saved response clears state.pendingReaderResult, so the owning story is captured first.
      try { await savePendingReaderResult(); if ($('reader-dialog').open && state.readerId === pending.story.id) updateReader(); else renderReaderGeneration(); }
      catch (error) { status.message = error.message; renderReaderGeneration(); }
      return;
    }
    if (status.phase === 'cleanup') {
      try { await releaseInvalidReaderResponse(); setReaderGeneration(null); toast('Request cancelled'); }
      catch { toast('Could not finish cancelled request. Try again.'); }
      return;
    }
    if (status.phase === 'working' && status.readyTarget) {
      const focusTarget = await openTargetChapter(status.readyTarget);
      if (!focusTarget) return;
      if (runtime.readerGeneration === status) {
        delete status.readyTarget;
        const op = runtime.pipeline?.records?.[0];
        status.message = op?.earlyApplied && typeof notesProgressMessage === 'function' ? notesProgressMessage(op) : 'Adding notes…';
        if (state.activeChapterRequest?.storyId === status.storyId) state.activeChapterRequest.opened = true;
        $('reader-chapter-status').hidden = true;
        renderReaderGeneration();
      }
      focusTarget.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (status.phase === 'working') { await cancelGeneration(); return; }
    const story = state.stories.find(item => item.id === status.storyId);
    if (status.phase === 'error') {
      const op = runtime.pipeline?.records[0];
      if (!story) { await closeReader(); setView('create'); if (op) revealRecovery(op); return; } // a modal reader would leave the Create page inert
      await ensureReaderOpen(story);
      if (op?.target?.storyId === story.id) { revealRecovery(op); return; }
      revealCard(story.memoryRebuild ? $('reader-memory-recovery') : document.querySelector('.help-request-recovery') || $('reader-edit-panel')); return;
    }
    const focusTarget = await openTargetChapter(status);
    if (!focusTarget) return;
    setReaderGeneration(null);
    if (status.helpId) revealCard(focusTarget); else focusTarget.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }
  for (const id of ['reader-generation-action', 'generation-status-action']) $(id).addEventListener('click', generationAction);
  async function jumpToGenerationCard() {
    const status = runtime.readerGeneration;
    if (!status || status.phase !== 'working' || runtime.backgroundRun) return;
    if (status.storyId == null) {
      await closeReader(); setView('create');
      const card = $('loading-card');
      if (!card.hidden) requestAnimationFrame(() => { card.tabIndex = -1; card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
      return;
    }
    const story = state.stories.find(item => item.id === status.storyId);
    if (!story) return;
    await ensureReaderOpen(story);
    const card = state.activeChapterRequest?.storyId === story.id && !$('reader-chapter-status').hidden
      ? $('reader-chapter-status')
      : document.querySelector('#reader-help .help-loading');
    if (card) revealCard(card);
  }
  for (const id of ['reader-generation-jump', 'generation-status-jump']) $(id).addEventListener('click', jumpToGenerationCard);
  function attachSwipeDismiss(bar) {
    let pointerId = null, startX = 0, startY = 0, startTime = 0, locked = false, dx = 0, suppressClick = false;
    const reset = () => {
      pointerId = null; locked = false; dx = 0;
      bar.classList.remove('swiping');
      bar.style.removeProperty('--bar-swipe-x');
      bar.style.removeProperty('opacity');
    };
    bar.addEventListener('pointerdown', event => {
      if (!bar.classList.contains('dismissible') || pointerId !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerId = event.pointerId; startX = event.clientX; startY = event.clientY; startTime = Date.now(); locked = false; dx = 0;
    });
    bar.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      const moveX = event.clientX - startX, moveY = event.clientY - startY;
      if (!locked) {
        if (Math.hypot(moveX, moveY) < 10) return;
        if (Math.abs(moveX) <= Math.abs(moveY) * 1.4) { pointerId = null; return; }
        locked = true;
        bar.classList.add('swiping');
        bar.setPointerCapture?.(pointerId);
      }
      dx = moveX;
      bar.style.setProperty('--bar-swipe-x', `${dx}px`);
      bar.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / 140));
    });
    const finish = event => {
      if (event.pointerId !== pointerId) return;
      const wasLocked = locked, offset = dx, elapsed = Math.max(1, Date.now() - startTime);
      try { if (wasLocked && bar.hasPointerCapture?.(pointerId)) bar.releasePointerCapture(pointerId); } catch {}
      if (!wasLocked) { pointerId = null; return; }
      const velocity = Math.abs(offset) / elapsed;
      const dismissed = event.type === 'pointerup' && (Math.abs(offset) >= 64 || (Math.abs(offset) >= 28 && velocity >= 0.45));
      if (dismissed) {
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 120);
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const finishDismiss = () => { reset(); setReaderGeneration(null); };
        if (reduce) { finishDismiss(); return; }
        pointerId = null; locked = false;
        bar.classList.remove('swiping');
        bar.style.setProperty('--bar-swipe-x', `${Math.sign(offset || 1) * 180}px`);
        bar.style.opacity = '0';
        setTimeout(finishDismiss, 160);
      } else {
        reset();
      }
    };
    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', finish);
    bar.addEventListener('click', event => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } }, true);
  }
  attachSwipeDismiss($('reader-generation-bar'));
  attachSwipeDismiss($('generation-status-bar'));
  // Scroll the reader only as far as needed to show the bottom of a card; taller cards align at their top.
  function revealCard(card) {
    if (!card) return;
    const panel = document.querySelector('.reader-panel');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      const bars = [...document.querySelectorAll('.reader-generation-bar, .reader-panel .explanation-selection-toolbar')].filter(bar => !bar.hidden && bar.getClientRects().length > 0);
      const barTop = Math.min(window.innerHeight, ...bars.map(bar => bar.getBoundingClientRect().top));
      const navigation = document.querySelector('#reader-navigation-bar');
      const topEdge = 12 + (navigation ? navigation.offsetHeight + (parseFloat(getComputedStyle(navigation).top) || 0) + (parseFloat(getComputedStyle(panel).paddingTop) || 0) : 0);
      const rect = card.getBoundingClientRect(), margin = 12;
      let delta = 0;
      if (rect.height + margin * 2 > barTop - topEdge) delta = rect.top - topEdge;
      else if (rect.bottom + margin > barTop) delta = rect.bottom + margin - barTop;
      else if (rect.top < topEdge) delta = rect.top - topEdge;
      if (delta) panel.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
      card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true });
      card.classList.add('reveal-pulse'); setTimeout(() => card.classList.remove('reveal-pulse'), 1400);
    });
  }
  return {
    cancelGeneration, closeReader, elementInView, ensureReaderOpen, generationAction, generationLive,
    isViewingChapter, renderReaderGeneration, restartReadyCountdown, revealCard, scheduleRecoveryVisibility,
    setReaderGeneration
  };
}
