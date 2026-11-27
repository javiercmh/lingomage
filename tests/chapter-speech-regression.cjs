const assert=require('node:assert/strict');
(async()=>{
 const { loadFactory, deps, bridge, stubDom } = await import('./support/factory-harness.mjs');
 const { chapterSpeechText, speakChapter } = await import('../js/reader/reader-speech.js');
 const createReaderListen = await loadFactory('js/reader/reader-listen.js', 'createReaderListen');
 globalThis.ResizeObserver ??= class { observe() {} };
 const calls=[];const speech={speak:async options=>{calls.push(options);return {status:'completed'};}};
 const text=chapterSpeechText({title:'日本語の章😀',story:'日本語😀'.repeat(1100),storySegments:[{text:'日本語',reading:'にほんご'}]},'Fallback');
 assert.ok(text.startsWith('日本語の章😀\n\n'));assert.ok(!text.includes('にほんご'));
 assert.equal(chapterSpeechText({title:'',story:'Body'},'Fallback'),'Fallback\n\nBody');
 assert.equal(chapterSpeechText({story:'Body'}),'Body');
 await speakChapter(speech,text,'ja-JP');assert.equal(calls.map(x=>x.text).join(''),text);assert.ok(calls.every(x=>x.text.length<=2000&&x.language==='ja-JP'&&!/[\uD800-\uDBFF]$/u.test(x.text)));
 let count=0;await speakChapter({speak:async()=>{count++;return {status:'cancelled'};}},text,'ja-JP');assert.equal(count,1);
 let current=true;count=0;await speakChapter({speak:async()=>{count++;current=false;return {status:'completed'};}},text,'ja-JP',()=>current);assert.equal(count,1);
 count=0;await speakChapter({speak:async()=>{count++;}},text,'ja-JP',()=>false);assert.equal(count,0);
 // Invoke the actual Listen listener of the production factory, not only the speech helper.
 const dom=stubDom(), button=dom.$('reader-listen'), dialog=dom.$('reader-dialog'); dialog.open=true;
 const fixture={title:'',story:'本文😀'.repeat(900),storySegments:[{text:'本文',reading:'ほんぶん'}]};
 const original=JSON.stringify(fixture);calls.length=0;
 const state={speechVersionKey:'S:C:V'}, runtime={}, toasts=[], checkpoints=[];
 Object.assign(bridge.speech,{available:true,speak:speech.speak});
 createReaderListen(deps({$:dom.$,state,runtime,readerStory:()=>({id:'S',title:'章の名前',language:'ja'}),activeChapter:()=>({}),activeVersion:()=>fixture,
  trackedSpeech:bridge.speech,usage:{checkpoint(){checkpoints.push(1);}},SPEECH_LANGUAGES:{ja:'ja-JP'},toast:message=>toasts.push(message)}));
 await button.listeners.click[0]();
 const spoken=calls.map(x=>x.text).join('');assert.ok(spoken.startsWith('章の名前\n\n本文😀')&&spoken===chapterSpeechText(fixture,'章の名前'),'title falls back to the story title and the whole chapter is spoken');
 assert.ok(calls.length>1&&calls.every(x=>x.language==='ja-JP'&&x.text.length<=2000&&!/[\uD800-\uDBFF]$/u.test(x.text)));assert.equal(button.disabled,false);assert.equal(JSON.stringify(fixture),original);
 assert.deepEqual(runtime.playbackContext,{storyId:'S',language:'ja'});assert.equal(checkpoints.length,1);assert.deepEqual(toasts,[]);
 fixture.story='本文😀';calls.length=0;await button.listeners.click[0]();assert.equal(calls.map(x=>x.text).join(''),'章の名前\n\n本文😀');fixture.story='本文😀'.repeat(900);
 // The navigation guard reaches speakChapter: closing the reader after the first chunk stops the queue.
 calls.length=0;bridge.speech.speak=async options=>{calls.push(options);dialog.open=false;return {status:'completed'};};
 await button.listeners.click[0]();assert.equal(calls.length,1,'closed reader stops queued chunks');
 console.log('PASS whole chapter speech: complete canonical text, bounded Unicode-safe chunks, locale, cancellation and navigation guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
