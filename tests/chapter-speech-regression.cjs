const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={Intl};vm.createContext(c);vm.runInContext(fs.readFileSync('js/reader-speech.js','utf8').replaceAll('export ',''),c);
(async()=>{
 const calls=[];const speech={speak:async options=>{calls.push(options);return {status:'completed'};}};
 const text=c.chapterSpeechText({title:'日本語の章😀',story:'日本語😀'.repeat(1100),storySegments:[{text:'日本語',reading:'にほんご'}]},'Fallback');
 assert.ok(text.startsWith('日本語の章😀\n\n'));assert.ok(!text.includes('にほんご'));
 assert.equal(c.chapterSpeechText({title:'',story:'Body'},'Fallback'),'Fallback\n\nBody');
 assert.equal(c.chapterSpeechText({story:'Body'}),'Body');
 await c.speakChapter(speech,text,'ja-JP');assert.equal(calls.map(x=>x.text).join(''),text);assert.ok(calls.every(x=>x.text.length<=2000&&x.language==='ja-JP'&&!/[\uD800-\uDBFF]$/u.test(x.text)));
 let count=0;await c.speakChapter({speak:async()=>{count++;return {status:'cancelled'};}},text,'ja-JP');assert.equal(count,1);
 let current=true;count=0;await c.speakChapter({speak:async()=>{count++;current=false;return {status:'completed'};}},text,'ja-JP',()=>current);assert.equal(count,1);
 count=0;await c.speakChapter({speak:async()=>{count++;}},text,'ja-JP',()=>false);assert.equal(count,0);
 const app=fs.readFileSync('js/app.js','utf8');assert.ok(app.includes('const text = chapterSpeechText(version, story.title);'));assert.ok(app.includes('speakChapter(speech, text, SPEECH_LANGUAGES[story.language], isCurrent)'));
 // Invoke the actual Listen listener, not only the speech helper.
 const handlers={}, button={disabled:false,setAttribute(){},addEventListener:(name,fn)=>handlers[name]=fn}, dialog={open:true};
 const fixture={title:'',story:'本文😀',storySegments:[{text:'本文',reading:'ほんぶん'}]};
 const original=JSON.stringify(fixture);calls.length=0;
 Object.assign(c,{state:{speechVersionKey:'S:C:V'},readerStory:()=>({title:'章の名前',language:'ja'}),activeChapter:()=>({}),activeVersion:()=>fixture,
 speech:{available:true,speak:speech.speak},SPEECH_LANGUAGES:{ja:'ja-JP'},$:id=>id==='reader-listen'?button:dialog,toast:message=>{throw Error(message);}});
 vm.runInContext("let readerSpeechRun=0, readerSpeechKey='', readerSpeechOwner=0, readerSpeechStop=null;\n"+app.slice(app.indexOf("function renderReaderListen("),app.indexOf("$('reader-dialog').addEventListener('pointerdown'")),c);
 await handlers.click();assert.equal(calls.map(x=>x.text).join(''),'章の名前\n\n本文😀');
 assert.ok(calls.every(x=>x.language==='ja-JP'));assert.equal(button.disabled,false);assert.equal(JSON.stringify(fixture),original);
 console.log('PASS whole chapter speech: complete canonical text, bounded Unicode-safe chunks, locale, cancellation and navigation guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
