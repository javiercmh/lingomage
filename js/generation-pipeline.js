import { failureInfo } from './generation-errors.js';
import { aiNotification } from './ai-notification.js';
import { PLAN_INSTRUCTIONS, decodePlan } from './story-generation.js';
import { parseContent, validateContentSize, validateProse, validateNotes, validateStory, validateExamples, readingPlan, attachReadings, NOTES_INSTRUCTIONS, READING_INSTRUCTIONS, SAFEGUARD_VERSION } from './learning-validation.js';

// A saved operation can hold several requests: the main one and, for Japanese notes plus readings,
// one per parallel part. Every cancel, release and recovery path walks all of them.
export const requestHolders = op => [op, ...Object.values(op.parallel || {})];
export const pendingRequests = op => requestHolders(op).map(holder => holder.request).filter(Boolean);

// Checkpoints are user data. Valid stage results are durable before release;
// the final application is idempotent via operationId on saved records.
// parallel: run Japanese notes and readings together. Off in the app: the App² host (and the development
// server) accept one running or unacknowledged request per app, so a second start fails with
// request_in_progress. Enable only once the host accepts concurrent requests from one app.
export function createPipeline({ records, persist, ai, apply, changed = () => {}, parallel = false }) {
  let busy = false;
  let phase = '';
  const mark = value => { phase=value; };
  const save = () => { mark('checkpoint'); persist(records); changed(); };
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
    try { await ai.cancel(request.id); } catch (error) { if (error.code !== 'not_found' && !/not found|unknown request/i.test(error.message)) throw error; }
    request.cancelled=true;
  }
  async function checkCancelled(op, holder = op) {
    if (!op.cancelRequested) return;
    if (holder.request) await cancelRequest(holder.request);
    if (holder.request && !holder.request.completed) { holder.request.completed=true; holder.request.invalid=true; save(); await release(op, holder); }
    throw new Error('Request cancelled. Resume to explicitly retry, or discard this attempt.');
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
    const canonical = validateProse(op.prose, op.language), plan = readingPlan(canonical, op.kind);
    if (name === 'readings' && !plan.spans.length) { part.content = attachReadings(canonical, plan, {readings:[]}, op.kind); part.done = true; save(); return; }
    if (!part.request) {
      const input = name === 'notes' ? {...op.input,kind:'notes',languagePlan:op.plan,chapter:canonical} : {kind:'readings',languageCode:'ja',spans:plan.spans};
      const id = await ai.start({providerId:op.config.providerId,model:op.config.model,reasoningEffort:op.config.reasoning || undefined,instructions:name === 'notes' ? NOTES_INSTRUCTIONS : READING_INSTRUCTIONS,input:JSON.stringify(input),...aiNotification(op.kind,name)});
      part.request={id,stage:name,completed:false}; save();
    }
    await checkCancelled(op, part);
    let response;
    try { partPhase='wait'; const raw = await ai.wait(part.request.id); await checkCancelled(op, part); response = parseContent(raw); }
    catch (error) { fail(error); await invalidate(); throw error; }
    try {
      partPhase='validation';
      part.content = name === 'notes' ? validateNotes(response, op.prose, op.language) : attachReadings(canonical, plan, response, op.kind);
      validateContentSize(part.content);
    } catch (error) { fail(error); await invalidate(); throw error; }
    part.request.completed=true; part.done=true; save();
    await release(op, part);
  }
  async function runParallel(op) {
    const names = Object.keys(op.parallel);
    const settled = await Promise.allSettled(names.map(name => runPart(op, name)));
    const failed = settled.find(item => item.status === 'rejected');
    if (failed) throw failed.reason;
    const {notes, readings} = op.parallel;
    op.prose = notes.content;
    op.result = {...notes.content, titleSegments:readings.content.titleSegments, storySegments:readings.content.storySegments};
    validateContentSize(op.result);
    op.stage='ready'; op.parallel=null; save();
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
      busy=true; op.error=''; delete op.failure; phase=''; op.cancelRequested=false; changed();
      try {
        // Also retries failed checkpoint writes before touching inference.
        save();
        for (const holder of requestHolders(op)) if (holder.request?.completed) await release(op, holder);
        while (['plan','prose','notes','readings','enrich'].includes(op.stage)) {
          if (op.stage === 'enrich') { await runParallel(op); continue; } // each part checks for cancellation itself
          await checkCancelled(op);
          const stage = op.stage;
          if (stage === 'readings' && !readingPlan(op.prose,op.kind).spans.length) {
            op.result=attachReadings(validate(op),readingPlan(op.prose,op.kind),{readings:[]},op.kind); op.stage='ready'; save(); break;
          }
          const input = stage === 'plan' ? {...op.input,kind:'language-plan'} : stage === 'prose' ? {...op.input,kind:op.kind,languagePlan:op.plan} : stage === 'notes' ? {...op.input,kind:'notes',languagePlan:op.plan,chapter:validateProse(op.prose,op.language)} : {kind:'readings',languageCode:'ja',spans:readingPlan(op.prose,op.kind).spans};
          const instructions = stage === 'plan' ? PLAN_INSTRUCTIONS : stage === 'prose' ? op.instructions : stage === 'notes' ? NOTES_INSTRUCTIONS : READING_INSTRUCTIONS;
          if (!op.request) {
            mark('start');
            const id = await ai.start({providerId:op.config.providerId,model:op.config.model,reasoningEffort:op.config.reasoning || undefined,instructions,input:JSON.stringify(input),...aiNotification(op.kind,stage)});
            op.request={id,stage,completed:false}; save();
          }
          await checkCancelled(op);
          let response;
          try { mark('wait'); const raw = await ai.wait(op.request.id); await checkCancelled(op); response = stage === 'plan' ? decodePlan(raw,op.language) : parseContent(raw); }
          catch (error) {
            const failure=failureInfo(error,stage,phase);
            if (op.request) { op.request.completed=true; op.request.invalid=true; save(); await release(op); }
            error.generationFailure=failure; throw error;
          }
          let content;
          mark('validation');
          try {
            content = stage === 'plan' ? response : stage === 'prose' ? (op.kind === 'examples' ? validateExamples(response,op.language) : validateProse(response,op.language)) : stage === 'notes' ? validateNotes(response,op.prose,op.language) : attachReadings(validate(op),readingPlan(op.prose,op.kind),response,op.kind);
            validateContentSize(content);
          } catch (error) {
            const failure=failureInfo(error,stage,phase);
            if (op.request) { op.request.completed=true; op.request.invalid=true; save(); await release(op); }
            error.generationFailure=failure; throw error;
          }
          if (stage === 'plan') { op.plan=content; op.stage='prose'; }
          else if (stage === 'prose') {
            op.prose=content;
            if (op.kind !== 'examples') {
              if (parallel && op.language === 'ja') { op.stage='enrich'; op.parallel={notes:{request:null,done:false},readings:{request:null,done:false}}; }
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
      const op=records[0]; if (!op || !busy) return;
      op.cancelRequested=true; save();
      try { for (const request of pendingRequests(op)) await cancelRequest(request); }
      catch (error) { op.cancelRequested=false; save(); throw error; }
    },
    async discard(op) {
      if (!records.includes(op)) return;
      if (busy) throw new Error('Cancel the active request before discarding.');
      // Persist completed content before release even when choosing Discard.
      save();
      for (const request of pendingRequests(op)) {
        if (!request.completed) {
          try { await ai.cancel(request.id); } catch (error) { if (error.code !== 'not_found') throw error; }
        }
      }
      await releaseAll(op);
      const index=records.indexOf(op); if (index < 0) return; records.splice(index,1);
      try { save(); } catch (error) { records.splice(index,0,op); throw error; }
    }
  };
}
