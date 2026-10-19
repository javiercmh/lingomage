import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorkspaceStorage, validUsage, emptyUsage, USAGE_PATH} from '../js/workspace-storage.js';
import {createUsageTracker, HEARTBEAT_MS, MAX_GAP_MS} from '../js/usage-tracker.js';
import {summarize, formatDuration, hasUsage, shiftDateKey, rangeBounds, localCalendar} from '../js/usage-stats.js';
import {createReaderPlayer} from '../js/reader-player.js';
import {bootApp} from './support/app-harness.mjs';

const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE;
const seconds = n => n * SECOND;

// --- Harness: injectable clocks, calendar, persistence, scheduler ------------------------------------
const offsetCalendar = state => ({
  dateKey: ms => new Date(ms + state.offset * MINUTE).toISOString().slice(0, 10),
  nextBoundary: ms => { const shifted = ms + state.offset * MINUTE; return Math.floor(shifted / (24 * HOUR) + 1) * 24 * HOUR - state.offset * MINUTE; }
});
function harness({offset = 0, start = Date.UTC(2026, 9, 19, 12, 0, 0), stored = null} = {}) {
  const clock = {wall: start, mono: 5000, now() { return this.wall; }, monotonic() { return this.mono; }};
  const advance = (ms, {wall = ms} = {}) => { clock.mono += ms; clock.wall += wall; };
  const zone = {offset};
  const disk = {text: stored ? JSON.stringify(stored) : null, writes: 0, fail: false};
  const persistence = {
    load: () => disk.text === null ? {status: 'missing', value: emptyUsage()} : {status: 'valid', value: JSON.parse(disk.text)},
    save(value) {
      if (disk.fail) throw Object.assign(new Error('Could not save data/usage.json.'), {code: 'write_failed'});
      assert.ok(validUsage(value), 'only valid usage is ever written');
      disk.text = JSON.stringify(value); disk.writes++;
    }
  };
  const timers = new Set();
  const scheduler = {every(fn, ms) { assert.equal(ms, HEARTBEAT_MS); const timer = {fn}; timers.add(timer); return () => timers.delete(timer); }};
  const statuses = [];
  const tracker = createUsageTracker({clock, calendar: offsetCalendar(zone), persistence, scheduler, onStatus: status => statuses.push(status)});
  const tick = () => [...timers].forEach(timer => timer.fn());
  const stored_ = () => JSON.parse(disk.text);
  return {clock, advance, zone, disk, persistence, timers, tracker, tick, statuses, stored: stored_, scheduler};
}
const day = (h, key = '2026-10-19') => h.tracker.data.days[key];
const totalOf = days => Object.values(days).reduce((sum, item) => sum + item.app, 0);

// --- Visible app time, no idle timeout; other screens count app only -----------------------------------
{
  const h = harness(); h.tracker.setVisible(true);
  h.advance(seconds(20)); h.tick(); // heartbeat settles with no interaction
  h.advance(seconds(25)); h.tick();
  h.advance(seconds(30)); h.tick();
  h.advance(seconds(30)); h.tick(); // 105 s without any interaction still counts
  assert.equal(day(h).app, 105000);
  assert.deepEqual(day(h).languages, {}, 'library/create/stats/settings count app time only');
  h.tracker.setVisible(false); h.advance(10 * MINUTE); h.tracker.setVisible(true);
  assert.equal(day(h).app, 105000, 'hidden time without playback is not counted');
  h.advance(seconds(10)); h.tracker.setVisible(false);
  assert.equal(day(h).app, 115000);
}

// --- Reader reading includes notes/explanations/listening while open; closing returns to app only ---------
{
  const h = harness(); h.tracker.setVisible(true);
  h.advance(seconds(10)); h.tracker.setReader({storyId: 's1', language: 'de'});
  h.advance(seconds(20)); // notes, explanations, selection etc. happen inside the open reader
  h.tracker.setReader(null); h.advance(seconds(5)); h.tracker.checkpoint();
  assert.equal(day(h).app, 35000);
  assert.deepEqual(day(h).languages, {de: {reading: 20000}});
  h.tracker.setReader({storyId: 's2', language: 'ja'}); h.advance(seconds(7)); h.tracker.setVisible(false);
  assert.deepEqual(day(h).languages, {de: {reading: 20000}, ja: {reading: 7000}});
  h.advance(MINUTE); h.tracker.setVisible(true); h.advance(seconds(3)); h.tracker.checkpoint();
  assert.equal(day(h).languages.ja.reading, 10000, 'reader reopened visible resumes reading');
}

// --- Chapter audio: background counts, paused/stopped does not, no double counting ---------------------
{
  const h = harness(); h.tracker.setVisible(true); h.tracker.setReader({storyId: 's1', language: 'es-CL'});
  const id = h.tracker.utteranceStarted({storyId: 's1', language: 'es-CL'});
  h.advance(seconds(10)); // visible + reader + audio: counted once
  assert.equal(day(h), undefined, 'nothing is credited until an observation'); h.tracker.observe();
  assert.equal(day(h).app, 10000); assert.equal(day(h).languages['es-CL'].reading, 10000);
  h.tracker.setVisible(false); // screen off / app hidden while audio continues
  h.advance(seconds(20)); h.tick();
  h.advance(seconds(20)); h.tracker.utteranceEnded(id, 'completed');
  assert.equal(day(h).app, 50000, 'background audio counts app time'); assert.equal(day(h).languages['es-CL'].reading, 50000);
  const id2 = h.tracker.utteranceStarted({storyId: 's1', language: 'es-CL'});
  h.advance(seconds(10)); h.tracker.playbackStopped(); // Stop/Pause acknowledged
  assert.equal(day(h).app, 60000);
  h.advance(10 * MINUTE); h.tick();
  assert.equal(day(h).app, 60000, 'paused or stopped hidden audio does not count');
  h.tracker.utteranceEnded(id2, 'cancelled'); // late reply from the stopped utterance is ignored
  assert.equal(day(h).app, 60000);
  assert.equal(h.timers.size, 0, 'no timer survives when hidden and silent');
  // Visible + reader + audio never exceeds elapsed time.
  h.tracker.setVisible(true); h.tracker.setReader({storyId: 's1', language: 'es-CL'});
  h.tracker.utteranceStarted({storyId: 's1', language: 'es-CL'}); h.advance(seconds(40)); h.tracker.checkpoint();
  assert.equal(day(h).app, 100000); assert.equal(day(h).languages['es-CL'].reading, 100000);
}

// --- Playback story context survives the reader closing or changing --------------------------------------
{
  const h = harness(); h.tracker.setVisible(true); h.tracker.setReader({storyId: 'a', language: 'de'});
  h.tracker.utteranceStarted({storyId: 'a', language: 'de'});
  h.tracker.setReader(null); h.advance(seconds(10)); h.tracker.checkpoint(); // reader closed, audio still stopping
  assert.deepEqual(day(h).languages, {de: {reading: 10000}});
  h.tracker.setVisible(false); h.advance(seconds(10)); h.tracker.checkpoint();
  assert.deepEqual(day(h).languages, {de: {reading: 20000}});
  h.tracker.setVisible(true); h.tracker.setReader({storyId: 'b', language: 'ru'}); h.advance(seconds(5)); h.tracker.checkpoint();
  assert.equal(day(h).languages.ru.reading, 5000, 'a visible reader is the reading context');
  assert.equal(day(h).app, 25000, 'still counted once');
}

// --- Speech wrapper reports evidence from the host speak/stop lifecycle ------------------------------------
{
  const h = harness(); h.tracker.setVisible(false);
  const calls = [], pending = [];
  const host = {available: true, voices: () => 'v', speak: options => new Promise((resolve, reject) => { calls.push(options); pending.push({resolve, reject}); }), stop: async () => 'stopped'};
  const speech = h.tracker.trackSpeech(host, () => ({storyId: 's', language: 'ja'}));
  assert.equal(speech.available, true); assert.equal(speech.voices(), 'v');
  const spoken = speech.speak({text: 'x'.repeat(60), rate: 1});
  h.advance(seconds(15)); h.tick();
  pending[0].resolve({status: 'completed'}); await spoken;
  assert.equal(day(h).languages.ja.reading, 15000);
  const second = speech.speak({text: 'abc'}); h.advance(seconds(5));
  await speech.stop(); assert.equal(h.tracker.playing, false);
  pending[1].resolve({status: 'cancelled'}); await second;
  assert.equal(day(h).app, 20000);
  const third = speech.speak({text: 'abc'}); h.advance(seconds(2));
  pending[2].reject(new Error('boom')); await assert.rejects(third, /boom/);
  assert.equal(day(h).app, 22000); assert.equal(h.tracker.playing, false);
}

// --- Real player over the tracked speech: no per-sentence writes, one save when the run ends -------------
{
  const h = harness(); h.tracker.setVisible(true); h.tracker.setReader({storyId: 's', language: 'de'});
  const pending = [];
  const host = {available: true, voices: async () => ({voices: [{id: 'v', language: 'de-DE'}]}), stop: async () => ({}),
    speak: () => new Promise(resolve => pending.push(resolve))};
  const tracked = h.tracker.trackSpeech(host, () => ({storyId: 's', language: 'de'}));
  const units = [0, 1, 2, 3].map(i => ({source: 'story', start: i * 10, end: i * 10 + 9, text: `Satz ${i}.`}));
  const player = createReaderPlayer({speech: tracked, units, language: 'de-DE'});
  const flush = () => new Promise(setImmediate);
  let finished = false; player.done.then(() => { finished = true; });
  player.play(0); await flush();
  for (let i = 0; i < 3; i++) { // three successful sentences within the first 30 s
    h.advance(seconds(8)); pending[i]({status: 'completed'}); await flush();
    assert.equal(h.disk.writes, 0, `sentence ${i + 1} completing does not write`);
  }
  h.advance(seconds(4)); pending[3]({status: 'completed'}); await player.done; await flush();
  assert.equal(finished, true); assert.equal(h.disk.writes, 0, 'the last sentence alone still does not write');
  h.tracker.checkpoint(); // what the reader-listen `finally` does once the run settles
  assert.equal(h.disk.writes, 1, 'the run end saves immediately, once');
  assert.equal(h.stored().days['2026-10-19'].app, 28000); assert.equal(h.stored().days['2026-10-19'].languages.de.reading, 28000);
  // A cancelled sentence (host cancel on backgrounding) saves immediately, mid-run.
  const c = harness(); c.tracker.setVisible(false);
  const cancelled = []; const cancelHost = {speak: () => new Promise(resolve => cancelled.push(resolve)), voices: async () => ({voices: []}), stop: async () => ({})};
  const cp = createReaderPlayer({speech: c.tracker.trackSpeech(cancelHost, () => ({storyId: 's', language: 'de'})), units, language: 'de-DE'});
  cp.play(0); await flush(); c.advance(seconds(6)); cancelled[0]({status: 'cancelled'}); await flush();
  assert.equal(c.disk.writes, 1); assert.equal(c.stored().days['2026-10-19'].app, 6000);
}

// --- Unexplained gaps (suspension) are never credited without playback evidence -------------------------------
{
  const h = harness(); h.tracker.setVisible(true); h.advance(seconds(10)); h.tick();
  h.advance(30 * MINUTE); // page frozen or device suspended while "visible"
  h.tracker.setVisible(false);
  assert.equal(day(h).app, 10000, 'a long unobserved visible gap is discarded');
  h.advance(seconds(1));
  // Playing: a long gap is discarded whatever the outcome; nothing is invented from text length.
  for (const outcome of ['completed', 'cancelled', 'error']) {
    const g = harness(); g.tracker.setVisible(false);
    const u = g.tracker.utteranceStarted({storyId: 's', language: 'de'});
    g.advance(20 * MINUTE); g.tracker.utteranceEnded(u, outcome);
    assert.equal(totalOf(g.tracker.data.days), 0, `${outcome} utterance after a long gap adds nothing`);
  }
  // Observed in-flight intervals before the gap stay counted once; the completed utterance adds no duplicate.
  const w = harness(); w.tracker.setVisible(false);
  const long = w.tracker.utteranceStarted({storyId: 's', language: 'de'});
  w.advance(seconds(20)); w.tick(); w.advance(seconds(20)); w.tick(); // observed: 40 s
  w.advance(20 * MINUTE); // suspended, unobserved
  w.tracker.utteranceEnded(long, 'completed');
  assert.equal(day(w).app, 40000, 'no fabricated or duplicate time after the gap');
  assert.equal(day(w).languages.de.reading, 40000);
  assert.equal(w.stored().days['2026-10-19'].app, 40000, 'heartbeats saved the observed time; completion adds nothing');
  const h4 = harness(); h4.tracker.setVisible(false);
  h4.tracker.utteranceStarted({storyId: 's', language: 'de'});
  h4.advance(MAX_GAP_MS + 1); h4.tracker.playbackStopped();
  assert.equal(totalOf(h4.tracker.data.days), 0, 'an explicit stop after a long gap explains nothing');
  // A gap within the heartbeat tolerance (throttled timers) is credited in full.
  const h5 = harness(); h5.tracker.setVisible(false); h5.tracker.utteranceStarted({storyId: 's', language: 'de'});
  h5.advance(MAX_GAP_MS); h5.tracker.playbackStopped();
  assert.equal(day(h5).app, MAX_GAP_MS);
}

// --- Monotonic timing: wall-clock changes never inflate time; local midnight splits; dates are kept -----------
{
  // 23:59:30 local (UTC-3) for 90 s splits 30 s / 60 s.
  const start = Date.UTC(2026, 9, 20, 2, 59, 30);
  const h = harness({offset: -180, start}); h.tracker.setVisible(true); h.tracker.setReader({storyId: 's', language: 'de'});
  h.advance(seconds(30)); h.tick(); h.advance(seconds(60)); h.tick();
  assert.deepEqual(h.tracker.data.days['2026-10-19'], {app: 30000, languages: {de: {reading: 30000}}});
  assert.deepEqual(h.tracker.data.days['2026-10-20'], {app: 60000, languages: {de: {reading: 60000}}});
  // One settle that spans midnight splits it too.
  const g = harness({offset: 0, start: Date.UTC(2026, 9, 19, 23, 59, 50)}); g.tracker.setVisible(true);
  g.advance(seconds(25)); g.tracker.checkpoint();
  assert.equal(g.tracker.data.days['2026-10-19'].app, 10000); assert.equal(g.tracker.data.days['2026-10-20'].app, 15000);
  // Wall clock jumps a week forward while 10 s elapsed: only 10 s are credited, on the current date.
  const j = harness(); j.tracker.setVisible(true); j.advance(seconds(10), {wall: 7 * 24 * HOUR}); j.tracker.checkpoint();
  assert.equal(totalOf(j.tracker.data.days), 10000); assert.deepEqual(Object.keys(j.tracker.data.days), ['2026-10-26']);
  // Wall clock moves backwards: still the monotonic elapsed time, on the current date.
  const k = harness(); k.tracker.setVisible(true); k.advance(seconds(10), {wall: -2 * HOUR}); k.tracker.checkpoint();
  assert.equal(totalOf(k.tracker.data.days), 10000);
  // A timezone change keeps earlier local dates and starts using the new offset.
  const z = harness({offset: 0, start: Date.UTC(2026, 9, 19, 22, 0, 0)}); z.tracker.setVisible(true);
  z.advance(seconds(30)); z.tracker.checkpoint();
  z.zone.offset = 180; // travelled east: it is now the 20th locally
  z.advance(seconds(30)); z.tracker.checkpoint();
  assert.equal(z.tracker.data.days['2026-10-19'].app, 30000); assert.equal(z.tracker.data.days['2026-10-20'].app, 30000);
  // The tracker with the real local calendar under a DST zone: midnight splitting is calendar based.
  process.env.TZ = 'America/New_York';
  const spring = new Date(2026, 2, 8, 23, 59, 30).getTime(); // the 23-hour day's last minute
  const clock = {wall: spring, mono: 0, now() { return this.wall; }, monotonic() { return this.mono; }};
  const real = createUsageTracker({clock, persistence: {load: () => ({status: 'missing', value: emptyUsage()}), save() {}}, scheduler: {every: () => () => {}}});
  real.setVisible(true); for (let i = 0; i < 2; i++) { clock.mono += 45000; clock.wall += 45000; real.checkpoint(); }
  assert.deepEqual(Object.entries(real.data.days).map(([key, value]) => [key, value.app]), [['2026-03-08', 30000], ['2026-03-09', 60000]]);
}

// --- Persistence: checkpoint cadence, no-op saves, immediate saves ----------------------------------------------
{
  const h = harness(); h.tracker.setVisible(true);
  assert.equal(h.disk.writes, 0, 'nothing dirty, nothing written');
  h.tick(); h.tick(); assert.equal(h.disk.writes, 0, 'idle heartbeats with no elapsed time do not write');
  h.advance(HEARTBEAT_MS); h.tick(); assert.equal(h.disk.writes, 1); assert.equal(h.stored().days['2026-10-19'].app, HEARTBEAT_MS);
  h.tracker.setVisible(false); h.tracker.setVisible(false);
  const afterHidden = h.disk.writes; h.advance(HOUR); h.tick(); h.tracker.checkpoint(); h.tracker.setReader(null);
  assert.equal(h.disk.writes, afterHidden, 'hidden and silent: no further writes');
  assert.equal(h.timers.size, 0);
  // Each lifecycle event settles and saves immediately.
  const events = {
    'visibility hidden': t => { t.setVisible(false); },
    'reader context': t => { t.setReader(null); },
    'audio stop': t => { t.playbackStopped(); },
    'audio error': t => { t.utteranceEnded(1, 'error'); },
    'audio cancelled': t => { t.utteranceEnded(1, 'cancelled'); },
    'listening finished': t => { t.checkpoint(); }
  };
  for (const [name, fire] of Object.entries(events)) {
    const x = harness(); x.tracker.setVisible(true); x.tracker.setReader({storyId: 's', language: 'ru'});
    x.tracker.utteranceStarted({storyId: 's', language: 'ru'});
    x.advance(seconds(12)); const before = x.disk.writes; fire(x.tracker);
    assert.equal(x.disk.writes, before + 1, name); assert.equal(x.stored().days['2026-10-19'].app, 12000, name);
  }
  // Repeated lifecycle notifications (visibilitychange then pagehide) flush dirty time once, without double counting.
  const r = harness(); r.tracker.setVisible(true); r.advance(seconds(10)); r.tracker.setVisible(false);
  assert.equal(r.disk.writes, 1);
  r.tracker.setVisible(true); r.advance(seconds(5)); r.tracker.setVisible(true); // pageshow while already visible keeps counting
  assert.equal(r.disk.writes, 2, 'a repeated notification saves dirty time'); assert.equal(r.stored().days['2026-10-19'].app, 15000);
  r.advance(seconds(5)); r.tracker.setVisible(false); r.tracker.setVisible(false);
  assert.equal(r.stored().days['2026-10-19'].app, 20000); assert.equal(r.disk.writes, 3, 'the second hide has nothing new to write');
  const repeat = harness(); repeat.tracker.setVisible(true); repeat.advance(seconds(10)); repeat.tracker.setVisible(false);
  repeat.advance(seconds(5)); repeat.tracker.setVisible(false);
  assert.equal(repeat.disk.writes, 1); assert.equal(repeat.stored().days['2026-10-19'].app, 10000, 'hidden time is not counted');
  const dirtyHide = harness(); dirtyHide.tracker.setVisible(true); dirtyHide.advance(seconds(10)); dirtyHide.disk.fail = true; dirtyHide.tracker.setVisible(false);
  dirtyHide.disk.fail = false; dirtyHide.tracker.setVisible(false);
  assert.equal(dirtyHide.stored().days['2026-10-19'].app, 10000, 'a repeated hide retries an unsaved write once');
  // A pagehide-style hide followed by a restored page continues without double counting.
  const p = harness(); p.tracker.setVisible(true); p.advance(seconds(5)); p.tracker.setVisible(false); p.advance(MINUTE); p.tracker.setVisible(true); p.advance(seconds(5)); p.tracker.setVisible(false);
  assert.equal(p.stored().days['2026-10-19'].app, 10000);
}

// --- Reload and compact aggregates ---------------------------------------------------------------------------------
{
  const h = harness(); h.tracker.setVisible(true); h.tracker.setReader({storyId: 's', language: 'ja'}); h.advance(seconds(42)); h.tracker.setVisible(false);
  const saved = h.stored();
  assert.deepEqual(saved, {version: 1, days: {'2026-10-19': {app: 42000, languages: {ja: {reading: 42000}}}}});
  const again = harness({stored: saved}); again.tracker.setVisible(true); again.advance(seconds(8)); again.tracker.setVisible(false);
  assert.equal(again.stored().days['2026-10-19'].app, 50000, 'reload continues from saved totals once');
  assert.equal(again.tracker.data.days['2026-10-19'].languages.ja.reading, 42000);
}

// --- Failed writes stay in memory and Retry save never duplicates ---------------------------------------------------------
{
  const h = harness(); h.tracker.setVisible(true); h.disk.fail = true; h.advance(seconds(10)); h.tracker.setVisible(false);
  assert.equal(h.disk.text, null); assert.equal(h.tracker.status.saveError.code, 'write_failed'); assert.equal(day(h).app, 10000);
  h.tracker.setVisible(true); h.advance(seconds(5)); h.tick(); // automatic attempt fails again without losing or doubling anything
  assert.equal(h.tracker.retrySave(), false); assert.equal(day(h).app, 15000);
  h.disk.fail = false; assert.equal(h.tracker.retrySave(), true);
  assert.equal(h.stored().days['2026-10-19'].app, 15000); assert.equal(h.tracker.status.saveError, null); assert.equal(h.tracker.status.dirty, false);
  const writes = h.disk.writes; assert.equal(h.tracker.retrySave(), true); assert.equal(h.disk.writes, writes, 'Retry with nothing unsaved writes nothing');
  assert.equal(h.statuses.at(-1).saveError, null);
}

// --- Corrupt usage is preserved with a recoverable warning and never blocks other stores -------------------------------
{
  const files = new Map([[USAGE_PATH, '{"version":1,"days":{"2026-13-40":{}}}'], ['data/stories.json', '[]']]);
  const storage = createWorkspaceStorage({read: name => files.get(name) ?? '', write: (name, value) => { files.set(name, JSON.stringify(value)); return true; }, exists: name => files.has(name)});
  storage.load('data/stories.json'); storage.load('data/settings.json'); storage.load('data/generation-checkpoints.json');
  const corrupt = files.get(USAGE_PATH);
  const clock = {wall: Date.UTC(2026, 9, 19, 12), mono: 0, now() { return this.wall; }, monotonic() { return this.mono; }};
  const tracker = createUsageTracker({clock, persistence: {load: () => storage.load(USAGE_PATH), save: value => storage.save(USAGE_PATH, value)}, scheduler: {every: () => () => {}}});
  assert.equal(tracker.status.blocked, true); assert.match(tracker.status.loadError, /data\/usage\.json/);
  storage.assertWritable(); // stories, settings and checkpoints stay writable
  tracker.setVisible(true); clock.mono += 20000; clock.wall += 20000; tracker.setVisible(false);
  assert.equal(files.get(USAGE_PATH), corrupt, 'the unreadable file is never overwritten');
  assert.equal(tracker.retryLoad(), false); assert.equal(files.get(USAGE_PATH), corrupt);
  assert.equal(tracker.data.days['2026-10-19'].app, 20000, 'time is still counted in memory');
  files.set(USAGE_PATH, JSON.stringify({version: 1, days: {'2026-10-18': {app: 5000, languages: {de: {reading: 4000}}}}}));
  assert.equal(tracker.retryLoad(), true);
  const merged = JSON.parse(files.get(USAGE_PATH));
  assert.equal(merged.days['2026-10-18'].app, 5000); assert.equal(merged.days['2026-10-19'].app, 20000);
  assert.equal(tracker.status.blocked, false);
  // Blank, unknown-version and structurally wrong files are also unreadable; a missing one starts empty.
  for (const bad of ['', '[]', '{"version":2,"days":{}}', '{"version":1}']) {
    files.set(USAGE_PATH, bad); assert.equal(storage.load(USAGE_PATH).status, 'invalid', JSON.stringify(bad));
  }
  files.delete(USAGE_PATH); assert.equal(storage.load(USAGE_PATH).status, 'missing');
}

// --- Store validation ---------------------------------------------------------------------------------------------------------
{
  const ok = {version: 1, days: {'2026-02-28': {app: 1000, languages: {de: {reading: 400}, 'es-CL': {reading: 600}}}}};
  assert.ok(validUsage(ok)); assert.ok(validUsage(emptyUsage()));
  assert.ok(validUsage({...ok, futureField: 1}), 'unknown top-level fields are tolerated');
  const bad = [
    null, [], {version: 1}, {version: '1', days: {}}, {version: 1, days: []},
    {version: 1, days: {'2026-02-30': {app: 1, languages: {}}}}, {version: 1, days: {'2026-2-3': {app: 1, languages: {}}}}, {version: 1, days: {'2026-10-19': null}},
    {version: 1, days: {'2026-10-19': {app: -1, languages: {}}}}, {version: 1, days: {'2026-10-19': {app: 1.5, languages: {}}}},     {version: 1, days: {'2026-10-19': {app: 10, languages: {de: {reading: 11}}}}}, {version: 1, days: {'2026-10-19': {app: 10, languages: {de: {reading: 6}, ja: {reading: 6}}}}},
    JSON.parse('{"version":1,"days":{"2026-10-19":{"app":10,"languages":{"__proto__":{"reading":1}}}}}'), {version: 1, days: {'2026-10-19': {app: 10, languages: {de: {Reading: 1}}}}},
    {version: 1, days: {'2026-10-19': {app: 10, languages: {de: {reading: '1'}}}}}, {version: 1, days: {'2026-10-19': {app: 10}}}
  ];
  const repeated = {version: 1, days: {'2026-10-19': {app: 30 * HOUR, languages: {de: {reading: 29 * HOUR}}}}};
  assert.ok(validUsage(repeated), 'a repeated local date may exceed 24 h');
  assert.ok(!validUsage({version: 1, days: {'2026-10-19': {app: 30 * HOUR, languages: {de: {reading: 31 * HOUR}}}}}), 'breakdown invariant still holds');
  assert.ok(!validUsage({version: 1, days: {'2026-10-19': {app: Number.MAX_SAFE_INTEGER + 1, languages: {}}}}));
  const repeatTracker = harness({stored: repeated}); repeatTracker.tracker.setVisible(true); repeatTracker.advance(seconds(5)); repeatTracker.tracker.setVisible(false);
  assert.equal(repeatTracker.stored().days['2026-10-19'].app, 30 * HOUR + 5000, 'a >25 h repeated date stays loadable and writable');
  bad.forEach((value, index) => assert.equal(validUsage(value), false, `invalid case ${index}`));
  const storage = createWorkspaceStorage({read: () => '', write: () => true, exists: () => false});
  storage.load(USAGE_PATH);
  assert.throws(() => storage.save(USAGE_PATH, bad[11]), {code: 'invalid_data'});
}

// --- Ranges, totals, filters and invariants ----------------------------------------------------------------------------------------
{
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28'); assert.equal(shiftDateKey('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDateKey('2026-01-03', -6), '2025-12-28');
  assert.deepEqual(rangeBounds('week', '2026-10-19'), {from: '2026-10-13', to: '2026-10-19'});
  const usage = {version: 1, days: {
    '2026-10-12': {app: 9000, languages: {de: {reading: 9000}}},
    '2026-10-13': {app: 8000, languages: {de: {reading: 3000}, ja: {reading: 4000}}},
    '2026-10-17': {app: 600000, languages: {ru: {reading: 100000}, xx: {reading: 5000, listening: 1000}}},
    '2026-10-19': {app: 150000, languages: {'es-CL': {reading: 90000}, de: {reading: 30000}}},
    '2026-10-20': {app: 7000, languages: {de: {reading: 7000}}}
  }};
  assert.ok(validUsage(usage));
  const order = ['de', 'ja', 'ru', 'es-CL'];
  const today = summarize(usage, 'today', '2026-10-19', order), week = summarize(usage, 'week', '2026-10-19', order), all = summarize(usage, 'all', '2026-10-19', order);
  assert.equal(today.app, 150000); assert.deepEqual(today.languages.map(item => item.id), ['de', 'es-CL']);
  assert.equal(week.app, 8000 + 600000 + 150000, 'today plus six prior local dates; the 12th and future 20th are outside');
  assert.deepEqual(week.languages.map(item => [item.id, item.total]), [['de', 33000], ['ja', 4000], ['ru', 100000], ['es-CL', 90000], ['xx', 6000]]);
  assert.equal(all.app, 774000); assert.equal(all.languages.find(item => item.id === 'de').total, 49000);
  assert.deepEqual(all.activities, [{id: 'reading', ms: 9000 + 3000 + 4000 + 100000 + 5000 + 90000 + 30000 + 7000}, {id: 'listening', ms: 1000}]);
  assert.deepEqual(all.languages.find(item => item.id === 'xx').activities, [{id: 'reading', ms: 5000}, {id: 'listening', ms: 1000}], 'language-by-activity');
  for (const view of [today, week, all]) {
    const languages = view.languages.reduce((sum, item) => sum + item.total, 0), activities = view.activities.reduce((sum, item) => sum + item.ms, 0);
    assert.equal(languages, activities, 'language totals and activity totals agree'); assert.ok(languages <= view.app, 'tracked categories never exceed app time');
    for (const language of view.languages) assert.equal(language.activities.reduce((sum, item) => sum + item.ms, 0), language.total);
  }
  assert.ok(today.app <= week.app && week.app <= all.app);
  assert.equal(summarize(emptyUsage(), 'all', '2026-10-19').app, 0);
  // Week ranges are calendar-based across a DST change.
  process.env.TZ = 'America/New_York';
  assert.equal(localCalendar.dateKey(new Date(2026, 10, 2, 0, 30).getTime()), '2026-11-02');
  assert.deepEqual(rangeBounds('week', '2026-11-02'), {from: '2026-10-27', to: '2026-11-02'});
  // Historical dates do not change when the zone does.
  process.env.TZ = 'Pacific/Auckland';
  assert.equal(summarize(usage, 'today', '2026-10-19').app, 150000);
  // Positive totals below a minute are history, not the empty state.
  assert.equal(hasUsage(emptyUsage()), false); assert.equal(hasUsage({version: 1, days: {'2026-10-19': {app: 0, languages: {}}}}), false);
  const brief = {version: 1, days: {'2026-10-19': {app: 4000, languages: {de: {reading: 2000}}}}};
  assert.equal(hasUsage(brief), true); assert.equal(formatDuration(summarize(brief, 'all', '2026-10-19').app), 'Less than 1 minute');
  assert.equal(formatDuration(summarize(brief, 'all', '2026-10-19').languages[0].total), 'Less than 1 minute');
  // Durations.
  const texts = [[0, '0 minutes'], [1, 'Less than 1 minute'], [59999, 'Less than 1 minute'], [60000, '1 minute'], [119999, '1 minute'], [5 * MINUTE, '5 minutes'], [HOUR, '1 hour'], [HOUR + MINUTE, '1 hour 1 minute'], [2 * HOUR + 30 * MINUTE + 59999, '2 hours 30 minutes'], [30 * HOUR, '30 hours'], [NaN, '0 minutes'], [-5, '0 minutes']];
  for (const [ms, text] of texts) assert.equal(formatDuration(ms), text, String(ms));
}

// --- Several years of synthetic history stay fast ----------------------------------------------------------------------------------------
{
  const days = {};
  for (let i = 0; i < 6 * 366; i++) {
    const key = shiftDateKey('2021-01-01', i), reading = 20 * MINUTE;
    days[key] = {app: 2 * HOUR, languages: {de: {reading}, ja: {reading}, ru: {reading}, 'es-CL': {reading}}};
  }
  const usage = {version: 1, days};
  const started = performance.now();
  assert.ok(validUsage(usage));
  const all = summarize(usage, 'all', '2026-10-19'), week = summarize(usage, 'week', '2026-10-19'), today = summarize(usage, 'today', '2026-10-19');
  const text = JSON.stringify(usage); JSON.parse(text);
  const h = harness({stored: usage}); h.tracker.setVisible(true); h.advance(seconds(1)); h.tracker.setVisible(false);
  const elapsed = performance.now() - started;
  assert.equal(all.app, 6 * 366 * 2 * HOUR); assert.ok(week.app <= 7 * 2 * HOUR && today.app <= 2 * HOUR);
  assert.ok(Object.keys(days).length === 2196 && text.length < 400000, `compact: ${text.length} bytes`);
  assert.ok(elapsed < 1500, `validate, summarize and one whole-file save took ${elapsed.toFixed(0)} ms`);
}

// --- Seeds, manifest ownership and packaging ------------------------------------------------------------------------------------------------
{
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8')), update = manifest.app2Update;
  assert.ok(manifest.files.includes('data/usage.json') && update.seedFiles.includes('data/usage.json'), 'usage is a seeded user file');
  assert.ok(!update.managedFiles.includes('data/usage.json'), 'updates never overwrite learner usage');
  assert.deepEqual(update.seedDefaults['data/usage.json'], {version: 1, days: {}});
  for (const name of ['js/usage-tracker.js', 'js/usage-stats.js']) assert.ok(manifest.files.includes(name) && update.managedFiles.includes(name));
  assert.ok(!/usage/i.test(fs.readFileSync('js/bridge.js', 'utf8').replace(/provider usage/g, '')), 'no host API change');
}

// --- The real app: unreadable usage never blocks other features; history survives story deletion and disabled languages ------------------------------
{
  const base = {'data/stories.json': '[]', 'data/settings.json': '{}', 'data/generation-checkpoints.json': '[]'};
  const history = JSON.stringify({version: 1, days: {'2026-10-01': {app: 60000, languages: {ru: {reading: 60000}}}}});
  let app = await bootApp({files: {...base, [USAGE_PATH]: '{broken'}});
  assert.equal(app.el('storage-recovery').hidden, true, 'the Workspace needs attention panel is for required stores');
  assert.equal(app.el('generate').disabled, false, 'generation is not blocked');
  assert.equal(app.el('usage-notice').hidden, false); assert.match(app.el('usage-notice-message').textContent, /data\/usage\.json.*preserved/);
  assert.equal(app.el('usage-retry').textContent, 'Retry loading'); assert.equal(app.file(USAGE_PATH), '{broken');
  app.dispatch('usage-retry', 'click'); assert.equal(app.file(USAGE_PATH), '{broken'); assert.match(app.el('usage-retry-note').textContent, /Still unreadable/);
  app = await bootApp({files: {...base, [USAGE_PATH]: history}});
  assert.equal(app.el('usage-notice').hidden, true); assert.equal(app.file(USAGE_PATH), history, 'startup rewrites nothing');
  app = await bootApp({files: base});
  assert.equal(app.el('usage-notice').hidden, true); assert.equal(app.file(USAGE_PATH) ?? null, null, 'a missing file is not created until time is counted');
}

console.log('PASS usage tracking: visible/reader/background-audio attribution without double counting, suspension and clock safety, midnight splitting, checkpoint and immediate saves, reload, corrupt/retry recovery, validation, ranges, formatting, seeds and multi-year performance');
