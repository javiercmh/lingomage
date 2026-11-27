// Reader: text selection and its toolbar (Explain, Translate, Define, Listen, Copy), chapter and selection listening,
// vocabulary-note activation, explanations with follow-ups and examples, saved help cards, the chapter status
// card and the share dialog's opening. PED-002.
// The code is the former app.js section, moved verbatim except that bindings other app.js code reassigns are
// read through accessors (currentPipeline(), currentReaderGeneration(), currentBackgroundRun(), setPlaybackContext()).
// app.js calls createReaderHelp where the section used to be.
import { getCanonicalSelection, japaneseSegments, applyExplainedMarks } from './reader-text.js';
import { canonicalRange } from './reader-player.js';
import { speech, translation, ai, save, share, isNative } from './bridge.js';
import { chapterSpeechText, speakChapter, speakSelection } from './reader-speech.js';
import { normalizeReaderControls, createReaderActivation, glossaryForTrigger } from './reader-activation.js';
import { aiNotification } from './ai-notification.js';
import { timingEntry } from './generation-timing.js';
import { saveBeforeAcknowledge } from './request-lifecycle.js';
import { failureInfo, appendFailureDetails, recoverySummary } from './generation-errors.js';
import { helpInstructions, DEFINE_INSTRUCTIONS, PROMPT_VERSION } from './prompts.js';
import { lightModelChoice, lightTaskConfig } from './light-model.js';
import { validateDefinedNote } from './learning-validation.js';
import { markStoryActivity } from './library-activity.js';
import { shareTargets } from './story-share.js';
import { pathLabel } from './story-model.js';

export function createReaderHelp({
  $, LANGUAGES, SPEECH_LANGUAGES, activeChapter, activeVersion, aiSession, cancelGeneration, closeWordNote,
  createInlineListenButton, currentBackgroundRun, currentPipeline, currentReaderGeneration,
  finishGeneratedRequest, normalizeChapters, pathChapters, pendingDeletionBlocked, persistReaderStory,
  profileSnapshot, readerPanel, readerStory, recordSelectionLookup, renderCheckpointRecovery,
  renderReaderGeneration, resetCopyLabels, revealCard, runContentOperation, runReaderPlayer, selectedPath,
  sentenceContext, setPlaybackContext, setReaderGeneration, showOperationResult, showWordNote, state,
  stopBackgroundContext, toast, trackedSpeech, updateReader, updateShareSummaries, usage, wireLongPress,
  workspaceStorage
}) {
  // PED-002: retain the exact fragment and locate it in canonical context.
  let readerSpeechRun = 0;
  let readerSpeechKey = '';
  let readerSpeechOwner = 0;
  let readerSpeechStop = null;
  function helpContext(text, start, end) {
    const boundary = /[.!?。！？\n]/u;
    let left = start;
    while (left > 0 && !boundary.test(text[left - 1])) left--;
    let right = end;
    if (!boundary.test(text[end - 1] || '')) {
      while (right < text.length && !boundary.test(text[right])) right++;
      if (right < text.length) right++;
    }
    return { sentence: text.slice(left, right), selectionStart: start - left, selectionEnd: end - left };
  }
  function validTextRange(text, start, end) {
    const boundary = offset => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length && boundary(start) && boundary(end);
  }
  function resolvedHelpContext(source, passage, result) {
    const valid = validTextRange(source, result.contextStart, result.contextEnd) && result.contextStart <= passage.start && result.contextEnd >= passage.end;
    if (valid) return { contextStart: result.contextStart, contextEnd: result.contextEnd, contextTranslation: result.contextTranslation || '' };
    const fallback = helpContext(source, passage.start, passage.end);
    const start = passage.start - fallback.selectionStart;
    // A translation of an invalid excerpt need not match the fallback sentence.
    return { contextStart: start, contextEnd: start + fallback.sentence.length, contextTranslation: '' };
  }
  function savedFollowUps(item) {
    return item.followUps || (item.more ? [{ ...(item.detailProvenance || {}), action: 'detail', text: item.more }] : []);
  }
  function overlappingHelp(chapter, versionId, start, end) {
    return (chapter.help || []).filter(entry => entry.versionId === versionId && Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.start < end && start < entry.end);
  }
  function confirmReplaceHelp(items) {
    const dialog = $('replace-help-dialog');
    const quotes = items.map(entry => `“${entry.passage.length > 40 ? `${entry.passage.slice(0, 40)}…` : entry.passage}”`).join(', ');
    $('replace-help-message').textContent = items.length === 1
      ? `This selection overlaps the saved explanation for ${quotes}. The new explanation will replace it, along with its follow-ups and examples.`
      : `This selection overlaps ${items.length} saved explanations (${quotes}). The new explanation will replace them, along with their follow-ups and examples.`;
    return new Promise(resolve => {
      let answer = false;
      const done = value => { answer = value; dialog.close(); };
      const onConfirm = () => done(true), onCancel = () => done(false);
      $('replace-help-confirm').addEventListener('click', onConfirm); $('replace-help-cancel').addEventListener('click', onCancel);
      dialog.addEventListener('close', () => {
        $('replace-help-confirm').removeEventListener('click', onConfirm); $('replace-help-cancel').removeEventListener('click', onCancel);
        resolve(answer);
      }, { once: true });
      dialog.showModal(); $('replace-help-cancel').focus();
    });
  }
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
    setPlaybackContext({ storyId: story.id, language: story.language });
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
  // A press outside an open vocabulary note only closes it: the click that follows on story text does not open
  // another note or jump to an explanation. Controls outside the story still act on the same press.
  let noteDismissPress = false;
  const noteDismissClicks = new WeakSet();
  $('reader-dialog').addEventListener('pointerdown', event => {
    noteDismissPress = !$('word-note-popover').hidden && !event.target.closest?.('#word-note-popover');
    if (noteDismissPress) closeWordNote();
  });
  function activateStoryText(event) {
    if (event.type === 'click' && (noteDismissPress || noteDismissClicks.has(event))) { noteDismissPress = false; noteDismissClicks.add(event); return; }
    activateReaderText(event);
  }
  function renderHighlightedText(container, canonical, segments, highlightStart, highlightEnd, excerptStart = 0, excerptEnd = canonical.length) {
    container.textContent = '';
    container.classList.toggle('hide-furigana', !state.furigana);
    const parts = /\p{Script=Han}/u.test(canonical) ? japaneseSegments(canonical, segments) : Array.isArray(segments) && segments.every(part => part && typeof part.text === 'string') && segments.map(part => part.text).join('') === canonical ? segments : [{ text: canonical }];
    let offset = 0;
    for (const part of parts) {
      const partStart = offset; offset += part.text.length;
      const left = Math.max(excerptStart, partStart), right = Math.min(excerptEnd, offset);
      if (right <= left) continue;
      const target = part.reading && left === partStart && right === offset ? document.createElement('ruby') : container;
      const boundaries = [...new Set([left, right, Math.max(left, Math.min(right, highlightStart)), Math.max(left, Math.min(right, highlightEnd))])].sort((a, b) => a - b);
      for (let index = 0; index < boundaries.length - 1; index++) {
        const start = boundaries[index], end = boundaries[index + 1];
        const text = canonical.slice(start, end);
        if (start >= highlightStart && end <= highlightEnd) {
          const mark = document.createElement('mark'); mark.className = 'help-highlight'; mark.textContent = text; target.append(mark);
        } else target.append(document.createTextNode(text));
      }
      if (target !== container) {
        const rt = document.createElement('rt'); rt.textContent = part.reading; target.append(rt); container.append(target);
      }
    }
    container.addEventListener('copy', event => {
      const selection = getCanonicalSelection(container); if (!selection) return;
      event.clipboardData?.setData('text/plain', selection.text); event.preventDefault();
    });
  }
  function renderHelpExamples(card, examples, language = 'en') {
    const section = document.createElement('section'); section.className = 'help-examples help-text-selectable';
    const title = document.createElement('h3'); title.textContent = 'Examples';
    const list = document.createElement('ol');
    for (const example of examples) {
      const row = document.createElement('li');
      const sentence = document.createElement('p'); sentence.className = 'help-example-sentence story-text help-text-selectable'; sentence.lang = SPEECH_LANGUAGES[language] || 'en';
      renderHighlightedText(sentence, example.sentence, example.segments, example.highlightStart, example.highlightEnd);
      const translation = document.createElement('p'); translation.className = 'help-context-translation help-text-selectable'; translation.textContent = example.translation;
      const line = document.createElement('div'); line.className = 'help-example-line';
      line.append(sentence, createInlineListenButton(example.sentence, language));
      row.append(line, translation); list.append(row);
    }
    section.append(title, list); card.append(section);
  }
  // Render a deliberately small formatting subset without interpreting HTML.
  function renderDetailText(container, text) {
    function inline(parent, value, emphasis = true) {
      const pattern = emphasis ? /(`[^`\n]+`|\*\*[^*\n]+(?:\*[^*\n]+\*)?[^*\n]*\*\*|\*[^*\n]+\*)/g : /(`[^`\n]+`)/g;
      let offset = 0;
      for (const match of value.matchAll(pattern)) {
        parent.append(document.createTextNode(value.slice(offset, match.index)));
        const token = match[0], code = token.startsWith('`'), bold = token.startsWith('**');
        const node = document.createElement(code ? 'code' : bold ? 'strong' : 'em');
        const content = token.slice(bold ? 2 : 1, bold ? -2 : -1);
        if (code) node.textContent = content;
        else inline(node, content, bold);
        parent.append(node); offset = match.index + token.length;
      }
      parent.append(document.createTextNode(value.slice(offset)));
    }
    for (const paragraph of String(text || '').split(/\r?\n[ \t]*\r?\n/)) {
      const node = document.createElement('p'); inline(node, paragraph); container.append(node);
    }
  }
  function toggleAllExplanations() {
    const ids = [...$('reader-help').querySelectorAll('.help-card')].map(card => card.dataset.helpId);
    if (ids.every(id => state.selectedExplanationIds.has(id))) { clearExplanationSelection(); return; }
    state.selectedExplanationIds = new Set(ids); syncExplanationSelection();
  }
  function syncExplanationSelection() {
    const box = $('reader-help');
    const toolbar = box.querySelector('.explanation-selection-toolbar');
    box.classList.toggle('selection-active', !!toolbar && state.explanationSelectionMode);
    readerPanel().classList.toggle('explanation-selection-active', !!toolbar && state.explanationSelectionMode);
    if (toolbar) {
      const all = toolbar.querySelector('.select-all-explanations');
      const total = box.querySelectorAll('.help-card').length;
      all.checked = total > 0 && state.selectedExplanationIds.size === total;
      all.indeterminate = state.selectedExplanationIds.size > 0 && !all.checked;
      all.setAttribute('aria-label', all.checked ? 'Clear selection and exit selection mode' : 'Select all explanations');
      toolbar.querySelector('.selection-count').textContent = `${state.selectedExplanationIds.size} selected`;
      toolbar.querySelector('.delete-selected-explanations').disabled = !state.selectedExplanationIds.size || pendingDeletionBlocked();
    }
    box.querySelectorAll('.help-card').forEach(card => {
      const selected = state.selectedExplanationIds.has(card.dataset.helpId);
      card.classList.toggle('selected-card', selected);
      const checkbox = card.querySelector('.explanation-select-checkbox');
      if (checkbox) checkbox.checked = selected;
    });
  }
  function clearExplanationSelection() {
    const focusId = state.selectionFocusId || [...state.selectedExplanationIds][0];
    state.explanationSelectionMode = false; state.selectedExplanationIds.clear();
    const story = readerStory();
    if (story) {
      const panel = readerPanel(), scrollTop = panel.scrollTop;
      const chapter = activeChapter(story); renderSavedHelp(chapter, activeVersion(chapter)); panel.scrollTop = scrollTop;
      const action = [...$('reader-help').querySelectorAll('.help-card')].find(card => card.dataset.helpId === focusId)?.querySelector('.card-select-action');
      action?.focus({ preventScroll: true });
    }
    state.selectionFocusId = '';
  }
  function beginExplanationSelection(id) {
    const panel = readerPanel(), scrollTop = panel.scrollTop;
    state.selectionFocusId = id;
    state.explanationSelectionMode = true; state.selectedExplanationIds.clear(); state.selectedExplanationIds.add(id);
    renderSavedHelp(activeChapter(), activeVersion());
    panel.scrollTop = scrollTop;
    [...$('reader-help').querySelectorAll('.help-card')].find(card => card.dataset.helpId === id)?.querySelector('.explanation-select-checkbox')?.focus({ preventScroll: true });
  }
  function toggleExplanationSelection(id) {
    if (state.selectedExplanationIds.has(id)) state.selectedExplanationIds.delete(id); else state.selectedExplanationIds.add(id);
    if (!state.selectedExplanationIds.size) { state.selectionFocusId = id; clearExplanationSelection(); return; }
    syncExplanationSelection();
  }
  function removeSelectedExplanations(story,chapter,version,ids) {
    if (!ids.size || pendingDeletionBlocked()) return false;
    const before=chapter.help || []; chapter.help=before.filter(item=>!(item.versionId===version.id&&ids.has(item.id)));
    try { persistReaderStory(story); clearExplanationSelection(); renderSavedHelp(chapter,version); toast(`${ids.size} ${ids.size===1?'explanation':'explanations'} deleted`); return true; }
    catch(error) { chapter.help=before; renderSavedHelp(chapter,version); toast(error.message); return false; }
  }
  function createHelpLoading(action, followUp, copyOverride = null) {
    const panel = document.createElement('div'); panel.className = 'help-loading'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    const sparkle = document.createElement('span'); sparkle.className = 'help-loading-sparkle'; sparkle.setAttribute('aria-hidden', 'true'); sparkle.textContent = '✦';
    const copy = document.createElement('div'); copy.className = 'help-loading-copy';
    const title = document.createElement('strong'); title.textContent = copyOverride?.title || (action === 'continue' ? 'Writing the next chapter…' : action === 'rewrite' ? 'Rewriting this chapter…' : action === 'examples' ? 'Generating examples…' : action === 'detail' ? 'Adding more detail…' : 'Preparing an explanation…');
    const note = document.createElement('p'); note.textContent = copyOverride?.note || (['continue', 'rewrite'].includes(action) ? 'Your current chapter stays available while this is prepared.' : action === 'detail' && followUp ? `Answering: ${followUp}` : 'Your saved explanations will stay here while this is prepared.');
    copy.append(title, note);
    panel.append(sparkle, copy); return panel;
  }
  // The chapter status card: one Cancel request for the whole run (story memory requests and operation stages).
  // A memory request's own cancel control goes into a hidden host, so the card never shows two.
  function createChapterLoading(kind, copyOverride = null) {
    const panel = createHelpLoading(kind, '', copyOverride);
    panel.requestHost = document.createElement('span'); panel.requestHost.hidden = true;
    const actions = document.createElement('div'); actions.className = 'help-loading-actions';
    const openReady = document.createElement('button'); openReady.type = 'button'; openReady.className = 'small-btn small-btn-strong chapter-open-ready'; openReady.hidden = true;
    openReady.addEventListener('click', () => { panel.onOpenReady?.(); });
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'small-btn chapter-cancel'; cancel.textContent = 'Cancel request';
    cancel.addEventListener('click', () => { cancel.disabled = true; cancelGeneration().finally(() => { cancel.disabled = false; }); });
    actions.append(openReady, cancel);
    panel.openReadyButton = openReady;
    panel.append(actions, panel.requestHost); return panel;
  }
  function createShowInTextButton(item) {
    const chars = Array.from(String(item.passage || '').replace(/\s+/g, ' ').trim());
    const passage = chars.length > 60 ? `${chars.slice(0, 59).join('').trimEnd()}…` : chars.join('');
    const show = document.createElement('button'); show.type = 'button'; show.className = 'help-show-in-text';
    show.setAttribute('aria-label', passage ? `Show in text: “${passage}”` : 'Show in text');
    const label = document.createElement('span'); label.textContent = 'Show in text';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M12 19V5M6 11l6-6 6 6'); svg.append(path);
    show.append(label, svg); show.addEventListener('click', () => showPassageInText(item.id)); return show;
  }
  function deleteFollowUp(story, item, index) {
    if (pendingDeletionBlocked()) throw new Error('Finish or save the current AI response before deleting.');
    const before = { ...item };
    const followUps = savedFollowUps(item).filter((_, position) => position !== index);
    const latestDetail = followUps.findLast(entry => entry.action !== 'examples');
    item.followUps = followUps;
    if (latestDetail) Object.assign(item, { more: latestDetail.text, detailProvenance: latestDetail });
    else { delete item.more; delete item.detailProvenance; }
    try { persistReaderStory(story); }
    catch (error) { Object.assign(item, before); if (!('followUps' in before)) delete item.followUps; throw error; }
    const draft = state.followUpEdit;
    if (draft?.item === item) {
      if (draft.index === index) state.followUpEdit = null;
      else if (draft.index > index) draft.index--;
    }
  }
  function confirmDeleteFollowUp(trigger, question, remove) {
    const dialog = $('delete-follow-up-dialog');
    if (dialog.open) return;
    const cancel = $('cancel-delete-follow-up'), confirm = $('confirm-delete-follow-up');
    const error = $('delete-follow-up-error');
    $('delete-follow-up-question').textContent = question;
    error.textContent = '';
    let focusAfterDelete;
    function onConfirm() {
      try { focusAfterDelete = remove(); dialog.close(); }
      catch (failure) { error.textContent = failure.message; }
    }
    const onCancel = () => dialog.close();
    confirm.addEventListener('click', onConfirm);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('close', () => {
      confirm.removeEventListener('click', onConfirm);
      cancel.removeEventListener('click', onCancel);
      (focusAfterDelete || trigger).focus({ preventScroll: true });
    }, { once: true });
    dialog.showModal(); cancel.focus();
  }
  function renderFollowUpEdit(card, trigger, draft, removesLaterContent, selected) {
    const form = document.createElement('form'); form.className = 'help-edit-follow-up';
    form.id = `edit-follow-up-${draft.item.id}-${draft.index}`;
    const label = document.createElement('label'); label.className = 'field-label'; label.textContent = 'Edit follow-up question';
    const input = document.createElement('textarea'); input.rows = 2; input.className = 'field'; input.required = true; input.maxLength = 500;
    input.id = `${form.id}-input`; label.htmlFor = input.id; input.value = draft.question;
    input.addEventListener('input', () => { draft.question = input.value; });
    form.append(label, input);
    if (removesLaterContent) {
      const warning = document.createElement('p'); warning.className = 'helper'; warning.id = `${form.id}-warning`;
      warning.textContent = 'Later explanations and examples will be removed.';
      input.setAttribute('aria-describedby', warning.id); form.append(warning);
    }
    const actions = document.createElement('div'); actions.className = 'reader-edit-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary-btn'; cancel.textContent = 'Cancel';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'primary-btn'; submit.textContent = 'Regenerate';
    actions.append(cancel, submit); form.append(actions); card.append(form);
    draft.syncControls = () => {
      const locked = draft.running || state.pendingReaderResult?.followUpEdit === draft;
      input.readOnly = cancel.disabled = submit.disabled = Boolean(locked);
    };
    draft.syncControls();
    cancel.addEventListener('click', () => {
      state.followUpEdit = null;
      form.remove();
      card.querySelector('.help-request-recovery')?.remove();
      trigger.focus();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question || submit.disabled) return;
      draft.question = input.value; draft.running = true; draft.syncControls();
      try { await explainSelection('explain', 'detail', question, selected(), undefined, draft); }
      finally { draft.running = false; draft.syncControls(); }
    });
  }
  function renderSavedHelp(chapter, version) {
    const box = $('reader-help'), section = $('reader-help-section'); box.textContent = '';
    // Cards follow the text: by selection start, then end; equal ranges keep the newest first. Stored order is unchanged.
    const offset = value => Number.isFinite(value) ? value : Infinity;
    const orderedHelp = (chapter.help || []).map((item,index)=>({item,index})).filter(row=>row.item.versionId === version.id).sort((a,b)=>{
      const byText = offset(a.item.start) - offset(b.item.start) || offset(a.item.end) - offset(b.item.end);
      if (byText) return byText;
      const at=Date.parse(a.item.createdAt||''), bt=Date.parse(b.item.createdAt||'');
      if(Number.isFinite(at)!==Number.isFinite(bt)) return Number.isFinite(at)?-1:1;
      return Number.isFinite(at)&&at!==bt ? bt-at : b.index-a.index;
    });
    if (state.explanationSelectionMode && orderedHelp.length) {
      const toolbar = document.createElement('div'); toolbar.className = 'explanation-selection-toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Explanation selection');
      const count = document.createElement('span'); count.className = 'selection-count'; count.setAttribute('aria-live', 'polite');
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-btn danger-icon-btn delete-selected-explanations'; remove.setAttribute('aria-label', 'Delete selected explanations'); remove.title = 'Delete selected explanations';
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';
      remove.addEventListener('click', () => removeSelectedExplanations(readerStory(), chapter, version, new Set(state.selectedExplanationIds)));
      const control = document.createElement('label'); control.className = 'selection-all-control';
      const all = document.createElement('input'); all.type = 'checkbox'; all.className = 'select-all-explanations';
      all.addEventListener('change', toggleAllExplanations); control.append(all);
      toolbar.append(count, remove, control); box.append(toolbar);
    }
    const pending = state.activeHelpRequest;
    const pendingMatches = pending && pending.storyId === readerStory()?.id && pending.chapterId === chapter.id && pending.versionId === version.id;
    if (pendingMatches && pending.action === 'initial') box.append(pending.loading);
    orderedHelp.forEach(({item}) => {
      const card = document.createElement('article'); card.className = 'help-card'; card.dataset.helpId = item.id;
      if (state.explanationSelectionMode) {
        card.classList.toggle('selected-card', state.selectedExplanationIds.has(item.id)); card.classList.add('selecting');
        const control = document.createElement('label'); control.className = 'explanation-check-control';
        const check = document.createElement('input'); check.type = 'checkbox'; check.className = 'explanation-select-checkbox'; check.checked = state.selectedExplanationIds.has(item.id); check.setAttribute('aria-label', `Select explanation for ${item.passage}`);
        check.addEventListener('change', () => toggleExplanationSelection(item.id)); control.append(check); card.append(control);
      } else {
        const select = document.createElement('button'); select.type = 'button'; select.className = 'card-select-action'; select.textContent = 'Select explanation';
        select.addEventListener('click', event => { event.stopPropagation(); beginExplanationSelection(item.id); }); card.append(select);
      }
      const title = item.kind === 'translate' ? document.createElement('strong') : null; if (title) { title.className = 'help-text-selectable'; title.textContent = 'Translation'; }
      const quote = document.createElement('p'); quote.className = 'help-quote story-text help-text-selectable'; quote.lang = SPEECH_LANGUAGES[readerStory().language] || 'en';
      const hasContext = validTextRange(version.story || '', item.contextStart, item.contextEnd) && item.contextStart <= item.start && item.contextEnd >= item.end;
      if (hasContext) renderHighlightedText(quote, version.story, version.storySegments, item.start, item.end, item.contextStart, item.contextEnd);
      else quote.textContent = item.passage;
      const body = document.createElement('p'); body.className = 'help-text-selectable'; body.textContent = item.text;
      const profile = item.profile || {};
      const stale = JSON.stringify(profile) !== JSON.stringify(profileSnapshot(readerStory()));
      const status = document.createElement('p'); status.className = 'helper help-text-selectable'; status.textContent = stale ? 'Based on an earlier reading profile.' : '';
      if (title) card.append(title);
      if (hasContext && !state.explanationSelectionMode) {
        const context = document.createElement('div'); context.className = 'help-context';
        const footer = document.createElement('div'); footer.className = 'help-context-footer';
        footer.append(createShowInTextButton(item)); context.append(quote, footer); card.append(context);
      } else card.append(quote);
      if (hasContext && item.contextTranslation) { const translation = document.createElement('p'); translation.className = 'help-context-translation help-text-selectable'; translation.textContent = item.contextTranslation; card.append(translation); }
      card.append(body);
      const followUps = savedFollowUps(item);
      const selected = () => ({ text: item.passage, start: item.start ?? 0, end: item.end ?? ((item.start ?? 0) + item.passage.length), storyId: readerStory().id, chapterId: chapter.id, versionId: version.id, helpId: item.id, profile: profileSnapshot(readerStory()) });
      for (const [index, followUp] of followUps.entries()) {
        if (followUp.action === 'examples') { renderHelpExamples(card, followUp.examples, readerStory().language); continue; }
        if (followUp.followUp) {
          const row = document.createElement('div'); row.className = 'help-question-row';
          const question = document.createElement('p'); question.className = 'help-question help-text-selectable'; question.textContent = followUp.followUp; row.append(question);
          card.append(row);
          if (!state.explanationSelectionMode) {
            const current = state.followUpEdit;
            const draft = current?.item === item && current.index === index ? current : null;
            const menu = document.createElement('details'); menu.className = 'follow-up-menu';
            const trigger = document.createElement('summary'); trigger.className = 'icon-btn follow-up-menu-toggle';
            trigger.setAttribute('aria-label', `Actions for follow-up: ${followUp.followUp}`); trigger.title = 'Follow-up actions';
            trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>';
            const actions = document.createElement('div'); actions.className = 'follow-up-menu-actions';
            const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'follow-up-edit'; edit.textContent = 'Edit';
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'follow-up-delete'; remove.textContent = 'Delete';
            actions.append(edit, remove); menu.append(trigger, actions); row.append(menu);
            menu.addEventListener('keydown', event => {
              if (event.key !== 'Escape' || !menu.open) return;
              event.preventDefault(); event.stopPropagation();
              menu.open = false; trigger.focus();
            });
            if (draft) renderFollowUpEdit(card, trigger, draft, index < followUps.length - 1, selected);
            remove.addEventListener('click', () => {
              if (pendingDeletionBlocked()) { toast('Finish or save the current AI response before deleting.'); return; }
              const story = readerStory();
              menu.open = false;
              confirmDeleteFollowUp(trigger, followUp.followUp, () => {
                deleteFollowUp(story, item, index);
                renderSavedHelp(chapter, version);
                const replacement = [...$('reader-help').querySelectorAll('.help-card')].find(node => node.dataset.helpId === item.id);
                toast('Follow-up deleted');
                return replacement?.querySelector('.follow-up-menu-toggle') || replacement?.querySelector('.help-actions button');
              });
            });
            edit.addEventListener('click', () => {
              menu.open = false;
              if (state.readerHelpBusy || state.pendingReaderResult) return;
              const open = state.followUpEdit;
              if (open?.item !== item || open.index !== index) state.followUpEdit = { item, index, question: followUp.followUp };
              renderSavedHelp(chapter, version);
              const formId = `edit-follow-up-${item.id}-${index}`;
              document.getElementById(`${formId}-input`)?.focus();
            });
          }
        }
        const more = document.createElement('div'); more.className = 'help-detail help-text-selectable'; renderDetailText(more, followUp.text); card.append(more);
      }
      if (item.kind === 'explain' && !state.explanationSelectionMode) {
        const buttons = document.createElement('div'); buttons.className = 'help-actions';
        const detail = document.createElement('button'); detail.type = 'button'; detail.className = 'small-btn'; detail.textContent = 'More detail'; detail.setAttribute('aria-expanded', 'false');
        const examples = document.createElement('button'); examples.type = 'button'; examples.className = 'small-btn'; examples.textContent = 'Generate examples';
        examples.addEventListener('click', async () => {
          examples.disabled = true;
          try { await explainSelection('explain', 'examples', '', selected()); }
          finally { examples.disabled = false; }
        });
        const form = document.createElement('form'); form.className = 'help-follow-up'; form.hidden = true; form.id = `follow-up-${item.id}`; detail.setAttribute('aria-controls', form.id);
        const label = document.createElement('label'); label.className = 'field-label'; label.textContent = 'What would you like explained?'; label.htmlFor = `${form.id}-input`;
        const input = document.createElement('input'); input.type = 'text'; input.id = label.htmlFor; input.className = 'field'; input.maxLength = 500; input.placeholder = 'E.g. How is this form different? (optional)';
        const actions = document.createElement('div'); actions.className = 'reader-edit-actions';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary-btn'; cancel.textContent = 'Cancel';
        const send = document.createElement('button'); send.type = 'submit'; send.className = 'primary-btn'; send.textContent = 'More detail';
        actions.append(cancel, send); form.append(label, input, actions);
        detail.addEventListener('click', () => { form.hidden = false; detail.hidden = true; detail.setAttribute('aria-expanded', 'true'); input.focus(); });
        cancel.addEventListener('click', () => { form.hidden = true; detail.hidden = false; detail.setAttribute('aria-expanded', 'false'); detail.focus(); });
        form.addEventListener('submit', async event => {
          event.preventDefault(); if (send.disabled) return;
          send.disabled = true;
          try { await explainSelection('explain', 'detail', input.value.trim(), selected()); }
          finally { send.disabled = false; }
        });
        buttons.append(detail, examples); card.append(buttons, form);
      }
      if (stale) card.append(status);
      if (pendingMatches && pending.action !== 'initial' && pending.helpId === item.id) card.append(pending.loading);
      box.append(card);
      const isHelpText = event => !!event.target.closest?.('.help-text-selectable');
      wireLongPress(card,()=>beginExplanationSelection(item.id),event=>{
        if(isHelpText(event)||!state.explanationSelectionMode||event.target.closest?.('button,input,select,textarea,a,form'))return;
        event.preventDefault();toggleExplanationSelection(item.id);
      }, false, isHelpText);
    });
    section.hidden = !box.childElementCount;
    syncExplanationSelection();
    if (typeof refreshExplainedMarks === 'function') refreshExplainedMarks(chapter, version);
  }
  function refreshExplainedMarks(chapter, version) {
    const root = $('reader-story'); if (typeof root?.normalize !== 'function') return;
    const ranges = (chapter.help || []).filter(item => item.versionId === version.id && validTextRange(version.story || '', item.start, item.end) && version.story.slice(item.start, item.end) === item.passage)
      .sort((a, b) => (Date.parse(a.createdAt || '') || 0) - (Date.parse(b.createdAt || '') || 0))
      .map(item => ({ id: item.id, start: item.start, end: item.end, label: item.passage }));
    applyExplainedMarks(root, ranges);
    normalizeReaderControls(root);
  }
  function pulse(elements) {
    elements.forEach(node => { node.classList.add('mark-pulse'); setTimeout(() => node.classList.remove('mark-pulse'), 1400); });
  }
  function showPassageInText(helpId) {
    const marks = [...$('reader-story').querySelectorAll('mark.explained-expression')].filter(mark => mark.dataset.helpId === helpId);
    if (!marks.length) { toast('This passage is no longer highlighted.'); return; }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    marks[0].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    pulse(marks);
  }
  function helpCardFor(helpId) { return [...$('reader-help').querySelectorAll('.help-card')].find(node => node.dataset.helpId === helpId); }
  function showExplanationForHelp(helpId) {
    const card = helpCardFor(helpId);
    if (card) revealCard(card);
  }
  const activateReaderText = createReaderActivation({
    root: $('reader-story'), glossaryFor: glossaryForTrigger,
    hasExplanation: helpId => !state.explanationSelectionMode && Boolean(helpCardFor(helpId)),
    selectionCollapsed: () => window.getSelection().isCollapsed,
    closeNote: () => closeWordNote(),
    showNote: (vocab, helpId) => showWordNote(vocab.trigger, vocab.notes, vocab.surface, helpId),
    showExplanation: showExplanationForHelp
  });
  $('reader-story').addEventListener('click', activateStoryText);
  $('reader-story').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activateReaderText(event); });
  async function readerAi(kind, input, instructions, requestPanel, config = { providerId: state.providerId, model: state.model, reasoning: state.reasoning }) {
    if (config.signal?.stopped || config.signal?.cancelledByUser) throw new Error('Request cancelled.');
    workspaceStorage.assertWritable();
    if (state.pendingReaderResult) throw new Error('Save the completed response before starting another request.');
    // alongsideNotes: Define while a shown chapter's notes are still arriving. The notes operation owns
    // state.requestId, so this request keeps its own id and never touches that slot.
    const shared = !config.alongsideNotes;
    if (shared && state.requestId) throw new Error('Another AI request is still running. Wait for it to finish before starting another.');
    if (!ai.available) throw new Error('Connect an AI provider in App² Settings → AI first.');
    const model = state.models.find(item => item.id === config.model); if (!model) throw new Error(String(config.model || '').trim() ? 'The selected AI model is not available now. Open Settings and choose an available model.' : 'No AI model is selected. Open Settings and choose an AI model first.');
    const { providers } = await ai.providers();
    const connected = providers?.filter(provider => provider.connected) || [];
    const provider = connected.find(item => item.id === (config.providerId || state.providerId)) || connected[0];
    if (!provider) throw new Error('Connect an AI provider in App² Settings → AI first.');
    if (config.providerId && provider.id !== config.providerId) throw new Error('The available AI provider changed. Choose a model in Settings first.');
    const providerId = provider.id;
    if (shared) state.requestId = 'starting';
    let id; const startedAt = Date.now();
    try { id = await aiSession.start({ providerId, model: model.id, instructions, input: JSON.stringify({ kind, ...input }), reasoningEffort: model.reasoningLevels?.includes(config.reasoning) ? config.reasoning : undefined, ...aiNotification(kind) }); }
    catch (error) { if (shared) state.requestId = null; throw error; }
    if (shared) state.requestId = id;
    let running = true;
    config.onTaskStarted?.();
    const panel = requestPanel || (['continue','rewrite'].includes(kind) ? $('reader-edit-panel') : $('reader-help'));
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'small-btn reader-ai-cancel'; cancel.textContent = 'Cancel request';
    let cancelled = false;
    cancel.addEventListener('click', async () => { if (shared ? state.requestId !== id : !running) return; cancel.disabled = true; cancelled = true; if (config.signal) config.signal.cancelledByUser=true; try { await ai.cancel(id); } catch (error) { cancelled = false; cancel.disabled = false; toast(`Could not cancel: ${error.message}`); } });
    panel.append(cancel);
    if (config.signal?.cancelledByUser) cancel.click();
    renderReaderGeneration();
    try {
      const result = await ai.wait(id); if (cancelled) throw new Error('Request cancelled.'); state.pendingReaderRequestId = id;
      // Story-context summaries before Continue or Rewrite are the operation's first step; their times go with it.
      if (Array.isArray(config.signal?.timings) && ['summary','memory-compact'].includes(kind)) config.signal.timings.push(timingEntry({ stage: 'context', part: kind, model: model.id, reasoning: config.reasoning, startedAt, completedAt: Date.now(), outcome: 'ok' }));
      return result;
    }
    catch (error) {
      state.pendingReaderRequestId = id;
      try { await releaseInvalidReaderResponse(); } catch (releaseError) { error.releaseFailure = releaseError.message; }
      if (cancelled && config.signal && !config.signal.stopped) config.signal.cancelledByUser = true;
      throw cancelled ? new Error('Request cancelled.') : error;
    }
    finally { running = false; if (shared && state.requestId === id) state.requestId = null; cancel.remove(); }
  }
  async function acknowledgeReaderResult() {
    if (!state.pendingReaderRequestId) return;
    if (!state.pendingReaderResult?.saved) throw new Error('Save the completed response before starting another request.');
    const id = state.pendingReaderRequestId;
    try { await ai.acknowledge(id); } catch (error) { if (error.code !== 'not_found') throw error; }
    state.pendingReaderRequestId = null; state.pendingReaderResult = null;
  }
  async function releaseSavedInference() {
    if (state.pendingReaderResult?.saving) throw new Error('The completed response is still being saved.');
    if (state.pendingReaderResult && !state.pendingReaderResult.saved) throw new Error('Save the completed response before starting another request.');
    if (state.pendingGeneration) {
      if (!state.pendingGeneration.saved) throw new Error('Save the completed story before starting another request.');
      if (!await finishGeneratedRequest()) throw new Error(state.pendingGeneration?.error || 'Finish the completed story request first.');
    } else if (state.pendingStoryRequestId) {
      const id = state.pendingStoryRequestId; await ai.acknowledge(id);
      if (state.requestId === id) state.requestId = null; state.pendingStoryRequestId = null;
    }
    if (state.pendingReaderResult) await acknowledgeReaderResult();
    else await releaseInvalidReaderResponse();
  }
  async function releaseInvalidReaderResponse() {
    if (!state.pendingReaderRequestId || state.pendingReaderResult) return;
    try { await ai.acknowledge(state.pendingReaderRequestId); } catch (error) { if (error.code !== 'not_found') throw error; }
    state.pendingReaderRequestId = null;
  }
  async function savePendingReaderResult() {
    const pending = state.pendingReaderResult; if (!pending) return;
    if (pending.saving) throw new Error('The completed response is still being saved.');
    pending.saving = true;
    try {
      await saveBeforeAcknowledge({
        saved: pending.saved,
        apply: pending.apply,
        persist: () => persistReaderStory(pending.story),
        onSaved: () => {
          pending.saved = true;
          pending.onSaved?.();
        },
        acknowledge: acknowledgeReaderResult
      });
      if (!pending.alongsideNotes && currentReaderGeneration()?.storyId === pending.story.id && !(state.readerEditBusy && pending.story.memoryRebuild)) { currentReaderGeneration().phase = 'ready'; currentReaderGeneration().message = 'Ready'; }
    } catch (error) { pending.failure=failureInfo(error,'saving',pending.saved ? 'release' : 'save'); throw error; }
    finally { pending.saving = false; renderReaderGeneration(); }
  }
  function renderPendingReaderResult() {
    document.querySelectorAll('.reader-response-recovery').forEach(panel => panel.remove());
    const pending = state.pendingReaderResult;
    if (!pending || pending.story.id !== state.readerId) return;
    const location = pending.readerLocation;
    const chapter = activeChapter(), version = activeVersion(chapter);
    if (location && (location.chapterId !== chapter.id || location.versionId !== version.id)) return;
    const box = $('reader-help'); $('reader-help-section').hidden = false;
    const host = location?.helpId ? [...box.querySelectorAll('.help-card')].find(card => card.dataset.helpId === location.helpId) || box : box;
    const recovery=document.createElement('section'); recovery.className='recovery-panel reader-response-recovery';
    if (location?.followUp) { const question = document.createElement('p'); question.className = 'help-question help-text-selectable'; question.textContent = location.followUp; recovery.append(question); }
    const note = document.createElement('p'); note.textContent = pending.saved ? 'Response saved. Finish releasing the AI request to continue.' : `${pending.preview}\n\nThis completed response still needs saving.`;
    recovery.append(note);
    if (pending.failure) appendFailureDetails(recovery,pending.failure);
    const actions=document.createElement('div'); actions.className='recovery-actions';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-btn save-generated-retry'; retry.textContent = pending.saved ? 'Finish request' : 'Save response';
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      try { await savePendingReaderResult(); if (state.readerId === pending.story.id) updateReader(); toast('Response saved'); }
      catch (error) { note.textContent = `${pending.preview}\n\n${error.message}`; retry.disabled = false; }
    });
    actions.append(retry); recovery.append(actions); host.append(recovery);
  }
  function decodeHelp(text, action = 'initial') {
    if (action === 'detail') {
      const raw = String(text || '').trim();
      if (!raw) throw new Error('The AI response was incomplete or invalid.');
      const legacy = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      try {
        const value = JSON.parse(legacy);
        if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.explanation === 'string' && value.explanation.trim()) {
          return { explanation: value.explanation };
        }
      } catch { /* Plain text is the current detail contract. */ }
      return { explanation: raw };
    }
    let value;
    try { value = JSON.parse(String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { throw new Error('The AI response was not valid JSON.'); }
    const fail = () => { throw new Error('The AI response was incomplete or invalid.'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    if (action === 'examples') {
      if (!Array.isArray(value.examples) || value.examples.length !== 3) fail();
      for (const example of value.examples) {
        if (!example || typeof example.sentence !== 'string' || !example.sentence.trim() || typeof example.translation !== 'string' || !example.translation.trim() || !validTextRange(example.sentence, example.highlightStart, example.highlightEnd)) fail();
        if (example.segments !== undefined && (!Array.isArray(example.segments) || !example.segments.every(part => part && typeof part.text === 'string' && (part.reading === undefined || typeof part.reading === 'string')) || example.segments.map(part => part.text).join('') !== example.sentence)) fail();
      }
    } else if (typeof value.explanation !== 'string' || !value.explanation.trim() || (value.contextTranslation !== undefined && typeof value.contextTranslation !== 'string')) fail();
    return value;
  }
  async function explainSelection(kind = 'explain', action = 'initial', followUp = '', selected = state.readerSelection, onTaskStarted, followUpEdit) {
    const passage = selected; if (!passage) return;
    if (currentBackgroundRun()) await stopBackgroundContext();
    if (state.checkpointBlocked || currentPipeline()?.records.length || state.readerHelpBusy || state.readerEditBusy || state.requestId) { toast('Another AI request is still running. Wait for it to finish.'); return; }
    const story = readerStory();
    const chapter = normalizeChapters(story).find(item => item.id === passage.chapterId);
    const version = chapter?.versions.find(item => item.id === passage.versionId);
    if (story.id !== passage.storyId || !version) return;
    if (!validTextRange(version.story, passage.start, passage.end) || version.story.slice(passage.start, passage.end) !== passage.text) { toast('Select the passage again to request help.'); return; }
    const existingHelp = action !== 'initial' ? chapter.help?.find(entry => entry.id === passage.helpId) : null;
    if (action !== 'initial' && !existingHelp) return;
    if (followUpEdit && (existingHelp !== followUpEdit.item || !savedFollowUps(existingHelp)[followUpEdit.index]?.followUp)) return;
    if (action === 'initial') {
      const overlaps = overlappingHelp(chapter, version.id, passage.start, passage.end);
      if (overlaps.length && !await confirmReplaceHelp(overlaps)) return;
    }
    const providerId = state.providerId, model = state.model, reasoning = state.reasoning;
    // Explain and More detail use the light model when Settings → Advanced ticks Explanations; Examples go
    // through the pipeline, which applies the Examples task itself.
    const explainConfig = lightTaskConfig(state, 'explanations');
    state.readerHelpBusy = true;
    try {
      try { persistReaderStory(story); await releaseSavedInference(); }
      catch (error) { toast(error.message); renderPendingReaderResult(); return; }
      if (!onTaskStarted) $('selection-toolbar').hidden = true;
      const box = $('reader-help');
      const helpRequest = { storyId: story.id, chapterId: chapter.id, versionId: version.id, helpId: existingHelp?.id || '', action, loading: createHelpLoading(action, followUp) };
      state.activeHelpRequest = helpRequest;
      setReaderGeneration({ storyId: story.id, pathId: story.activePathId, chapterId: chapter.id, versionId: version.id, helpId: existingHelp?.id, phase: 'working', message: action === 'initial' ? 'Explaining selection…' : action === 'detail' ? 'Writing more detail…' : 'Generating examples…' });
      renderSavedHelp(chapter, version);
      const clearLoading = () => {
        if (state.activeHelpRequest === helpRequest) state.activeHelpRequest = null;
        helpRequest.loading.remove();
      };
      try {
        const context = helpContext(version.story, passage.start, passage.end);
        const savedHistory = existingHelp ? savedFollowUps(existingHelp) : [];
        const retainedHistory = followUpEdit ? savedHistory.slice(0, followUpEdit.index) : savedHistory;
        const promptHistory = followUpEdit ? retainedHistory.filter(entry => entry.action !== 'examples') : retainedHistory;
        const previousExplanation = existingHelp ? JSON.stringify({ explanation: existingHelp.text, followUps: promptHistory.map(entry => ({ action: entry.action || 'detail', question: entry.followUp || '', text: entry.text || '', examples: entry.examples })) }) : '';
        const helpInput={ action, language:LANGUAGES[story.language], languageCode:story.language, difficulty:story.difficulty, sourceText:version.story, start:passage.start, end:passage.end, passage:passage.text, ...context, profile:passage.profile, followUp, previousExplanation };
        if (action === 'examples') {
          const op=await runContentOperation({kind:'examples',language:story.language,input:helpInput,instructions:helpInstructions(action),config:{providerId,model,reasoning,light:lightModelChoice(state),retryBroken:state.retryBrokenReplies !== false},target:{storyId:story.id,chapterId:chapter.id,versionId:version.id,helpId:existingHelp.id,start:passage.start,end:passage.end,passage:passage.text}});
          clearLoading(); recordSelectionLookup(passage, 'examples'); showOperationResult(op); return;
        }
        const result = decodeHelp(await readerAi(kind, helpInput, helpInstructions(action), helpRequest.loading, {
          ...explainConfig, onTaskStarted
        }), action);
        clearLoading();
        const item = { id: crypto.randomUUID?.() || `help-${Date.now()}`, kind, action, passage: passage.text, start: passage.start, end: passage.end, chapterId: passage.chapterId, versionId: passage.versionId, text: result.explanation || '', followUp, profile: passage.profile, createdAt: new Date().toISOString(), providerId: explainConfig.providerId, model: explainConfig.model, promptVersion: PROMPT_VERSION };
        if (action === 'examples') item.examples = result.examples;
        if (action === 'initial') Object.assign(item, resolvedHelpContext(version.story, passage, result));
        if (currentReaderGeneration()) currentReaderGeneration().helpId = existingHelp?.id || item.id;
        const preview = action === 'examples' ? result.examples.map(example => `${example.sentence}\n${example.translation}`).join('\n\n') : item.text;
        state.pendingReaderResult = { story, saved: false, preview, followUpEdit, readerLocation: { chapterId: chapter.id, versionId: version.id, helpId: existingHelp?.id || '', followUp }, onSaved: followUpEdit ? () => {
          if (state.followUpEdit === followUpEdit) state.followUpEdit = null;
          if (state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id) {
            const panel = readerPanel(), current = panel.scrollTop;
            renderSavedHelp(chapter, version); panel.scrollTop = current;
          }
        } : undefined, apply() {
          // Saved with the explanation in the one write; the returned rollback restores the previous value or its absence.
          const undoActivity = markStoryActivity(story);
          if (existingHelp) {
            const before = { ...existingHelp };
            const followUps = [...retainedHistory, item];
            Object.assign(existingHelp, { followUps });
            // Retain the legacy latest-detail fields for older readers.
            if (action === 'detail') Object.assign(existingHelp, { more: item.text, detailProvenance: item });
            return () => { for (const key of Object.keys(existingHelp)) delete existingHelp[key]; Object.assign(existingHelp, before); undoActivity(); };
          }
          const before = chapter.help || [];
          const replaced = new Set(overlappingHelp(chapter, version.id, item.start, item.end));
          chapter.help = [...before.filter(entry => !replaced.has(entry)), item];
          return () => { chapter.help = before; undoActivity(); };
        } };
        // The learner may have kept reading during the request: the re-render keeps where they are now, not where they asked.
        try { await savePendingReaderResult(); }
        catch { if (state.readerId === story.id) renderPendingReaderResult(); return; }
        if (!followUpEdit && state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id) {
          const panel = readerPanel(), current = panel.scrollTop;
          renderSavedHelp(chapter, version); panel.scrollTop = current;
        }
        recordSelectionLookup(passage, action === 'initial' ? 'explain' : action);
      } catch (error) {
        clearLoading();
        const cancelled = error.message === 'Request cancelled.' || error.code === 'generation_cancelled';
        try { await releaseInvalidReaderResponse(); } catch {}
        if (currentReaderGeneration()?.storyId === story.id) {
          setReaderGeneration(cancelled
            ? (state.pendingReaderRequestId ? { ...currentReaderGeneration(), phase: 'cleanup', message: 'Could not finish cancelled request.' } : null)
            : { ...currentReaderGeneration(), phase: 'error', message: 'Request stopped.' });
        }
        if (state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id) {
          renderSavedHelp(chapter, version);
          const card = existingHelp ? [...box.querySelectorAll('.help-card')].find(node => node.dataset.helpId === existingHelp.id) : null;
          const form = action === 'detail' && !followUpEdit ? card?.querySelector('.help-follow-up') : null;
          if (form) {
            form.hidden = false;
            const input = form.querySelector('input'); if (input) input.value = followUp;
            const button = card.querySelector('.help-actions button'); if (button) { button.hidden = true; button.setAttribute('aria-expanded', 'true'); }
          }
          if (cancelled) { if (!state.pendingReaderRequestId) toast('Request cancelled'); return; }
          if (currentPipeline()?.records.length) { renderCheckpointRecovery(); return; }
          const recovery = document.createElement('section'); recovery.className='recovery-panel help-request-recovery';
          const note = document.createElement('p'); note.setAttribute('role','alert');
          note.textContent = recoverySummary({kind:action === 'initial' ? 'explain' : action,error:error.message,failure:failureInfo(error,action)}); recovery.append(note);
          appendFailureDetails(recovery, failureInfo(error,action));
          const actions=document.createElement('div'); actions.className='recovery-actions';
          const retry=document.createElement('button'); retry.type='button'; retry.className='secondary-btn'; retry.textContent=state.pendingReaderRequestId ? 'Finish request' : 'Retry';
          const retrySelection=JSON.parse(JSON.stringify(passage));
          retry.addEventListener('click', async () => {
            if (state.readerHelpBusy || state.requestId) return;
            if (state.readerId !== retrySelection.storyId) return;
            retry.disabled=true;
            try {
              const finishing=retry.textContent === 'Finish request';
              await releaseInvalidReaderResponse();
              if (finishing) {
                if (followUpEdit) { recovery.remove(); return; }
                retry.textContent='Retry'; note.textContent='Previous request finished. Retry to request a new response.'; return;
              }
              recovery.remove();
              await explainSelection(kind,action,followUp,retrySelection);
            } catch (releaseError) { note.textContent='Could not finish the previous request. Try Finish request again.'; }
            finally { retry.disabled=false; }
          });
          if (!followUpEdit || state.pendingReaderRequestId) { actions.append(retry); recovery.append(actions); }
          if (form) form.append(recovery); else (card || box).append(recovery);
          $('reader-help-section').hidden = false;
        }
      } finally { clearLoading(); }
    } finally { state.readerHelpBusy = false; renderReaderGeneration(); }
  }
  // Define (PED-002): an on-demand vocabulary note for the selection, saved with the chapter's notes and
  // underlined like them. A selection inside an existing note opens that note without an AI request.
  function noteCoveringSelection(passage) {
    let best = null;
    for (const fragment of $('reader-story').querySelectorAll('.gloss-note-trigger')) {
      const info = glossaryForTrigger(fragment);
      if (!info || info.start > passage.start || info.end < passage.end) continue;
      if (!best || info.end - info.start < best.end - best.start) best = info;
    }
    return best;
  }
  function openNoteForSelection(passage) {
    const shown = noteCoveringSelection(passage);
    if (!shown?.trigger) return false;
    showWordNote(shown.trigger, shown.notes, shown.surface);
    return true;
  }
  let defineRequestHost = null;
  function showDefinePopover(passage, build) {
    const popover = $('word-note-popover');
    closeWordNote(); popover.textContent = '';
    const item = document.createElement('div'); item.className = 'word-note-entry';
    const heading = document.createElement('span'); heading.className = 'word-note-heading';
    const word = document.createElement('strong'); word.textContent = passage.text;
    heading.append(word); item.append(heading); build(item, popover, heading); popover.prepend(item);
    popover.dataset.define = 'true'; popover.hidden = false; popover.focus();
    const rect = passage.rect || { left: 12, bottom: 12, top: 12 };
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - 292, rect.left))}px`;
    popover.style.top = `${Math.min(window.innerHeight - 20, rect.bottom + 8)}px`;
    requestAnimationFrame(() => {
      const box = popover.getBoundingClientRect();
      if (box.bottom > window.innerHeight - 12) popover.style.top = `${Math.max(12, rect.top - box.height - 8)}px`;
    });
  }
  // While the note is written, the selected words glow and their dotted underline draws itself in; the layer
  // sits over the story text, has no text of its own, and disappears with the next story render.
  function markDefinePending(passage) {
    clearDefinePending();
    const root = $('reader-story'), range = canonicalRange(root, passage.start, passage.end);
    if (!range) return;
    const origin = root.getBoundingClientRect(), layer = document.createElement('div'), seen = new Set();
    layer.className = 'define-pending-layer'; layer.setAttribute('aria-hidden', 'true');
    for (const rect of range.getClientRects()) {
      const key = [rect.left, rect.top, rect.width, rect.height].map(Math.round).join();
      if (!rect.width || seen.has(key)) continue;
      seen.add(key);
      const mark = document.createElement('span'); mark.className = 'define-pending';
      Object.assign(mark.style, { left: `${rect.left - origin.left}px`, top: `${rect.top - origin.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      layer.append(mark);
    }
    root.append(layer);
  }
  function clearDefinePending() { document.querySelectorAll('.define-pending-layer').forEach(layer => layer.remove()); }
  // The underline finishes drawing before the saved note replaces it.
  function completeDefinePending() {
    const layer = document.querySelector('.define-pending-layer');
    if (!layer || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    layer.classList.add('complete');
    return new Promise(resolve => setTimeout(resolve, 200));
  }
  function defineInProgress() { const popover = $('word-note-popover'); return !popover.hidden && popover.dataset.define === 'true'; }
  async function defineSelection(selected = state.readerSelection) {
    const passage = selected; if (!passage || passage.kind === 'title') return;
    const story = readerStory();
    const chapter = normalizeChapters(story).find(item => item.id === passage.chapterId);
    const version = chapter?.versions.find(item => item.id === passage.versionId);
    if (story.id !== passage.storyId || !version) return;
    if (openNoteForSelection(passage)) { $('selection-toolbar').hidden = true; return; }
    if (currentBackgroundRun()) await stopBackgroundContext();
    // Define also works while a shown chapter's vocabulary notes are still arriving (any chapter of any story):
    // the running operation has already saved its chapter, and the learner's note is kept and prevails.
    const notesOp = currentPipeline()?.busy ? currentPipeline().records.find(op => op.earlyApplied) : null, alongside = Boolean(notesOp);
    if (state.checkpointBlocked || (currentPipeline()?.records.length && !alongside) || state.readerHelpBusy || state.readerEditBusy || (state.requestId && !alongside)) { toast('Another AI request is still running. Wait for it to finish.'); return; }
    if (!validTextRange(version.story, passage.start, passage.end) || version.story.slice(passage.start, passage.end) !== passage.text) { toast('Select the word again to define it.'); return; }
    const config = { ...lightTaskConfig(state, 'notes'), ...(alongside ? { alongsideNotes: true } : {}) };
    // The status bar keeps showing the notes' progress; the note popover shows this request.
    const setStatus = value => { if (!alongside) setReaderGeneration(value); };
    state.readerHelpBusy = true;
    try {
      try { persistReaderStory(story); await releaseSavedInference(); }
      catch (error) { toast(error.message); renderPendingReaderResult(); return; }
      $('selection-toolbar').hidden = true;
      if (!defineRequestHost) { defineRequestHost = document.createElement('span'); defineRequestHost.hidden = true; readerPanel().append(defineRequestHost); }
      // A skeleton of the note: the same heading, with shimmering lines where the meaning will appear.
      showDefinePopover(passage, (item, popover, heading) => {
        item.classList.add('word-note-skeleton');
        const status = document.createElement('span'); status.className = 'sr-only'; status.setAttribute('role', 'status'); status.textContent = 'Writing a vocabulary note…';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'icon-btn define-cancel'; cancel.setAttribute('aria-label', 'Cancel vocabulary note'); cancel.title = 'Cancel';
        cancel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
        cancel.addEventListener('click', () => { defineRequestHost.querySelector('.reader-ai-cancel')?.click(); });
        const lines = ['92%', '64%'].map(width => { const line = document.createElement('span'); line.className = 'skeleton-line'; line.style.width = width; return line; });
        heading.append(cancel); item.append(status, ...lines);
      });
      markDefinePending(passage);
      setStatus({ storyId: story.id, pathId: story.activePathId, chapterId: chapter.id, versionId: version.id, kind: 'define', phase: 'working', message: 'Writing a vocabulary note…' });
      const sameView = () => state.readerId === story.id && activeChapter().id === chapter.id && activeVersion().id === version.id;
      try {
        const input = { language: LANGUAGES[story.language], languageCode: story.language, difficulty: story.difficulty, chapter: { title: version.title || story.title, story: version.story }, start: passage.start, end: passage.end, passage: passage.text, sentence: passage.sentence || '', profile: passage.profile };
        const raw = await readerAi('define', input, DEFINE_INSTRUCTIONS, defineRequestHost, config);
        let value;
        try { value = JSON.parse(String(raw || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
        catch { throw new Error('The AI response was not valid JSON.'); }
        const note = { ...validateDefinedNote(value, { title: version.title || story.title, story: version.story }, story.language, passage), createdAt: new Date().toISOString(), providerId: config.providerId, model: config.model, promptVersion: PROMPT_VERSION };
        state.pendingReaderResult = { story, saved: false, alongsideNotes: alongside, preview: `${note.word} — ${note.meaning}`, readerLocation: { chapterId: chapter.id, versionId: version.id, helpId: '' }, apply() {
          const undoActivity = markStoryActivity(story);
          const before = version.glossary;
          version.glossary = [...(before || []), note];
          return () => { if (before === undefined) delete version.glossary; else version.glossary = before; undoActivity(); };
        } };
        try { await savePendingReaderResult(); }
        catch { if (state.readerId === story.id) { closeWordNote(); renderPendingReaderResult(); } return; }
        if (!sameView()) return;
        await completeDefinePending();
        if (!sameView()) return;
        const panel = readerPanel(), current = panel.scrollTop;
        updateReader(true); panel.scrollTop = current;
        // The opened note is the result, so the reader status bar's Ready / View result is not needed.
        if (openNoteForSelection(passage) && !alongside && currentReaderGeneration()?.storyId === story.id) setReaderGeneration(null);
      } catch (error) {
        const cancelled = error.message === 'Request cancelled.' || error.code === 'generation_cancelled';
        try { await releaseInvalidReaderResponse(); } catch {}
        if (!alongside && currentReaderGeneration()?.storyId === story.id) {
          setReaderGeneration(cancelled
            ? (state.pendingReaderRequestId ? { ...currentReaderGeneration(), phase: 'cleanup', message: 'Could not finish cancelled request.' } : null)
            : { ...currentReaderGeneration(), phase: 'error', message: 'Request stopped.' });
        }
        if (cancelled) { if (defineInProgress()) closeWordNote(); if (!state.pendingReaderRequestId) toast('Request cancelled'); return; }
        // The note popover (or a toast after leaving the chapter) carries the failure and Retry, not the status bar.
        if (!alongside && !state.pendingReaderRequestId && currentReaderGeneration()?.storyId === story.id && !currentPipeline()?.records.length) setReaderGeneration(null);
        if (!sameView()) { toast(`Could not define: ${error.message}`); return; }
        if (currentPipeline()?.records.length && !alongside) { closeWordNote(); renderCheckpointRecovery(); return; }
        const retrySelection = JSON.parse(JSON.stringify(passage));
        showDefinePopover(passage, (item, popover) => {
          const note = document.createElement('span'); note.setAttribute('role', 'alert');
          note.textContent = recoverySummary({ kind: 'define', error: error.message, failure: failureInfo(error, 'define') });
          const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'word-note-view'; retry.textContent = 'Retry';
          retry.addEventListener('click', () => { closeWordNote(); void defineSelection(retrySelection); });
          item.append(note); popover.append(retry);
        });
      }
    } finally { clearDefinePending(); state.readerHelpBusy = false; renderReaderGeneration(); }
  }
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
  function openShareDialog(story, {chapterIndex = null, trigger}) {
    const saved = workspaceStorage.entries.get('data/stories.json')?.value.find(item => item.id === story.id);
    if (!saved) { toast('Could not share the story.'); return; }
    const snapshot = JSON.parse(JSON.stringify(saved));
    const modelStory = JSON.parse(JSON.stringify(snapshot));
    const chapter = chapterIndex === null ? null : pathChapters(modelStory)[chapterIndex];
    state.shareDialog = {story:snapshot, modelStory, chapter, chapterIndex, trigger, id:story.id};
    const targets = shareTargets({save, share, isNative});
    $('share-title').textContent = snapshot.title || 'Untitled story';
    $('share-send-file').hidden = !targets.shareFile; $('share-download').hidden = !targets.download;
    // The first available file action is the primary one (Share in App², Save backup otherwise): only its icon is accent-tinted.
    const primary = targets.shareFile ? $('share-send-file') : $('share-download');
    for (const button of [$('share-send-file'), $('share-download')]) button.querySelector('.share-row-icon').classList.toggle('small-btn-strong', button === primary);
    $('share-chapter-send').hidden = $('share-story-send').hidden = !targets.shareText;
    $('share-chapter-row').hidden = !chapter;
    const name = chapter ? `Chapter ${chapterIndex + 1}` : '';
    $('share-chapter-name').textContent = name;
    state.shareDialog.chapterTitle = chapter ? activeVersion(chapter, modelStory).title || '' : '';
    state.shareDialog.storyline = modelStory.paths.length > 1 ? pathLabel(modelStory, selectedPath(modelStory)) : '';
    $('share-chapter-copy').setAttribute('aria-label', `Copy ${name} text`); $('share-chapter-send').setAttribute('aria-label', `Share ${name} text`);
    $('share-story-copy').setAttribute('aria-label', 'Copy whole story text'); $('share-story-send').setAttribute('aria-label', 'Share whole story text');
    $('share-notes').checked = state.shareVocabularyNotes === true; $('share-live').textContent = ''; resetCopyLabels(); updateShareSummaries();
    $('share-dialog').showModal(); primary.focus();
  }
  return {
    activateStoryText, clearExplanationSelection, createChapterLoading, createHelpLoading, fitReaderTitle,
    openShareDialog, readerAi, releaseInvalidReaderResponse, releaseSavedInference, renderPendingReaderResult,
    renderReaderListen, renderSavedHelp, savePendingReaderResult, savedFollowUps, showExplanationForHelp,
    stopSpeech
  };
}
