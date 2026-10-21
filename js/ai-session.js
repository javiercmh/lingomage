// Operation sessions for multi-request work. A session is a bounded hold on the host's background
// service so the next stage can start after the app has been backgrounded. It starts no inference
// and does not make this page run while Android suspends it; the checkpoints stay the source of truth.
// Every ai.start of the app goes through start(), which also refuses to call the host while the page
// is hidden and no session is held, so a denied background start never creates a failed request.
const MAX_SESSION_ID = 64; // the host rejects longer ids
const SESSION_ERRORS = new Set(['session_ended', 'session_cancelled', 'session_idle', 'session_timeout', 'background_service']);

export function createAiSession({ ai, isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden' }) {
  let depth = 0;
  let current = null;   // { id }
  let opening = null;   // join concurrent opens
  let ended = null;     // the error that ended this operation's session; it is never reopened automatically

  async function open(args) {
    if (!(await ai.sessions.supported())) return null;
    const response = await ai.sessions.begin({ providerId: args.providerId, model: args.model, title: args.title, body: args.body });
    const sessionId = response?.sessionId;
    // A malformed answer must never turn into an unsessioned request: nothing starts without a usable id.
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > MAX_SESSION_ID) {
      throw Object.assign(new Error('Unexpected background session response.'), { code: 'invalid_response' });
    }
    return current = { id: sessionId };
  }

  async function ensure(args) {
    if (depth === 0) return null;
    if (ended) throw ended;
    if (current) return current;
    // begin must not trigger inference or need a different provider/model than the first request.
    opening ||= open(args).finally(() => { opening = null; });
    return opening;
  }

  async function close() {
    const session = current; current = null; ended = null;
    if (!session) return;
    // Best effort: an unreachable host or an already-ended session must not mask the operation's own outcome.
    try { await ai.sessions.end(session.id); } catch { /* the host expires it */ }
  }

  return {
    get active() { return Boolean(current); },
    // Scopes one multi-request operation. Nested scopes (a reader request inside Continue) share the
    // outer session and never end it early. Cleanup-only paths (finish, save) do not call this.
    async run(fn) {
      depth += 1;
      try { return await fn(); }
      finally { depth -= 1; if (depth === 0) await close(); }
    },
    async start(args) {
      const session = await ensure(args);
      if (!session && !isVisible()) {
        throw Object.assign(new Error('This step did not start because LingoMage was in the background.'), { code: 'background_paused' });
      }
      try { return await ai.start(session ? { ...args, sessionId: session.id } : args); }
      catch (error) {
        // A session the host has ended or lost stays ended for the rest of this operation.
        if (session && (SESSION_ERRORS.has(error?.code) || error?.code === 'not_found')) { current = null; ended = error; }
        throw error;
      }
    },
  };
}
