const assert = require('node:assert/strict');

(async () => {
  const { loadFactory, deps, stubDom, bridge } = await import('./support/factory-harness.mjs');
  const { createStoryModel, pathLabel } = await import('../js/core/story-model.js');
  const { createGenerationController } = await import('../js/generation/generation-controller.js');
  const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');
  const createHelpCards = await loadFactory('js/reader/help-cards.js', 'createHelpCards');
  const createReaderRequests = await loadFactory('js/reader/reader-requests.js', 'createReaderRequests');
  const createContinueFlow = await loadFactory('js/reader/continue-flow.js', 'createContinueFlow');

  function fixture() {
    const version = (id, text, sourceVersionId) => ({ id, title: text, story: text, glossary: [], providerId: 'fixture', model: 'mock', promptVersion: 'test', sourceVersionId });
    return {
      id: 'S', title: 'Deleted original mirror', story: 'Deleted original mirror', activeVersionId: 'a', nextAlternateNumber: 4, activePathId: 'original',
      chapters: [
        { id: 'A', activeVersionId: 'a', versions: [version('a', 'Start'), version('ax', 'Alternate start', 'a')], help: [{ id: 'ha', versionId: 'a', followUps: [{ text: 'detail' }] }, { id: 'hax', versionId: 'ax' }] },
        { id: 'B', activeVersionId: 'b', basedOnVersionId: 'a', versions: [version('b', 'Original middle', 'a'), version('bx', 'Alternate middle', 'b')], help: [{ id: 'hb', versionId: 'b' }, { id: 'hbx', versionId: 'bx' }] },
        { id: 'C', activeVersionId: 'c', basedOnVersionId: 'b', versions: [version('c', 'End', 'b')], help: [{ id: 'hc', versionId: 'c' }] }
      ],
      paths: [
        { id: 'original', name: 'Original', entries: [{ chapterId: 'A', versionId: 'a' }, { chapterId: 'B', versionId: 'b' }, { chapterId: 'C', versionId: 'c' }] },
        { id: 'alt1', name: 'Alternate 1', parentPathId: 'original', parentPathName: 'Original', forkChapter: 2, entries: [{ chapterId: 'A', versionId: 'a' }, { chapterId: 'B', versionId: 'bx' }] },
        { id: 'alt3', name: 'Alternate 3', parentPathId: 'original', parentPathName: 'Original', forkChapter: 1, entries: [{ chapterId: 'A', versionId: 'ax' }] }
      ],
      memories: [{ lineage: ['a'] }, { lineage: ['a', 'b'] }, { lineage: ['a', 'b', 'c'] }, { lineage: ['a', 'bx'] }, { lineage: ['ax'] }, { lineage: ['ax', 'b'] }]
    };
  }

  function harness(story = fixture()) {
    const dom = stubDom();
    const $ = dom.$;
    const panel = $('panel');
    panel.scrollTop = 0;
    $('reader-dialog').querySelector = selector => selector === '.reader-panel' ? panel : null;
    $('reader-actions-menu').hidden = true;
    $('reader-actions-toggle').getBoundingClientRect = () => ({ left: 300, top: 80, bottom: 124, height: 104 });
    $('reader-actions-menu').getBoundingClientRect = () => ({ left: 300, top: 80, bottom: 124, height: 104 });
    globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 390, innerHeight: 844 };
    globalThis.document = dom.document;
    globalThis.history = { state: null, pushState() {}, replaceState() {}, back() {} };
    globalThis.getComputedStyle = () => ({ top: '0', paddingTop: '0' });
    globalThis.requestAnimationFrame = () => 0;

    let failed = false, saves = 0, deleted;
    const state = {
      readerId: 'S', readerChapter: 1, stories: [story],
      readerPositions: { 'S:original': { chapterId: 'C' }, 'S:alt1': { chapterId: 'B' }, 'S:alt3': { chapterId: 'A' } },
      readerEditDraft: { storyId: 'S', pathId: 'original', chapterId: 'C' }
    };
    const c = {
      pipeline: null,
      state,
      persistReaderStory(s) { assert.equal(s, state.stories[0]); if (failed) throw Error('disk'); saves++; },
      confirmStoryDeletion(ids) { deleted = ids; },
      readerAi: async () => '{}'
    };
    const pendingDeletionBlocked = () => Boolean(
      c.state.checkpointBlocked || c.pipeline?.records.length || c.state.requestId || c.state.pendingGeneration ||
      c.state.pendingStoryRequestId || c.state.pendingReaderRequestId || c.state.pendingReaderResult ||
      c.state.readerEditBusy || c.state.readerHelpBusy
    );
    const storyModel = createStoryModel({ state, readerStory: () => view.readerStory() });
    let requests = null;
    const view = createReaderView(deps({
      $, state, LANGUAGES: { de: 'German' }, SPEECH_LANGUAGES: { de: 'de-DE' },
      PROFILE_DEFINITIONS: { version: 1 },
      pendingDeletionBlocked,
      persistReaderStory: s => c.persistReaderStory(s),
      confirmStoryDeletion: ids => c.confirmStoryDeletion(ids),
      readerAi: (...args) => c.readerAi(...args),
      savePendingReaderResult: (...args) => requests?.savePendingReaderResult(...args),
      releaseInvalidReaderResponse: (...args) => requests?.releaseInvalidReaderResponse(...args),
      selectionMenuRouter: { reset() {} },
      usage: { setReader() {} },
      settingsFeedback: { sync() {} },
      readingDescription: () => 'I can read simple text'
    }));
    Object.assign(c, storyModel, view, { pathLabel });
    const setRequests = r => { requests = r; };
    return { c, dom, story, $, fail: value => { failed = value; }, saves: () => saves, deleted: () => deleted, setRequests };
  }

  function target(story, pathId, kind, index = 1) {
    return { storyId: story.id, pathId, kind, index, entries: JSON.stringify(story.paths.find(p => p.id === pathId).entries) };
  }

  {
    const { c, dom, story, $, saves } = harness();
    const shared = JSON.stringify(story.chapters[0].help[0]);
    c.confirmReaderRemoval('chapters');
    assert.match($('reader-removal-message').textContent, /Chapters 2–3/);
    assert.equal(dom.document.activeElement, $('reader-removal-cancel'));
    assert.equal(saves(), 0);
    assert.equal(c.removeReaderContent(), true);
    assert.equal(story.paths[0].entries.length, 1);
    assert.equal(story.paths[1].entries.length, 2);
    assert.equal(story.chapters.length, 2);
    assert.equal(story.chapters[1].versions.length, 1);
    assert.equal(story.chapters[1].versions[0].id, 'bx');
    assert.equal(story.chapters[1].help[0].id, 'hbx');
    assert.equal(JSON.stringify(story.chapters[0].help[0]), shared);
    assert.equal(JSON.stringify(story.memories.map(x => x.lineage.join(','))), JSON.stringify(['a', 'a,bx', 'ax']));
    assert.equal(story.story, 'Start');
    assert.equal(c.state.readerChapter, 0);
    assert.equal(c.state.readerPositions['S:original'], undefined);
    assert.ok(c.state.readerPositions['S:alt1']);
    assert.equal(c.state.readerEditDraft, null);
    assert.equal(story.nextAlternateNumber, 4);
  }
  {
    const { c, story } = harness();
    assert.equal(c.removeReaderContent(target(story, 'original', 'chapters', 2)), true);
    assert.equal(story.paths[0].entries.length, 2);
    assert.equal(c.state.readerChapter, 1);
    assert.ok(story.chapters[1].versions.some(v => v.id === 'b'));
  }
  {
    const { c, story } = harness();
    assert.equal(c.removeReaderContent(target(story, 'alt1', 'chapters', 1)), true);
    assert.equal(story.paths[1].forkChapter, undefined);
    assert.equal(story.paths[1].parentPathId, undefined);
    assert.equal(story.paths[0].entries.length, 3);
  }
  {
    const { c, story, $ } = harness();
    assert.equal(c.removeReaderContent(target(story, 'original', 'path')), true);
    assert.equal(story.activePathId, 'alt1');
    assert.equal(c.state.readerChapter, 0);
    assert.equal(story.paths[0].name, 'Alternate 1');
    assert.equal(story.paths[0].forkChapter, 2);
    assert.equal(story.paths.some(p => p.id === story.paths[0].parentPathId), false);
    c.renderChapterNavigation(story);
    assert.equal($('path-list').children[0].children[0].children[1].textContent, 'From Chapter 2 · 2 chapters');
    assert.equal(story.chapters[1].versions.length, 1);
  }
  {
    const { c, story } = harness();
    assert.equal(c.removeReaderContent(target(story, 'alt3', 'path')), true);
    assert.equal(story.chapters[0].versions.length, 1);
    assert.equal(story.chapters[0].help.length, 1);
    assert.ok(!story.memories.some(x => x.lineage.includes('ax')));
    c.initializePathCounter(story);
    assert.equal(story.nextAlternateNumber, 4);
    const reload = JSON.parse(JSON.stringify(story));
    c.ensureStoryPaths(reload);
    assert.equal(reload.paths.length, 2);
    assert.equal(reload.nextAlternateNumber, 4);
  }
  {
    const { c, story, $, fail, saves } = harness();
    const before = JSON.stringify(story), request = target(story, 'original', 'chapters');
    fail(true);
    assert.equal(c.removeReaderContent(request), false);
    assert.equal(JSON.stringify(story), before);
    assert.equal(c.state.readerChapter, 1);
    assert.match($('reader-removal-error').textContent, /disk/);
    fail(false);
    assert.equal(c.removeReaderContent(request), true);
    assert.equal(saves(), 1);
  }
  {
    const { c, story, $ } = harness();
    for (const key of ['requestId', 'pendingGeneration', 'pendingStoryRequestId', 'pendingReaderRequestId', 'pendingReaderResult', 'readerEditBusy', 'readerHelpBusy']) {
      c.state[key] = true;
      const before = JSON.stringify(story);
      assert.equal(c.removeReaderContent(target(story, 'original', 'path')), false);
      c.renderReaderActions();
      assert.equal($('reader-delete-path').disabled, true);
      assert.equal(JSON.stringify(story), before);
      c.state[key] = null;
    }
    const stale = target(story, 'original', 'chapters');
    story.paths[0].entries.pop();
    assert.equal(c.removeReaderContent(stale), false);
    assert.match($('reader-removal-error').textContent, /changed/);
  }
  {
    const h = harness(), { c, story } = h;
    c.state.readerChapter = 0;
    c.confirmReaderRemoval('chapters');
    assert.equal(c.state.readerRemoval.kind, 'path');
    story.paths = [story.paths[0]];
    c.confirmReaderRemoval('chapters');
    assert.equal(h.deleted().has('S'), true);
    c.confirmReaderRemoval('path');
    assert.equal(h.deleted().has('S'), true);
    c.state.current = story;
    c.finishDeletedStoryReader(new Set(['S']));
    assert.equal(c.state.readerId, null);
    assert.equal(c.state.current, null);
    assert.deepEqual(Object.keys(c.state.readerPositions), []);
  }
  {
    const { c, dom, $ } = harness();
    c.renderReaderActions();
    assert.equal($('reader-remove-chapters').textContent, 'Remove Chapter 2 onward…');
    c.state.readerChapter = 2;
    c.renderReaderActions();
    assert.equal($('reader-remove-chapters').textContent, 'Remove Chapter 3…');
    c.toggleReaderActions();
    assert.equal($('reader-actions-menu').hidden, false);
    c.closeReaderActions(true);
    assert.equal($('reader-actions-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(dom.document.activeElement, $('reader-actions-toggle'));
    const legacy = { id: 'legacy', title: 'Old', story: 'Old', glossary: [] };
    c.ensureStoryPaths(legacy);
    assert.equal(legacy.paths.length, 1);
    assert.equal(legacy.nextAlternateNumber, 1);
  }
  {
    const { c, story } = harness();
    story.memoryRebuild = { entries: JSON.parse(JSON.stringify(story.paths[0].entries)) };
    assert.equal(c.removeReaderContent(target(story, 'original', 'chapters', 1)), true);
    assert.equal(story.memoryRebuild, null, 'removing the captured lineage clears its rebuild recovery');
  }
  {
    const { c, story } = harness();
    const marker = story.memoryRebuild = { entries: JSON.parse(JSON.stringify(story.paths[1].entries)) };
    assert.equal(c.removeReaderContent(target(story, 'original', 'chapters', 1)), true);
    assert.equal(JSON.stringify(story.memoryRebuild), JSON.stringify(marker), 'repair on another surviving path is preserved');
  }
  console.log('PASS chapter/path removal, shared content and memory, mirrors, name counter, reload, save rollback, stale targets, pending-AI guard, final-path routing and focus');

  {
    const { c, story, $, setRequests } = harness();
    c.removeReaderContent(target(story, 'original', 'chapters', 1));
    let requested, sequence = 0;
    const painted = [];
    const runtime = { pipeline: null, readerGeneration: null };
    c.state.model = 'mock'; c.state.providerId = 'mock'; c.state.languageExpectations = {};
    story.language = 'de'; story.difficulty = 'beginner';
    bridge.ai.available = true;
    bridge.ai.acknowledge = async () => {};

    const controller = createGenerationController({
      state: c.state,
      normalizeChapters: c.normalizeChapters,
      ensureStoryPaths: c.ensureStoryPaths,
      persistReaderStory: s => c.persistReaderStory(s),
      savedFollowUps: () => []
    });
    const helpCards = createHelpCards(deps({ $, state: c.state, SPEECH_LANGUAGES: { de: 'de-DE' } }));
    const requests = createReaderRequests(deps({
      $, state: c.state, runtime,
      persistReaderStory: s => c.persistReaderStory(s),
      renderReaderGeneration: () => {}
    }));
    setRequests(requests);

    c.readerAi = async (kind, input) => {
      c.state.pendingReaderRequestId = 'request';
      if (kind === 'summary') return JSON.stringify({ newEvents: [{ ref: 'e1', event: input.chapterChunk }] });
      requested = input;
      return JSON.stringify({ title: 'New', story: 'Next scene', glossary: [] });
    };

    createContinueFlow(deps({
      $, runtime, state: c.state,
      readerStory: c.readerStory,
      pathChapters: c.pathChapters,
      activeVersion: c.activeVersion,
      selectedPath: c.selectedPath,
      normalizeChapters: c.normalizeChapters,
      persistReaderStory: s => c.persistReaderStory(s),
      releaseSavedInference: requests.releaseSavedInference,
      releaseInvalidReaderResponse: requests.releaseInvalidReaderResponse,
      aiSession: { run: fn => fn() },
      prepareStoryMemory: c.prepareStoryMemory,
      recentProse: c.recentProse,
      storyContextReady: c.storyContextReady,
      pendingSummaryCount: () => 0,
      createChapterLoading: helpCards.createChapterLoading,
      paintChapterProgress: (request, op) => painted.push(op.stage),
      runContentOperation: async spec => {
        const op = { ...spec, id: `operation-${++sequence}`, createdAt: 'test', result: JSON.parse(await c.readerAi(spec.kind, spec.input)) };
        controller.applyContentOperation(op);
        return op;
      },
      LANGUAGES: { de: 'German' },
      LEVELS: { de: { framework: 'CEFR' } },
      levelDefinition: () => ({ id: 'A1' }),
      guideFor: () => 'Simple',
      readingDescription: () => 'I can read simple text',
      profileSnapshot: () => ({}),
      estimateFor: () => null,
      operationPlan: () => ({}),
      parallelLimitFor: () => 3
    }));

    $('reader-level').value = 'A1';
    $('reader-scope').value = 'scene';
    $('reader-edit-panel').dataset = { mode: 'continue' };
    $('reader-prompt').value = '';
    const submit = () => $('reader-edit-submit').dispatch('click');

    c.state.model = '';
    await submit();
    assert.match($('reader-edit-error').textContent, /No AI model is selected/);
    assert.equal(requested, undefined, 'Continue with no model selected does not start generation');

    c.state.model = 'removed'; c.state.models = [{ id: 'mock', name: 'Mock' }];
    await submit();
    assert.match($('reader-edit-error').textContent, /selected AI model is not available/);
    assert.equal(requested, undefined, 'Continue with an unavailable model does not start generation');

    c.state.model = 'mock';
    await submit();
    assert.deepEqual(painted, ['context'], 'Continue shows the story-context step before the operation starts');
    assert.equal(story.paths[0].entries.length, 2);
    assert.equal(requested.recentProse, 'Start');
    assert.equal(story.paths[1].entries[1].versionId, 'bx');

    $('reader-edit-panel').dataset.mode = 'rewrite';
    c.state.readerChapter = 1;
    await submit();
    assert.equal(c.selectedPath(story).name, 'Alternate 4');
    assert.equal(c.selectedPath(story).parentPathId, 'original');
    assert.equal(story.nextAlternateNumber, 5);

    c.removeReaderContent(target(story, story.activePathId, 'path'));
    c.state.readerChapter = 1;
    await submit();
    assert.equal(c.selectedPath(story).name, 'Alternate 5');
    assert.equal(story.nextAlternateNumber, 6);
    console.log('PASS production generation continues from truncated ending and rewrite never reuses a deleted alternate name');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
