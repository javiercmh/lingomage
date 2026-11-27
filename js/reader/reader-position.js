// Reading location and scroll-position restore across rotation, reflow, and reader reopen.
import { canonicalRange } from './reader-player.js';

export function createReaderPosition({
  $, activeChapter, activeVersion, persistStories, readerStory, selectedPath, state
}) {
  function readerPanel() { return $('reader-dialog').querySelector('.reader-panel'); }
  // The reading location is the story character at the middle of the visible reader. Canonical
  // offsets exclude ruby readings, so the same passage can be centred again after wrapping changes.
  function readerViewMiddle() {
    const box = readerPanel().getBoundingClientRect();
    return { x: (box.left + box.right) / 2, y: (Math.max(0, box.top) + Math.min(window.innerHeight, box.bottom)) / 2 };
  }
  // Line breaks and other unrendered characters have no box; measure the next visible one.
  function storyCharRect(root, offset, length) {
    for (let index = offset; index < Math.min(length, offset + 16); index++) {
      const rect = canonicalRange(root, index, index + 1)?.getBoundingClientRect();
      if (rect?.height > 0) return rect;
    }
    return null;
  }
  function readerTextAnchor() {
    const root = $('reader-story'); if (!root.textContent) return {};
    const text = activeVersion().story || ''; if (!text) return {};
    const middle = readerViewMiddle();
    // First character whose line reaches the middle of the view.
    let low = 0, high = text.length;
    while (low < high) {
      const index = Math.floor((low + high) / 2), rect = storyCharRect(root, index, text.length);
      if (!rect || rect.bottom <= middle.y) low = index + 1; else high = index;
    }
    const line = low < text.length && storyCharRect(root, low, text.length);
    // With the title above or the explanations below the middle, keep the pixel offset alone.
    if (!line || line.top - middle.y > line.height * 2) return {};
    // Then the character on that line nearest the horizontal middle.
    const sameLine = rect => rect && Math.abs(rect.top - line.top) < line.height / 2;
    let left = low, right = Math.min(text.length, low + 400);
    while (left < right) {
      const index = Math.floor((left + right) / 2), rect = storyCharRect(root, index, text.length);
      if (!sameLine(rect) || rect.right > middle.x) right = index; else left = index + 1;
    }
    const offset = left < text.length && sameLine(storyCharRect(root, left, text.length)) ? left : Math.max(low, left - 1);
    return { textOffset: offset, versionId: activeVersion().id };
  }
  // The offset a restore produced: its own scroll events must not pick a new anchor from the recentred view.
  let restoredScrollTop = null;
  function restoreReaderPosition(position) {
    const panel = readerPanel();
    panel.scrollTop = position?.scrollTop || 0;
    if (!Number.isInteger(position?.textOffset) || position.textOffset < 0) return;
    const version = activeVersion(), text = version.story || '';
    if (position.textOffset >= text.length || position.versionId !== version.id) return;
    const rect = storyCharRect($('reader-story'), position.textOffset, text.length);
    if (rect) panel.scrollTop += (rect.top + rect.bottom) / 2 - readerViewMiddle().y;
    restoredScrollTop = panel.scrollTop;
  }
  function rememberReaderLocation() {
    if (!$('reader-dialog').open) return;
    const story = readerStory();
    history.replaceState?.({ ...history.state, lingomageReader: story.id, lingomagePathId: selectedPath(story).id, lingomagePosition: state.readerPositions[`${story.id}:${selectedPath(story).id}`] }, '');
  }
  let resizingReader = false;
  // The viewport the reader was laid out for; recorded when it opens and on every resize.
  let readerViewport = { width: window.innerWidth, height: window.innerHeight };
  function setReaderViewport(value) { readerViewport = value; }
  function readerPositionLocked() {
    return resizingReader || readerViewport.width !== window.innerWidth || readerViewport.height !== window.innerHeight;
  }
  function rememberReaderPosition() {
    // A closed dialog is display:none and reports scrollTop 0; keep the position recorded while it was open.
    const story = readerStory(); if (!story || !$('reader-dialog').open) return;
    if (readerPositionLocked()) return;
    if (restoredScrollTop !== null && readerPanel().scrollTop === restoredScrollTop) return;
    restoredScrollTop = null;
    state.readerPositions[`${story.id}:${selectedPath(story).id}`] = { chapterId: activeChapter(story).id, scrollTop: readerPanel().scrollTop, ...readerTextAnchor() };
  }
  // Rotation, text size and furigana reflow the story: the remembered middle passage is centred
  // again, and the scrolls that reflow causes never replace it.
  function keepReaderLocation(change = () => {}) {
    change();
    const story = readerStory(); if (!story || !$('reader-dialog').open) return;
    const position = state.readerPositions[`${story.id}:${selectedPath(story).id}`];
    if (position?.chapterId !== activeChapter(story).id) return;
    resizingReader = true; restoreReaderPosition(position);
    requestAnimationFrame(() => { resizingReader = false; });
  }
  // Positions live in memory while scrolling; they are saved with the story when the reader closes or the page is hidden.
  function persistReaderPosition() {
    rememberReaderLocation();
    const story = readerStory(); if (!story || !state.stories.includes(story)) return;
    const saved = {};
    for (const path of story.paths || []) { const position = state.readerPositions[`${story.id}:${path.id}`]; if (position) saved[path.id] = position; }
    if (JSON.stringify(saved) === JSON.stringify(story.readerPositions || {})) return;
    const before = story.readerPositions;
    story.readerPositions = saved;
    try { persistStories(); } catch (error) { story.readerPositions = before; console.warn(error); }
  }
  function loadReaderPositions() {
    for (const story of state.stories) for (const [pathId, value] of Object.entries(story?.readerPositions || {})) {
      if (typeof value?.chapterId === 'string' && Number.isFinite(value.scrollTop)) state.readerPositions[`${story.id}:${pathId}`] = { ...value, chapterId: value.chapterId, scrollTop: Math.max(0, value.scrollTop) };
    }
  }
  return {
    keepReaderLocation, loadReaderPositions, persistReaderPosition, readerPanel, readerPositionLocked,
    rememberReaderLocation, rememberReaderPosition, restoreReaderPosition, setReaderViewport
  };
}
