import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chapterShareText, storyShareText, storyExportFile, slugify, shareTargets, downloadStoryFile, shareStoryFile, shareText, copyText} from '../js/screens/story-share.js';
import {createStoryModel, pathLabel} from '../js/core/story-model.js';
import {bridge, loadFactory, deps, stubDom} from './support/factory-harness.mjs';
const version = {id:'v',title:'買い物',story:'買います。',storySegments:[{text:'買',reading:'か'},{text:'います。'}],glossary:[{word:'買う',meaning:'buy'}]};
const alternate = {...version,id:'a',title:'別',story:'帰ります。'};
const story = {id:'S',title:'日本の話',unknown:{future:true},memories:[{lineage:['v']}],memoryRebuild:{entries:[]},chapters:[{id:'c',versions:[version,alternate],help:[{text:'explanation'}]}],paths:[{id:'original',name:'Original',entries:[{chapterId:'c',versionId:'v'}]},{id:'alt',name:'Alternate 1',entries:[{chapterId:'c',versionId:'a'}]}],activePathId:'alt'};
const model = createStoryModel({state:{},readerStory:()=>story});
assert.equal(chapterShareText(story,story.chapters[0],version),'買い物\n\n買います。');
assert.equal(chapterShareText(story,story.chapters[0],version,{notes:true}),'買い物\n\n買います。\n\nVocabulary\n買う — buy');
const longer = structuredClone(story);
longer.chapters.push({id:'second',versions:[{id:'two',title:'Next',story:'Body',glossary:[]}]});
longer.paths[1].entries.push({chapterId:'second',versionId:'two'});
assert.match(storyShareText(longer,model), /Chapter 2: Next\n\nBody$/);
const before = JSON.stringify(story);
assert.equal(storyShareText(story,model),'日本の話\n\nChapter 1: 別\n\n帰ります。');
assert.match(storyShareText(story,model,{notes:true}),/Vocabulary\n買う — buy$/);
const file = storyExportFile(story,{appVersion:'1',now:'2026-11-10T00:00:00Z'}), exported=JSON.parse(file.content);
assert.deepEqual(exported,{format:'lingomage-story',formatVersion:1,appVersion:'1',exportedAt:'2026-11-10T00:00:00.000Z',story});
assert.equal(file.name,'日本の話.lingomage.json');assert.equal(file.mimeType,'application/json');assert.equal(JSON.stringify(story),before);
for(const key of ['settings','checkpoints','usage','learningSignals'])assert.equal(exported[key],undefined);
assert.equal(slugify(' ../ A / B ! '),'a-b');assert.equal(slugify('!!!'),'story');
const legacy={id:'L',title:'Old',story:'Body'};storyShareText(legacy,model);assert.equal(legacy.paths,undefined,'formatter does not initialize paths on caller');
// Each action does only what its label says; no action falls back to another delivery.
{
  const log=[], clipboard={writeText:async text=>log.push(['copy',text])}, dl=async payload=>log.push(['download',payload]);
  const share={available:true,text:async payload=>log.push(['text',payload]),file:async payload=>log.push(['file',payload])};
  const saveOk={available:true,text:async options=>{log.push(['save',options]);return {saved:true,name:options.name};}};
  assert.deepEqual(shareTargets({save:saveOk,share,isNative:true}),{download:true,shareFile:true,shareText:true});
  assert.deepEqual(shareTargets({save:{available:false},share:{available:false},isNative:false}),{download:true,shareFile:false,shareText:false},'browser: download and copy');
  assert.deepEqual(shareTargets({save:{available:false},share,isNative:true}),{download:false,shareFile:true,shareText:true},'App² without Save as: no broken Download');
  assert.deepEqual(shareTargets({save:{available:false},share:{available:false},isNative:true}),{download:true,shareFile:false,shareText:false},'never an empty file group');
  assert.deepEqual(await downloadStoryFile(file,{save:saveOk,download:dl,isNative:true}),{done:'saved'});
  assert.deepEqual(log.at(-1),['save',{name:file.name,mimeType:'application/json',content:file.content}]);
  assert.deepEqual(await downloadStoryFile(file,{save:{available:true,text:async()=>({saved:false,cancelled:true})},download:dl,isNative:true}),{cancelled:true});
  assert.deepEqual(await downloadStoryFile(file,{save:{available:false},download:dl,isNative:false}),{done:'downloaded'});
  let count=log.length;
  await assert.rejects(downloadStoryFile(file,{save:{available:false},download:dl,isNative:true}),error=>error.code==='unavailable','native never uses <a download>');
  await assert.rejects(downloadStoryFile(file,{save:{available:true,text:async()=>{throw Object.assign(Error('big'),{code:'too_large'});}},download:dl,isNative:true}),error=>error.code==='too_large');
  assert.equal(log.length,count,'failed downloads do not fall back');
  assert.deepEqual(await shareStoryFile(file,{share}),{launched:true});assert.deepEqual(log.at(-1),['file',file]);
  assert.deepEqual(await shareText({title:'T',text:'x'},{share}),{launched:true});assert.equal(log.at(-1)[0],'text');
  assert.deepEqual(await shareText({text:'x'},{share:{available:true,text:async()=>{throw Object.assign(Error(),{code:'cancelled'});}}}),{cancelled:true});
  count=log.length;
  await assert.rejects(shareText({text:'x'},{share:{available:true,text:async()=>{throw Error('host failed');}}}));
  await assert.rejects(shareStoryFile(file,{share:{available:false}}),error=>error.code==='unavailable');
  assert.equal(log.length,count,'host errors do not silently copy');
  assert.deepEqual(await copyText({text:'body'},{clipboard}),{done:'copied'});assert.deepEqual(log.at(-1),['copy','body']);
  await assert.rejects(copyText({text:'x'},{}),error=>error.code==='unavailable');
  console.log('PASS share actions: download via Save as or browser, share file or text, copy text; cancel silent; no fallback');
}
// Execute the real Library action, dialog setup, each action button and close wiring, including rebuilt opener focus.
{
  const createLibraryView = await loadFactory('js/screens/library-view.js', 'createLibraryView');
  const createShareDialog = await loadFactory('js/screens/share-dialog.js', 'createShareDialog');
  const dom = stubDom();
  const origDocument = globalThis.document;
  const origCSS = globalThis.CSS;
  const origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  const origSetTimeout = globalThis.setTimeout;
  const origSave = { ...bridge.save }, origShare = { ...bridge.share };
  const downloads = [], toasts = [], delivered = [];
  let pendingReset = null, renders = 0, saves = 0;

  globalThis.document = dom.document;
  globalThis.CSS = { escape: value => String(value) };
  const origCreateElement = dom.document.createElement.bind(dom.document);
  dom.document.createElement = tag => {
    const node = origCreateElement(tag);
    node.getBoundingClientRect = () => ({ height: 144, top: 60, bottom: 104, right: 300, left: 0, width: 100 });
    node.click = () => { if (node.tagName === 'A') downloads.push({ href: node.href, download: node.download }); };
    node.querySelector = selector => selector === '.story-menu-toggle'
      ? node.children.find(child => String(child.className || '').includes('story-menu-toggle')) || null
      : origCreateElement('span');
    return node;
  };
  for (const id of ['share-send-file', 'share-download']) {
    const icon = dom.document.createElement('span');
    dom.$(id).querySelector = () => icon;
  }
  dom.$('library-list').querySelectorAll = () => dom.$('library-list').children.filter(child => child.dataset?.storyId);
  const dialog = dom.$('share-dialog');
  dialog.close = () => { dialog.open = false; return dialog.dispatch('close'); };

  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async text => { delivered.push(['copy', text]); } } },
    configurable: true, writable: true
  });
  URL.createObjectURL = () => 'blob:story';
  URL.revokeObjectURL = () => {};
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms === 1500) { pendingReset = fn; return 1; }
    return origSetTimeout(fn, ms, ...args);
  };

  try {
    const longer2 = structuredClone(longer);
    const state = { stories: [longer2], libraryLanguage: 'all', librarySort: 'recent', selectedStoryIds: new Set() };
    const workspaceStorage = { entries: new Map([['data/stories.json', { value: [longer2] }]]) };
    let libraryView;
    const { openShareDialog } = createShareDialog(deps({
      $: dom.$,
      activeVersion: model.activeVersion,
      normalizeChapters: model.normalizeChapters,
      pathChapters: model.pathChapters,
      readJson: () => ({ version: '9' }),
      renderLibrary() { renders++; libraryView.renderLibrary(); },
      selectedPath: model.selectedPath,
      state,
      toast: message => toasts.push(message),
      trySaveSettings() { saves++; return true; },
      workspaceStorage
    }, { strict: true }));
    libraryView = createLibraryView(deps({
      $: dom.$,
      LANGUAGES: { ja: 'Japanese' },
      openShareDialog,
      state,
      syncStorySelection() {}
    }, { strict: true }));

    libraryView.renderLibrary();
    const card = dom.$('library-list').children.find(child => child.dataset?.storyId === 'S');
    const trigger = card.querySelector('.story-menu-toggle');
    trigger.isConnected = true;
    await trigger.dispatch('click');
    assert.equal(state.storyMenu.popover.children.length, 3);
    await state.storyMenu.popover.children[1].dispatch('click');

    assert.equal(dialog.open, true);
    assert.equal(dom.$('share-title').textContent, '日本の話', 'the story title is the heading');
    assert.equal(dom.$('share-chapter-row').hidden, true, 'Library share has no chapter row');
    assert.equal(dom.$('share-download').hidden, false);
    assert.equal(dom.$('share-send-file').hidden, true);
    assert.equal(dom.$('share-story-send').hidden, true, 'browser: Copy only');
    assert.ok(dom.$('share-download').querySelector('.share-row-icon').classList.contains('small-btn-strong'), 'without sharing, Save backup is the primary action');
    assert.equal(dom.document.activeElement, dom.$('share-download'), 'focus starts on the primary file action');
    assert.equal(dom.$('share-story-sub').textContent, 'All chapters · Storyline 2');
    assert.equal(dom.$('share-notes').checked, false, 'notes start off without a saved preference');
    dom.$('share-notes').checked = true;
    await dom.$('share-notes').dispatch('change');
    assert.equal(dom.$('share-story-sub').textContent, 'All chapters · Storyline 2', 'summaries do not repeat the notes switch');
    assert.equal(state.shareVocabularyNotes, true);
    assert.equal(saves, 1, 'the notes choice is saved to settings');
    await dom.$('share-story-copy').dispatch('click');
    assert.deepEqual(delivered.at(-1), ['copy', storyShareText(longer2, model, { notes: true })]);
    assert.ok(dom.$('share-story-copy').classList.contains('copied'), 'Copy shows a check');
    assert.equal(dom.$('share-live').textContent, 'Story text copied');
    assert.equal(state.shareDialog.id, 'S', 'Copy keeps the sheet open');
    assert.equal(toasts.length, 0, 'Copy confirms in place, not with a toast');
    pendingReset();
    assert.ok(!dom.$('share-story-copy').classList.contains('copied'));
    await dom.$('share-download').dispatch('click');
    assert.equal(downloads.at(-1).download, '日本の話.lingomage.json');
    assert.equal(toasts.at(-1), 'Story file downloaded');
    assert.equal(state.shareDialog, null, 'a finished download closes the sheet');

    // Reader share with Save as and AppShare: Share story file is primary; the chapter row names the chapter.
    bridge.save.available = true;
    bridge.share.available = true;
    bridge.share.text = async payload => { delivered.push(['shareText', payload.text]); return { cancelled: true }; };
    bridge.share.file = async payload => { delivered.push(['shareFile', payload.name]); return { launched: true }; };
    state.readerChapter = 0;
    openShareDialog(longer2, { chapterIndex: 1, trigger });
    assert.ok(dom.$('share-send-file').querySelector('.share-row-icon').classList.contains('small-btn-strong'));
    assert.ok(!dom.$('share-download').querySelector('.share-row-icon').classList.contains('small-btn-strong'), 'only one accent action');
    assert.equal(dom.document.activeElement, dom.$('share-send-file'));
    assert.equal(dom.$('share-notes').checked, true, 'the saved notes choice is restored on open');
    assert.equal(dom.$('share-chapter-row').hidden, false);
    assert.equal(dom.$('share-chapter-name').textContent, 'Chapter 2');
    assert.equal(dom.$('share-chapter-sub').textContent, 'Next');
    assert.equal(dom.$('share-send-file').hidden, false);
    assert.equal(dom.$('share-chapter-send').hidden, false);
    assert.equal(dom.$('share-chapter-copy').attributes['aria-label'], 'Copy Chapter 2 text');
    dom.$('share-notes').checked = true;
    const before2 = toasts.length;
    await dom.$('share-chapter-send').dispatch('click');
    assert.deepEqual(delivered.at(-1), ['shareText', chapterShareText(longer2, longer2.chapters[1], longer2.chapters[1].versions[0], { notes: true })]);
    assert.equal(toasts.length, before2, 'cancel is silent');
    await dom.$('share-send-file').dispatch('click');
    assert.deepEqual(delivered.at(-1), ['shareFile', '日本の話.lingomage.json']);
    assert.equal(state.shareDialog, null, 'a launched share sheet closes it');

    globalThis.navigator.clipboard.writeText = async () => { throw Error('denied'); };
    openShareDialog(longer2, { chapterIndex: 1, trigger });
    const origWarn = console.warn; console.warn = () => {};
    try { await dom.$('share-chapter-copy').dispatch('click'); }
    finally { console.warn = origWarn; }
    assert.equal(toasts.at(-1), 'Could not copy the text.');
    assert.equal(state.shareDialog.id, 'S', 'failure keeps the sheet open');
    assert.equal(dom.$('share-chapter-copy').disabled, false);

    let closed = 0; const realClose = dialog.close; dialog.close = () => { closed++; };
    await dialog.dispatch('click', { target: dialog });
    assert.equal(closed, 1, 'tapping the backdrop closes');
    await dialog.dispatch('click', { target: dom.$('share-title') });
    assert.equal(closed, 1);
    dialog.close = realClose;

    state.libraryStale = true; trigger.isConnected = false; renders = 0;
    await dom.$('share-cancel').dispatch('click');
    assert.equal(state.shareDialog, null);
    assert.equal(renders, 1);
    const rebuilt = dom.$('library-list').children.find(child => child.dataset?.storyId === 'S').querySelector('.story-menu-toggle');
    assert.notEqual(rebuilt, trigger);
    assert.equal(dom.document.activeElement, rebuilt);
    console.log('PASS story sharing canonical text, path selection, notes, complete saved export, delivery and Library focus');
  } finally {
    Object.assign(bridge.save, origSave);
    Object.assign(bridge.share, origShare);
    globalThis.document = origDocument;
    globalThis.CSS = origCSS;
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    globalThis.setTimeout = origSetTimeout;
    if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator);
    else delete globalThis.navigator;
  }
}
// Bridge channel: correlation, host errors, malformed replies and timeout cleanup.
const bridgeSource=fs.readFileSync('js/bridge.js','utf8');
const bridgeCode=bridgeSource.slice(bridgeSource.indexOf('const SHARE ='),bridgeSource.indexOf('// Save as (AppSave)')).replace('export const share =','globalThis.share =');
let request, timeoutCallback, cleared=0;
const channel={postMessage(value){request=JSON.parse(value);}};
const host={window:{AppShare:channel},setTimeout(fn){timeoutCallback=fn;return 1;},clearTimeout(){cleared++;}};
vm.createContext(host);vm.runInContext(bridgeCode,host);
assert.equal(host.share.available,true);
let pending=host.share.text({title:'Title',text:'Text'});assert.equal(request.action,'text');assert.equal(request.options.text,'Text');
channel.onmessage({data:'broken'});channel.onmessage({data:JSON.stringify({id:'unknown',value:{}})});
channel.onmessage({data:JSON.stringify({id:request.id,value:{launched:true}})});assert.equal((await pending).launched,true);assert.equal(cleared,1);
pending=host.share.file(file);assert.equal(request.action,'file');channel.onmessage({data:JSON.stringify({id:request.id,error:{code:'too_large',message:'Too large'}})});await assert.rejects(pending,error=>error.code==='too_large');
pending=host.share.text({text:'x'});timeoutCallback();await assert.rejects(pending,error=>error.code==='timeout');
const absent={window:{},setTimeout,clearTimeout};vm.createContext(absent);vm.runInContext(bridgeCode,absent);assert.equal(absent.share.available,false);await assert.rejects(absent.share.text({text:'x'}),error=>error.code==='unavailable');
{
  const saveCode=bridgeSource.slice(bridgeSource.indexOf('const SAVE =')).replace('export const save =','globalThis.save =');
  let sent;const ch={postMessage(value){sent=JSON.parse(value);}};const h={window:{AppSave:ch}};vm.createContext(h);vm.runInContext(saveCode,h);
  assert.equal(h.save.available,true);
  let p=h.save.text({name:'a.lingomage.json',mimeType:'application/json',content:'{}'});assert.equal(sent.action,'text');assert.equal(sent.options.mimeType,'application/json');
  ch.onmessage({data:'junk'});ch.onmessage({data:JSON.stringify({id:sent.id,value:{saved:true,name:'a.lingomage.json'}})});assert.equal((await p).saved,true);
  p=h.save.text({name:'b',mimeType:'application/json',content:'{}'});ch.onmessage({data:JSON.stringify({id:sent.id,error:{code:'busy',message:'Busy'}})});await assert.rejects(p,error=>error.code==='busy');
  const none={window:{}};vm.createContext(none);vm.runInContext(saveCode,none);assert.equal(none.save.available,false);await assert.rejects(none.save.text({}),error=>error.code==='unavailable');
}
console.log('PASS AppSave bridge correlation, host errors and unavailable channel');
console.log('PASS AppShare bridge correlation, launch acknowledgement, host errors, timeout and unavailable channel');
// Storyline labels derive from saved structure; saved names are never rewritten.
{
  const paths=[{id:'original',name:'Original',entries:[]},{id:'a',name:'Alternate 1',forkChapter:3,entries:[]},{id:'b',name:'Alternate 2',forkChapter:3,entries:[]},{id:'c',name:'Alternate 3',forkChapter:5,entries:[]},{id:'d',name:'Alternate 4',entries:[]}];
  const s={paths};
  assert.deepEqual(paths.map(path=>pathLabel(s,path)),['Main story','Storyline 2','Storyline 3','Storyline 4','Storyline 5']);
  assert.equal(pathLabel({paths:paths.slice(1)},paths[1]),'Storyline 2');
  assert.equal(paths[1].name,'Alternate 1');
  console.log('PASS storyline labels: main story, sequential storylines, unforked legacy fallback');
}
