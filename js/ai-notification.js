// Presentation text for the native "AI request in progress" notification. App² shows it beside the
// host-derived app name. It never feeds prompts, prompt versions or saved records.
// Honest about the limits: a running request continues natively, but the web steps between requests
// run only while Android lets the page run, so a multi-step operation may wait for the learner.
const BODY = 'Working now. Reopen LingoMage if it pauses between steps.';
const STAGES = {
  plan: 'Planning your story',
  notes: 'Writing study notes',
  readings: 'Adding readings'
};
const PROSE = {
  create: 'Writing your story',
  continue: 'Writing the next chapter',
  rewrite: 'Rewriting this chapter',
  examples: 'Writing examples'
};
const OTHER = {
  explain: 'Explaining your selection',
  summary: 'Preparing story context'
};

export function aiNotification(kind, stage = 'prose') {
  const title = stage === 'prose' ? (PROSE[kind] || OTHER[kind]) : (STAGES[stage] || OTHER[kind]);
  return { title: title || 'Working on your story', body: BODY };
}
