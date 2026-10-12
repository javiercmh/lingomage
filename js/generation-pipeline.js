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
  return {
    records,
    get busy() { return busy; },
    create(spec) {
      if (busy || records.length) throw new Error('Resume or discard the pending generation before starting another.');
      const op = { ...JSON.parse(JSON.stringify(spec)), id:crypto.randomUUID(), createdAt:new Date().toISOString(), safeguardVersion:SAFEGUARD_VERSION, stage:'prose', request:null };
      records.push(op);
      try { save(); } catch (error) { records.pop(); throw error; }
      return op;
    },
    async run(op) {
      if (busy) throw new Error('A generation is already running.');
      busy=true; op.error=''; changed();
      try {
        // Also retries failed checkpoint writes before touching inference.
        save();
        if (op.request?.completed) await release(op);
        while (['prose','readings'].includes(op.stage)) {
          const stage = op.stage;
          if (stage === 'readings' && !readingPlan(op.prose,op.kind).spans.length) {
            op.result=attachReadings(validate(op),readingPlan(op.prose,op.kind),{readings:[]},op.kind); op.stage='ready'; save(); break;
          }
          const input = stage === 'prose' ? {kind:op.kind,...op.input} : {kind:'readings',languageCode:'ja',spans:readingPlan(op.prose,op.kind).spans};
          const instructions = stage === 'prose' ? op.instructions : READING_INSTRUCTIONS;
          if (!op.request) {
            const id = await ai.start({providerId:op.config.providerId,model:op.config.model,reasoningEffort:op.config.reasoning || undefined,instructions,input:JSON.stringify(input)});
            op.request={id,stage,completed:false}; save();
          }
          let response;
          try { response = parseContent(await ai.wait(op.request.id)); }
          catch (error) {
            op.request.completed=true; op.request.invalid=true; save(); await release(op); throw error;
          }
          let content;
          try {
            content = stage === 'prose' ? (op.kind === 'examples' ? validateExamples(response,op.language) : validateStory(response,op.language,op.length)) : attachReadings(validate(op),readingPlan(op.prose,op.kind),response,op.kind);
          } catch (error) {
            op.request.completed=true; op.request.invalid=true; save(); await release(op); throw error;
          }
          if (stage === 'prose') {
            op.prose=content;
            if (op.language === 'ja') op.stage='readings';
            else { op.result=content; op.stage='ready'; }
          } else { op.result=content; op.stage='ready'; }
          op.request.completed=true;
          save(); // A failed write retains content in memory for explicit Save/Resume.
          await release(op);
        }
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
