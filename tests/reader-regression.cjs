// Core reader text, ruby alignment, canonical selection, speech voice selection,
// save-before-acknowledge lifecycle, and additive legacy chapter normalization.
const assert = require('node:assert/strict');

(async () => {
  const {
    findGlossaryMatches,
    firstGlossaryMatches,
    japaneseSegments,
    annotatedText,
    getCanonicalSelection
  } = await import('../js/reader/reader-text.js');
  const {
    chooseSpanishVoice,
    prepareSpeechOptions,
    speakSelection
  } = await import('../js/reader/reader-speech.js');
  const { saveBeforeAcknowledge } = await import('../js/core/request-lifecycle.js');
  const { createStoryModel } = await import('../js/core/story-model.js');

  function makeElement(tag = 'div') {
    return {
      tagName: tag,
      hidden: false,
      dataset: {},
      childNodes: [],
      events: {},
      attributes: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      get textContent() { return this.childNodes.map(node => node.textContent).join(''); },
      set textContent(value) { this.childNodes = value ? [{ tagName: '#text', textContent: String(value) }] : []; },
      append(...nodes) { this.childNodes.push(...nodes); },
      addEventListener(name, fn) { this.events[name] = fn; },
      setAttribute(name, value) { this.attributes[name] = String(value); }
    };
  }

  // 1. Glossary matching: exact forms, repeated occurrences, shared ranges, longer overlaps, nested forms.
  const matches = findGlossaryMatches('canto cantó canto', [
    { word: 'canto', meaning: 'note one', forms: ['canto'] },
    { word: 'canto', meaning: 'note two', forms: ['canto'] },
    { word: 'cant', meaning: 'short overlap', forms: ['cant'] },
    { word: 'missing', meaning: 'not present', forms: ['absent'] },
    { word: 'empty', meaning: 'empty form', forms: [''] }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(matches.map(item => [item.start, item.end, item.notes.length]))), [[0, 5, 2], [12, 17, 2]]);
  assert.equal(findGlossaryMatches('美しい', [{ word: '美しい', meaning: 'beautiful', forms: ['美しい'] }])[0].end, 3);
  const nestedText = 'У Нади в руках билеты.';
  const nestedNotes = [
    { word: 'у кого есть', meaning: 'possession', forms: ['У Нади в руках билеты'] },
    { word: 'в руках', meaning: 'in hands', forms: ['в руках'] }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(findGlossaryMatches(nestedText, nestedNotes).map(item => item.form))), ['У Нади в руках билеты']);
  assert.deepEqual(JSON.parse(JSON.stringify(firstGlossaryMatches(nestedText, nestedNotes, { nested: true }).map(item => [item.form, !!item.inner]))), [['У Нади в руках билеты', false], ['в руках', true]]);
  console.log('PASS exact glossary forms match repeated occurrences, group shared ranges and prefer longer overlaps');

  // 2. Japanese kanji-only alignment, legacy sentence readings, katakana anchors, invalid readings, immutability.
  const normalize = (text, reading, strict = true) => JSON.parse(JSON.stringify(japaneseSegments(text, [{ text, reading }], strict)));
  assert.deepEqual(normalize('日本の同僚と学食に行きます。', 'にほんのどうりょうとがくしょくにいきます。'), [
    { text: '日本', reading: 'にほん' }, { text: 'の' }, { text: '同僚', reading: 'どうりょう' }, { text: 'と' },
    { text: '学食', reading: 'がくしょく' }, { text: 'に' }, { text: '行', reading: 'い' }, { text: 'きます。' }
  ]);
  assert.deepEqual(normalize('食べ物', 'たべもの'), [{ text: '食', reading: 'た' }, { text: 'べ' }, { text: '物', reading: 'もの' }]);
  assert.deepEqual(normalize('ユキさんは学生です。', 'ゆきさんはがくせいです。'), [{ text: 'ユキさんは' }, { text: '学生', reading: 'がくせい' }, { text: 'です。' }]);
  assert.deepEqual(normalize('学生。', 'がくせい'), [{ text: '学生', reading: 'がくせい' }, { text: '。' }]);
  assert.deepEqual(normalize('かな。', 'かな。'), [{ text: 'かな。' }]);
  for (const reading of ['', 'romaji', 'たべべもの']) assert.throws(() => normalize('食べ物', reading));
  const legacyAnnotations = [{ text: '食べ物', reading: 'たべべもの' }];
  assert.deepEqual(JSON.parse(JSON.stringify(japaneseSegments('食べ物', legacyAnnotations))), legacyAnnotations);
  assert.throws(() => japaneseSegments('日本', [{ text: '日', reading: 'にち' }], true));
  const originalAnnotations = [{ text: '行きます', reading: 'いきます' }];
  japaneseSegments('行きます', originalAnnotations);
  assert.deepEqual(originalAnnotations, [{ text: '行きます', reading: 'いきます' }]);
  console.log('PASS kanji-only alignment, sentence-wide legacy readings, katakana anchors, missing/ambiguous readings and immutable saved annotations');

  // 3. First eligible glossary matches: normalized identities, case/meaning distinction, overlap priority.
  const first = firstGlossaryMatches('canto cantó canto', [
    { word: 'cantar', meaning: 'to sing', forms: ['canto', 'cantó'] },
    { word: ' cantar ', meaning: 'to   sing', forms: ['canto'] },
    { word: 'canto', meaning: 'song', forms: ['canto'] }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(first.map(item => [item.start, item.notes.length]))), [[0, 2]]);
  assert.equal(firstGlossaryMatches('a b', [
    { word: 'café', meaning: 'coffee', forms: ['a'] },
    { word: 'cafe\u0301', meaning: 'coffee', forms: ['b'] }
  ]).length, 1);
  assert.equal(firstGlossaryMatches('a b', [
    { word: 'A', meaning: 'meaning', forms: ['a'] },
    { word: 'a', meaning: 'meaning', forms: ['b'] }
  ]).length, 2);
  assert.deepEqual(Array.from(firstGlossaryMatches('美しい 美', [
    { word: '美', meaning: 'beauty', forms: ['美'] },
    { word: '美しい', meaning: 'beautiful', forms: ['美しい'] }
  ]), item => item.form), ['美しい', '美']);
  const shared = firstGlossaryMatches('a b b', [
    { word: 'same', meaning: 'one', forms: ['a', 'b'] },
    { word: 'same', meaning: 'two', forms: ['b'] }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(shared.map(item => [item.start, item.notes.map(note => note.meaning)]))), [[0, ['one']], [2, ['two']]]);
  console.log('PASS first eligible notes share normalized identities across forms; meanings/case stay distinct and overlaps resolve first');

  // 4. Cross-annotation glossary notes retain Japanese ruby readings, keyboard/click delegation, and first-occurrence reset.
  const origDoc = globalThis.document;
  globalThis.document = {
    createElement: makeElement,
    createTextNode: value => ({ tagName: '#text', textContent: value })
  };
  try {
    const annotatedRoot = makeElement('div');
    let noteOpened = 0, openedTrigger;
    annotatedText(annotatedRoot, '日本語', [{ text: '日', reading: 'にち' }, { text: '本語', reading: 'ほんご' }], {
      language: 'ja-JP',
      glossary: [{ word: '日本語', meaning: 'Japanese language', forms: ['日本語'] }],
      onNote(event, trigger) { noteOpened++; openedTrigger = trigger; }
    });
    assert.equal(annotatedRoot.lang, 'ja-JP');
    assert.equal(annotatedRoot.childNodes.length, 2);
    assert.equal(annotatedRoot.childNodes[0].tagName, 'ruby');
    assert.equal(annotatedRoot.childNodes[1].tagName, 'ruby');
    assert.equal(annotatedRoot.childNodes[0].childNodes[0].className, 'gloss-note-trigger');
    assert.equal(annotatedRoot.childNodes[1].childNodes[0].className, 'gloss-note-trigger');
    assert.equal(annotatedRoot.childNodes[0].childNodes[1].textContent, 'にち');
    assert.equal(annotatedRoot.childNodes[1].childNodes[1].textContent, 'ほんご');
    let keyPrevented = false;
    annotatedRoot.childNodes[0].childNodes[0].events.keydown({ key: 'Enter', preventDefault() { keyPrevented = true; } });
    assert.equal(noteOpened, 1);
    assert.equal(keyPrevented, true);
    const primary = annotatedRoot.childNodes[0].childNodes[0], secondary = annotatedRoot.childNodes[1].childNodes[0];
    assert.equal(primary.attributes.role, 'button');
    assert.equal(primary.tabIndex, 0);
    assert.equal(secondary.attributes.role, undefined);
    assert.equal(secondary.tabIndex, undefined);
    assert.equal(secondary.events.keydown, undefined);
    secondary.events.click({});
    assert.equal(openedTrigger, primary);
    assert.equal(noteOpened, 2);

    annotatedText(annotatedRoot, '日本語日本語', [
      { text: '日', reading: 'にち' }, { text: '本語', reading: 'ほんご' },
      { text: '日', reading: 'にち' }, { text: '本語', reading: 'ほんご' }
    ], { glossary: [{ word: '日本語', meaning: 'Japanese language', forms: ['日本語'] }] });
    assert.equal(annotatedRoot.childNodes.length, 4);
    assert.deepEqual(Array.from(annotatedRoot.childNodes, node => node.childNodes.at(-1).textContent), ['にち', 'ほんご', 'にち', 'ほんご']);
    assert.equal(annotatedRoot.childNodes.slice(2).some(node => node.childNodes.some(child => child.className === 'gloss-note-trigger')), false);

    const repeatedNotes = [{ word: 'Brot', meaning: 'bread', forms: ['Brot'] }];
    for (const text of ['Brot Brot', 'Brot', 'Brot Brot Brot', 'Brot Brot']) {
      annotatedText(annotatedRoot, text, null, { glossary: repeatedNotes });
      assert.equal(annotatedRoot.childNodes.filter(node => node.className === 'gloss-note-trigger').length, 1);
      assert.equal(annotatedRoot.textContent, text);
    }
    console.log('PASS repeated rendering/chapter versions reset first occurrences and leave canonical text intact');
    console.log('PASS cross-annotation glossary notes retain complete Japanese ruby readings and selectable source markup');
  } finally {
    globalThis.document = origDoc;
  }

  // 5. Speech voice selection prefers Chilean, then Latin American, then available Spanish voices.
  const voices = [
    { id: 'es-mx-net', language: 'es-MX', requiresNetwork: true },
    { id: 'es-cl-net', language: 'es-CL', requiresNetwork: true },
    { id: 'es-cl-offline', language: 'es-CL', requiresNetwork: false },
    { id: 'es-es-offline', language: 'es-ES', requiresNetwork: false },
    { id: 'de-offline', language: 'de-DE', requiresNetwork: false }
  ];
  assert.equal(chooseSpanishVoice(voices).id, 'es-cl-offline');
  const noChile = voices.filter(voice => voice.language !== 'es-CL');
  assert.equal(chooseSpanishVoice(noChile).id, 'es-mx-net');
  assert.equal(chooseSpanishVoice([{ id: 'es-419', language: 'es-419', requiresNetwork: true }]).id, 'es-419');
  let speechOptions;
  const speechStub = { voices: async () => ({ voices }), speak: async options => { speechOptions = options; return { status: 'completed' }; } };
  const prepared = await prepareSpeechOptions(speechStub, 'Hola', 'es-CL');
  assert.equal(prepared.voice.language, 'es-CL');
  assert.equal(prepared.options.voiceId, 'es-cl-offline');
  assert.equal(prepared.options.language, 'es-CL');
  await speakSelection(speechStub, 'Hola', 'es-CL');
  assert.equal(speechOptions.voiceId, 'es-cl-offline');
  const german = await prepareSpeechOptions(speechStub, 'Guten Tag', 'de-DE');
  assert.equal(german.options.language, 'de-DE');
  assert.equal(german.options.voiceId, undefined);
  console.log('PASS speech uses explicit source locale and prefers Chilean, then Latin American, then available Spanish voices');

  // 6. Save before acknowledge lifecycle.
  const operationOrder = [];
  let generatedSaved = false, failGeneratedSave = true, failGeneratedAck = true;
  const saveGeneration = () => saveBeforeAcknowledge({
    saved: generatedSaved,
    apply: () => () => {},
    persist() { operationOrder.push('save'); if (failGeneratedSave) throw Error('disk'); },
    onSaved() { generatedSaved = true; },
    acknowledge() { operationOrder.push('ack'); if (failGeneratedAck) throw Error('ack'); }
  });
  await assert.rejects(saveGeneration(), /disk/);
  assert.deepEqual(operationOrder, ['save']);
  assert.equal(generatedSaved, false);
  failGeneratedSave = false;
  await assert.rejects(saveGeneration(), /ack/);
  assert.deepEqual(operationOrder, ['save', 'save', 'ack']);
  assert.equal(generatedSaved, true);
  failGeneratedAck = false;
  await saveGeneration();
  assert.deepEqual(operationOrder, ['save', 'save', 'ack', 'ack']);
  console.log('PASS generated story saves before acknowledgement, retains failed saves, and retries release without saving twice');

  // 7. Canonical selection omits ruby readings across root, ruby, text-node and reading boundaries.
  const textNode = value => ({ nodeType: 3, nodeValue: value, childNodes: [] });
  const elemNode = (tag, ...children) => ({ nodeType: 1, childNodes: children, matches: name => name === tag, closest: () => null, contains: () => true });
  const a = textNode('日'), reading = textNode('にち'), b = textNode('本。'), ruby = elemNode('ruby', a, elemNode('rt', reading));
  const root = elemNode('div', ruby, b);
  function texts(node, out = []) {
    if (node.nodeType === 3) out.push(node);
    else for (const child of node.childNodes) if (!child.matches?.('rt')) texts(child, out);
    return out;
  }
  const origNode = globalThis.Node, origNodeFilter = globalThis.NodeFilter, origWin = globalThis.window;
  try {
    globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
    globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 };
    let range;
    globalThis.window = { getSelection: () => ({ isCollapsed: false, anchorNode: root, focusNode: root, getRangeAt: () => range }) };
    globalThis.document = { createTreeWalker: () => { const list = texts(root); let i = 0; return { nextNode: () => list[i++] || null }; } };
    range = { startContainer: root, startOffset: 0, endContainer: root, endOffset: 2 };
    assert.equal(getCanonicalSelection(root).text, '日本。');
    range = { startContainer: ruby, startOffset: 0, endContainer: b, endOffset: 1 };
    assert.equal(getCanonicalSelection(root).text, '日本');
    range = { startContainer: a, startOffset: 0, endContainer: b, endOffset: 2 };
    assert.equal(getCanonicalSelection(root).text, '日本。');
    const rt = ruby.childNodes[1];
    reading.parentElement = { closest: () => rt };
    range = { startContainer: reading, startOffset: 1, endContainer: b, endOffset: 1 };
    assert.equal(getCanonicalSelection(root).text, '本');

    const left = textNode('日'), leftReading = textNode('にち'), right = textNode('本'), rightReading = textNode('ほん');
    const leftRuby = elemNode('ruby', left, elemNode('rt', leftReading)), rightRuby = elemNode('ruby', right, elemNode('rt', rightReading));
    const noted = elemNode('span', leftRuby, rightRuby), crossRoot = elemNode('div', noted);
    let crossRange;
    globalThis.window = { getSelection: () => ({ isCollapsed: false, anchorNode: left, focusNode: right, getRangeAt: () => crossRange }) };
    globalThis.document = { createTreeWalker: () => { const list = texts(crossRoot); let i = 0; return { nextNode: () => list[i++] || null }; } };
    crossRange = { startContainer: left, startOffset: 0, endContainer: right, endOffset: 1 };
    assert.equal(getCanonicalSelection(crossRoot).text, '日本');
    console.log('PASS root, ruby, text-node and reading-boundary selections omit readings');
  } finally {
    globalThis.Node = origNode;
    globalThis.NodeFilter = origNodeFilter;
    globalThis.window = origWin;
    globalThis.document = origDoc;
  }

  // 8. Additive legacy story normalization preserves provenance without mutating legacy object.
  const model = createStoryModel({ state: {} });
  const legacy = { id: 'legacy', title: 'Title', story: 'Text', providerId: 'provider', promptVersion: 'original' };
  const chapters = model.normalizeChapters(legacy);
  assert.equal(chapters[0].versions[0].story, 'Text');
  assert.equal(chapters[0].versions[0].promptVersion, 'original');
  assert.equal(legacy.chapters, undefined);
  console.log('PASS additive legacy interpretation preserves provenance');
})().catch(error => { console.error(error); process.exitCode = 1; });
