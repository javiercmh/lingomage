const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={Intl};vm.createContext(c);vm.runInContext(fs.readFileSync('js/reader-speech.js','utf8').replaceAll('export ',''),c);
(async()=>{
 const calls=[];const speech={speak:async options=>{calls.push(options);return {status:'completed'};}};
 const text='日本語😀'.repeat(1100);
 await c.speakChapter(speech,text,'ja-JP');assert.equal(calls.map(x=>x.text).join(''),text);assert.ok(calls.every(x=>x.text.length<=2000&&x.language==='ja-JP'&&!/[\uD800-\uDBFF]$/u.test(x.text)));
 let count=0;await c.speakChapter({speak:async()=>{count++;return {status:'cancelled'};}},text,'ja-JP');assert.equal(count,1);
 let current=true;count=0;await c.speakChapter({speak:async()=>{count++;current=false;return {status:'completed'};}},text,'ja-JP',()=>current);assert.equal(count,1);
 count=0;await c.speakChapter({speak:async()=>{count++;}},text,'ja-JP',()=>false);assert.equal(count,0);
 const app=fs.readFileSync('js/app.js','utf8');assert.match(app,/speakChapter\(speech, version\.story, SPEECH_LANGUAGES\[story\.language\], isCurrent\)/);
 console.log('PASS whole chapter speech: complete canonical text, bounded Unicode-safe chunks, locale, cancellation and navigation guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
