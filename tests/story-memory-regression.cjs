(async()=>{
const {bindStory, bindGeneration, bindPanels}=await import('./support/controllers.mjs');const {estimateTokens}=await import('../js/story-memory.js');
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');

const story = {id:'S',chapters:[{id:'A',activeVersionId:'a2',versions:[{id:'a1',story:'Original'},{id:'a2',sourceVersionId:'a1',story:'Alternate'}]}, {id:'B',basedOnVersionId:'a1',activeVersionId:'b',versions:[{id:'b',sourceVersionId:'a1',story:'Following original'}]}]};
let calls=0, saves=0, failSave=false, failAck=false;
const c={state:{providerId:'mock',model:'mock'},PROMPT_VERSION:'test',normalizeChapters:s=>s.chapters,readerStory:()=>story,console};
bindStory(c);
c.readerAi=async(kind,input)=>{calls++;assert.equal(kind,'summary');assert.ok(estimateTokens(input.chapterChunk)<=2000);return JSON.stringify({...input.previousMemory,plot:[input.chapterChunk.slice(-100)]});};
c.savePendingReaderResult=async()=>{const p=c.state.pendingReaderResult;if(!p.saved){const undo=p.apply();if(failSave){undo();throw Error('disk');}p.saved=true;saves++;}if(failAck)throw Error('release');c.state.pendingReaderResult=null;};
const loading={querySelector:()=>({textContent:''})};
(async()=>{
 c.ensureStoryPaths(story);assert.equal(story.paths[0].entries[0].versionId,'a1');assert.equal(story.paths[1].entries[0].versionId,'a2');
 const text='日本語。\n'+'x'.repeat(18000)+'😀';const chunks=c.memoryChunks(text);assert.equal(chunks.join(''),text);assert.ok(chunks.every(x=>estimateTokens(x)<=2000));assert.ok(estimateTokens(c.recentProse(text))<=1000);
 const de='Mia geht zum Markt. '.repeat(1000),ja='ミアは市場へ行きます。'.repeat(1000),ru='Мия идёт на рынок. '.repeat(1000);
 const sizes=t=>c.memoryChunks(t).map(x=>x.length);assert.ok(sizes(de)[0]>7900&&sizes(de)[0]<=8000,'Latin text keeps about 8000 characters per piece');assert.ok(sizes(ja)[0]>1950&&sizes(ja)[0]<=2000,'Japanese gets about 2000 characters per piece');assert.ok(sizes(ru)[0]>6200&&sizes(ru)[0]<=6500,'Cyrillic prose gets about 6400');
 for(const t of [de,ja,ru]){assert.equal(c.memoryChunks(t).join(''),t);assert.match(c.memoryChunks(t)[0],/[.。]\s*$/,'pieces end at a sentence');assert.ok(estimateTokens(c.recentProse(t))<=1000);assert.match(c.recentProse(t),/^(Mia|ミア|Мия)/,'recent prose starts at a sentence');}
 assert.equal(c.recentProse('短い章です。'),'短い章です。');assert.equal(estimateTokens('日本'),2);assert.equal(estimateTokens('abcd'),1);
 assert.throws(()=>c.decodeMemory('{}'));assert.throws(()=>c.decodeMemory(JSON.stringify({characters:[],facts:[],plot:['x'.repeat(12000)],unresolved:[],uncertainties:[],situation:[]})));
 const entries=story.paths[0].entries;await c.prepareStoryMemory(story,entries,loading);assert.equal(calls,2);await c.prepareStoryMemory(story,entries,loading);assert.equal(calls,2);
 await c.prepareStoryMemory(story,story.paths[1].entries,loading);assert.equal(calls,3);
 story.chapters[1].versions[0].story=text;story.memories=[];calls=0;await c.prepareStoryMemory(story,entries,loading);assert.equal(calls,4);
 story.memories=[];failSave=true;await assert.rejects(c.prepareStoryMemory(story,entries,loading),/disk/);assert.equal(story.memories.length,0);failSave=false;await c.savePendingReaderResult();await c.prepareStoryMemory(story,entries,loading);assert.equal(story.memories.length,4);
 story.memories=[];failAck=true;await assert.rejects(c.prepareStoryMemory(story,entries,loading),/release/);assert.equal(story.memories.length,1);failAck=false;await c.savePendingReaderResult();const before=calls;await c.prepareStoryMemory(story,entries,loading);assert.equal(calls-before,3);
 story.memories=[];let stages=0;c.readerAi=async()=>{if(++stages===2)throw Error('cancelled');return JSON.stringify({characters:[],facts:[],plot:[],unresolved:[],uncertainties:[],situation:[]});};await assert.rejects(c.prepareStoryMemory(story,entries,loading),/cancelled/);assert.equal(story.memories.length,1);
 console.log('PASS lineage, language-aware token-estimate chunks and recent prose, memory validation, shared-cache reuse, save/release recovery and staged cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});

})().catch(error=>{console.error(error);process.exitCode=1;});
