// Reader AI requests: readerAi, save/acknowledge/release lifecycle, explainSelection (initial, detail, follow-up edit,
// retry, cancellation, cleanup bar, scroll preservation, contracts) and examples validation.
import assert from 'node:assert/strict';
import { bridge, loadFactory, deps, stubDom } from './support/factory-harness.mjs';
import { PROMPT_VERSION, helpInstructions } from '../js/generation/prompts.js';
import { validateExamples } from '../js/generation/learning-validation.js';
import { japaneseSegments } from '../js/reader/reader-text.js';

const createReaderRequests = await loadFactory('js/reader/reader-requests.js', 'createReaderRequests');
const createHelpCards = await loadFactory('js/reader/help-cards.js', 'createHelpCards');
const createGenerationBar = await loadFactory('js/generation/generation-bar.js', 'createGenerationBar');

const LANGUAGES = { ja: 'Japanese', de: 'German', ru: 'Russian', 'es-CL': 'Spanish' };
const SPEECH_LANGUAGES = { de: 'de-DE', ja: 'ja-JP', ru: 'ru-RU', 'es-CL': 'es-CL' };

function makeHarness(overrides = {}) {
  const dom = stubDom();
  globalThis.document = dom.document;
  const runtime = {};
  const state = { models: [{ id: 'mock' }, { id: 'model' }], providerId: 'mock', model: 'mock', ...(overrides.state || {}) };
  const cards = createHelpCards(deps({ $: dom.$, state, SPEECH_LANGUAGES }));
  let readerGeneration = null;
  const req = createReaderRequests(deps({
    $: dom.$,
    state,
    runtime,
    LANGUAGES,
    workspaceStorage: { assertWritable() {} },
    helpContext: cards.helpContext,
    resolvedHelpContext: cards.resolvedHelpContext,
    validTextRange: cards.validTextRange,
    savedFollowUps: cards.savedFollowUps,
    overlappingHelp: cards.overlappingHelp,
    createHelpLoading: cards.createHelpLoading,
    setReaderGeneration: value => { readerGeneration = value; runtime.readerGeneration = value; },
    renderReaderGeneration() {},
    renderSavedHelp() {},
    renderPendingReaderResult() {},
    renderCheckpointRecovery() {},
    recordSelectionLookup() {},
    readerPanel: () => ({ scrollTop: 0 }),
    ...overrides.deps
  }));
  return { dom, state, runtime, cards, req, get readerGeneration() { return readerGeneration; } };
}

function resetBridgeAi(overrides = {}) {
  bridge.ai.available = true;
  bridge.ai.providers = async () => ({ providers: [{ id: 'mock', connected: true }] });
  bridge.ai.wait = async () => '';
  bridge.ai.acknowledge = async () => {};
  bridge.ai.cancel = async () => {};
  Object.assign(bridge.ai, overrides);
}

// 1. Save failure retention, request blocking, acknowledgement failure, explicit retry.
{
  let failsSave = true, failsAck = false, durable, applied = 0, acked = 0;
  const story = { id: 'A', value: 0 };
  resetBridgeAi({
    acknowledge: async () => { if (failsAck) throw Error('ack'); acked++; }
  });
  const { state, req } = makeHarness({
    state: { pendingReaderRequestId: 'request', readerId: 'A' },
    deps: {
      persistReaderStory: s => { if (failsSave) throw Error('disk'); durable = JSON.parse(JSON.stringify(s)); }
    }
  });
  state.pendingReaderResult = { story, saved: false, apply() { story.value++; applied++; return () => story.value--; } };
  await assert.rejects(req.savePendingReaderResult(), /disk/);
  assert.equal(story.value, 0); assert.equal(acked, 0);
  await assert.rejects(req.releaseSavedInference(), /Save the completed/);
  assert.equal(acked, 0);
  failsSave = false; failsAck = true;
  await assert.rejects(req.savePendingReaderResult(), /ack/);
  assert.equal(story.value, 1); assert.equal(durable.value, 1); assert.equal(state.pendingReaderResult.saved, true);
  failsAck = false;
  await req.savePendingReaderResult();
  assert.equal(applied, 2); assert.equal(story.value, 1); assert.equal(acked, 1); assert.equal(state.pendingReaderResult, null);
  console.log('PASS save failure retention, request blocking, acknowledgement failure, explicit retry');
}

// 2. Overlapping help blocked; response remains anchored after switching stories and captures model provenance; activity stamped only on result save.
{
  let finish, helpRequests = 0;
  const persisted = [];
  const original = { id: 'A', language: 'ja', chapters: [{ id: 'CA', help: [], versions: [{ id: 'VA', story: '日本' }] }] };
  const other = { id: 'B', language: 'de', chapters: [{ id: 'CB', help: [], versions: [{ id: 'VB' }] }] };
  let current = original;
  resetBridgeAi({
    wait: () => new Promise(r => { finish = r; })
  });
  const { state, req } = makeHarness({
    state: { readerId: 'A', readerSelection: { storyId: 'A', text: '日本', start: 0, end: 2, chapterId: 'CA', versionId: 'VA', profile: {} }, model: 'mock', providerId: 'mock' },
    deps: {
      readerStory: () => current,
      normalizeChapters: s => s.chapters,
      activeChapter: () => current.chapters[0],
      activeVersion: () => current.chapters[0].versions[0],
      readerPanel: () => ({ scrollTop: 150 }),
      persistReaderStory(story) { persisted.push({ id: story.id, stamp: story.lastActivityAt }); },
      aiSession: { start: async () => { helpRequests++; return 'req-overlap'; } }
    }
  });
  const pending = req.explainSelection();
  await new Promise(r => setImmediate(r));
  await req.explainSelection();
  assert.equal(helpRequests, 1);
  assert.equal(state.activeHelpRequest.storyId, 'A');
  assert.equal(state.activeHelpRequest.chapterId, 'CA');
  assert.equal(state.activeHelpRequest.versionId, 'VA');
  assert.equal(state.activeHelpRequest.action, 'initial');
  current = other; state.readerId = 'B'; state.model = 'changed-model';
  finish(JSON.stringify({ translation: 'Japan', explanation: 'Meaning' }));
  await pending;
  assert.equal(original.chapters[0].help.length, 1);
  assert.equal(other.chapters[0].help.length, 0);
  assert.equal(original.chapters[0].help[0].model, 'mock');
  console.log('PASS overlapping help blocked; response remains anchored after switching stories and captures model provenance');
  assert.equal(persisted.length, 2, 'one pre-request save and one result save');
  assert.equal(persisted[0].stamp, undefined, 'the pre-request save is not activity');
  assert.ok(Number.isFinite(Date.parse(persisted[1].stamp)), 'the stamp rides the same write as the saved explanation');
  assert.equal(original.lastActivityAt, persisted[1].stamp);
  assert.equal(other.lastActivityAt, undefined, 'only the story that received content is stamped');
  console.log('PASS explanation activity is stamped only with the saved result, never by the pre-request save');
}

// 3. Explanation save failure restores absence of stamp; retry stamps; ack failure keeps it; release does not restamp.
{
  const target = { id: 'F', language: 'ja', chapters: [{ id: 'CF', help: [], versions: [{ id: 'VF', story: '日本' }] }] };
  let resolveAi, failSave = true, failAck = true;
  const saves = [];
  resetBridgeAi({
    wait: () => new Promise(r => { resolveAi = r; }),
    acknowledge: async () => { if (failAck) throw new Error('ack down'); }
  });
  const { state, req } = makeHarness({
    state: { readerId: 'F', readerSelection: { storyId: 'F', text: '日本', start: 0, end: 2, chapterId: 'CF', versionId: 'VF', profile: {} }, model: 'mock', providerId: 'mock' },
    deps: {
      readerStory: () => target,
      normalizeChapters: s => s.chapters,
      activeChapter: () => target.chapters[0],
      activeVersion: () => target.chapters[0].versions[0],
      persistReaderStory(story) { saves.push(story.lastActivityAt); if (failSave && saves.length > 1) throw new Error('disk full'); },
      aiSession: { start: async () => 'req-F' }
    }
  });
  const request = req.explainSelection();
  await new Promise(r => setImmediate(r));
  resolveAi(JSON.stringify({ translation: 'Japan', explanation: 'Meaning' }));
  await request;
  assert.equal(target.lastActivityAt, undefined, 'a failed save leaves no stamp');
  assert.equal(target.chapters[0].help.length, 0);
  assert.equal(state.pendingReaderResult.saved, false);
  failSave = false;
  await assert.rejects(req.savePendingReaderResult(), /ack down/);
  const stamped = target.lastActivityAt;
  assert.ok(Number.isFinite(Date.parse(stamped)));
  assert.equal(target.chapters[0].help.length, 1);
  assert.equal(state.pendingReaderResult.saved, true);
  failAck = false;
  await req.savePendingReaderResult();
  assert.equal(target.lastActivityAt, stamped, 'finishing the release neither re-applies nor restamps');
  assert.equal(target.chapters[0].help.length, 1);
  console.log('PASS explanation save failure restores absence of the stamp; a later save stamps; acknowledgement failure keeps it; release does not restamp');
}

// 4. Explanation and more-detail error panels retry captured selection/question and save exactly once.
for (const action of ['initial', 'detail']) {
  const entry = { id: 'H', passage: 'Brot', start: 0, end: 4, versionId: 'V', text: 'Existing explanation', followUps: [] };
  const story = { id: 'S', language: 'de', chapters: [{ id: 'C', help: action === 'detail' ? [entry] : [], versions: [{ id: 'V', story: 'Brot' }] }] };
  let calls = 0, fail = true, captured;
  const selected = { storyId: 'S', chapterId: 'C', versionId: 'V', text: 'Brot', start: 0, end: 4, profile: {}, helpId: action === 'detail' ? 'H' : undefined };
  resetBridgeAi({
    wait: async () => {
      if (fail) throw Object.assign(Error('Service failed'), { code: 'service' });
      return JSON.stringify({ explanation: 'Saved response' });
    }
  });
  const { dom, state, req } = makeHarness({
    state: { readerId: 'S', readerSelection: selected, model: 'mock', providerId: 'mock' },
    deps: {
      readerStory: () => story,
      normalizeChapters: s => s.chapters,
      activeChapter: () => story.chapters[0],
      activeVersion: () => story.chapters[0].versions[0],
      persistReaderStory() {},
      aiSession: { start: async args => { calls++; captured = JSON.parse(args.input); return `req-retry-${calls}`; } }
    }
  });
  await req.explainSelection('explain', action, 'Why this form?', selected);
  assert.equal(state.readerHelpBusy, false); assert.equal(calls, 1);
  const recovery = dom.$('reader-help').childNodes.find(node => node.className === 'recovery-panel help-request-recovery');
  assert.ok(recovery);
  const retry = recovery.childNodes.at(-1).childNodes[0];
  assert.equal(retry.textContent, 'Retry');
  // Change current selection; explicit retry must use the captured source and question.
  state.readerSelection = { ...selected, text: 'different' };
  fail = false;
  await retry.dispatch('click');
  assert.equal(calls, 2);
  assert.equal(captured.passage, 'Brot');
  assert.equal(captured.followUp, 'Why this form?');
  assert.equal(action === 'detail' ? entry.followUps.length : story.chapters[0].help.length, 1);
  assert.equal(state.readerHelpBusy, false);
}
console.log('PASS explanation and more-detail error panels retry captured selection/question and save exactly once');

// 5. Intentional explanation cancellation clears status, preserves help, permits next request and exposes cleanup failures without recovery.
for (const action of ['initial', 'detail']) for (const cleanupFails of [false, true]) {
  const entry = { id: 'H', passage: 'Brot', start: 0, end: 4, versionId: 'V', text: 'Existing explanation', followUps: [] };
  const story = { id: 'S', language: 'de', chapters: [{ id: 'C', help: action === 'detail' ? [entry] : [], versions: [{ id: 'V', story: 'Brot' }] }] };
  const selected = { storyId: 'S', chapterId: 'C', versionId: 'V', helpId: 'H', text: 'Brot', start: 0, end: 4, profile: {} };
  let shouldCancel = true;
  resetBridgeAi({
    wait: async () => {
      if (shouldCancel) throw Error('Request cancelled.');
      return JSON.stringify({ explanation: 'New detail' });
    },
    acknowledge: async () => { if (cleanupFails) throw Error('offline'); }
  });
  const harness = makeHarness({
    state: { readerId: 'S', model: 'mock', providerId: 'mock' },
    deps: {
      readerStory: () => story,
      normalizeChapters: s => s.chapters,
      activeChapter: () => story.chapters[0],
      activeVersion: () => story.chapters[0].versions[0],
      persistReaderStory() {},
      aiSession: { start: async () => 'cancelled-id' }
    }
  });
  await harness.req.explainSelection('explain', action, 'Why this form?', selected);
  assert.equal(harness.readerGeneration?.phase, cleanupFails ? 'cleanup' : undefined);
  assert.equal(harness.state.readerHelpBusy, false);
  assert.equal(harness.dom.$('reader-help').childNodes.some(node => node.className === 'recovery-panel help-request-recovery'), false);
  assert.equal(entry.text, 'Existing explanation');
  assert.equal(entry.followUps.length, 0);
  if (!cleanupFails) {
    shouldCancel = false;
    await harness.req.explainSelection('explain', action, 'Why this form?', selected);
    assert.equal(action === 'detail' ? entry.followUps.length : story.chapters[0].help.length, 1);
  }
}
console.log('PASS intentional explanation cancellation clears status, preserves help, permits next request and exposes cleanup failures without recovery');

// 6. Cleanup status bar exposes Finish request action and clears on successful release.
{
  let failCleanup = true, releases = 0;
  resetBridgeAi({
    acknowledge: async () => { releases++; if (failCleanup) throw Error('offline'); }
  });
  const dom = stubDom();
  globalThis.document = dom.document;
  dom.$('reader-dialog').open = true;
  const state = { readerId: 'S', pendingReaderRequestId: 'cancelled' };
  const runtime = {};
  const req = createReaderRequests(deps({ $: dom.$, state, runtime, LANGUAGES }));
  const bar = createGenerationBar(deps({
    $: dom.$,
    state,
    runtime,
    readerPanel: () => ({ classList: { toggle() {} } }),
    releaseInvalidReaderResponse: req.releaseInvalidReaderResponse
  }));
  bar.setReaderGeneration({ storyId: 'S', phase: 'cleanup', message: 'Could not finish cancelled request.' });
  assert.equal(dom.$('reader-generation-action').textContent, 'Finish request');
  await dom.$('reader-generation-action').dispatch('click');
  assert.equal(state.pendingReaderRequestId, 'cancelled');
  failCleanup = false;
  await dom.$('reader-generation-action').dispatch('click');
  assert.equal(state.pendingReaderRequestId, null);
  assert.equal(dom.$('reader-generation-bar').hidden, true);
  assert.equal(releases, 2);
}

// 7. All languages share focused instructions; steered and blank follow-ups preserve legacy history and save before acknowledgement.
for (const code of ['ja', 'de', 'ru', 'es-CL']) {
  const entry = { id: 'H', passage: 'く', start: 3, end: 4, text: 'Original explanation', more: 'Legacy detail' };
  const version = { id: 'V', story: '空は青く、遠く。' };
  const chapter = { id: 'C', help: [entry], versions: [version] };
  const story = { id: 'S', language: code, chapters: [chapter] };
  let request, instructions, saved = false;
  resetBridgeAi({
    wait: async () => { saved = false; return 'The ending adds a boundary.\n\n「でも」 marks a contrast.'; },
    acknowledge: async () => { assert.equal(saved, true); }
  });
  const { req } = makeHarness({
    state: { readerId: 'S', providerId: 'mock', model: 'model' },
    deps: {
      readerStory: () => story,
      normalizeChapters: s => s.chapters,
      activeChapter: () => chapter,
      activeVersion: () => version,
      persistReaderStory() { saved = true; },
      aiSession: { start: async args => { request = JSON.parse(args.input); instructions = args.instructions; return 'r'; } }
    }
  });
  const selected = { storyId: 'S', chapterId: 'C', versionId: 'V', helpId: 'H', text: 'く', start: 3, end: 4, profile: {} };
  await req.explainSelection('explain', 'detail', 'explain prefixes', selected);
  assert.equal(request.followUp, 'explain prefixes');
  assert.equal(request.sentence.slice(request.selectionStart, request.selectionEnd), 'く');
  assert.ok(request.previousExplanation.includes('Legacy detail'));
  assert.ok(instructions.includes('never recap the profile'));
  assert.equal(entry.followUps.length, 2);
  assert.equal(entry.followUps[1].followUp, 'explain prefixes');
  assert.equal(entry.followUps[1].text, 'The ending adds a boundary.\n\n「でも」 marks a contrast.');
  assert.equal(entry.followUps[1].promptVersion, PROMPT_VERSION);
  await req.explainSelection('explain', 'detail', '', selected);
  assert.equal(entry.followUps.length, 3);
  assert.ok(request.previousExplanation.includes('The ending adds a boundary.'));
}
console.log('PASS all languages share focused instructions; steered and blank follow-ups preserve legacy history and save before acknowledgement');

// 8. Editing first, middle and last follow-ups truncates saved history after the edited answer, with generation and save retry.
for (const index of [0, 2, 4]) {
  const history = [
    { followUp: 'First?', text: 'First answer' },
    { action: 'examples', examples: [] },
    { followUp: 'Middle?', text: 'Middle answer' },
    { action: 'examples', examples: [] },
    { followUp: 'Last?', text: 'Last answer' },
    { action: 'examples', examples: [] }
  ];
  const entry = { id: 'H', text: 'Original explanation', followUps: history, more: 'Last answer', detailProvenance: history[4] };
  const version = { id: 'V', story: 'Ein Wort.' }, other = { id: 'other', followUps: [{ followUp: 'Unrelated?' }] };
  const chapter = { id: 'C', help: [entry, other], versions: [version] }, story = { id: 'S', language: 'de', chapters: [chapter] };
  const draft = { item: entry, index, question: 'Edited question?' };
  const before = JSON.stringify(story);
  let failGeneration = index === 2, failSave = index === 2, requests = 0, releases = 0, stored;
  resetBridgeAi({
    wait: async () => {
      if (failGeneration) throw Error('Provider unavailable');
      return 'Replacement answer';
    },
    acknowledge: async () => {
      releases++;
      if (!failGeneration) assert.equal(JSON.parse(stored).chapters[0].help[0].followUps.at(-1).followUp, draft.question);
    }
  });
  const { state, req } = makeHarness({
    state: { readerId: 'S', followUpEdit: draft },
    deps: {
      readerStory: () => story,
      normalizeChapters: s => s.chapters,
      activeChapter: () => chapter,
      activeVersion: () => version,
      persistReaderStory() {
        if (failSave && entry.followUps !== history) throw Error('Disk unavailable');
        stored = JSON.stringify(story);
      },
      aiSession: {
        start: async args => {
          requests++;
          assert.equal(JSON.stringify(story), before);
          const input = JSON.parse(args.input);
          const context = JSON.parse(input.previousExplanation);
          assert.equal(context.explanation, entry.text);
          assert.deepEqual(context.followUps.map(item => item.question), history.slice(0, index).filter(item => item.followUp).map(item => item.followUp));
          assert.equal(input.followUp, draft.question);
          return 'edit-request';
        }
      }
    }
  });
  const selected = { storyId: 'S', chapterId: 'C', versionId: 'V', helpId: 'H', text: 'Wort', start: 4, end: 8, profile: {} };
  const regenerate = () => req.explainSelection('explain', 'detail', draft.question, selected, undefined, draft);
  if (failGeneration) {
    await regenerate();
    assert.equal(JSON.stringify(story), before);
    assert.equal(state.followUpEdit, draft);
    assert.equal(state.pendingReaderResult, undefined);
    failGeneration = false;
    releases = 0; // reset release count from failed-generation cleanup ack
  }
  await regenerate();
  if (failSave) {
    assert.equal(JSON.stringify(story), before);
    assert.equal(stored, before);
    assert.equal(state.followUpEdit, draft);
    assert.equal(releases, 0);
    failSave = false;
    await req.savePendingReaderResult();
    assert.equal(requests, 2);
  }
  const reopened = JSON.parse(stored).chapters[0].help;
  assert.deepEqual(reopened[0].followUps.slice(0, -1), history.slice(0, index));
  assert.equal(reopened[0].followUps.at(-1).followUp, draft.question);
  assert.equal(reopened[0].followUps.at(-1).text, 'Replacement answer');
  assert.deepEqual(reopened[0].detailProvenance, reopened[0].followUps.at(-1));
  assert.equal(reopened[0].more, 'Replacement answer');
  assert.deepEqual(reopened[1], other);
  assert.equal(state.followUpEdit, null);
  assert.equal(releases, 1);
}
console.log('PASS editing first, middle and last follow-ups truncates saved history after the edited answer, with generation and save retry');

// 9. A finished explanation request never moves the learner back to where they asked.
{
  const entry = { id: 'H', passage: 'く', start: 3, end: 4, text: 'Original explanation' };
  const version = { id: 'V', story: '空は青く、遠く。' }, chapter = { id: 'C', help: [entry], versions: [version] }, story = { id: 'S', language: 'ja', chapters: [chapter] };
  const panel = { scrollTop: 900 };
  let renders = 0;
  resetBridgeAi({
    wait: async () => { panel.scrollTop = 120; return 'More detail.'; }
  });
  const { req } = makeHarness({
    state: { readerId: 'S', providerId: 'mock', model: 'model' },
    deps: {
      readerStory: () => story,
      normalizeChapters: s => s.chapters,
      activeChapter: () => chapter,
      activeVersion: () => version,
      readerPanel: () => panel,
      persistReaderStory() {},
      renderSavedHelp() { renders++; panel.scrollTop = 0; },
      aiSession: { start: async () => 'r' }
    }
  });
  await req.explainSelection('explain', 'detail', '', { storyId: 'S', chapterId: 'C', versionId: 'V', helpId: 'H', text: 'く', start: 3, end: 4, profile: {} });
  assert.equal(entry.followUps.length, 1);
  assert.equal(renders, 2);
  assert.equal(panel.scrollTop, 120, 'completion keeps where the learner scrolled during the request, not where they asked');
  console.log('PASS a finished explanation request never moves the learner back to where they asked');
}

// 10. Prompt contracts and explanation/example response contracts.
{
  const detailPrompt = helpInstructions('detail');
  assert.ok(detailPrompt.includes('Return only the explanation text'));
  assert.ok(detailPrompt.includes('or JSON'));
  assert.ok(detailPrompt.includes('**bold**'));
  assert.ok(detailPrompt.includes('Preserve Japanese in Japanese script without romaji'));
  assert.ok(helpInstructions('initial').includes('Return only one JSON object'));
  assert.ok(helpInstructions('examples').includes('Return only one JSON object'));

  // Examples validation via production learning-validation.js + reader-text.js.
  const examples = [0, 1, 2].map(() => ({
    sentence: '山は高く、道はせまいです。',
    translation: 'The mountain is tall, and the road is narrow.',
    highlightStart: 3,
    highlightEnd: 4,
    segments: [{ text: '山', reading: 'やま' }, { text: 'は' }, { text: '高', reading: 'たか' }, { text: 'く、' }, { text: '道', reading: 'みち' }, { text: 'はせまいです。' }]
  }));
  assert.equal(validateExamples({ examples }, 'ja').examples.length, 3);
  for (const invalid of [
    { examples: examples.slice(1) },
    { examples: [...examples.slice(0, 2), { ...examples[2], highlightEnd: 999 }] },
    { examples: [...examples.slice(0, 2), { ...examples[2], translation: 42 }] }
  ]) {
    assert.throws(() => validateExamples(invalid, 'ja'));
  }
  assert.throws(() => japaneseSegments(examples[2].sentence, [{ text: 'wrong' }], true));

  // Initial & detail decodeHelp contracts via explainSelection.
  async function runDecode(raw, action = 'initial') {
    const entry = { id: 'H', passage: 'Brot', start: 0, end: 4, versionId: 'V', text: 'Existing', followUps: [] };
    const story = { id: 'S', language: 'de', chapters: [{ id: 'C', help: action === 'detail' ? [entry] : [], versions: [{ id: 'V', story: 'Brot' }] }] };
    const selected = { storyId: 'S', chapterId: 'C', versionId: 'V', helpId: action === 'detail' ? 'H' : undefined, text: 'Brot', start: 0, end: 4, profile: {} };
    resetBridgeAi({ wait: async () => raw });
    const { dom, req } = makeHarness({
      state: { readerId: 'S', model: 'mock', providerId: 'mock' },
      deps: {
        readerStory: () => story,
        normalizeChapters: s => s.chapters,
        activeChapter: () => story.chapters[0],
        activeVersion: () => story.chapters[0].versions[0],
        persistReaderStory() {},
        aiSession: { start: async () => 'req-decode' }
      }
    });
    await req.explainSelection('explain', action, '', selected);
    const recovery = dom.$('reader-help').childNodes.find(n => n.className === 'recovery-panel help-request-recovery');
    return { saved: action === 'detail' ? entry.followUps[0]?.text : story.chapters[0].help[0]?.text, recovery };
  }

  assert.ok((await runDecode('null', 'initial')).recovery);
  assert.ok((await runDecode('{"explanation":""}', 'initial')).recovery);
  assert.equal((await runDecode('{"explanation":"Focused."}', 'initial')).saved, 'Focused.');
  assert.equal((await runDecode('```json\n{"explanation":"Prefixes mark word beginnings."}\n```', 'detail')).saved, 'Prefixes mark word beginnings.');
  const plainDetail = '「でも」は対比を表します。\\path\n\nIt changes the relationship between the clauses.';
  assert.equal((await runDecode(plainDetail, 'detail')).saved, plainDetail);
  assert.equal((await runDecode('  A general explanation.  ', 'detail')).saved, 'A general explanation.');
  assert.equal((await runDecode('“Hinaufkle...”', 'detail')).saved, '“Hinaufkle...”');
  assert.ok((await runDecode('   ', 'detail')).recovery);
  console.log('PASS explanation/example contracts reject malformed counts, ranges, translations and annotations');
}

// 11. Cancelled readerAi request does not stage a completed result.
{
  let rejectWait, cancelCalls = 0;
  resetBridgeAi({
    providers: async () => ({ providers: [{ id: 'openrouter', connected: true }] }),
    wait: () => new Promise((_, reject) => { rejectWait = reject; }),
    cancel: async () => { cancelCalls++; rejectWait(Error('cancelled')); }
  });
  const { dom, state, req } = makeHarness({
    state: { models: [{ id: 'mock' }], model: 'mock', providerId: undefined },
    deps: {
      aiSession: {
        start: async args => {
          assert.equal(args.providerId, 'openrouter');
          assert.deepEqual({ title: args.title, body: args.body }, { title: 'Explaining your selection', body: 'Working now.' });
          return 'cancel-id';
        }
      }
    }
  });
  const cancellation = req.readerAi('explain', {}, 'test');
  await new Promise(resolve => setImmediate(resolve));
  const cancelBtn = dom.$('reader-help').childNodes.find(node => node.className === 'small-btn reader-ai-cancel');
  assert.ok(cancelBtn);
  await cancelBtn.dispatch('click');
  await assert.rejects(cancellation, /Request cancelled/);
  assert.equal(cancelCalls, 1);
  assert.equal(state.pendingReaderRequestId, null);
  assert.equal(state.requestId, null);
  console.log('PASS cancelled request does not stage a completed result');
}

// 12. Failed reader release remains recoverable; already-released host requests clear without new inference.
for (const code of ['not_found', 'service']) {
  let starts = 0, releaseFails = true;
  resetBridgeAi({
    wait: async () => { throw Object.assign(Error('Service failed'), { code: 'service' }); },
    acknowledge: async () => { if (releaseFails) throw Object.assign(Error('Release failed'), { code }); }
  });
  const { state, req } = makeHarness({
    state: { models: [{ id: 'mock' }], model: 'mock', providerId: 'mock' },
    deps: { aiSession: { start: async () => { starts++; return 'failed-id'; } } }
  });
  await assert.rejects(req.readerAi('explain', {}, 'fixture'), /Service failed/);
  assert.equal(state.requestId, null);
  assert.equal(state.pendingReaderRequestId, code === 'not_found' ? null : 'failed-id');
  releaseFails = false;
  await req.releaseInvalidReaderResponse();
  assert.equal(state.pendingReaderRequestId, null);
  assert.equal(starts, 1);
}
console.log('PASS failed reader release remains recoverable; already-released host requests clear without new inference');
