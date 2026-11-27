// Reader: opening and closing the reader, chapters and paths (exact shared versions), title and navigation,
// reader panels and preferences, actions and removal, and story memory for a path.
// Composes reader-panels, word-note, reader-position, story-model, and story-memory.
import { createReaderPanels } from './reader-panels.js';
import { createWordNote } from './word-note.js';
import { createReaderPosition } from './reader-position.js';
import { pathLabel, createStoryModel } from '../core/story-model.js';
import { createStoryMemory } from '../generation/story-memory.js';
import { annotatedText } from './reader-text.js';
import { markParagraphGaps } from './paragraph-gaps.js';
import { indexGlossaryTriggers } from './reader-activation.js';

export function createReaderView({
  $, LANGUAGES, PROFILE_DEFINITIONS, SPEECH_LANGUAGES, activateStoryText, clearExplanationSelection,
  closeStoryMenu, confirmStoryDeletion, fillLevelOptions, fillScopeOptions, fitReaderTitle,
  pendingDeletionBlocked, persistReaderStory, persistStories, readerAi, readingDescription, recordNoteLookup,
  releaseInvalidReaderResponse, renderCheckpointRecovery, renderGenerationRecovery, renderMemoryRebuild,
  renderPendingReaderResult, renderReaderGeneration, renderReaderListen, renderSavedHelp,
  savePendingReaderResult, selectionMenuRouter, setView, settingsFeedback, showEditPanel, showExplanationForHelp,
  startExposure, state, stopExposure, stopSpeech, toast, trySaveSettings, usage
}) {
  // Reader management preserves exact shared versions across surviving paths.
  let restoringPathPosition = false;
  function setRestoringPathPosition(value) { restoringPathPosition = value; }
  function readerStory() { return state.stories.find(item => item.id === state.readerId) || (state.current?.id === state.readerId ? state.current : null); }
  const { normalizeChapters, ensureStoryPaths, initializePathCounter, pruneStoryContent, selectedPath, pathChapters, activeChapter, activeVersion } = createStoryModel({state, readerStory});
  const { memoryChunks, recentProse, decodeMemory, prepareStoryMemory, storyContextReady, pendingSummaryCount } = createStoryMemory({state, normalizeChapters, readerAi:(...args)=>readerAi(...args), savePendingReaderResult:(...args)=>savePendingReaderResult(...args), discardResponse:()=>releaseInvalidReaderResponse()});
  const { closeWordNote, createInlineListenButton, showWordNote } = createWordNote({
    $, SPEECH_LANGUAGES, readerStory, recordNoteLookup, renderReaderGeneration, showExplanationForHelp, state, toast
  });
  const {
    keepReaderLocation, loadReaderPositions, persistReaderPosition, readerPanel, readerPositionLocked,
    rememberReaderLocation, rememberReaderPosition, restoreReaderPosition, setReaderViewport
  } = createReaderPosition({
    $, activeChapter, activeVersion, persistStories, readerStory, selectedPath, state
  });
  const readerPanels = createReaderPanels({state, $, window, document, getComputedStyle, readerPanel, closeWordNote, persistSettings: trySaveSettings, toast, keepReadingLocation: change => keepReaderLocation(change)});
  const { closeReaderActions, closeReaderPanels, positionReaderPanel, toggleReaderPanel, setReaderTextSize, updateReaderNavigation } = readerPanels;
  function renderReaderActions() {
    const story = readerStory(); if (!story) return;
    const path = selectedPath(story), index = state.readerChapter, blocked = pendingDeletionBlocked();
    const remove = $('reader-remove-chapters'), removePath = $('reader-delete-path');
    remove.textContent = index === path.entries.length - 1 ? `Remove Chapter ${index + 1}…` : `Remove Chapter ${index + 1} onward…`;
    removePath.textContent = story.paths.length > 1 ? 'Delete this storyline…' : 'Delete story…';
    $('reader-rebuild-memory').disabled = blocked || state.storageBlocked;
    $('reader-rebuild-notes').disabled = blocked || state.storageBlocked || state.readerEditBusy || state.readerHelpBusy;
    $('reader-rebuild-memory').textContent = story.memoryRebuild ? 'Resume memory rebuild…' : 'Rebuild story memory…';
    remove.disabled = blocked; removePath.disabled = blocked; $('reader-actions-note').hidden = !blocked;
  }
  function toggleReaderActions() {
    if (!$('reader-actions-menu').hidden) { closeReaderActions(true); return; }
    closeReaderPanels(); closeWordNote();
    renderReaderActions(); $('reader-actions-menu').hidden = false;
    $('reader-actions-toggle').setAttribute('aria-expanded', 'true');
    const rect = $('reader-actions-toggle').getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 24);
    $('reader-actions-menu').style.width = `${width}px`;
    $('reader-actions-menu').style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    const height = $('reader-actions-menu').getBoundingClientRect().height;
    $('reader-actions-menu').style.top = `${Math.max(12, rect.bottom + height + 6 > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6)}px`;
    if (!$('reader-remove-chapters').disabled) $('reader-remove-chapters').focus();
  }
  function finishDeletedStoryReader(ids) {
    for (const key of Object.keys(state.readerPositions)) if ([...ids].some(id => key === id || key.startsWith(`${id}:`))) delete state.readerPositions[key];
    if (ids.has(state.readerEditDraft?.storyId)) state.readerEditDraft = null;
    if (ids.has(state.current?.id)) state.current = null;
    if (!ids.has(state.readerId)) return;
    closeReaderActions(); state.readerId = null; $('reader-dialog').close(); setView('library');
  }
  function confirmReaderRemoval(action) {
    if (pendingDeletionBlocked()) { toast('Finish or save the current AI response before deleting.'); return; }
    const story = readerStory(), path = selectedPath(story), index = state.readerChapter;
    const kind = action === 'chapters' && index > 0 ? 'chapters' : story.paths.length > 1 ? 'path' : 'story';
    closeReaderActions();
    if (kind === 'story') { confirmStoryDeletion(new Set([story.id]), story); return; }
    const end = path.entries.length, first = index + 1;
    const range = first === end ? `Chapter ${first}` : `Chapters ${first}–${end}`;
    const label = pathLabel(story, path);
    state.readerRemoval = { storyId: story.id, pathId: path.id, label, kind, index, entries: JSON.stringify(path.entries) };
    $('reader-removal-title').textContent = kind === 'path' ? `Delete ${label}?` : `Remove ${range}?`;
    $('reader-removal-message').textContent = kind === 'path'
      ? `Delete “${label}”, containing ${end} ${end === 1 ? 'chapter' : 'chapters'}? Other storylines keep their chapters and explanations. Content unused by any remaining storyline is permanently deleted. This cannot be undone.`
      : `Remove ${range} from “${label}”? Other storylines keep their chapters and explanations. Content unused by any remaining storyline is permanently deleted. This cannot be undone.`;
    $('reader-removal-confirm').textContent = kind === 'path' ? 'Delete storyline' : `Remove ${first === end ? 'chapter' : 'chapters'}`;
    $('reader-removal-error').textContent = '';
    $('reader-removal-dialog').showModal(); $('reader-removal-cancel').focus();
  }
  function removeReaderContent(target = state.readerRemoval) {
    if (!target || pendingDeletionBlocked()) { $('reader-removal-error').textContent = 'Finish or save the current AI response before deleting.'; return false; }
    const story = state.stories.find(item => item.id === target.storyId) || (state.current?.id === target.storyId ? state.current : null);
    const path = story?.paths?.find(item => item.id === target.pathId);
    if (state.readerId !== target.storyId || !['path', 'chapters'].includes(target.kind) || !path || JSON.stringify(path.entries) !== target.entries || target.kind === 'path' && story.paths.length < 2) {
      $('reader-removal-error').textContent = 'The story changed. Cancel and choose the action again.'; return false;
    }
    const before = { ...story }, candidate = JSON.parse(JSON.stringify(story));
    const nextPath = candidate.paths.find(item => item.id === path.id);
    if (target.kind === 'chapters') {
      if (target.index < 1 || target.index >= nextPath.entries.length) return false;
      nextPath.entries = nextPath.entries.slice(0, target.index);
      if (nextPath.forkChapter > nextPath.entries.length) { delete nextPath.forkChapter; delete nextPath.parentPathId; delete nextPath.parentPathName; }
      candidate.activePathId = nextPath.id;
    } else {
      candidate.paths = candidate.paths.filter(item => item.id !== path.id);
      candidate.activePathId = candidate.paths[0].id;
    }
    try { pruneStoryContent(candidate); }
    catch { $('reader-removal-error').textContent = 'The story has incomplete chapter references. Cancel and reopen the story before trying again.'; return false; }
    Object.assign(story, candidate);
    try { persistReaderStory(story); }
    catch (error) {
      for (const key of Object.keys(story)) delete story[key]; Object.assign(story, before);
      $('reader-removal-error').textContent = `${error.message} Try again to save the removal.`; return false;
    }
    // Clear positions referencing deleted paths/chapters; keep other paths' locations.
    for (const key of Object.keys(state.readerPositions)) {
      if (!key.startsWith(`${story.id}:`)) continue;
      const remaining = story.paths.find(item => key === `${story.id}:${item.id}`);
      if (!remaining || !remaining.entries.some(entry => entry.chapterId === state.readerPositions[key].chapterId)) delete state.readerPositions[key];
    }
    if (state.readerEditDraft?.storyId === story.id) state.readerEditDraft = null;
    clearExplanationSelection(); closeWordNote(); $('reader-edit-panel').hidden = true;
    state.readerChapter = target.kind === 'chapters' ? target.index - 1 : 0;
    $('reader-removal-dialog').close(); state.readerRemoval = null;
    updateReader(); $('reader-actions-toggle').focus({ preventScroll: true });
    const removedCount = path.entries.length - target.index;
    toast(target.kind === 'chapters' ? `${removedCount} ${removedCount === 1 ? 'chapter' : 'chapters'} removed` : `${target.label || pathLabel(story, path)} deleted`);
    return true;
  }
  // A rebuild captured its path; it may since have been deleted, so fall back to the captured name.
  function rebuildPathLabel(story, rebuild) {
    const captured = rebuild && story.paths?.find(item => item.id === rebuild.pathId);
    if (captured) return pathLabel(story, captured);
    if (!rebuild?.pathName) return pathLabel(story, selectedPath(story));
    return rebuild.pathName === 'Original' ? 'Main story' : pathLabel({paths: []}, {name: rebuild.pathName});
  }
  function profileSnapshot(story) {
    const version = state.readerId === story.id ? activeVersion(activeChapter(), story) : null;
    const level = version?.difficulty || state.standardizedLevels[story.language] || story.readingStartingPoint || story.difficulty || 'beginner';
    return { language: story.language, readingStartingPoint: level, readingSelfReport: readingDescription(story.language, level), languageExpectations: state.languageExpectations[story.language] || '', profileVersion: PROFILE_DEFINITIONS.version };
  }
  // Title meta, chapter and path selectors and Previous/Next state for the displayed chapter; shared with in-place refreshes.
  function renderChapterNavigation(story) {
    const chapters = pathChapters(story);
    const meta = $('reader-title-meta'); meta.textContent = '';
    const summary = document.createElement('span'); summary.className = 'reader-meta-summary';
    summary.textContent = `${LANGUAGES[story.language] || story.language} · Chapter ${state.readerChapter + 1} of ${chapters.length}`; meta.append(summary);
    if (story.paths.length > 1) {
      const name = document.createElement('span'); name.className = 'reader-meta-path';
      name.textContent = `· ${pathLabel(story, selectedPath(story))}`; name.title = pathLabel(story, selectedPath(story)); meta.append(name);
    }
    $('reader-chapter-label').textContent = `Chapter ${state.readerChapter + 1}`;
    const select = $('chapter-select'); select.textContent = '';
    chapters.forEach((item, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `Chapter ${index + 1}`; select.append(option); });
    select.value = String(state.readerChapter);
    const path = selectedPath(story), pathList = $('path-list');
    if (pathList) {
      pathList.textContent = '';
      const disabled = Boolean(state.readerEditBusy || pathList.dataset?.disabled === 'true');
      story.paths.forEach(item => {
        const active = item.id === path.id;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = active ? 'storyline-option is-active' : 'storyline-option';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', String(active));
        if (button.dataset) button.dataset.pathId = item.id;
        button.disabled = disabled;
        const text = document.createElement('span'); text.className = 'storyline-option-text';
        const name = document.createElement('span'); name.className = 'storyline-option-name'; name.textContent = pathLabel(story, item);
        const meta = document.createElement('span'); meta.className = 'storyline-option-meta';
        const count = item.entries?.length || 0;
        const countText = `${count} ${count === 1 ? 'chapter' : 'chapters'}`;
        meta.textContent = item.forkChapter ? `From Chapter ${item.forkChapter} · ${countText}` : countText;
        text.append(name, meta);
        button.append(text);
        if (active) {
          const check = document.createElement('span'); check.className = 'storyline-option-check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓';
          button.append(check);
        }
        pathList.append(button);
      });
    }
    $('path-control').hidden = story.paths.length < 2;
    $('chapter-prev').disabled = state.readerChapter === 0; $('chapter-next').disabled = state.readerChapter >= chapters.length - 1;
    $('chapter-context-note').hidden = !path.uncertain;
    $('chapter-context-note').textContent = path.uncertain ? 'This older story has incomplete version history; its original continuity is uncertain.' : '';
  }
  function updateReader(keepNavigation = false) {
    renderCheckpointRecovery();
    if (!keepNavigation) closeReaderPanels();
    closeReaderActions();
    const story = readerStory(); if (!story) return;
    const chapters = pathChapters(story); state.readerChapter = Math.min(state.readerChapter, chapters.length - 1);
    const chapter = chapters[state.readerChapter], version = activeVersion(chapter);
    const speechVersionKey = `${story.id}:${chapter.id}:${version.id}`;
    if (state.speechVersionKey && state.speechVersionKey !== speechVersionKey) stopSpeech();
    state.speechVersionKey = speechVersionKey;
    renderReaderListen();
    const title = version.title || story.title;
    annotatedText($('reader-title'), title, version.title ? version.titleSegments : story.titleSegments, { language: SPEECH_LANGUAGES[story.language] || 'en' });
    $('reader-title').classList.toggle('hide-furigana', story.language === 'ja' && !state.furigana);
    requestAnimationFrame(fitReaderTitle);
    renderChapterNavigation(story);
    closeWordNote();
    annotatedText($('reader-story'), version.story, version.storySegments, {
      language: SPEECH_LANGUAGES[story.language] || 'en',
      glossary: version.glossary || [],
      onNote: event => activateStoryText(event)
    });
    markParagraphGaps($('reader-story'));
    indexGlossaryTriggers($('reader-story'), version.story, version.glossary || []);
    setReaderTextSize(state.readerFontSize);
    $('reader-story').classList.toggle('hide-furigana', story.language === 'ja' && !state.furigana);
    $('furigana-control').hidden = story.language !== 'ja'; $('furigana-toggle').checked = state.furigana;
    renderSavedHelp(chapter, version);
    startExposure(story, version);
    $('selection-toolbar').hidden = true; state.readerSelection = null;
    renderPendingReaderResult();
    renderMemoryRebuild(); renderChapterRequest(); renderReaderActions(); renderReaderGeneration();
    if (keepNavigation && !$('reader-navigation-panel').hidden) positionReaderPanel('navigation');
    updateReaderNavigation();
  }
  function renderChapterRequest() {
    const request = state.activeChapterRequest;
    const host = $('reader-chapter-status');
    host.hidden = !request || request.storyId !== state.readerId || Boolean(request.opened);
    if (!host.hidden) host.append(request.loading);
    if (typeof renderReaderGeneration === 'function') renderReaderGeneration();
  }
  function openReader(story) {
    closeStoryMenu();
    // An empty legacy chapters array must be replaced too, or synthesized paths would point at chapters that are not saved.
    state.readerId = story.id; if (!story.chapters?.length) story.chapters = normalizeChapters(story);
    clearExplanationSelection();
    const draft = state.readerEditDraft?.storyId === story.id ? state.readerEditDraft : null;
    if (draft?.pathId && story.paths?.some(path => path.id === draft.pathId)) story.activePathId = draft.pathId;
    const position = draft ? { chapterId: draft.chapterId } : state.readerPositions[`${story.id}:${selectedPath(story).id}`];
    state.readerChapter = Math.max(0, pathChapters(story).findIndex(chapter => chapter.id === position?.chapterId));
    $('reader-help-section').hidden = true; $('reader-edit-panel').hidden = true; $('reader-prompt').value = '';
    updateReader();
    if (draft) { showEditPanel(draft.mode, draft.continueMode); $('reader-prompt').value = draft.prompt; if (draft.difficulty) { fillLevelOptions($('reader-level'),story.language,draft.difficulty); $('reader-level-description').textContent=readingDescription(story.language,draft.difficulty); } if (draft.scope) fillScopeOptions($('reader-scope'),draft.scope,$('reader-scope-description')); $('reader-edit-error').textContent = draft.error; }
    const entry = { ...(history.state && typeof history.state === 'object' ? history.state : {}), lingomageReader: story.id };
    if (state.readerHistoryEntry) history.replaceState(entry, ''); else history.pushState(entry, '');
    state.readerHistoryEntry = true;
    selectionMenuRouter.reset(); $('reader-dialog').showModal(); usage.setReader({ storyId: story.id, language: story.language }); setReaderViewport({ width: window.innerWidth, height: window.innerHeight }); restoreReaderPosition(position); rememberReaderPosition(); rememberReaderLocation(); updateReaderNavigation(); renderGenerationRecovery(); if (typeof renderReaderGeneration === 'function') { renderReaderGeneration(); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => renderReaderGeneration()); } settingsFeedback.sync();
  }
  $('reader-dialog').addEventListener('close', () => {
    usage.setReader(null); stopExposure();
    settingsFeedback.sync();
    if (!state.switchingReader) history.replaceState?.({ ...history.state, lingomageReader: null, lingomagePosition: null }, '');
    if (state.readerHistoryEntry && !state.switchingReader) { state.readerHistoryEntry = false; history.back(); }
    if ($('reader-removal-dialog').open) $('reader-removal-dialog').close();
    if ($('continue-choice-dialog')?.open) $('continue-choice-dialog').close();
    closeReaderPanels(); closeReaderActions(); stopSpeech(); state.speechVersionKey = ''; closeWordNote(); rememberReaderPosition(); persistReaderPosition(); clearExplanationSelection(); setView('library');
  });
  window.addEventListener('popstate', () => {
    if (!$('reader-dialog').open) return;
    // Back dismisses an open vocabulary note first and restores the reader's history entry, so a second Back leaves the reader.
    if (!$('word-note-popover').hidden) {
      closeWordNote(true);
      history.pushState({ ...(history.state && typeof history.state === 'object' ? history.state : {}), lingomageReader: state.readerId }, '');
      return;
    }
    state.readerHistoryEntry = false;
    $('reader-dialog').close();
  });
  readerPanel().addEventListener('scroll', event => {
    if (event.target !== readerPanel()) return;
    if (readerPositionLocked()) return;
    // Resizing prose can emit scroll events through reflow/scroll anchoring.
    // Keep the native range mounted and still while its preferences panel is open.
    if (!restoringPathPosition && $('reader-preferences-panel').hidden) closeReaderPanels();
    closeReaderActions(); updateReaderNavigation(); rememberReaderPosition();
  });
  function sentenceContext(text, start, end) {
    const boundary = /[.!?。！？\n]/u;
    let left = Math.min(start, text.length) - 1;
    while (left >= 0 && !boundary.test(text[left])) left--;
    let right = Math.min(end, text.length);
    while (right < text.length && !boundary.test(text[right])) right++;
    return text.slice(left + 1, Math.min(text.length, right + 1)).trim();
  }
  return {
    activeChapter, activeVersion, closeReaderActions, closeReaderPanels, closeWordNote, confirmReaderRemoval,
    createInlineListenButton, ensureStoryPaths, finishDeletedStoryReader, keepReaderLocation, loadReaderPositions,
    normalizeChapters, openReader, pathChapters, pendingSummaryCount, persistReaderPosition, positionReaderPanel,
    prepareStoryMemory, profileSnapshot, readerPanel, readerPanels, readerStory, rebuildPathLabel, recentProse,
    rememberReaderPosition, removeReaderContent, renderChapterNavigation, renderChapterRequest,
    renderReaderActions, restoreReaderPosition, selectedPath, sentenceContext, setReaderTextSize,
    setReaderViewport, setRestoringPathPosition, showWordNote, storyContextReady, toggleReaderActions,
    updateReader, updateReaderNavigation
  };
}
