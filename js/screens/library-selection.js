// Library selection mode: selecting several stories and deleting them.
// The code is the former app.js section, moved verbatim; app.js calls createLibrarySelection where it used to be.

export function createLibrarySelection({
  $, closeStoryMenu, pendingDeletionBlocked, persistStories, renderLibrary, state, toast
}) {
  function syncStorySelection() {
    $('story-selection-toolbar').hidden = !state.storySelectionMode;
    $('story-selection-count').textContent = `${state.selectedStoryIds.size} selected`;
    $('delete-selected-stories').disabled = !state.selectedStoryIds.size || pendingDeletionBlocked();
    $('library-list').querySelectorAll('.story-card').forEach(card => {
      const selected = state.selectedStoryIds.has(card.dataset.storyId);
      card.classList.toggle('selected-card', selected);
      const checkbox = card.querySelector('.story-select-checkbox');
      if (checkbox) checkbox.checked = selected;
    });
  }
  function leaveStorySelection(restoreFocus = false) {
    const focusId = state.storySelectionFocusId || [...state.selectedStoryIds][0];
    state.storySelectionMode = false; state.selectedStoryIds.clear(); syncStorySelection();
    const scrollY = window.scrollY;
    renderLibrary(); window.scrollTo(0, scrollY);
    if (restoreFocus && focusId) $('library-list').querySelector(`[data-story-id="${CSS.escape(focusId)}"] .story-menu-toggle`)?.focus({ preventScroll: true });
    state.storySelectionFocusId = '';
  }
  function beginStorySelection(id) {
    closeStoryMenu();
    if (!state.storySelectionMode) {
      state.storySelectionMode = true; state.selectedStoryIds.clear(); state.storySelectionFocusId = id;
    }
    state.selectedStoryIds.add(id);
    const scrollY = window.scrollY;
    renderLibrary(); window.scrollTo(0, scrollY);
    $('library-list').querySelector(`[data-story-id="${CSS.escape(id)}"] .story-select-checkbox`)?.focus({ preventScroll: true });
  }
  function toggleStorySelection(id) {
    if (state.selectedStoryIds.has(id)) state.selectedStoryIds.delete(id); else state.selectedStoryIds.add(id);
    if (!state.selectedStoryIds.size) { state.storySelectionFocusId = id; leaveStorySelection(true); return; }
    syncStorySelection();
  }
  function removeSelectedStories(ids) {
    if (!ids.size || pendingDeletionBlocked()) return false;
    const previous=state.stories; state.stories=previous.filter(story=>!ids.has(story.id));
    try { persistStories(); leaveStorySelection(); renderLibrary(); toast(`${ids.size} ${ids.size===1?'story':'stories'} deleted`); return true; }
    catch(error) { state.stories=previous; toast(error.message); return false; }
  }
  return {
    beginStorySelection, leaveStorySelection, removeSelectedStories, syncStorySelection, toggleStorySelection
  };
}
