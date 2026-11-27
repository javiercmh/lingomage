import assert from 'node:assert/strict';
import { createGenerationController } from '../js/generation/generation-controller.js';
import { createStoryModel } from '../js/core/story-model.js';
import { operationLabel } from '../js/generation/generation-errors.js';
import { bridge, loadFactory, deps, stubDom } from './support/factory-harness.mjs';

const createGenerationBar = await loadFactory('js/generation/generation-bar.js', 'createGenerationBar');

const ver = (id, text, extra = {}) => ({
  id, title: `Title ${id}`, story: text, glossary: [{ word: 'word', meaning: 'meaning', forms: ['word'] }],
  providerId: 'mock', model: 'mock', promptVersion: 'test', ...extra
});

function fixture() {
  return {
    id: 'S', language: 'de', title: 'Start', story: 'Ch1', activeVersionId: 'v1', activePathId: 'original', nextAlternateNumber: 2,
    chapters: [
      { id: 'c1', activeVersionId: 'v1', versions: [ver('v1', 'Ch1 text.')], help: [{ id: 'h1', versionId: 'v1' }] },
      { id: 'c2', activeVersionId: 'v2', basedOnVersionId: 'v1', versions: [ver('v2', 'Ch2 orig.')], help: [{ id: 'h2', versionId: 'v2' }] },
      { id: 'c3', activeVersionId: 'v3', basedOnVersionId: 'v2', versions: [ver('v3', 'Ch3 orig.')], help: [{ id: 'h3', versionId: 'v3' }] }
    ],
    paths: [
      { id: 'original', name: 'Original', entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }, { chapterId: 'c3', versionId: 'v3' }] },
      { id: 'alt', name: 'Alternate 1', forkChapter: 3, parentPathId: 'original', parentPathName: 'Original', entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }, { chapterId: 'c3', versionId: 'v3' }] }
    ],
    memories: [{ lineage: ['v1'] }, { lineage: ['v1', 'v2'] }, { lineage: ['v1', 'v2', 'v3'] }]
  };
}

function makeController(story, { failPersist = false } = {}) {
  const state = { stories: [story], readerId: story.id, readerChapter: 0 };
  const model = createStoryModel({ state, readerStory: () => story });
  let saves = 0;
  const controller = createGenerationController({
    state,
    normalizeChapters: model.normalizeChapters,
    ensureStoryPaths: model.ensureStoryPaths,
    persistReaderStory() { if (failPersist) throw new Error('disk full'); saves++; },
    savedFollowUps: () => []
  });
  return { state, controller, saves: () => saves };
}

// 1. Branch Continue: creates Alternate path forking at Chapter 2 without mutating activePathId; supports progressive notes.
{
  const story = fixture();
  const { controller } = makeController(story);
  const op = {
    id: 'op-branch', kind: 'continue', language: 'de', createdAt: '2026-11-26T00:00:00Z', promptVersion: 'p1', safeguardVersion: 's1',
    input: { prompt: 'Go left', difficulty: 'A2', framework: 'CEFR', scope: 'scene', learnerProfile: {} },
    config: { providerId: 'mock', model: 'mock' },
    plan: {},
    target: {
      storyId: 'S', pathId: 'original',
      entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }, { chapterId: 'c3', versionId: 'v3' }],
      chapterId: 'c1', sourceVersionId: 'v1', index: 0,
      continueMode: 'branch', baseEntries: [{ chapterId: 'c1', versionId: 'v1' }]
    },
    result: { title: 'Branch Ch2', story: 'New parallel path.', glossary: [{ word: 'parallel', meaning: 'parallel', forms: ['parallel'] }] }
  };
  controller.applyContentOperation(op, { content: { title: 'Branch Ch2', story: 'New parallel path.', glossary: [] } });
  assert.equal(story.activePathId, 'original', 'branch Continue never silently switches activePathId on save');
  assert.equal(story.paths.length, 3);
  const branch = story.paths.find(p => p.id === 'path-op-branch');
  assert.ok(branch);
  assert.equal(branch.forkChapter, 2);
  assert.equal(branch.parentPathId, 'original');
  assert.deepEqual(branch.entries, [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'chapter-op-branch', versionId: 'version-op-branch' }]);
  assert.deepEqual(story.chapters.at(-1).versions[0].contextLineage, [{ chapterId: 'c1', versionId: 'v1' }]);
  assert.equal(story.chapters.at(-1).versions[0].notesPending, true);

  // Final apply updates the existing version cleanly without creating a duplicate path or chapter.
  controller.applyContentOperation(op);
  assert.equal(story.paths.length, 3);
  assert.equal(story.chapters.length, 4);
  assert.equal(story.chapters.at(-1).versions[0].notesPending, undefined);
  assert.equal(story.chapters.at(-1).versions[0].glossary[0].word, 'parallel');
}

// 2. Replace Continue: replaces suffix on target path, preserves content shared with other paths, prunes unreferenced content, rolls back on error.
{
  const story = fixture();
  // Make c3 unshared on 'alt' so only c2 is shared across paths, while c3 original is unshared after replace on original.
  story.paths[1].entries = [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }];
  const { controller } = makeController(story);
  const op = {
    id: 'op-rep', kind: 'continue', language: 'de', createdAt: '2026-11-26T00:00:00Z', promptVersion: 'p1', safeguardVersion: 's1',
    input: { prompt: 'Redo from ch2', difficulty: 'A2', framework: 'CEFR', scope: 'scene', learnerProfile: {} },
    config: { providerId: 'mock', model: 'mock' },
    plan: {},
    target: {
      storyId: 'S', pathId: 'original',
      entries: [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'c2', versionId: 'v2' }, { chapterId: 'c3', versionId: 'v3' }],
      chapterId: 'c1', sourceVersionId: 'v1', index: 0,
      continueMode: 'replace', baseEntries: [{ chapterId: 'c1', versionId: 'v1' }]
    },
    result: { title: 'Replaced Ch2', story: 'Replacement chapter.', glossary: [{ word: 'new', meaning: 'new', forms: ['new'] }] }
  };
  controller.applyContentOperation(op);
  assert.deepEqual(story.paths[0].entries, [{ chapterId: 'c1', versionId: 'v1' }, { chapterId: 'chapter-op-rep', versionId: 'version-op-rep' }]);
  assert.ok(story.chapters.some(c => c.id === 'c2'), 'shared chapter c2 survives because Alternate 1 still uses it');
  assert.ok(!story.chapters.some(c => c.id === 'c3'), 'unreferenced chapter c3 is pruned after save');
  assert.ok(!story.memories.some(m => m.lineage.includes('v3')), 'unreferenced memory for v3 is pruned');
  assert.ok(story.memories.some(m => m.lineage.length === 2 && m.lineage[1] === 'v2'), 'shared memory v1,v2 survives');

  // Save failure rolls back completely without touching existing chapters/paths.
  const storyFail = fixture();
  const snapshot = JSON.stringify(storyFail);
  const failing = makeController(storyFail, { failPersist: true });
  assert.throws(() => failing.controller.applyContentOperation({ ...op, id: 'op-fail' }), /disk full/);
  assert.equal(JSON.stringify(storyFail), snapshot, 'failed replace save leaves story untouched');

  // Stale path check blocks replace if path changed before completion.
  const staleStory = fixture();
  staleStory.paths[0].entries.pop();
  const stale = makeController(staleStory);
  assert.throws(() => stale.controller.applyContentOperation({ ...op, id: 'op-stale' }), /destination path changed/i);
}

// 3. Labels and notifications for append, branch, and replace.
{
  const story = fixture();
  const appendOp = { kind: 'continue', target: { storyId: 'S', pathId: 'original', entries: story.paths[0].entries } };
  const branchOp = { kind: 'continue', target: { storyId: 'S', pathId: 'original', entries: story.paths[0].entries, continueMode: 'branch', baseEntries: [{ chapterId: 'c1', versionId: 'v1' }] } };
  const replaceOp = { kind: 'continue', target: { storyId: 'S', pathId: 'original', entries: story.paths[0].entries, continueMode: 'replace', baseEntries: [{ chapterId: 'c1', versionId: 'v1' }] } };
  assert.match(operationLabel(appendOp, [story]), /^Continuing “Start” · Chapter 4/);
  assert.match(operationLabel(branchOp, [story]), /^New storyline for “Start” · Chapter 2/);
  assert.match(operationLabel(replaceOp, [story]), /^Replacing “Start” · Chapters 2–3/);

  const sent = [];
  const origDocument = globalThis.document;
  const origWindow = globalThis.window;
  const origNotify = bridge.notify, origPerm = bridge.hasNotificationPermission;
  bridge.hasNotificationPermission = () => true;
  bridge.notify = (title, body) => { sent.push({ title, body }); return true; };
  globalThis.window = { addEventListener() {} };
  globalThis.document = { visibilityState: 'hidden', createElement: () => ({ hidden: false, className: '', append() {}, querySelector: () => ({ hidden: false, addEventListener() {} }) }), querySelectorAll: () => [] };
  try {
    const { createGenerationStatusUi } = await import('../js/generation/generation-status-ui.js');
    const ui = createGenerationStatusUi({ $: () => ({}), generationLive: () => false, state: { notifyWhenReady: true, stories: [story] }, trySaveSettings: () => true });
    ui.notifyResult(appendOp, story);
    ui.notifyResult(branchOp, story);
    ui.notifyResult(replaceOp, story);
    assert.deepEqual(sent.map(item => item.title), ['Chapter 4 is ready', 'Parallel Chapter 2 is ready', 'Chapter 2 is ready']);
    assert.ok(sent.every(item => item.body === 'Start'));
  } finally {
    bridge.notify = origNotify;
    bridge.hasNotificationPermission = origPerm;
    globalThis.document = origDocument;
    globalThis.window = origWindow;
  }
}

// 4. Swipe-to-dismiss behavior on dismissible vs non-dismissible generation bars.
{
  const makeBar = dismissible => {
    const handlers = {}, classes = new Set(dismissible ? ['dismissible'] : []);
    return {
      styleProps: {}, opacity: '1', pointerCapture: null,
      classList: {
        contains: n => classes.has(n),
        add: n => classes.add(n),
        remove: n => classes.delete(n)
      },
      style: {
        setProperty(k, v) { this.parent.styleProps[k] = v; },
        removeProperty(k) { delete this.parent.styleProps[k]; },
        set opacity(v) { this.parent.opacity = v; },
        get opacity() { return this.parent.opacity; }
      },
      setPointerCapture(id) { this.pointerCapture = id; },
      hasPointerCapture(id) { return this.pointerCapture === id; },
      releasePointerCapture() { this.pointerCapture = null; },
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      fire(type, ev = {}) { (handlers[type] || []).forEach(fn => fn({ type, pointerId: 1, button: 0, pointerType: 'touch', preventDefault() {}, stopPropagation() {}, ...ev })); }
    };
  };
  const barA = makeBar(true), barB = makeBar(true);
  barA.style.parent = barA; barB.style.parent = barB;
  // The production generation bar attaches its swipe handlers to these two stand-in bars when it is created.
  const dom = stubDom();
  dom.elements.set('reader-generation-bar', barA); dom.elements.set('generation-status-bar', barB);
  let dismissed = 0;
  const runtime = { pipeline: null, readerGeneration: null, creatingStory: false, backgroundRun: null, playbackContext: null };
  // A dismissal is setReaderGeneration(null); count the writes of null to the shared status.
  let status = null;
  Object.defineProperty(runtime, 'readerGeneration', { get: () => status, set(v) { status = v; if (v === null) dismissed++; } });
  const origWindow = globalThis.window, origDocument = globalThis.document, origTimeout = globalThis.setTimeout;
  globalThis.window = { ...origWindow, matchMedia: () => ({ matches: true }) };
  globalThis.document = dom.document;
  globalThis.setTimeout = fn => { fn(); return 1; };
  try {
  createGenerationBar(deps({ $: dom.$, runtime, state: {}, readerPanel: () => dom.$('reader-panel') }));
  status = { storyId: 'S', phase: 'ready', message: 'Ready' };

  // Horizontal swipe past threshold dismisses dismissible pill.
  barA.fire('pointerdown', { clientX: 200, clientY: 700 });
  barA.fire('pointermove', { clientX: 120, clientY: 702 });
  barA.fire('pointerup', { clientX: 120, clientY: 702 });
  assert.equal(dismissed, 1, 'horizontal swipe >= 64px dismisses ready pill');

  // Short drag snaps back without dismissing.
  barA.fire('pointerdown', { clientX: 200, clientY: 700 });
  barA.fire('pointermove', { clientX: 180, clientY: 701 });
  barA.fire('pointerup', { clientX: 180, clientY: 701 });
  assert.equal(dismissed, 1, 'short swipe snaps back without dismissing');

  // Non-dismissible (working) bar ignores swipes.
  barA.classList.remove('dismissible');
  barA.fire('pointerdown', { clientX: 200, clientY: 700 });
  barA.fire('pointermove', { clientX: 80, clientY: 700 });
  barA.fire('pointerup', { clientX: 80, clientY: 700 });
  assert.equal(dismissed, 1, 'non-dismissible pill ignores horizontal swipes');
  } finally { globalThis.window = origWindow; globalThis.document = origDocument; globalThis.setTimeout = origTimeout; }
}

console.log('PASS branch & replace Continue (lineage, shared-chapter pruning, save rollback, staleness, labels) and swipe-to-dismiss');
