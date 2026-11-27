// Settings → AI models: refreshModels from js/generation/model-settings.js, run through its factory with a fake host bridge.
const assert = require('node:assert/strict');
(async()=>{
  const { loadFactory, deps, stubDom, bridge } = await import('./support/factory-harness.mjs');
  const createModelSettings = await loadFactory('js/generation/model-settings.js', 'createModelSettings');
  function fixture(providerId, storedProvider, storedModel, models) {
    let saves = 0;
    const { $ } = stubDom();
    const state = {providerId:storedProvider,model:storedModel,reasoning:'high',models:[]};
    const { refreshModels } = createModelSettings(deps({ $, state, PREFERRED_MODEL:'preferred', trySaveSettings:()=>{saves++;return true;} }));
    // The host exposes one connected provider and its models.
    const refresh = async () => {
      Object.assign(bridge.ai, { available:true, providers:async()=>({providers:[{id:providerId,connected:true}]}), models:async id=>{assert.equal(id,providerId);return {models};} });
      await refreshModels();
    };
    return {refresh,state,$,saves:()=>saves};
  }
  const switched=fixture('openrouter','chatgpt','same',[{id:'same',name:'OpenRouter model',reasoningLevels:[]}]);
  await switched.refresh();
  assert.equal(switched.state.providerId,'openrouter');assert.equal(switched.state.model,'');assert.equal(switched.state.reasoning,'');
  assert.equal(switched.$('model-select').selectedIndex,-1);assert.equal(switched.$('reasoning-select').hidden,true);assert.equal(switched.saves(),1);
  assert.equal(switched.$('model-controls').hidden,false,'the model controls stay visible after a successful refresh');
  const retained=fixture('combined','combined','v1:openrouter:model',[{id:'v1:openrouter:model',name:'OpenRouter · Model',reasoningLevels:[]}]);
  await retained.refresh();assert.equal(retained.state.model,'v1:openrouter:model');
  const missing=fixture('combined','combined','removed',[{id:'new',name:'New model',reasoningLevels:[]}]);
  await missing.refresh();assert.equal(missing.state.model,'');assert.equal(missing.state.reasoning,'');
  console.log('PASS host exposure changes clear stale choices, retain opaque Combined model IDs and require deliberate new selection');
})().catch(e=>{console.error(e);process.exitCode=1;});
