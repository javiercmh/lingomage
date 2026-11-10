(async()=>{
const {bindStory}=await import('./support/controllers.mjs');const {estimateTokens,emptyMemory}=await import('../js/story-memory.js');
const assert = require('node:assert/strict');
const plain = value => JSON.parse(JSON.stringify(value));

const story = {id:'S',chapters:[{id:'A',activeVersionId:'a2',versions:[{id:'a1',story:'Original'},{id:'a2',sourceVersionId:'a1',story:'Alternate'}]}, {id:'B',basedOnVersionId:'a1',activeVersionId:'b',versions:[{id:'b',sourceVersionId:'a1',story:'Following original'}]}]};
let calls=0, saves=0, failSave=false, failAck=false;
const c={state:{providerId:'mock',model:'mock'},PROMPT_VERSION:'test',normalizeChapters:s=>s.chapters,readerStory:()=>story,console};
bindStory(c);
const oneEvent = input => JSON.stringify({newEvents:[{ref:'e1',event:input.chapterChunk.slice(-100)}]});
c.readerAi=async(kind,input)=>{calls++;assert.equal(kind,'summary');assert.ok(estimateTokens(input.chapterChunk)<=2000);return oneEvent(input);};
c.savePendingReaderResult=async()=>{const p=c.state.pendingReaderResult;if(!p.saved){const undo=p.apply();if(failSave){undo();throw Error('disk');}p.saved=true;saves++;}if(failAck)throw Error('release');c.state.pendingReaderResult=null;};
const loading={querySelector:()=>({textContent:''})};
(async()=>{
 c.ensureStoryPaths(story);assert.equal(story.paths[0].entries[0].versionId,'a1');assert.equal(story.paths[1].entries[0].versionId,'a2');

 // Language-aware budgets.
 const text='日本語。\n'+'x'.repeat(18000)+'😀';const chunks=c.memoryChunks(text);assert.equal(chunks.join(''),text);assert.ok(chunks.every(x=>estimateTokens(x)<=2000));assert.ok(estimateTokens(c.recentProse(text))<=1000);
 const de='Mia geht zum Markt. '.repeat(1000),ja='ミアは市場へ行きます。'.repeat(1000),ru='Мия идёт на рынок. '.repeat(1000);
 const sizes=t=>c.memoryChunks(t).map(x=>x.length);assert.ok(sizes(de)[0]>7900&&sizes(de)[0]<=8000,'Latin text keeps about 8000 characters per piece');assert.ok(sizes(ja)[0]>1950&&sizes(ja)[0]<=2000,'Japanese gets about 2000 characters per piece');assert.ok(sizes(ru)[0]>6200&&sizes(ru)[0]<=6500,'Cyrillic prose gets about 6400');
 for(const t of [de,ja,ru]){assert.equal(c.memoryChunks(t).join(''),t);assert.match(c.memoryChunks(t)[0],/[.。]\s*$/,'pieces end at a sentence');assert.ok(estimateTokens(c.recentProse(t))<=1000);assert.match(c.recentProse(t),/^(Mia|ミア|Мия)/,'recent prose starts at a sentence');}
 assert.equal(c.recentProse('短い章です。'),'短い章です。');assert.equal(estimateTokens('日本'),2);assert.equal(estimateTokens('abcd'),1);

 // Reading answers.
 assert.throws(()=>c.applyUpdate(emptyMemory(),'{}'),/none of the expected update lists/);assert.throws(()=>c.applyUpdate(emptyMemory(),'nope'),/no JSON object/);
 assert.throws(()=>c.applyUpdate(emptyMemory(),'{"newFacts":[{"a":{"b":1}}]}'),/nested too deeply/);assert.throws(()=>c.applyUpdate(emptyMemory(),JSON.stringify({newFacts:['x'.repeat(30001)]})),/far longer than expected/);
 assert.throws(()=>c.decodeMemory({characters:[]}),/unexpected format/);

 // Change merging: code assigns ids and checks every reference.
 const chunk1='Mia opened a bakery in Osaka. Kenji lent Mia money, and Mia bought an oven.';
 const update1={
  newCharacters:[{ref:'c1',name:'Mia',asWritten:'Mia',about:'baker'},{ref:'c2',name:'Kenji',asWritten:'Kenji'},{ref:'c3',name:'Hiro',asWritten:'Hiro'}],
  newFacts:['The bakery is in Osaka.'],
  newThreads:[{ref:'t1',thread:'Kenji wants the money back.',openedBy:'e1'}],
  newEvents:[{ref:'e1',event:'Kenji lends Mia money.',importance:'major',who:['c1','c2'],causes:['e2','E99'],threads:['t1']},{ref:'e2',event:'Mia buys an oven.',who:['c1','c3'],causes:['e1'],knownBy:['c2']}],
  newBeliefs:[{who:'c2',belief:'Mia is rich.',contradicts:'F1'}],
  resolveThreads:[{id:'T9',by:'e1'}],
  situation:['Mia opens the bakery.']
 };
 const r1=c.applyUpdate(emptyMemory(),'```json\n'+JSON.stringify(update1)+'\n```',{chunk:chunk1,source:{version:'v1',chunk:0}});
 const m1=r1.memory;
 assert.deepEqual(m1.characters.map(x=>[x.id,x.name]),[['C1','Mia'],['C2','Kenji']],'a character whose name is not in the chapter piece is rejected');
 assert.deepEqual(plain(m1.events),[
  {id:'E1',event:'Kenji lends Mia money.',importance:'major',who:['C1','C2'],causes:[],threads:['T1'],knownBy:['C1','C2'],source:{version:'v1',chunk:0}},
  {id:'E2',event:'Mia buys an oven.',importance:'minor',who:['C1'],causes:['E1'],threads:[],knownBy:['C1','C2'],source:{version:'v1',chunk:0}}
 ],'causes may not point forward or to unknown events; participants know their events; code stamps the source');
 assert.deepEqual(plain(m1.threads),[{id:'T1',thread:'Kenji wants the money back.',openedBy:'E1'}]);
 assert.deepEqual(plain(m1.beliefs),[{id:'B1',who:'C2',belief:'Mia is rich.',contradicts:'F1'}]);
 assert.deepEqual(plain(m1.facts),[{id:'F1',fact:'The bakery is in Osaka.'}]);
 assert.equal(r1.report.droppedLinks,3,'forward cause, unknown cause and rejected character link are dropped');
 assert.deepEqual(r1.report.rejected,['character Hiro: name not found in the chapter piece','resolution of T9: unknown thread']);

 const chunk2='Aiko heard about the loan from Mia. Mia repaid Kenji, and Kenji saw she was not rich.';
 const update2={
  newCharacters:[{ref:'c1',name:'Aiko',asWritten:'Aiko'},{ref:'c2',name:'mia',asWritten:'Mia'}],
  newEvents:[{ref:'e1',event:'Mia repays Kenji.',importance:'major',who:['C1','c2','C2'],causes:['E1'],threads:['T1']}],
  learned:[{who:['c1'],event:'E1'},{who:['C3'],event:'E50'}],
  resolveThreads:[{id:'T1',by:'e1'}],correctedBeliefs:[{id:'B1',by:'e1'},{id:'B1',by:'E40'}],
  importanceChanges:[{id:'E2',importance:'major'},{id:'E77',importance:'major'}],removeFacts:['F1']
 };
 const r2=c.applyUpdate(m1,JSON.stringify(update2),{chunk:chunk2,source:{version:'v1',chunk:1}});const m2=r2.memory;
 assert.deepEqual(m2.characters.map(x=>x.id),['C1','C2','C3'],'a known name maps to its existing id instead of a duplicate');
 assert.deepEqual(m2.events.find(e=>e.id==='E3').who,['C1','C2'],'a ref to an existing character resolves to that id');
 assert.deepEqual(m2.events.find(e=>e.id==='E1').knownBy,['C1','C2','C3'],'learned adds who found out later');
 assert.deepEqual([m2.threads,plain(m2.resolved)],[[],[{id:'T1',thread:'Kenji wants the money back.',by:'E3'}]],'a thread closes only with a resolving event');
 assert.deepEqual([m2.beliefs,plain(m2.correctedBeliefs)],[[],[{id:'B1',who:'C2',belief:'Mia is rich.',contradicts:'F1',by:'E3'}]],'a belief is corrected only by a real event');
 assert.equal(m2.events.find(e=>e.id==='E2').importance,'major');assert.deepEqual(m2.facts,[]);assert.deepEqual(m2.situation,['Mia opens the bakery.'],'lists the answer does not mention stay as they are');
 assert.deepEqual(r2.report.rejected,['correction of B1: unknown belief']);assert.equal(r2.report.droppedLinks,2);
 assert.deepEqual(m1.events.length,2,'the previous memory is not modified');
 const ru1=c.applyUpdate(emptyMemory(),JSON.stringify({newCharacters:[{ref:'c1',name:'Natasha',asWritten:'Наташа'}]}),{chunk:'Мы ждали Наташи весь вечер.'});
 assert.equal(ru1.memory.characters.length,1,'inflected names match by stem');

 // Connections and compaction candidates.
 const ev=(id,importance='minor',extra={})=>({id,event:`Event ${id}.`,importance,who:[],causes:[],threads:[],knownBy:[],source:{version:'b',chunk:0},...extra});
 const graph={...emptyMemory(),characters:[{id:'C1',name:'Mia',asWritten:'Mia',about:''}],
  threads:[{id:'T1',thread:'Debt.',openedBy:'E2'}],beliefs:[{id:'B1',who:'C1',belief:'Wrong.',contradicts:'E6'}],
  events:[ev('E1'),ev('E2','major'),ev('E3','minor',{causes:['E1']}),ev('E4'),ev('E5','minor',{threads:['T1']}),ev('E6'),ev('E7','major'),ev('E8'),ev('E9','minor',{threads:['T1']}),ev('E10'),ev('E11'),ev('E12')]};
 const degree=c.connections(graph);assert.equal(degree.get('E1'),1);assert.equal(degree.get('E3'),1);assert.equal(degree.get('E2'),1);assert.equal(degree.get('E6'),1);
 // Kept: E2 opened T1, B1 contradicts E6, E9–E12 are the four newest, E9 is the latest event on T1. The rest are
 // taken until the projected size reaches COMPACT_TO: minor events on no open thread (least connected first),
 // then major ones, then events on open threads.
 const padded=n=>({...graph,events:graph.events.map(e=>({...e,event:`${e.event} ${'x'.repeat(n)}`}))});
 assert.deepEqual(c.compactionCandidates(graph),[],'a memory under COMPACT_TO needs nothing');
 assert.deepEqual(c.compactionCandidates(padded(500)),[],'a gain under 1500 characters makes no request');
 assert.deepEqual(c.compactionCandidates(padded(550)).map(e=>e.id),['E1','E3','E4','E8'],'minor events on no open thread first');
 assert.deepEqual(c.compactionCandidates(padded(600)).map(e=>e.id),['E1','E3','E4','E7','E8'],'then major events');
 assert.deepEqual(c.compactionCandidates(padded(650)).map(e=>e.id),['E1','E3','E4','E5','E7','E8'],'then older events on open threads; protected events never');
 // A memory shaped like a long story: every event is major and on a never-resolved theme thread.
 const themes={...emptyMemory(),threads:[{id:'T1',thread:'Settling in.',openedBy:null},{id:'T2',thread:'A secret.',openedBy:'E20'}],
  events:Array.from({length:22},(_,i)=>ev(`E${i+1}`,'major',{event:`Event E${i+1}. ${'y'.repeat(380)}`,threads:[i>=19?'T2':'T1'],causes:i?[`E${i}`]:[]}))};
 const themed=c.compactionCandidates(themes).map(e=>e.id);
 assert.ok(themed.length>=10&&!themed.some(id=>['E19','E20','E21','E22'].includes(id)),'open theme threads no longer block condensing; the newest, openers and the latest per thread stay');

 // Applying a compaction answer.
 const sample={...graph,arcs:[{id:'A1',text:'Mia moves to Osaka.',covers:['E0'],knownBy:{E0:['C1']}}],events:graph.events.map(e=>e.id==='E4'?{...e,knownBy:['C1']}:e)};
 const candidates=sample.events.filter(e=>['E4','E8'].includes(e.id));
 const compacted=c.applyCompaction(sample,candidates,JSON.stringify({arcs:[{text:'Mia moves; days pass.',covers:['E0','E4','E8','E99']}]}));
 assert.deepEqual(plain(compacted.arcs),[{id:'A2',text:'Mia moves; days pass.',covers:['E0','E4','E8'],knownBy:{E0:['C1'],E4:['C1']}}],'code assigns arc ids, drops unknown ids and keeps who knew each event');
 assert.deepEqual(compacted.events.map(e=>e.id),['E1','E2','E3','E5','E6','E7','E9','E10','E11','E12']);
 assert.deepEqual([compacted.characters,compacted.threads,compacted.beliefs],[sample.characters,sample.threads,sample.beliefs],'code copies every other list');
 assert.throws(()=>c.applyCompaction(sample,candidates,JSON.stringify({arcs:[{text:'Mia moves.',covers:['E0','E4']}]})),/leave E8 uncovered/);
 assert.throws(()=>c.applyCompaction(sample,candidates,JSON.stringify({arcs:[{text:'Hiro arrives.',covers:['E0','E4','E8']}]})),/name Hiro/);
 assert.throws(()=>c.applyCompaction(sample,candidates,JSON.stringify({arcs:[{text:'Mia moves to Osaka. '+'Event happens. '.repeat(10),covers:['E0','E4','E8']}]})),/not shorter/);
 assert.throws(()=>c.applyCompaction(sample,candidates,'{"arcs":[]}'),/no arcs/);
 assert.doesNotThrow(()=>c.applyCompaction(sample,candidates,JSON.stringify({arcs:[{text:'Then Mia waits.',covers:['E0','E4','E8']}]})),'sentence-initial openers are not names');
 // A character can learn about an event that was already condensed.
 const later=c.applyUpdate(compacted,JSON.stringify({learned:[{who:['C1'],event:'E8'}]}));assert.deepEqual(later.memory.arcs[0].knownBy.E8,['C1']);

 // Preparing memory along story paths.
 const entries=story.paths[0].entries;await c.prepareStoryMemory(story,entries,loading);assert.equal(calls,2);await c.prepareStoryMemory(story,entries,loading);assert.equal(calls,2);
 assert.ok(story.memories.every(r=>r.updateReport&&r.memory.events.length),'each summary record keeps its update report');
 assert.deepEqual(story.memories[1].memory.events.map(e=>[e.id,e.source.version]),[['E1','a1'],['E2','b']],'ids continue across chapters and events record their source');
 await c.prepareStoryMemory(story,story.paths[1].entries,loading);assert.equal(calls,3);
 story.chapters[1].versions[0].story=text;story.memories=[];calls=0;await c.prepareStoryMemory(story,entries,loading);assert.equal(calls,4);
 story.memories=[];failSave=true;await assert.rejects(c.prepareStoryMemory(story,entries,loading),/disk/);assert.equal(story.memories.length,0);failSave=false;await c.savePendingReaderResult();await c.prepareStoryMemory(story,entries,loading);assert.equal(story.memories.length,4);
 story.memories=[];failAck=true;await assert.rejects(c.prepareStoryMemory(story,entries,loading),/release/);assert.equal(story.memories.length,1);failAck=false;await c.savePendingReaderResult();const before=calls;await c.prepareStoryMemory(story,entries,loading);assert.equal(calls-before,3);
 story.memories=[];let stages=0;c.readerAi=async(kind,input)=>{if(++stages===2)throw Error('cancelled');return oneEvent(input);};await assert.rejects(c.prepareStoryMemory(story,entries,loading),/cancelled/);assert.equal(story.memories.length,1);

 // Compaction inside preparation: an invalid answer is released and never blocks; a later run condenses the
 // same saved summary without a new summary request; sources go along; other errors still stop.
 story.memories=[];calls=0;const compactCalls=[];let failCompact=true,summaryCalls=0,discards=0;c.discardResponse=async()=>{discards++;};
 c.readerAi=async(kind,input)=>{calls++;if(kind==='memory-compact'){compactCalls.push(input);const covers=[...input.previousArcs.flatMap(a=>a.covers),...input.events.map(e=>e.id)];if(failCompact)return JSON.stringify({arcs:[{text:'Zed arrives.',covers}]});return JSON.stringify({arcs:[{text:'Earlier days pass.',covers}]});}
  summaryCalls++;return JSON.stringify({newEvents:Array.from({length:14},(_,i)=>({ref:`e${i}`,event:`day ${i} `+'y'.repeat(400)}))});};
 const unblocked=await c.prepareStoryMemory(story,entries,loading);
 assert.equal(compactCalls.length,1,'one compaction attempt per run');assert.equal(discards,1,'the invalid answer is released');
 assert.ok(story.memories.length>=2&&story.memories.every(r=>!r.compactedFrom),'every chunk is summarized and nothing condensed is saved');
 assert.equal(unblocked.events.length,summaryCalls*14,'the run goes on with the full memory');
 failCompact=false;const summariesBefore=summaryCalls;const prepared=await c.prepareStoryMemory(story,entries,loading);
 assert.deepEqual(compactCalls[1],compactCalls[0],'the next run condenses the same saved summary');assert.equal(summaryCalls,summariesBefore,'no summary is regenerated');
 assert.ok(compactCalls[0].events.length>0&&compactCalls[0].events.length<=24,'enough events to reach the target, never the four newest');
 assert.equal(compactCalls[0].maxArcTextCharacters,[...compactCalls[0].previousArcs.map(a=>a.text),...compactCalls[0].events.map(e=>e.event)].join('\n').length-1,'the arc budget matches the shorter-than-source check');
 assert.ok(compactCalls[0].sourceExcerpts.length>=1&&compactCalls[0].sourceExcerpts.every(x=>x.text&&estimateTokens(x.text)<=3000),'source passages go with the compaction');
 const condensed=story.memories.filter(r=>r.compactedFrom);assert.ok(condensed.length>=1&&condensed.every(r=>r.condensedEvents.length>0&&r.sizeAfter<r.sizeBefore&&story.memories.some(s=>s.key===r.compactedFrom)),'condensed records keep provenance and the summary they replace');
 assert.ok(prepared.arcs.some(a=>a.text==='Earlier days pass.'));const afterPrepare=calls;await c.prepareStoryMemory(story,entries,loading);assert.equal(calls,afterPrepare,'condensed memory is reused from the cache');
 story.memories=story.memories.filter(r=>!r.compactedFrom);c.readerAi=async kind=>{assert.equal(kind,'memory-compact');throw Error('Request cancelled.');};
 await assert.rejects(c.prepareStoryMemory(story,entries,loading),/cancelled/,'cancellation during compaction still stops');

 // Memory cache keys use the memory prompt versions, not the app prompt version; older memory versions are dropped on save.
 const {SUMMARY_PROMPT_VERSION,COMPACTION_PROMPT_VERSION,MEMORY_VERSION}=await import('../js/story-memory.js');
 const summaryRecord=story.memories.find(r=>!r.compactedFrom);assert.equal(JSON.parse(summaryRecord.key)[1],SUMMARY_PROMPT_VERSION);assert.equal(summaryRecord.promptVersion,SUMMARY_PROMPT_VERSION);
 assert.ok(condensed.every(r=>JSON.parse(r.key)[1]===COMPACTION_PROMPT_VERSION&&r.promptVersion===COMPACTION_PROMPT_VERSION));
 story.memories=[{key:'legacy',memoryVersion:'1',memory:{}}];c.readerAi=async(kind,input)=>oneEvent(input);
 await c.prepareStoryMemory(story,entries,loading);assert.ok(story.memories.length&&story.memories.every(r=>r.memoryVersion===MEMORY_VERSION),'records of another memory version are dropped in the same save');
 console.log('PASS lineage, language-aware chunks and recent prose, change merging with code-assigned ids and checked links, knowledge and beliefs, target-sized compaction that keeps protected events, never blocks on an invalid answer, coverage, name and length checks, source excerpts, retry without regenerating summaries, shared-cache reuse, save/release recovery and staged cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});

})().catch(error=>{console.error(error);process.exitCode=1;});
