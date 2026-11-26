// Presentation text for the native "AI request in progress" notification. App² shows it beside the
// host-derived app name. It never feeds prompts, prompt versions or saved records.
// Kept short: the title names the step. It never promises that the whole operation finishes while
// LingoMage is in the background (the web steps between requests run only while Android lets the page run).
const BODY = 'Working now.';
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
  define: 'Writing a vocabulary note',
  summary: 'Preparing story context',
  'memory-compact': 'Condensing story memory'
};

export function aiNotification(kind, stage = 'prose') {
  const title = stage === 'prose' ? (PROSE[kind] || OTHER[kind]) : (STAGES[stage] || OTHER[kind]);
  return { title: title || 'Working on your story', body: BODY };
}
