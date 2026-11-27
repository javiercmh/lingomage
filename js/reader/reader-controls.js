// Reader controls: the ⋮ menu and removal dialog, resizing, chapter and storyline pickers, previous/next and furigana.
// The code is the former app.js section, moved verbatim; app.js calls createReaderControls where it used to be.

export function createReaderControls({
  $, clearExplanationSelection, closeReaderActions, closeReaderPanels, closeWordNote, confirmReaderRemoval,
  fitReaderTitle, keepReaderLocation, pathChapters, persistReaderStory, positionReaderPanel, readerPanels,
  readerStory, rememberReaderPosition, removeReaderContent, renderReaderGeneration, restoreReaderPosition,
  selectedPath, setReaderViewport, setRestoringPathPosition, state, toast, toggleReaderActions, trySaveSettings,
  updateReader, updateReaderNavigation
}) {
  $('reader-actions-toggle').addEventListener('click', toggleReaderActions);
  $('reader-remove-chapters').addEventListener('click', () => confirmReaderRemoval('chapters'));
  $('reader-delete-path').addEventListener('click', () => confirmReaderRemoval('path'));
  $('reader-removal-confirm').addEventListener('click', () => removeReaderContent());
  $('reader-removal-cancel').addEventListener('click', () => $('reader-removal-dialog').close());
  $('reader-removal-dialog').addEventListener('close', () => { state.readerRemoval = null; $('reader-actions-toggle').focus(); });
  $('reader-removal-dialog').addEventListener('click', event => { if (event.target === $('reader-removal-dialog')) $('reader-removal-dialog').close(); });
  document.addEventListener('click', event => { if (!event.target.closest?.('#reader-actions-toggle, #reader-actions-menu')) closeReaderActions(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('reader-actions-menu').hidden) { event.preventDefault(); event.stopPropagation(); closeReaderActions(true); }
  }, true);
  window.addEventListener('resize', () => {
    closeReaderActions(); closeWordNote();
    setReaderViewport({ width: window.innerWidth, height: window.innerHeight });
    if ($('reader-dialog').open) {
      // Refit the title first: its stale width would wrap it and move the story after centring.
      keepReaderLocation(fitReaderTitle);
      for (const name of ['navigation', 'preferences']) if (!$(`reader-${name}-panel`).hidden) positionReaderPanel(name);
    }
    updateReaderNavigation(); renderReaderGeneration();
  });
  $('chapter-select').addEventListener('change', () => { closeReaderPanels(true); if (!state.readerEditBusy) { $('reader-edit-panel').hidden = true; state.readerEditDraft = null; } state.readerChapter = Number($('chapter-select').value); state.readerVersion = 0; clearExplanationSelection(); updateReader(); });
  $('path-list').addEventListener('click', event => {
    const button = event.target?.closest?.('.storyline-option');
    const nextId = button?.dataset?.pathId;
    if (!nextId || button.disabled || state.readerEditBusy) return;
    const story = readerStory();
    if (!story || selectedPath(story).id === nextId) return;
    rememberReaderPosition(); closeWordNote(); clearExplanationSelection();
    const previous = story.activePathId; story.activePathId = nextId;
    try { persistReaderStory(story); } catch (error) { story.activePathId = previous; toast(error.message); return; }
    const position = state.readerPositions[`${story.id}:${selectedPath(story).id}`];
    state.readerChapter = Math.max(0, pathChapters(story).findIndex(chapter => chapter.id === position?.chapterId));
    const keepNavigation = !$('reader-navigation-panel').hidden;
    $('reader-edit-panel').hidden = true; state.readerEditDraft = null; updateReader(keepNavigation);
    setRestoringPathPosition(true); restoreReaderPosition(position);
    requestAnimationFrame(() => {
      setRestoringPathPosition(false);
      if (keepNavigation && !$('reader-navigation-panel').hidden) positionReaderPanel('navigation');
      $('path-list')?.querySelector?.('.storyline-option.is-active')?.focus?.({ preventScroll: true });
    });
  });
  $('path-list').addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = [...($('path-list')?.querySelectorAll?.('.storyline-option:not(:disabled)') || [])];
    const current = options.indexOf(event.target?.closest?.('.storyline-option'));
    if (current < 0 || !options.length) return;
    event.preventDefault();
    const next = options[(current + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length];
    next.focus();
  });
  $('chapter-prev').addEventListener('click', () => { if (state.readerChapter > 0) { state.readerChapter--; clearExplanationSelection(); if (!state.readerEditBusy) { $('reader-edit-panel').hidden = true; state.readerEditDraft = null; } } updateReader(); });
  $('chapter-next').addEventListener('click', () => { if (state.readerChapter < pathChapters(readerStory()).length - 1) { state.readerChapter++; clearExplanationSelection(); if (!state.readerEditBusy) { $('reader-edit-panel').hidden = true; state.readerEditDraft = null; } } updateReader(); });
  readerPanels.initialize();
  $('furigana-toggle').addEventListener('change', () => { state.furigana = $('furigana-toggle').checked; keepReaderLocation(() => { $('reader-story').classList.toggle('hide-furigana', !state.furigana); $('reader-title').classList.toggle('hide-furigana', !state.furigana); requestAnimationFrame(fitReaderTitle); }); document.querySelectorAll('#reader-help .story-text').forEach(node => node.classList.toggle('hide-furigana', !state.furigana)); trySaveSettings(); });
  return {};
}
