import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const review=JSON.parse(fs.readFileSync('docs/validation/generation-evaluation/semantic-failures.json','utf8'));
assert.equal(new Set(review.cases.map(item=>item.id)).size,review.cases.length);
// The archived pilot output is only in Git history. Shallow or offline checkouts cannot verify it; that is
// reported rather than counted as a pass. Set SEMANTIC_REVIEW_REQUIRE_ARCHIVE=1 to make a missing archive fail.
function archived(source) {
 try {
  execFileSync('git',['cat-file','-e',`${source.commit}^{commit}`],{stdio:'ignore'});
  return JSON.parse(execFileSync('git',['show',`${source.commit}:${source.path}`],{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','ignore']}));
 } catch { return null; }
}
let verified=0,unavailable=0;
for(const item of review.cases){
 assert(item.source.commit && item.source.path && item.source.promptVersion);
 assert(item.originalNote.meaning && item.suspectedError);
 assert(item.sourceExcerpts.length);
 for(const excerpt of item.sourceExcerpts){assert(excerpt.text);assert(Number.isInteger(excerpt.start) && excerpt.start>=0);assert.equal(excerpt.end-excerpt.start,excerpt.text.length);}
 assert(['unreviewed','reviewed'].includes(item.review.status));
 if(item.review.status==='reviewed'){
  assert(item.review.qualification?.trim() && item.review.rationale?.trim());
  assert(['confirmed error','acceptable explanation','unresolved'].includes(item.review.disposition));
 }
 // Traceability only: the recorded excerpts, note and prompt version are what the archive contains. Whether the
 // explanation is linguistically wrong is a human judgement and is not asserted here.
 const source=archived(item.source);
 if(!source){unavailable++;continue;}
 verified++;
 assert.equal(source.promptVersion,item.source.promptVersion,`${item.id}: prompt version differs from the archive`);
 assert.equal(source.input?.languageCode,item.language,`${item.id}: language differs from the archive`);
 const note=source.result?.glossary?.find(entry=>entry.word===item.originalNote.word && entry.meaning===item.originalNote.meaning);
 assert(note,`${item.id}: original note not found in the archive`);
 assert.deepEqual(note.forms,item.originalNote.forms,`${item.id}: note forms differ from the archive`);
 for(const excerpt of item.sourceExcerpts) assert.equal(source.result.story.slice(excerpt.start,excerpt.end),excerpt.text,`${item.id}: excerpt ${excerpt.start}-${excerpt.end} is not in the archived story`);
}
if(unavailable&&process.env.SEMANTIC_REVIEW_REQUIRE_ARCHIVE==='1') assert.fail(`${unavailable} archived source(s) unavailable and SEMANTIC_REVIEW_REQUIRE_ARCHIVE=1`);
console.log(`PASS semantic-review record integrity; excerpts and original notes verified against archived sources for ${verified} case(s)${unavailable?`, archive unavailable for ${unavailable} (shallow or offline checkout: traceability NOT verified)`:''}. No linguistic correctness is asserted; human qualification remains pending and no model requests are made`);
