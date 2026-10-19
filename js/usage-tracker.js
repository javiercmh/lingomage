import { localCalendar } from './usage-stats.js';
import { emptyUsage } from './workspace-storage.js';

// Time tracking keeps counters in memory and writes the whole usage file only when something changed.
//
// Time is credited from monotonic deltas between observations (events or the heartbeat), never from
// wall-clock differences, and only for the state that held during the delta. Wall time only picks the
// local date(s). A delta longer than MAX_GAP_MS is an unexplained gap (suspension, frozen page): it is not
// credited unless a chapter-audio utterance that finished normally accounts for it, and then only up to
// the shortest time that utterance could have taken. Background timers are never trusted to run.
export const HEARTBEAT_MS = 30000;
export const MAX_GAP_MS = 2 * HEARTBEAT_MS;
export const WALL_TOLERANCE_MS = 2000;
export const MAX_SPEECH_CHARS_PER_SECOND = 30;
export const READING = 'reading';
const LANGUAGE_ID = /^[A-Za-z][A-Za-z0-9-]{0,15}$/;

export const defaultClock = {now: () => Date.now(), monotonic: () => performance.now()};
export const defaultScheduler = {
  every(callback, ms) {
    const handle = setInterval(callback, ms);
    if (typeof handle === 'object') handle?.unref?.(); // lets Node test hosts exit
    return () => clearInterval(handle);
  }
};

// Adds `source` days into `target` (counts gathered while the file was unreadable meet the repaired file).
export function mergeUsage(target, source) {
  for (const [key, day] of Object.entries(source.days)) {
    const into = target.days[key] ||= {app: 0, languages: {}};
    into.app += day.app;
    for (const [code, activities] of Object.entries(day.languages)) {
      const language = into.languages[code] ||= {};
      for (const [name, ms] of Object.entries(activities)) language[name] = (language[name] || 0) + ms;
    }
  }
  return target;
}

export function createUsageTracker({clock = defaultClock, calendar = localCalendar, persistence, scheduler = defaultScheduler, onStatus = () => {}}) {
  let data = emptyUsage(), blocked = false, loadError = '', saveError = null, dirty = false;
  let visible = false, reader = null, playback = null, sequence = 0, stopTimer = null;
  let lastMono = clock.monotonic(), lastWall = clock.now();

  const status = () => ({blocked, loadError, saveError, dirty});
  const notify = () => onStatus(status());
  function load() {
    const entry = persistence.load();
    if (entry.status === 'invalid') { blocked = true; loadError = entry.error || 'Usage history could not be read.'; data = emptyUsage(); }
    else { blocked = false; loadError = ''; data = structuredClone(entry.value); }
  }
  function add(key, ms, language) {
    const day = data.days[key] ||= {app: 0, languages: {}};
    day.app += ms;
    if (language && LANGUAGE_ID.test(language)) {
      const activities = day.languages[language] ||= {};
      activities[READING] = (activities[READING] || 0) + ms;
    }
    dirty = true;
  }
  // Reading is the visible reader, or chapter audio that is playing (kept when the app is hidden).
  const readingLanguage = () => (visible && reader ? reader.language : playback?.language) || '';

  // Credits the time since the last observation to the state that held until now. Call before changing state.
  function settle(explainedMs = 0) {
    const mono = clock.monotonic(), wall = clock.now(), previousWall = lastWall;
    const gap = Math.max(0, mono - lastMono);
    lastMono = mono; lastWall = wall;
    if (!gap || !(visible || playback)) return 0;
    const credit = Math.round(gap <= MAX_GAP_MS ? gap : Math.min(gap, playback ? explainedMs : 0));
    if (credit <= 0) return 0;
    const language = readingLanguage();
    const consistent = credit === Math.round(gap) && wall >= previousWall && Math.abs(wall - previousWall - gap) <= WALL_TOLERANCE_MS;
    if (!consistent) { add(calendar.dateKey(wall), credit, language); return credit; }
    // Split at each local midnight inside the interval.
    let cursor = previousWall, left = credit;
    for (;;) {
      const boundary = calendar.nextBoundary(cursor);
      if (!(boundary > cursor) || boundary > wall || left <= 0) break;
      const part = Math.min(left, boundary - cursor);
      add(calendar.dateKey(cursor), part, language);
      left -= part; cursor = boundary;
    }
    if (left > 0) add(calendar.dateKey(cursor), left, language);
    return credit;
  }

  function save() {
    if (blocked || !dirty) return true;
    try { persistence.save(data); dirty = false; saveError = null; notify(); return true; }
    catch (error) {
      // Counters stay in memory; the next successful whole-file write includes them exactly once.
      saveError = {message: error.message, code: error.code || 'write_failed'}; notify(); return false;
    }
  }
  function heartbeat() { settle(); save(); }
  function reconcileTimer() {
    const wanted = visible || Boolean(playback);
    if (wanted && !stopTimer) stopTimer = scheduler.every(heartbeat, HEARTBEAT_MS);
    else if (!wanted && stopTimer) { stopTimer(); stopTimer = null; }
  }
  function change(update, {persist = true, explainedMs = 0} = {}) {
    settle(explainedMs); update(); reconcileTimer();
    if (persist) save();
  }

  load();
  const api = {
    setVisible(value) { value = Boolean(value); if (value === visible) settle(); else change(() => { visible = value; }); },
    // `context` is {storyId, language} while the reader is open, otherwise null.
    setReader(context) { change(() => { reader = context ? {storyId: context.storyId, language: context.language} : null; }); },
    // Utterances start and end without saving; the playback context outlives the reader that started it.
    utteranceStarted({storyId, language, chars = 0, rate = 1}) {
      const id = ++sequence;
      change(() => { playback = {id, storyId, language, chars, rate: rate > 0 ? rate : 1}; }, {persist: false});
      return id;
    },
    // 'completed' explains a long unobserved gap, up to the utterance's fastest possible duration.
    utteranceEnded(id, outcome) {
      if (!playback || playback.id !== id) return;
      const explainedMs = outcome === 'completed' ? Math.floor(playback.chars / (MAX_SPEECH_CHARS_PER_SECOND * playback.rate) * 1000) : 0;
      change(() => { playback = null; }, {persist: outcome !== 'completed', explainedMs});
    },
    // Host acknowledged Stop (pause/stop), or the listening run finished: settle and save now.
    playbackStopped() { change(() => { playback = null; }); },
    checkpoint() { change(() => {}); },
    // Settles without saving so a view includes the open interval.
    observe() { settle(); return data; },
    retrySave() { settle(); return save(); },
    // Re-reads an unreadable file after external repair and merges what was counted meanwhile.
    retryLoad() {
      if (!blocked) return true;
      const counted = data;
      load();
      if (blocked) { data = counted; return false; }
      mergeUsage(data, counted);
      dirty = Object.keys(counted.days).length > 0;
      notify(); save();
      return true;
    },
    get status() { return status(); },
    get data() { return data; },
    get playing() { return Boolean(playback); },
    today: () => calendar.dateKey(clock.now()),
    // Wraps the host speech API so chapter audio reports evidence of playing; other calls pass through.
    trackSpeech(speech, context) {
      return {
        ...speech,
        speak: async options => {
          const id = api.utteranceStarted({...context(), chars: String(options?.text || '').length, rate: options?.rate || 1});
          try {
            const result = await speech.speak(options);
            api.utteranceEnded(id, result?.status === 'cancelled' ? 'cancelled' : 'completed');
            return result;
          } catch (error) { api.utteranceEnded(id, 'error'); throw error; }
        },
        stop: async () => {
          const result = await speech.stop();
          api.playbackStopped();
          return result;
        }
      };
    }
  };
  return api;
}
