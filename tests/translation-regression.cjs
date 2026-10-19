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
 const app=fs.readFileSync('js/app.js','utf8'); assert.match(app,/translation\.open\(\{ text: passage\.text \}\)/); assert.doesNotMatch(app,/pageshow', refreshTranslationAvailability/);
 console.log('PASS translation availability, external launch contract, canonical text, unavailable and native error propagation');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Execute the actual toolbar/controller code with deterministic bridge promises.
(async () => {
 const app = fs.readFileSync('js/app.js', 'utf8');
 const buttons = Object.fromEntries(['selection-toolbar', 'selection-translate', 'selection-speak'].map(id => [id, {
   hidden: true, disabled: false, style: {}, classList: {add(){},remove(){}},
   addEventListener(type, fn) { this[type] = fn; }
 }]));
 const events = {}, checks = [], launches = [], messages = [];
 let passage = {text:'大学', start:0, end:2, storyId:'s', chapterId:'c', versionId:'v', rect:{left:10,top:100}};
 const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
 const c = {document:{hidden:false,addEventListener(type,fn){events[type]=fn;}}, window:{innerWidth:400},
   state:{readerSelection:null}, positionSelectionToolbar(){}, $:id=>buttons[id], selectedPassage:()=>passage, closeWordNote(){}, sourceChooser:{close(){}},
   speech:{available:true}, toast:message=>messages.push(message),
   translation:{availability(){const d=deferred();checks.push(d);return d.promise;},open(options){const d=deferred();d.options=options;launches.push(d);return d.promise;}}
 };
 vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('function showSelectionToolbar()'),app.indexOf("window.addEventListener('resize'",app.indexOf('function showSelectionToolbar()'))),c);
 const clickStart=app.indexOf("$('selection-translate').addEventListener('click'");
 vm.runInContext(app.slice(clickStart,app.indexOf("$('selection-speak').addEventListener",clickStart)),c);
 const flush=async()=>{await Promise.resolve();await Promise.resolve();};
 const button=buttons['selection-translate'];
 assert.equal(checks.length,0,'no startup check');
 c.showSelectionToolbar();assert.equal(button.disabled,true);assert.equal(checks.length,1);
 c.showSelectionToolbar();assert.equal(checks.length,1,'unchanged selection deduplicated');
 checks[0].resolve({available:true});await flush();assert.equal(button.disabled,false);
 for(let i=0;i<20;i++) {
   const run=button.click();assert.equal(button.disabled,true);
   await button.click();assert.equal(launches.length,i+1,'duplicate launch suppressed');
   assert.equal(launches[i].options.text,'大学');
   c.document.hidden=true;events.visibilitychange();
   launches[i].resolve({opened:true});await run;
   c.document.hidden=false;events.visibilitychange();
   assert.equal(button.disabled,false);assert.equal(checks.length,1,'no return or post-launch check');
 }
 passage={...passage,text:'今日',start:3,end:5};c.showSelectionToolbar();assert.equal(button.disabled,false);
 checks[1].reject(Object.assign(new Error('timeout'),{code:'timeout'}));await flush();assert.equal(button.disabled,false);
 passage={...passage,start:6};c.showSelectionToolbar();
 passage={...passage,start:7};c.showSelectionToolbar();
 checks[3].resolve({available:true});await flush();checks[2].resolve({available:false});await flush();assert.equal(button.disabled,false,'stale negative ignored');
 passage={...passage,start:8};c.showSelectionToolbar();c.document.hidden=true;events.visibilitychange();
 c.document.hidden=false;events.visibilitychange();checks[4].resolve({available:false});await flush();assert.equal(button.disabled,false,'background check invalidated');
 const failed=button.click();launches[20].reject(new Error('Launch failed'));await failed;assert.equal(button.disabled,false);assert.equal(messages.length,1);
 passage={...passage,start:9};c.showSelectionToolbar();checks[5].resolve({available:false});await flush();assert.equal(button.disabled,true);
 passage={...passage,start:10};c.showSelectionToolbar();checks[6].reject(new Error('network'));await flush();assert.equal(button.disabled,true);
 passage={...passage,start:11};c.showSelectionToolbar();checks[7].resolve({available:true});await flush();assert.equal(button.disabled,false);
 console.log('PASS translation selection checks, 20 launches, duplicate prevention, timeouts, stale/background replies and recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});

(async () => {
 const app=fs.readFileSync('js/app.js','utf8'), events={}, button={}, pending=[];
 const c={document:{hidden:false,addEventListener(type,fn){events[type]=fn;}}, $:()=>button,
   translation:{availability(){return new Promise((resolve,reject)=>pending.push({resolve,reject}));}}};
 vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf("let translationAvailability ="),app.indexOf("window.addEventListener('resize'",app.indexOf("let translationAvailability ="))),c);
 assert.equal(pending.length,0);
 const failed=c.refreshTranslationAvailability();pending[0].reject(new Error('timeout'));await failed;
 assert.equal(button.disabled,true,'unknown availability stays disabled after initial failure');
 const retry=c.refreshTranslationAvailability();pending[1].resolve({available:true});await retry;
 assert.equal(button.disabled,false,'later selection check recovers initial failure');
 c.document.hidden=true;events.visibilitychange();await c.refreshTranslationAvailability();
 assert.equal(pending.length,2,'hidden selection does not check');
 console.log('PASS initial availability failure recovery and hidden-page checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
