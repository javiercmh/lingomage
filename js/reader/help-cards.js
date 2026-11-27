// Reader: story-text activation (vocabulary notes, explained passages), saved help cards with follow-ups and examples,
// explanation selection mode, help locating in the text, and the loading and chapter status cards. PED-002.
// The code is the former js/reader-help.js section, moved verbatim, with the help-context helpers (formerly at the top
// of that module) moved down beside the cards; app.js calls createHelpCards where the section used to be.
import { applyExplainedMarks, getCanonicalSelection, japaneseSegments } from './reader-text.js';
import { createReaderActivation, glossaryForTrigger, normalizeReaderControls } from './reader-activation.js';
import { translation } from '../bridge.js';

export function createHelpCards({
  $, activeChapter, activeVersion, cancelGeneration, closeWordNote, createInlineListenButton, explainSelection,
  pendingDeletionBlocked, persistReaderStory, profileSnapshot, readerPanel, readerStory, revealCard,
  showWordNote, SPEECH_LANGUAGES, state, toast, wireLongPress
}) {
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
  // PED-002: retain the exact fragment and locate it in canonical context.
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
  return {
    activateStoryText, clearExplanationSelection, confirmReplaceHelp, createChapterLoading, createHelpLoading,
    helpContext, overlappingHelp, renderSavedHelp, resolvedHelpContext, savedFollowUps, showExplanationForHelp,
    validTextRange
  };
}
