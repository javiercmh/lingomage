import { failureInfo } from './generation-errors.js';
import { timingEntry } from './generation-timing.js';
import { aiNotification } from './ai-notification.js';
import { decodePlan } from './story-generation.js';
import { PLAN_INSTRUCTIONS, notesInstructions, READING_INSTRUCTIONS } from './prompts.js';
import { parseContent, validateContentSize, validateProse, validateNotes, validateStory, validateExamples, readingPlan, attachReadings, notesParts, noteMinUnits, mergeNoteParts, SAFEGUARD_VERSION } from './learning-validation.js';

// A saved operation can hold several requests: the main one and, for Japanese notes plus readings,
// one per parallel part. Every cancel, release and recovery path walks all of them.
export const requestHolders = op => [op, ...Object.values(op.parallel || {})];
export const pendingRequests = op => requestHolders(op).map(holder => holder.request).filter(Boolean);

// Checkpoints are user data. Valid stage results are durable before release;
// the final application is idempotent via operationId on saved records.
// parallel: run Japanese notes and readings together, and split notes into paragraph parts when
// op.config.noteDensity (Settings → Vocabulary notes: fewer, standard or more; absent means standard) picks the
// notes prompt. op.config.notesParts > 1 (Settings → Split vocabulary notes). The app enables it. At most MAX_RUNNING parts
// run at once. A start the host refuses before any inference (request_in_progress, or App²'s per-app
// start limit as usage_limit) waits for a running part to finish and starts once more; with nothing
// running, the operation stops with saved parts. A provider usage_limit during a request stops new parts
// and sets op.partsOneAtATime, so Resume runs the missing parts one at a time. Nothing retries silently.
// The sequential default keeps offline evaluation request budgets and ordering predictable.
export const MAX_RUNNING = 3;
// Broken replies (code invalid_json: the reply is not JSON at all) are resent automatically, up to
// MAX_BROKEN_RESENDS times per stage or part, when the operation captured config.retryBroken (Settings →
// Advanced → Retry broken replies automatically, on by default). Never silent: every resend calls
// onResend so the app tells the learner, progress shows "retry N of 3", and op.retried counts them.
// After the limit, or for any other validation failure, the operation stops for explicit recovery.
export const MAX_BROKEN_RESENDS = 3;
export const canResendBroken = (op, key, error) => error?.code === 'invalid_json' && op.config.retryBroken === true && (op.retried?.[key] || 0) < MAX_BROKEN_RESENDS;
const markResent = (op, key) => { op.retried = { ...(op.retried || {}), [key]: (op.retried?.[key] || 0) + 1 }; return op.retried[key]; };
const START_REFUSALS = new Set(['request_in_progress', 'usage_limit']);
const isNotesPart = name => name === 'notes' || name.startsWith('notes-');
// Parts for a finished prose stage: legacy single "notes" or "notes-1".."notes-N" with canonical offsets.
export function enrichmentParts(op) {
  const parts = {}, split = notesParts(op.prose.story, Number(op.config.notesParts) || 1, noteMinUnits(op.language));
  if (split.length) split.forEach((part, index) => { parts[`notes-${index + 1}`] = {request:null, done:false, start:part.start, end:part.end}; });
  else parts.notes = {request:null, done:false};
  if (op.language === 'ja') parts.readings = {request:null, done:false};
  return parts;
}
// Vocabulary notes and Japanese readings may use the lighter model saved in op.config.light; the plan and
// the prose always use the main model. A saved operation without `light` uses the main model throughout.
export const LIGHT_STAGES = new Set(['notes','readings']);
export function stageModel(op, stage) {
  const light = LIGHT_STAGES.has(stage) && String(op.config.light?.model || '').trim() ? op.config.light : null;
  return {providerId:op.config.providerId, model:light ? light.model : op.config.model, reasoningEffort:(light ? light.reasoning : op.config.reasoning) || undefined};
}
export function createPipeline({ records, persist, ai, apply, changed = () => {}, onResend = () => {}, parallel = false, now = () => Date.now() }) {
  let busy = false;
  // Requests started by this page. A saved request from an earlier page completes when this page notices,
  // so its timing is approximate (see js/generation-timing.js).
  const startedHere = new WeakSet();
  // Appends one finished attempt to op.timings; the next checkpoint save keeps it. Cancellation records nothing.
  const track = (op, request, stage, part, outcome) => {
    if (!request || typeof request.startedAt !== 'number') return;
    const model = stageModel(op, stage);
    op.timings = [...(Array.isArray(op.timings) ? op.timings : []), timingEntry({stage, part, model:model.model, reasoning:model.reasoningEffort, startedAt:request.startedAt, completedAt:request.completedAt ?? now(), outcome, approximate:!startedHere.has(request)})];
  };
  let phase = '';
  let stopWaiting, stopped, cancellationError;
  const wait = id => Promise.race([ai.wait(id), stopped.then(() => { throw cancelled(); })]);
  const mark = value => { phase=value; };
  const save = () => { const previous=phase; mark('checkpoint'); persist(records); phase=previous; changed(); };
  const cancelled = () => Object.assign(new Error('Generation cancelled.'), {code:'generation_cancelled'});
  const cancelling = new WeakMap();
  const validate = op => op.kind === 'examples' ? validateExamples(op.prose, op.language) : validateStory(op.prose, op.language, op.length);
  async function release(op, holder = op) {
    if (!holder.request) return;
    mark('release');
    try { await ai.acknowledge(holder.request.id); }
    catch (error) { if (error.code !== 'not_found') throw error; }
    holder.request = null; save();
  }
  const releaseAll = async op => { for (const holder of requestHolders(op)) await release(op, holder); };
  async function cancelRequest(request) {
    if (request.completed || request.cancelled) return;
    if (cancelling.has(request)) return cancelling.get(request);
    const task = (async () => {
      mark('cancel');
      try { await ai.cancel(request.id); } catch (error) { if (error.code !== 'not_found') throw error; }
      request.cancelled=true;
    })();
    cancelling.set(request,task);
    try { await task; } finally { cancelling.delete(request); }
  }
  async function checkCancelled(op, holder = op) {
    if (!op.cancelRequested && !op.discardRequested) return;
    if (holder.request) await cancelRequest(holder.request);
    throw cancelled();
  }
  async function discardRecord(op) {
    save();
    for (const request of pendingRequests(op)) {
      await cancelRequest(request);
      if (!request.completed) { request.completed=true; request.invalid=true; save(); }
    }
    await releaseAll(op);
    const index=records.indexOf(op); if (index < 0) return;
    records.splice(index,1);
    try { save(); } catch (error) { records.splice(index,0,op); throw error; }
  }
  // Japanese notes and readings both need only the saved prose, so they run together. Each part keeps
  // its own request and validated content; a failed part never discards a finished one.
  async function runPart(op, name) {
    const part = op.parallel[name];
    if (part.done) return;
    let partPhase = '';
    const fail = error => {
      error.generationFailure = failureInfo(error, name, partPhase);
      return error;
    };
    const invalidate = async () => { if (part.request) { part.request.completed=true; part.request.invalid=true; save(); await release(op, part); } };
    await checkCancelled(op, part);
    const canonical = validateProse(op.prose, op.language), plan = readingPlan(canonical, op.kind), notes = isNotesPart(name);
    if (name === 'readings' && !plan.spans.length) { part.content = attachReadings(canonical, plan, {readings:[]}, op.kind); part.done = true; save(); return; }
    if (!part.request) {
      const focus = notes && Number.isInteger(part.start) ? {part:Number(name.slice(6)), of:Object.keys(op.parallel).filter(isNotesPart).length, text:canonical.story.slice(part.start, part.end)} : null;
      const input = notes ? {...op.input,kind:'notes',languagePlan:op.plan,chapter:canonical,...(focus ? {focus} : {})} : {kind:'readings',languageCode:'ja',spans:plan.spans};
      partPhase='start';
      let id; const startedAt = now();
      try { id = await ai.start({...stageModel(op,notes ? 'notes' : name),instructions:notes ? notesInstructions(op.config.noteDensity) : READING_INSTRUCTIONS,input:JSON.stringify(input),...aiNotification(op.kind,notes ? 'notes' : name)}); }
      catch (error) { if (START_REFUSALS.has(error?.code)) error.startRefused = true; throw fail(error); }
      part.request={id,stage:notes ? 'notes' : name,completed:false,startedAt}; startedHere.add(part.request); save();
    }
    await checkCancelled(op, part);
    let response;
    const stage = notes ? 'notes' : name;
    try { partPhase='wait'; const raw = await wait(part.request.id); part.request.completedAt = now(); await checkCancelled(op, part); response = parseContent(raw); }
    catch (error) {
      if (op.discardRequested) throw error;
      if (error?.code !== 'generation_cancelled') track(op, part.request, stage, name, canResendBroken(op, name, error) ? 'resent' : 'failed');
      if (error?.code === 'usage_limit') { op.partsOneAtATime = true; save(); } // a provider limit: Resume goes one part at a time
      fail(error); await invalidate();
      if (canResendBroken(op, name, error)) { const count = markResent(op, name); save(); onResend(op, name, count); changed(); return runPart(op, name); }
      throw error;
    }
    try {
      partPhase='validation';
      part.content = notes ? validateNotes(response, op.prose, op.language, {requireNotes:!Number.isInteger(part.start)}) : attachReadings(canonical, plan, response, op.kind);
      validateContentSize(part.content);
    } catch (error) { track(op, part.request, stage, name, 'invalid'); fail(error); await invalidate(); throw error; }
    track(op, part.request, stage, name, 'ok');
    part.request.completed=true; part.done=true; save();
    await release(op, part);
  }
  // Runs unfinished parts, at most MAX_RUNNING at once (one after a provider usage_limit). After any
  // failure no new part starts; running parts finish and stay saved, and the first failure is reported.
  async function runParallel(op) {
    const limit = op.partsOneAtATime ? 1 : MAX_RUNNING;
    const queue = Object.keys(op.parallel).filter(name => !op.parallel[name].done), running = new Map();
    let failure = null, held = false;
    const launch = name => {
      const task = runPart(op, name).then(() => null, error => error).then(error => {
        running.delete(name);
        // Refused before any inference: start again only after a running part has finished.
        if (error?.startRefused && !op.parallel[name].request && running.size) { queue.unshift(name); held = true; return; }
        held = false;
        if (error) failure ||= error;
      });
      running.set(name, task);
    };
    while (queue.length || running.size) {
      while (!failure && !held && queue.length && running.size < limit) launch(queue.shift());
      if (!running.size) break;
      await Promise.race(running.values());
    }
    if (failure) throw failure;
    const parts = op.parallel, names = Object.keys(parts), noteNames = names.filter(isNotesPart);
    const notes = noteNames.length === 1 && parts.notes ? parts.notes.content
      : validateNotes({glossary:mergeNoteParts(noteNames.map(name => parts[name].content))}, op.prose, op.language);
    const result = parts.readings ? {...notes, titleSegments:parts.readings.content.titleSegments, storySegments:parts.readings.content.storySegments} : notes;
    validateContentSize(result);
    op.prose = notes; op.result = result;
    op.stage='ready'; op.parallel=null; delete op.partsOneAtATime; save();
  }
  return {
    records,
    get busy() { return busy; },
    create(spec) {
      if (busy || records.length) throw new Error('Resume or discard the pending generation before starting another.');
      const op = { ...JSON.parse(JSON.stringify(spec)), id:crypto.randomUUID(), createdAt:new Date().toISOString(), safeguardVersion:SAFEGUARD_VERSION, stage:spec.planned ? 'plan' : 'prose', request:null, parallel:null };
      records.push(op);
      try { save(); } catch (error) { records.pop(); throw error; }
      return op;
    },
    async run(op) {
      if (busy) throw new Error('A generation is already running.');
      if (!records.includes(op)) throw new Error('This saved operation is no longer pending.');
      busy=true; op.error=''; delete op.failure; phase=''; cancellationError=null; stopped=new Promise(resolve=>{stopWaiting=resolve;}); op.cancelRequested=false; changed();
      try {
        // Also retries failed checkpoint writes before touching inference.
        save();
        if (op.discardRequested) throw cancelled();
        for (const holder of requestHolders(op)) if (holder.request?.completed) await release(op, holder);
        while (['plan','prose','notes','readings','enrich'].includes(op.stage)) {
          if (op.stage === 'enrich') { await runParallel(op); continue; } // each part checks for cancellation itself
          await checkCancelled(op);
          const stage = op.stage;
          if (stage === 'readings' && !readingPlan(op.prose,op.kind).spans.length) {
            op.result=attachReadings(validate(op),readingPlan(op.prose,op.kind),{readings:[]},op.kind); op.stage='ready'; save(); break;
          }
          const input = stage === 'plan' ? {...op.input,kind:'language-plan'} : stage === 'prose' ? {...op.input,kind:op.kind,languagePlan:op.plan} : stage === 'notes' ? {...op.input,kind:'notes',languagePlan:op.plan,chapter:validateProse(op.prose,op.language)} : {kind:'readings',languageCode:'ja',spans:readingPlan(op.prose,op.kind).spans};
          const instructions = stage === 'plan' ? PLAN_INSTRUCTIONS : stage === 'prose' ? op.instructions : stage === 'notes' ? notesInstructions(op.config.noteDensity) : READING_INSTRUCTIONS;
          if (!op.request) {
            mark('start');
            const startedAt = now();
            const id = await ai.start({...stageModel(op,stage),instructions,input:JSON.stringify(input),...aiNotification(op.kind,stage)});
            op.request={id,stage,completed:false,startedAt}; startedHere.add(op.request); save();
          }
          await checkCancelled(op);
          let response;
          try { mark('wait'); const raw = await wait(op.request.id); op.request.completedAt = now(); await checkCancelled(op); response = stage === 'plan' ? decodePlan(raw,op.language) : parseContent(raw); }
          catch (error) {
            if (op.discardRequested) throw error;
            if (error?.code !== 'generation_cancelled') track(op, op.request, stage, stage, canResendBroken(op, stage, error) ? 'resent' : 'failed');
            const failure=failureInfo(error,stage,phase);
            if (op.request) { op.request.completed=true; op.request.invalid=true; save(); await release(op); }
            if (canResendBroken(op, stage, error)) { const count = markResent(op, stage); save(); onResend(op, stage, count); changed(); continue; }
            error.generationFailure=failure; throw error;
          }
          let content;
          mark('validation');
          try {
            content = stage === 'plan' ? response : stage === 'prose' ? (op.kind === 'examples' ? validateExamples(response,op.language) : validateProse(response,op.language)) : stage === 'notes' ? validateNotes(response,op.prose,op.language) : attachReadings(validate(op),readingPlan(op.prose,op.kind),response,op.kind);
            validateContentSize(content);
          } catch (error) {
            if (op.discardRequested) throw error;
            track(op, op.request, stage, stage, 'invalid');
            const failure=failureInfo(error,stage,phase);
            if (op.request) { op.request.completed=true; op.request.invalid=true; save(); await release(op); }
            error.generationFailure=failure; throw error;
          }
          track(op, op.request, stage, stage, 'ok');
          if (stage === 'plan') { op.plan=content; op.stage='prose'; }
          else if (stage === 'prose') {
            op.prose=content;
            if (op.kind !== 'examples') {
              const parts = parallel ? enrichmentParts(op) : null;
              if (parts && Object.keys(parts).length > 1) { op.stage='enrich'; op.parallel=parts; }
              else op.stage='notes';
            } else if (op.language === 'ja') op.stage='readings';
            else { op.result=content; op.stage='ready'; }
          } else if (stage === 'notes') {
            op.prose=content;
            if (op.language === 'ja') op.stage='readings';
            else { op.result=content; op.stage='ready'; }
          } else { op.result=content; op.stage='ready'; }
          op.request.completed=true;
          save(); // A failed write retains content in memory for explicit Save/Resume.
          await release(op);
        }
        await checkCancelled(op);
        if (op.stage === 'ready') {
          mark('apply');
          await apply(op); // Must persist final content, checking operationId first.
          op.stage='applied'; save();
        }
        records.splice(records.indexOf(op),1);
        try { save(); } catch (error) { records.push(op); throw error; }
        return op.result;
      } catch (error) {
        if (op.discardRequested && records.includes(op)) {
          try { if (cancellationError) throw cancellationError; await discardRecord(op); error=cancelled(); }
          catch (cleanupError) { error=cleanupError; }
        }
        if (!records.includes(op)) throw error;
        op.failure=error.generationFailure || failureInfo(error,op.stage,phase);
        op.error=op.failure.message;
        try { save(); } catch { /* Preserve the in-memory result and request for explicit retry. */ }
        throw error;
      } finally { busy=false; changed(); }
    },
    async finishRequest(op) {
      if (busy || !records.includes(op)) return;
      busy=true; changed();
      try { save(); await releaseAll(op); op.error=''; delete op.failure; save(); }
      catch (error) { op.failure=failureInfo(error,op.stage,phase); op.error=op.failure.message; try { save(); } catch {} throw error; }
      finally { busy=false; changed(); }
    },
    async cancel() {
      const op=records[0]; if (!op || !busy || op.discardRequested) return;
      op.discardRequested=true;
      try {
        save();
        for (const request of pendingRequests(op)) await cancelRequest(request);
      } catch (error) { cancellationError=error; throw error; }
      finally { stopWaiting?.(); }
    },
    async discard(op) {
      if (!records.includes(op)) return;
      if (busy) throw new Error('Cancel the active request before discarding.');
      busy=true; op.discardRequested=true; changed();
      try { await discardRecord(op); }
      catch (error) { op.failure=failureInfo(error,op.stage,phase); op.error=op.failure.message; try { save(); } catch {} throw error; }
      finally { busy=false; changed(); }
    }
  };
}
