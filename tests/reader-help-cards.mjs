// Reader help cards: context extraction, loading card, markdown/highlight rendering, examples, selection mode,
// follow-up deletion, version-scoped explanation deletion, card ordering, and outside-tap note dismissal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bridge, loadFactory, deps, stubDom } from './support/factory-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');
const createHelpCards = await loadFactory('js/reader/help-cards.js', 'createHelpCards');
const createReaderView = await loadFactory('js/reader/reader-view.js', 'createReaderView');

globalThis.getComputedStyle ??= () => ({ fontSize: '16px', getPropertyValue: () => '' });
const SPEECH_LANGUAGES = { de: 'de-DE', ja: 'ja-JP', ru: 'ru-RU', 'es-CL': 'es-CL' };

// Small tree-aware enhancement on top of stubDom() so querySelector/querySelectorAll, recursive textContent,
// childElementCount, createElementNS, and remove() work across rendered help cards.
function treeDom() {
  const base = stubDom();
  const matchesSimple = (node, selector) => {
    if (!node || node.nodeType === 3) return false;
    return selector.split(',').map(s => s.trim()).some(part => {
      const tagMatch = part.match(/^([a-zA-Z][\w-]*)/);
      if (tagMatch && String(node.tagName || '').toLowerCase() !== tagMatch[1].toLowerCase()) return false;
      const classes = [...part.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
      if (classes.length) {
        const own = new Set([...String(node.className || '').split(/\s+/).filter(Boolean), ...(node.classList?.values || [])]);
        if (!classes.every(c => own.has(c))) return false;
      }
      return Boolean(tagMatch || classes.length);
    });
  };
  const descendants = (node, out = []) => {
    for (const child of node.children || []) {
      out.push(child);
      descendants(child, out);
    }
    return out;
  };
  const enhance = node => {
    if (!node || node._enhanced) return node;
    node._enhanced = true;
    node.className ??= '';
    const origAppend = node.append.bind(node);
    const origAppendChild = node.appendChild.bind(node);
    node.append = (...nodes) => {
      for (const n of nodes) if (n && typeof n === 'object') n.parentNode = node;
      return origAppend(...nodes);
    };
    node.appendChild = n => {
      if (n && typeof n === 'object') n.parentNode = node;
      return origAppendChild(n);
    };
    node.remove = () => {
      node.removed = true;
      if (node.parentNode?.children) node.parentNode.children = node.parentNode.children.filter(c => c !== node);
    };
    Object.defineProperty(node, 'textContent', {
      configurable: true,
      get() { return (this.children || []).map(c => c.textContent ?? c.nodeValue ?? '').join(''); },
      set(value) { this.children = value ? [{ nodeType: 3, nodeValue: String(value), textContent: String(value) }] : []; }
    });
    Object.defineProperty(node, 'childElementCount', {
      configurable: true,
      get() { return (this.children || []).filter(c => c.nodeType !== 3).length; }
    });
    node.matches = selector => matchesSimple(node, selector);
    node.querySelectorAll = selector => descendants(node).filter(n => matchesSimple(n, selector));
    node.querySelector = selector => descendants(node).find(n => matchesSimple(n, selector)) || null;
    return node;
  };
  const $ = id => enhance(base.$(id));
  const origCreate = base.document.createElement.bind(base.document);
  base.document.createElement = tag => enhance(origCreate(tag));
  base.document.createElementNS = (_ns, tag) => enhance(origCreate(tag));
  base.document.getElementById = id => $(id);
  return { $, document: base.document, descendants };
}

// 1. Explanation selection exits immediately after the last item is deselected.
{
  const dom = treeDom();
  globalThis.document = dom.document;
  const version = { id: 'v1', story: 'Brot und Käse.' };
  const chapter = {
    id: 'c1',
    help: [
      { id: 'one', kind: 'explain', passage: 'Brot', start: 0, end: 4, versionId: 'v1', text: 'Bread' },
      { id: 'two', kind: 'explain', passage: 'Käse', start: 9, end: 13, versionId: 'v1', text: 'Cheese' }
    ]
  };
  const story = { id: 'S', language: 'de', chapters: [chapter] };
  const panel = { scrollTop: 0, classList: { toggle() {} } };
  const state = { explanationSelectionMode: true, selectedExplanationIds: new Set(['one', 'two']) };
  const cards = createHelpCards(deps({
    $: dom.$,
    state,
    SPEECH_LANGUAGES,
    readerStory: () => story,
    activeChapter: () => chapter,
    activeVersion: () => version,
    readerPanel: () => panel,
    profileSnapshot: () => ({}),
    pendingDeletionBlocked: () => false
  }));
  cards.renderSavedHelp(chapter, version);
  const checkboxes = dom.$('reader-help').querySelectorAll('.explanation-select-checkbox');
  assert.equal(checkboxes.length, 2);
  await checkboxes[0].dispatch('change');
  assert.equal(state.explanationSelectionMode, true);
  assert.equal(state.selectedExplanationIds.size, 1);
  await checkboxes[1].dispatch('change');
  assert.equal(state.explanationSelectionMode, false);
  assert.equal(state.selectedExplanationIds.size, 0);
  assert.equal(dom.$('reader-help').querySelector('.explanation-selection-toolbar'), null);
  console.log('PASS explanation selection exits immediately after the last item is deselected');
}

// 2. Focused context offsets across four languages, repeated fragments and context fallback.
{
  const dom = treeDom();
  globalThis.document = dom.document;
  const cards = createHelpCards(deps({ $: dom.$, state: {}, SPEECH_LANGUAGES }));
  for (const [language, sentence, fragment] of [
    ['ja', '空は青く、風はやさしいです。', 'く'],
    ['de', 'Wir gehen mit dem Kind.', 'dem'],
    ['ru', 'Я говорю с другом.', 'ом'],
    ['es-CL', 'Lo vi ayer.', 'Lo']
  ]) {
    const text = 'Earlier!\n' + sentence + ' Next.';
    const start = text.indexOf(fragment, 9);
    const context = cards.helpContext(text, start, start + fragment.length);
    assert.equal(context.sentence.slice(context.selectionStart, context.selectionEnd), fragment, language);
    assert.ok(context.sentence.includes(sentence));
    assert.ok(!context.sentence.includes('Earlier'));
  }
  assert.equal(cards.helpContext('First. Second.', 0, 6).sentence, 'First.');
  assert.equal(cards.helpContext('First. Second.', 7, 14).sentence, ' Second.');
  const repeated = '青く、遠く。';
  assert.equal(cards.helpContext(repeated, 4, 5).selectionStart, 4);
  const passage = { start: 4, end: 5 };
  assert.equal(cards.resolvedHelpContext(repeated, passage, { contextStart: 0, contextEnd: 3, contextTranslation: 'wrong' }).contextTranslation, '');
  assert.equal(cards.resolvedHelpContext(repeated, passage, { contextStart: 0, contextEnd: 6, contextTranslation: 'right' }).contextTranslation, 'right');
  assert.equal(cards.validTextRange('😀く', 1, 2), false);
  assert.equal(cards.validTextRange('😀く', 2, 3), true);
  console.log('PASS focused context offsets across four languages, repeated fragments and context fallback');
}

// 3. Deleting one follow-up preserves the rest, updates legacy detail fields and rolls back failed writes.
{
  const dom = treeDom();
  globalThis.document = dom.document;
  const first = { followUp: 'First?', text: 'First answer' };
  const last = { followUp: 'Last?', text: 'Last answer' };
  const examples = { action: 'examples', examples: [] };
  const helpItem = { id: 'h1', kind: 'explain', passage: 'Brot', start: 0, end: 4, versionId: 'v1', text: 'Base', followUps: [first, examples, last], more: last.text, detailProvenance: last };
  const version = { id: 'v1', story: 'Brot.' };
  const chapter = { id: 'c1', help: [helpItem] };
  const story = { id: 'S', language: 'de', chapters: [chapter] };
  const draft = { item: helpItem, index: 2, question: 'Draft' };
  let failSave = true;
  const state = { followUpEdit: draft, explanationSelectionMode: false, selectedExplanationIds: new Set() };
  const dialog = dom.$('delete-follow-up-dialog');
  dialog.close = () => { dialog.open = false; dialog.dispatch('close'); };

  const cards = createHelpCards(deps({
    $: dom.$,
    state,
    SPEECH_LANGUAGES,
    readerStory: () => story,
    activeChapter: () => chapter,
    activeVersion: () => version,
    readerPanel: () => ({ scrollTop: 0, classList: { toggle() {} } }),
    profileSnapshot: () => ({}),
    pendingDeletionBlocked: () => false,
    persistReaderStory() { if (failSave) throw Error('Disk unavailable'); }
  }));

  cards.renderSavedHelp(chapter, version);
  const before = JSON.stringify(story);
  // Click Delete on the first follow-up (index 0) and confirm while persistence fails.
  await dom.$('reader-help').querySelectorAll('.follow-up-delete')[0].dispatch('click');
  await dom.$('confirm-delete-follow-up').dispatch('click');
  assert.match(dom.$('delete-follow-up-error').textContent, /Disk unavailable/);
  assert.equal(JSON.stringify(story), before);
  assert.equal(draft.index, 2);

  // Retry confirm after persistence recovers -> deletes index 0, shifts draft.index from 2 to 1.
  failSave = false;
  await dom.$('confirm-delete-follow-up').dispatch('click');
  assert.equal(JSON.stringify(helpItem.followUps), JSON.stringify([examples, last]));
  assert.equal(draft.index, 1);

  // Delete the remaining follow-up (now at index 1 in followUps; the only .follow-up-delete button).
  await dom.$('reader-help').querySelectorAll('.follow-up-delete')[0].dispatch('click');
  await dom.$('confirm-delete-follow-up').dispatch('click');
  assert.equal(JSON.stringify(helpItem.followUps), JSON.stringify([examples]));
  assert.equal('more' in helpItem, false);
  assert.equal('detailProvenance' in helpItem, false);
  assert.equal(state.followUpEdit, null);

  // Legacy card with only `more` and `detailProvenance` (no `followUps` array).
  const legacy = { id: 'h2', kind: 'explain', passage: 'Brot', start: 0, end: 4, versionId: 'v1', text: 'Base', more: first.text, detailProvenance: first };
  chapter.help = [legacy];
  cards.renderSavedHelp(chapter, version);
  await dom.$('reader-help').querySelectorAll('.follow-up-delete')[0].dispatch('click');
  await dom.$('confirm-delete-follow-up').dispatch('click');
  assert.deepEqual(legacy.followUps, []);
  assert.equal('more' in legacy, false);
  assert.equal('detailProvenance' in legacy, false);
  console.log('PASS deleting one follow-up preserves the rest, updates legacy detail fields and rolls back failed writes');
}

// 4. Settings feedback, single Explanations heading, accessible loading, and in-card example divider.
{
  const dom = treeDom();
  globalThis.document = dom.document;
  const cards = createHelpCards(deps({ $: dom.$, state: {}, SPEECH_LANGUAGES }));
  const detailLoading = cards.createHelpLoading('detail', 'explain prefixes');
  assert.equal(detailLoading.attributes.role, 'status');
  assert.equal(detailLoading.attributes['aria-live'], 'polite');
  assert.ok(detailLoading.textContent.includes('Adding more detail…'));
  assert.ok(detailLoading.textContent.includes('Answering: explain prefixes'));
  assert.ok(htmlSource.includes('Saved on this device automatically.'));
  assert.ok(htmlSource.includes('<h3 id="reader-help-title">Explanations</h3>'));
  assert.ok(cssSource.includes('.help-examples { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line);'));
  console.log('PASS settings feedback, single Explanations heading, accessible loading, and in-card example divider');
}

// 5. Safe detail formatting and mixed select-all then clear behavior.
{
  const dom = treeDom();
  globalThis.document = dom.document;
  const version = { id: 'V', story: 'Al salir.' };
  const chapter = {
    id: 'C',
    help: [
      { id: 'one', kind: 'explain', passage: 'Al', start: 0, end: 2, versionId: 'V', text: 'Base', followUps: [{ followUp: 'Why?', text: 'In “al salir,” **al** contracts **a + el**.\n\nUse **bold with *italic* inside** and `a él`. <img src=x> Unmatched **marker' }] },
      { id: 'two', kind: 'explain', passage: 'salir', start: 3, end: 8, versionId: 'V', text: 'Leave' }
    ]
  };
  const story = { id: 'S', language: 'es-CL', chapters: [chapter] };
  const panel = { scrollTop: 0, classList: { toggle() {} } };
  const state = { furigana: true, explanationSelectionMode: false, selectedExplanationIds: new Set() };
  const cards = createHelpCards(deps({
    $: dom.$,
    state,
    SPEECH_LANGUAGES,
    readerStory: () => story,
    activeChapter: () => chapter,
    activeVersion: () => version,
    readerPanel: () => panel,
    profileSnapshot: () => ({}),
    pendingDeletionBlocked: () => false
  }));
  cards.renderSavedHelp(chapter, version);
  const formatted = dom.$('reader-help').querySelector('.help-detail');
  const flat = dom.descendants(formatted);
  assert.equal(formatted.childNodes.length, 2);
  assert.equal(flat.filter(n => n.tagName === 'STRONG').length, 3);
  assert.ok(flat.some(n => n.tagName === 'EM' && n.textContent === 'italic'));
  assert.ok(flat.some(n => n.tagName === 'CODE' && n.textContent === 'a él'));
  assert.equal(flat.some(n => n.tagName === 'IMG'), false);
  assert.ok(formatted.textContent.includes('Unmatched **marker'));

  // Mixed selection state -> indeterminate checkbox -> toggleAll selects all -> toggleAll clears and exits.
  state.explanationSelectionMode = true;
  state.selectedExplanationIds = new Set(['one']);
  cards.renderSavedHelp(chapter, version);
  const allBox = dom.$('reader-help').querySelector('.select-all-explanations');
  assert.equal(allBox.indeterminate, true);
  assert.equal(allBox.checked, false);
  await allBox.dispatch('change');
  assert.equal(state.selectedExplanationIds.size, 2);
  assert.equal(allBox.indeterminate, false);
  assert.equal(allBox.checked, true);
  await allBox.dispatch('change');
  assert.equal(state.explanationSelectionMode, false);
  assert.equal(state.selectedExplanationIds.size, 0);
  console.log('PASS safe detail formatting and mixed select-all then clear behavior');
}

// 6. Canonical highlighted context, separate readings, safe text, examples with Listen, UI actions, legacy card, and card ordering.
{
  const dom = treeDom();
  globalThis.document = dom.document;
  const spokenExamples = [];
  bridge.speech.available = true;
  bridge.speech.speak = async options => { spokenExamples.push(options); return { status: 'completed' }; };
  const state = { furigana: true, explanationSelectionMode: false, selectedExplanationIds: new Set() };
  const panelEl = dom.document.createElement('div');
  panelEl.className = 'reader-panel';
  dom.$('reader-dialog').append(panelEl);
  const view = createReaderView(deps({ $: dom.$, state, SPEECH_LANGUAGES }));
  const calls = [];
  const cards = createHelpCards(deps({
    $: dom.$,
    state,
    SPEECH_LANGUAGES,
    readerStory: () => ({ id: 'S', language: 'ja' }),
    readerPanel: () => ({ scrollTop: 0, classList: { toggle() {} } }),
    profileSnapshot: () => ({}),
    createInlineListenButton: view.createInlineListenButton,
    explainSelection: async (...args) => calls.push(args)
  }));

  const examples = [0, 1, 2].map(() => ({
    sentence: '山は高く、道はせまいです。',
    translation: 'The mountain is tall, and the road is narrow.',
    highlightStart: 3,
    highlightEnd: 4,
    segments: [{ text: '山', reading: 'やま' }, { text: 'は' }, { text: '高', reading: 'たか' }, { text: 'く、' }, { text: '道', reading: 'みち' }, { text: 'はせまいです。' }]
  }));
  const v = {
    id: 'V',
    story: '空は青く、風はやさしいです。',
    storySegments: [{ text: '空', reading: 'そら' }, { text: 'は' }, { text: '青', reading: 'あお' }, { text: 'く、' }, { text: '風', reading: 'かぜ' }, { text: 'はやさしいです。' }]
  };
  const sample = { id: 'H', kind: 'explain', passage: 'く', start: 3, end: 4, contextStart: 0, contextEnd: v.story.length, text: 'Focused.', versionId: 'V', profile: {}, followUps: [{ action: 'examples', examples }] };
  cards.renderSavedHelp({ id: 'C', help: [sample] }, v);
  const card = dom.$('reader-help').childNodes[0];
  const nodes = [card, ...dom.descendants(card)];
  assert.equal(nodes.some(node => node.tagName === 'STRONG' && node.textContent === 'Explanation'), false);
  assert.equal(nodes.find(node => node.tagName === 'MARK').textContent, 'く');
  assert.equal(nodes.filter(node => node.tagName === 'LI').length, 3);
  for (const row of nodes.filter(node => node.tagName === 'LI')) {
    const listen = dom.descendants(row).find(node => node.className === 'icon-btn inline-listen');
    assert.equal(listen.disabled, false);
    await listen.dispatch('click');
  }
  assert.deepEqual(spokenExamples.map(({ text, language }) => [text, language]), examples.map(example => [example.sentence, 'ja-JP']));
  assert.ok(nodes.some(node => node.tagName === 'RT' && node.textContent === 'そら'));

  const detail = nodes.find(node => node.tagName === 'BUTTON' && node.textContent === 'More detail');
  const form = nodes.find(node => node.tagName === 'FORM');
  await detail.dispatch('click'); assert.equal(form.hidden, false); assert.equal(calls.length, 0);
  const cancel = nodes.find(node => node.tagName === 'BUTTON' && node.textContent === 'Cancel');
  await cancel.dispatch('click'); assert.equal(form.hidden, true); assert.equal(calls.length, 0);
  const generate = nodes.find(node => node.tagName === 'BUTTON' && node.textContent === 'Generate examples');
  await generate.dispatch('click'); assert.equal(calls[0][1], 'examples'); assert.equal(calls[0][3].helpId, 'H');
  const input = nodes.find(node => node.tagName === 'INPUT');
  input.value = 'Why this ending?';
  await form.dispatch('submit'); assert.equal(calls[1][1], 'detail'); assert.equal(calls[1][2], 'Why this ending?');

  // Safe text rendering for HTML-like characters in story context.
  const htmlVersion = { id: 'Vhtml', story: '<img src=x>く' };
  const escapedCard = { id: 'E', kind: 'explain', passage: 'く', start: 11, end: 12, contextStart: 0, contextEnd: 12, text: 'Safe.', versionId: 'Vhtml', profile: {} };
  cards.renderSavedHelp({ id: 'C', help: [escapedCard] }, htmlVersion);
  const escapedQuote = dom.$('reader-help').querySelector('.help-quote');
  assert.equal(dom.descendants(escapedQuote).filter(node => node.tagName === 'IMG').length, 0);
  assert.equal(escapedQuote.textContent, '<img src=x>く');

  // Legacy card without context offsets / followUps array remains readable.
  const legacyCard = { ...sample, id: 'legacy', contextStart: undefined, contextEnd: undefined, followUps: undefined, more: 'Old detail' };
  cards.renderSavedHelp({ id: 'C', help: [legacyCard] }, v);
  assert.ok(dom.$('reader-help').textContent.includes('Old detail'));
  console.log('PASS canonical highlighted context, separate readings, safe text, examples and both UI actions; legacy cards remain readable');

  // Saved explanations follow the text (start, then end, then newest) without changing their stored order.
  const newer = { ...sample, id: 'newer', text: 'Newest', createdAt: '2026-10-11T12:00:00Z' };
  const older = { ...sample, id: 'older', text: 'Oldest', createdAt: '2026-10-10T12:00:00Z' };
  const late = { ...sample, id: 'late', start: 9, end: 10, createdAt: '2026-10-09T12:00:00Z' };
  const early = { ...sample, id: 'early', start: 0, end: 2, createdAt: '2026-10-12T12:00:00Z' };
  const wide = { ...sample, id: 'wide', start: 0, end: 5, createdAt: '2026-10-13T12:00:00Z' };
  const noOffset = { ...sample, id: 'nooffset', start: undefined, end: undefined, createdAt: '2026-10-14T12:00:00Z' };
  const ordered = [late, noOffset, older, wide, newer, early];
  cards.renderSavedHelp({ id: 'C', help: ordered }, v);
  assert.deepEqual(Array.from(dom.$('reader-help').childNodes, node => node.dataset.helpId), ['early', 'wide', 'newer', 'older', 'late', 'nooffset']);
  assert.deepEqual(ordered.map(item => item.id), ['late', 'nooffset', 'older', 'wide', 'newer', 'early']);
  console.log('PASS saved explanations follow the text (start, then end, then newest) without changing their stored order');
}

// 7. Explanation removal is version-scoped, includes attached follow-ups, and rolls back on save failure.
{
  const dom = treeDom();
  globalThis.document = dom.document;
  const helpRows = [
    { id: 'v1a', versionId: 'v1', kind: 'explain', passage: 'a', text: 'A' },
    { id: 'v2', versionId: 'v2', kind: 'explain', passage: 'b', text: 'B' },
    { id: 'v1b', versionId: 'v1', kind: 'explain', passage: 'c', text: 'C', followUps: [{ text: 'attached' }] }
  ];
  const ch = { id: 'c1', help: helpRows };
  const v1 = { id: 'v1', story: 'a b c' };
  const storyHelp = { id: 'S', language: 'de', chapters: [ch] };
  let fail = false;
  const state = { selectedExplanationIds: new Set(['v1a', 'v1b']), explanationSelectionMode: true };
  const cards = createHelpCards(deps({
    $: dom.$,
    state,
    SPEECH_LANGUAGES,
    pendingDeletionBlocked: () => false,
    readerStory: () => storyHelp,
    activeChapter: () => ch,
    activeVersion: () => v1,
    readerPanel: () => ({ scrollTop: 0, classList: { toggle() {} } }),
    profileSnapshot: () => ({}),
    persistReaderStory() { if (fail) throw Error('disk'); },
    toast() {}
  }));

  cards.renderSavedHelp(ch, v1);
  await dom.$('reader-help').querySelector('.delete-selected-explanations').dispatch('click');
  assert.deepEqual(ch.help.map(x => x.id), ['v2']);
  assert.equal(state.explanationSelectionMode, false);

  ch.help = helpRows;
  state.explanationSelectionMode = true;
  state.selectedExplanationIds = new Set(['v1a']);
  fail = true;
  cards.renderSavedHelp(ch, v1);
  await dom.$('reader-help').querySelector('.delete-selected-explanations').dispatch('click');
  assert.equal(ch.help, helpRows);
  assert.deepEqual(Array.from(state.selectedExplanationIds), ['v1a']);
  console.log('PASS explanation removal is version-scoped, includes attached follow-ups, and rolls back on save failure');
}

// 8. Tapping outside a vocabulary note closes it without opening another (keyboard activation is never swallowed).
{
  const dom = treeDom();
  globalThis.document = dom.document;
  globalThis.window = { ...globalThis.window, getSelection: () => ({ isCollapsed: true }) };
  const popover = dom.$('word-note-popover');
  popover.hidden = false;
  let closed = 0;
  const revealed = [];
  const version = { id: 'V', story: 'Brot.' };
  const chapter = { id: 'C', help: [{ id: 'h1', kind: 'explain', passage: 'Brot', start: 0, end: 4, versionId: 'V', text: 'Bread' }] };
  const state = { explanationSelectionMode: false, selectedExplanationIds: new Set() };
  const cards = createHelpCards(deps({
    $: dom.$,
    state,
    SPEECH_LANGUAGES,
    readerStory: () => ({ id: 'S', language: 'de', chapters: [chapter] }),
    readerPanel: () => ({ scrollTop: 0, classList: { toggle() {} } }),
    profileSnapshot: () => ({}),
    closeWordNote() { closed++; popover.hidden = true; },
    revealCard: card => revealed.push(card.dataset.helpId)
  }));
  cards.renderSavedHelp(chapter, version);

  const mark = { dataset: { helpId: 'h1' }, querySelector: () => null, closest: selector => selector === 'mark.explained-expression' ? mark : null };
  dom.$('reader-story').contains = () => true;
  const outside = { closest: selector => selector === 'mark.explained-expression' ? mark : null };
  const inside = { closest: selector => selector === '#word-note-popover' ? {} : null };

  await dom.$('reader-dialog').dispatch('pointerdown', { target: outside });
  assert.equal(closed, 1, 'outside press closes the note');
  const click = { type: 'click', target: outside, preventDefault() {}, stopPropagation() {} };
  cards.activateStoryText(click);
  cards.activateStoryText(click);
  assert.equal(revealed.length, 0, 'the dismissing tap opens nothing, even through both click handlers');

  const next = { type: 'click', target: outside, preventDefault() {}, stopPropagation() {} };
  await dom.$('reader-dialog').dispatch('pointerdown', { target: outside });
  cards.activateStoryText(next);
  assert.deepEqual(revealed, ['h1'], 'with no note open, the next tap activates the passage');

  popover.hidden = false;
  const closedBeforeInside = closed;
  await dom.$('reader-dialog').dispatch('pointerdown', { target: inside });
  cards.activateStoryText({ type: 'click', target: inside, preventDefault() {}, stopPropagation() {} });
  assert.equal(closed, closedBeforeInside, 'presses inside the note keep it open');
  assert.equal(popover.hidden, false, 'note stays visible after inside press');

  const key = { type: 'keydown', key: 'Enter', target: outside, preventDefault() {}, stopPropagation() {} };
  popover.hidden = false;
  await dom.$('reader-dialog').dispatch('pointerdown', { target: outside });
  cards.activateStoryText(key);
  assert.equal(revealed.length, 2, 'keyboard activation is never swallowed');
  console.log('PASS tapping outside a vocabulary note closes it without opening another');
}
