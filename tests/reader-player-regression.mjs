// Sentence player: segmentation, rate options, pause/resume, skipping and cancellation safety.
import assert from 'node:assert/strict';
import { speechUnits, createReaderPlayer } from '../js/reader-player.js';

const flush = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// Units cover the title first, then each trimmed sentence with exact canonical offsets.
const story = 'Анна и Олег идут в ресторан. В ресторане есть большие окна.\n\n— Мы хотим стол у окна, — говорит Анна.';
const units = speechUnits('Стол у окна', story, 'ru-RU');
assert.deepEqual(units.map(unit => unit.source), ['title', 'story', 'story', 'story']);
assert.equal(units[0].text, 'Стол у окна');
for (const unit of units.filter(item => item.source === 'story')) assert.equal(story.slice(unit.start, unit.end), unit.text);
assert.equal(units[3].text, '— Мы хотим стол у окна, — говорит Анна.');
assert.equal(speechUnits('', 'Hallo. Welt!', 'de-DE').length, 2, 'a missing title adds no unit');
assert.equal(speechUnits('T', '日本語です。ありがとう。', 'ja-JP').length, 3);
const long = 'word '.repeat(1500);
assert(speechUnits('', long, 'en').every(unit => unit.text.length <= 2000), 'long sentences are bounded for the speech engine');
assert.equal(speechUnits('', long, 'en').map(unit => unit.text).join(' ').replace(/\s+/g, ' '), long.trim());
console.log('PASS speech units: title first, canonical offsets, dialogue, Japanese and bounded long sentences');

function harness(count = 3, { rate = 1, language = 'de-DE' } = {}) {
  const speaks = [], stops = [], changes = [], errors = [];
  const speech = {
    voices: async () => ({ voices: [{ id: 'cl', language: 'es-CL' }] }),
    speak(options) { const call = deferred(); speaks.push({ ...call, options }); return call.promise; },
    stop() { const call = deferred(); stops.push(call); return call.promise; }
  };
  const list = Array.from({ length: count }, (_, i) => ({ source: 'story', start: i * 10, end: i * 10 + 9, text: `Satz ${i}.` }));
  const player = createReaderPlayer({ speech, units: list, language, rate, onChange: change => changes.push(change), onError: error => errors.push(error.message) });
  return { player, speaks, stops, changes, errors };
}

(async () => {
  // One sentence per call, native bar hidden, rate passed; completion advances; the last one ends and settles done.
  let h = harness(3, { rate: 1.25 });
  h.player.play(0); await flush();
  assert.equal(h.speaks.length, 1);
  assert.deepEqual({ ...h.speaks[0].options }, { text: 'Satz 0.', language: 'de-DE', rate: 1.25 });
  h.speaks[0].resolve({ status: 'completed' }); await flush();
  assert.equal(h.player.snapshot.index, 1); assert.equal(h.speaks[1].options.text, 'Satz 1.');
  h.speaks[1].resolve({ status: 'completed' }); await flush(); h.speaks[2].resolve({ status: 'completed' });
  await h.player.done; assert.equal(h.player.snapshot.state, 'idle');
  assert.equal(h.speaks.length, 3);

  // Pause stops audio and keeps the sentence; a late completion cannot advance; Resume repeats it.
  h = harness(); h.player.play(0); await flush();
  const pausing = h.player.pause(); await flush();
  assert.equal(h.player.snapshot.state, 'paused'); assert.equal(h.stops.length, 1);
  h.speaks[0].resolve({ status: 'completed' }); await flush();
  assert.equal(h.speaks.length, 1, 'a completion after Pause never starts the next sentence');
  h.stops[0].resolve(true); await pausing;
  h.player.resume(); await flush();
  assert.equal(h.speaks.length, 2); assert.equal(h.speaks[1].options.text, 'Satz 0.', 'Resume repeats the current sentence');
  assert.equal(h.player.snapshot.state, 'playing');

  // Next/Previous replace playback without a separate Stop; stale replies are ignored.
  h = harness(); h.player.play(0); await flush();
  h.player.next(); await flush();
  assert.equal(h.stops.length, 0); assert.equal(h.speaks[1].options.text, 'Satz 1.');
  h.speaks[0].resolve({ status: 'cancelled' }); await flush();
  assert.equal(h.player.snapshot.state, 'playing', 'the replaced sentence cannot pause the new one');
  h.player.previous(); await flush(); assert.equal(h.speaks[2].options.text, 'Satz 0.');
  h.player.previous(); await flush(); assert.equal(h.speaks[3].options.text, 'Satz 0.', 'previous stops at the first sentence');
  h.player.seek(99); await flush(); assert.equal(h.speaks[4].options.text, 'Satz 2.', 'seek clamps to the last sentence');
  // While paused, skipping only moves the position.
  h = harness(); h.player.play(0); await flush(); h.player.pause(); await flush(); h.stops[0].resolve(true);
  h.player.next(); await flush(); assert.equal(h.speaks.length, 1); assert.equal(h.player.snapshot.index, 1);
  h.player.resume(); await flush(); assert.equal(h.speaks[1].options.text, 'Satz 1.');

  // Changing speed restarts the current sentence at the new rate.
  h = harness(); h.player.play(1); await flush();
  h.player.setRate(1.5); await flush();
  assert.equal(h.speaks[1].options.rate, 1.5); assert.equal(h.speaks[1].options.text, 'Satz 1.');

  // Halt (Stop, reader close, chapter change) invalidates every queued sentence even if the host completes it.
  h = harness(); const stopped = h.player.play(0); await flush();
  h.player.halt(); h.speaks[0].resolve({ status: 'completed' }); await stopped;
  assert.equal(h.speaks.length, 1, 'no sentence starts after Stop'); assert.equal(h.player.snapshot.state, 'idle');
  let settled = false; h.player.done.then(() => { settled = true; }); await flush();
  assert.equal(settled, false, 'done waits for the host to acknowledge Stop'); h.player.release(); await flush(); assert.equal(settled, true);

  // Host cancellation (backgrounding, replaced speech) pauses at the sentence instead of continuing.
  h = harness(); h.player.play(0); await flush(); h.speaks[0].resolve({ status: 'cancelled' }); await flush();
  assert.equal(h.player.snapshot.state, 'paused'); assert.equal(h.speaks.length, 1);

  // Errors end playback once and report; a failed pause is reported and the sentence is spoken again.
  h = harness(); h.player.play(0); await flush(); h.speaks[0].reject(Error('voice unavailable')); await h.player.done;
  assert.deepEqual(h.errors, ['voice unavailable']); assert.equal(h.player.snapshot.state, 'idle');
  h = harness(); h.player.play(0); await flush(); const failing = h.player.pause(); await flush(); h.stops[0].reject(Error('timeout')); await failing; await flush();
  assert.deepEqual(h.errors, ['timeout']); assert.equal(h.player.snapshot.state, 'playing'); assert.equal(h.speaks.length, 2);

  // Spanish discovers its Chilean voice once and reuses it.
  h = harness(2, { language: 'es-CL' }); h.player.play(0); await flush();
  assert.equal(h.speaks[0].options.voiceId, 'cl'); h.speaks[0].resolve({ status: 'completed' }); await flush();
  assert.equal(h.speaks[1].options.voiceId, 'cl');
  console.log('PASS reader player: options, advance, pause/resume, skip, speed, cancellation, host interruption and errors');
})().catch(error => { console.error(error); process.exit(1); });
