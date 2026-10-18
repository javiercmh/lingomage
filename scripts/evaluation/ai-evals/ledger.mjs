// Durable, shared request budget. Every start attempt is written ahead of the bridge call, so a crash can never
// hide a possibly-started request: an attempt without a durably saved request ID is ambiguous and blocks resume.
export class BudgetExhausted extends Error {
  constructor(max) { super(`The request budget of ${max} is exhausted; the run is incomplete.`); this.code = 'budget_exhausted'; }
}
export class FatalEvalError extends Error {
  constructor(message) { super(message); this.evalFatal = true; }
}

const FILE = 'budget.json';

export function createLedger({store, now}) {
  let data = store.exists(FILE) ? store.read(FILE) : null;
  let haltReason = '';
  const persist = () => store.write(FILE, data);
  const required = () => { if (!data) throw new Error('The request ledger is not initialized.'); return data; };
  const fatal = (attempt, message) => { haltReason = message; return new FatalEvalError(message); };
  return {
    get loaded() { return Boolean(data); },
    get halted() { return haltReason; },
    halt(reason) { haltReason = reason; },
    get data() { return data; },
    init(maxRequests) {
      data = {schema: 1, maxRequests, budgetHistory: [{at: now().toISOString(), maxRequests}], attempts: []};
      persist();
    },
    // A larger budget on explicit resume is recorded; shrinking is refused.
    setMax(maxRequests) {
      const current = required();
      if (maxRequests < current.maxRequests) throw new Error(`The saved budget is ${current.maxRequests}; it cannot be reduced on resume.`);
      if (maxRequests === current.maxRequests) return;
      const previous = {...current, budgetHistory: [...current.budgetHistory]};
      current.maxRequests = maxRequests;
      current.budgetHistory.push({at: now().toISOString(), maxRequests});
      try { persist(); } catch (error) { data = previous; throw error; }
    },
    remaining() { const current = required(); return current.maxRequests - current.attempts.length; },
    assertBudget() { const current = required(); if (current.attempts.length >= current.maxRequests) throw new BudgetExhausted(current.maxRequests); },
    nextSeq() { return required().attempts.length + 1; },
    reserve(fields) {
      const current = required();
      if (haltReason) throw new FatalEvalError(`The run is halted: ${haltReason}`);
      if (current.attempts.length >= current.maxRequests) throw new BudgetExhausted(current.maxRequests);
      const attempt = {seq: current.attempts.length + 1, ...fields, state: 'starting', reservedAt: now().toISOString()};
      current.attempts.push(attempt);
      try { persist(); } catch (error) { current.attempts.pop(); throw error; }
      return attempt;
    },
    // Writes after a request may exist cannot be undone: halt rather than risk duplicate inference.
    update(attempt, patch) {
      Object.assign(attempt, patch);
      try { persist(); } catch (error) { throw fatal(attempt, `The ledger could not be saved (${error.message}). No further requests will start.`); }
    },
    // A request that was started (or finished) but not yet released belongs to the caller that lost track of it.
    open(caseId, stage, role) {
      return required().attempts.find(attempt => attempt.caseId === caseId && attempt.stage === stage && attempt.role === role && ['started', 'finished', 'failed'].includes(attempt.state) && !attempt.released);
    },
    byRequestId(requestId) { return required().attempts.find(attempt => attempt.requestId === requestId); },
    unresolved() { return required().attempts.filter(attempt => attempt.state === 'starting' || attempt.state === 'start-ambiguous'); },
    abandonUnresolved() {
      const pending = this.unresolved();
      for (const attempt of pending) { attempt.previousState = attempt.state; attempt.state = 'abandoned'; attempt.abandonedAt = now().toISOString(); }
      if (pending.length) persist();
      return pending.length;
    }
  };
}
