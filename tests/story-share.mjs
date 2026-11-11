import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {chapterShareText, storyShareText, storyExportFile, slugify, shareTargets, downloadStoryFile, shareStoryFile, shareText, copyText} from '../js/story-share.js';
import {createStoryModel, pathLabel} from '../js/story-model.js';
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
const app=fs.readFileSync('js/app.js','utf8');
const elements=new Map(), element=()=>({children:[],style:{},dataset:{},attributes:{},isConnected:true,append(...children){this.children.push(...children);},setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,fn){this[name]=fn;},getBoundingClientRect(){return {height:144,top:60,bottom:104,right:300};},focus(){this.focused=true;},remove(){},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();}});
const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
const trigger=element(), rebuilt=element();let rendered=0;const toasts=[], delivered=[];
$('library-list').querySelectorAll=()=>[{dataset:{storyId:'S'},querySelector:()=>rebuilt}];
const longer2=structuredClone(longer);
const context={$,state:{},workspaceStorage:{entries:new Map([['data/stories.json',{value:[longer2]}]])},pathChapters:model.pathChapters,selectedPath:model.selectedPath,activeVersion:model.activeVersion,pathLabel,
  chapterShareText,storyShareText,storyExportFile,shareTargets,readJson:()=>({version:'9'}),
  downloadStoryFile:async(payload,options)=>{delivered.push(['download',payload.name,options.isNative]);return {done:'downloaded'};},shareStoryFile:async payload=>{delivered.push(['shareFile',payload.name]);return {launched:true};},
  shareText:async payload=>{delivered.push(['shareText',payload.text]);return {cancelled:true};},copyText:async payload=>{delivered.push(['copy',payload.text]);return {done:'copied'};},
  save:{available:false},share:{available:false},isNative:false,document:{createElement:element,body:element(),querySelector:()=>null},window:{innerHeight:800,innerWidth:375},renderLibrary(){rendered++;},navigator:{clipboard:{}},toast:message=>toasts.push(message),console:{warn(){}},beginStorySelection(){},confirmStoryDeletion(){}};
vm.createContext(context);
vm.runInContext(app.slice(app.indexOf('function closeStoryMenu('),app.indexOf('function confirmStoryDeletion('))+app.slice(app.indexOf('function openShareDialog('),app.indexOf('// Library → Import story…')),context);
const dialog=$('share-dialog');
context.openStoryMenu(longer2,trigger);assert.equal(context.state.storyMenu.popover.children.length,3);
context.state.storyMenu.popover.children[1].click();
assert.equal(dialog.open,true);assert.equal($('share-title').textContent,'Share “日本の話”');
assert.equal($('share-chapter-row').hidden,true,'Library share has no chapter row');
assert.equal($('share-download').hidden,false);assert.equal($('share-send-file').hidden,true);assert.equal($('share-story-send').hidden,true,'browser: Copy only');
assert.equal($('share-download').focused,true,'Download story file is the default action');
assert.equal($('share-path-label').textContent,'Branch 1');
await $('share-story-copy').click();assert.deepEqual(delivered.at(-1),['copy',storyShareText(longer2,model)]);assert.equal(toasts.at(-1),'Story text copied');
context.openStoryMenu(longer2,trigger);context.state.storyMenu.popover.children[1].click();
await $('share-download').click();assert.deepEqual(delivered.at(-1),['download','日本の話.lingomage.json',false]);assert.equal(toasts.at(-1),'Story file downloaded');
// Reader share in App² with Save as and AppShare: every action visible; chapter row names the chapter.
context.save={available:true};context.share={available:true};context.isNative=true;context.state.readerChapter=0;
context.openShareDialog(longer2,{chapterIndex:1,trigger});
assert.equal($('share-chapter-row').hidden,false);assert.equal($('share-chapter-label').textContent,'Chapter 2');assert.equal($('share-chapter-title').textContent,'Next');
assert.equal($('share-send-file').hidden,false);assert.equal($('share-chapter-send').hidden,false);assert.equal($('share-chapter-copy').attributes['aria-label'],'Copy Chapter 2 text');
$('share-notes').checked=true;const before2=toasts.length;await $('share-chapter-send').click();
assert.deepEqual(delivered.at(-1),['shareText',chapterShareText(longer2,longer2.chapters[1],longer2.chapters[1].versions[0],{notes:true})]);assert.equal(toasts.length,before2,'cancel is silent');
await $('share-send-file').click();assert.deepEqual(delivered.at(-1),['shareFile','日本の話.lingomage.json']);
context.copyText=async()=>{throw Error('denied');};context.openShareDialog(longer2,{chapterIndex:1,trigger});await $('share-chapter-copy').click();
assert.equal(toasts.at(-1),'Could not copy the text.');assert.equal(context.state.shareDialog.id,'S','failure keeps the dialog open');assert.equal($('share-chapter-copy').disabled,false);
context.state.libraryStale=true;trigger.isConnected=false;rendered=0;$('share-cancel').click();assert.equal(context.state.shareDialog,null);assert.equal(rendered,1);assert.equal(rebuilt.focused,true);
console.log('PASS story sharing canonical text, path selection, notes, complete saved export, delivery and Library focus');
// Bridge channel: correlation, host errors, malformed replies and timeout cleanup.
const bridge=fs.readFileSync('js/bridge.js','utf8');
const bridgeCode=bridge.slice(bridge.indexOf('const SHARE ='),bridge.indexOf('// Save as (AppSave)')).replace('export const share =','globalThis.share =');
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
  const saveCode=bridge.slice(bridge.indexOf('const SAVE =')).replace('export const save =','globalThis.save =');
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
  assert.deepEqual(paths.map(path=>pathLabel(s,path)),['Main story','Branch at Chapter 3','Branch at Chapter 3 (Version 2)','Branch at Chapter 5','Branch 4']);
  assert.equal(pathLabel({paths:paths.slice(1)},paths[1]),'Branch at Chapter 3');
  assert.equal(paths[1].name,'Alternate 1');
  console.log('PASS storyline labels: main story, branch chapter, same-chapter numbering, unforked legacy fallback');
}
