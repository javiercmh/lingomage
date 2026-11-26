// Profile → Learning languages: the reorderable language rows with level, regional variety and preferences.
// The code is the former app.js section, moved verbatim; app.js calls createLanguageSettings where it used to be.
export function createLanguageSettings({
  $, LANGUAGES, applyStorageBlock, fillLevelOptions, levelDefinition, populateDifficulty, populateTargetPicker,
  readingDescription, state, trySaveSettings
}) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function languageIcon(className, viewBox, shapes) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className); svg.setAttribute('viewBox', viewBox); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    shapes.forEach(([tag, attributes]) => { const node = document.createElementNS(SVG_NS, tag); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value)); svg.append(node); });
    return svg;
  }
  const GRIP_SHAPES = [[6, 4], [12, 4], [6, 9], [12, 9], [6, 14], [12, 14]].map(([cx, cy]) => ['circle', { cx, cy, r: 1.6 }]);
  function enabledLanguages() { return state.languageOrder.filter(code => state.targetLanguages[code]); }
  function setLanguageOrder(enabledOrder) { state.languageOrder = [...enabledOrder, ...state.languageOrder.filter(code => !enabledOrder.includes(code))]; }
  function levelSummary(code) { return levelDefinition(code, state.standardizedLevels[code])?.label || 'Choose a reading level'; }
  function openLanguagePanels() { return new Set([...document.querySelectorAll('.target-language-settings')].filter(panel => !panel.hidden).map(panel => panel.id.slice('language-settings-'.length))); }
  const savePreferences = trySaveSettings;
  function languageFocusKey() {
    const active = document.activeElement;
    if (!active?.closest) return '';
    const add = active.closest('#target-language-add .language-add');
    if (add) return `add:${add.dataset.code}`;
    const row = active.closest('#target-language-options .target-language-row');
    const part = ['language-grip', 'language-toggle', 'target-level', 'knowledge-field', 'language-remove'].find(name => active.classList.contains(name));
    return row && part ? `${part}:${row.dataset.code}` : '';
  }
  function restoreLanguageFocus(key) {
    if (!key) return;
    const [part, code] = key.split(':');
    const row = $('target-language-options').querySelector(`.target-language-row[data-code="${code}"]`);
    const target = (part === 'add' ? $('target-language-add').querySelector(`[data-code="${code}"]`) : row?.querySelector(`.${part}`))
      || row?.querySelector('.language-toggle') || $('target-language-add').querySelector(`[data-code="${code}"]`) || $('target-language-options').querySelector('.language-toggle');
    target?.focus();
  }
  // Re-renders the language rows from state without losing focus, open rows or text typed but not yet committed.
  function syncLanguageSettings() {
    const focus = languageFocusKey(), typed = new Map();
    $('target-language-options').querySelectorAll('.knowledge-field').forEach(field => typed.set(field.id.slice('expectations-'.length), { value: field.value, start: field.selectionStart, end: field.selectionEnd }));
    renderTargetLanguageSettings(openLanguagePanels()); populateTargetPicker();
    typed.forEach((draft, code) => {
      const field = $(`expectations-${code}`);
      if (!field) return;
      field.value = draft.value;
      if (focus === `knowledge-field:${code}`) field.setSelectionRange?.(draft.start, draft.end);
    });
    restoreLanguageFocus(focus);
  }
  function moveLanguage(code, newIndex, grip) {
    const order = enabledLanguages(), from = order.indexOf(code);
    if (from < 0 || newIndex < 0 || newIndex >= order.length) return;
    const open = openLanguagePanels();
    order.splice(newIndex, 0, order.splice(from, 1)[0]);
    setLanguageOrder(order); if (!savePreferences()) return;
    renderTargetLanguageSettings(open); populateTargetPicker();
    $('language-order-status').textContent = `${LANGUAGES[code]} moved to position ${newIndex + 1} of ${order.length}.`;
    document.querySelector(`.language-grip[data-code="${code}"]`)?.focus();
  }
  function startLanguageDrag(event, code, container) {
    if (event.button > 0) return;
    event.preventDefault();
    const grip = event.currentTarget, open = openLanguagePanels();
    grip.setPointerCapture(event.pointerId);
    container.classList.add('reordering');
    const rows = [...container.querySelectorAll('.target-language-row')], from = rows.findIndex(row => row.dataset.code === code);
    const rects = rows.map(row => { const box = row.getBoundingClientRect(); return { top: box.top + window.scrollY, height: box.height }; });
    const gap = rects[1].top - rects[0].top - rects[0].height, step = rects[from].height + gap;
    const grab = Math.min(Math.max(event.pageY - rects[from].top, 0), rects[from].height);
    const dragged = rows[from]; dragged.classList.add('lifted');
    let clientY = event.clientY, target = from, frame = 0;
    const place = () => {
      const edge = 70, bottomEdge = window.innerHeight - 110;
      if (clientY < edge) window.scrollBy(0, -12); else if (clientY > bottomEdge) window.scrollBy(0, 12);
      const top = clientY + window.scrollY - grab, center = top + rects[from].height / 2;
      target = from;
      rects.forEach((rect, index) => { const middle = rect.top + rect.height / 2; if (index < from && center < middle) target = Math.min(target, index); if (index > from && center > middle) target = Math.max(target, index); });
      dragged.style.transform = `translateY(${Math.min(Math.max(top, rects[0].top), rects.at(-1).top) - rects[from].top}px)`;
      rows.forEach((row, index) => { if (index === from) return; const shift = from < target && index > from && index <= target ? -step : from > target && index < from && index >= target ? step : 0; row.style.transform = shift ? `translateY(${shift}px)` : ''; });
      frame = requestAnimationFrame(place);
    };
    const finish = commit => {
      cancelAnimationFrame(frame);
      grip.removeEventListener('pointermove', onMove); grip.removeEventListener('pointerup', onUp); grip.removeEventListener('pointercancel', onCancel); document.removeEventListener('keydown', onKey);
      rows.forEach(row => { row.style.transform = ''; row.classList.remove('lifted'); });
      container.classList.remove('reordering');
      if (commit && target !== from) moveLanguage(code, target); else grip.focus();
    };
    const onMove = move => { clientY = move.clientY; };
    const onUp = () => finish(true), onCancel = () => finish(false);
    const onKey = key => { if (key.key === 'Escape') finish(false); };
    grip.addEventListener('pointermove', onMove); grip.addEventListener('pointerup', onUp); grip.addEventListener('pointercancel', onCancel); document.addEventListener('keydown', onKey);
    place();
  }
  function renderTargetLanguageSettings(expanded = new Set(), focusAfter = '') {
    const container = $('target-language-options'), addList = $('target-language-add'); container.textContent = ''; addList.textContent = '';
    const enabled = enabledLanguages(), available = state.languageOrder.filter(code => !state.targetLanguages[code]);
    container.hidden = !enabled.length; $('language-add-heading').hidden = addList.hidden = !available.length;
    $('language-learning-heading').hidden = !enabled.length;
    $('language-empty').hidden = Boolean(enabled.length);
    enabled.forEach(code => {
      const row = document.createElement('div'); row.className = 'target-language-row'; row.dataset.code = code;
      const header = document.createElement('div'); header.className = 'target-language-header';
      const settings = document.createElement('div'); settings.className = 'target-language-settings'; settings.hidden = !expanded.has(code); settings.id = `language-settings-${code}`;
      if (enabled.length > 1) {
        const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'language-grip'; grip.dataset.code = code;
        grip.setAttribute('aria-label', `Reorder ${LANGUAGES[code]}. Drag, or use the up and down arrow keys.`);
        grip.append(languageIcon('language-grip-icon', '0 0 18 18', GRIP_SHAPES));
        grip.addEventListener('pointerdown', event => startLanguageDrag(event, code, container));
        grip.addEventListener('keydown', event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault(); moveLanguage(code, enabledLanguages().indexOf(code) + (event.key === 'ArrowUp' ? -1 : 1));
        });
        header.append(grip);
      }
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'language-toggle'; toggle.setAttribute('aria-controls', settings.id);
      const text = document.createElement('span'); text.className = 'language-toggle-text';
      const name = document.createElement('strong'); name.textContent = LANGUAGES[code];
      const summary = document.createElement('small'); summary.textContent = levelSummary(code);
      text.append(name, summary);
      const chevron = document.createElement('span'); chevron.className = 'stats-chevron'; chevron.setAttribute('aria-hidden', 'true');
      toggle.append(text, chevron);
      const updateToggle = () => { toggle.setAttribute('aria-expanded', String(!settings.hidden)); toggle.setAttribute('aria-label', `${LANGUAGES[code]}, ${summary.textContent}. ${settings.hidden ? 'Show' : 'Hide'} settings`); row.classList.toggle('open', !settings.hidden); };
      toggle.addEventListener('click', () => { settings.hidden = !settings.hidden; updateToggle(); });
      updateToggle();
      header.append(toggle);
      const level = document.createElement('select'); level.className = 'field target-level'; level.setAttribute('aria-label', `${LANGUAGES[code]} reading level`);
      const levelLabel = document.createElement('label'); levelLabel.className = 'field-label'; level.id = `starting-point-${code}`; levelLabel.htmlFor = level.id; levelLabel.textContent = 'Reading level';
      fillLevelOptions(level, code, state.standardizedLevels[code]);
      const description = document.createElement('p'); description.className = 'helper target-description'; description.id = `journey-${code}`; level.setAttribute('aria-describedby', description.id);
      const updateDescription = () => { description.textContent = readingDescription(code, level.value) || 'Choose the description closest to what you can comfortably read. You can change it anytime.'; };
      updateDescription();
      level.addEventListener('change', () => {
        if (level.value) state.standardizedLevels[code] = level.value; else delete state.standardizedLevels[code];
        // A failed save has already restored the saved level and re-rendered this row.
        if (!savePreferences()) return;
        updateDescription(); summary.textContent = levelSummary(code); updateToggle();
        if ($('language').value === code) populateDifficulty(level.value);
      });
      const expectationsLabel = document.createElement('label'); expectationsLabel.className = 'field-label knowledge-label'; expectationsLabel.htmlFor = `expectations-${code}`; expectationsLabel.textContent = 'Language preferences (optional)';
      const expectations = document.createElement('textarea'); expectations.id = `expectations-${code}`; expectations.className = 'field knowledge-field'; expectations.maxLength = 600; expectations.value = state.languageExpectations[code] || '';
      expectations.placeholder = code === 'es-CL' ? 'E.g. Mexican Spanish, informal tone.' : 'E.g. Regional variety, tone, or spelling.';
      expectations.addEventListener('input', () => { state.languageExpectations[code] = expectations.value.trim(); });
      expectations.addEventListener('change', savePreferences);
      const expectationsHint = document.createElement('p'); expectationsHint.className = 'helper'; expectationsHint.textContent = 'Regional variety, tone, or spelling.';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'language-remove'; remove.textContent = 'Stop learning'; remove.setAttribute('aria-label', `Stop learning ${LANGUAGES[code]}`);
      remove.addEventListener('click', () => {
        delete state.targetLanguages[code]; setLanguageOrder(enabledLanguages());
        if (!savePreferences()) return;
        renderTargetLanguageSettings(openLanguagePanels(), `add-${code}`); populateTargetPicker();
      });
      settings.append(levelLabel, level, description, expectationsLabel, expectations, expectationsHint, remove);
      row.append(header, settings); container.append(row);
    });
    available.forEach(code => {
      const add = document.createElement('button'); add.type = 'button'; add.className = 'language-add'; add.dataset.code = code;
      const label = document.createElement('span'); label.textContent = LANGUAGES[code];
      const action = document.createElement('span'); action.className = 'language-add-action'; action.textContent = '+ Add';
      add.setAttribute('aria-label', `Add ${LANGUAGES[code]}`);
      add.append(label, action);
      add.addEventListener('click', () => {
        state.targetLanguages[code] = state.targetLanguages[code] || 'enabled'; setLanguageOrder([...enabledLanguages().filter(item => item !== code), code]);
        if (!savePreferences()) return;
        renderTargetLanguageSettings(new Set([...openLanguagePanels(), code]), `toggle-${code}`); populateTargetPicker();
      });
      addList.append(add);
    });
    if (focusAfter.startsWith('toggle-')) container.querySelector(`.target-language-row[data-code="${focusAfter.slice(7)}"] .language-toggle`)?.focus();
    if (focusAfter.startsWith('add-')) (addList.querySelector(`[data-code="${focusAfter.slice(4)}"]`) || container.querySelector('.language-toggle'))?.focus();
    if (state.storageBlocked) applyStorageBlock();
  }
  return {
    enabledLanguages, renderTargetLanguageSettings, syncLanguageSettings
  };
}
