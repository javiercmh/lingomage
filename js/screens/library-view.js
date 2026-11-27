// Library: story cards, the hero, sort, Story Actions popover, long-press selection and deletion.
// The code is the former app.js section, moved verbatim; app.js calls createLibraryView where it used to be.
// Ordering and date labels are js/screens/library-activity.js.
import { dateSegments, describeDates, planLibrary } from './library-activity.js';

export function createLibraryView({
  $, LANGUAGES, beginStorySelection, finishDeletedStoryReader, leaveStorySelection, openReader, openShareDialog,
  pendingDeletionBlocked, removeSelectedStories, state, syncStorySelection, toast, toggleStorySelection
}) {
  // Story Actions popover: a labelled group of native buttons beside the open control; no drag gesture.
  function closeStoryMenu(restoreFocus = false) {
    const menu = state.storyMenu; if (!menu) return;
    state.storyMenu = null; menu.popover.remove(); menu.trigger.setAttribute('aria-expanded', 'false');
    // A result saved while the popover was open re-renders now; focus then returns to the Actions button of the rebuilt card.
    if (state.libraryStale && !state.storySelectionMode && !state.shareDialog) renderLibrary();
    if (!restoreFocus) return;
    const list = $('library-list');
    const target = menu.trigger.isConnected ? menu.trigger : list.querySelector(`[data-story-id="${CSS.escape(menu.id)}"] .story-menu-toggle`) || list.querySelector('.story-open');
    target?.focus({ preventScroll: true });
  }
  function openStoryMenu(story, trigger) {
    closeStoryMenu();
    const popover = document.createElement('div'); popover.className = 'story-popover'; popover.setAttribute('role', 'group'); popover.setAttribute('aria-label', `Actions for ${story.title}`);
    const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    const select = document.createElement('button'); select.type = 'button'; select.className = 'story-popover-action story-popover-select';
    select.innerHTML = `${icon('m5 12 4.5 4.5L19 7')}<span>Select</span>`; select.setAttribute('aria-label', `Select story ${story.title}`);
    select.addEventListener('click', () => { closeStoryMenu(); beginStorySelection(story.id); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'story-popover-action story-popover-delete';
    remove.innerHTML = `${icon('M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3')}<span>Delete</span>`; remove.setAttribute('aria-label', `Delete story ${story.title}`);
    remove.addEventListener('click', () => { state.deleteTrigger = { id: story.id, trigger }; closeStoryMenu(); confirmStoryDeletion(new Set([story.id]), story); });
    const shareButton = document.createElement('button'); shareButton.type = 'button'; shareButton.className = 'story-popover-action';
    shareButton.innerHTML = `${icon('M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7')}<span>Share</span>`; shareButton.setAttribute('aria-label', `Share story ${story.title}`);
    shareButton.addEventListener('click', () => { openShareDialog(story, {trigger}); closeStoryMenu(); });
    popover.append(select, shareButton, remove); document.body.append(popover);
    trigger.setAttribute('aria-expanded', 'true');
    // Fixed placement: right-aligned under the button, flipped above it when it would meet the bottom bar.
    const rect = trigger.getBoundingClientRect(), height = popover.getBoundingClientRect().height, width = popover.offsetWidth || 180;
    const bottomLimit = (document.querySelector('.tabbar')?.getBoundingClientRect().top || window.innerHeight) - 8;
    const top = rect.bottom + 6 + height > bottomLimit ? Math.max(8, rect.top - 6 - height) : rect.bottom + 6;
    popover.style.top = `${top}px`; popover.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    state.storyMenu = { id: story.id, trigger, popover };
    select.focus({ preventScroll: true });
  }
  function confirmStoryDeletion(ids, story = null) {
    if (!ids.size || pendingDeletionBlocked()) { toast('Finish or save the current AI response before deleting.'); return; }
    state.deleteStoryIds = new Set(ids);
    $('delete-stories-title').textContent = story ? 'Delete story?' : 'Delete selected stories?';
    $('confirm-delete-stories').textContent = story ? 'Delete story' : 'Delete stories';
    $('delete-stories-message').textContent = story
      ? `Delete “${story.title}” and all its chapters, versions and explanations? This cannot be undone.`
      : `Delete ${ids.size} selected ${ids.size === 1 ? 'story' : 'stories'} and all their chapters, versions and explanations? This cannot be undone.`;
    $('delete-stories-dialog').showModal(); $('cancel-delete-stories').focus();
  }
  function wireLongPress(card, onLongPress, onMove, allowStoryOpen = false, ignoreTarget = () => false) {
    let timer = null, origin = null, completed = false;
    const clear = () => {
      clearTimeout(timer); timer = null; origin = null;
      document.removeEventListener('pointerup', clear, true);
      document.removeEventListener('pointercancel', clear, true);
      document.removeEventListener('scroll', clear, true);
    };
    card.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      if (ignoreTarget(event)) return;
      if (event.target.closest?.('input, select, textarea, a, form, summary') || (event.target.closest?.('button') && !(allowStoryOpen && event.target.closest?.('.story-open')))) return;
      clear(); completed = false; origin = {x:event.clientX,y:event.clientY};
      document.addEventListener('pointerup', clear, true);
      document.addEventListener('pointercancel', clear, true);
      document.addEventListener('scroll', clear, true);
      timer = setTimeout(() => { clear(); completed = true; onLongPress(); }, 500);
    });
    card.addEventListener('pointermove', event => {
      if (!origin) return;
      if (Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>10) clear();
    });
    card.addEventListener('pointerup', clear);
    card.addEventListener('pointercancel', clear);
    card.addEventListener('pointerleave', clear);
    card.addEventListener('click', event => {
      if (completed) { event.preventDefault(); event.stopPropagation(); completed = false; return; }
      onMove?.(event);
    }, true);
    card.addEventListener('contextmenu', event => { if (origin || completed) event.preventDefault(); clear(); });
    return clear;
  }
  // Library: one hero (the latest saved activity) and every other story once below it, in the session-only sort (js/screens/library-activity.js). A result saved while a selection or Actions popover is open re-renders afterwards.
  function libraryChanged() {
    if (!$('view-library').classList.contains('active')) { state.libraryStale = false; return; }
    if (state.storySelectionMode || state.storyMenu || state.shareDialog) { state.libraryStale = true; return; }
    renderLibrary();
  }
  function storyDateLine(entry, style) {
    const line = document.createElement('p'); line.className = 'story-date';
    dateSegments(entry, style).forEach((segment, index) => {
      if (index) line.append(' · ');
      const time = document.createElement('time'); time.dateTime = new Date(segment.ms).toISOString(); time.textContent = `${segment.label} ${segment.text}`; line.append(time);
    });
    return line;
  }
  function storyCard(entry, variant, rowStyle) {
    const story = entry.story, language = LANGUAGES[story.language] || story.language;
    const card = document.createElement('article'); card.className = `story-card story-${variant}${state.storySelectionMode ? ' selecting' : ''}`; card.dataset.storyId = story.id;
    if (state.storySelectionMode) {
      card.classList.toggle('selected-card', state.selectedStoryIds.has(story.id));
      const control = document.createElement('label'); control.className = 'story-check-control';
      const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'story-select-checkbox'; check.checked = state.selectedStoryIds.has(story.id); check.setAttribute('aria-label', `Select ${story.title}`); check.addEventListener('change', () => toggleStorySelection(story.id));
      control.append(check); card.append(control);
    }
    const open = document.createElement('button'); open.className = 'story-open'; open.type = 'button';
    const tag = document.createElement('span'); tag.className = 'language-tag';
    tag.textContent = variant === 'hero' && !state.libraryPlainHero ? `Latest activity · ${language}` : language;
    const title = document.createElement('h3'); title.textContent = story.title;
    const style = variant === 'row' ? rowStyle : variant;
    if (variant === 'hero') {
      // Decorative reading cue on the sole hero; the whole card is the one control and its accessible name is unchanged.
      const foot = document.createElement('div'); foot.className = 'hero-foot';
      const cue = document.createElement('span'); cue.className = 'hero-read'; cue.setAttribute('aria-hidden', 'true'); cue.textContent = 'Read ›';
      foot.append(storyDateLine(entry, style), cue); open.append(tag, title, foot);
    } else open.append(tag, title, storyDateLine(entry, style));
    const dates = describeDates(entry);
    open.setAttribute('aria-label', `${story.title}. ${language}.${dates ? ` ${dates}.` : ''}`);
    open.addEventListener('click', () => { if (state.storySelectionMode) toggleStorySelection(story.id); else openReader(story); });
    card.append(open);
    if (!state.storySelectionMode) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'icon-btn story-menu-toggle'; more.setAttribute('aria-label', `Actions for ${story.title}`); more.title = 'Story actions'; more.setAttribute('aria-expanded', 'false');
      more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>';
      more.addEventListener('click', event => { event.stopPropagation(); if (state.storyMenu?.id === story.id) closeStoryMenu(true); else openStoryMenu(story, more); });
      card.append(more);
    }
    card.addEventListener('click', event => { if (event.target === card && state.storySelectionMode) toggleStorySelection(story.id); });
    wireLongPress(card, () => beginStorySelection(story.id), () => {}, true);
    return card;
  }
  function renderLibrary() {
    state.libraryStale = false; closeStoryMenu();
    const list = $('library-list'), toolbar = $('story-selection-toolbar'); list.replaceChildren(toolbar); toolbar.hidden = !state.storySelectionMode;
    const codes = [...new Set(state.stories.map(story => story.language))].sort((a, b) => (Object.keys(LANGUAGES).indexOf(a) + 1 || 99) - (Object.keys(LANGUAGES).indexOf(b) + 1 || 99));
    // A language filter that no longer matches any story (for example after deleting the last one) returns to All.
    if (codes.length < 2 || !codes.includes(state.libraryLanguage)) state.libraryLanguage = 'all';
    const plan = planLibrary(state.stories, { language: state.libraryLanguage, sort: state.librarySort });
    state.libraryPlainHero = plan.plainHero;
    const total = state.stories.length, shown = plan.count;
    $('library-count').textContent = !total ? '' : shown === total ? `${total} ${total === 1 ? 'story' : 'stories'}` : `${shown} of ${total} stories`;
    const chips = $('library-languages'); chips.replaceChildren(); chips.hidden = codes.length < 2;
    if (codes.length > 1) ['all', ...codes].forEach(code => {
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'language-chip'; chip.dataset.language = code;
      chip.textContent = code === 'all' ? 'All' : LANGUAGES[code] || code; chip.setAttribute('aria-pressed', String(state.libraryLanguage === code));
      chip.addEventListener('click', () => { if (state.libraryLanguage === code) return; state.libraryLanguage = code; leaveStorySelection(); renderLibrary(); });
      chips.append(chip);
    });
    const sort = $('library-sort'); sort.value = state.librarySort; sort.disabled = state.storySelectionMode; $('library-sort-field').hidden = plan.rows.length < 2;
    if (!total) {
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.innerHTML = '<b>No stories yet</b>Stories you create will appear here for offline reading.'; list.append(empty); syncStorySelection(); return;
    }
    list.append(storyCard(plan.hero, 'hero'));
    if (plan.rows.length) {
      const label = document.createElement('h3'); label.className = 'library-list-label'; label.textContent = 'More stories'; list.append(label);
      plan.rows.forEach(entry => list.append(storyCard(entry, 'row', state.librarySort === 'recent' ? 'recent' : 'created')));
    }
    syncStorySelection();
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.storyMenu && !document.querySelector('dialog[open]')) { event.preventDefault(); closeStoryMenu(true); }
  });
  document.addEventListener('click', event => {
    const active = event.target.closest?.('.follow-up-menu');
    $('reader-help').querySelectorAll('.follow-up-menu[open]').forEach(menu => {
      if (menu !== active) menu.open = false;
    });
  });
  document.addEventListener('pointerdown', event => {
    if (state.storyMenu && !event.target.closest?.('.story-popover, .story-menu-toggle')) closeStoryMenu();
  });
  document.addEventListener('focusin', event => {
    if (state.storyMenu && !event.target.closest?.('.story-popover') && event.target !== state.storyMenu.trigger) closeStoryMenu();
  });
  window.addEventListener('scroll', () => closeStoryMenu(), { passive: true });
  window.addEventListener('resize', () => closeStoryMenu());
  $('library-sort').addEventListener('change', event => { state.librarySort = event.target.value === 'newest' ? 'newest' : 'recent'; renderLibrary(); });
  $('finish-story-selection').addEventListener('click', () => leaveStorySelection(true));
  $('delete-selected-stories').addEventListener('click', () => {
    confirmStoryDeletion(state.selectedStoryIds);
  });
  $('cancel-delete-stories').addEventListener('click', () => $('delete-stories-dialog').close());
  $('delete-stories-dialog').addEventListener('close', () => { const opener = state.deleteTrigger; state.deleteTrigger = null;
    // The list may have re-rendered while the dialog was open; find the rebuilt Actions button for the same story.
    if (opener) (opener.trigger.isConnected ? opener.trigger : $('library-list').querySelector(`[data-story-id="${CSS.escape(opener.id)}"] .story-menu-toggle`))?.focus({ preventScroll: true }); if ($('reader-dialog').open && state.deleteStoryIds?.has(state.readerId)) $('reader-actions-toggle').focus(); });
  $('delete-stories-dialog').addEventListener('click', event => { if (event.target === $('delete-stories-dialog')) $('delete-stories-dialog').close(); });
  $('confirm-delete-stories').addEventListener('click', () => {
    const ids=new Set(state.deleteStoryIds);
    if (removeSelectedStories(ids)) { $('delete-stories-dialog').close(); finishDeletedStoryReader(ids); }
  });
  return {
    closeStoryMenu, confirmStoryDeletion, libraryChanged, renderLibrary, wireLongPress
  };
}
