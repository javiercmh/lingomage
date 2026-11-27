const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/bridge.js','utf8').slice(fs.readFileSync('js/bridge.js','utf8').indexOf('const TRANSLATION =')).split('// Native Sharesheet:')[0].replace('export const translation', 'const translation') + '\nthis.translation = translation;';
function harness(channel) { const c = {window: {AppTranslation: channel}, setTimeout, clearTimeout}; vm.createContext(c); vm.runInContext(source,c); return c.translation; }

function createSelectionDom(stubDom) {
  const dom = stubDom();
  const docEvents = {}, winEvents = {};
  dom.document.hidden = false;
  dom.document.addEventListener = (type, fn) => { docEvents[type] = fn; };
  const textNode = value => ({ nodeType: 3, nodeValue: value, childNodes: [], parentElement: null });
  const domNode = (tag, ...children) => {
    const node = { nodeType: 1, childNodes: children, parentElement: null, matches: name => name === tag, closest: name => name === tag ? node : null, contains: target => allNodes.has(target) };
    for (const child of children) child.parentElement = node;
    return node;
  };
  const kanjiNode = textNode('大学');
  const readingNode = textNode('だいがく');
  const rtNode = domNode('rt', readingNode);
  const rubyNode = domNode('ruby', kanjiNode, rtNode);
  const tailNode = textNode('だ今日あいうえおかきくけこ');
  const allNodes = new Set([rubyNode, kanjiNode, rtNode, readingNode, tailNode]);
  const storyEl = dom.$('reader-story');
  storyEl.append(rubyNode, tailNode);
  storyEl.textContent = '大学だいがくだ今日あいうえおかきくけこ';
  storyEl.contains = target => allNodes.has(target) || target === storyEl;
  allNodes.add(storyEl);
  function collectTexts(node, filter, out = []) {
    if (node.nodeType === 3) {
      if (!filter || filter.acceptNode(node) === 1) out.push(node);
    } else if (node.nodeType !== 1 || !filter || filter.acceptNode(node) !== 2) {
      for (const child of node.childNodes || []) {
        if (child.nodeType === 1 && child.matches?.('rt')) continue;
        collectTexts(child, filter, out);
      }
    }
    return out;
  }
  dom.document.createTreeWalker = (root, _what, filter) => {
    const list = collectTexts(root, filter);
    let i = 0;
    return { nextNode: () => list[i++] || null };
  };
  let range = { startContainer: kanjiNode, startOffset: 0, endContainer: kanjiNode, endOffset: 2, getBoundingClientRect: () => ({ left: 10, top: 100, right: 50, bottom: 120, width: 40, height: 20 }) };
  const setRange = (node, startOffset, endOffset) => {
    range = { startContainer: node, startOffset, endContainer: node, endOffset, getBoundingClientRect: () => ({ left: 10, top: 100, right: 50, bottom: 120, width: 40, height: 20 }) };
  };
  globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.document = dom.document;
  globalThis.window = {
    innerWidth: 400, innerHeight: 800,
    matchMedia: globalThis.matchMedia,
    addEventListener(type, fn) { winEvents[type] = fn; },
    removeEventListener() {},
    getSelection: () => ({ isCollapsed: false, anchorNode: range.startContainer, focusNode: range.endContainer, getRangeAt: () => range })
  };
  dom.$('selection-toolbar').hidden = true;
  const triggerSelection = () => {
    let scheduled;
    const prevSet = globalThis.setTimeout, prevClear = globalThis.clearTimeout;
    globalThis.setTimeout = fn => { scheduled = fn; return 1; };
    globalThis.clearTimeout = () => {};
    try { docEvents.selectionchange(); } finally { globalThis.setTimeout = prevSet; globalThis.clearTimeout = prevClear; }
    scheduled();
  };
  return { dom, docEvents, winEvents, kanjiNode, tailNode, setRange, triggerSelection };
}

(async () => {
 const { loadFactory, deps, stubDom, bridge } = await import('./support/factory-harness.mjs');
 const createReaderSelection = await loadFactory('js/reader/reader-selection.js', 'createReaderSelection');
 const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };

 // Bridge contract and native error propagation.
 const missing = harness(null); assert.deepEqual(JSON.parse(JSON.stringify(await missing.availability())), {available:false}); await assert.rejects(missing.open({text:'Hallo'}), e => e.code === 'unavailable');
 const channel = {postMessage(raw) { const request = JSON.parse(raw); this.last = request; this.onmessage({data: JSON.stringify({id:request.id, value:request.action === 'availability' ? {available:true} : {opened:true}})}); }};
 const translation = harness(channel); assert.equal((await translation.availability()).available,true);
 assert.equal((await translation.open({text:'日本語'})).opened,true); assert.equal(channel.last.options.text,'日本語');
 channel.postMessage = function(raw) { const request=JSON.parse(raw); this.onmessage({data:JSON.stringify({id:request.id,error:{code:'invalid_request',message:'Blank text'}})}); };
 await assert.rejects(translation.open({text:''}),e=>e.code==='invalid_request');

 // Execute the actual toolbar/controller code with deterministic bridge promises.
 const { dom, docEvents, winEvents, kanjiNode, tailNode, setRange, triggerSelection } = createSelectionDom(stubDom);
 const checks = [], launches = [], messages = [], lookups = [];
 const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
 bridge.speech.available = true;
 bridge.translation.availability = () => { const d = deferred(); checks.push(d); return d.promise; };
 bridge.translation.open = options => { const d = deferred(); d.options = options; launches.push(d); return d.promise; };
 const state = { readerSelection: null };
 createReaderSelection(deps({
   $: dom.$, state, SPEECH_LANGUAGES: { ja: 'ja-JP' },
   readerStory: () => ({ id: 's', language: 'ja' }),
   activeChapter: () => ({ id: 'c' }),
   activeVersion: () => ({ id: 'v', story: '大学だ今日あいうえおかきくけこ' }),
   sentenceContext: () => '',
   profileSnapshot: () => ({}),
   toast: message => messages.push(message),
   recordSelectionLookup: (_item, action) => lookups.push(action)
 }));
 assert.equal(winEvents.pageshow, undefined, 'no pageshow re-check listener is registered');
 const button = dom.$('selection-translate');
 assert.equal(checks.length, 0, 'no startup check');
 triggerSelection(); assert.equal(button.disabled, true); assert.equal(checks.length, 1);
 triggerSelection(); assert.equal(checks.length, 1, 'unchanged selection deduplicated');
 checks[0].resolve({ available: true }); await flush(); assert.equal(button.disabled, false);
 for (let i = 0; i < 20; i++) {
   await button.dispatch('click'); await flush(); assert.equal(button.disabled, true);
   await button.dispatch('click'); await flush(); assert.equal(launches.length, i + 1, 'duplicate launch suppressed');
   assert.deepEqual(launches[i].options, { text: '大学' });
   dom.document.hidden = true; docEvents.visibilitychange();
   launches[i].resolve({ opened: true }); await flush();
   dom.document.hidden = false; docEvents.visibilitychange();
   assert.equal(button.disabled, false); assert.equal(checks.length, 1, 'no return or post-launch check');
 }
 console.log('PASS translation availability, external launch contract, canonical text, unavailable and native error propagation');
 setRange(tailNode, 1, 3); triggerSelection(); assert.equal(button.disabled, false);
 checks[1].reject(Object.assign(new Error('timeout'), { code: 'timeout' })); await flush(); assert.equal(button.disabled, false);
 setRange(tailNode, 4, 5); triggerSelection();
 setRange(tailNode, 5, 6); triggerSelection();
 checks[3].resolve({ available: true }); await flush(); checks[2].resolve({ available: false }); await flush(); assert.equal(button.disabled, false, 'stale negative ignored');
 setRange(tailNode, 6, 7); triggerSelection(); dom.document.hidden = true; docEvents.visibilitychange();
 dom.document.hidden = false; docEvents.visibilitychange(); checks[4].resolve({ available: false }); await flush(); assert.equal(button.disabled, false, 'background check invalidated');
 await button.dispatch('click'); await flush(); launches[20].reject(new Error('Launch failed')); await flush(); assert.equal(button.disabled, false); assert.equal(messages.length, 1); assert.equal(lookups.length, 20, 'only opened launches record a lookup');
 setRange(tailNode, 7, 8); triggerSelection(); checks[5].resolve({ available: false }); await flush(); assert.equal(button.disabled, true);
 setRange(tailNode, 8, 9); triggerSelection(); checks[6].reject(new Error('network')); await flush(); assert.equal(button.disabled, true);
 setRange(tailNode, 9, 10); triggerSelection(); checks[7].resolve({ available: true }); await flush(); assert.equal(button.disabled, false);
 console.log('PASS translation selection checks, 20 launches, duplicate prevention, timeouts, stale/background replies and recovery');

 // Initial availability failure recovery and hidden-page checks.
 {
   const second = createSelectionDom(stubDom);
   const pending = [];
   bridge.translation.availability = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
   createReaderSelection(deps({
     $: second.dom.$, state: { readerSelection: null }, SPEECH_LANGUAGES: { ja: 'ja-JP' },
     readerStory: () => ({ id: 's', language: 'ja' }),
     activeChapter: () => ({ id: 'c' }),
     activeVersion: () => ({ id: 'v', story: '大学だ今日あいうえおかきくけこ' }),
     sentenceContext: () => '',
     profileSnapshot: () => ({})
   }));
   const btn = second.dom.$('selection-translate');
   assert.equal(pending.length, 0);
   second.triggerSelection(); pending[0].reject(new Error('timeout')); await flush();
   assert.equal(btn.disabled, true, 'unknown availability stays disabled after initial failure');
   second.setRange(second.tailNode, 1, 3); second.triggerSelection(); pending[1].resolve({ available: true }); await flush();
   assert.equal(btn.disabled, false, 'later selection check recovers initial failure');
   second.dom.document.hidden = true; second.docEvents.visibilitychange();
   second.setRange(second.tailNode, 4, 5); second.triggerSelection(); await flush();
   assert.equal(pending.length, 2, 'hidden selection does not check');
   console.log('PASS initial availability failure recovery and hidden-page checks');
 }
})().catch(e => { console.error(e); process.exitCode = 1; });
