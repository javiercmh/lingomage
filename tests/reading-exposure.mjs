import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExposureTracker, paragraphRanges, wordCount, requiredDwellMs, visibleFraction, IDLE_MS, MIN_DWELL_MS, SAMPLE_MS, MAX_SAMPLE_GAP_MS} from '../js/reading-exposure.js';

// --- Paragraphs and word counts -------------------------------------------------------------------------
{
  const text = 'Erste Zeile hier.\n\nZweite Zeile.\n   \nDritte.';
  assert.deepEqual(paragraphRanges(text).map(p => [p.index, p.text, text.slice(p.start, p.end)]), [[0, 'Erste Zeile hier.', 'Erste Zeile hier.'], [1, 'Zweite Zeile.', 'Zweite Zeile.'], [2, 'Dritte.', 'Dritte.']]);
  assert.equal(wordCount('Sie kauft heute Brot.', 'de-DE'), 4);
  assert.ok(wordCount('猫が魚を食べている。', 'ja-JP') >= 4, 'Japanese is segmented without spaces');
  assert.equal(wordCount('', 'de-DE'), 0);
  assert.equal(requiredDwellMs(1), MIN_DWELL_MS);
  assert.equal(requiredDwellMs(400), 60000, '400 words need a minute at the speed ceiling');
}

// --- Visible fraction is relative to the smaller of paragraph and viewport ----------------------------------
{
  const viewport = {top: 0, bottom: 800};
  assert.equal(visibleFraction({top: 100, bottom: 200}, viewport), 1);
  assert.equal(visibleFraction({top: 750, bottom: 850}, viewport), 0.5);
  assert.equal(visibleFraction({top: 900, bottom: 1000}, viewport), 0);
  assert.equal(visibleFraction({top: -500, bottom: 2000}, viewport), 1, 'a paragraph taller than the screen filling it counts as visible');
  assert.equal(visibleFraction(null, viewport), 0);
}

// --- Dwell rules ----------------------------------------------------------------------------------------
function harness(paragraphs, visible = () => 1) {
  const clock = {mono: 1000, monotonic() { return this.mono; }};
  const reads = [];
  const tracker = createExposureTracker({clock, onRead: (paragraph, context) => reads.push([paragraph.index, context.storyId])});
  tracker.start({paragraphs, measure: visible, context: {storyId: 's1'}});
  const step = (ms, pageVisible = true) => { clock.mono += ms; return tracker.sample(pageVisible); };
  return {clock, tracker, reads, step};
}
{
  // 20 words need 3 s at 400 wpm.
  const h = harness([{index: 0, words: 20}, {index: 1, words: 20}], p => p.index === 0 ? 1 : 0);
  h.step(SAMPLE_MS); h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [], 'not yet long enough');
  h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [[0, 's1']], 'visible paragraph counts once its dwell reaches the threshold');
  for (let i = 0; i < 10; i++) h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [[0, 's1']], 'counts once per session; off-screen paragraph never counts');
}
{
  const h = harness([{index: 0, words: 20}]);
  h.step(SAMPLE_MS); h.step(SAMPLE_MS, false); h.step(SAMPLE_MS, false); h.step(SAMPLE_MS, false);
  assert.deepEqual(h.reads, [], 'hidden page does not accrue');
  h.step(MAX_SAMPLE_GAP_MS + 1);
  assert.deepEqual(h.reads, [], 'a long unexplained gap is discarded');
}
{
  const h = harness([{index: 0, words: 20}]);
  h.clock.mono += IDLE_MS + 1; h.tracker.sample();
  h.step(SAMPLE_MS); h.step(SAMPLE_MS); h.step(SAMPLE_MS); h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [], 'no interaction for over a minute stops accrual');
  h.tracker.interacted();
  h.step(SAMPLE_MS); h.step(SAMPLE_MS); h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [[0, 's1']], 'interaction resumes accrual');
}
{
  // Quickly scrolling past: visible for one sample only.
  let visibleNow = true;
  const h = harness([{index: 0, words: 20}], () => visibleNow ? 1 : 0);
  h.step(SAMPLE_MS); visibleNow = false;
  for (let i = 0; i < 5; i++) h.step(SAMPLE_MS);
  assert.deepEqual(h.reads, [], 'scrolling past does not count');
  h.tracker.stop();
  assert.equal(h.tracker.active, false);
  assert.deepEqual(h.tracker.sample(), []);
}

// --- App wiring: lookups recorded after user actions; exposure follows the rendered chapter -----------------
{
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /recordNoteLookup\(notes, glossaryForTrigger\(trigger\), 'note'\)/);
  assert.match(app, /recordNoteLookup\(\[note\], glossaryForTrigger\(trigger\), 'listen'\)/);
  assert.match(app, /opened = true; \}[\s\S]{0,200}if \(opened\) recordSelectionLookup\(passage, 'translate'\)/, 'translate records only after the translator opened');
  assert.match(app, /recordSelectionLookup\(passage, action === 'initial' \? 'explain' : action\);\n\s*toast\('Explanation saved'\)/, 'explain and follow-ups record only after the result is saved');
  assert.match(app, /recordSelectionLookup\(passage, 'examples'\)/);
  assert.match(app, /passage\.kind === 'title'/, 'title selections are not recorded');
  assert.match(app, /startExposure\(story, version\)/);
  assert.match(app, /usage\.setReader\(null\); stopExposure\(\)/);
}

console.log('PASS reading exposure: paragraphs, word counts, dwell rules and app wiring');
