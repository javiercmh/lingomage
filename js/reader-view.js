// Reader: opening and closing the reader, chapters and paths (exact shared versions), title and navigation,
// reader panels and preferences, vocabulary-note cards, inline Listen buttons, reading location and
// scroll-position restore across rotation and reflow, and story memory for a path.
// The code is the former app.js section, moved verbatim except for two setters (setReaderViewport,
// setRestoringPathPosition) used by app.js code that changes those bindings.
// app.js calls createReaderView where the section used to be.
import { createReaderPanels } from './reader-panels.js';
import { pathLabel, createStoryModel } from './story-model.js';
import { createStoryMemory } from './story-memory.js';
import { annotatedText, stripRussianStress, withRussianStress } from './reader-text.js';
import { markParagraphGaps } from './paragraph-gaps.js';
import { indexGlossaryTriggers, glossaryForTrigger } from './reader-activation.js';
import { speech } from './bridge.js';
import { prepareSpeechOptions } from './reader-speech.js';
import { canonicalRange } from './reader-player.js';

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
  const readerPanels = createReaderPanels({state, $, window, document, getComputedStyle, readerPanel, closeWordNote, persistSettings: trySaveSettings, toast, keepReadingLocation: change => keepReaderLocation(change)});
  const { closeReaderActions, closeReaderPanels, positionReaderPanel, toggleReaderPanel, setReaderTextSize, updateReaderNavigation } = readerPanels;
  function renderReaderActions() {
    const story = readerStory(); if (!story) return;
    const path = selectedPath(story), index = state.readerChapter, blocked = pendingDeletionBlocked();
    const remove = $('reader-remove-chapters'), removePath = $('reader-delete-path');
    remove.textContent = index === path.entries.length - 1 ? `Remove Chapter ${index + 1}…` : `Remove Chapter ${index + 1} onward…`;
    removePath.textContent = story.paths.length > 1 ? 'Delete this storyline…' : 'Delete story…';
    $('reader-rebuild-memory').disabled = blocked || state.storageBlocked;
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
  function pruneStoryContent(story) {
    const used = new Map();
    for (const path of story.paths) for (const entry of path.entries) {
      if (!used.has(entry.chapterId)) used.set(entry.chapterId, new Set());
      used.get(entry.chapterId).add(entry.versionId);
    }
    story.chapters = normalizeChapters(story).filter(chapter => used.has(chapter.id)).map(chapter => {
      const versions = used.get(chapter.id);
      return { ...chapter, versions: chapter.versions.filter(version => versions.has(version.id)),
        activeVersionId: versions.has(chapter.activeVersionId) ? chapter.activeVersionId : [...versions][0],
        help: (chapter.help || []).filter(item => !item.versionId || versions.has(item.versionId)) };
    });
    story.memories = (story.memories || []).filter(record => Array.isArray(record.lineage) && record.lineage.length && story.paths.some(path =>
      record.lineage.length <= path.entries.length && record.lineage.every((id, index) => path.entries[index].versionId === id)));
    if (story.memoryRebuild && !story.paths.some(path => story.memoryRebuild.entries.length <= path.entries.length && story.memoryRebuild.entries.every((entry, index) => path.entries[index].versionId === entry.versionId))) story.memoryRebuild = null;
    const path = story.paths.find(item => item.id === story.activePathId) || story.paths[0];
    const first = path.entries[0], chapter = story.chapters.find(item => item.id === first.chapterId), version = chapter.versions.find(item => item.id === first.versionId);
    for (const key of ['title', 'story', 'glossary', 'titleSegments', 'storySegments', 'providerId', 'model', 'promptVersion']) story[key] = version[key];
    story.activeVersionId = version.id;
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
  function pathForkDescription(story, path) {
    if (!path.forkChapter) return '';
    const parent = path.parentPathId ? story.paths.find(item => item.id === path.parentPathId)
      : story.paths.find(item => item.id !== path.id && item.name === (path.parentPathName || 'Original'));
    return `Different version from Chapter ${path.forkChapter}.${parent ? ` Later chapters remain on ${pathLabel(story, parent)}.` : ''}`;
  }
  const { normalizeChapters, ensureStoryPaths, initializePathCounter, selectedPath, pathChapters, activeChapter, activeVersion } = createStoryModel({state, readerStory});
  const { memoryChunks, recentProse, decodeMemory, prepareStoryMemory, storyContextReady, pendingSummaryCount } = createStoryMemory({state, normalizeChapters, readerAi:(...args)=>readerAi(...args), savePendingReaderResult:(...args)=>savePendingReaderResult(...args), discardResponse:()=>releaseInvalidReaderResponse()});
  function readerStory() { return state.stories.find(item => item.id === state.readerId) || (state.current?.id === state.readerId ? state.current : null); }
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
    const path = selectedPath(story), pathSelect = $('path-select'); pathSelect.textContent = '';
    story.paths.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = pathLabel(story, item); pathSelect.append(option); });
    pathSelect.value = path.id; $('path-control').hidden = story.paths.length < 2;
    $('chapter-prev').disabled = state.readerChapter === 0; $('chapter-next').disabled = state.readerChapter >= chapters.length - 1;
    $('chapter-context-note').hidden = !path.forkChapter && !path.uncertain;
    $('chapter-context-note').textContent = [pathForkDescription(story, path), path.uncertain ? 'This older story has incomplete version history; its original continuity is uncertain.' : ''].filter(Boolean).join(' ');
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
    host.hidden = !request || request.storyId !== state.readerId;
    if (!host.hidden) host.append(request.loading);
  }
  function closeWordNote(restoreFocus = false) {
    const popover = $('word-note-popover');
    // While Define's popover is open it carries the progress, so the status bar returns when it closes.
    const wasDefine = popover.dataset.define === 'true';
    delete popover.dataset.define;
    if (popover.hidden) { if (wasDefine) renderReaderGeneration(); return; }
    popover.hidden = true;
    if (restoreFocus) state.wordNoteTrigger?.focus();
    state.wordNoteTrigger = null;
    document.querySelectorAll('.gloss-note-trigger[aria-expanded="true"]').forEach(button => { button.removeAttribute('aria-expanded'); button.removeAttribute('aria-controls'); });
    if (wasDefine) renderReaderGeneration();
  }
  let inlineSpeechRun = 0;
  let inlineSpeechButton = null;
  let inlineSpeechStopPending = false;
  function renderInlineSpeech(button, playing, stopping = false) {
    const label = stopping ? 'Stop audio' : playing ? 'Stop audio' : button.dataset.listenLabel;
    button.disabled = !speech.available;
    button.title = speech.available ? label : 'Listening requires App²';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-busy', String(stopping));
    button.dataset.playing = String(playing);
  }
  function createInlineListenButton(text, language, onStart) {
    const listen = document.createElement('button'); listen.type = 'button'; listen.className = 'icon-btn inline-listen';
    listen.dataset.listenLabel = `Listen to ${text || 'expression'}`;
    renderInlineSpeech(listen, false);
    listen.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>';
    listen.disabled = !speech.available || !text;
    listen.addEventListener('click', async () => {
      if (inlineSpeechStopPending) return;
      if (inlineSpeechButton === listen) {
        const run = inlineSpeechRun;
        inlineSpeechStopPending = true;
        renderInlineSpeech(listen, true, true);
        try {
          await speech.stop();
          if (run === inlineSpeechRun && inlineSpeechButton === listen) {
            inlineSpeechRun++;
            inlineSpeechButton = null;
            renderInlineSpeech(listen, false);
          }
        } catch (error) {
          if (run === inlineSpeechRun) { toast(`Could not stop audio: ${error.message}`); renderInlineSpeech(listen, true); }
        } finally {
          inlineSpeechStopPending = false;
        }
        return;
      }
      const run = ++inlineSpeechRun;
      onStart?.();
      const previous = inlineSpeechButton;
      if (previous) {
        inlineSpeechButton = null;
        renderInlineSpeech(previous, false);
        try { await speech.stop(); }
        catch (error) {
          if (run === inlineSpeechRun) toast(`Could not stop audio: ${error.message}`);
          return;
        }
        if (run !== inlineSpeechRun) return;
      }
      inlineSpeechButton = listen;
      renderInlineSpeech(listen, true);
      try {
        const { options } = await prepareSpeechOptions(speech, text, SPEECH_LANGUAGES[language]);
        if (run !== inlineSpeechRun) return;
        await speech.speak(options);
      } catch (error) { if (run === inlineSpeechRun) toast(`Could not play audio: ${error.message}`); }
      finally {
        if (run === inlineSpeechRun) { inlineSpeechButton = null; renderInlineSpeech(listen, false); }
      }
    });
    return listen;
  }
  // `at` ({ rect, start, end }) opens the note at another occurrence of the word than its underlined first one,
  // and records the lookup there; `trigger` may then be null.
  function showWordNote(trigger, notes, surface = '', helpId = '', at = null) {
    const popover = $('word-note-popover');
    if (!at && !popover.hidden && trigger.getAttribute('aria-expanded') === 'true') { closeWordNote(); return; }
    closeWordNote(); popover.textContent = '';
    const lookupInfo = at || glossaryForTrigger(trigger);
    recordNoteLookup(notes, lookupInfo, 'note');
    for (const note of notes) {
      const item = document.createElement('p'); item.className = 'word-note-entry';
      // Lead with the wording as it appears in the text, so Listen plays the real text; the dictionary form follows.
      const shown = surface.trim() || note.word || '';
      const russian = readerStory().language === 'ru';
      const canonical = russian ? stripRussianStress(note.word || '') : note.word || '';
      const bare = russian ? stripRussianStress(shown) : shown;
      const sameForm = bare.toLowerCase() === canonical.trim().toLowerCase();
      // Russian stress belongs on the wording from the text, never on the dictionary form line.
      let display = shown;
      if (russian) {
        const forms = note.formStress || {};
        const key = Object.hasOwn(forms, bare) ? bare : Object.keys(forms).find(form => form.toLowerCase() === bare.toLowerCase());
        const positions = key ? forms[key] : sameForm ? note.stress : null;
        if (positions) display = withRussianStress(bare, positions);
      }
      const word = document.createElement('strong'); word.textContent = display || 'Word note';
      const meaning = document.createElement('span'); meaning.textContent = note.meaning;
      const heading = document.createElement('span'); heading.className = 'word-note-heading';
      const listen = createInlineListenButton(shown, readerStory().language, () => {
        recordNoteLookup([note], lookupInfo, 'listen');
      });
      heading.append(word, listen); item.append(heading);
      if (note.word && !sameForm) {
        const form = document.createElement('span'); form.className = 'word-note-form'; form.textContent = `Dictionary form: ${canonical}`; item.append(form);
      }
      item.append(meaning); popover.append(item);
    }
    if (helpId) {
      const view = document.createElement('button'); view.type = 'button'; view.className = 'word-note-view'; view.textContent = 'View saved explanation ↓';
      view.addEventListener('click', () => { closeWordNote(); showExplanationForHelp(helpId); });
      popover.append(view);
    }
    if (!at) { trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', 'word-note-popover'); state.wordNoteTrigger = trigger; }
    popover.hidden = false; popover.focus();
    const rect = at?.rect || trigger.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - 292, rect.left));
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.min(window.innerHeight - 20, rect.bottom + 8)}px`;
    requestAnimationFrame(() => {
      const box = popover.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 12) popover.style.top = `${Math.max(12, rect.top - box.height - 8)}px`;
    });
  }
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
  // The offset a restore produced: its own scroll events must not pick a new anchor from the recentred view.
  let restoredScrollTop = null;
  function rememberReaderLocation() {
    if (!$('reader-dialog').open) return;
    const story = readerStory();
    history.replaceState?.({ ...history.state, lingomageReader: story.id, lingomagePathId: selectedPath(story).id, lingomagePosition: state.readerPositions[`${story.id}:${selectedPath(story).id}`] }, '');
  }
  let resizingReader = false;
  // The viewport the reader was laid out for; recorded when it opens and on every resize.
  let readerViewport = { width: window.innerWidth, height: window.innerHeight };
  function setReaderViewport(value) { readerViewport = value; }
  function rememberReaderPosition() {
    // A closed dialog is display:none and reports scrollTop 0; keep the position recorded while it was open.
    const story = readerStory(); if (!story || !$('reader-dialog').open) return;
    if (resizingReader || readerViewport.width !== window.innerWidth || readerViewport.height !== window.innerHeight) return;
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
    if (draft) { showEditPanel(draft.mode); $('reader-prompt').value = draft.prompt; if (draft.difficulty) { fillLevelOptions($('reader-level'),story.language,draft.difficulty); $('reader-level-description').textContent=readingDescription(story.language,draft.difficulty); } if (draft.scope) fillScopeOptions($('reader-scope'),draft.scope,$('reader-scope-description')); $('reader-edit-error').textContent = draft.error; }
    const entry = { ...(history.state && typeof history.state === 'object' ? history.state : {}), lingomageReader: story.id };
    if (state.readerHistoryEntry) history.replaceState(entry, ''); else history.pushState(entry, '');
    state.readerHistoryEntry = true;
    selectionMenuRouter.reset(); $('reader-dialog').showModal(); usage.setReader({ storyId: story.id, language: story.language }); readerViewport = { width: window.innerWidth, height: window.innerHeight }; restoreReaderPosition(position); rememberReaderPosition(); rememberReaderLocation(); updateReaderNavigation(); renderGenerationRecovery(); settingsFeedback.sync();
  }
  $('reader-dialog').addEventListener('close', () => {
    usage.setReader(null); stopExposure();
    settingsFeedback.sync();
    if (!state.switchingReader) history.replaceState?.({ ...history.state, lingomageReader: null, lingomagePosition: null }, '');
    if (state.readerHistoryEntry && !state.switchingReader) { state.readerHistoryEntry = false; history.back(); }
    if ($('reader-removal-dialog').open) $('reader-removal-dialog').close();
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
    if (resizingReader || readerViewport.width !== window.innerWidth || readerViewport.height !== window.innerHeight) return;
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
