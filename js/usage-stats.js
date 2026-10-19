// Pure helpers for usage history: local-date keys, ranges, totals and wording. Dates are stored as
// local calendar keys (YYYY-MM-DD) when the time was spent, so a later timezone change never
// rewrites history.
export const ACTIVITY_LABELS = {reading: 'Reading'};
export const RANGES = [{id: 'today', label: 'Today'}, {id: 'week', label: 'Last 7 days'}, {id: 'all', label: 'All time'}];

const pad = value => String(value).padStart(2, '0');
export function localDateKey(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
// Next local midnight after `ms`; Date resolves DST gaps and 23/25 hour days.
export function nextLocalMidnight(ms) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}
export const localCalendar = {dateKey: localDateKey, nextBoundary: nextLocalMidnight};

// Calendar arithmetic on the key itself, so DST never shifts a date.
export function shiftDateKey(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
export function rangeBounds(range, today) {
  if (range === 'today') return {from: today, to: today};
  if (range === 'week') return {from: shiftDateKey(today, -6), to: today};
  return {from: '', to: ''};
}

const byOrder = (order) => (a, b) => {
  const left = order.indexOf(a.id), right = order.indexOf(b.id);
  return (left < 0 ? order.length : left) - (right < 0 ? order.length : right) || a.id.localeCompare(b.id);
};
// Totals for a range. Future-dated days (clock or timezone moved back) count only in All time.
export function summarize(usage, range, today, languageOrder = []) {
  const {from, to} = rangeBounds(range, today);
  let app = 0;
  const languages = new Map(), activities = new Map();
  for (const [key, day] of Object.entries(usage.days)) {
    if (range !== 'all' && (key < from || key > to)) continue;
    app += day.app;
    for (const [code, byActivity] of Object.entries(day.languages)) {
      const entry = languages.get(code) || {id: code, total: 0, activities: new Map()};
      languages.set(code, entry);
      for (const [name, ms] of Object.entries(byActivity)) {
        entry.total += ms;
        entry.activities.set(name, (entry.activities.get(name) || 0) + ms);
        activities.set(name, (activities.get(name) || 0) + ms);
      }
    }
  }
  const list = map => [...map].filter(([, ms]) => ms > 0).map(([id, ms]) => ({id, ms})).sort(byOrder(Object.keys(ACTIVITY_LABELS)));
  return {
    app,
    languages: [...languages.values()].filter(entry => entry.total > 0).map(entry => ({id: entry.id, total: entry.total, activities: list(entry.activities)})).sort(byOrder(languageOrder)),
    activities: list(activities)
  };
}

export function formatDuration(ms) {
  if (!(ms > 0)) return '0 minutes';
  if (ms < 60000) return 'Less than 1 minute';
  const minutes = Math.floor(ms / 60000), hours = Math.floor(minutes / 60), rest = minutes % 60;
  const unit = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return [hours ? unit(hours, 'hour') : '', rest || !hours ? unit(rest, 'minute') : ''].filter(Boolean).join(' ');
}
