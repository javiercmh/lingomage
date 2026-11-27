// Applying generation results: early results while notes are written, final results, announced automatic resends,
// and creating the pipeline from data/generation-checkpoints.json.
// The code is the former app.js section, moved verbatim; app.js calls createGenerationResults where it used to be.
import { MAX_BROKEN_RESENDS, createPipeline } from './generation-pipeline.js';
import { ai } from '../bridge.js';
import { continueChapterNumber, continuePrefixEntries, continueResultPathId, pathLabel } from '../core/story-model.js';
import { createGenerationController } from './generation-controller.js';
import { failureInfo } from './generation-errors.js';
import { savedFollowUps } from '../reader/help-context.js';

export function createGenerationResults({
  $, aiSession, elementInView, ensureReaderOpen, ensureStoryPaths, fillLevelOptions, generationAction,
  isViewingChapter, normalizeChapters, notifyResult, persistReaderPosition, persistReaderStory,
  queueBackgroundContext, readerPanel, readingDescription, rememberReaderPosition, renderChapterNavigation,
  renderCheckpointRecovery, renderReaderActions, renderReaderGeneration, runtime, selectedPath,
  setReaderGeneration, setScope, showStorageErrors, state, toast, updateReader, updateReaderNavigation,
  workspaceStorage
}) {
  const { operationProvenance, applyContentOperation, clearNotesPending } = createGenerationController({state, normalizeChapters:(...args)=>normalizeChapters(...args), ensureStoryPaths:(...args)=>ensureStoryPaths(...args), persistReaderStory, savedFollowUps});
  // Reading while notes are written: the chapter opens once its text (and Japanese readings) is saved; notes appear as
  // their parts finish. The status bar keeps Cancel and counts saved note parts; the reader keeps its place.
  function notesProgressMessage(op) {
    const parts = Object.entries(op.parallel || {}).filter(([name]) => name === 'notes' || name.startsWith('notes-'));
    return parts.length > 1 ? `Notes ${parts.filter(([, part]) => part.done).length} of ${parts.length}` : 'Adding notes…';
  }
  function refreshReaderInPlace(storyId) {
    if (state.readerId !== storyId || !$('reader-dialog').open) return;
    // Never rebuild under an open note or an active selection; the next part or the final save refreshes instead.
    if (!$('word-note-popover').hidden || !$('selection-toolbar').hidden) return;
    const scrollTop = readerPanel().scrollTop; updateReader(true); readerPanel().scrollTop = scrollTop;
  }
  function clearReplacedPositions(story, op) {
    if (op.kind !== 'continue' || op.target?.continueMode !== 'replace') return;
    const path = story.paths?.find(item => item.id === op.target.pathId);
    const key = path ? `${story.id}:${path.id}` : '';
    const saved = key ? state.readerPositions?.[key] : null;
    if (saved && !path.entries.some(entry => entry.chapterId === saved.chapterId)) delete state.readerPositions[key];
  }
  function watchingChapterLoading(story, op) {
    if (!$('reader-dialog').open || state.readerId !== story.id) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    if (selectedPath(story)?.id !== op.target?.pathId) return false;
    if ($('word-note-popover')?.hidden === false || $('selection-toolbar')?.hidden === false) return false;
    if (state.player || state.explanationSelectionMode) return false;
    if (['continue-choice-dialog', 'share-dialog', 'reader-removal-dialog', 'notes-rebuild-dialog', 'memory-rebuild-dialog'].some(id => $(id)?.open)) return false;
    return elementInView($('reader-chapter-status'), true);
  }
  function openContinueResult(story, op) {
    const resultPathId = continueResultPathId(op);
    const targetPath = story.paths?.find(item => item.id === resultPathId);
    if (!targetPath) return null;
    const index = targetPath.entries.findIndex(entry => entry.chapterId === `chapter-${op.id}` && entry.versionId === `version-${op.id}`);
    if (index < 0) return null;
    if (story.activePathId !== targetPath.id) {
      rememberReaderPosition?.();
      const previous = story.activePathId; story.activePathId = targetPath.id;
      try { persistReaderStory(story); } catch (error) { story.activePathId = previous; toast(error.message); return null; }
    }
    state.readerChapter = index;
    if (state.readerPositions) state.readerPositions[`${story.id}:${targetPath.id}`] = { chapterId: `chapter-${op.id}`, scrollTop: 0 };
    persistReaderPosition?.();
    $('reader-edit-panel').hidden = true; state.readerEditDraft = null;
    if ($('reader-chapter-status')) $('reader-chapter-status').hidden = true;
    updateReader();
    const panel = readerPanel();
    if (panel) panel.scrollTop = 0;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    $('reader-title')?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    return targetPath;
  }
  function showEarlyResult(op, first) {
    const story = state.stories.find(s => op.kind === 'create' ? s.operationId === op.id : s.id === op.target.storyId);
    if (!story) return;
    clearReplacedPositions(story, op);
    const isContinue = op.kind === 'continue';
    const num = isContinue ? continueChapterNumber(op) : 0;
    const isBranch = isContinue && op.target?.continueMode === 'branch';
    const isReplace = isContinue && op.target?.continueMode === 'replace';
    const resultPathId = isContinue ? continueResultPathId(op) : '';
    const targetRef = isContinue ? { storyId: story.id, pathId: resultPathId, chapterId: `chapter-${op.id}`, versionId: `version-${op.id}`, chapterNumber: num, isBranch } : null;
    if (!first) {
      refreshReaderInPlace(story.id);
      if (isContinue && !isViewingChapter(targetRef)) {
        setReaderGeneration({ storyId: story.id, phase: 'working', message: `${isBranch ? 'Parallel ' : ''}Chapter ${num} ready · ${notesProgressMessage(op)}`, readyTarget: targetRef });
      } else {
        setReaderGeneration({ storyId: story.id, phase: 'working', message: notesProgressMessage(op) });
      }
      return;
    }
    if (op.kind === 'create') { setReaderGeneration({ storyId: story.id, phase: 'working', message: notesProgressMessage(op) }); ensureReaderOpen(story).catch(error => toast(error.message)); toast('Your story is ready. Vocabulary notes are on their way.'); return; }
    if (isContinue) {
      const viewingReplaced = isReplace && $('reader-dialog').open && state.readerId === story.id && selectedPath(story)?.id === op.target.pathId && state.readerChapter >= continuePrefixEntries(op.target).length;
      if (viewingReplaced || watchingChapterLoading(story, op)) {
        if (state.activeChapterRequest?.storyId === story.id) state.activeChapterRequest.opened = true;
        const openedPath = openContinueResult(story, op);
        if (openedPath) {
          setReaderGeneration({ storyId: story.id, phase: 'working', message: notesProgressMessage(op) });
          toast(isBranch ? `Chapter ${num} opened (${pathLabel(story, openedPath)}). Vocabulary notes are on their way.` : `Chapter ${num} opened. Vocabulary notes are on their way.`);
          return;
        }
        if (state.activeChapterRequest?.storyId === story.id) state.activeChapterRequest.opened = false;
      }
      if (state.readerId === story.id && $('reader-dialog').open && selectedPath(story).id === op.target.pathId) {
        const scrollTop = readerPanel().scrollTop, focused = document.activeElement;
        $('reader-edit-panel').hidden = true; state.readerEditDraft = null;
        renderChapterNavigation(story); renderReaderActions(); updateReaderNavigation();
        readerPanel().scrollTop = scrollTop; if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
      }
      const loading = state.activeChapterRequest?.storyId === story.id ? state.activeChapterRequest.loading : null;
      if (loading?.openReadyButton) {
        loading.openReadyButton.hidden = false;
        loading.openReadyButton.textContent = `Read Chapter ${num}`;
        loading.onOpenReady = () => generationAction();
      }
      setReaderGeneration({ storyId: story.id, phase: 'working', message: `${isBranch ? 'Parallel ' : ''}Chapter ${num} ready · ${notesProgressMessage(op)}`, readyTarget: targetRef });
      return;
    }
    setReaderGeneration({ storyId: story.id, phase: 'working', message: notesProgressMessage(op) });
    if (state.readerId === story.id) { state.readerChapter = op.target.index; $('reader-edit-panel').hidden = true; state.readerEditDraft = null; updateReader(); }
    toast('New storyline created. Vocabulary notes are on their way.');
  }
  function showOperationResult(op) {
    const story=state.stories.find(s=>op.kind === 'create' ? s.operationId === op.id : s.id === op.target.storyId);
    if (!story) return;
    notifyResult(op, story);
    clearReplacedPositions(story, op);
    const isContinue = op.kind === 'continue';
    const num = isContinue ? continueChapterNumber(op) : 0;
    const isBranch = isContinue && op.target?.continueMode === 'branch';
    const isReplace = isContinue && op.target?.continueMode === 'replace';
    const resultPathId = isContinue ? continueResultPathId(op) : '';
    const targetRef = isContinue ? { storyId: story.id, pathId: resultPathId, chapterId: `chapter-${op.id}`, versionId: `version-${op.id}` } : null;
    if (op.earlyApplied && op.kind !== 'notes') {
      // The chapter was already saved; only its notes finished.
      refreshReaderInPlace(story.id);
      queueBackgroundContext(story.id, isContinue ? resultPathId : op.kind === 'rewrite' ? `path-${op.id}` : null);
      if (isContinue && !isViewingChapter(targetRef)) {
        const ready = {
          storyId: story.id, phase: 'ready', persistent: true, actionLabel: `Read Ch. ${num}`,
          message: isBranch ? `Parallel Chapter ${num} is ready` : `Chapter ${num} is ready`,
          pathId: resultPathId, chapterId: `chapter-${op.id}`, versionId: `version-${op.id}`, helpId: ''
        };
        if (runtime.readerGeneration && runtime.readerGeneration.storyId === story.id) { Object.assign(runtime.readerGeneration, ready); renderReaderGeneration(); }
        else setReaderGeneration(ready);
        return;
      }
      if (runtime.readerGeneration?.storyId === story.id) setReaderGeneration(null);
      toast('Vocabulary notes ready'); return;
    }
    if (op.kind === 'notes') {
      // Notes rebuilt in place: the learner stays on the same chapter, scroll position and path.
      if (runtime.readerGeneration?.storyId === story.id) setReaderGeneration(null);
      if (state.readerId === story.id && $('reader-dialog').open) { const scrollTop = readerPanel().scrollTop; updateReader(); readerPanel().scrollTop = scrollTop; }
      toast('Vocabulary notes rebuilt'); return;
    }
    if (op.kind !== 'examples') queueBackgroundContext(story.id, isContinue ? resultPathId : op.kind === 'rewrite' ? `path-${op.id}` : null);
    if (op.kind === 'create') { setReaderGeneration(null); ensureReaderOpen(story).catch(error => toast(error.message)); return; }
    if (isContinue) {
      const viewingReplaced = isReplace && $('reader-dialog').open && state.readerId === story.id && selectedPath(story)?.id === op.target.pathId && state.readerChapter >= continuePrefixEntries(op.target).length;
      if (viewingReplaced || watchingChapterLoading(story, op)) {
        const openedPath = openContinueResult(story, op);
        if (openedPath) {
          if (runtime.readerGeneration?.storyId === story.id) setReaderGeneration(null);
          toast(isBranch ? `Chapter ${num} opened (${pathLabel(story, openedPath)})` : `Chapter ${num} opened`);
          return;
        }
      }
      const ready = {
        storyId: story.id, phase: 'ready', persistent: true, actionLabel: `Read Ch. ${num}`,
        message: isBranch ? `Parallel Chapter ${num} is ready` : `Chapter ${num} is ready`,
        pathId: resultPathId, chapterId: `chapter-${op.id}`, versionId: `version-${op.id}`, helpId: ''
      };
      if (runtime.readerGeneration && runtime.readerGeneration.storyId === story.id) { Object.assign(runtime.readerGeneration, ready); renderReaderGeneration(); }
      else setReaderGeneration(ready);
      if (state.readerId === story.id && $('reader-dialog').open && selectedPath(story).id === op.target.pathId) {
        const scrollTop = readerPanel().scrollTop, focused = document.activeElement;
        $('reader-edit-panel').hidden = true; state.readerEditDraft = null;
        renderChapterNavigation(story); renderReaderActions(); updateReaderNavigation();
        readerPanel().scrollTop = scrollTop; if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
      }
      return;
    }
    if (runtime.readerGeneration && runtime.readerGeneration.storyId === story.id) {
      Object.assign(runtime.readerGeneration,{phase:'ready',message:'Ready',pathId:op.kind === 'rewrite' ? `path-${op.id}` : runtime.readerGeneration.pathId,chapterId:op.kind === 'examples' ? op.target.chapterId : op.target?.chapterId,versionId:op.kind === 'examples' ? op.target.versionId : `version-${op.id}`,helpId:op.kind === 'examples' ? op.target.helpId : ''});
      renderReaderGeneration();
    }
    if (state.readerId === story.id) {
      if (op.kind !== 'examples') state.readerChapter=op.target.index;
      $('reader-edit-panel').hidden=true; state.readerEditDraft=null; updateReader();
    }
    toast(op.kind === 'examples' ? 'Examples saved' : 'New storyline created');
  }
  // Automatic resends of unreadable replies are announced, never silent (Settings → Advanced).
  function resendStepName(key) {
    if (key.startsWith('notes-')) return `vocabulary notes (part ${key.slice(6)})`;
    if (key.startsWith('readings-')) return `kanji readings (part ${key.slice(9)})`;
    return {plan:'language plan',prose:'story text',notes:'vocabulary notes',readings:'kanji readings'}[key] || 'AI';
  }
  function announceResend(op, key, count, error) {
    const what = error?.code === 'invalid_json' ? 'reply was unreadable' : failureInfo(error, key).category === 'validation' ? 'reply did not pass the checks' : 'request failed';
    toast(`The ${resendStepName(key)} ${what}. Retrying automatically (${count} of ${MAX_BROKEN_RESENDS}).`);
  }
  function initializePipeline() {
    const entry=workspaceStorage.load('data/generation-checkpoints.json');
    if (entry.status === 'invalid') { state.checkpointBlocked=true; showStorageErrors(); return; }
    const records=entry.value;
    runtime.pipeline=createPipeline({records,persist:value=>workspaceStorage.save('data/generation-checkpoints.json',value),apply:applyContentOperation,applyPartial:(op,content,{first})=>{applyContentOperation(op,{content}); showEarlyResult(op,first);},discarded:op=>{clearNotesPending(op); const story=state.stories.find(s=>op.kind === 'create' ? s.operationId === op.id : s.id === op.target?.storyId); if(story) refreshReaderInPlace(story.id);},parallel:true,onResend:announceResend,changed:()=>{if(runtime.pipeline && !runtime.pipeline.busy) state.requestId=null; renderCheckpointRecovery();},ai:{
      start:async args=>{workspaceStorage.assertWritable(); if (!String(args?.model || '').trim()) throw new Error('No AI model is selected. Open Settings and choose an AI model before generating.'); state.requestId='starting'; try {const id=await aiSession.start(args); state.requestId=id; return id;} catch(error){state.requestId=null;throw error;}},
      wait:async id=>{state.requestId=id; try {const text=await ai.wait(id); return text;} finally {if(state.requestId===id) state.requestId=null;}},
      acknowledge:id=>ai.acknowledge(id), cancel:id=>ai.cancel(id)
    }});
    const pendingCreate=records.find(op=>op.kind === 'create');
    if (pendingCreate) {
      $('topic').value=pendingCreate.input.topic || '';
      $('language').value=pendingCreate.language;
      fillLevelOptions($('difficulty'),pendingCreate.language,pendingCreate.input.difficulty);
      $('difficulty-description').textContent=readingDescription(pendingCreate.language,pendingCreate.input.difficulty);
      setScope($('reading-scope'),pendingCreate.input.scope,$('scope-description'));
    }
    renderCheckpointRecovery();
  }
  return {
    initializePipeline, notesProgressMessage, showEarlyResult, showOperationResult
  };
}
