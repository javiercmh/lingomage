import assert from 'node:assert/strict';
import {createReaderPanels} from '../js/reader-panels.js';
const targets=new Map();
function target(id){
 if(!targets.has(id))targets.set(id,{hidden:true,handlers:new Map(),setAttribute(){},focus(){},addEventListener(type,handler){if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(handler);},removeEventListener(type,handler){this.handlers.get(type)?.delete(handler);}});
 return targets.get(id);
}
const document=target('document');
const panels=createReaderPanels({state:{},$:target,document,window:{},getComputedStyle:()=>({}),readerPanel:()=>({}),closeWordNote(){},persistSettings(){},toast(){}});
const count=()=>[...targets.values()].reduce((total,item)=>total+[...item.handlers.values()].reduce((n,set)=>n+set.size,0),0);
panels.initialize();const installed=count();assert(installed>0);
panels.initialize();assert.equal(count(),installed,'initialization does not duplicate listeners');
target('reader-preferences-panel').hidden=false;panels.dispose();assert.equal(count(),0);assert(target('reader-preferences-panel').hidden);
panels.dispose();assert.equal(count(),0,'disposal is idempotent');
console.log('PASS reader panel lifecycle: repeated initialization replaces listeners and disposal removes listeners and closes panels');
