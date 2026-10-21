// Background work that Android or the operation session did not allow to continue. Local pause
// (background_paused) means the page was hidden and no session was held, so no host call was made.
const BACKGROUND_CODES = new Set(['background_service', 'background_paused', 'session_idle', 'session_timeout', 'session_ended']);
const SAVED = ' Steps that finished earlier are saved.';
const BACKGROUND_REASONS = {
  background_service: `Android could not keep background work running.${SAVED}`,
  background_paused: `LingoMage was in the background when the next step was due, so it did not start.${SAVED}`,
  session_idle: `Background work was released after about 90 seconds without a running step, so it could not continue.${SAVED}`,
  session_timeout: `Background work stopped at a time limit. A step in progress was stopped.${SAVED}`,
  session_ended: `The background session for this operation had ended.${SAVED}`
};

// Store only bounded diagnostics, never request payloads or host identifiers.
export function failureInfo(error, stage, phase = '') {
  const message = String(error?.message || 'Unknown error').replace(/https?:\/\/\S+|Bearer\s+\S+|(?:token|api[_-]?key|authorization|request[_ -]?id|session[_ -]?id|account[_ -]?id)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 1500);
  const code = /^[a-z_]{1,40}$/.test(error?.code || '') ? error.code : '';
  let category = 'internal';
  if (code === 'session_cancelled' || /cancel/i.test(message)) category='cancelled';
  else if (BACKGROUND_CODES.has(code)) category='background';
  else if (phase === 'release') category='release';
  else if (phase === 'checkpoint' || /save|persist|storage|write/i.test(message)) category='storage';
  // not_found also means a wrong owner, an acknowledged request or a reload, so it is never diagnosed as a crash.
  else if (code === 'not_found') category='unavailable';
  else if (/provider|model|connect|Choose a reading level|older app definition|destination|source explanation changed/i.test(message)) category='configuration';
  else if (/AI response|JSON|glossary|reading|kanji|invalid.*output/i.test(message)) category='validation';
  else if (code || /service|network|timeout|fetch/i.test(message)) category='service';
  return {category,stage,phase,code,message};
}
export function recoverySummary(op) {
  const names={create:'Story generation',continue:'Story continuation',rewrite:'Chapter rewrite',examples:'Example generation',explain:'Explanation',initial:'Explanation',detail:'More detail'};
  const stages={plan:'language planning',prose:'writing',notes:'vocabulary notes',readings:'Japanese readings',ready:'saving',applied:'finishing the request',setup:'setup',detail:'more detail',initial:'explanation'};
  if (!op.error) return 'An unfinished request has saved progress. Resume it or discard this attempt.';
  const failure=op.failure || failureInfo(new Error(op.error),op.stage);
  const reason=(failure.category === 'background' && BACKGROUND_REASONS[failure.code]) || {background:`Background work could not continue.${SAVED}`,unavailable:`The request or background session is no longer available. Earlier steps remain saved; Retry runs the unfinished step again.`,service:'The AI service could not complete the request.',validation:'The AI response did not meet the required format or language checks.',storage:'The response or progress could not be saved.',release:'The response is preserved, but the AI request could not be finished.',configuration:failure.message,cancelled:'The request was cancelled.',internal:'An unexpected app error stopped the request.'}[failure.category] || 'The request stopped.';
  const preserved=op.prose ? ' Completed prose is preserved.' : op.result ? ' Completed content is preserved.' : '';
  return `${names[op.kind] || 'Generation'} stopped${stages[op.stage] ? ` during ${stages[op.stage]}` : ''}. ${reason}${preserved}`;
}
export function appendFailureDetails(box, failure) {
  const details=document.createElement('details'); details.className='failure-details';
  const summary=document.createElement('summary'); summary.textContent='Technical details';
  const text=document.createElement('pre'); text.textContent=[failure.stage && `Stage: ${failure.stage}`,failure.phase && `Operation: ${failure.phase}`,failure.code && `Code: ${failure.code}`,failure.message].filter(Boolean).join('\n');
  details.append(summary,text); box.append(details);
}
