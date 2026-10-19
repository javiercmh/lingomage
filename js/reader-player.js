import { prepareSpeechOptions } from './reader-speech.js';

// Keep each utterance below Android's input limit; whole sentences are the normal unit.
const MAX_UNIT = 2000;
export const SPEECH_RATES = [0.75, 1, 1.25, 1.5];

function sentenceRanges(text, locale) {
  const ranges = [];
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    for (const { index, segment } of new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text)) ranges.push([index, index + segment.length]);
  } else {
    for (const match of text.matchAll(/[^.!?。！？\n]+[.!?。！？]*[”"»)]*|\n+/gu)) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function trimmed(text, start, end) {
  while (start < end && /\s/u.test(text[start])) start++;
  while (end > start && /\s/u.test(text[end - 1])) end--;
  return end > start ? [start, end] : null;
}

function bounded(text, start, end) {
  const parts = [];
  while (end - start > MAX_UNIT) {
    let cut = start + MAX_UNIT;
    const space = text.lastIndexOf(' ', cut);
    if (space > start + MAX_UNIT / 2) cut = space + 1;
    if (/[\uD800-\uDBFF]/u.test(text[cut - 1])) cut--;
    parts.push([start, cut]); start = cut;
  }
  parts.push([start, end]);
  return parts.map(([from, to]) => trimmed(text, from, to)).filter(Boolean);
}

// DOM Range over canonical story offsets, skipping furigana (inverse of getCanonicalSelection).
export function canonicalRange(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node) { return node.parentElement?.closest('rt') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
  const range = document.createRange();
  let total = 0, node, started = false;
  while ((node = walker.nextNode())) {
    const next = total + node.nodeValue.length;
    if (!started && start < next) { range.setStart(node, start - total); started = true; }
    if (started && end <= next) { range.setEnd(node, end - total); return range; }
    total = next;
  }
  return null;
}

// The title is the first unit; story units keep canonical offsets for highlighting.
export function speechUnits(title, story, locale) {
  const units = [];
  if (title) units.push({ source: 'title', start: 0, end: title.length, text: title });
  for (const [from, to] of sentenceRanges(story, locale)) {
    const range = trimmed(story, from, to); if (!range) continue;
    for (const [start, end] of bounded(story, ...range)) units.push({ source: 'story', start, end, text: story.slice(start, end) });
  }
  return units;
}

// Sentence-level playback built on the host's start/stop commands; the host cannot pause.
// Every control that changes position invalidates `run`, so a late reply never advances playback.
export function createReaderPlayer({ speech, units, language, rate = 1, onChange = () => {}, onError = () => {} }) {
  let state = 'idle', index = 0, run = 0, options = null, finish = () => {};
  const done = new Promise(resolve => { finish = resolve; });
  const emit = () => onChange({ state, index, count: units.length });
  const end = () => { state = 'idle'; index = 0; emit(); finish(); };
  async function playFrom(position) {
    const mine = ++run; index = position; state = 'playing'; emit();
    try {
      options ||= (await prepareSpeechOptions(speech, units[index].text, language)).options;
      while (mine === run) {
        const result = await speech.speak({ ...options, text: units[index].text, rate });
        if (mine !== run) return;
        // The host cancels on backgrounding or reload; keep the position so Resume repeats this sentence.
        if (result?.status === 'cancelled') { state = 'paused'; emit(); return; }
        if (index + 1 >= units.length) return end();
        index++; emit();
      }
    } catch (error) { if (mine === run) { end(); onError(error); } }
  }
  const clamp = value => Math.max(0, Math.min(units.length - 1, value));
  return {
    done,
    get snapshot() { return { state, index, count: units.length, rate }; },
    play: (position = 0) => playFrom(clamp(position)),
    pause() {
      if (state !== 'playing') return Promise.resolve();
      run++; state = 'paused'; emit();
      return Promise.resolve().then(() => speech.stop()).catch(error => {
        // Audio may still be playing: report it and speak the current sentence again so state stays truthful.
        onError(error); playFrom(index);
      });
    },
    resume() { return state === 'paused' ? playFrom(index) : Promise.resolve(); },
    seek(position) {
      const target = clamp(position);
      if (state === 'playing') return playFrom(target);
      if (state === 'paused') { index = target; emit(); }
      return Promise.resolve();
    },
    next() { return this.seek(index + 1); },
    previous() { return this.seek(index - 1); },
    setRate(value) { rate = value; return state === 'playing' ? playFrom(index) : Promise.resolve(); },
    // Invalidate playback synchronously; release() settles `done` once the host acknowledged Stop.
    halt() { run++; state = 'idle'; emit(); },
    release() { finish(); }
  };
}
