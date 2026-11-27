// Reader Continue & Rewrite flow: story memory, recent prose, original topics/practice, blank prompts,
// chapter-only rewrite, middle rewrite excluding old events, path-scoped continuation, and bounded/redacted errors.
import assert from 'node:assert/strict';
import { bridge, loadFactory, deps, stubDom } from './support/factory-harness.mjs';
import { createStoryModel } from '../js/core/story-model.js';
import { createStoryMemory } from '../js/generation/story-memory.js';
import { createGenerationController } from '../js/generation/generation-controller.js';

const createContinueFlow = await loadFactory('js/reader/continue-flow.js', 'createContinueFlow');
const createHelpCards = await loadFactory('js/reader/help-cards.js', 'createHelpCards');
const createReaderRequests = await loadFactory('js/reader/reader-requests.js', 'createReaderRequests');

const LANGUAGES = { ja: 'Japanese', de: 'German', ru: 'Russian', 'es-CL': 'Spanish' };
const SPEECH_LANGUAGES = { de: 'de-DE', ja: 'ja-JP', ru: 'ru-RU', 'es-CL': 'es-CL' };

{
  const dom = stubDom();
  // Make created elements support recursive textContent and querySelector('strong') for loading cards.
  const origCreate = dom.document.createElement.bind(dom.document);
  dom.document.createElement = tag => {
    const node = origCreate(tag);
    Object.defineProperty(node, 'textContent', {
      configurable: true,
      get() { return (this.children || []).map(c => c.textContent ?? c.nodeValue ?? '').join(''); },
      set(value) { this.children = value ? [{ nodeType: 3, nodeValue: String(value), textContent: String(value) }] : []; }
    });
    const find = (root, sel) => {
      for (const c of root.children || []) {
        if (String(c.tagName || '').toLowerCase() === sel.toLowerCase()) return c;
        const found = find(c, sel);
        if (found) return found;
      }
      return null;
    };
    node.querySelector = sel => find(node, sel);
    return node;
  };
  globalThis.document = dom.document;
  bridge.ai.available = true;
  bridge.ai.acknowledge = async () => {};

  const chapter = id => ({ id, activeVersionId: id + 'v', versions: [{ id: id + 'v', title: id, story: 'Text ' + id }], help: [] });
  const story3 = {
    id: 'S', language: 'de', topic: 'A mountain mystery', practice: 'Hiking vocabulary', difficulty: 'beginner',
    chapters: [chapter('one'), chapter('two'), chapter('three')]
  };
  const state = {
    stories: [story3], readerId: 'S', readerChapter: 0, model: 'mock', providerId: 'mock',
    languageExpectations: {}
  };
  const runtime = {};

  let requested, generationInstructions;
  let readerAiImpl = async (kind, input, instructions, loading) => {
    if (kind === 'summary') {
      state.pendingReaderRequestId = 'r';
      return JSON.stringify({ newEvents: [{ ref: 'e1', event: input.chapterChunk }] });
    }
    requested = input;
    generationInstructions = instructions;
    assert.ok(loading.textContent.includes(kind === 'continue' ? 'Writing the next chapter' : 'Rewriting this chapter'));
    state.pendingReaderRequestId = 'r';
    return JSON.stringify({ title: 'four', story: 'Text four', glossary: [{ word: 'four', meaning: 'four', forms: ['four'] }] });
  };

  const model = createStoryModel({ state, readerStory: () => story3 });
  const memory = createStoryMemory({
    state,
    normalizeChapters: model.normalizeChapters,
    readerAi: (...args) => readerAiImpl(...args),
    savePendingReaderResult: () => req.savePendingReaderResult()
  });
  const controller = createGenerationController({
    state,
    normalizeChapters: model.normalizeChapters,
    ensureStoryPaths: model.ensureStoryPaths,
    persistReaderStory() {},
    savedFollowUps: () => []
  });
  const cards = createHelpCards(deps({ $: dom.$, state, SPEECH_LANGUAGES }));
  const req = createReaderRequests(deps({ $: dom.$, state, runtime, LANGUAGES }));

  createContinueFlow(deps({
    $: dom.$,
    state,
    runtime,
    LANGUAGES,
    LEVELS: { de: { framework: 'CEFR' } },
    readerStory: () => story3,
    normalizeChapters: model.normalizeChapters,
    pathChapters: model.pathChapters,
    activeVersion: model.activeVersion,
    selectedPath: model.selectedPath,
    prepareStoryMemory: memory.prepareStoryMemory,
    recentProse: memory.recentProse,
    storyContextReady: memory.storyContextReady,
    pendingSummaryCount: memory.pendingSummaryCount,
    createChapterLoading: cards.createChapterLoading,
    releaseSavedInference: req.releaseSavedInference,
    releaseInvalidReaderResponse: req.releaseInvalidReaderResponse,
    levelDefinition: () => ({ id: 'A1' }),
    guideFor: () => 'Simple',
    readingDescription: () => 'Simple reading',
    profileSnapshot: () => ({}),
    estimateFor: () => null,
    operationPlan: () => ({}),
    aiSession: { run: fn => fn() },
    runContentOperation: async spec => {
      const result = JSON.parse(await readerAiImpl(spec.kind, spec.input, spec.instructions, state.activeChapterRequest.loading));
      const op = { ...spec, result, id: 'generated-' + Date.now() + Math.random(), promptVersion: 'test', createdAt: 'test' };
      controller.applyContentOperation(op);
      return op;
    }
  }));

  dom.$('reader-level').value = 'A1';
  dom.$('reader-scope').value = 'scene';
  dom.$('reader-prompt').value = 'Next';
  dom.$('reader-edit-panel').dataset.mode = 'continue';
  const submit = () => dom.$('reader-edit-submit').dispatch('click');

  await submit();
  assert.ok(requested.storyMemory.events.some(item => item.event === 'Text three'));
  assert.equal(requested.recentProse, 'Text three');
  assert.equal(requested.priorActiveChapters, undefined);
  assert.equal(requested.precedingChapters, undefined);
  assert.equal(story3.chapters.length, 4);
  assert.equal(story3.chapters[3].basedOnVersionId, 'threev');
  assert.equal(story3.chapters[1].versions.length, 1);
  assert.equal(requested.topic, 'A mountain mystery');
  assert.equal(requested.practice, 'Hiking vocabulary');
  assert.ok(generationInstructions.includes('requests contextual vocabulary notes'));
  assert.ok(generationInstructions.includes('Do not wrap up the chapter or story unless'));
  assert.equal(story3.chapters[3].versions[0].glossary[0].word, 'four');
  assert.equal(state.readerEditBusy, false);
  assert.equal(state.activeChapterRequest, null);
  console.log('PASS continuation uses saved memory and recent prose, original topics, shared ending/glossary guidance and fresh notes');

  state.readerChapter = 0;
  dom.$('reader-prompt').value = '   ';
  await submit();
  assert.equal(story3.chapters.length, 5);
  assert.equal(requested.prompt, '');
  assert.ok(generationInstructions.includes('If prompt is empty, continue naturally'));
  assert.equal(story3.chapters[4].versions[0].prompt, '');

  dom.$('reader-prompt').value = 'Next';
  const later = JSON.stringify(story3.chapters.slice(1));
  state.readerChapter = 0;
  dom.$('reader-edit-panel').dataset.mode = 'rewrite';
  await submit();
  assert.equal(story3.chapters[0].versions.length, 2);
  assert.equal(story3.chapters[0].versions[1].sourceVersionId, 'onev');
  assert.equal(JSON.stringify(story3.chapters.slice(1)), later);
  assert.equal(story3.chapters[0].versions[1].glossary[0].word, 'four');
  assert.equal(requested.practice, 'Hiking vocabulary');
  assert.equal(model.selectedPath(story3).entries.length, 1);
  assert.equal(requested.storyMemory.events.length, 0);
  assert.equal(requested.currentChapter.story, 'Text one');
  assert.equal(story3.paths[0].entries.length, 5);
  console.log('PASS chapter-only rewrite preserves original and all later chapters');

  dom.$('reader-prompt').value = '';
  await submit();
  assert.equal(requested.prompt, '');
  assert.equal(story3.chapters[0].versions.length, 3);
  assert.ok(generationInstructions.includes('preserves the chapter’s main events'));

  story3.activePathId = 'original';
  state.readerChapter = 1;
  const untouchedOriginal = JSON.stringify(story3.paths[0].entries);
  await submit();
  assert.equal(requested.storyMemory.events.length, 1);
  assert.equal(requested.storyMemory.events[0].event, 'Text one');
  assert.equal(requested.recentProse, 'Text one');
  assert.equal(requested.currentChapter.story, 'Text two');
  assert.equal(model.selectedPath(story3).entries.length, 2);
  assert.equal(JSON.stringify(story3.paths[0].entries), untouchedOriginal);

  state.readerChapter = 0;
  dom.$('reader-edit-panel').dataset.mode = 'continue';
  await submit();
  assert.equal(model.selectedPath(story3).entries.length, 3);
  assert.equal(requested.recentProse, 'Text four');
  assert.equal(JSON.stringify(story3.paths[0].entries), untouchedOriginal);
  console.log('PASS middle rewrite excludes its old events; continuation from earlier reading appends only to selected path');

  state.readerChapter = 0;
  dom.$('reader-edit-panel').dataset.mode = 'rewrite';
  dom.$('reader-prompt').value = 'Next';
  console.log('PASS blank and whitespace continuation/rewrite prompts generate with explicit defaults and preserve empty provenance');

  readerAiImpl = async () => { throw Error('provider failed'); };
  await submit();
  assert.equal(dom.$('reader-prompt').value, 'Next');
  assert.equal(state.readerEditBusy, false);
  assert.equal(state.activeChapterRequest, null);
  assert.equal(state.readerEditDraft.chapterId, story3.chapters[0].id);
  assert.ok(dom.$('reader-edit-error').textContent.includes('Submit again to retry'));
  console.log('PASS failed chapter request clears loading and retains an anchored prompt for explicit retry');

  readerAiImpl = async () => {
    throw Object.assign(Error(`The model ended early: max_output_tokens. sessionId=secret-session https://private.invalid/x Bearer secret-token ${'x'.repeat(3000)}`), { code: 'incomplete' });
  };
  await submit();
  const contextError = dom.$('reader-edit-error').textContent;
  assert.ok(contextError.startsWith('The model ended early: max_output_tokens.'), 'the actual host reason stays visible');
  assert.ok(contextError.endsWith(' Submit again to retry.'));
  assert.doesNotMatch(contextError, /secret-session|private\.invalid|secret-token|\[redacted\]/);
  assert.ok(contextError.length <= 1500 + ' Submit again to retry.'.length, 'displayed host text is bounded');
  assert.equal(state.readerEditDraft.error, contextError);
  assert.equal(dom.$('reader-prompt').value, 'Next');
  console.log('PASS story-context failures before a checkpoint show bounded, redacted host reasons with explicit retry');
}
