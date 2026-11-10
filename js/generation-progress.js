// Presentation of a saved operation's stages for the waiting screen. It reads the checkpoint record
// and never changes it, so the checklist cannot disagree with what the pipeline will actually do.
const PROSE_LABEL = { create: 'Writing your story', continue: 'Writing the next chapter', rewrite: 'Rewriting the chapter', examples: 'Writing examples' };
const ORDER = ['context', 'plan', 'prose', 'notes', 'readings'];

// Continue and rewrites after chapter 1 first summarize the earlier chapters into story memory (separate
// summary requests made before the operation exists). A saved operation has always finished that step.
export function hasStoryContext(op) { return op.kind === 'continue' || (op.kind === 'rewrite' && op.target?.index > 0); }

// Steps in display order; "notes" and "readings" are the parallel pair for Japanese.
// A provisional record with stage "context" describes the story-memory step before the operation is created.
export function progressSteps(op) {
  const steps = [];
  if (hasStoryContext(op)) steps.push({ key: 'context', label: 'Story context' });
  if (op.kind !== 'examples') steps.push({ key: 'plan', label: 'Planning language' });
  steps.push({ key: 'prose', label: PROSE_LABEL[op.kind] || 'Writing' });
  if (op.kind !== 'examples') steps.push({ key: 'notes', label: 'Vocabulary notes' });
  if (op.language === 'ja') steps.push({ key: 'readings', label: 'Kanji readings' });
  const done = new Set();
  if (['ready', 'applied'].includes(op.stage)) steps.forEach(step => done.add(step.key));
  else if (op.stage === 'enrich') {
    ['context', 'plan', 'prose'].forEach(key => done.add(key));
    for (const [name, part] of Object.entries(op.parallel || {})) if (part.done) done.add(name);
  } else {
    const at = ORDER.indexOf(op.stage);
    ORDER.forEach((key, index) => { if (index < at) done.add(key); });
  }
  let activeAssigned = false;
  return steps.map(step => {
    if (done.has(step.key)) return { ...step, state: 'done' };
    // Parallel parts are all active while any is unfinished; otherwise only the first unfinished step is.
    const parallelPart = op.stage === 'enrich' && ['notes', 'readings'].includes(step.key);
    if (parallelPart || !activeAssigned) { activeAssigned = true; return { ...step, state: 'active' }; }
    return { ...step, state: 'pending' };
  });
}

// "Step 2 of 4 · Writing your story" for single-line status bars; parallel steps count as one.
export function progressSummary(op) {
  const steps = progressSteps(op), finished = steps.filter(step => step.state === 'done').length;
  const active = steps.filter(step => step.state === 'active');
  const label = active.map(step => step.label).join(' and ').replace(/ and ([A-Z])/, (_, c) => ' and ' + c.toLowerCase());
  return { done: finished, total: steps.length, steps, text: steps.length === 1 ? (label || 'Finishing') : `Step ${Math.min(finished + 1, steps.length)} of ${steps.length} · ${label || 'Finishing'}` };
}
