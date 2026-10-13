import { PLAN_INSTRUCTIONS, decodePlan } from './story-generation.js';
import { parseContent, validateStory, validateExamples, readingPlan, attachReadings, READING_INSTRUCTIONS, SAFEGUARD_VERSION } from './learning-validation.js';

// Checkpoints are user data. Valid stage results are durable before release;
// the final application is idempotent via operationId on saved records.
export function createPipeline({ records, persist, ai, apply, changed = () => {} }) {
  let busy = false;
  const save = () => { persist(records); changed(); };
  const validate = op => op.kind === 'examples' ? validateExamples(op.prose, op.language) : validateStory(op.prose, op.language, op.length);
  async function release(op) {
    if (!op.request) return;
    try { await ai.acknowledge(op.request.id); }
    catch (error) { if (error.code !== 'not_found') throw error; }
    op.request = null; save();
  }
  async function checkCancelled(op) {
    if (!op.cancelRequested) return;
    if (op.request && !op.request.completed && !op.request.cancelled) {
      try { await ai.cancel(op.request.id); } catch (error) { if (error.code !== 'not_found' && !/not found|unknown request/i.test(error.message)) throw error; }
      op.request.cancelled=true;
    }
    if (op.request && !op.request.completed) { op.request.completed=true; op.request.invalid=true; save(); await release(op); }
    throw new Error('Request cancelled. Resume to explicitly retry, or discard this attempt.');
  }
  return {
    records,
    get busy() { return busy; },
    create(spec) {
      if (busy || records.length) throw new Error('Resume or discard the pending generation before starting another.');
      const op = { ...JSON.parse(JSON.stringify(spec)), id:crypto.randomUUID(), createdAt:new Date().toISOString(), safeguardVersion:SAFEGUARD_VERSION, stage:spec.planned ? 'plan' : 'prose', request:null };
      records.push(op);
      try { save(); } catch (error) { records.pop(); throw error; }
      return op;
    },
    async run(op) {
      if (busy) throw new Error('A generation is already running.');
      busy=true; op.error=''; op.cancelRequested=false; changed();
      try {
        // Also retries failed checkpoint writes before touching inference.
        save();
        if (op.request?.completed) await release(op);
        while (['plan','prose','readings'].includes(op.stage)) {
          await checkCancelled(op);
          const stage = op.stage;
          if (stage === 'readings' && !readingPlan(op.prose,op.kind).spans.length) {
            op.result=attachReadings(validate(op),readingPlan(op.prose,op.kind),{readings:[]},op.kind); op.stage='ready'; save(); break;
          }
          const input = stage === 'plan' ? {kind:'language-plan',...op.input} : stage === 'prose' ? {kind:op.kind,...op.input,languagePlan:op.plan} : {kind:'readings',languageCode:'ja',spans:readingPlan(op.prose,op.kind).spans};
          const instructions = stage === 'plan' ? PLAN_INSTRUCTIONS : stage === 'prose' ? op.instructions : READING_INSTRUCTIONS;
          if (!op.request) {
            const id = await ai.start({providerId:op.config.providerId,model:op.config.model,reasoningEffort:op.config.reasoning || undefined,instructions,input:JSON.stringify(input)});
            op.request={id,stage,completed:false}; save();
          }
          await checkCancelled(op);
          let response;
          try { const raw = await ai.wait(op.request.id); await checkCancelled(op); response = stage === 'plan' ? decodePlan(raw,op.language) : parseContent(raw); }
          catch (error) {
            if (op.request) { op.request.completed=true; op.request.invalid=true; save(); await release(op); } throw error;
          }
          let content;
          try {
            content = stage === 'plan' ? response : stage === 'prose' ? (op.kind === 'examples' ? validateExamples(response,op.language) : validateStory(response,op.language,op.length)) : attachReadings(validate(op),readingPlan(op.prose,op.kind),response,op.kind);
          } catch (error) {
            if (op.request) { op.request.completed=true; op.request.invalid=true; save(); await release(op); } throw error;
          }
          if (stage === 'plan') { op.plan=content; op.stage='prose'; }
          else if (stage === 'prose') {
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
          await apply(op); // Must persist final content, checking operationId first.
          op.stage='applied'; save();
        }
        records.splice(records.indexOf(op),1);
        try { save(); } catch (error) { records.push(op); throw error; }
        return op.result;
      } catch (error) {
        op.error=error.message;
        try { save(); } catch { /* Preserve the in-memory result and request for explicit retry. */ }
        throw error;
      } finally { busy=false; changed(); }
    },
    async cancel() {
      const op=records[0]; if (!op || !busy) return;
      op.cancelRequested=true; save();
      if (op.request && !op.request.completed && !op.request.cancelled) {
        try { await ai.cancel(op.request.id); op.request.cancelled=true; }
        catch (error) { if (error.code !== 'not_found' && !/not found|unknown request/i.test(error.message)) { op.cancelRequested=false; save(); throw error; } }
      }
    },
    async discard(op) {
      if (busy) throw new Error('Cancel the active request before discarding.');
      // Persist completed content before release even when choosing Discard.
      save();
      if (op.request) {
        if (!op.request.completed) {
          try { await ai.cancel(op.request.id); } catch (error) { if (error.code !== 'not_found') throw error; }
        }
        await release(op);
      }
      const index=records.indexOf(op); records.splice(index,1);
      try { save(); } catch (error) { records.splice(index,0,op); throw error; }
    }
  };
}
