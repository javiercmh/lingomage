// Library ordering and date copy. Navigation only: nothing here measures progress, comprehension or learning.
// `lastActivityAt` is an optional story-level ISO string stamped when new content is saved, with an optional
// `lastActivityKind` ('created' for the initial save, otherwise 'updated'); legacy stories fall back to the content
// timestamps they already carry (approximate: version and example times are operation start times).
const DAY = 86400000, FUTURE_TOLERANCE = DAY;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Milliseconds for an ISO-style string or a positive finite millisecond number; NaN otherwise.
// With `now`, values more than a day ahead are ignored so a corrupt date cannot pin a story first.
export function parseTime(value, now) {
  let ms = NaN;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) ms = Date.parse(value);
  else if (typeof value === 'number' && Number.isFinite(value) && value > 0) ms = value;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return NaN;
  if (now !== undefined && ms > Number(now) + FUTURE_TOLERANCE) return NaN;
  return ms;
}

// Pure and nonmutating. `updated` is true only when a valid activity time is later than the valid creation time,
// as instants; calendar days are never compared. A stamp of kind 'created' (initial save, possibly later than `createdAt`
// when a request was resumed) ranks the story but is not an update unless later content exists. Without a valid
// creation time only an explicit non-creation stamp counts.
export function storyActivity(story, now = Date.now()) {
  const created = parseTime(story?.createdAt, now), explicit = parseTime(story?.lastActivityAt, now);
  const times = [created, explicit];
  for (const chapter of Array.isArray(story?.chapters) ? story.chapters : []) {
    times.push(parseTime(chapter?.createdAt, now));
    for (const version of Array.isArray(chapter?.versions) ? chapter.versions : []) times.push(parseTime(version?.createdAt, now));
    for (const help of Array.isArray(chapter?.help) ? chapter.help : []) {
      times.push(parseTime(help?.createdAt, now), parseTime(help?.detailProvenance?.createdAt, now));
      for (const followUp of Array.isArray(help?.followUps) ? help.followUps : []) times.push(parseTime(followUp?.createdAt, now));
    }
  }
  const valid = times.filter(Number.isFinite), activityAt = valid.length ? Math.max(...valid) : NaN;
  const creationStamp = story?.lastActivityKind === 'created' && Number.isFinite(explicit) && activityAt === explicit;
  const updated = !creationStamp && (Number.isFinite(created) ? activityAt > created : Number.isFinite(explicit));
  return { activityAt, createdAt: created, updated };
}

// Stamp story-level activity on the object the caller is about to persist. Call only for content that is being saved,
// never for opens, positions, path switches, removals or pre-request saves. Returns an undo that restores the previous
// values or their absence, for the caller's existing save-failure rollback. Never lowers a valid earlier stamp.
// `kind` is 'created' only for the initial save of a new story.
export function markStoryActivity(story, at = new Date(), kind = 'updated') {
  const restore = key => { const had = Object.prototype.hasOwnProperty.call(story, key), value = story[key]; return () => { if (had) story[key] = value; else delete story[key]; }; };
  const undoAt = restore('lastActivityAt'), undoKind = restore('lastActivityKind');
  const now = at.getTime(), earlier = parseTime(story.lastActivityAt, now);
  story.lastActivityAt = new Date(Number.isFinite(earlier) ? Math.max(now, earlier) : now).toISOString();
  story.lastActivityKind = kind === 'created' ? 'created' : 'updated';
  return () => { undoAt(); undoKind(); };
}

const newer = (a, b) => (Number.isFinite(a) ? a : -Infinity) - (Number.isFinite(b) ? b : -Infinity);
// Descending time, invalid last.
const byRecent = (a, b) => newer(b.activityAt, a.activityAt) || newer(b.createdAt, a.createdAt) || a.index - b.index;
const byNewest = (a, b) => newer(b.createdAt, a.createdAt) || a.index - b.index;
export const SORTS = { recent: 'Recent activity', newest: 'Newest created' };

// One hero, the story with the latest saved activity, independent of `sort`; every other story appears once in `rows`,
// ordered by `sort`. Stored order is never changed. With no valid activity time anywhere, the first story is a plain hero.
export function planLibrary(stories, { language = 'all', sort = 'recent', now = Date.now() } = {}) {
  const entries = stories.map((story, index) => ({ story, index, ...storyActivity(story, now) }))
    .filter(entry => language === 'all' || entry.story.language === language);
  const pick = (candidates, compare) => candidates.slice().sort(compare)[0] || null;
  const heroed = pick(entries.filter(entry => Number.isFinite(entry.activityAt)), byRecent);
  const hero = heroed || entries[0] || null;
  const rows = entries.filter(entry => entry !== hero).sort(sort === 'newest' ? byNewest : byRecent);
  return { hero, plainHero: !!hero && !heroed, rows, count: entries.length };
}

// Whole local calendar days from `a` to `b`; rounding absorbs daylight-saving hours.
function daysBetween(a, b) {
  const start = new Date(a), end = new Date(b);
  return Math.round((new Date(end.getFullYear(), end.getMonth(), end.getDate()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / DAY);
}
export function formatDay(ms, now = Date.now()) {
  const days = daysBetween(ms, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(ms, now);
}
export function formatDate(ms, now = Date.now()) {
  const date = new Date(ms), year = date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
}
export function formatLongDate(ms) { const date = new Date(ms); return `${date.getDate()} ${LONG_MONTHS[date.getMonth()]} ${date.getFullYear()}`; }

// Visible date segments for a card: [{label, ms, text}]. `style` is hero, recent or created.
export function dateSegments(entry, style, now = Date.now()) {
  const created = Number.isFinite(entry.createdAt) ? { label: 'Created', ms: entry.createdAt } : null;
  const updated = entry.updated && Number.isFinite(entry.activityAt) ? { label: 'Updated', ms: entry.activityAt } : null;
  const relative = segment => ({ ...segment, text: formatDay(segment.ms, now) });
  const absolute = segment => ({ ...segment, text: formatDate(segment.ms, now) });
  if (style === 'hero' || style === 'recent') return [updated ? relative(updated) : created && relative(created)].filter(Boolean);
  return [created && absolute(created)].filter(Boolean);
}
// Accessible description with the words and full dates written out, whatever the visible style.
export function describeDates(entry) {
  return [entry.updated && Number.isFinite(entry.activityAt) && `Updated ${formatLongDate(entry.activityAt)}`,
    Number.isFinite(entry.createdAt) && `Created ${formatLongDate(entry.createdAt)}`].filter(Boolean).join('. ');
}
