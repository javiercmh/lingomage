const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js', 'utf8');
const start = source.indexOf('async function refreshModels()');
const end = source.indexOf("$('language-settings-open')", start);
const refreshSource = source.slice(start, end);
function fixture(providerId, storedProvider, storedModel, models) {
  const fields = new Map(); let saves = 0;
  const $ = id => {
    if (!fields.has(id)) fields.set(id, {hidden:false,disabled:false,value:'',textContent:'',selectedIndex:0,append(){},dispatchEvent(){},querySelector(){return {textContent:''}}});
    return fields.get(id);
  };
  const state = {providerId:storedProvider,model:storedModel,reasoning:'high',models:[]};
  const context = vm.createContext({state,$,modelRefreshVersion:0,ai:{available:true,providers:async()=>({providers:[{id:providerId,connected:true}]}),models:async id=>{assert.equal(id,providerId);return {models};}},document:{createElement:()=>({})},PREFERRED_MODEL:'preferred',trySaveSettings:()=>{saves++;return true;},Event:class{}});
  vm.runInContext(refreshSource, context);
  return {context,state,$,saves:()=>saves};
}
(async()=>{
  const switched=fixture('openrouter','chatgpt','same',[{id:'same',name:'OpenRouter model',reasoningLevels:[]}]);
  await switched.context.refreshModels();
  assert.equal(switched.state.providerId,'openrouter');assert.equal(switched.state.model,'');assert.equal(switched.state.reasoning,'');
  assert.equal(switched.$('model-select').selectedIndex,-1);assert.equal(switched.$('reasoning-select').hidden,true);assert.equal(switched.saves(),1);
  const retained=fixture('combined','combined','v1:openrouter:model',[{id:'v1:openrouter:model',name:'OpenRouter · Model',reasoningLevels:[]}]);
  await retained.context.refreshModels();assert.equal(retained.state.model,'v1:openrouter:model');
  const missing=fixture('combined','combined','removed',[{id:'new',name:'New model',reasoningLevels:[]}]);
  await missing.context.refreshModels();assert.equal(missing.state.model,'');assert.equal(missing.state.reasoning,'');
  console.log('PASS host exposure changes clear stale choices, retain opaque Combined model IDs and require deliberate new selection');
})().catch(e=>{console.error(e);process.exitCode=1;});
