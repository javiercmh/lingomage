// Reader: fitting the chapter title beside Listen, and whole-chapter listening (start, stop, ownership).
// The code is the former js/reader-help.js section, moved verbatim; app.js calls createReaderListen where it used to be.
import { chapterSpeechText, speakChapter } from './reader-speech.js';
import { speech } from '../bridge.js';

export function createReaderListen({
  $, activeChapter, activeVersion, readerStory, runReaderPlayer, runtime, SPEECH_LANGUAGES, state, toast,
  trackedSpeech, usage
}) {
  let readerSpeechRun = 0;
  let readerSpeechKey = '';
  let readerSpeechOwner = 0;
  let readerSpeechStop = null;
  // Flex sizing retains empty space after wrapped lines. Shrink the title box to
  // its widest rendered line so Listen stays beside the words at every width.
  function fitReaderTitle() {
    const title = $('reader-title');
    title.style.maxWidth = '';
    if (!title.getClientRects().length || !title.firstChild) return;
    const range = document.createRange();
    range.selectNodeContents(title);
    // Furigana splits a line into several rects, so measure from the title's left edge to the furthest right.
    const left = title.getBoundingClientRect().left;
    const width = Math.max(0, ...Array.from(range.getClientRects(), rect => rect.right - left));
    if (width) title.style.maxWidth = `${Math.ceil(width)}px`;
  }
  new ResizeObserver(fitReaderTitle).observe($('reader-title').parentElement);
  function renderReaderListen() {
    const button = $('reader-listen');
    const playing = Boolean(readerSpeechKey && readerSpeechKey === state.speechVersionKey);
    const stopping = Boolean(readerSpeechStop);
    const label = stopping ? 'Stopping chapter audio…' : playing ? 'Stop reading this chapter' : 'Listen to this chapter';
    button.disabled = !speech.available || stopping;
    button.title = speech.available ? label : 'Listening requires App²';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-busy', String(stopping));
    button.setAttribute('data-playing', String(playing));
    button.setAttribute('aria-pressed', String(playing));
  }
  function stopSpeech(reportError = false) {
    // Invalidate queued utterances before sending Stop, including pending voice lookup.
    readerSpeechRun++;
    state.player?.halt();
    const key = readerSpeechKey;
    if (!reportError) readerSpeechKey = '';
    if (!speech.available) { readerSpeechKey = ''; state.player?.release(); renderReaderListen(); return Promise.resolve(); }
    if (readerSpeechStop) { renderReaderListen(); return readerSpeechStop; }
    const owner = readerSpeechOwner;
    readerSpeechStop = Promise.resolve().then(() => trackedSpeech.stop()).then(() => {
      if (owner === readerSpeechOwner) readerSpeechKey = '';
      state.player?.release();
    }).catch(error => {
      // An explicit failed stop stays retryable while its utterance is still active.
      if (reportError && readerSpeechKey === key && key === state.speechVersionKey && $('reader-dialog').open) toast(`Could not stop audio: ${error.message}`);
    }).finally(() => { readerSpeechStop = null; renderReaderListen(); });
    renderReaderListen();
    return readerSpeechStop;
  }
  $('reader-listen').addEventListener('click', async () => {
    const story = readerStory(); if (!story || !speech.available || readerSpeechStop) return;
    if (readerSpeechKey && readerSpeechKey === state.speechVersionKey) { await stopSpeech(true); return; }
    const version = activeVersion(activeChapter(story));
    const key = state.speechVersionKey, run = ++readerSpeechRun;
    runtime.playbackContext = { storyId: story.id, language: story.language };
    readerSpeechOwner = run; readerSpeechKey = key;
    renderReaderListen();
    const isCurrent = () => run === readerSpeechRun && key === state.speechVersionKey && $('reader-dialog').open;
    const text = chapterSpeechText(version, story.title);
    try {
      if (state.playerEnabled) await runReaderPlayer(story, version, isCurrent);
      else await speakChapter(trackedSpeech, text, SPEECH_LANGUAGES[story.language], isCurrent);
    }
    catch (error) { if (isCurrent()) toast(`Could not play audio: ${error.message}`); }
    finally {
      // Ownership outlives cancellation, but an old completion cannot reset a new run.
      if (run === readerSpeechOwner) { readerSpeechKey = ''; renderReaderListen(); }
      usage.checkpoint();
    }
  });
  return {
    fitReaderTitle, renderReaderListen, stopSpeech
  };
}
