// Client for the explicit local dev_server.py --chatgpt bridge (Codex login, OpenAI models). No credentials are handled here.
// Nothing in this module runs unless a caller constructs it, and fetch is injectable.
const LOCAL_ENDPOINT = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;
export const DEFAULT_ENDPOINT = 'http://localhost:8889';

export function createBridge({endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch} = {}) {
  if (!LOCAL_ENDPOINT.test(endpoint)) throw new Error('Use the local development bridge only (http://localhost:PORT).');
  // Errors carry `definite` when the bridge answered with a structured rejection, and `ambiguous` when the outcome of
  // the call is unknown (network failure, unreadable or non-OK reply).
  async function post(path, body) {
    let response, value;
    try {
      response = await fetchImpl(endpoint + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
      value = await response.json();
    } catch (error) {
      throw Object.assign(new Error('The development bridge did not return a readable reply: ' + (error?.message || 'unknown error')), {ambiguous: true});
    }
    if (value?.error) throw Object.assign(new Error(String(value.error.message || 'Bridge error')), {code: value.error.code, definite: true});
    if (!response.ok) throw Object.assign(new Error(`The development bridge failed (HTTP ${response.status}).`), {ambiguous: true});
    return value;
  }
  const ai = body => post('/__bridge/ai', body);
  return {
    endpoint,
    async info() {
      let response;
      try { response = await fetchImpl(endpoint + '/__bridge/info'); return await response.json(); }
      catch (error) { throw new Error('The development bridge is unreachable: ' + (error?.message || 'unknown error')); }
    },
    // Metadata only; not inference.
    async models() { return (await ai({action: 'models', providerId: 'chatgpt'})).models || []; },
    async start(data) {
      const id = await ai({action: 'start', data});
      if (typeof id !== 'string' || !id) throw Object.assign(new Error('The bridge started a request but returned no usable request ID.'), {ambiguous: true});
      return id;
    },
    result: requestId => ai({action: 'result', requestId}),
    acknowledge: requestId => ai({action: 'acknowledge', requestId}),
    cancel: requestId => ai({action: 'cancel', requestId})
  };
}

export function validateModelSettings(models, label, {model, effort}) {
  const found = models.find(entry => entry.id === model);
  if (!found) throw new Error(`${label} model "${model}" is not in the bridge model listing.`);
  if (!effort || !found.reasoningLevels?.includes(effort)) throw new Error(`${label} effort "${effort}" is not offered for ${model} (available: ${(found.reasoningLevels || []).join(', ') || 'none'}).`);
}
