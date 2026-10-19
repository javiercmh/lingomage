// Exercise the production chapter Listen/Stop control against delayed native replies.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const app = fs.readFileSync('js/app.js', 'utf8');
const controls = app.slice(app.indexOf('function renderReaderListen('), app.indexOf("$('reader-dialog').addEventListener('pointerdown'"));
const speechSource = fs.readFileSync('js/reader-speech.js', 'utf8').replaceAll('export ', '');
const flush = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; }
function harness({story = 'Chapter body', language = 'de', delayVoices = false} = {}) {
  const speaks = [], stops = [], voices = [], errors = [], handlers = {};
  const button = {disabled: false, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, fn) { handlers[k] = fn; }};
  const dialog = {open: true};
  const speech = {available: true,
    speak(options) { const call = deferred(); speaks.push({...call, options}); return call.promise; },
    stop() { const call = deferred(); stops.push(call); return call.promise; },
    voices() { const call = deferred(); voices.push(call); if (!delayVoices) call.resolve({voices: [{id: 'cl', language: 'es-CL'}]}); return call.promise; }
  };
  const c = {Intl, state: {speechVersionKey: 'S:C:V'}, speech, trackedSpeech: speech, usage: {checkpoint() {}}, readerStory: () => ({title: 'Title', language}),
    activeChapter: () => ({}), activeVersion: () => ({title: 'Title', story}), SPEECH_LANGUAGES: {de: 'de-DE', 'es-CL': 'es-CL'},
    $: id => id === 'reader-listen' ? button : dialog, toast: message => errors.push(message)};
  vm.createContext(c);
  vm.runInContext("let readerSpeechRun=0, readerSpeechKey='', readerSpeechOwner=0, readerSpeechStop=null;\n" + speechSource + controls, c);
  c.renderReaderListen();
  return {c, button, dialog, speech, speaks, stops, voices, errors, click: handlers.click};
}
function idle(h) {
  assert.equal(h.button.disabled, false); assert.equal(h.button.attributes['data-playing'], 'false'); assert.equal(h.button.attributes['aria-pressed'], 'false');
  assert.equal(h.button.attributes['aria-label'], 'Listen to this chapter'); assert.equal(h.button.attributes['aria-busy'], 'false');
}
(async () => {
  // A second tap interrupts the current chunk and invalidates all queued chunks.
  const h = harness({story: 'Long prose '.repeat(800)});
  const play = h.click(); await flush();
  assert.equal(h.speaks.length, 1); assert.equal(h.button.disabled, false);
  assert.equal(h.button.attributes['aria-label'], 'Stop reading this chapter'); assert.equal(h.button.attributes['data-playing'], 'true'); assert.equal(h.button.attributes['aria-pressed'], 'true');
  const stop = h.click(); await flush();
  assert.equal(h.stops.length, 1); assert.equal(h.button.disabled, true); assert.equal(h.button.attributes['aria-busy'], 'true');
  await h.click(); assert.equal(h.speaks.length, 1); assert.equal(h.stops.length, 1, 'rapid taps cannot queue conflicting commands');
  h.speaks[0].resolve({status: 'completed'}); await play;
  assert.equal(h.speaks.length, 1, 'even a completed chunk must not start another after Stop');
  assert.equal(h.button.disabled, true, 'wait for the pending native stop acknowledgement');
  h.stops[0].resolve({stopped: true}); await stop; idle(h);

  // A late completion from the previous run must not clear a same-chapter restart.
  const restarted = harness();
  const oldPlay = restarted.click(); await flush();
  const oldStop = restarted.click(); await flush(); restarted.stops[0].resolve({stopped: true}); await oldStop; idle(restarted);
  const newPlay = restarted.click(); await flush(); assert.equal(restarted.speaks.length, 2);
  restarted.speaks[0].resolve({status: 'cancelled'}); await oldPlay;
  assert.equal(restarted.button.attributes['data-playing'], 'true');
  assert.equal(restarted.speaks[1].options.text, 'Title\n\nChapter body', 'restart begins with the title');
  restarted.speaks[1].resolve({status: 'completed'}); await newPlay; idle(restarted);

  // Stop is available while Spanish voice discovery is pending, before speech starts.
  const lookup = harness({language: 'es-CL', delayVoices: true});
  const lookupPlay = lookup.click(); await flush(); assert.equal(lookup.voices.length, 1); assert.equal(lookup.speaks.length, 0);
  const lookupStop = lookup.click(); await flush(); lookup.stops[0].resolve({stopped: true}); await lookupStop;
  lookup.voices[0].resolve({voices: [{id: 'cl', language: 'es-CL'}]}); await lookupPlay;
  assert.equal(lookup.speaks.length, 0); idle(lookup);

  // A failed stop is reported once and can be retried without restarting inference/audio.
  const failed = harness(); const failedPlay = failed.click(); await flush();
  const failedStop = failed.click(); await flush(); failed.stops[0].reject(Error('timeout')); await failedStop;
  assert.equal(failed.errors.length, 1); assert.match(failed.errors[0], /Could not stop audio: timeout/);
  assert.equal(failed.button.disabled, false); assert.equal(failed.button.attributes['data-playing'], 'true');
  const retry = failed.click(); await flush(); assert.equal(failed.stops.length, 2); assert.equal(failed.speaks.length, 1);
  failed.stops[1].resolve({stopped: true}); await retry; failed.speaks[0].resolve({status: 'cancelled'}); await failedPlay; idle(failed);

  const ended = harness(); const endingPlay = ended.click(); await flush();
  const endingStop = ended.click(); await flush(); ended.speaks[0].resolve({status: 'completed'}); await endingPlay;
  ended.stops[0].reject(Error('late timeout')); await endingStop; idle(ended); assert.equal(ended.errors.length, 0, 'an already-ended utterance needs no stop error');

  // Native cancellation and playback errors restore the original accessible action.
  for (const result of ['cancelled', 'error']) {
    const native = harness(); const playing = native.click(); await flush();
    if (result === 'error') native.speaks[0].reject(Error('voice unavailable')); else native.speaks[0].resolve({status: result});
    await playing; idle(native); assert.equal(native.errors.length, result === 'error' ? 1 : 0);
  }

  // Closing/navigating invalidates playback before delayed native replies arrive.
  const closed = harness({story: 'Long prose '.repeat(800)}); const closingPlay = closed.click(); await flush();
  closed.dialog.open = false; const closingStop = closed.c.stopSpeech();
  closed.c.state.speechVersionKey = 'S:C2:V2'; await flush();
  closed.stops[0].resolve({stopped: true}); await closingStop;
  closed.speaks[0].resolve({status: 'completed'}); await closingPlay;
  assert.equal(closed.speaks.length, 1); assert.equal(closed.errors.length, 0); idle(closed);

  const unavailable = harness(); unavailable.speech.available = false; unavailable.c.renderReaderListen(); await unavailable.click();
  assert.equal(unavailable.button.disabled, true); assert.equal(unavailable.speaks.length, 0); assert.equal(unavailable.stops.length, 0);
  console.log('PASS chapter Listen/Stop: active control, rapid taps, chunk/voice-lookup cancellation, stop retry, stale replies, restart, native cancellation, errors and reader closure');
})().catch(error => { console.error(error); process.exitCode = 1; });
