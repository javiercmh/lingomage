// Learner tracking wiring: time tracking (usage, tracked speech), lookup history and reading exposure (PED-005).
// All of it is optional data and never blocks reading. See docs/architecture/learner-tracking.md.
// The code is the former app.js section, moved verbatim; app.js calls createLearnerTracking where it used to be.
import { SAMPLE_MS, createExposureTracker, paragraphRanges, visibleFraction, wordCount } from './reading-exposure.js';
import { SIGNALS_PATH, USAGE_PATH } from '../core/workspace-storage.js';
import { canonicalRange } from '../reader/reader-player.js';
import { createSignalsTracker } from './consultation-signals.js';
import { createUsageTracker } from './usage-tracker.js';
import { findGlossaryMatches } from '../reader/reader-text.js';
import { speech } from '../bridge.js';

export function createLearnerTracking({
  $, activeChapter, activeVersion, readerPanel, readerStory, renderLookupStatus, renderUsageStatus, runtime,
  sentenceContext, SPEECH_LANGUAGES, state, workspaceStorage
}) {
  // Time tracking is optional data: an unreadable usage file never blocks stories, settings or generation.
  const usage = createUsageTracker({persistence:{load:() => workspaceStorage.load(USAGE_PATH), save:value => workspaceStorage.save(USAGE_PATH, value)}, onStatus:status => renderUsageStatus(status)});
  // Chapter audio keeps the story it started with (runtime.playbackContext), even if the reader changes while Stop is pending.
  const trackedSpeech = usage.trackSpeech(speech, () => runtime.playbackContext);
  // Lookup history and reading exposure (PED-005) are optional data like usage: recording never blocks reading.
  const signals = createSignalsTracker({persistence:{load:() => workspaceStorage.load(SIGNALS_PATH), save:value => workspaceStorage.save(SIGNALS_PATH, value)}, onStatus:status => renderLookupStatus(status)});
  function recordLookup(entry) { try { signals.record(entry); } catch (error) { console.error('Could not record lookup', error); } }
  function recordNoteLookup(notes, info, action) {
    const story = readerStory(), version = story && activeVersion(activeChapter(story)); if (!version) return;
    const sentence = info && Number.isInteger(info.start) ? sentenceContext(version.story, info.start, info.end) : '';
    for (const note of notes) if (note?.word && note.meaning) recordLookup({language:story.language, kind:'note', word:note.word, meaning:note.meaning, action, sentence, where:`${story.id}/${version.id}`});
  }
  // Paragraphs on screen long enough to read count as exposure for tracked items (PED-005).
  const exposure = createExposureTracker({onRead:(paragraph, context) => {
    try { signals.recordExposure({...context, paragraphIndex:paragraph.index, text:paragraph.text, words:paragraph.words, notes:paragraph.notes}); }
    catch (error) { console.error('Could not record reading', error); }
  }});
  let exposureTimer = null, exposureListening = false;
  function listenForReading() {
    if (exposureListening) return; exposureListening = true;
    const interacted = () => exposure.interacted();
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) $('reader-dialog').addEventListener(type, interacted, { passive: true });
    const panel = readerPanel(); panel.addEventListener('scroll', interacted, { passive: true });
  }
  function startExposure(story, version) {
    listenForReading();
    const root = $('reader-story'), language = SPEECH_LANGUAGES[story.language] || story.language;
    const matches = findGlossaryMatches(version.story, version.glossary || []);
    const paragraphs = paragraphRanges(version.story).map(paragraph => ({...paragraph, words:wordCount(paragraph.text, language),
      notes:matches.filter(match => match.start >= paragraph.start && match.end <= paragraph.end).flatMap(match => match.notes.map(note => ({word:note.word, meaning:note.meaning, count:1})))}));
    exposure.start({paragraphs, context:{language:story.language, storyId:story.id, versionId:version.id}, measure:paragraph => {
      const box = canonicalRange(root, paragraph.start, paragraph.end)?.getBoundingClientRect(), panel = readerPanel().getBoundingClientRect();
      return visibleFraction(box, {top:Math.max(0, panel.top), bottom:Math.min(window.innerHeight, panel.bottom)});
    }});
    if (!exposureTimer) {
      exposureTimer = setInterval(() => { try { if ($('reader-dialog').open) exposure.sample(document.visibilityState === 'visible'); } catch (error) { console.error('Could not measure reading', error); } }, SAMPLE_MS);
      if (typeof exposureTimer === 'object') exposureTimer?.unref?.();
    }
  }
  function stopExposure() { exposure.stop(); if (exposureTimer) clearInterval(exposureTimer); exposureTimer = null; }
  function recordSelectionLookup(passage, action) {
    if (!passage || passage.kind === 'title' || !passage.text?.trim()) return;
    const story = state.stories.find(item => item.id === passage.storyId) || readerStory();
    const version = story?.chapters?.find(item => item.id === passage.chapterId)?.versions.find(item => item.id === passage.versionId);
    const sentence = passage.sentence || (version && Number.isInteger(passage.start) ? sentenceContext(version.story, passage.start, passage.end) : '');
    recordLookup({language:passage.language || story?.language, kind:'selection', word:passage.text, action, sentence, where:`${passage.storyId}/${passage.versionId}`});
  }
  return {
    recordNoteLookup, recordSelectionLookup, signals, startExposure, stopExposure, trackedSpeech, usage
  };
}
