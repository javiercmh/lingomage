// Dependency-free regression harness; exercises production functions with isolated DOM/AI stubs.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function sandbox(extra = {}) {
  const elements = new Map();
  const element = (tag = 'div') => ({tagName:tag,hidden:false,dataset:{},childNodes:[],events:{},attributes:{},
    get textContent(){return this.childNodes.map(node=>node.textContent).join('');},set textContent(value){this.childNodes=value ? [{tagName:'#text',textContent:String(value)}] : [];},
    append(...nodes){this.childNodes.push(...nodes);},addEventListener(name,fn){this.events[name]=fn;},setAttribute(name,value){this.attributes[name]=value;},focus(){this.focused=true;},remove(){},classList:{add(){},remove(){},toggle(){}}});
  const c = {state:{},console,crypto:{randomUUID:()=> 'help-test'},PROMPT_VERSION:'test',LANGUAGES:{ja:'Japanese',de:'German',ru:'Russian','es-CL':'Spanish'},$:id=>{if(!elements.has(id)) elements.set(id,element()); return elements.get(id);},document:{createElement:element,createTextNode:value=>({tagName:'#text',textContent:value}),querySelectorAll:()=>[]},toast(){},...extra};
  vm.createContext(c); return c;
}
const lifecycle = section('async function acknowledgeReaderResult(', 'function decodeHelp(');
(async () => {
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
  vm.runInContext(section('function helpContext(', 'function selectedPassage(')+lifecycle+section('async function explainSelection(',"$('selection-explain')"),help);
  const pending=help.explainSelection();await new Promise(r=>setImmediate(r));
  await help.explainSelection();assert.equal(helpRequests,1);
  current=other;help.state.readerId='B';help.state.model='changed-model';help.state.pendingReaderRequestId='r';
  finish(JSON.stringify({translation:'Japan',explanation:'Meaning'}));await pending;
  assert.equal(original.chapters[0].help.length,1);assert.equal(other.chapters[0].help.length,0);
  assert.equal(original.chapters[0].help[0].model,'mock');
  console.log('PASS overlapping help blocked; response remains anchored after switching stories and captures model provenance');

  const text=value=>({nodeType:3,nodeValue:value,childNodes:[]});
  const element=(tag,...children)=>({nodeType:1,childNodes:children,matches:name=>name===tag,closest:()=>null,contains:()=>true});
  const a=text('日'),reading=text('にち'),b=text('本。'),ruby=element('ruby',a,element('rt',reading));
  const root=element('div',ruby,b);let range;
  function texts(node,out=[]){if(node.nodeType===3)out.push(node);else for(const child of node.childNodes)if(!child.matches?.('rt'))texts(child,out);return out;}
  const selection=sandbox({Node:{TEXT_NODE:3,ELEMENT_NODE:1},NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1},window:{getSelection:()=>({isCollapsed:false,anchorNode:root,focusNode:root,getRangeAt:()=>range})},document:{createTreeWalker:()=>{const list=texts(root);let i=0;return {nextNode:()=>list[i++]||null};}}});
  vm.runInContext(section('function getCanonicalSelection(', 'function sentenceContext('),selection);
  range={startContainer:root,startOffset:0,endContainer:root,endOffset:2};
  assert.equal(selection.getCanonicalSelection(root).text,'日本。');
  range={startContainer:ruby,startOffset:0,endContainer:b,endOffset:1};
  assert.equal(selection.getCanonicalSelection(root).text,'日本');
  range={startContainer:a,startOffset:0,endContainer:b,endOffset:2};
  assert.equal(selection.getCanonicalSelection(root).text,'日本。');
  const rt=ruby.childNodes[1];reading.parentElement={closest:()=>rt};
  range={startContainer:reading,startOffset:1,endContainer:b,endOffset:1};
  assert.equal(selection.getCanonicalSelection(root).text,'本');
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
    const f = sandbox({state:{readerId:'S',providerId:'mock',model:'model'},readerStory:()=>story,normalizeChapters:s=>s.chapters,activeChapter:()=>chapter,activeVersion:()=>version,readerPanel:()=>({scrollTop:0}),persistReaderStory(){saved=true;},readerAi:async(kind,input,prompt)=>{request=input;instructions=prompt;f.state.pendingReaderRequestId='r';saved=false;return JSON.stringify({translation:'',explanation:'Focused detail'});},decodeHelp:JSON.parse,renderSavedHelp(){},ai:{acknowledge:async()=>{assert.equal(saved,true);}}});
    vm.runInContext(section('function helpContext(', 'function selectedPassage(')+lifecycle+section('async function explainSelection(', "$('selection-explain')"),f);
    const selected = {storyId:'S',chapterId:'C',versionId:'V',helpId:'H',text:'く',start:3,end:4,profile:{}};
    await f.explainSelection('explain','detail','Why this ending?',selected);
    assert.equal(request.followUp,'Why this ending?');
    assert.equal(request.sentence.slice(request.selectionStart,request.selectionEnd),'く');
    assert.ok(request.previousExplanation.includes('Legacy detail'));
    assert.ok(instructions.includes('never recap the profile'));
    assert.equal(entry.followUps.length,2);
    assert.equal(entry.followUps[1].followUp,'Why this ending?');
    assert.equal(entry.followUps[1].promptVersion,'test');
    await f.explainSelection('explain','detail','',selected);
    assert.equal(entry.followUps.length,3);
    assert.ok(request.previousExplanation.includes('Focused detail'));
  }
  console.log('PASS all languages share focused instructions; steered and blank follow-ups preserve legacy history and save before acknowledgement');

  const contract=sandbox();
  vm.runInContext(section('function helpContext(', 'function selectedPassage(')+section('function decodeHelp(', 'async function explainSelection('), contract);
  const examples = [0,1,2].map(()=>({sentence:'山は高く、道はせまいです。',translation:'The mountain is tall, and the road is narrow.',highlightStart:3,highlightEnd:4,segments:[{text:'山',reading:'やま'},{text:'は高く、道はせまいです。'}]}));
  assert.equal(contract.decodeHelp(JSON.stringify({examples}), 'examples').examples.length,3);
  for (const invalid of [{examples:examples.slice(1)}, {examples:[...examples.slice(0,2),{...examples[2],highlightEnd:999}]}, {examples:[...examples.slice(0,2),{...examples[2],translation:42}]}, {examples:[...examples.slice(0,2),{...examples[2],segments:[{text:'wrong'}]}]}]) {
    assert.throws(()=>contract.decodeHelp(JSON.stringify(invalid),'examples'),/invalid/);
  }
  assert.throws(()=>contract.decodeHelp('null'),/invalid/);
  assert.throws(()=>contract.decodeHelp('{"explanation":""}'),/invalid/);
  assert.equal(contract.decodeHelp('{"explanation":"Focused."}').explanation,'Focused.');
  console.log('PASS explanation/example contracts reject malformed counts, ranges, translations and annotations');

  const rendered=sandbox({state:{furigana:true,explanationSelectionMode:false,selectedExplanationIds:new Set()},readerStory:()=>({id:'S'}),profileSnapshot:()=>({})});
  vm.runInContext(section('function helpContext(', 'function selectedPassage(')+section('function wireLongPress(', 'function renderLibrary(')+section('function renderHighlightedText(', 'async function readerAi('),rendered);
  const sample = {id:'H',kind:'explain',passage:'く',start:3,end:4,contextStart:0,contextEnd:15,text:'Focused.',versionId:'V',profile:{},followUps:[{action:'examples',examples}]};
  const v={id:'V',story:'空は青く、風はやさしいです。',storySegments:[{text:'空',reading:'そら'},{text:'は'},{text:'青',reading:'あお'},{text:'く、'},{text:'風',reading:'かぜ'},{text:'はやさしいです。'}]};
  sample.contextEnd=v.story.length;
  rendered.renderSavedHelp({id:'C',help:[sample]},v);
  const card=rendered.$('reader-help').childNodes[0];
  const descendants = node => [node,...(node.childNodes || []).flatMap(descendants)];
  const nodes=descendants(card);
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

  const removal=sandbox({state:{stories:[{id:'a'},{id:'b'}],selectedStoryIds:new Set(['a']),storySelectionMode:true},persistStories(){if(removal.fail)throw Error('disk');},updateCount(){},renderLibrary(){},toast(){},fail:false});
  vm.runInContext(section('function pendingDeletionBlocked(', 'function wireLongPress('),removal);
  assert.equal(removal.removeSelectedStories(new Set(['a'])),true);assert.deepEqual(removal.state.stories.map(x=>x.id),['b']);assert.equal(removal.state.storySelectionMode,false);
  removal.state.stories=[{id:'a'},{id:'b'}];removal.state.selectedStoryIds=new Set(['a']);removal.state.storySelectionMode=true;removal.fail=true;
  assert.equal(removal.removeSelectedStories(new Set(['a'])),false);assert.deepEqual(removal.state.stories.map(x=>x.id),['a','b']);assert.deepEqual(Array.from(removal.state.selectedStoryIds),['a']);
  console.log('PASS confirmed story removal commits in bulk and restores stories plus selection when saving fails');

  const expRemoval=sandbox({state:{selectedExplanationIds:new Set(['v1a','v1b']),explanationSelectionMode:true},pendingDeletionBlocked:()=>false,readerStory:()=>null,persistReaderStory(){if(expRemoval.fail)throw Error('disk');},renderSavedHelp(){},toast(){},fail:false});
  vm.runInContext(section('function syncExplanationSelection(', 'function renderSavedHelp('),expRemoval);
  const helpRows=[{id:'v1a',versionId:'v1'},{id:'v2',versionId:'v2'},{id:'v1b',versionId:'v1',followUps:[{text:'attached'}]}],ch={help:helpRows},storyHelp={};
  assert.equal(expRemoval.removeSelectedExplanations(storyHelp,ch,{id:'v1'},new Set(['v1a','v1b'])),true);assert.deepEqual(ch.help.map(x=>x.id),['v2']);
  ch.help=helpRows;expRemoval.state.explanationSelectionMode=true;expRemoval.state.selectedExplanationIds=new Set(['v1a']);expRemoval.fail=true;
  assert.equal(expRemoval.removeSelectedExplanations(storyHelp,ch,{id:'v1'},new Set(['v1a'])),false);assert.equal(ch.help,helpRows);assert.deepEqual(Array.from(expRemoval.state.selectedExplanationIds),['v1a']);
  console.log('PASS explanation removal is version-scoped, includes attached follow-ups, and rolls back on save failure');

  let failExampleSave=true, failExampleAck=false, callCount=0, captured;
  const entry={id:'H',kind:'explain',passage:'く',start:3,end:4,text:'Original',more:'Legacy',versionId:'V'};
  const version={id:'V',story:v.story};const chapter4={id:'C',help:[entry],versions:[version]};const story4={id:'S',language:'ja',chapters:[chapter4]};
  const selected4={storyId:'S',chapterId:'C',versionId:'V',helpId:'H',text:'く',start:3,end:4,profile:{}};
  const examplePending=sandbox({state:{readerId:'S',model:'mock',providerId:'mock'},readerStory:()=>story4,normalizeChapters:s=>s.chapters,activeChapter:()=>chapter4,activeVersion:()=>version,readerPanel:()=>({scrollTop:0}),persistReaderStory(){if(examplePending.state.pendingReaderResult && failExampleSave)throw Error('disk');},readerAi:async(kind,input)=>{callCount++;captured=input;examplePending.state.pendingReaderRequestId='request';return JSON.stringify({examples});},renderSavedHelp(){},ai:{acknowledge:async()=>{assert.ok(entry.followUps?.some(entry=>entry.action==='examples'));if(failExampleAck)throw Error('ack');}}});
  vm.runInContext(section('function helpContext(', 'function selectedPassage(')+lifecycle+section('function decodeHelp(', "$('selection-explain')"),examplePending);
  await examplePending.explainSelection('explain','examples','',selected4);
  assert.equal(entry.followUps,undefined);assert.equal(examplePending.state.pendingReaderResult.saved,false);
  assert.equal(captured.sourceText,v.story);assert.equal(captured.action,'examples');
  await examplePending.explainSelection('explain','examples','',selected4);assert.equal(callCount,1);
  failExampleSave=false;failExampleAck=true;await assert.rejects(examplePending.savePendingReaderResult(),/ack/);
  assert.equal(entry.followUps.length,2);assert.equal(entry.more,'Legacy');
  failExampleAck=false;await examplePending.savePendingReaderResult();assert.equal(entry.followUps.length,2);
  await examplePending.explainSelection('explain','examples','',selected4);assert.equal(entry.followUps.length,3);
  assert.equal(entry.text,'Original');assert.equal(callCount,2);
  console.log('PASS examples retain history; failed save rollback and acknowledgement retry do not duplicate or regenerate');

  const normalized=sandbox();vm.runInContext(section('function normalizeChapters(', 'function profileSnapshot('),normalized);
  const legacy={id:'legacy',title:'Title',story:'Text',providerId:'provider',promptVersion:'original'};
  const chapters=normalized.normalizeChapters(legacy);
  assert.equal(chapters[0].versions[0].story,'Text');assert.equal(chapters[0].versions[0].promptVersion,'original');assert.equal(legacy.chapters,undefined);
  console.log('PASS additive legacy interpretation preserves provenance');

  let submit;
  const chapter=(id)=>({id,activeVersionId:id+'v',versions:[{id:id+'v',title:id,story:'Text '+id}],help:[]});
  const story3={id:'S',language:'ja',chapters:[chapter('one'),chapter('two'),chapter('three')]};
  let requested;
  const gen=sandbox({state:{readerId:'S',readerChapter:0,model:'mock',providerId:'mock'},readerStory:()=>story3,normalizeChapters:s=>s.chapters,activeVersion:c=>c.versions.find(v=>v.id===c.activeVersionId),activeChapter:()=>story3.chapters[gen.state.readerChapter],profileSnapshot:()=>({}),persistReaderStory(){},decodeResponse:JSON.parse,readerAi:async(kind,input)=>{requested=input;gen.state.pendingReaderRequestId='r';return JSON.stringify({title:'four',story:'Text four',glossary:[]});},readerPanel:()=>({scrollTop:0}),updateReader(){},ai:{acknowledge:async()=>{}}});
  gen.$('reader-edit-submit').addEventListener=(_,fn)=>submit=fn;
  gen.$('reader-prompt').value='Next';gen.$('reader-edit-panel').dataset.mode='continue';
  vm.runInContext(lifecycle+section("$('reader-edit-submit').addEventListener", "$('reader-close').addEventListener"),gen);
  await submit();
  assert.ok(requested.priorActiveChapters.includes('Text three'));assert.equal(requested.currentChapter.title,'three');
  assert.equal(story3.chapters.length,4);assert.equal(story3.chapters[3].basedOnVersionId,'threev');assert.equal(story3.chapters[1].versions.length,1);
  console.log('PASS continuation from earlier chapter includes all active chapters and correct source');

  const later=JSON.stringify(story3.chapters.slice(1));
  gen.state.readerChapter=0;gen.$('reader-edit-panel').dataset.mode='rewrite';
  await submit();assert.equal(story3.chapters[0].versions.length,2);
  assert.equal(story3.chapters[0].versions[1].sourceVersionId,'onev');
  assert.equal(JSON.stringify(story3.chapters.slice(1)),later);
  story3.chapters[0].activeVersionId='onev';assert.equal(gen.activeVersion(story3.chapters[0]).story,'Text one');
  console.log('PASS chapter-only rewrite preserves original and all later chapters');

  let cancelAction, rejectWait, cancelCalls=0;
  const cancelContext=sandbox({state:{models:[{id:'mock'}],model:'mock'},ai:{available:true,start:async()=> 'cancel-id',wait:()=>new Promise((_,reject)=>rejectWait=reject),cancel:async()=>{cancelCalls++;rejectWait(Error('cancelled'));},acknowledge:async()=>{}},document:{createElement:()=>({addEventListener:(_,fn)=>cancelAction=fn,remove(){}})}});
  vm.runInContext(section('async function readerAi(', 'async function acknowledgeReaderResult('),cancelContext);
  const cancellation=cancelContext.readerAi('explain',{},'test');
  await new Promise(resolve=>setImmediate(resolve));await cancelAction();
  await assert.rejects(cancellation,/cancelled/);assert.equal(cancelCalls,1);assert.equal(cancelContext.state.pendingReaderRequestId,undefined);assert.equal(cancelContext.state.requestId,null);
  console.log('PASS cancelled request does not stage a completed result');

  const panel={scrollTop:321,addEventListener(){}};
  const pos=sandbox({state:{readerId:'S',readerChapter:2,readerPositions:{}},readerStory:()=>story3,activeChapter:()=>story3.chapters[pos.state.readerChapter],normalizeChapters:s=>s.chapters,updateReader(){},clearExplanationSelection(){}});
  pos.$('reader-dialog').querySelector=()=>panel;pos.$('reader-dialog').showModal=()=>{};
  vm.runInContext(section('function readerPanel(', 'function getCanonicalSelection('),pos);
  pos.rememberReaderPosition();panel.scrollTop=0;pos.openReader(story3);
  assert.equal(pos.state.readerChapter,2);assert.equal(panel.scrollTop,321);
  console.log('PASS actual scroll panel and chapter restored on reopen');
})().catch(error=>{console.error(error);process.exitCode=1;});
