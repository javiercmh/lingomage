const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(){
 const version=(id,text,sourceVersionId)=>({id,title:text,story:text,glossary:[],providerId:'fixture',model:'mock',promptVersion:'test',sourceVersionId});
 return {id:'S',title:'Deleted original mirror',story:'Deleted original mirror',activeVersionId:'a',nextAlternateNumber:4,activePathId:'original',
 chapters:[{id:'A',activeVersionId:'a',versions:[version('a','Start'),version('ax','Alternate start','a')],help:[{id:'ha',versionId:'a',followUps:[{text:'detail'}]},{id:'hax',versionId:'ax'}]},
 {id:'B',activeVersionId:'b',basedOnVersionId:'a',versions:[version('b','Original middle','a'),version('bx','Alternate middle','b')],help:[{id:'hb',versionId:'b'},{id:'hbx',versionId:'bx'}]},
 {id:'C',activeVersionId:'c',basedOnVersionId:'b',versions:[version('c','End','b')],help:[{id:'hc',versionId:'c'}]}],
 paths:[{id:'original',name:'Original',entries:[{chapterId:'A',versionId:'a'},{chapterId:'B',versionId:'b'},{chapterId:'C',versionId:'c'}]},
 {id:'alt1',name:'Alternate 1',parentPathId:'original',parentPathName:'Original',forkChapter:2,entries:[{chapterId:'A',versionId:'a'},{chapterId:'B',versionId:'bx'}]},
 {id:'alt3',name:'Alternate 3',parentPathId:'original',parentPathName:'Original',forkChapter:1,entries:[{chapterId:'A',versionId:'ax'}]}],
 memories:[{lineage:['a']},{lineage:['a','b']},{lineage:['a','b','c']},{lineage:['a','bx']},{lineage:['ax']},{lineage:['ax','b']}]};
}
function harness(story=fixture()){
 const elements=new Map();const $=id=>{if(!elements.has(id)) elements.set(id,{textContent:'',hidden:true,style:{},open:false,focus(){this.focused=true;},setAttribute(key,value){this[key]=value;},showModal(){this.open=true;},close(){this.open=false;},getBoundingClientRect(){return {left:300,top:80,bottom:124,height:104};}});return elements.get(id);};
 let failed=false, saves=0, deleted;
 const c={pipeline:null,state:{readerId:'S',readerChapter:1,stories:[story],readerPositions:{'S:original':{chapterId:'C'},'S:alt1':{chapterId:'B'},'S:alt3':{chapterId:'A'}},readerEditDraft:{storyId:'S',pathId:'original',chapterId:'C'}},$,console,window:{innerWidth:390,innerHeight:844},
 readerStory:()=>c.state.stories.find(x=>x.id===c.state.readerId),persistReaderStory(s){assert.equal(s,c.state.stories[0]);if(failed)throw Error('disk');saves++;},
 clearExplanationSelection(){},closeWordNote(){},updateReader(){},readerPanel:()=>({scrollTop:0}),toast(){},setView(){},confirmStoryDeletion(ids){deleted=ids;}};
 vm.createContext(c);vm.runInContext(slice('function pendingDeletionBlocked(', 'function syncStorySelection('),c);vm.runInContext(slice('function closeReaderActions(', 'function readerStory('),c);
 return {c,story,$,fail:value=>failed=value,saves:()=>saves,deleted:()=>deleted};
}
function target(story,pathId,kind,index=1){return {storyId:story.id,pathId,kind,index,entries:JSON.stringify(story.paths.find(p=>p.id===pathId).entries)};}
{
 const {c,story,$,saves}=harness();const shared=JSON.stringify(story.chapters[0].help[0]);
 c.confirmReaderRemoval('chapters');assert.match($('reader-removal-message').textContent,/Chapters 2–3/);assert.equal($('reader-removal-cancel').focused,true);assert.equal(saves(),0);
 assert.equal(c.removeReaderContent(),true);assert.equal(story.paths[0].entries.length,1);assert.equal(story.paths[1].entries.length,2);
 assert.equal(story.chapters.length,2);assert.equal(story.chapters[1].versions.length,1);assert.equal(story.chapters[1].versions[0].id,'bx');assert.equal(story.chapters[1].help[0].id,'hbx');
 assert.equal(JSON.stringify(story.chapters[0].help[0]),shared);assert.equal(JSON.stringify(story.memories.map(x=>x.lineage.join(','))),JSON.stringify(['a','a,bx','ax']));
 assert.equal(story.story,'Start');assert.equal(c.state.readerChapter,0);assert.equal(c.state.readerPositions['S:original'],undefined);assert.ok(c.state.readerPositions['S:alt1']);assert.equal(c.state.readerEditDraft,null);assert.equal(story.nextAlternateNumber,4);
}
{
 const {c,story}=harness();assert.equal(c.removeReaderContent(target(story,'original','chapters',2)),true);assert.equal(story.paths[0].entries.length,2);assert.equal(c.state.readerChapter,1);assert.ok(story.chapters[1].versions.some(v=>v.id==='b'));
}
{
 const {c,story}=harness();assert.equal(c.removeReaderContent(target(story,'alt1','chapters',1)),true);assert.equal(story.paths[1].forkChapter,undefined);assert.equal(story.paths[1].parentPathId,undefined);assert.equal(story.paths[0].entries.length,3);
}
{
 const {c,story}=harness();assert.equal(c.removeReaderContent(target(story,'original','path')),true);assert.equal(story.activePathId,'alt1');assert.equal(c.state.readerChapter,0);assert.equal(story.paths[0].name,'Alternate 1');assert.equal(c.pathForkDescription(story,story.paths[0]),'Different version from Chapter 2.');assert.equal(story.chapters[1].versions.length,1);
}
{
 const {c,story}=harness();assert.equal(c.removeReaderContent(target(story,'alt3','path')),true);assert.equal(story.chapters[0].versions.length,1);assert.equal(story.chapters[0].help.length,1);assert.ok(!story.memories.some(x=>x.lineage.includes('ax')));c.initializePathCounter(story);assert.equal(story.nextAlternateNumber,4);
 const reload=JSON.parse(JSON.stringify(story));c.ensureStoryPaths(reload);assert.equal(reload.paths.length,2);assert.equal(reload.nextAlternateNumber,4);
}
{
 const {c,story,$,fail,saves}=harness();const before=JSON.stringify(story),request=target(story,'original','chapters');fail(true);assert.equal(c.removeReaderContent(request),false);assert.equal(JSON.stringify(story),before);assert.equal(c.state.readerChapter,1);assert.match($('reader-removal-error').textContent,/disk/);fail(false);assert.equal(c.removeReaderContent(request),true);assert.equal(saves(),1);
}
{
 const {c,story,$}=harness();for(const key of ['requestId','pendingGeneration','pendingStoryRequestId','pendingReaderRequestId','pendingReaderResult','readerEditBusy','readerHelpBusy']) {c.state[key]=true;const before=JSON.stringify(story);assert.equal(c.removeReaderContent(target(story,'original','path')),false);c.renderReaderActions();assert.equal($('reader-delete-path').disabled,true);assert.equal(JSON.stringify(story),before);c.state[key]=null;}
 const stale=target(story,'original','chapters');story.paths[0].entries.pop();assert.equal(c.removeReaderContent(stale),false);assert.match($('reader-removal-error').textContent,/changed/);
}
{
 const h=harness(),{c,story,$}=h;c.state.readerChapter=0;c.confirmReaderRemoval('chapters');assert.equal(c.state.readerRemoval.kind,'path');story.paths=[story.paths[0]];c.confirmReaderRemoval('chapters');assert.equal(h.deleted().has('S'),true);c.confirmReaderRemoval('path');assert.equal(h.deleted().has('S'),true);
 c.state.current=story;c.finishDeletedStoryReader(new Set(['S']));assert.equal(c.state.readerId,null);assert.equal(c.state.current,null);assert.deepEqual(Object.keys(c.state.readerPositions),[]);
}
{
 const {c,story,$}=harness();c.renderReaderActions();assert.equal($('reader-remove-chapters').textContent,'Remove Chapter 2 onward…');c.state.readerChapter=2;c.renderReaderActions();assert.equal($('reader-remove-chapters').textContent,'Remove Chapter 3…');c.toggleReaderActions();assert.equal($('reader-actions-menu').hidden,false);c.closeReaderActions(true);assert.equal($('reader-actions-toggle')['aria-expanded'],'false');assert.equal($('reader-actions-toggle').focused,true);
 const legacy={id:'legacy',title:'Old',story:'Old',glossary:[]};c.ensureStoryPaths(legacy);assert.equal(legacy.paths.length,1);assert.equal(legacy.nextAlternateNumber,1);
}
console.log('PASS chapter/path removal, shared content and memory, mirrors, name counter, reload, save rollback, stale targets, pending-AI guard, final-path routing and focus');
(async()=>{
 const {c,story,$}=harness();c.removeReaderContent(target(story,'original','chapters',1));
 let submit, requested, sequence=0;
 const element=tag=>({tagName:tag,childNodes:[],textContent:'',setAttribute(){},append(...nodes){this.childNodes.push(...nodes);},querySelector(selector){return this.childNodes.find(x=>x.tagName===selector)||this.childNodes.map(x=>x.querySelector?.(selector)).find(Boolean);},remove(){},scrollIntoView(){}});
 c.document={createElement:element,querySelectorAll:()=>[]};c.crypto={randomUUID:()=>`generated-${++sequence}`};c.PROMPT_VERSION='test';c.LANGUAGES={de:'German'};c.STORY_GUIDES={de:{beginner:'Simple'}};c.profileSnapshot=()=>({});c.decodeResponse=JSON.parse;c.state.model='mock';c.state.providerId='mock';story.language='de';story.difficulty='beginner';
 c.readerGeneration=null;c.renderReaderGeneration=()=>{};c.setReaderGeneration=value=>{c.readerGeneration=value;};c.renderChapterRequest=()=>{};c.renderCheckpointRecovery=()=>{};vm.runInContext(fs.readFileSync('js/request-lifecycle.js','utf8').replaceAll('export async function ','async function '),c);
 c.LENGTHS={short:{words:[100,150],sentences:[8,12]}};c.lengthPreference=()=> 'short';c.structuredClone=structuredClone;
 c.operationProvenance=op=>({operationId:op.id,promptVersion:'test'});
 vm.runInContext(slice('function applyContentOperation(', 'function showOperationResult('),c);
 c.runContentOperation=async spec=>{const op={...spec,id:`operation-${++sequence}`,createdAt:'test',result:JSON.parse(await c.readerAi(spec.kind,spec.input))};c.applyContentOperation(op);return op;};c.showOperationResult=()=>{};
 c.ai={acknowledge:async()=>{}};c.readerAi=async(kind,input)=>{c.state.pendingReaderRequestId='request';if(kind==='summary')return JSON.stringify({...input.previousMemory,plot:[input.chapterChunk]});requested=input;return JSON.stringify({title:'New',story:'Next scene',glossary:[]});};
 vm.runInContext(slice('async function acknowledgeReaderResult(', 'function decodeHelp(')+slice('function storyInstructions(', 'function storyInput(')+slice('function createHelpLoading(', 'function renderSavedHelp('),c);
 c.state.languageExpectations={};c.levelDefinition=()=>({id:'A1'});c.guideFor=()=> 'Simple';c.readingDescription=()=> 'I can read simple text';c.LEVELS={de:{framework:'CEFR'}};c.SCOPES={scene:{description:'One event'}};c.setScopeDisabled=()=>{};c.renderJobRecovery=()=>{};c.generationProvenance=job=>({difficulty:job.input.difficulty,scope:job.input.scope,languagePlan:job.plan,learnerContext:{}});
 c.acknowledgeStoryRequest=async id=>{await c.ai.acknowledge(id);if(c.state.generationJob?.writeRequestId===id)c.state.generationJob=null;};
 c.plannedStory=async(mode,input,instructions,loading,config,applyContext)=>{requested=input;c.state.generationJob={input,applyContext,plan:{vocabulary:[],grammar:[],guidance:''},createdAt:'test',versionId:c.crypto.randomUUID(),chapterId:c.crypto.randomUUID(),alternateId:c.crypto.randomUUID(),writeRequestId:'write'};return JSON.stringify({title:'New',story:'Next scene',glossary:[]});};
 $('reader-level').value='A1';$('reader-scope').value='scene';
 $('reader-edit-submit').addEventListener=(_,fn)=>submit=fn;$('reader-edit-panel').dataset={mode:'continue'};$('reader-prompt').value='';
 vm.runInContext(slice("$('reader-edit-submit').addEventListener", "$('reader-dialog').addEventListener"),c);
 await submit();assert.equal(story.paths[0].entries.length,2);assert.equal(requested.recentProse,'Start');assert.equal(story.paths[1].entries[1].versionId,'bx');
 $('reader-edit-panel').dataset.mode='rewrite';c.state.readerChapter=1;await submit();assert.equal(c.selectedPath(story).name,'Alternate 4');assert.equal(c.selectedPath(story).parentPathId,'original');assert.equal(story.nextAlternateNumber,5);
 c.removeReaderContent(target(story,story.activePathId,'path'));c.state.readerChapter=1;await submit();assert.equal(c.selectedPath(story).name,'Alternate 5');assert.equal(story.nextAlternateNumber,6);
 console.log('PASS production generation continues from truncated ending and rewrite never reuses a deleted alternate name');
})().catch(error=>{console.error(error);process.exitCode=1;});
