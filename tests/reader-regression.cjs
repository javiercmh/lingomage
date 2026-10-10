// Dependency-free regression harness; exercises production functions with isolated DOM/AI stubs.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
function sandbox(extra = {}) {
  const elements = new Map();
  const element = () => ({hidden:false,textContent:'',dataset:{},childNodes:[], append(node){this.childNodes.push(node);},addEventListener(){},remove(){},classList:{add(){},remove(){}}});
  const c = {state:{},console,crypto:{randomUUID:()=> 'help-test'},PROMPT_VERSION:'test',LANGUAGES:{ja:'Japanese',de:'German'},$:id=>{if(!elements.has(id)) elements.set(id,element()); return elements.get(id);},document:{createElement:element,querySelectorAll:()=>[]},toast(){},...extra};
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

  let finish,current;
  const original={id:'A',language:'ja',chapters:[{id:'CA',help:[],versions:[{id:'VA'}]}]};
  const other={id:'B',language:'de',chapters:[{id:'CB',help:[],versions:[{id:'VB'}]}]};current=original;
  const help=sandbox({state:{readerId:'A',readerSelection:{storyId:'A',text:'日本',start:0,end:2,chapterId:'CA',versionId:'VA',profile:{}},model:'mock',providerId:'mock'},readerStory:()=>current,normalizeChapters:s=>s.chapters,activeChapter:()=>current.chapters[0],activeVersion:()=>current.chapters[0].versions[0],readerPanel:()=>({scrollTop:150}),persistReaderStory(){},readerAi:()=>new Promise(r=>finish=r),decodeHelp:JSON.parse,renderSavedHelp(){},ai:{acknowledge:async()=>{}}});
  vm.runInContext(lifecycle+section('async function explainSelection(',"$('selection-explain')"),help);
  const pending=help.explainSelection();await new Promise(r=>setImmediate(r));
  current=other;help.state.readerId='B';help.state.model='changed-model';help.state.pendingReaderRequestId='r';
  finish(JSON.stringify({translation:'Japan',explanation:'Meaning'}));await pending;
  assert.equal(original.chapters[0].help.length,1);assert.equal(other.chapters[0].help.length,0);
  assert.equal(original.chapters[0].help[0].model,'mock');
  console.log('PASS response remains anchored after switching stories and captures model provenance');

  const text=value=>({nodeType:3,nodeValue:value,childNodes:[]});
  const element=(tag,...children)=>({nodeType:1,childNodes:children,matches:name=>name===tag,contains:()=>true});
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
  console.log('PASS root, ruby element, and text-node boundaries omit readings');

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
  const pos=sandbox({state:{readerId:'S',readerChapter:2,readerPositions:{}},readerStory:()=>story3,activeChapter:()=>story3.chapters[pos.state.readerChapter],normalizeChapters:s=>s.chapters,updateReader(){}});
  pos.$('reader-dialog').querySelector=()=>panel;pos.$('reader-dialog').showModal=()=>{};
  vm.runInContext(section('function readerPanel(', 'function getCanonicalSelection('),pos);
  pos.rememberReaderPosition();panel.scrollTop=0;pos.openReader(story3);
  assert.equal(pos.state.readerChapter,2);assert.equal(panel.scrollTop,321);
  console.log('PASS actual scroll panel and chapter restored on reopen');
})().catch(error=>{console.error(error);process.exitCode=1;});
