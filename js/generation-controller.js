import { MEMORY_VERSION } from './story-memory.js';
import { markStoryActivity } from './library-activity.js';
import { summarizeTimings } from './generation-timing.js';
import { stageModel } from './generation-pipeline.js';
// Final application remains idempotent by operation ID and rolls back failed saves.
export function createGenerationController({state, normalizeChapters, ensureStoryPaths, persistReaderStory, savedFollowUps}) {
  // What each step took (js/generation-timing.js); absent when nothing was measured, as in older records.
  const timingField = op => { const timing = summarizeTimings(op); return timing ? {timing} : {}; };
  function operationProvenance(op) {
  return {operationId:op.id, promptVersion:op.promptVersion, safeguardVersion:op.safeguardVersion, difficulty:op.input.difficulty,framework:op.input.framework,scope:op.input.scope,languagePlan:op.plan,profileVersion:op.profileVersion,learnerContext:op.input.learnerProfile || {readingStartingPoint:op.input.readingStartingPoint,readingSelfReport:op.input.readingSelfReport,languageExpectations:op.input.languageExpectations}, providerId:op.config.providerId, model:op.config.model, ...(op.config.noteDensity ? {noteDensity:op.config.noteDensity} : {}), ...(String(op.config.light?.model || '').trim() ? {lightModel:op.config.light.model} : {}), createdAt:op.createdAt, ...timingField(op)};
}
function applyContentOperation(op) {
  const provenance=operationProvenance(op), result=op.result;
  if (op.kind === 'create') {
    if (state.stories.some(s=>s.operationId === op.id)) return;
    const version={id:`version-${op.id}`,...result,...provenance};
    const {timing, ...storyProvenance}=provenance; // timing belongs to the version only
    const story={id:`story-${op.id}`,language:op.language,difficulty:op.input.difficulty,readingStartingPoint:op.input.readingStartingPoint,learnerKnowledge:op.input.learnerKnowledge,languageExpectations:op.input.languageExpectations,readingSelfReport:op.input.readingSelfReport,profileVersion:op.profileVersion,...result,...storyProvenance,topic:op.input.topic,practice:op.input.practice,activeVersionId:version.id,chapters:[{id:`chapter-${op.id}`,activeVersionId:version.id,versions:[version],prompt:'',help:[]}]};
    // The initial save time ranks the story, also after a resumed or recovered request; createdAt stays the operation start.
    markStoryActivity(story,new Date(),'created'); // a failed save discards this object, so there is nothing to undo
    persistReaderStory(story); state.current=story; return;
  }
  const story=state.stories.find(s=>s.id === op.target.storyId);
  if (!story) throw new Error('The destination story no longer exists. Discard this operation.');
  if (story.chapters?.some(c=>c.versions.some(v=>v.operationId === op.id) || c.help?.some(h=>h.followUps?.some(f=>f.operationId === op.id)))) return;
  const before=JSON.parse(JSON.stringify(story)), candidate=JSON.parse(JSON.stringify(story));
  candidate.chapters=normalizeChapters(candidate); ensureStoryPaths(candidate);
  if (op.kind === 'notes') {
    // Rebuild vocabulary notes: the version's generated notes are replaced; notes the learner added with Define
    // stay. Text, readings, explanations and provenance of the version are unchanged; notesRebuild records the run.
    const version=candidate.chapters.find(c=>c.id === op.target.chapterId)?.versions.find(v=>v.id === op.target.versionId);
    if (!version) throw new Error('The chapter no longer exists. Discard this operation.');
    if (version.notesRebuild?.operationId === op.id) return;
    if (version.story !== op.prose.story || version.title !== op.prose.title) throw new Error('The chapter text changed. Discard this operation.');
    const learnerNotes=(version.glossary || []).filter(note=>note.addedBy === 'learner');
    version.glossary=[...result.glossary,...learnerNotes];
    version.notesRebuild={operationId:op.id,promptVersion:op.promptVersion,safeguardVersion:op.safeguardVersion,noteDensity:op.config.noteDensity || 'standard',providerId:op.config.providerId,model:stageModel(op,'notes').model,createdAt:op.createdAt,savedAt:new Date().toISOString(),...timingField(op)};
  } else if (op.kind === 'examples') {
    const chapter=candidate.chapters.find(c=>c.id === op.target.chapterId), version=chapter?.versions.find(v=>v.id === op.target.versionId);
    const help=chapter?.help?.find(h=>h.id === op.target.helpId);
    if (!help || !version || version.story.slice(op.target.start,op.target.end) !== op.target.passage) throw new Error('The source explanation changed. Discard this operation.');
    const item={id:`help-${op.id}`,kind:'explain',action:'examples',passage:op.target.passage,start:op.target.start,end:op.target.end,chapterId:chapter.id,versionId:version.id,examples:result.examples,text:'',followUp:op.input.followUp || '',profile:op.input.profile,...provenance};
    help.followUps=[...savedFollowUps(help),item];
  } else {
    const path=candidate.paths.find(p=>p.id === op.target.pathId);
    if (!path || JSON.stringify(path.entries) !== JSON.stringify(op.target.entries)) throw new Error('The destination path changed. Discard this operation.');
    const chapter=candidate.chapters.find(c=>c.id === op.target.chapterId);
    const version={id:`version-${op.id}`,...result,...provenance,prompt:op.input.prompt,sourceVersionId:op.target.sourceVersionId,contextLineage:op.kind === 'continue' ? op.target.entries : op.target.entries.slice(0,op.target.index),memoryVersion:MEMORY_VERSION,learnerContext:op.input.learnerProfile};
    if (op.kind === 'continue') {
      const next={id:`chapter-${op.id}`,activeVersionId:version.id,versions:[version],prompt:op.input.prompt,basedOnVersionId:op.target.sourceVersionId,learnerContext:op.input.learnerProfile,createdAt:op.createdAt,help:[]};
      candidate.chapters.push(next); path.entries.push({chapterId:next.id,versionId:version.id}); // the learner's selected path is not changed by a finished Continue
    } else {
      if (!chapter) throw new Error('The destination chapter no longer exists.');
      chapter.versions.push(version);
      const alternate={id:`path-${op.id}`,name:`Alternate ${candidate.nextAlternateNumber++}`,forkChapter:op.target.index+1,parentPathId:path.id,parentPathName:path.name,uncertain:path.uncertain,entries:[...op.target.entries.slice(0,op.target.index),{chapterId:chapter.id,versionId:version.id}]};
      candidate.paths.push(alternate); candidate.activePathId=alternate.id;
    }
  }
  markStoryActivity(candidate); // saved by the single write below; the `before` copy restores the previous value on failure
  Object.assign(story,candidate);
  try { persistReaderStory(story); }
  catch (error) { for (const key of Object.keys(story)) delete story[key]; Object.assign(story,before); throw error; }
}

  return {operationProvenance, applyContentOperation};
}
