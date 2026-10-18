// The only path to inference. Wraps the bridge with the durable ledger and per-attempt files so that:
// - the exact request is on disk, and the start is counted, before the bridge is called;
// - the request ID is durable before the pipeline sees it, and an unknown start outcome fails closed;
// - raw output is durable before any acknowledgement, and nothing is silently retried.
import {createHash} from 'node:crypto';
import {FatalEvalError} from './ledger.mjs';

export function createGateway({store, ledger, bridge, now, sleep, settings, timeoutMs = 600000, pollMs = 1000}) {
  const attemptFile = (seq, caseId, stage) => `attempts/${String(seq).padStart(4, '0')}-${caseId}-${stage}.json`;
  const writeResponse = (attempt, raw) => {
    const saved = store.read(attempt.file);
    saved.response = {raw, receivedAt: now().toISOString()};
    store.write(attempt.file, saved); // Raw output is on disk before the ledger or the bridge hear about it.
    const finishedAt = now().toISOString();
    ledger.update(attempt, {state: 'finished', finishedAt, seconds: (Date.parse(finishedAt) - Date.parse(attempt.startedAt)) / 1000});
  };
  const writeFailure = (attempt, error) => {
    const saved = store.read(attempt.file);
    saved.error = {message: String(error.message || 'Unknown error').slice(0, 1500), code: error.code || ''};
    store.write(attempt.file, saved);
    const finishedAt = now().toISOString();
    ledger.update(attempt, {state: 'failed', finishedAt, seconds: (Date.parse(finishedAt) - Date.parse(attempt.startedAt)) / 1000, error: saved.error.message});
  };

  return {
    forCase(caseId, role) {
      const expected = settings[role];
      const stageOf = data => role === 'judge' ? 'judge' : JSON.parse(data.input).kind;
      return {
        async start(data) {
          if (data.providerId !== 'chatgpt' || data.model !== expected.model || (data.reasoningEffort || '') !== expected.effort) throw new FatalEvalError(`The ${role} request does not use the selected model and effort; refusing to start.`);
          const stage = stageOf(data);
          const open = ledger.open(caseId, stage, role);
          if (open) return open.requestId; // Explicit resume of a request that was already started: poll it, never start another.
          if (ledger.halted) throw new FatalEvalError(`The run is halted: ${ledger.halted}`);
          ledger.assertBudget(); // Before any file is written for a request that cannot start.
          const seq = ledger.nextSeq(), file = attemptFile(seq, caseId, stage);
          const request = {instructions: data.instructions, input: data.input};
          const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
          store.write(file, {seq, caseId, stage, role, model: expected.model, effort: expected.effort, requestHash, request, createdAt: now().toISOString()});
          const attempt = ledger.reserve({caseId, stage, role, model: expected.model, effort: expected.effort, file, requestHash});
          let id;
          try { id = await bridge.start(data); }
          catch (error) {
            if (error.definite) { ledger.update(attempt, {state: 'start-rejected', error: String(error.message).slice(0, 500), code: error.code || ''}); throw error; }
            const message = 'A request start was attempted but its outcome is unknown, so no request ID was saved. The run fails closed; see the documented recovery in the README (--abandon-ambiguous after restarting the bridge).';
            ledger.halt(message);
            try { ledger.update(attempt, {state: 'start-ambiguous', error: String(error.message).slice(0, 500)}); } catch { /* the durable state stays "starting", which is also unresolved */ }
            throw new FatalEvalError(message);
          }
          ledger.update(attempt, {state: 'started', requestId: id, startedAt: now().toISOString()});
          return id;
        },
        async wait(id) {
          const attempt = ledger.byRequestId(id);
          if (!attempt) throw new FatalEvalError('Unknown request; refusing to poll.');
          if (attempt.state === 'finished') return store.read(attempt.file).response.raw;
          if (attempt.state === 'failed') { const saved = store.read(attempt.file).error || {}; throw Object.assign(new Error(saved.message || 'The saved request failed.'), {code: saved.code}); }
          const deadline = now().getTime() + timeoutMs;
          for (;;) {
            let raw;
            try { raw = await bridge.result(id); }
            catch (error) { writeFailure(attempt, error); throw error; }
            if (raw !== null) { writeResponse(attempt, raw); return raw; }
            if (now().getTime() > deadline) throw Object.assign(new Error('Evaluation request timed out. It was not retried; use an explicit --retry run.'), {code: 'timeout'});
            await sleep(pollMs);
          }
        },
        async acknowledge(id) {
          const attempt = ledger.byRequestId(id);
          if (!attempt) throw new FatalEvalError('Unknown request; refusing to acknowledge.');
          if (attempt.released) return;
          if (attempt.state === 'started') {
            // The outcome was never saved (timeout, or a write failed). Save what the bridge still holds before release.
            let raw = null;
            try { raw = await bridge.result(id); } catch (error) { writeFailure(attempt, error); }
            if (attempt.state === 'started') {
              if (raw === null) {
                try { await bridge.cancel(id); } catch (error) { if (error.code !== 'not_found') throw error; }
                writeFailure(attempt, Object.assign(new Error('Request cancelled after it did not complete in time.'), {code: 'timeout'}));
                ledger.update(attempt, {released: true, releasedAt: now().toISOString(), cancelled: true});
                return;
              }
              writeResponse(attempt, raw);
            }
          }
          try { await bridge.acknowledge(id); }
          catch (error) { if (error.code !== 'not_found') throw error; ledger.update(attempt, {releasedAfterServerRestart: true}); }
          ledger.update(attempt, {released: true, releasedAt: now().toISOString()});
        },
        async cancel(id) {
          await bridge.cancel(id);
          const attempt = ledger.byRequestId(id);
          if (attempt && attempt.state === 'started') ledger.update(attempt, {cancelRequested: true});
        }
      };
    }
  };
}
