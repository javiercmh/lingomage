// Reader vocabulary-note popover and inline Listen playback.
import { stripRussianStress, withRussianStress } from './reader-text.js';
import { glossaryForTrigger } from './reader-activation.js';
import { speech } from '../bridge.js';
import { prepareSpeechOptions } from './reader-speech.js';

export function createWordNote({
  $, SPEECH_LANGUAGES, readerStory, recordNoteLookup, renderReaderGeneration, showExplanationForHelp, state, toast
}) {
  function closeWordNote(restoreFocus = false) {
    const popover = $('word-note-popover');
    // While Define's popover is open it carries the progress, so the status bar returns when it closes.
    const wasDefine = popover.dataset.define === 'true';
    delete popover.dataset.define;
    if (popover.hidden) { if (wasDefine) renderReaderGeneration(); return; }
    popover.hidden = true;
    if (restoreFocus) state.wordNoteTrigger?.focus();
    state.wordNoteTrigger = null;
    document.querySelectorAll('.gloss-note-trigger[aria-expanded="true"]').forEach(button => { button.removeAttribute('aria-expanded'); button.removeAttribute('aria-controls'); });
    if (wasDefine) renderReaderGeneration();
  }
  let inlineSpeechRun = 0;
  let inlineSpeechButton = null;
  let inlineSpeechStopPending = false;
  function renderInlineSpeech(button, playing, stopping = false) {
    const label = stopping ? 'Stop audio' : playing ? 'Stop audio' : button.dataset.listenLabel;
    button.disabled = !speech.available;
    button.title = speech.available ? label : 'Listening requires App²';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-busy', String(stopping));
    button.dataset.playing = String(playing);
  }
  function createInlineListenButton(text, language, onStart) {
    const listen = document.createElement('button'); listen.type = 'button'; listen.className = 'icon-btn inline-listen';
    listen.dataset.listenLabel = `Listen to ${text || 'expression'}`;
    renderInlineSpeech(listen, false);
    listen.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>';
    listen.disabled = !speech.available || !text;
    listen.addEventListener('click', async () => {
      if (inlineSpeechStopPending) return;
      if (inlineSpeechButton === listen) {
        const run = inlineSpeechRun;
        inlineSpeechStopPending = true;
        renderInlineSpeech(listen, true, true);
        try {
          await speech.stop();
          if (run === inlineSpeechRun && inlineSpeechButton === listen) {
            inlineSpeechRun++;
            inlineSpeechButton = null;
            renderInlineSpeech(listen, false);
          }
        } catch (error) {
          if (run === inlineSpeechRun) { toast(`Could not stop audio: ${error.message}`); renderInlineSpeech(listen, true); }
        } finally {
          inlineSpeechStopPending = false;
        }
        return;
      }
      const run = ++inlineSpeechRun;
      onStart?.();
      const previous = inlineSpeechButton;
      if (previous) {
        inlineSpeechButton = null;
        renderInlineSpeech(previous, false);
        try { await speech.stop(); }
        catch (error) {
          if (run === inlineSpeechRun) toast(`Could not stop audio: ${error.message}`);
          return;
        }
        if (run !== inlineSpeechRun) return;
      }
      inlineSpeechButton = listen;
      renderInlineSpeech(listen, true);
      try {
        const { options } = await prepareSpeechOptions(speech, text, SPEECH_LANGUAGES[language]);
        if (run !== inlineSpeechRun) return;
        await speech.speak(options);
      } catch (error) { if (run === inlineSpeechRun) toast(`Could not play audio: ${error.message}`); }
      finally {
        if (run === inlineSpeechRun) { inlineSpeechButton = null; renderInlineSpeech(listen, false); }
      }
    });
    return listen;
  }
  function showWordNote(trigger, notes, surface = '', helpId = '') {
    const popover = $('word-note-popover');
    if (!popover.hidden && trigger.getAttribute('aria-expanded') === 'true') { closeWordNote(); return; }
    closeWordNote(); popover.textContent = '';
    const lookupInfo = glossaryForTrigger(trigger);
    recordNoteLookup(notes, lookupInfo, 'note');
    for (const note of notes) {
      const item = document.createElement('p'); item.className = 'word-note-entry';
      // Lead with the wording as it appears in the text, so Listen plays the real text; the dictionary form follows.
      const shown = surface.trim() || note.word || '';
      const russian = readerStory().language === 'ru';
      const canonical = russian ? stripRussianStress(note.word || '') : note.word || '';
      const bare = russian ? stripRussianStress(shown) : shown;
      const sameForm = bare.toLowerCase() === canonical.trim().toLowerCase();
      // Russian stress belongs on the wording from the text, never on the dictionary form line.
      let display = shown;
      if (russian) {
        const forms = note.formStress || {};
        const key = Object.hasOwn(forms, bare) ? bare : Object.keys(forms).find(form => form.toLowerCase() === bare.toLowerCase());
        const positions = key ? forms[key] : sameForm ? note.stress : null;
        if (positions) display = withRussianStress(bare, positions);
      }
      const word = document.createElement('strong'); word.textContent = display || 'Word note';
      const meaning = document.createElement('span'); meaning.textContent = note.meaning;
      const heading = document.createElement('span'); heading.className = 'word-note-heading';
      const listen = createInlineListenButton(shown, readerStory().language, () => {
        recordNoteLookup([note], lookupInfo, 'listen');
      });
      heading.append(word, listen); item.append(heading);
      if (note.word && !sameForm) {
        const form = document.createElement('span'); form.className = 'word-note-form'; form.textContent = `Dictionary form: ${canonical}`; item.append(form);
      }
      item.append(meaning); popover.append(item);
    }
    if (helpId) {
      const view = document.createElement('button'); view.type = 'button'; view.className = 'word-note-view'; view.textContent = 'View saved explanation ↓';
      view.addEventListener('click', () => { closeWordNote(); showExplanationForHelp(helpId); });
      popover.append(view);
    }
    trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', 'word-note-popover'); state.wordNoteTrigger = trigger; popover.hidden = false; popover.focus();
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(12, Math.min(window.innerWidth - 292, rect.left));
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.min(window.innerHeight - 20, rect.bottom + 8)}px`;
    requestAnimationFrame(() => {
      const box = popover.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 12) popover.style.top = `${Math.max(12, rect.top - box.height - 8)}px`;
    });
  }
  return { closeWordNote, createInlineListenButton, showWordNote };
}
