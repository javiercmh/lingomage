const appSource = require('./support/app-source.cjs');
const vm = require('node:vm'), assert = require('node:assert/strict');
const source = appSource();
const section = source.slice(source.indexOf('function notesProgressMessage('), source.indexOf('function initializePipeline('));

(async () => {
  const { continuePrefixEntries, continueChapterNumber, continueResultPathId, pathLabel } = await import('../js/story-model.js');

  function makeStory() {
    return {
      id: 'story',
      activePathId: 'original',
      paths: [
        { id: 'original', name: 'Original', entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }] }
      ]
    };
  }

  function build({
    open = true, viewedPath = 'original', chapter = 0, cardInView = false, viewingChapter = false,
    noteOpen = false, selectionOpen = false, playing = false, selectionMode = false, modalOpen = false
  } = {}) {
    const calls = [], panel = { scrollTop: 240 }, focused = { isConnected: true, focus() { calls.push('focus'); } };
    const story = makeStory();
    const elements = new Map();
    const getEl = id => {
      if (!elements.has(id)) elements.set(id, { id, hidden: id === 'word-note-popover' ? !noteOpen : id === 'selection-toolbar' ? !selectionOpen : false, open: id === 'reader-dialog' ? open : id === 'share-dialog' ? modalOpen : false, scrollIntoView() { calls.push(`scroll:${id}`); } });
      return elements.get(id);
    };
    const loading = { openReadyButton: { hidden: true, textContent: '' }, onOpenReady: null };
    const context = {
      calls, panel, focused, toasts: [], story,
      continuePrefixEntries, continueChapterNumber, continueResultPathId, pathLabel,
      state: {
        stories: [story], readerId: 'story', readerChapter: chapter, readerEditDraft: { prompt: 'x' },
        readerPositions: {}, player: playing ? {} : null, explanationSelectionMode: selectionMode,
        activeChapterRequest: { storyId: 'story', loading, opened: false }
      },
      document: { activeElement: null, visibilityState: 'visible' },
      $: getEl,
      selectedPath: s => s.paths.find(p => p.id === viewedPath) || s.paths[0],
      readerPanel: () => panel,
      elementInView: () => cardInView,
      isViewingChapter: () => viewingChapter,
      rememberReaderPosition() { calls.push('remember'); },
      persistReaderStory(s) { calls.push(`persist:${s.activePathId}`); },
      persistReaderPosition() { calls.push('position'); },
      renderChapterNavigation() { calls.push('nav'); panel.scrollTop = 0; context.document.activeElement = null; },
      renderReaderActions() { calls.push('actions'); },
      notifyResult() {},
      updateReaderNavigation() { calls.push('sticky'); },
      updateReader() { calls.push('updateReader'); },
      renderReaderGeneration() { calls.push('status'); },
      generationAction() { calls.push('genAction'); },
      ensureReaderOpen: async s => { calls.push(`open:${s.id}`); },
      queueBackgroundContext: (storyId, pathId) => calls.push(`background:${storyId}:${pathId}`),
      setReaderGeneration(v) {
        vm.runInContext(`readerGeneration = ${JSON.stringify(v)};`, context);
        calls.push(`status:${v?.phase || null}`);
      },
      toast: m => context.toasts.push(m)
    };
    context.document.activeElement = focused;
    vm.createContext(context);
    vm.runInContext('let readerGeneration = null;', context);
    vm.runInContext(section, context);
    const generation = value => vm.runInContext(`readerGeneration = ${JSON.stringify(value)};`, context);
    const status = () => JSON.parse(vm.runInContext('JSON.stringify(readerGeneration)', context));
    return { context, calls, panel, focused, edit: getEl('reader-edit-panel'), loading, generation, status, story };
  }

  const continueOp = (extra = {}) => ({ id: 'op1', kind: 'continue', target: { storyId: 'story', pathId: 'original', entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }], ...extra.target }, ...extra, target: { storyId: 'story', pathId: 'original', entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }], ...(extra.target || {}) } });

  // 1. Viewed path = request path, still reading (card not in view): stays put, refreshes counts/nav/scroll/focus, persistent Read Ch. 3 pill.
  {
    const t = build({ chapter: 0, cardInView: false });
    t.story.paths[0].entries.push({ chapterId: 'chapter-op1', versionId: 'version-op1' });
    t.generation({ storyId: 'story', phase: 'working', message: 'Writing', pathId: 'original' });
    t.context.showOperationResult(continueOp());
    assert.equal(t.context.state.readerChapter, 0, 'viewed chapter unchanged');
    assert.ok(!t.calls.includes('updateReader'), 'no full reader navigation');
    assert.ok(t.calls.includes('nav') && t.calls.includes('actions') && t.calls.includes('sticky'));
    assert.equal(t.panel.scrollTop, 240, 'scroll offset restored');
    assert.ok(t.calls.includes('focus'), 'focus restored');
    assert.deepEqual(t.status(), {
      storyId: 'story', phase: 'ready', persistent: true, actionLabel: 'Read Ch. 3',
      message: 'Chapter 3 is ready', pathId: 'original', chapterId: 'chapter-op1', versionId: 'version-op1', helpId: ''
    });
    assert.deepEqual(t.context.toasts, [], 'ready status bar replaces duplicate toast');
  }

  // 2. Viewing a different path than the one that grew: view untouched, persistent Read Ch. 3 pill targets request path.
  {
    const t = build({ viewedPath: 'alt', chapter: 1 });
    t.story.paths.push({ id: 'alt', name: 'Alternate 1', entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c3', versionId: 'v3' }] });
    t.generation({ storyId: 'story', phase: 'working', message: 'Writing' });
    t.context.showOperationResult(continueOp());
    assert.equal(t.context.state.readerChapter, 1);
    assert.ok(!t.calls.some(c => ['updateReader', 'nav', 'actions'].includes(c)));
    assert.equal(t.status().persistent, true);
    assert.equal(t.status().actionLabel, 'Read Ch. 3');
    assert.equal(t.status().pathId, 'original');
  }

  // 3. Reader closed: no view work, persistent Read Ch. 3 pill shown.
  {
    const t = build({ open: false });
    t.generation({ storyId: 'story', phase: 'working', message: 'Writing' });
    t.context.showOperationResult(continueOp());
    assert.ok(!t.calls.some(c => ['updateReader', 'nav'].includes(c)));
    assert.equal(t.status().phase, 'ready');
    assert.equal(t.status().persistent, true);
    assert.equal(t.status().actionLabel, 'Read Ch. 3');
  }

  // 4. Progressive earlyApplied Continue while still reading: keeps readyTarget during remaining notes and persistent Read Ch. 3 after completion.
  {
    const t = build({ chapter: 0, cardInView: false, viewingChapter: false });
    t.story.paths[0].entries.push({ chapterId: 'chapter-op1', versionId: 'version-op1' });
    const op = continueOp({
      earlyApplied: true,
      parallel: { 'notes-1': { done: true }, 'notes-2': { done: false }, 'notes-3': { done: false } }
    });
    t.context.showEarlyResult(op, true);
    assert.equal(t.context.state.readerChapter, 0, 'does not teleport while still reading');
    assert.equal(t.loading.openReadyButton.hidden, false);
    assert.equal(t.loading.openReadyButton.textContent, 'Read Chapter 3');
    assert.equal(t.status().readyTarget.chapterNumber, 3);
    assert.match(t.status().message, /^Chapter 3 ready · Notes 1 of 3$/);
    assert.deepEqual(t.context.toasts, [], 'no duplicate toast while stay-put ready status bar is shown');

    op.parallel['notes-2'].done = true;
    t.context.showEarlyResult(op, false);
    assert.equal(t.status().readyTarget.chapterNumber, 3, 'later note parts preserve readyTarget when still unread');
    assert.match(t.status().message, /^Chapter 3 ready · Notes 2 of 3$/);

    t.context.showOperationResult(op);
    assert.equal(t.status().phase, 'ready');
    assert.equal(t.status().persistent, true);
    assert.equal(t.status().actionLabel, 'Read Ch. 3');
    assert.equal(t.status().message, 'Chapter 3 is ready');
    assert.deepEqual(t.context.toasts, [], 'no duplicate toast on completion while stay-put ready bar persists');
  }

  // 5. Progressive earlyApplied Continue while watching loading card: smart teleports immediately on part 1, clears pill on final notes.
  {
    const t = build({ chapter: 0, cardInView: true, viewingChapter: true });
    t.story.paths[0].entries.push({ chapterId: 'chapter-op1', versionId: 'version-op1' });
    const op = continueOp({
      earlyApplied: true,
      parallel: { 'notes-1': { done: true }, 'notes-2': { done: false } }
    });
    t.context.showEarlyResult(op, true);
    assert.equal(t.context.state.readerChapter, 2, 'teleported to Chapter 3');
    assert.equal(t.context.state.activeChapterRequest.opened, true);
    assert.ok(t.calls.includes('updateReader'));
    assert.ok(t.calls.includes('scroll:reader-title'));
    assert.equal(t.status().phase, 'working');
    assert.equal(t.status().readyTarget, undefined);
    assert.equal(t.status().message, 'Notes 1 of 2');

    t.context.showOperationResult(op);
    assert.equal(t.status(), null, 'already viewing new chapter clears bar on final completion');
    assert.equal(t.context.toasts.at(-1), 'Vocabulary notes ready');
  }

  // 6. Blocking UI (open note popover, selection toolbar, audio playback, selection mode, or modal sheet) prevents teleport even if card is in view.
  for (const flag of [{ noteOpen: true }, { selectionOpen: true }, { playing: true }, { selectionMode: true }, { modalOpen: true }]) {
    const t = build({ chapter: 0, cardInView: true, ...flag });
    t.story.paths[0].entries.push({ chapterId: 'chapter-op1', versionId: 'version-op1' });
    t.context.showOperationResult(continueOp());
    assert.equal(t.context.state.readerChapter, 0, `does not teleport when ${JSON.stringify(flag)}`);
    assert.equal(t.status().phase, 'ready');
    assert.equal(t.status().persistent, true);
  }

  // 7. Parallel branch Continue: stays on Main story when reading, switches to branch when watching loading card.
  {
    const t = build({ chapter: 0, cardInView: false });
    const branchPath = { id: 'path-opb', name: 'Alternate 1', forkChapter: 2, entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'chapter-opb', versionId: 'version-opb' }] };
    t.story.paths.push(branchPath);
    const op = continueOp({ id: 'opb', target: { continueMode: 'branch', baseEntries: [{ chapterId: 'c1', versionId: 'v1' }] } });
    t.generation({ storyId: 'story', phase: 'working', message: 'Writing' });
    t.context.showOperationResult(op);
    assert.equal(t.story.activePathId, 'original');
    assert.equal(t.status().pathId, 'path-opb');
    assert.equal(t.status().actionLabel, 'Read Ch. 2');
    assert.equal(t.status().message, 'Parallel Chapter 2 is ready');
    assert.deepEqual(t.context.toasts, [], 'no duplicate toast on stay-put branch ready bar');

    const w = build({ chapter: 0, cardInView: true });
    w.story.paths.push(branchPath);
    w.generation({ storyId: 'story', phase: 'working', message: 'Writing' });
    w.context.showOperationResult(op);
    assert.equal(w.story.activePathId, 'path-opb', 'smart teleport switches to the new parallel branch');
    assert.equal(w.context.state.readerChapter, 1);
    assert.equal(w.status(), null);
  }

  // 8. Replace Continue while reading replaced chapter 2 navigates to replacement; while reading chapter 1 stays put.
  {
    const op = continueOp({ id: 'opr', target: { continueMode: 'replace', baseEntries: [{ chapterId: 'c1', versionId: 'v1' }] } });
    const onReplaced = build({ chapter: 1, cardInView: false });
    onReplaced.story.paths[0].entries = [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'chapter-opr', versionId: 'version-opr' }];
    onReplaced.generation({ storyId: 'story', phase: 'working', message: 'Writing' });
    onReplaced.context.showOperationResult(op);
    assert.equal(onReplaced.context.state.readerChapter, 1);
    assert.ok(onReplaced.calls.includes('updateReader'), 'navigates when user was on a replaced chapter');
    assert.equal(onReplaced.status(), null);

    const onEarlier = build({ chapter: 0, cardInView: false });
    onEarlier.story.paths[0].entries = [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'chapter-opr', versionId: 'version-opr' }];
    onEarlier.generation({ storyId: 'story', phase: 'working', message: 'Writing' });
    onEarlier.context.showOperationResult(op);
    assert.equal(onEarlier.context.state.readerChapter, 0, 'stays on Chapter 1 when still reading earlier chapter');
    assert.equal(onEarlier.status().actionLabel, 'Read Ch. 2');
    assert.deepEqual(onEarlier.context.toasts, [], 'no duplicate toast on stay-put replace ready bar');
  }

  // 9. Rewrite and Create navigation unchanged.
  {
    const t = build({ chapter: 2 }); t.generation({ storyId: 'story', phase: 'working', message: 'Rewriting' });
    t.context.showOperationResult({ id: 'op2', kind: 'rewrite', target: { storyId: 'story', pathId: 'original', chapterId: 'c1', index: 1, entries: [{}, {}] } });
    assert.equal(t.context.state.readerChapter, 1); assert.ok(t.calls.includes('updateReader'));
    assert.equal(t.status().pathId, 'path-op2'); assert.deepEqual(t.context.toasts, ['Branch created']);
  }
  {
    const t = build(); t.generation({ storyId: null, phase: 'working', message: 'Writing your story…' });
    t.context.state.stories = [{ id: 'story-op3', operationId: 'op3' }];
    t.context.showOperationResult({ id: 'op3', kind: 'create' });
    assert.ok(t.calls.includes('open:story-op3')); assert.equal(t.status(), null);
  }
  console.log('PASS Continue smart arrival (teleports when watching card or on replaced chapter, stays put with persistent Read Ch. N when reading or blocked); Rewrite and Create unchanged');
})();
