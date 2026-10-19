(async()=>{
const {bindStory, bindGeneration, bindPanels}=await import('./support/controllers.mjs');
// Dependency-free regression harness; exercises production functions with isolated DOM/AI stubs.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
const htmlSource = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const cssSource = fs.readFileSync(require('node:path').join(__dirname, '../css/style.css'), 'utf8');
const readerTextSource = fs.readFileSync(require('node:path').join(__dirname, '../js/reader-text.js'), 'utf8').replaceAll('export function ', 'function ');
const learningSource = fs.readFileSync(require('node:path').join(__dirname, '../js/learning-validation.js'), 'utf8').replace(/^import .*;\n/m, '').replaceAll('export ', '');
const requestLifecycleSource = fs.readFileSync(require('node:path').join(__dirname, '../js/request-lifecycle.js'), 'utf8').replaceAll('export async function ', 'async function ');
const speechSource = fs.readFileSync(require('node:path').join(__dirname, '../js/reader-speech.js'), 'utf8').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ');
const notificationSource = fs.readFileSync(require('node:path').join(__dirname, '../js/ai-notification.js'), 'utf8').replaceAll('export function ', 'function ');
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function sandbox(extra = {}) {
  const elements = new Map();
  const element = (tag = 'div') => ({tagName:tag,hidden:false,dataset:{},childNodes:[],events:{},attributes:{},
    get textContent(){return this.childNodes.map(node=>node.textContent).join('');},set textContent(value){this.childNodes=value ? [{tagName:'#text',textContent:String(value)}] : [];},
    append(...nodes){this.childNodes.push(...nodes);},addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){this.attributes[name]=value;},focus(){this.focused=true;},scrollIntoView(){},remove(){},querySelector(selector){return this.childNodes.find(node=>node.tagName===selector) || this.childNodes.map(node=>node.querySelector?.(selector)).find(Boolean) || null;},querySelectorAll(){return [];},classList:{add(){},remove(){},toggle(){}}});
  const c = {workspaceStorage:{assertWritable(){}},usage:{setReader(){},checkpoint(){}},settingsFeedback:{sync(){}},pipeline:null,state:{},console,crypto:{randomUUID:(()=>{let id=0;return ()=>`help-test-${++id}`;})()},PROMPT_VERSION:'test',STORY_GUIDES:{de:{beginner:'Simple sentences'}},renderChapterRequest(){},updateReaderNavigation(){},renderCheckpointRecovery(){},LANGUAGES:{ja:'Japanese',de:'German',ru:'Russian','es-CL':'Spanish'},SPEECH_LANGUAGES:{de:'de-DE',ja:'ja-JP',ru:'ru-RU','es-CL':'es-CL'},renderGenerationRecovery(){},readerPanel:()=>({classList:{toggle(){}}}),$:id=>{if(!elements.has(id)) elements.set(id,element()); return elements.get(id);},document:{createElement:element,createElementNS:(_ns,name)=>element(name),createTextNode:value=>({tagName:'#text',textContent:value}),querySelectorAll:()=>[]},toast(){},...extra};
  c.readerGeneration = null; c.renderReaderGeneration = () => {}; c.setReaderGeneration = value => { c.readerGeneration = value; };
  vm.createContext(c);
  vm.runInContext(notificationSource, c);
  vm.runInContext(fs.readFileSync('js/generation-errors.js','utf8').replaceAll('export function ', 'function '), c);
  vm.runInContext(readerTextSource, c);
  vm.runInContext(learningSource, c);
  vm.runInContext(requestLifecycleSource, c);
  vm.runInContext(speechSource, c);
  return c;
}
const lifecycle = section('async function acknowledgeReaderResult(', 'function decodeHelp(');
(async () => {
  const pointerEvents = new Map(), timers = new Map(); let nextTimer = 0, holds = 0;
  const pointer = sandbox({document:{addEventListener:(name,fn)=>pointerEvents.set(name,fn),removeEventListener:name=>pointerEvents.delete(name)},setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(section('function wireLongPress(', 'function renderLibrary('),pointer);
  const pressCard={events:{},addEventListener(name,fn){this.events[name]=fn;}};
  pointer.wireLongPress(pressCard,()=>holds++);
  const down={button:0,clientX:10,clientY:10,target:{closest:()=>null}};
  const expire=()=>{for(const fn of [...timers.values()])fn();};
  for(const cancel of [()=>pressCard.events.pointerleave(),()=>pointerEvents.get('pointerup')(),()=>pointerEvents.get('pointercancel')(),()=>pointerEvents.get('scroll')(),()=>pressCard.events.pointermove({clientX:30,clientY:10})]) {
    pressCard.events.pointerdown(down);cancel();expire();assert.equal(holds,0);assert.equal(pointerEvents.size,0);
  }
  pressCard.events.pointerdown(down);expire();assert.equal(holds,1);assert.equal(pointerEvents.size,0);
  let suppressed=0;pressCard.events.click({preventDefault(){suppressed++;},stopPropagation(){}});assert.equal(suppressed,1);
  const textTarget={closest:selector=>selector==='.help-text-selectable'?{}:null};
  let textToggles=0;
  pointer.wireLongPress(pressCard,()=>holds++,event=>{if(event.target.closest?.('.help-text-selectable'))return;textToggles++;},false,event=>!!event.target.closest?.('.help-text-selectable'));
  pressCard.events.pointerdown({...down,target:textTarget});expire();assert.equal(holds,1);assert.equal(timers.size,0);
  pressCard.events.click({target:textTarget,preventDefault(){},stopPropagation(){}});assert.equal(textToggles,0);
  console.log('PASS long press cancels on leaving, outside release, scrolling, cancellation and movement; completed holds suppress clicks');
  console.log('PASS selectable explanation text is excluded from long-press and bulk-toggle handling');

  const swipe = sandbox({setTimeout:()=>0,clearTimeout(){},state:{storySelectionMode:false}, revealStory(card,id){swipe.revealed=id;}, closeStoryReveal(){swipe.revealed=null;}});
  vm.runInContext(section('const STORY_TRAY_WIDTH', 'function confirmStoryDeletion('),swipe);
  const swipeClasses=new Set();const swipeCard={events:{},classList:{contains:n=>swipeClasses.has(n),add:n=>swipeClasses.add(n),remove:n=>swipeClasses.delete(n)},style:{setProperty(){},removeProperty(){}},querySelector:()=>({hidden:true}),addEventListener(name,fn){this.events[name]=fn;},setPointerCapture(){}};
  let cancelledHolds=0;
  swipe.wireStorySwipe(swipeCard,'a',()=>cancelledHolds++);
  const gesture=(dx,dy=0,type='touch',cancel=false)=>{
    const e={pointerId:1,pointerType:type,button:0,clientX:200,clientY:100,target:{closest:()=>null},preventDefault(){}};
    swipeCard.events.pointerdown(e);
    swipeCard.events.pointermove({...e,clientX:200+dx,clientY:100+dy});
    if(cancel)swipeCard.events.pointercancel();else swipeCard.events.pointerup({...e,clientX:200+dx,clientY:100+dy});
  };
  gesture(-59);assert.equal(swipe.revealed,undefined);
  gesture(-60);assert.equal(swipe.revealed,'a');assert.ok(cancelledHolds>0);
  let clickSuppressed=false;swipeCard.events.click({preventDefault(){clickSuppressed=true;},stopImmediatePropagation(){}});assert.ok(clickSuppressed);
  gesture(60,0,'mouse');assert.equal(swipe.revealed,null);
  gesture(-80,70);assert.equal(swipe.revealed,null);
  gesture(-80,0,'touch',true);assert.equal(swipe.revealed,null);
  swipe.state.storySelectionMode=true;gesture(-90);assert.equal(swipe.revealed,null);
  console.log('PASS touch/mouse swipe thresholds, vertical intent, cancellation, click suppression and bulk-selection guard');

  const glossary=sandbox();
  const matches=glossary.findGlossaryMatches('canto cantó canto',[
    {word:'canto',meaning:'note one',forms:['canto']},
    {word:'canto',meaning:'note two',forms:['canto']},
    {word:'cant',meaning:'short overlap',forms:['cant']},
    {word:'missing',meaning:'not present',forms:['absent']},
    {word:'empty',meaning:'empty form',forms:['']}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(matches.map(item=>[item.start,item.end,item.notes.length]))),[[0,5,2],[12,17,2]]);
  assert.equal(glossary.findGlossaryMatches('美しい', [{word:'美しい',meaning:'beautiful',forms:['美しい']}])[0].end,3);
  // A longer phrase must not hide a shorter listed form nested inside it.
  const nestedText='У Нади в руках билеты.';
  const nestedNotes=[{word:'у кого есть',meaning:'possession',forms:['У Нади в руках билеты']},{word:'в руках',meaning:'in hands',forms:['в руках']}];
  assert.deepEqual(JSON.parse(JSON.stringify(glossary.findGlossaryMatches(nestedText,nestedNotes).map(item=>item.form))),['У Нади в руках билеты']);
  assert.deepEqual(JSON.parse(JSON.stringify(glossary.firstGlossaryMatches(nestedText,nestedNotes,{nested:true}).map(item=>[item.form,!!item.inner]))),[['У Нади в руках билеты',false],['в руках',true]]);
  console.log('PASS exact glossary forms match repeated occurrences, group shared ranges and prefer longer overlaps');
  const furigana = sandbox();
  const normalize = (text, reading, strict = true) => JSON.parse(JSON.stringify(furigana.japaneseSegments(text, [{text, reading}], strict)));
  assert.deepEqual(normalize('日本の同僚と学食に行きます。', 'にほんのどうりょうとがくしょくにいきます。'), [
    {text:'日本',reading:'にほん'},{text:'の'},{text:'同僚',reading:'どうりょう'},{text:'と'},{text:'学食',reading:'がくしょく'},{text:'に'},{text:'行',reading:'い'},{text:'きます。'}
  ]);
  assert.deepEqual(normalize('食べ物', 'たべもの'), [{text:'食',reading:'た'},{text:'べ'},{text:'物',reading:'もの'}]);
  assert.deepEqual(normalize('ユキさんは学生です。', 'ゆきさんはがくせいです。'), [{text:'ユキさんは'},{text:'学生',reading:'がくせい'},{text:'です。'}]);
  assert.deepEqual(normalize('学生。', 'がくせい'), [{text:'学生',reading:'がくせい'},{text:'。'}]);
  assert.deepEqual(normalize('かな。', 'かな。'), [{text:'かな。'}]);
  for (const reading of ['', 'romaji', 'たべべもの']) assert.throws(() => normalize('食べ物', reading));
  const legacyAnnotations = [{text:'食べ物',reading:'たべべもの'}];
  assert.deepEqual(JSON.parse(JSON.stringify(furigana.japaneseSegments('食べ物', legacyAnnotations))), legacyAnnotations);
  assert.throws(() => furigana.japaneseSegments('日本', [{text:'日',reading:'にち'}], true));
  const originalAnnotations = [{text:'行きます',reading:'いきます'}];
  furigana.japaneseSegments('行きます', originalAnnotations);
  assert.deepEqual(originalAnnotations, [{text:'行きます',reading:'いきます'}]);
  console.log('PASS kanji-only alignment, sentence-wide legacy readings, katakana anchors, missing/ambiguous readings and immutable saved annotations');

  const first = glossary.firstGlossaryMatches('canto cantó canto', [
    {word:'cantar',meaning:'to sing',forms:['canto','cantó']},
    {word:' cantar ',meaning:'to   sing',forms:['canto']},
    {word:'canto',meaning:'song',forms:['canto']}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(first.map(item=>[item.start,item.notes.length]))),[[0,2]]);
  assert.equal(glossary.firstGlossaryMatches('a b',[
    {word:'café',meaning:'coffee',forms:['a']},
    {word:'cafe\u0301',meaning:'coffee',forms:['b']}
  ]).length,1);
  assert.equal(glossary.firstGlossaryMatches('a b',[
    {word:'A',meaning:'meaning',forms:['a']},
    {word:'a',meaning:'meaning',forms:['b']}
  ]).length,2);
  assert.deepEqual(Array.from(glossary.firstGlossaryMatches('美しい 美',[
    {word:'美',meaning:'beauty',forms:['美']},
    {word:'美しい',meaning:'beautiful',forms:['美しい']}
  ]),item=>item.form),['美しい','美']);
  const shared=glossary.firstGlossaryMatches('a b b',[
    {word:'same',meaning:'one',forms:['a','b']},
    {word:'same',meaning:'two',forms:['b']}
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(shared.map(item=>[item.start,item.notes.map(note=>note.meaning)]))),[[0,['one']],[2,['two']]]);
  console.log('PASS first eligible notes share normalized identities across forms; meanings/case stay distinct and overlaps resolve first');
  const annotated=sandbox(), annotatedRoot=annotated.document.createElement('div');let noteOpened=0,openedTrigger;
  annotated.annotatedText(annotatedRoot,'日本語',[{text:'日',reading:'にち'},{text:'本語',reading:'ほんご'}],{language:'ja-JP',glossary:[{word:'日本語',meaning:'Japanese language',forms:['日本語']}],onNote(event,trigger){noteOpened++;openedTrigger=trigger;}});
  assert.equal(annotatedRoot.lang,'ja-JP');assert.equal(annotatedRoot.childNodes.length,2);
  assert.equal(annotatedRoot.childNodes[0].tagName,'ruby');assert.equal(annotatedRoot.childNodes[1].tagName,'ruby');
  assert.equal(annotatedRoot.childNodes[0].childNodes[0].className,'gloss-note-trigger');
  assert.equal(annotatedRoot.childNodes[1].childNodes[0].className,'gloss-note-trigger');
  assert.equal(annotatedRoot.childNodes[0].childNodes[1].textContent,'にち');assert.equal(annotatedRoot.childNodes[1].childNodes[1].textContent,'ほんご');
  let keyPrevented=false;annotatedRoot.childNodes[0].childNodes[0].events.keydown({key:'Enter',preventDefault(){keyPrevented=true;}});
  assert.equal(noteOpened,1);assert.equal(keyPrevented,true);
  const primary=annotatedRoot.childNodes[0].childNodes[0], secondary=annotatedRoot.childNodes[1].childNodes[0];
  assert.equal(primary.attributes.role,'button');assert.equal(primary.tabIndex,0);
  assert.equal(secondary.attributes.role,undefined);assert.equal(secondary.tabIndex,undefined);
  assert.equal(secondary.events.keydown,undefined);
  secondary.events.click({});assert.equal(openedTrigger,primary);assert.equal(noteOpened,2);
  annotated.annotatedText(annotatedRoot,'日本語日本語',[
    {text:'日',reading:'にち'},{text:'本語',reading:'ほんご'},
    {text:'日',reading:'にち'},{text:'本語',reading:'ほんご'}
  ],{glossary:[{word:'日本語',meaning:'Japanese language',forms:['日本語']}]});
  assert.equal(annotatedRoot.childNodes.length,4);
  assert.deepEqual(Array.from(annotatedRoot.childNodes,node=>node.childNodes.at(-1).textContent),['にち','ほんご','にち','ほんご']);
  assert.equal(annotatedRoot.childNodes.slice(2).some(node=>node.childNodes.some(child=>child.className==='gloss-note-trigger')),false);
  const repeatedNotes=[{word:'Brot',meaning:'bread',forms:['Brot']}];
  for(const text of ['Brot Brot','Brot','Brot Brot Brot','Brot Brot']) {
    annotated.annotatedText(annotatedRoot,text,null,{glossary:repeatedNotes});
    assert.equal(annotatedRoot.childNodes.filter(node=>node.className==='gloss-note-trigger').length,1);
    assert.equal(annotatedRoot.textContent,text);
  }
  console.log('PASS repeated rendering/chapter versions reset first occurrences and leave canonical text intact');
  console.log('PASS cross-annotation glossary notes retain complete Japanese ruby readings and selectable source markup');

  const voices=[
    {id:'es-mx-net',language:'es-MX',requiresNetwork:true},
    {id:'es-cl-net',language:'es-CL',requiresNetwork:true},
    {id:'es-cl-offline',language:'es-CL',requiresNetwork:false},
    {id:'es-es-offline',language:'es-ES',requiresNetwork:false},
    {id:'de-offline',language:'de-DE',requiresNetwork:false}
  ];
  assert.equal(glossary.chooseSpanishVoice(voices).id,'es-cl-offline');
  const noChile=voices.filter(voice=>voice.language!=='es-CL');
  assert.equal(glossary.chooseSpanishVoice(noChile).id,'es-mx-net');
  assert.equal(glossary.chooseSpanishVoice([{id:'es-419',language:'es-419',requiresNetwork:true}]).id,'es-419');
  let speechOptions;
  const speechStub={voices:async()=>({voices}),speak:async options=>{speechOptions=options;return {status:'completed'};}};
  const prepared=await glossary.prepareSpeechOptions(speechStub,'Hola','es-CL');
  assert.equal(prepared.voice.language,'es-CL');assert.equal(prepared.options.voiceId,'es-cl-offline');assert.equal(prepared.options.language,'es-CL');
  await glossary.speakSelection(speechStub,'Hola','es-CL');assert.equal(speechOptions.voiceId,'es-cl-offline');
  const german=await glossary.prepareSpeechOptions(speechStub,'Guten Tag','de-DE');assert.equal(german.options.language,'de-DE');assert.equal(german.options.voiceId,undefined);
  console.log('PASS speech uses explicit source locale and prefers Chilean, then Latin American, then available Spanish voices');

  let heard;
  const revealed=[];const noteUi = sandbox({showExplanationForHelp:id=>revealed.push(id),state:{},readerStory:()=>({language:'ja'}),speech:{available:true,speak:async options=>{heard=options;}},window:{innerWidth:390,innerHeight:800},requestAnimationFrame:fn=>fn()});
  const popover=noteUi.$('word-note-popover');popover.hidden=true;popover.style={};popover.getBoundingClientRect=()=>({bottom:150});
  const trigger=noteUi.document.createElement('span');trigger.getAttribute=name=>trigger.attributes[name];trigger.getBoundingClientRect=()=>({left:20,top:80,bottom:100});
  vm.runInContext(section('function closeWordNote(', 'function readerPanel('), noteUi);
  noteUi.showWordNote(trigger,[{word:'買う',meaning:'to buy',forms:['買います']}]);
  const listen=popover.childNodes[0].childNodes[0].childNodes[1];
  assert.equal(listen.attributes['aria-label'],'Listen to 買う');assert.equal(popover.focused,true);
  await listen.events.click();assert.equal(heard.text,'買う');assert.equal(heard.language,'ja-JP');
  noteUi.closeWordNote(true);assert.equal(trigger.focused,true);assert.equal(popover.hidden,true);
  noteUi.closeWordNote();noteUi.showWordNote(trigger,[{word:'買う',meaning:'to buy'}],'買います');
  const surfaceItem=popover.childNodes[0];
  assert.equal(surfaceItem.childNodes[0].childNodes[0].textContent,'買います');
  assert.equal(surfaceItem.childNodes[1].textContent,'Dictionary form: 買う');
  await surfaceItem.childNodes[0].childNodes[1].events.click();assert.equal(heard.text,'買います');
  noteUi.closeWordNote();noteUi.speech.available=false;noteUi.showWordNote(trigger,[{word:'買う',meaning:'to buy'}]);
  assert.equal(popover.childNodes[0].childNodes[0].childNodes[1].disabled,true);
  noteUi.closeWordNote();noteUi.speech.available=true;noteUi.showWordNote(trigger,[{word:'買う',meaning:'to buy'}],'買います');
  assert.equal(popover.childNodes.some(node=>node.className==='word-note-view'),false,'a vocabulary-only note has no explanation action');
  noteUi.closeWordNote();noteUi.showWordNote(trigger,[{word:'買う',meaning:'to buy'}],'買います','h7');
  const view=popover.childNodes[popover.childNodes.length-1];
  assert.equal(view.className,'word-note-view');assert.equal(view.textContent,'View saved explanation ↓');assert.equal(view.type,'button');
  await view.events.click();assert.deepEqual(revealed,['h7'],'View reuses the saved-card reveal once');assert.equal(popover.hidden,true,'View closes the note');
  console.log('PASS note offers View saved explanation only for activated text with one, closing the note before revealing the card');
  console.log('PASS glossary Listen speaks the text form (dictionary form follows) with source locale, restores focus and disables browser playback');

  const chapterStatus=sandbox({state:{readerId:'A',activeChapterRequest:{storyId:'A',loading:{textContent:'Writing…'}}}});
  vm.runInContext(section('function renderChapterRequest(', 'function closeWordNote('),chapterStatus);
  chapterStatus.renderChapterRequest();assert.equal(chapterStatus.$('reader-chapter-status').hidden,false);
  chapterStatus.state.readerId='B';chapterStatus.renderChapterRequest();assert.equal(chapterStatus.$('reader-chapter-status').hidden,true);
  chapterStatus.state.readerId='A';chapterStatus.renderChapterRequest();assert.equal(chapterStatus.$('reader-chapter-status').hidden,false);
  chapterStatus.state.activeChapterRequest=null;chapterStatus.renderChapterRequest();assert.equal(chapterStatus.$('reader-chapter-status').hidden,true);
  console.log('PASS chapter status stays bound to its originating story and clears after completion');

  const selectionMode=sandbox({state:{explanationSelectionMode:true,selectedExplanationIds:new Set(['one','two'])},activeChapter(){return {};},activeVersion(){return {};},syncExplanationSelection(){this.synced=true;},renderSavedHelp(){this.rendered=true;}});
  selectionMode.clearExplanationSelection=()=>{selectionMode.state.explanationSelectionMode=false;selectionMode.state.selectedExplanationIds.clear();selectionMode.rendered=true;};
  vm.runInContext(section('function toggleExplanationSelection(', 'function removeSelectedExplanations('),selectionMode);
  selectionMode.toggleExplanationSelection('one');assert.equal(selectionMode.state.explanationSelectionMode,true);assert.equal(selectionMode.state.selectedExplanationIds.size,1);
  selectionMode.toggleExplanationSelection('two');assert.equal(selectionMode.state.explanationSelectionMode,false);assert.equal(selectionMode.state.selectedExplanationIds.size,0);assert.equal(selectionMode.rendered,true);
  console.log('PASS explanation selection exits immediately after the last item is deselected');

  const operationOrder=[];let generatedSaved=false,failGeneratedSave=true,failGeneratedAck=true;
  const saveGeneration=()=>glossary.saveBeforeAcknowledge({saved:generatedSaved,apply:()=>()=>{},persist(){operationOrder.push('save');if(failGeneratedSave)throw Error('disk');},onSaved(){generatedSaved=true;},acknowledge(){operationOrder.push('ack');if(failGeneratedAck)throw Error('ack');}});
  await assert.rejects(saveGeneration(),/disk/);assert.deepEqual(operationOrder,['save']);assert.equal(generatedSaved,false);
  failGeneratedSave=false;await assert.rejects(saveGeneration(),/ack/);assert.deepEqual(operationOrder,['save','save','ack']);assert.equal(generatedSaved,true);
  failGeneratedAck=false;await saveGeneration();assert.deepEqual(operationOrder,['save','save','ack','ack']);
  console.log('PASS generated story saves before acknowledgement, retains failed saves, and retries release without saving twice');

  let failsSave = true, failsAck = false, durable, applied = 0, acked = 0;
  const story={id:'A',value:0};
  const c=sandbox({state:{pendingReaderRequestId:'request',readerId:'A'},persistReaderStory:s=>{if(failsSave) throw Error('disk'); durable=JSON.parse(JSON.stringify(s));},ai:{acknowledge:async()=>{if(failsAck) throw Error('ack');acked++;}}});
  vm.runInContext(lifecycle,c);
  c.state.pendingReaderResult={story,saved:false,apply(){story.value++;applied++;return ()=>story.value--;}};
  await assert.rejects(c.savePendingReaderResult(),/disk/);
  assert.equal(story.value,0); assert.equal(acked,0);
  await assert.rejects(c.releaseSavedInference(),/Save the completed/);
  assert.equal(acked,0);
  failsSave=false;failsAck=true;
  await assert.rejects(c.savePendingReaderResult(),/ack/);
  assert.equal(story.value,1);assert.equal(durable.value,1);assert.equal(c.state.pendingReaderResult.saved,true);
  failsAck=false;await c.savePendingReaderResult();
  assert.equal(applied,2);assert.equal(story.value,1);assert.equal(acked,1);assert.equal(c.state.pendingReaderResult,null);
  console.log('PASS save failure retention, request blocking, acknowledgement failure, explicit retry');

  let finish,current,helpRequests=0;
  const original={id:'A',language:'ja',chapters:[{id:'CA',help:[],versions:[{id:'VA',story:'日本'}]}]};
  const other={id:'B',language:'de',chapters:[{id:'CB',help:[],versions:[{id:'VB'}]}]};current=original;
  const help=sandbox({state:{readerId:'A',readerSelection:{storyId:'A',text:'日本',start:0,end:2,chapterId:'CA',versionId:'VA',profile:{}},model:'mock',providerId:'mock'},readerStory:()=>current,normalizeChapters:s=>s.chapters,activeChapter:()=>current.chapters[0],activeVersion:()=>current.chapters[0].versions[0],readerPanel:()=>({scrollTop:150}),persistReaderStory(){},readerAi:()=>{helpRequests++;return new Promise(r=>finish=r);},decodeHelp:JSON.parse,renderSavedHelp(){},ai:{acknowledge:async()=>{}}});
  vm.runInContext(section('function helpContext(', 'function selectedPassage(')+section('function createHelpLoading(', 'function renderSavedHelp(')+lifecycle+section('async function explainSelection(',"$('selection-translate')"),help);
  const pending=help.explainSelection();await new Promise(r=>setImmediate(r));
  await help.explainSelection();assert.equal(helpRequests,1);
  assert.equal(help.state.activeHelpRequest.storyId,'A');assert.equal(help.state.activeHelpRequest.chapterId,'CA');assert.equal(help.state.activeHelpRequest.versionId,'VA');assert.equal(help.state.activeHelpRequest.action,'initial');
  current=other;help.state.readerId='B';help.state.model='changed-model';help.state.pendingReaderRequestId='r';
  finish(JSON.stringify({translation:'Japan',explanation:'Meaning'}));await pending;
  assert.equal(original.chapters[0].help.length,1);assert.equal(other.chapters[0].help.length,0);
  assert.equal(original.chapters[0].help[0].model,'mock');
  console.log('PASS overlapping help blocked; response remains anchored after switching stories and captures model provenance');

  for (const action of ['initial','detail']) {
    const entry={id:'H',passage:'Brot',start:0,end:4,versionId:'V',text:'Existing explanation',followUps:[]};
    const story={id:'S',language:'de',chapters:[{id:'C',help:action==='detail'?[entry]:[],versions:[{id:'V',story:'Brot'}]}]};
    let calls=0,fail=true,captured;
    const selected={storyId:'S',chapterId:'C',versionId:'V',text:'Brot',start:0,end:4,profile:{},helpId:action==='detail'?'H':undefined};
    const retryHelp=sandbox({state:{readerId:'S',readerSelection:selected,model:'mock',providerId:'mock'},readerStory:()=>story,normalizeChapters:s=>s.chapters,activeChapter:()=>story.chapters[0],activeVersion:()=>story.chapters[0].versions[0],readerPanel:()=>({scrollTop:0}),persistReaderStory(){},readerAi:async(kind,input)=>{calls++;captured=input;if(fail)throw Object.assign(Error('Service failed'),{code:'service'});return JSON.stringify({explanation:'Saved response'});},decodeHelp:JSON.parse,renderSavedHelp(){},ai:{acknowledge:async()=>{}}});
    vm.runInContext(section('function helpContext(', 'function selectedPassage(')+section('function createHelpLoading(', 'function renderSavedHelp(')+lifecycle+section('async function explainSelection(',"$('selection-translate')"),retryHelp);
    await retryHelp.explainSelection('explain',action,'Why this form?',selected);
    assert.equal(retryHelp.state.readerHelpBusy,false);assert.equal(calls,1);
    const recovery=retryHelp.$('reader-help').childNodes.find(node=>node.className==='recovery-panel help-request-recovery');assert.ok(recovery);
    const retry=recovery.childNodes.at(-1).childNodes[0];assert.equal(retry.textContent,'Retry');
    // Change current selection; explicit retry must use the captured source and question.
    retryHelp.state.readerSelection={...selected,text:'different'};fail=false;
    await retry.events.click();assert.equal(calls,2);assert.equal(captured.passage,'Brot');assert.equal(captured.followUp,'Why this form?');
    assert.equal(action==='detail'?entry.followUps.length:story.chapters[0].help.length,1);
    assert.equal(retryHelp.state.readerHelpBusy,false);
  }
  console.log('PASS explanation and more-detail error panels retry captured selection/question and save exactly once');

  const text=value=>({nodeType:3,nodeValue:value,childNodes:[]});
  const element=(tag,...children)=>({nodeType:1,childNodes:children,matches:name=>name===tag,closest:()=>null,contains:()=>true});
  const a=text('日'),reading=text('にち'),b=text('本。'),ruby=element('ruby',a,element('rt',reading));
  const root=element('div',ruby,b);let range;
  function texts(node,out=[]){if(node.nodeType===3)out.push(node);else for(const child of node.childNodes)if(!child.matches?.('rt'))texts(child,out);return out;}
  const selection=sandbox({Node:{TEXT_NODE:3,ELEMENT_NODE:1},NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1},window:{getSelection:()=>({isCollapsed:false,anchorNode:root,focusNode:root,getRangeAt:()=>range})},document:{createTreeWalker:()=>{const list=texts(root);let i=0;return {nextNode:()=>list[i++]||null};}}});
  range={startContainer:root,startOffset:0,endContainer:root,endOffset:2};
  assert.equal(selection.getCanonicalSelection(root).text,'日本。');
  range={startContainer:ruby,startOffset:0,endContainer:b,endOffset:1};
  assert.equal(selection.getCanonicalSelection(root).text,'日本');
  range={startContainer:a,startOffset:0,endContainer:b,endOffset:2};
  assert.equal(selection.getCanonicalSelection(root).text,'日本。');
  const rt=ruby.childNodes[1];reading.parentElement={closest:()=>rt};
  range={startContainer:reading,startOffset:1,endContainer:b,endOffset:1};
  assert.equal(selection.getCanonicalSelection(root).text,'本');
  const left=text('日'), leftReading=text('にち'), right=text('本'), rightReading=text('ほん');
  const leftRuby=element('ruby',left,element('rt',leftReading)), rightRuby=element('ruby',right,element('rt',rightReading));
  const noted=element('span',leftRuby,rightRuby), crossRoot=element('div',noted);let crossRange;
  const crossSelection=sandbox({Node:{TEXT_NODE:3,ELEMENT_NODE:1},NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1},window:{getSelection:()=>({isCollapsed:false,anchorNode:left,focusNode:right,getRangeAt:()=>crossRange})},document:{createTreeWalker:()=>{const list=texts(crossRoot);let i=0;return {nextNode:()=>list[i++]||null};}}});
  crossRange={startContainer:left,startOffset:0,endContainer:right,endOffset:1};
  assert.equal(crossSelection.getCanonicalSelection(crossRoot).text,'日本');
  console.log('PASS root, ruby, text-node and reading-boundary selections omit readings');

  const focused=sandbox();
  vm.runInContext(section('function helpContext(', 'function selectedPassage('), focused);
  for (const [language, sentence, fragment] of [
    ['ja', '空は青く、風はやさしいです。', 'く'],
    ['de', 'Wir gehen mit dem Kind.', 'dem'],
    ['ru', 'Я говорю с другом.', 'ом'],
    ['es-CL', 'Lo vi ayer.', 'Lo']
  ]) {
    const text = 'Earlier!\n' + sentence + ' Next.';
    const start = text.indexOf(fragment, 9);
    const context = focused.helpContext(text, start, start + fragment.length);
    assert.equal(context.sentence.slice(context.selectionStart, context.selectionEnd), fragment, language);
    assert.ok(context.sentence.includes(sentence));
    assert.ok(!context.sentence.includes('Earlier'));
  }
  assert.equal(focused.helpContext('First. Second.', 0, 6).sentence, 'First.');
  assert.equal(focused.helpContext('First. Second.', 7, 14).sentence, ' Second.');
  const repeated = '青く、遠く。';
  assert.equal(focused.helpContext(repeated, 4, 5).selectionStart, 4);
  const passage = {start:4,end:5};
  assert.equal(focused.resolvedHelpContext(repeated,passage,{contextStart:0,contextEnd:3,contextTranslation:'wrong'}).contextTranslation,'');
  assert.equal(focused.resolvedHelpContext(repeated,passage,{contextStart:0,contextEnd:6,contextTranslation:'right'}).contextTranslation,'right');
  assert.equal(focused.validTextRange('😀く',1,2),false);
  assert.equal(focused.validTextRange('😀く',2,3),true);
  console.log('PASS focused context offsets across four languages, repeated fragments and context fallback');

  for (const code of ['ja','de','ru','es-CL']) {
    const entry = {id:'H',passage:'く',start:3,end:4,text:'Original explanation',more:'Legacy detail'};
    const version = {id:'V',story:'空は青く、遠く。'};
    const chapter = {id:'C',help:[entry],versions:[version]};
    const story = {id:'S',language:code,chapters:[chapter]};
    let request, instructions, saved = false;
    const f = sandbox({state:{readerId:'S',providerId:'mock',model:'model'},readerStory:()=>story,normalizeChapters:s=>s.chapters,activeChapter:()=>chapter,activeVersion:()=>version,readerPanel:()=>({scrollTop:0}),persistReaderStory(){saved=true;},readerAi:async(kind,input,prompt)=>{request=input;instructions=prompt;f.state.pendingReaderRequestId='r';saved=false;return 'The ending adds a boundary.\n\n「でも」 marks a contrast.';},decodeHelp:text=>({explanation:text}),renderSavedHelp(){},ai:{acknowledge:async()=>{assert.equal(saved,true);}}});
    vm.runInContext(section('function helpContext(', 'function selectedPassage(')+section('function createHelpLoading(', 'function renderSavedHelp(')+lifecycle+section('async function explainSelection(', "$('selection-translate')"),f);
    const selected = {storyId:'S',chapterId:'C',versionId:'V',helpId:'H',text:'く',start:3,end:4,profile:{}};
    await f.explainSelection('explain','detail','explain prefixes',selected);
    assert.equal(request.followUp,'explain prefixes');
    assert.equal(request.sentence.slice(request.selectionStart,request.selectionEnd),'く');
    assert.ok(request.previousExplanation.includes('Legacy detail'));
    assert.ok(instructions.includes('never recap the profile'));
    assert.equal(entry.followUps.length,2);
    assert.equal(entry.followUps[1].followUp,'explain prefixes');
    assert.equal(entry.followUps[1].text,'The ending adds a boundary.\n\n「でも」 marks a contrast.');
    assert.equal(entry.followUps[1].promptVersion,'test');
    await f.explainSelection('explain','detail','',selected);
    assert.equal(entry.followUps.length,3);
    assert.ok(request.previousExplanation.includes('The ending adds a boundary.'));
  }
  console.log('PASS all languages share focused instructions; steered and blank follow-ups preserve legacy history and save before acknowledgement');

  const contract=sandbox();
  vm.runInContext(section('function helpContext(', 'function selectedPassage(')+section('function decodeHelp(', 'async function explainSelection('), contract);
  const promptContract=sandbox();
  vm.runInContext(section('function savedFollowUps(', 'function selectedPassage('),promptContract);
  const detailPrompt=promptContract.helpInstructions('detail');
  assert.ok(detailPrompt.includes('Return only the explanation text'));
  assert.ok(detailPrompt.includes('or JSON'));
  assert.ok(detailPrompt.includes('**bold**'));
  assert.ok(detailPrompt.includes('Preserve Japanese in Japanese script without romaji'));
  assert.ok(promptContract.helpInstructions('initial').includes('Return only one JSON object'));
  assert.ok(promptContract.helpInstructions('examples').includes('Return only one JSON object'));
  const loadingContract=sandbox();
  vm.runInContext(section('function createHelpLoading(', 'function renderSavedHelp('),loadingContract);
  const detailLoading=loadingContract.createHelpLoading('detail','explain prefixes');
  assert.equal(detailLoading.attributes.role,'status');assert.equal(detailLoading.attributes['aria-live'],'polite');
  assert.ok(detailLoading.textContent.includes('Adding more detail…'));assert.ok(detailLoading.textContent.includes('Answering: explain prefixes'));
  assert.ok(htmlSource.includes('Saved on this device automatically.'));
  assert.ok(htmlSource.includes('<h3 id="reader-help-title">Explanations</h3>'));
  assert.ok(cssSource.includes('.help-examples { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line);'));
  console.log('PASS settings feedback, single Explanations heading, accessible loading, and in-card example divider');
  const examples = [0,1,2].map(()=>({sentence:'山は高く、道はせまいです。',translation:'The mountain is tall, and the road is narrow.',highlightStart:3,highlightEnd:4,segments:[{text:'山',reading:'やま'},{text:'は'},{text:'高',reading:'たか'},{text:'く、'},{text:'道',reading:'みち'},{text:'はせまいです。'}]}));
  assert.equal(contract.decodeHelp(JSON.stringify({examples}), 'examples').examples.length,3);
  for (const invalid of [{examples:examples.slice(1)}, {examples:[...examples.slice(0,2),{...examples[2],highlightEnd:999}]}, {examples:[...examples.slice(0,2),{...examples[2],translation:42}]}, {examples:[...examples.slice(0,2),{...examples[2],segments:[{text:'wrong'}]}]}]) {
    assert.throws(()=>contract.decodeHelp(JSON.stringify(invalid),'examples'),/invalid/);
  }
  assert.throws(()=>contract.decodeHelp('null'),/invalid/);
  assert.throws(()=>contract.decodeHelp('{"explanation":""}'),/invalid/);
  assert.equal(contract.decodeHelp('{"explanation":"Focused."}').explanation,'Focused.');
  assert.equal(contract.decodeHelp('```json\n{"explanation":"Prefixes mark word beginnings."}\n```','detail').explanation,'Prefixes mark word beginnings.');
  const plainDetail='「でも」は対比を表します。\\path\n\nIt changes the relationship between the clauses.';
  assert.equal(contract.decodeHelp(plainDetail,'detail').explanation,plainDetail);
  assert.equal(contract.decodeHelp('  A general explanation.  ','detail').explanation,'A general explanation.');
  assert.equal(contract.decodeHelp('“Hinaufkle...”','detail').explanation,'“Hinaufkle...”');
  assert.throws(()=>contract.decodeHelp('   ','detail'),/invalid/);
  console.log('PASS explanation/example contracts reject malformed counts, ranges, translations and annotations');

  const rendered=sandbox({normalizeReaderControls(){},createReaderActivation:()=>()=>{},glossaryForTrigger:()=>null,state:{furigana:true,explanationSelectionMode:false,selectedExplanationIds:new Set()},readerStory:()=>({id:'S'}),profileSnapshot:()=>({})});
  vm.runInContext(section('function helpContext(', 'function selectedPassage(')+section('function wireLongPress(', 'function renderLibrary(')+section('function renderHighlightedText(', 'async function readerAi('),rendered);
  const formatted=rendered.document.createElement('div');
  rendered.renderDetailText(formatted, 'In “al salir,” **al** contracts **a + el**.\n\nUse **bold with *italic* inside** and `a él`. <img src=x> Unmatched **marker');
  const flatten = node => [node,...(node.childNodes || []).flatMap(flatten)];
  assert.equal(formatted.childNodes.length,2);
  assert.equal(flatten(formatted).filter(n=>n.tagName==='strong').length,3);
  assert.ok(flatten(formatted).some(n=>n.tagName==='em' && n.textContent==='italic'));
  assert.ok(flatten(formatted).some(n=>n.tagName==='code' && n.textContent==='a él'));
  assert.equal(flatten(formatted).some(n=>n.tagName==='img'),false);
  assert.ok(formatted.textContent.includes('Unmatched **marker'));
  const selectionCards=[{dataset:{helpId:'one'}},{dataset:{helpId:'two'}}];
  const bulkSelection=sandbox({state:{selectedExplanationIds:new Set(['one'])},$:()=>({querySelectorAll:()=>selectionCards})});
  vm.runInContext(section('function toggleAllExplanations(', 'function syncExplanationSelection('),bulkSelection);
  let synced=0,cleared=0;bulkSelection.syncExplanationSelection=()=>synced++;
  bulkSelection.clearExplanationSelection=()=>{cleared++;bulkSelection.state.selectedExplanationIds.clear();};
  bulkSelection.toggleAllExplanations();assert.equal(bulkSelection.state.selectedExplanationIds.size,2);assert.equal(synced,1);
  bulkSelection.toggleAllExplanations();assert.equal(cleared,1);assert.equal(bulkSelection.state.selectedExplanationIds.size,0);
  const allBox={setAttribute(name,value){this[name]=value;}}, countBox={}, deleteBox={};
  const toolbarBox={querySelector:selector=>selector==='.select-all-explanations'?allBox:selector==='.selection-count'?countBox:deleteBox};
  const selectionBox={classList:{toggle(){}},querySelector:()=>toolbarBox,querySelectorAll:()=>selectionCards};
  selectionCards.forEach(card=>{card.classList={toggle(){}};card.querySelector=()=>null;});
  const mixed=sandbox({state:{explanationSelectionMode:true,selectedExplanationIds:new Set(['one'])},$:()=>selectionBox,pendingDeletionBlocked:()=>false});
  vm.runInContext(section('function syncExplanationSelection(', 'function clearExplanationSelection('),mixed);
  mixed.syncExplanationSelection();assert.equal(allBox.indeterminate,true);assert.equal(allBox.checked,false);
  mixed.state.selectedExplanationIds.add('two');mixed.syncExplanationSelection();assert.equal(allBox.indeterminate,false);assert.equal(allBox.checked,true);
  console.log('PASS safe detail formatting and mixed select-all then clear behavior');
  const sample = {id:'H',kind:'explain',passage:'く',start:3,end:4,contextStart:0,contextEnd:15,text:'Focused.',versionId:'V',profile:{},followUps:[{action:'examples',examples}]};
  const v={id:'V',story:'空は青く、風はやさしいです。',storySegments:[{text:'空',reading:'そら'},{text:'は'},{text:'青',reading:'あお'},{text:'く、'},{text:'風',reading:'かぜ'},{text:'はやさしいです。'}]};
  sample.contextEnd=v.story.length;
  rendered.renderSavedHelp({id:'C',help:[sample]},v);
  const card=rendered.$('reader-help').childNodes[0];
  const descendants = node => [node,...(node.childNodes || []).flatMap(descendants)];
  const nodes=descendants(card);
  assert.equal(nodes.some(node=>node.tagName==='strong' && node.textContent==='Explanation'),false);
  assert.equal(nodes.find(node=>node.tagName==='mark').textContent,'く');
  assert.equal(nodes.filter(node=>node.tagName==='li').length,3);
  assert.ok(nodes.some(node=>node.tagName==='rt' && node.textContent==='そら'));
  const calls=[];rendered.explainSelection=async(...args)=>calls.push(args);
  const detail=nodes.find(node=>node.tagName==='button' && node.textContent==='More detail');
  const form=nodes.find(node=>node.tagName==='form');
  await detail.events.click();assert.equal(form.hidden,false);assert.equal(calls.length,0);
  const cancel=nodes.find(node=>node.tagName==='button' && node.textContent==='Cancel');
  cancel.events.click();assert.equal(form.hidden,true);assert.equal(calls.length,0);
  const generate=nodes.find(node=>node.tagName==='button' && node.textContent==='Generate examples');
  await generate.events.click();assert.equal(calls[0][1],'examples');assert.equal(calls[0][3].helpId,'H');
  const input=nodes.find(node=>node.tagName==='input');input.value='Why this ending?';
  await form.events.submit({preventDefault(){}});assert.equal(calls[1][1],'detail');assert.equal(calls[1][2],'Why this ending?');
  const escaped=rendered.document.createElement('p');
  rendered.renderHighlightedText(escaped,'<img src=x>く',null,11,12);
  assert.equal(descendants(escaped).filter(node=>node.tagName==='img').length,0);
  assert.equal(escaped.textContent,'<img src=x>く');
  const legacyCard={...sample,id:'legacy',contextStart:undefined,contextEnd:undefined,followUps:undefined,more:'Old detail'};
  rendered.renderSavedHelp({id:'C',help:[legacyCard]},v);
  assert.ok(rendered.$('reader-help').textContent.includes('Old detail'));
  console.log('PASS canonical highlighted context, separate readings, safe text, examples and both UI actions; legacy cards remain readable');

  const newer={...sample,id:'newer',text:'Newest',createdAt:'2026-10-11T12:00:00Z'},older={...sample,id:'older',text:'Oldest',createdAt:'2026-10-10T12:00:00Z'};
  rendered.renderSavedHelp({id:'C',help:[older,newer]},v);
  assert.deepEqual(Array.from(rendered.$('reader-help').childNodes,node=>node.dataset.helpId),['newer','older']);
  console.log('PASS saved explanations render newest first without changing their stored order');

  const removal=sandbox({state:{stories:[{id:'a'},{id:'b'}],selectedStoryIds:new Set(['a']),storySelectionMode:true},persistStories(){if(removal.fail)throw Error('disk');},updateCount(){},renderLibrary(){},syncStorySelection(){},window:{scrollY:0,scrollTo(){}},toast(){},fail:false});
  vm.runInContext(section('function pendingDeletionBlocked(', 'function wireLongPress('),removal);
  assert.equal(removal.removeSelectedStories(new Set(['a'])),true);assert.deepEqual(removal.state.stories.map(x=>x.id),['b']);assert.equal(removal.state.storySelectionMode,false);
  removal.state.stories=[{id:'a'},{id:'b'}];removal.state.selectedStoryIds=new Set(['a']);removal.state.storySelectionMode=true;removal.fail=true;
  assert.equal(removal.removeSelectedStories(new Set(['a'])),false);assert.deepEqual(removal.state.stories.map(x=>x.id),['a','b']);assert.deepEqual(Array.from(removal.state.selectedStoryIds),['a']);
  removal.fail=false;removal.state.pendingReaderResult={};
  assert.equal(removal.removeSelectedStories(new Set(['a'])),false);assert.equal(removal.state.stories.length,2);
  removal.state.pendingReaderResult=null;
  removal.$('delete-stories-dialog').showModal=()=>{removal.dialogOpened=true;};
  removal.confirmStoryDeletion(new Set(['a']),{title:'<b>Title</b>'});
  assert.ok(removal.dialogOpened);assert.ok(removal.$('delete-stories-message').textContent.includes('<b>Title</b>'));assert.ok(removal.$('cancel-delete-stories').focused);
  assert.deepEqual(Array.from(removal.state.deleteStoryIds),['a']);
  console.log('PASS confirmed story removal, save rollback, pending-AI guard and named confirmation with Cancel focused');

  const expRemoval=sandbox({state:{selectedExplanationIds:new Set(['v1a','v1b']),explanationSelectionMode:true},pendingDeletionBlocked:()=>false,readerStory:()=>null,persistReaderStory(){if(expRemoval.fail)throw Error('disk');},renderSavedHelp(){},toast(){},fail:false});
  vm.runInContext(section('function syncExplanationSelection(', 'function renderSavedHelp('),expRemoval);
  const helpRows=[{id:'v1a',versionId:'v1'},{id:'v2',versionId:'v2'},{id:'v1b',versionId:'v1',followUps:[{text:'attached'}]}],ch={help:helpRows},storyHelp={};
  assert.equal(expRemoval.removeSelectedExplanations(storyHelp,ch,{id:'v1'},new Set(['v1a','v1b'])),true);assert.deepEqual(ch.help.map(x=>x.id),['v2']);
  ch.help=helpRows;expRemoval.state.explanationSelectionMode=true;expRemoval.state.selectedExplanationIds=new Set(['v1a']);expRemoval.fail=true;
  assert.equal(expRemoval.removeSelectedExplanations(storyHelp,ch,{id:'v1'},new Set(['v1a'])),false);assert.equal(ch.help,helpRows);assert.deepEqual(Array.from(expRemoval.state.selectedExplanationIds),['v1a']);
  console.log('PASS explanation removal is version-scoped, includes attached follow-ups, and rolls back on save failure');

  // Durable examples/save/release regressions now exercise the production
  // generation pipeline in learning-safeguards.mjs.

  const normalized=sandbox();bindStory(normalized);
  const legacy={id:'legacy',title:'Title',story:'Text',providerId:'provider',promptVersion:'original'};
  const chapters=normalized.normalizeChapters(legacy);
  assert.equal(chapters[0].versions[0].story,'Text');assert.equal(chapters[0].versions[0].promptVersion,'original');assert.equal(legacy.chapters,undefined);
  console.log('PASS additive legacy interpretation preserves provenance');

  let submit;
  const chapter=(id)=>({id,activeVersionId:id+'v',versions:[{id:id+'v',title:id,story:'Text '+id}],help:[]});
  const story3={id:'S',language:'ja',chapters:[chapter('one'),chapter('two'),chapter('three')]};
  let requested, generationInstructions;
  story3.topic = 'A mountain mystery'; story3.practice = 'Hiking vocabulary'; story3.difficulty = 'beginner'; story3.language = 'de';
  const gen=sandbox({state:{readerId:'S',readerChapter:0,model:'mock',providerId:'mock'},readerStory:()=>story3,normalizeChapters:s=>s.chapters,activeVersion:c=>c.versions.find(v=>v.id===c.activeVersionId),activeChapter:()=>story3.chapters[gen.state.readerChapter],profileSnapshot:()=>({}),persistReaderStory(){},decodeResponse:JSON.parse,readerAi:async(kind,input,instructions,loading)=>{if(kind==='summary'){gen.state.pendingReaderRequestId='r';return JSON.stringify({...input.previousMemory,plot:[...input.previousMemory.plot,input.chapterChunk]});} requested=input;generationInstructions=instructions;assert.ok(loading.textContent.includes(kind === 'continue' ? 'Writing the next chapter' : 'Rewriting this chapter'));gen.state.pendingReaderRequestId='r';return JSON.stringify({title:'four',story:'Text four',glossary:[{word:'four',meaning:'four',forms:['four']}]});},readerPanel:()=>({scrollTop:0}),updateReader(){},window:{addEventListener(){}},document:{documentElement:{style:{}},querySelectorAll:()=>[]},ai:{acknowledge:async()=>{}}});
  gen.state.languageExpectations={};gen.levelDefinition=()=>({id:'A1'});gen.guideFor=()=> 'Simple';gen.readingDescription=()=> 'Simple reading';gen.LEVELS={de:{framework:'CEFR'}};gen.SCOPES={scene:{description:'One event'}};gen.setScopeDisabled=()=>{};gen.$('reader-level').value='A1';gen.$('reader-scope').value='scene';
  gen.runContentOperation=async spec=>{
    const result=JSON.parse(await gen.readerAi(spec.kind,spec.input,spec.instructions,gen.state.activeChapterRequest.loading));
    const op={...spec,result,id:'generated-'+Date.now()+Math.random(),promptVersion:'test',createdAt:'test'};
    gen.applyContentOperation(op); return op;
  };
  gen.showOperationResult=()=>{};
  gen.structuredClone=structuredClone;
  bindGeneration(gen);
  gen.state.stories=[story3];
  gen.document.createElement = sandbox().document.createElement;
  gen.$('reader-edit-submit').addEventListener=(_,fn)=>submit=fn;
  gen.$('reader-prompt').value='Next';gen.$('reader-edit-panel').dataset.mode='continue';
  bindStory(gen);
  vm.runInContext(section('function storyInstructions(', 'function storyInput(')+section('function createHelpLoading(', 'function renderSavedHelp(')+lifecycle+section("$('reader-edit-submit').addEventListener", "$('reader-dialog').addEventListener"),gen);
  await submit();
  assert.ok(requested.storyMemory.plot.includes('Text three'));assert.equal(requested.recentProse,'Text three');assert.equal(requested.priorActiveChapters,undefined);assert.equal(requested.precedingChapters,undefined);
  assert.equal(story3.chapters.length,4);assert.equal(story3.chapters[3].basedOnVersionId,'threev');assert.equal(story3.chapters[1].versions.length,1);
  assert.equal(requested.topic, 'A mountain mystery'); assert.equal(requested.practice, 'Hiking vocabulary');
  assert.ok(generationInstructions.includes('requests contextual vocabulary notes'));
  assert.ok(generationInstructions.includes('Do not wrap up the chapter or story unless'));
  assert.equal(story3.chapters[3].versions[0].glossary[0].word, 'four');
  assert.equal(gen.state.readerEditBusy, false); assert.equal(gen.state.activeChapterRequest, null);
  console.log('PASS continuation uses saved memory and recent prose, original topics, shared ending/glossary guidance and fresh notes');

  gen.state.readerChapter=0;gen.$('reader-prompt').value='   ';
  await submit();assert.equal(story3.chapters.length,5);assert.equal(requested.prompt,'');
  assert.ok(generationInstructions.includes('If prompt is empty, continue naturally'));
  assert.equal(story3.chapters[4].versions[0].prompt,'');
  gen.$('reader-prompt').value='Next';
  const later=JSON.stringify(story3.chapters.slice(1));
  gen.state.readerChapter=0;gen.$('reader-edit-panel').dataset.mode='rewrite';
  await submit();assert.equal(story3.chapters[0].versions.length,2);
  assert.equal(story3.chapters[0].versions[1].sourceVersionId,'onev');
  assert.equal(JSON.stringify(story3.chapters.slice(1)),later);
  assert.equal(story3.chapters[0].versions[1].glossary[0].word,'four');
  assert.equal(requested.practice,'Hiking vocabulary');
  assert.equal(gen.selectedPath(story3).entries.length,1);assert.equal(requested.storyMemory.plot.length,0);assert.equal(requested.currentChapter.story,'Text one');assert.equal(story3.paths[0].entries.length,5);
  console.log('PASS chapter-only rewrite preserves original and all later chapters');
  gen.$('reader-prompt').value='';await submit();assert.equal(requested.prompt,'');
  assert.equal(story3.chapters[0].versions.length,3);
  assert.ok(generationInstructions.includes('preserves the chapter’s main events'));
  story3.activePathId='original';gen.state.readerChapter=1;
  const untouchedOriginal=JSON.stringify(story3.paths[0].entries);
  await submit();
  assert.equal(requested.storyMemory.plot.length,1);
  assert.equal(requested.storyMemory.plot[0],'Text one');
  assert.equal(requested.recentProse,'Text one');
  assert.equal(requested.currentChapter.story,'Text two');
  assert.equal(gen.selectedPath(story3).entries.length,2);
  assert.equal(JSON.stringify(story3.paths[0].entries),untouchedOriginal);
  gen.state.readerChapter=0;gen.$('reader-edit-panel').dataset.mode='continue';
  await submit();assert.equal(gen.selectedPath(story3).entries.length,3);
  assert.equal(requested.recentProse,'Text four');
  assert.equal(JSON.stringify(story3.paths[0].entries),untouchedOriginal);
  console.log('PASS middle rewrite excludes its old events; continuation from earlier reading appends only to selected path');
  gen.state.readerChapter=0;gen.$('reader-edit-panel').dataset.mode='rewrite';
  gen.$('reader-prompt').value='Next';
  console.log('PASS blank and whitespace continuation/rewrite prompts generate with explicit defaults and preserve empty provenance');
  gen.readerAi=async()=>{throw Error('provider failed');};
  await submit();assert.equal(gen.$('reader-prompt').value,'Next');
  assert.equal(gen.state.readerEditBusy,false);assert.equal(gen.state.activeChapterRequest,null);
  assert.equal(gen.state.readerEditDraft.chapterId,story3.chapters[0].id);
  assert.ok(gen.$('reader-edit-error').textContent.includes('Submit again to retry'));
  console.log('PASS failed chapter request clears loading and retains an anchored prompt for explicit retry');

  let cancelAction, rejectWait, cancelCalls=0;
  const cancelContext=sandbox({state:{models:[{id:'mock'}],model:'mock'},ai:{available:true,providers:async()=>({providers:[{id:'openrouter',connected:true}]}),start:async args=>{assert.equal(args.providerId,'openrouter');assert.deepEqual({title:args.title,body:args.body},{title:'Explaining your selection',body:'Safe to switch apps. LingoMage keeps going.'});return 'cancel-id';},wait:()=>new Promise((_,reject)=>rejectWait=reject),cancel:async()=>{cancelCalls++;rejectWait(Error('cancelled'));},acknowledge:async()=>{}},document:{createElement:()=>({addEventListener:(_,fn)=>cancelAction=fn,remove(){}})}});
  vm.runInContext(lifecycle + section('async function readerAi(', 'async function acknowledgeReaderResult('),cancelContext);
  const cancellation=cancelContext.readerAi('explain',{},'test');
  await new Promise(resolve=>setImmediate(resolve));await cancelAction();
  await assert.rejects(cancellation,/Request cancelled/);assert.equal(cancelCalls,1);assert.equal(cancelContext.state.pendingReaderRequestId,null);assert.equal(cancelContext.state.requestId,null);
  console.log('PASS cancelled request does not stage a completed result');
  for (const code of ['not_found','service']) {
    let starts=0,releaseFails=true;
    const releaseContext=sandbox({state:{models:[{id:'mock'}],model:'mock'},ai:{available:true,providers:async()=>({providers:[{id:'mock',connected:true}]}),start:async()=>{starts++;return 'failed-id';},wait:async()=>{throw Object.assign(Error('Service failed'),{code:'service'});},acknowledge:async()=>{if(releaseFails)throw Object.assign(Error('Release failed'),{code});}}});
    vm.runInContext(lifecycle+section('async function readerAi(', 'async function acknowledgeReaderResult('),releaseContext);
    await assert.rejects(releaseContext.readerAi('explain',{},'fixture'),/Service failed/);
    assert.equal(releaseContext.state.requestId,null);
    assert.equal(releaseContext.state.pendingReaderRequestId,code==='not_found'?null:'failed-id');
    releaseFails=false;await releaseContext.releaseInvalidReaderResponse();assert.equal(releaseContext.state.pendingReaderRequestId,null);assert.equal(starts,1);
  }
  console.log('PASS failed reader release remains recoverable; already-released host requests clear without new inference');


  const panel={scrollTop:321,addEventListener(){}};
  const pos=sandbox({selectionMenuRouter:{reset(){}},state:{readerId:'S',readerChapter:2,readerPositions:{}},readerStory:()=>story3,activeChapter:()=>story3.chapters[pos.state.readerChapter],normalizeChapters:s=>s.chapters,closeStoryReveal(){},updateReader(){},clearExplanationSelection(){},window:{addEventListener(){}},history:{pushState(){}}});
  pos.$('reader-dialog').querySelector=()=>panel;pos.$('reader-dialog').showModal=()=>{};
  bindStory(pos);
  vm.runInContext(section('function readerPanel(', 'function sentenceContext('),pos);story3.activePathId='original';
  pos.rememberReaderPosition();panel.scrollTop=0;pos.openReader(story3);
  assert.equal(pos.state.readerChapter,2);assert.equal(panel.scrollTop,321);
  console.log('PASS actual scroll panel and chapter restored on reopen');
  pos.state.readerEditDraft={storyId:'S',chapterId:story3.chapters[0].id,mode:'rewrite',prompt:'Keep a clue',error:'Provider failed'};
  let restoredMode;pos.showEditPanel=mode=>{restoredMode=mode;};pos.openReader(story3);
  assert.equal(pos.state.readerChapter,0);assert.equal(restoredMode,'rewrite');
  assert.equal(pos.$('reader-prompt').value,'Keep a clue');assert.equal(pos.$('reader-edit-error').textContent,'Provider failed');
  console.log('PASS reopening a failed chapter request restores its original chapter and prompt');
  // A legacy story with an empty chapters array gets real chapters, so synthesized paths resolve and later saves validate.
  const {validStories}=await import('../js/workspace-storage.js');
  const emptyChapters={id:'E',language:'de',title:'T',story:'Text.',chapters:[]};
  pos.state.readerPositions={};pos.openReader(emptyChapters);
  assert.equal(emptyChapters.chapters.length,1);assert.equal(emptyChapters.paths[0].entries[0].chapterId,emptyChapters.chapters[0].id);assert.ok(validStories([emptyChapters]));
  console.log('PASS legacy story with an empty chapters array opens with saved chapters matching its paths');
})().catch(error=>{console.error(error);process.exitCode=1;});

})().catch(error=>{console.error(error);process.exitCode=1;});
