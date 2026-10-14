import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'notes-runner-'));
const manifest=JSON.parse(fs.readFileSync('docs/validation/generation-evaluation/contextual-notes/corpus.json'));
manifest.cases=manifest.cases.slice(0,1);manifest.focused=[];fs.writeFileSync(path.join(directory,'corpus.json'),JSON.stringify(manifest));
let starts=0,failRelease=true,valid=false;const requests=new Map();
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/__bridge/info'){res.end(JSON.stringify({liveAi:false}));return;}
 let body='';for await(const chunk of req)body+=chunk;const command=JSON.parse(body);
 if(command.action==='models')res.end(JSON.stringify({models:[{id:'development-mock',reasoningLevels:[]}]}));
 else if(command.action==='start'){const input=JSON.parse(command.data.input),word=input.chapter.story.match(/\p{L}+/u)[0],id='request-'+(++starts);requests.set(id,{polls:0,raw:JSON.stringify({glossary:[{word:valid?word:'UnattestedFixture',meaning:'English contextual note',forms:[valid?word:'UnattestedFixture']}]})});res.end(JSON.stringify(id));}
 else if(command.action==='result'){const r=requests.get(command.requestId);res.end(JSON.stringify(r.polls++?r.raw:null));}
 else if(command.action==='acknowledge'){if(failRelease){failRelease=false;res.end(JSON.stringify({error:{code:'fixture_release',message:'fixture release failure'}}));}else res.end('{}');}
 else res.end('{}');
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const endpoint='http://localhost:'+server.address().port;
async function run(...args){return await new Promise(resolve=>{const child=spawn(process.execPath,['scripts/compare-notes.mjs','--output',directory,'--endpoint',endpoint,...args],{stdio:'pipe'});let output='';child.stderr.on('data',b=>output+=b);child.on('close',code=>resolve({code,output}));});}
try{
 const first=await run('--run','--mock','--limit','1');assert.equal(first.code,1);assert.equal(starts,1);
 const currentFile=path.join(directory,manifest.cases[0].id+'-current.json');let record=JSON.parse(fs.readFileSync(currentFile));assert.ok(record.raw);assert.equal(record.delivery.droppedNotes,1);assert.equal(record.released,false);
 const resumed=await run('--run','--mock','--retry','--limit','1');assert.equal(resumed.code,0,resumed.output);assert.equal(starts,1);record=JSON.parse(fs.readFileSync(currentFile));assert.equal(record.released,true);
 const skipped=await run('--run','--mock','--limit','0');assert.equal(skipped.code,0);assert.equal(starts,1);
 valid=true;const retried=await run('--run','--mock','--retry','--limit','2','--review-pack','--report');assert.equal(retried.code,0,retried.output);assert.equal(starts,3);
 record=JSON.parse(fs.readFileSync(currentFile));assert.equal(record.completed,true);assert.equal(record.attempts.find(a=>a.kind==='failed attempt').delivery.droppedNotes,1);assert.equal(record.released,true);
 const complete=await run('--run','--mock');assert.equal(complete.code,0);assert.equal(starts,3);
 const review=JSON.parse(fs.readFileSync(path.join(directory,'reviews',manifest.cases[0].id+'.json')));assert.equal(review.mapping,undefined);assert.equal(review.input.samples.length,2);assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'acceptance.json'))).status,'not accepted');
 console.log('PASS notes runner: polling, durable raw/repair, release recovery without inference, explicit retry history, completed reuse and anonymous review packs');
}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
