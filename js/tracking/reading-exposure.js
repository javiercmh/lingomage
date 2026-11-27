// Reading exposure (PED-005): infers which paragraphs the learner probably read from on-screen time.
//
// A paragraph counts as probably read once its accumulated on-screen time reaches its word count at
// READ_WPM (never less than MIN_DWELL_MS). Time accrues only between samples while the page is visible,
// the learner interacted within IDLE_MS, and at least VISIBLE_FRACTION of the paragraph (or of the
// viewport, for a paragraph taller than it) is visible. Thresholds are product assumptions; reading speed
// evidence is in docs/research/consultation-signals.md. It means "probably read", never "understood".
export const READ_WPM = 400;
export const MIN_DWELL_MS = 1500;
export const IDLE_MS = 60000;
export const VISIBLE_FRACTION = 0.5;
export const SAMPLE_MS = 1000;
export const MAX_SAMPLE_GAP_MS = 5 * SAMPLE_MS;

// Paragraphs are runs of text between line breaks, with canonical offsets.
export function paragraphRanges(text) {
  const ranges = [];
  const pattern = /[^\n]+/g;
  for (let match; (match = pattern.exec(text));) {
    if (!match[0].trim()) continue;
    ranges.push({index:ranges.length, start:match.index, end:match.index + match[0].length, text:match[0]});
  }
  return ranges;
}

// Word count with Intl.Segmenter where available (handles Japanese without spaces); otherwise whitespace
// tokens, or characters / 2 for Japanese, as an approximation.
export function wordCount(text, language = '') {
  const value = String(text || '');
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      let total = 0;
      for (const part of new Intl.Segmenter(language || undefined, {granularity:'word'}).segment(value)) if (part.isWordLike) total++;
      return total;
    } catch { /* fall through */ }
  }
  if (language.startsWith('ja')) return Math.ceil(value.replace(/\s/g, '').length / 2);
  return value.split(/\s+/).filter(Boolean).length;
}
export const requiredDwellMs = words => Math.max(MIN_DWELL_MS, words / READ_WPM * 60000);

// Visible share of a box within a viewport, relative to the smaller of the two heights.
export function visibleFraction(box, viewport) {
  if (!box || !viewport) return 0;
  const height = box.bottom - box.top, room = viewport.bottom - viewport.top;
  if (height <= 0 || room <= 0) return 0;
  const shown = Math.min(box.bottom, viewport.bottom) - Math.max(box.top, viewport.top);
  return shown <= 0 ? 0 : shown / Math.min(height, room);
}

export function createExposureTracker({clock = {monotonic: () => performance.now()}, onRead = () => {}}) {
  let session = null, lastSample = 0, lastInteraction = -Infinity;
  return {
    // `paragraphs` come from paragraphRanges plus `words`; `measure(paragraph)` returns its visible fraction.
    start({paragraphs, measure, context}) {
      session = {context, measure, paragraphs:paragraphs.map(item => ({...item, dwell:0, done:false}))};
      lastSample = clock.monotonic(); lastInteraction = lastSample;
    },
    stop() { session = null; },
    interacted() { lastInteraction = clock.monotonic(); },
    sample(pageVisible = true) {
      const now = clock.monotonic(), delta = now - lastSample;
      lastSample = now;
      if (!session || !pageVisible || delta <= 0 || delta > MAX_SAMPLE_GAP_MS || now - lastInteraction > IDLE_MS) return [];
      const read = [];
      for (const paragraph of session.paragraphs) {
        if (paragraph.done || session.measure(paragraph) < VISIBLE_FRACTION) continue;
        paragraph.dwell += delta;
        if (paragraph.dwell >= requiredDwellMs(paragraph.words)) { paragraph.done = true; read.push(paragraph); onRead(paragraph, session.context); }
      }
      return read;
    },
    get active() { return Boolean(session); }
  };
}
