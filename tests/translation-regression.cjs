const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('js/bridge.js','utf8').slice(fs.readFileSync('js/bridge.js','utf8').indexOf('const TRANSLATION =')).replace('export const translation', 'const translation') + '\nthis.translation = translation;';
function harness(channel) { const c = {window: {AppTranslation: channel}, setTimeout, clearTimeout}; vm.createContext(c); vm.runInContext(source,c); return c.translation; }
(async () => {
 const missing = harness(null); assert.deepEqual(JSON.parse(JSON.stringify(await missing.availability())), {available:false}); await assert.rejects(missing.open({text:'Hallo'}), e => e.code === 'unavailable');
 const channel = {postMessage(raw) { const request = JSON.parse(raw); this.last = request; this.onmessage({data: JSON.stringify({id:request.id, value:request.action === 'availability' ? {available:true} : {opened:true}})}); }};
 const translation = harness(channel); assert.equal((await translation.availability()).available,true);
 assert.equal((await translation.open({text:'日本語'})).opened,true); assert.equal(channel.last.options.text,'日本語');
 channel.postMessage = function(raw) { const request=JSON.parse(raw); this.onmessage({data:JSON.stringify({id:request.id,error:{code:'invalid_request',message:'Blank text'}})}); };
 await assert.rejects(translation.open({text:''}),e=>e.code==='invalid_request');
 const app=fs.readFileSync('js/app.js','utf8'); assert.match(app,/translation\.open\(\{ text: passage\.text \}\)/); assert.match(app,/pageshow', refreshTranslationAvailability/);
 console.log('PASS translation availability, external launch contract, canonical text, unavailable and native error propagation');
})().catch(e=>{console.error(e);process.exitCode=1;});
