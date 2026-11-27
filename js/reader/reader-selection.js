// Reader: text selection and its toolbar (position, translation availability, press handling) and the selection
// actions Translate, Listen, Define, Explain and Copy. PED-002.
// The code is the former js/reader-help.js section, moved verbatim, with the selection actions (formerly at the end of
// that module) moved up beside the toolbar; app.js calls createReaderSelection where the section used to be.
import { getCanonicalSelection } from './reader-text.js';
import { speakSelection } from './reader-speech.js';
import { speech, translation } from '../bridge.js';

export function createReaderSelection({
  $, activeChapter, activeVersion, closeWordNote, defineSelection, explainSelection, profileSnapshot,
  readerStory, recordSelectionLookup, sentenceContext, SPEECH_LANGUAGES, state, toast
}) {
  function selectedTitle() {
    const value = getCanonicalSelection($('reader-title')); if (!value || !value.text.trim()) return null;
    const story = readerStory(), chapter = activeChapter(story), version = activeVersion(chapter);
    return { ...value, kind: 'title', storyId: story.id, chapterId: chapter.id, versionId: version.id, language: story.language, languageTag: SPEECH_LANGUAGES[story.language] || 'en', rect: window.getSelection().getRangeAt(0).getBoundingClientRect() };
  }
  function selectedPassage() { return selectedBodyPassage() || selectedTitle(); }
  function selectedBodyPassage() {
    const value = getCanonicalSelection($('reader-story')); if (!value || !value.text.trim()) return null;
    const story = readerStory(), chapter = activeChapter(story), version = activeVersion(chapter);
    const selection = window.getSelection(), range = selection.getRangeAt(0);
    return { ...value, sentence: sentenceContext(version.story, value.start, value.end), storyId: story.id, chapterId: chapter.id, versionId: version.id, language: story.language, languageTag: SPEECH_LANGUAGES[story.language] || 'en', profile: profileSnapshot(story), rect: range.getBoundingClientRect() };
  }
  function positionSelectionToolbar(rect = state.readerSelection?.rect) {
    const toolbar = $('selection-toolbar'); if (!rect || toolbar.hidden) return;
    const gap = 10, margin = 8, vw = window.innerWidth, vh = window.visualViewport?.height || window.innerHeight;
    const topLimit = margin;
    const { width, height } = toolbar.getBoundingClientRect();
    const left = Math.max(margin, Math.min(vw - width - margin, rect.left + rect.width / 2 - width / 2));
    // Prefer above the selection; fall back to below, clear of mobile selection handles.
    const above = rect.top - height - gap, handles = matchMedia('(pointer: coarse)').matches ? 26 : 0;
    const below = rect.bottom + gap + handles;
    const top = above >= topLimit ? above : Math.min(below, vh - height - margin);
    toolbar.style.left = `${Math.round(left)}px`;
    toolbar.style.top = `${Math.round(Math.max(topLimit, top))}px`;
    toolbar.classList.toggle('below-selection', above < topLimit);
    toolbar.classList.toggle('title-selection', state.readerSelection?.kind === 'title');
  }
  function showSelectionToolbar() {
    const passage = selectedPassage(); const toolbar = $('selection-toolbar');
    if (!passage) { toolbar.hidden = true; state.readerSelection = null; return; }
    const translationSelectionChanged = toolbar.hidden || !state.readerSelection ||
      ['storyId', 'chapterId', 'versionId', 'start', 'end', 'text'].some(key => passage[key] !== state.readerSelection[key]);
    if (!state.readerSelection || passage.text !== state.readerSelection.text) closeWordNote();
    state.readerSelection = passage; toolbar.hidden = false;
    if (translationSelectionChanged) refreshTranslationAvailability();
    $('selection-speak').disabled = !speech.available;
    $('selection-speak').title = speech.available ? 'Speak selected text' : 'Speech is available in App².';
    positionSelectionToolbar(passage.rect);
  }
  let translationAvailability = 'unknown';
  let translationLaunching = false;
  let translationCheckId = 0;
  let translationCheckPending = false;
  function renderTranslationButton() {
    const button = $('selection-translate');
    button.disabled = translationLaunching || translationAvailability !== 'available';
    button.title = translationLaunching ? 'Opening device translator' :
      translationAvailability === 'available' ? 'Open selected text in your device translator' :
      translationAvailability === 'unavailable' ? 'No device translation handler is available. Requires a supported App² host.' :
      translationCheckPending ? 'Checking device translation availability' : 'Select text again to check device translation availability.';
  }
  async function refreshTranslationAvailability() {
    if (document.hidden) return;
    const checkId = ++translationCheckId;
    translationCheckPending = true;
    renderTranslationButton();
    try {
      const { available } = await translation.availability();
      if (checkId === translationCheckId && !document.hidden) {
        translationAvailability = available ? 'available' : 'unavailable';
      }
    } catch {
      // A background rejection or timeout does not invalidate a confirmed handler.
    } finally {
      if (checkId === translationCheckId) {
        translationCheckPending = false;
        renderTranslationButton();
      }
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      translationCheckId++;
      translationCheckPending = false;
      renderTranslationButton();
    }
  });
  window.addEventListener('resize', () => { if (!$('selection-toolbar').hidden) showSelectionToolbar(); });
  document.addEventListener('scroll', () => { if (!$('selection-toolbar').hidden) showSelectionToolbar(); }, true);
  window.visualViewport?.addEventListener('resize', () => { if (!$('selection-toolbar').hidden) showSelectionToolbar(); });
  let selectionTimer;
  document.addEventListener('selectionchange', () => { clearTimeout(selectionTimer); selectionTimer = setTimeout(showSelectionToolbar, 180); });
  let selectionPressedButton = null;
  let selectionPressOrigin = null;
  let selectionPressCancelled = false;
  function clearSelectionPress() {
    selectionPressedButton?.classList.remove('selection-action-pressed');
    selectionPressedButton = null;
  }
  $('selection-toolbar').addEventListener('pointerdown', event => {
    event.preventDefault(); clearTimeout(selectionTimer); clearSelectionPress();
    selectionPressOrigin = null; selectionPressCancelled = false;
    const button = event.target.closest('button');
    if (event.button !== 0 || !button || button.disabled) return;
    selectionPressOrigin = selectionPressedButton = button;
    button.classList.add('selection-action-pressed');
  });
  $('selection-toolbar').addEventListener('pointerleave', clearSelectionPress);
  $('selection-toolbar').addEventListener('click', event => {
    if (event.detail && selectionPressCancelled) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  document.addEventListener('pointerup', event => {
    if (selectionPressOrigin) {
      const rect = selectionPressOrigin.getBoundingClientRect();
      selectionPressCancelled = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      selectionPressOrigin = null;
    }
    clearSelectionPress();
  });
  function cancelSelectionPress() {
    if (selectionPressOrigin) selectionPressCancelled = true;
    selectionPressOrigin = null; clearSelectionPress();
  }
  document.addEventListener('pointercancel', cancelSelectionPress);
  window.addEventListener('blur', cancelSelectionPress);
  function runSelectionAction(button, action) {
    if (button.getAttribute('aria-busy') === 'true') return Promise.resolve();
    button.classList.add('selection-action-active');
    button.setAttribute('aria-busy', 'true');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      button.classList.remove('selection-action-active');
      button.setAttribute('aria-busy', 'false');
    };
    return Promise.resolve().then(() => action(finish)).finally(finish);
  }
  $('selection-translate').addEventListener('click', () => {
    void runSelectionAction($('selection-translate'), async () => {
      const passage = state.readerSelection;
      if (!passage || translationLaunching || translationAvailability !== 'available') return;
      translationLaunching = true; renderTranslationButton();
      let opened = false;
      try { await translation.open({ text: passage.text }); opened = true; }
      catch (error) { toast(`Could not open translator: ${error.message}`); }
      finally { translationLaunching = false; renderTranslationButton(); }
      if (opened) recordSelectionLookup(passage, 'translate');
    });
  });
  $('selection-speak').addEventListener('click', () => {
    void runSelectionAction($('selection-speak'), async () => {
      const passage = state.readerSelection; if (!passage || !speech.available) return;
      try { await speakSelection(speech, passage.text, passage.languageTag); }
      catch (error) { toast(`Could not play audio: ${error.message}`); }
    });
  });
  $('selection-define').addEventListener('click', () => {
    if (state.readerSelection?.kind === 'title') return;
    void runSelectionAction($('selection-define'), () => defineSelection(state.readerSelection));
  });
  $('selection-explain').addEventListener('click', () => {
    if (state.readerSelection?.kind === 'title') return;
    void runSelectionAction($('selection-explain'), finish => explainSelection('explain', 'initial', '', state.readerSelection, () => {
      $('selection-toolbar').hidden = true;
      finish();
    }));
  });
  $('selection-copy').addEventListener('click', () => {
    void runSelectionAction($('selection-copy'), async () => {
      const passage = state.readerSelection; if (!passage) return;
      // The reader's copy listener writes the canonical text, without furigana.
      try {
        if (!document.execCommand('copy')) await navigator.clipboard.writeText(passage.text);
        window.getSelection()?.removeAllRanges();
        clearTimeout(selectionTimer);
        state.readerSelection = null;
        $('selection-toolbar').hidden = true;
      }
      catch { toast('Could not copy the selection.'); }
    });
  });
  return {};
}
