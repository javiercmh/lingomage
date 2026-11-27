// Reader: the sentence-level listening player (floating controls, spoken-sentence highlight, Follow, rate).
// The code is the former app.js section, moved verbatim; app.js calls createReaderPlayerUi where it used to be.
// Playback itself is js/reader/reader-player.js.
import { speechUnits, createReaderPlayer, canonicalRange } from './reader-player.js';
import { speech } from '../bridge.js';

export function createReaderPlayerUi({
  $, SPEECH_LANGUAGES, clearExplanationSelection, closeWordNote, readerPanel, state, stopSpeech, toast,
  trackedSpeech, trySaveSettings
}) {
  // Sentence-level listening player: floating controls, spoken-sentence highlight and Follow.
  let playerCollapseTimer = 0, playerScrubbing = false;
  const PLAYER_ICON_LABELS = { paused: ['Resume', 'Resume listening'], playing: ['Pause', 'Pause listening'] };
  async function runReaderPlayer(story, version, isCurrent) {
    const language = SPEECH_LANGUAGES[story.language];
    const units = speechUnits(version.title || story.title, version.story, language);
    const player = createReaderPlayer({ speech: trackedSpeech, units, language, rate: state.speechRate, onChange: renderPlayer,
      onError: error => { if (isCurrent()) toast(`Could not play audio: ${error.message}`); } });
    state.player = player; state.playerUnits = units; state.playerRate = state.speechRate; state.following = state.followAlong;
    $('player-rate').value = String(state.speechRate); renderPlayerFollow(); setPlayerExpanded(false);
    player.play(0);
    await player.done;
    if (state.player === player) { state.player = null; state.playerUnits = []; renderPlayer({ state: 'idle' }); }
  }
  function clearSpeechHighlight() { if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('speaking'); }
  function speechRange(unit) {
    if (unit.source === 'title') {
      return canonicalRange($('reader-title'), unit.start, unit.end);
    }
    return canonicalRange($('reader-story'), unit.start, unit.end);
  }
  function renderPlayer({ state: mode, index = 0, count = 0 }) {
    const active = mode === 'playing' || mode === 'paused';
    $('reader-player-anchor').hidden = !active; readerPanel().classList.toggle('has-player', active);
    if (!active) { clearSpeechHighlight(); clearTimeout(playerCollapseTimer); return; }
    $('player-count').textContent = `${index + 1} / ${count}`;
    const toggle = $('player-toggle'), [label, title] = PLAYER_ICON_LABELS[mode];
    toggle.dataset.paused = String(mode === 'paused'); toggle.setAttribute('aria-label', label); toggle.title = title;
    const scrub = $('player-scrub'); scrub.max = String(count);
    if (!playerScrubbing) scrub.value = String(index + 1);
    scrub.setAttribute('aria-valuetext', `Sentence ${index + 1} of ${count}`);
    const unit = state.playerUnits[index], range = unit && speechRange(unit);
    if (range && typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function') CSS.highlights.set('speaking', new Highlight(range));
    if (range && state.following && mode === 'playing') followSpeech(range);
  }
  function followSpeech(range) {
    const panel = readerPanel(), box = panel.getBoundingClientRect(), rect = range.getBoundingClientRect();
    const top = $('reader-player').getBoundingClientRect().bottom + 16, bottom = box.bottom - 24;
    if (rect.top >= top && rect.bottom <= bottom) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    panel.scrollBy({ top: rect.top - (top + (bottom - top) * .2), behavior: reduce ? 'auto' : 'smooth' });
  }
  function renderPlayerFollow() { $('player-follow').setAttribute('aria-pressed', String(Boolean(state.following))); }
  function setPlayerExpanded(open) {
    clearTimeout(playerCollapseTimer);
    $('player-more').hidden = !open; $('reader-player').dataset.expanded = String(open);
    $('player-expand').setAttribute('aria-expanded', String(open));
    $('player-expand').setAttribute('aria-label', open ? 'Fewer listening controls' : 'More listening controls');
    if (open) playerCollapseTimer = setTimeout(() => setPlayerExpanded(false), 5000);
  }
  function announceSentence() { const { index, count } = state.player.snapshot; $('player-live').textContent = `Sentence ${index + 1} of ${count}`; }
  $('player-toggle').addEventListener('click', () => { const player = state.player; if (player) player.snapshot.state === 'playing' ? player.pause() : player.resume(); });
  $('player-prev').addEventListener('click', () => { if (!state.player) return; state.player.previous(); announceSentence(); });
  $('player-next').addEventListener('click', () => { if (!state.player) return; state.player.next(); announceSentence(); });
  $('player-stop').addEventListener('click', () => stopSpeech(true));
  $('player-expand').addEventListener('click', () => setPlayerExpanded($('player-more').hidden));
  $('player-scrub').addEventListener('input', event => { playerScrubbing = true; $('player-count').textContent = `${event.target.value} / ${event.target.max}`; });
  $('player-scrub').addEventListener('change', event => { playerScrubbing = false; if (state.player) { state.player.seek(Number(event.target.value) - 1); announceSentence(); } });
  $('player-rate').addEventListener('change', event => {
    state.speechRate = Number(event.target.value); state.playerRate = state.speechRate; state.player?.setRate(state.speechRate);
    // A failed save restores the saved speed on the select and the playing utterance (syncSettingsControls).
    trySaveSettings();
  });
  $('player-follow').addEventListener('click', () => {
    const wasFollowing = Boolean(state.following);
    state.following = !state.following; state.followAlong = state.following; renderPlayerFollow();
    // The rollback restores the saved preference; this playback also returns to how it was following.
    if (!trySaveSettings()) { if (state.player) state.following = wasFollowing; renderPlayerFollow(); return; }
    if (state.following && state.player) { const unit = state.playerUnits[state.player.snapshot.index], range = unit && speechRange(unit); if (range) followSpeech(range); }
  });
  $('reader-player').addEventListener('pointerdown', () => { if (!$('player-more').hidden) setPlayerExpanded(true); });
  $('reader-story').addEventListener('pointerdown', () => { if (!$('player-more').hidden) setPlayerExpanded(false); });
  // Scrolling by hand takes over from Follow for this playback; the saved preference is unchanged.
  for (const type of ['wheel', 'touchmove']) readerPanel().addEventListener(type, event => {
    if (!state.player || !state.following || event.target.closest?.('#reader-player')) return;
    state.following = false; renderPlayerFollow();
  }, { passive: true });
  state.playerEnabled = speech.available;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('word-note-popover').hidden) {
      event.preventDefault(); event.stopPropagation(); closeWordNote(true); return;
    }
    if (event.key === 'Escape' && state.explanationSelectionMode && $('reader-dialog').open) {
      event.preventDefault(); clearExplanationSelection();
    }
  });
  return {
    renderPlayerFollow, runReaderPlayer
  };
}
