// Profile → Stats: time totals from data/usage.json and "Most looked up" (PED-005) with its detail sheet.
// The code is the former app.js section, moved verbatim; app.js calls createStatsView where it used to be.
import { summarize, hasUsage, ACTIVITY_LABELS, formatDuration, RANGES } from './usage-stats.js';
import { speech } from './bridge.js';
import { prepareSpeechOptions } from './reader-speech.js';

export function createStatsView({
  $, LANGUAGES, SPEECH_LANGUAGES, signals, state, toast, usage
}) {
  // Stats: totals from data/usage.json. The content region is not live and is replaced only when the
  // formatted figures change, so focus on the period buttons and screen readers are undisturbed.
  state.statsRange = 'today';
  let statsTimer = 0, statsSignature = '';
  function startStatsRefresh() { stopStatsRefresh(); statsTimer = setInterval(renderStats, 10000); }
  function stopStatsRefresh() { clearInterval(statsTimer); statsTimer = 0; }
  function statsList(rows) {
    const list = document.createElement('ul'); list.className = 'stats-list';
    for (const row of rows) {
      const item = document.createElement('li'), label = document.createElement('span'), value = document.createElement('span');
      label.textContent = row.label; value.textContent = row.value; item.append(label, value);
      if (row.children) { item.classList.add('stats-group'); item.append(statsList(row.children)); }
      list.append(item);
    }
    return list;
  }
  // Language and activity rows are disclosures; the open keys survive re-renders so a refresh or period change never collapses a row.
  const openPractice = new Set();
  function disclosureRow(key, label, value, rows) {
    const item = document.createElement('li'); item.className = 'stats-group stats-language';
    const toggle = document.createElement('button'), name = document.createElement('span'), amount = document.createElement('span'), chevron = document.createElement('span');
    const children = statsList(rows); children.id = `practice-${key}`; children.hidden = !openPractice.has(key);
    toggle.type = 'button'; toggle.className = 'stats-language-toggle'; toggle.dataset.key = key; toggle.setAttribute('aria-controls', children.id);
    name.textContent = label; amount.textContent = value; chevron.className = 'stats-chevron'; chevron.setAttribute('aria-hidden', 'true');
    toggle.append(name, amount, chevron);
    const sync = () => { toggle.setAttribute('aria-expanded', String(!children.hidden)); toggle.setAttribute('aria-label', `${label}${value ? `, ${value}` : ''}. ${children.hidden ? 'Show' : 'Hide'} details`); };
    toggle.addEventListener('click', () => { children.hidden = !children.hidden; if (children.hidden) openPractice.delete(key); else openPractice.add(key); sync(); });
    sync(); item.append(toggle, children);
    return item;
  }
  function renderStats() {
    if (!$('view-profile').classList.contains('active')) return;
    usage.observe();
    const summary = summarize(usage.data, state.statsRange, usage.today(), state.languageOrder);
    // The empty state is for no recorded time at all; any positive total shows as at least "Less than 1 minute".
    const empty = !hasUsage(usage.data);
    const activity = id => ACTIVITY_LABELS[id] || id;
    const model = empty ? { empty } : {
      total: formatDuration(summary.app),
      languages: summary.languages.map(item => ({ id: item.id, label: LANGUAGES[item.id] || item.id, value: formatDuration(item.total), children: item.activities.map(entry => ({ label: activity(entry.id), value: formatDuration(entry.ms) })) })),
      activities: summary.activities.map(entry => ({ label: activity(entry.id), value: formatDuration(entry.ms) }))
    };
    const signature = JSON.stringify([state.statsRange, model]);
    if (signature === statsSignature) return;
    statsSignature = signature;
    const content = $('usage-content'), focusedKey = content.contains(document.activeElement) ? document.activeElement.dataset?.key : '';
    content.textContent = '';
    const text = (tag, className, value) => Object.assign(document.createElement(tag), { className, textContent: value });
    const card = document.createElement('section'); card.className = 'panel stats-section'; content.append(card);
    if (empty) card.append(text('h4', 'settings-section-label', 'No time tracked yet'), text('p', 'helper', 'Time appears here after you use LingoMage. Earlier use is not counted.'));
    else {
      card.append(text('h4', 'settings-section-label', 'Time in LingoMage'), text('p', 'stats-total', model.total));
      if (!model.languages.length) card.append(text('p', 'helper', 'No reading time in this period.'));
      else {
        const list = document.createElement('ul'); list.className = 'stats-list';
        model.languages.forEach(row => list.append(disclosureRow(`language-${row.id}`, row.label, row.value, row.children)));
        const activities = document.createElement('ul'); activities.className = 'stats-list stats-activities';
        activities.append(disclosureRow('activity', 'By activity', '', model.activities));
        card.append(text('h5', 'stats-subtitle', 'By language'), list, activities);
      }
    }
    // A row that is gone for this period hands focus to the selected period so it is never lost to the page.
    if (focusedKey) (content.querySelector(`.stats-language-toggle[data-key="${CSS.escape(focusedKey)}"]`) || $('usage-ranges').querySelector('[tabindex="0"]'))?.focus({ preventScroll: true });
  }
  function setStatsRange(range, focus = false) {
    state.statsRange = range;
    document.querySelectorAll('#usage-ranges [role="radio"]').forEach(button => { const on = button.dataset.value === range; button.setAttribute('aria-checked', String(on)); button.tabIndex = on ? 0 : -1; if (on && focus) button.focus(); });
    renderStats();
  }
  RANGES.forEach(range => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'segment'; button.setAttribute('role', 'radio'); button.dataset.value = range.id; button.textContent = range.label;
    button.addEventListener('click', () => setStatsRange(range.id));
    button.addEventListener('keydown', event => {
      const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
      if (!step) return; event.preventDefault();
      setStatsRange(RANGES[(RANGES.findIndex(item => item.id === state.statsRange) + step + RANGES.length) % RANGES.length].id, true);
    });
    $('usage-ranges').append(button);
  });
  setStatsRange('today');
  function renderUsageStatus(status) {
    const message = status.blocked ? `${status.loadError} Time is still counted for this session but is not saved until the file loads.`
      : status.saveError ? 'Time tracking could not be saved. Counted time is kept in memory and saved together once writing works.' : '';
    $('usage-notice').hidden = !message;
    if ($('usage-notice-message').textContent !== message) $('usage-notice-message').textContent = message;
    $('usage-retry').textContent = status.blocked ? 'Retry loading' : 'Retry save';
  }
  $('usage-retry').addEventListener('click', () => {
    const blocked = usage.status.blocked, ok = blocked ? usage.retryLoad() : usage.retrySave();
    $('usage-retry-note').textContent = ok ? '' : blocked ? 'Still unreadable. Repair data/usage.json, then try again.' : 'Still could not save. Your counted time is kept.';
    if (ok) { statsSignature = ''; renderStats(); $('usage-ranges').querySelector('[tabindex="0"]')?.focus(); }
  });
  renderUsageStatus(usage.status);
  // "Most looked up" (PED-005): per-language disclosure with the top items and an in-app clear confirmation.
  const LOOKUP_LIMIT = 10;
  const lookupOpen = new Map(); // language → open; a single language starts open.
  let confirmingLookupClear = '';
  function renderLookupStatus(status) {
    const message = status.blocked ? `${status.loadError} New lookups won't be saved until it loads.`
      : status.saveError ? "Couldn't save your lookups. They're kept until saving works." : '';
    $('lookups-notice').hidden = !message;
    if ($('lookups-notice-message').textContent !== message) $('lookups-notice-message').textContent = message;
    $('lookups-retry').textContent = status.blocked ? 'Retry loading' : 'Retry save';
  }
  $('lookups-retry').addEventListener('click', () => {
    const blocked = signals.status.blocked, ok = blocked ? signals.retryLoad() : signals.retrySave();
    $('lookups-retry-note').textContent = ok ? '' : blocked ? 'Still unreadable. Repair data/learning-signals.json, then try again.' : "Still couldn't save.";
    if (ok) renderLookups();
  });
  renderLookupStatus(signals.status);
  function renderLookups() {
    const content = $('lookups-content'); content.textContent = '';
    const text = (tag, className, value) => Object.assign(document.createElement(tag), { className, textContent: value });
    const card = document.createElement('section'); card.className = 'panel stats-section lookup-section'; content.append(card);
    const codes = [...new Set([...state.languageOrder, ...Object.keys(signals.data.languages)])].filter(code => signals.ranked(code, 1).length);
    $('lookups-footer').hidden = !codes.length;
    if (!codes.length) { card.append(text('p', 'helper lookup-empty', 'Words you look up while reading appear here.')); return; }
    const list = document.createElement('ul'); list.className = 'stats-list'; card.append(list);
    for (const code of codes) {
      const ranked = signals.ranked(code, LOOKUP_LIMIT), label = LANGUAGES[code] || code, key = `lookups-${code}`;
      const item = document.createElement('li'); item.className = 'stats-group stats-language';
      const toggle = document.createElement('button'), body = document.createElement('div');
      toggle.type = 'button'; toggle.className = 'stats-language-toggle'; toggle.dataset.key = key;
      body.id = key; body.className = 'lookup-body'; body.hidden = !(lookupOpen.get(code) ?? codes.length === 1); toggle.setAttribute('aria-controls', key);
      const chevron = text('span', 'stats-chevron', ''); chevron.setAttribute('aria-hidden', 'true');
      toggle.append(text('span', '', label), chevron);
      const sync = () => toggle.setAttribute('aria-expanded', String(!body.hidden));
      toggle.addEventListener('click', () => { body.hidden = !body.hidden; lookupOpen.set(code, !body.hidden); sync(); });
      sync();
      const entries = document.createElement('ol'); entries.className = 'lookup-list';
      for (const entry of ranked) {
        const row = document.createElement('li'); row.className = 'lookup-item';
        const open = document.createElement('button'); open.type = 'button'; open.className = 'lookup-row'; open.dataset.lookup = entry.key;
        const words = document.createElement('span'); words.className = 'lookup-text';
        const word = text('span', 'lookup-word', entry.word); word.lang = SPEECH_LANGUAGES[code] || code;
        words.append(word);
        if (entry.meaning) words.append(text('span', 'lookup-meaning', entry.meaning));
        const times = text('span', 'lookup-count', `${entry.lookups}×`);
        times.setAttribute('aria-label', `looked up ${entry.lookups} ${entry.lookups === 1 ? 'time' : 'times'}`); times.setAttribute('role', 'img');
        open.append(words, times);
        open.addEventListener('click', () => openLookupDetail(code, entry.key, open));
        row.append(open);
        entries.append(row);
      }
      body.append(entries);
      const clear = document.createElement('div'); clear.className = 'lookup-clear';
      if (confirmingLookupClear === code) {
        const question = text('p', 'helper', `Clear ${label} lookups? This can't be undone.`);
        const yes = text('button', 'danger-btn', 'Clear'), no = text('button', 'secondary-btn', 'Cancel');
        yes.type = no.type = 'button';
        yes.addEventListener('click', () => { confirmingLookupClear = ''; if (!signals.clearLanguage(code)) toast("Couldn't clear lookups."); renderLookups(); $('my-lookups-title').focus(); });
        no.addEventListener('click', () => { confirmingLookupClear = ''; renderLookups(); content.querySelector(`[data-clear="${code}"]`)?.focus(); });
        clear.append(question, yes, no);
      } else {
        const button = text('button', 'small-btn lookup-clear-btn', 'Clear list'); button.type = 'button'; button.dataset.clear = code;
        button.setAttribute('aria-label', `Clear ${label} lookups`);
        button.disabled = signals.status.blocked;
        button.addEventListener('click', () => { confirmingLookupClear = code; renderLookups(); content.querySelector('.lookup-clear .danger-btn')?.focus(); });
        clear.append(button);
      }
      body.append(clear);
      item.append(toggle, body); list.append(item);
    }
  }
  // Detail for one row of "Most looked up": every meaning with its own count and sentence, recent context
  // sentences for selections, and when it was looked up. Read-only; opening it or listening records nothing.
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function lookupDate(key) {
    const [y, m, d] = key.split('-').map(Number), date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, {day:'numeric', month:'short', ...(y !== new Date().getFullYear() && {year:'numeric'})});
  }
  let lookupDetail = null; // {code, word, opener}
  function openLookupDetail(code, key, opener) {
    const entry = signals.ranked(code).find(item => item.key === key);
    if (!entry) return;
    const lang = SPEECH_LANGUAGES[code] || code, body = $('lookup-detail-body');
    const text = (tag, className, value) => Object.assign(document.createElement(tag), { className, textContent: value });
    lookupDetail = {code, word:entry.word, opener};
    $('lookup-detail-word').textContent = entry.word; $('lookup-detail-word').lang = lang;
    const summary = [`Looked up ${plural(entry.lookups, 'time')}${entry.days.length > 1 ? ` on ${plural(entry.days.length, 'day')}` : ''}`];
    if (entry.last) summary.push(`last ${lookupDate(entry.last)}`);
    if (entry.seenSinceLookup) summary.push(`seen ${plural(entry.seenSinceLookup, 'time')} since`);
    $('lookup-detail-summary').textContent = summary.join(' · ');
    body.textContent = '';
    const meanings = entry.meanings || (entry.meaning ? [{text:entry.meaning, count:entry.lookups}] : []);
    const sentence = value => { const p = text('p', 'lookup-detail-sentence', value); p.lang = lang; return p; };
    if (meanings.length) {
      body.append(text('h3', 'lookup-detail-heading', meanings.length === 1 ? 'Meaning' : 'Meanings'));
      const list = document.createElement('ul'); list.className = 'lookup-detail-list';
      for (const meaning of meanings) {
        const li = document.createElement('li'), head = text('p', 'lookup-detail-meaning', meaning.text);
        if (meanings.length > 1) { const n = text('span', 'lookup-count', `${meaning.count}×`); n.setAttribute('role', 'img'); n.setAttribute('aria-label', `looked up ${plural(meaning.count, 'time')}`); head.append(' ', n); }
        li.append(head);
        if (meaning.sentence) li.append(sentence(meaning.sentence));
        list.append(li);
      }
      body.append(list);
    } else if (entry.contexts?.length) {
      body.append(text('h3', 'lookup-detail-heading', 'Where you saw it'));
      const list = document.createElement('ul'); list.className = 'lookup-detail-list';
      for (const context of entry.contexts) { const li = document.createElement('li'); li.append(sentence(context.sentence)); list.append(li); }
      body.append(list);
    }
    $('lookup-detail-listen').disabled = !speech.available;
    $('lookup-detail-listen').title = speech.available ? 'Listen' : 'Listening requires App²';
    $('lookup-detail-dialog').showModal(); $('lookup-detail-close').focus();
  }
  $('lookup-detail-close').addEventListener('click', () => $('lookup-detail-dialog').close());
  $('lookup-detail-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $('lookup-detail-listen').addEventListener('click', async () => {
    if (!lookupDetail) return;
    const {code, word} = lookupDetail;
    const detail = lookupDetail; detail.speaking = true;
    try { const { options } = await prepareSpeechOptions(speech, word, SPEECH_LANGUAGES[code]); if (lookupDetail === detail) await speech.speak(options); }
    catch (error) { if (lookupDetail === detail) toast(`Could not play audio: ${error.message}`); }
    finally { detail.speaking = false; }
  });
  $('lookup-detail-dialog').addEventListener('close', () => {
    const {opener, speaking} = lookupDetail || {}; lookupDetail = null;
    // Stop only speech this sheet started, never chapter audio playing in the background.
    if (speaking) Promise.resolve().then(() => speech.stop()).catch(() => {});
    if (opener?.isConnected) opener.focus();
  });
  return {
    renderLookupStatus, renderLookups, renderStats, renderUsageStatus, startStatsRefresh, stopStatsRefresh
  };
}
