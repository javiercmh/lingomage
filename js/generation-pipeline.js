import { failureInfo } from './generation-errors.js';
import { timingEntry } from './generation-timing.js';
import { aiNotification } from './ai-notification.js';
import { decodePlan } from './story-generation.js';
import { PLAN_INSTRUCTIONS, notesInstructions, READING_INSTRUCTIONS } from './prompts.js';
import { parseContent, validateContentSize, validateProse, validateNotes, validateStory, validateExamples, readingPlan, attachReadings, attachReadingMap, validateReadings, readingSpansFor, MAX_NOTE_PARTS, notesParts, noteMinUnits, noteTargetUnits, mergeNoteParts, SAFEGUARD_VERSION } from './learning-validation.js';

// A saved operation can hold several requests: the main one and, for Japanese notes plus readings,
// one per parallel part. Every cancel, release and recovery path walks all of them.
export const requestHolders = op => [op, ...Object.values(op.parallel || {})];
export const pendingRequests = op => requestHolders(op).map(holder => holder.request).filter(Boolean);

// Checkpoints are user data. Valid stage results are durable before release;
// the final application is idempotent via operationId on saved records.
// parallel: run Japanese notes and readings together, and split notes into paragraph parts when
// op.config.noteDensity (Settings → Vocabulary notes: fewer, standard or more; absent means standard) picks the
// notes prompt. op.config.notesParts > 1 (Settings → Split vocabulary notes). The app enables it. At most
// op.config.parallelLimit parts run at once (Settings → Allow concurrent requests: MAX_PARALLEL, or 1 when off).
// App² sets no request limit of its own. A start refused before any inference (request_in_progress or
// usage_limit) waits for a running part to finish and starts once more; with nothing running, the operation
// stops with saved parts. A provider usage_limit during a request stops new parts and sets
// op.partsOneAtATime, so Resume runs the missing parts one at a time. Nothing retries silently.
// The sequential default keeps offline evaluation request budgets and ordering predictable.
export const MAX_PARALLEL = 6;
// Operations saved before the setting existed captured no parallelLimit and keep their old three at a time.
const LEGACY_PARALLEL = 3;
export const parallelLimitFor = allowConcurrent => allowConcurrent === false ? 1 : MAX_PARALLEL;
// Failed steps are resent automatically, up to MAX_BROKEN_RESENDS times per stage or part, when the operation
// captured config.retryBroken (Settings → Advanced → Retry failed steps automatically, on by default): unreadable
// or invalid replies, provider and network errors, timeouts and failed starts. Never after a rate limit
// (usage_limit), and never for errors a resend cannot fix or the learner chose (cancellation, permission, sign-in,
// background or session limits, model or request configuration). Never silent: every resend calls onResend so the
// app tells the learner, progress shows "retry N of 3", and op.retried counts them. After the limit the operation
// stops for explicit recovery. (The names keep "broken" from when only non-JSON replies were resent.)
export const MAX_BROKEN_RESENDS = 3;
const NO_RESEND = new Set(['usage_limit','generation_cancelled','permission','authentication','background_paused','background_service','request_in_progress','session_ended','session_cancelled','session_idle','session_timeout','models','invalid_request']);
export const resendable = error => !NO_RESEND.has(error?.code);
export const canResendBroken = (op, key, error) => resendable(error) && !op.cancelRequested && !op.discardRequested && op.config.retryBroken === true && (op.retried?.[key] || 0) < MAX_BROKEN_RESENDS;
const markResent = (op, key) => { op.retried = { ...(op.retried || {}), [key]: (op.retried?.[key] || 0) + 1 }; return op.retried[key]; };
const START_REFUSALS = new Set(['request_in_progress', 'usage_limit']);
const isNotesPart = name => name === 'notes' || name.startsWith('notes-');
export const isReadingsPart = name => name === 'readings' || name.startsWith('readings-');
const readingNames = op => Object.keys(op.parallel || {}).filter(isReadingsPart);
// Split readings parts in chapter order, rebuilt from their saved offsets.
const readingRanges = op => readingNames(op).filter(name => name !== 'readings').sort((a, b) => Number(a.slice(9)) - Number(b.slice(9))).map(name => op.parallel[name]);
// Parts for a finished prose stage: legacy single "notes" or "notes-1".."notes-N" with canonical offsets.
// A notes rebuild (kind "notes") keeps the version's saved readings, so it has no readings part.
// A progressive operation gets a short lead part (the opening paragraph) so the chapter can open once it has
// notes. Japanese readings get blocks of their own (readingBlocks): readings-1 matches notes-1, the rest are smaller.
// All parts are ordered by chapter position (notes first on a tie), so nearby notes and furigana arrive together.
const PROGRESSIVE_KINDS = new Set(['create','continue','rewrite']);
const wantsProgressive = op => op.config.progressive === true && PROGRESSIVE_KINDS.has(op.kind);
// Furigana blocks: readings-1 is exactly notes-1 (the chapter opens with the opening's furigana); the rest is split
// into blocks about half a notes part, because a readings request for the same paragraphs took longer than its notes
// (47 s versus 32 s, live Japanese run 2026-11-26), at most MAX_NOTE_PARTS blocks in all. With concurrent requests
// off, smaller blocks would only add requests, so the readings blocks are the notes parts.
export function readingBlocks(op, split) {
  if (Number(op.config.parallelLimit) === 1) return split;
  const story = op.prose.story, lead = split[0], minUnits = noteMinUnits(op.language) / 2;
  const rest = notesParts(story.slice(lead.end), MAX_NOTE_PARTS - 1, minUnits, noteTargetUnits(op.language) / 2)
    .map(part => ({start:part.start + lead.end, end:part.end + lead.end}));
  if (!rest.length) { const first = story.slice(lead.end).search(/\S/); return first < 0 ? [lead] : [lead, {start:lead.end + first, end:story.length}]; }
  return [lead, ...rest];
}
export function enrichmentParts(op) {
  const parts = {}, split = notesParts(op.prose.story, Number(op.config.notesParts) || 1, noteMinUnits(op.language), noteTargetUnits(op.language), {lead:wantsProgressive(op)});
  const readings = op.language === 'ja' && op.kind !== 'notes';
  const readingSplit = readings && split.length && wantsProgressive(op) ? readingBlocks(op, split) : [];
  const addReadings = () => { if (readingSplit.length) readingSplit.forEach((part, index) => { parts[`readings-${index + 1}`] = {request:null, done:false, start:part.start, end:part.end}; }); else parts.readings = {request:null, done:false}; };
  if (split.length) split.forEach((part, index) => { parts[`notes-${index + 1}`] = {request:null, done:false, start:part.start, end:part.end}; if (index === 0 && readings) addReadings(); });
  else { parts.notes = {request:null, done:false}; if (readings) addReadings(); }
  // Order by position, notes before readings for the same block.
  if (readingSplit.length > 1) {
    const ordered = {}, rest = Object.keys(parts).filter(name => !['notes-1','readings-1'].includes(name));
    rest.sort((a, b) => parts[a].start - parts[b].start || (isReadingsPart(a) ? 1 : -1));
    for (const name of ['notes-1','readings-1',...rest]) ordered[name] = parts[name];
    return ordered;
  }
  return parts;
}
// Vocabulary notes, Japanese readings and example sentences may use the lighter model saved in op.config.light
// when its `tasks` (Settings → AI models → Light model → Use it for) include them; the plan and story prose always
// use the main model. A saved light choice without `tasks` (older operations) covers notes and readings. A saved
// operation without `light` uses the main model throughout.
const LEGACY_LIGHT_TASKS = ['notes','readings'];
export const stageTask = (op, stage) => stage === 'notes' || stage === 'readings' ? stage : stage === 'prose' && op.kind === 'examples' ? 'examples' : null;
export function stageModel(op, stage) {
  const task = stageTask(op, stage), tasks = Array.isArray(op.config.light?.tasks) ? op.config.light.tasks : LEGACY_LIGHT_TASKS;
  const light = task && tasks.includes(task) && String(op.config.light?.model || '').trim() ? op.config.light : null;
  return {providerId:op.config.providerId, model:light ? light.model : op.config.model, reasoningEffort:(light ? light.reasoning : op.config.reasoning) || undefined};
}
// Reading while notes are written (config.progressive, create/continue/rewrite, split notes): once the lead notes
// part (the opening paragraph) is done (and, for Japanese, the readings), applyPartial(op, content, {first}) saves
// the chapter with the notes finished so far and op.earlyApplied is checkpointed; each later notes part calls it
// again with more notes; the final apply(op) completes the same version. A chapter whose notes are one request
// opens only at the final apply. A discarded operation that already showed its chapter calls discarded(op).
export function createPipeline({ records, persist, ai, apply, applyPartial = null, discarded = () => {}, changed = () => {}, onResend = () => {}, parallel = false, now = () => Date.now() }) {
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
    if (op.earlyApplied) { try { discarded(op); } catch { /* the chapter stays readable; its notes stay as saved */ } }
  }
  const progressive = op => Boolean(applyPartial) && wantsProgressive(op);
  // Notes saved so far: validated finished parts merged in chapter order (possibly none yet).
  function notesSoFar(op) {
    const done = Object.entries(op.parallel || {}).filter(([name, part]) => isNotesPart(name) && part.done).map(([, part]) => part.content);
    return done.length ? validateNotes({glossary:mergeNoteParts(done)}, op.prose, op.language, {requireNotes:false}).glossary : [];
  }
  // Readings saved so far as segments: the legacy single part's, or the finished split parts' (other kanji plain).
  function readingsSoFar(op) {
    const parts = op.parallel || {};
    if (parts.readings) return parts.readings.done ? parts.readings.content : null;
    const done = readingNames(op).filter(name => parts[name].done);
    if (!done.length) return null;
    const map = new Map(done.flatMap(name => parts[name].content.readings.map(item => [item.id, item.reading])));
    return attachReadingMap(validateProse(op.prose, op.language), readingPlan(validateProse(op.prose, op.language), op.kind), map, op.kind);
  }
  async function applyEarly(op) {
    const parts = op.parallel || {}, lead = parts['notes-1'] || parts.notes, readingLead = parts['readings-1'] || parts.readings;
    if (!lead?.done) return; // the opening paragraph has its notes before the chapter opens
    if (op.language === 'ja' && !readingLead?.done) return; // Japanese opens with the opening paragraph's readings
    const segments = readingsSoFar(op);
    const content = {...validateProse(op.prose, op.language), glossary:notesSoFar(op), ...(segments ? {titleSegments:segments.titleSegments, storySegments:segments.storySegments} : {})};
    const first = !op.earlyApplied;
    mark('apply'); await applyPartial(op, content, {first});
    if (first) { op.earlyApplied = true; save(); }
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
    // A split readings part asks only for the kanji in its range; it saves {readings:[{id, reading}]}.
    const ranges = name.startsWith('readings-') ? readingRanges(op) : null, spans = ranges ? readingSpansFor(plan, ranges, Number(name.slice(9)) - 1) : plan.spans;
    if (name === 'readings' && !plan.spans.length) { part.content = attachReadings(canonical, plan, {readings:[]}, op.kind); part.done = true; save(); return; }
    if (ranges && !spans.length) { part.content = {readings:[]}; part.done = true; save(); return; }
    if (!part.request) {
      const focus = notes && Number.isInteger(part.start) ? {part:Number(name.slice(6)), of:Object.keys(op.parallel).filter(isNotesPart).length, text:canonical.story.slice(part.start, part.end)} : null;
      const input = notes ? {...op.input,kind:'notes',languagePlan:op.plan,chapter:canonical,...(focus ? {focus} : {})} : {kind:'readings',languageCode:'ja',spans};
      partPhase='start';
      let id; const startedAt = now();
      try { id = await ai.start({...stageModel(op,notes ? 'notes' : 'readings'),instructions:notes ? notesInstructions(op.config.noteDensity) : READING_INSTRUCTIONS,input:JSON.stringify(input),...aiNotification(op.kind,notes ? 'notes' : 'readings')}); }
      catch (error) {
        if (START_REFUSALS.has(error?.code)) error.startRefused = true;
        else if (!op.discardRequested && canResendBroken(op, name, error)) { const count = markResent(op, name); save(); onResend(op, name, count, error); changed(); return runPart(op, name); }
        throw fail(error);
      }
      part.request={id,stage:notes ? 'notes' : 'readings',completed:false,startedAt}; startedHere.add(part.request); save();
    }
    await checkCancelled(op, part);
    let response;
    const stage = notes ? 'notes' : 'readings';
    try { partPhase='wait'; const raw = await wait(part.request.id); part.request.completedAt = now(); await checkCancelled(op, part); response = parseContent(raw); }
    catch (error) {
      if (op.discardRequested) throw error;
      if (error?.code !== 'generation_cancelled') track(op, part.request, stage, name, canResendBroken(op, name, error) ? 'resent' : 'failed');
      if (error?.code === 'usage_limit') { op.partsOneAtATime = true; save(); } // a provider limit: Resume goes one part at a time
      fail(error); await invalidate();
      if (canResendBroken(op, name, error)) { const count = markResent(op, name); save(); onResend(op, name, count, error); changed(); return runPart(op, name); }
      throw error;
    }
    try {
      partPhase='validation';
      part.content = notes ? validateNotes(response, op.prose, op.language, {requireNotes:!Number.isInteger(part.start)})
        : ranges ? {readings:[...validateReadings(plan, response, spans)].map(([id, reading]) => ({id, reading}))} : attachReadings(canonical, plan, response, op.kind);
      validateContentSize(part.content);
    } catch (error) {
      const resend = !op.discardRequested && canResendBroken(op, name, error);
      track(op, part.request, stage, name, resend ? 'resent' : 'invalid'); fail(error); await invalidate();
      if (resend) { const count = markResent(op, name); save(); onResend(op, name, count, error); changed(); return runPart(op, name); }
      throw error;
    }
    track(op, part.request, stage, name, 'ok');
    part.request.completed=true; part.done=true; save();
    await release(op, part);
  }
  // Runs unfinished parts, at most config.parallelLimit at once (one after a provider usage_limit). After any
  // failure no new part starts; running parts finish and stay saved, and the first failure is reported.
  async function runParallel(op) {
    const limit = op.partsOneAtATime ? 1 : Math.max(1, Math.min(MAX_PARALLEL, Number(op.config.parallelLimit) || LEGACY_PARALLEL));
    const queue = Object.keys(op.parallel).filter(name => !op.parallel[name].done), running = new Map();
    let failure = null, held = false;
    const launch = name => {
      const task = runPart(op, name).then(() => progressive(op) ? applyEarly(op) : null).then(() => null, error => error).then(error => {
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
    let segments = parts.readings ? parts.readings.content : null;
    if (!segments && readingNames(op).length) { // split readings: every kanji must have its reading now
      const canonical = validateProse(op.prose, op.language), plan = readingPlan(canonical, op.kind);
      segments = attachReadings(canonical, plan, {readings:readingNames(op).flatMap(name => parts[name].content.readings).sort((a, b) => a.id - b.id)}, op.kind);
    }
    const result = segments ? {...notes, titleSegments:segments.titleSegments, storySegments:segments.storySegments} : notes;
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
      // Rebuild vocabulary notes (kind "notes"): spec.prose is the saved chapter version, so only notes run.
      if (op.kind === 'notes') { const parts = parallel ? enrichmentParts(op) : null; if (parts && Object.keys(parts).length > 1) { op.stage='enrich'; op.parallel=parts; } else op.stage='notes'; }
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
          // Resumed with the lead part done: show the chapter again before waiting for the remaining notes.
          if ((op.stage === 'notes' || op.stage === 'enrich') && progressive(op) && !op.earlyApplied) await applyEarly(op);
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
            let id;
            try { id = await ai.start({...stageModel(op,stage),instructions,input:JSON.stringify(input),...aiNotification(op.kind,stage)}); }
            catch (error) {
              if (!op.discardRequested && canResendBroken(op, stage, error)) { const count = markResent(op, stage); save(); onResend(op, stage, count, error); changed(); continue; }
              throw error;
            }
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
            if (canResendBroken(op, stage, error)) { const count = markResent(op, stage); save(); onResend(op, stage, count, error); changed(); continue; }
            error.generationFailure=failure; throw error;
          }
          let content;
          mark('validation');
          try {
            content = stage === 'plan' ? response : stage === 'prose' ? (op.kind === 'examples' ? validateExamples(response,op.language) : validateProse(response,op.language)) : stage === 'notes' ? validateNotes(response,op.prose,op.language) : attachReadings(validate(op),readingPlan(op.prose,op.kind),response,op.kind);
            validateContentSize(content);
          } catch (error) {
            if (op.discardRequested) throw error;
            const resend = canResendBroken(op, stage, error);
            track(op, op.request, stage, stage, resend ? 'resent' : 'invalid');
            const failure=failureInfo(error,stage,phase);
            if (op.request) { op.request.completed=true; op.request.invalid=true; save(); await release(op); }
            if (resend) { const count = markResent(op, stage); save(); onResend(op, stage, count, error); changed(); continue; }
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
            if (op.language === 'ja' && op.kind !== 'notes') op.stage='readings';
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
