import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseTime, storyActivity, markStoryActivity, planLibrary, SORTS, formatDay, formatDate, dateSegments, describeDates } from '../js/library-activity.js';
import { createStoryModel } from '../js/story-model.js';
import { createGenerationController } from '../js/generation-controller.js';
import { createWorkspaceStorage } from '../js/workspace-storage.js';

// Library ordering, date copy and activity stamping. Pure functions and in-memory fixtures only: no learner data,
// no network, no files written. Navigation only; nothing here measures progress or learning.
const NOW = new Date(2026, 9, 20, 15, 0).getTime();   // local calendar: 20 Oct 2026
const at = (month, day, hour = 12, year = 2026) => new Date(year, month - 1, day, hour).toISOString();
const clone = value => structuredClone(value);
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const story = (id, createdAt, extra = {}) => ({ id, language: 'de', title: `Story ${id}`, story: `Text ${id}`, createdAt, ...extra });

// parseTime: ISO strings and positive finite millisecond numbers only.
assert.equal(parseTime(at(10, 1)), Date.parse(at(10, 1)));
assert.equal(parseTime('2026-10-01'), Date.parse('2026-10-01'));
assert.equal(parseTime(1760000000000), 1760000000000);
for (const bad of ['', 'test', '1', '12', 'yesterday', '2026-13-45T00:00:00Z', null, undefined, {}, [], true, NaN, Infinity, -5, 0]) assert.ok(Number.isNaN(parseTime(bad)), `invalid: ${String(bad)}`);
assert.ok(Number.isNaN(parseTime(NOW + 25 * 3600e3, NOW)), 'more than a day ahead is ignored');
assert.equal(parseTime(NOW + 23 * 3600e3, NOW), NOW + 23 * 3600e3, 'small clock skew is tolerated');

// storyActivity: explicit stamp, legacy derivation, malformed values ignored without rejecting the story, no mutation.
const legacyOne = story('legacy-one', at(10, 1));
assert.deepEqual(storyActivity(legacyOne, NOW), { activityAt: Date.parse(at(10, 1)), createdAt: Date.parse(at(10, 1)), updated: false }, 'one-story legacy record: creation only');
const multi = deepFreeze(story('m', at(10, 1), {
  lastActivityAt: undefined,
  chapters: [
    { id: 'c1', createdAt: at(10, 1), versions: [{ id: 'v1', createdAt: at(10, 1) }, { id: 'v1b', createdAt: at(10, 3) }], help: [{ id: 'h', createdAt: at(10, 4), followUps: [{ createdAt: at(10, 6) }], detailProvenance: { createdAt: at(10, 5) } }] },
    { id: 'c2', createdAt: at(10, 2), versions: [{ id: 'v2', createdAt: at(10, 2) }], help: [] }
  ]
}));
const snapshot = JSON.stringify(multi);
assert.equal(storyActivity(multi, NOW).activityAt, Date.parse(at(10, 6)), 'legacy activity is the latest chapter, version, explanation or follow-up time');
assert.equal(JSON.stringify(multi), snapshot, 'nonmutating');
assert.equal(storyActivity(multi, NOW).updated, true);
assert.equal(storyActivity({ ...multi, lastActivityAt: at(10, 9) }, NOW).activityAt, Date.parse(at(10, 9)), 'explicit stamp wins when later');
assert.equal(storyActivity({ ...multi, lastActivityAt: at(10, 2) }, NOW).activityAt, Date.parse(at(10, 6)), 'a removal can lower derived data but an older explicit stamp never wins over later content');
assert.equal(storyActivity({ ...legacyOne, lastActivityAt: 1792000000000 }, NOW).activityAt, 1792000000000, 'numeric milliseconds are accepted');
for (const bad of ['garbage', 7, {}, '2026-02-31T99:00:00Z', at(10, 21, 12, 2030)]) {
  const result = storyActivity({ ...legacyOne, lastActivityAt: bad }, NOW);
  assert.equal(result.activityAt, Date.parse(at(10, 1)), `malformed or far-future ${JSON.stringify(bad)} is ignored`);
  assert.equal(result.updated, false);
}
assert.ok(Number.isNaN(storyActivity({ id: 'x' }, NOW).activityAt) && Number.isNaN(storyActivity({ id: 'x', createdAt: 'nope', chapters: 'broken' }, NOW).createdAt), 'absent or broken metadata yields NaN, not an exception');
assert.equal(storyActivity({ id: 'x', createdAt: 'nope', lastActivityAt: at(10, 5) }, NOW).updated, true, 'without a valid creation time an explicit stamp still counts');
assert.equal(storyActivity({ id: 'x', createdAt: 'nope', chapters: [{ createdAt: at(10, 5), versions: [] }] }, NOW).updated, false, 'derived data alone cannot claim an update when creation is unknown');

// "Updated" compares instants, never calendar days: later activity on the creation day is still an update.
const created = new Date(2026, 9, 20, 8, 0).getTime(), later = new Date(2026, 9, 20, 8, 0, 1).getTime();
assert.equal(storyActivity({ createdAt: new Date(created).toISOString(), lastActivityAt: new Date(created).toISOString() }, NOW).updated, false, 'identical instants: created');
assert.equal(storyActivity({ createdAt: new Date(created).toISOString(), lastActivityAt: new Date(later).toISOString() }, NOW).updated, true, 'one second later on the same day: updated');
const sameDay = { story: {}, createdAt: created, activityAt: new Date(2026, 9, 20, 13).getTime(), updated: true };
assert.deepEqual(dateSegments(sameDay, 'hero', NOW).map(s => `${s.label} ${s.text}`), ['Updated today'], 'the creation-day update is not hidden');
assert.deepEqual(dateSegments(sameDay, 'recent', NOW).map(s => `${s.label} ${s.text}`), ['Updated today']);

// markStoryActivity: stamp, undo to previous value or absence, monotonic, replaces malformed values.
{
  const a = story('a', at(10, 1)), undo = markStoryActivity(a, new Date(NOW));
  assert.equal(a.lastActivityAt, new Date(NOW).toISOString()); undo();
  assert.ok(!('lastActivityAt' in a) && !('lastActivityKind' in a), 'undo restores absence, not an undefined key');
  const b = story('b', at(10, 1), { lastActivityAt: at(10, 5) }), undoB = markStoryActivity(b, new Date(NOW));
  assert.equal(b.lastActivityAt, new Date(NOW).toISOString()); undoB(); assert.equal(b.lastActivityAt, at(10, 5), 'undo restores the prior value');
  const c = story('c', at(10, 1), { lastActivityAt: at(10, 20, 23) }); markStoryActivity(c, new Date(NOW));
  assert.equal(c.lastActivityAt, at(10, 20, 23), 'a valid later stamp (clock moved back) is never lowered');
  const d = story('d', at(10, 1), { lastActivityAt: 'junk' }); markStoryActivity(d, new Date(NOW)); assert.equal(d.lastActivityAt, new Date(NOW).toISOString(), 'malformed value replaced at the next legitimate stamp');
  const e = story('e', at(10, 1), { lastActivityAt: at(10, 20, 12, 2031) }); markStoryActivity(e, new Date(NOW)); assert.equal(e.lastActivityAt, new Date(NOW).toISOString(), 'far-future value replaced');
}

// planLibrary: one hero, every other story exactly once, sorts, filters, ties.
assert.deepEqual(Object.keys(SORTS), ['recent', 'newest'], 'only Recent activity and Newest created are offered');
const library = [
  story('newest', at(10, 15)),                                             // created last, never updated
  story('updated', at(10, 5), { lastActivityAt: at(10, 18) }),            // latest activity
  story('second', at(10, 2), { lastActivityAt: at(10, 17) }),             // older, but recently active
  story('middle', at(10, 10)),
  story('old', at(9, 1), { language: 'ja' })
];
const stored = JSON.stringify(library);
const ids = rows => rows.map(e => e.story.id).join();
let plan = planLibrary(library, { sort: 'recent', now: NOW });
assert.equal(plan.hero.story.id, 'updated'); assert.ok(!('shortcut' in plan), 'no separate newest-created shortcut');
assert.equal(ids(plan.rows), 'second,newest,middle,old', 'Recent activity: everything else once, by activity');
plan = planLibrary(library, { sort: 'newest', now: NOW });
assert.equal(plan.hero.story.id, 'updated', 'hero does not depend on the list sort');
assert.equal(ids(plan.rows), 'newest,middle,second,old', 'Newest created: everything else once, by creation');
for (const sort of ['recent', 'newest']) {
  const all = [planLibrary(library, { sort, now: NOW }).hero, ...planLibrary(library, { sort, now: NOW }).rows].map(e => e.story.id);
  assert.equal(new Set(all).size, library.length, `${sort}: every story appears exactly once`);
}
assert.equal(ids(planLibrary(library, { sort: 'oldest', now: NOW }).rows), 'second,newest,middle,old', 'unknown sorts fall back to Recent activity');
assert.equal(JSON.stringify(library), stored, 'stored order and data never change');
plan = planLibrary(library, { language: 'ja', now: NOW });
assert.equal(plan.hero.story.id, 'old'); assert.equal(plan.rows.length, 0); assert.equal(plan.count, 1);
plan = planLibrary([library[0], library[1]].map(s => ({ ...s, lastActivityAt: undefined })), { now: NOW });
assert.equal(plan.hero.story.id, 'newest', 'with no later activity the latest created is the hero');
const rowsByNewest = planLibrary([story('x', at(10, 1)), story('y', at(10, 3)), story('z', at(10, 2)), story('w', at(10, 4))], { sort: 'newest', now: NOW });
assert.equal(rowsByNewest.hero.story.id, 'w'); assert.equal(ids(rowsByNewest.rows), 'y,z,x', 'Newest created is descending');
// Ties: equal activity -> later creation; equal creation -> lower array index.
plan = planLibrary([story('first', at(10, 1), { lastActivityAt: at(10, 9) }), story('second', at(10, 2), { lastActivityAt: at(10, 9) })], { now: NOW });
assert.equal(plan.hero.story.id, 'second', 'activity tie goes to the later creation');
plan = planLibrary([story('first', at(10, 1)), story('second', at(10, 1))], { now: NOW });
assert.equal(plan.hero.story.id, 'first', 'full tie goes to the lower index (stored newest-first)');
// Invalid dates.
plan = planLibrary([story('bad', 'nope'), story('good', at(10, 2))], { sort: 'newest', now: NOW });
assert.equal(plan.hero.story.id, 'good'); assert.equal(plan.rows[0].story.id, 'bad', 'invalid dates sort last');
plan = planLibrary([story('a', undefined), story('b', 'nope')], { now: NOW });
assert.equal(plan.hero.story.id, 'a'); assert.equal(plan.plainHero, true, 'no valid dates: plain first card');
plan = planLibrary([story('a', undefined, { lastActivityAt: at(10, 2) }), story('b', 'nope')], { now: NOW });
assert.equal(plan.hero.story.id, 'a'); assert.equal(plan.plainHero, false);
plan = planLibrary([story('future', at(12, 25, 12, 2030)), story('real', at(10, 2))], { now: NOW });
assert.equal(plan.hero.story.id, 'real', 'a corrupt far-future date cannot pin the hero');
assert.equal(planLibrary([], { now: NOW }).hero, null);

// Date copy: local calendar days.
assert.equal(formatDay(new Date(2026, 9, 20, 1).getTime(), NOW), 'today');
assert.equal(formatDay(new Date(2026, 9, 19, 23, 59).getTime(), NOW), 'yesterday');
assert.equal(formatDay(new Date(2026, 9, 18, 9).getTime(), NOW), '2 days ago');
assert.equal(formatDay(new Date(2026, 9, 14, 9).getTime(), NOW), '6 days ago');
assert.equal(formatDay(new Date(2026, 9, 13, 9).getTime(), NOW), '13 Oct');
assert.equal(formatDay(NOW + 3600e3, NOW), 'today', 'small future skew reads as today');
assert.equal(formatDate(new Date(2025, 9, 17).getTime(), NOW), '17 Oct 2025'); assert.equal(formatDate(new Date(2026, 0, 3).getTime(), NOW), '3 Jan');
const entry = { createdAt: new Date(2026, 9, 12, 9).getTime(), activityAt: new Date(2026, 9, 18, 9).getTime(), updated: true };
const text = (value, style) => dateSegments(value, style, NOW).map(s => `${s.label} ${s.text}`).join(' · ');
assert.equal(text(entry, 'hero'), 'Updated 2 days ago');
assert.equal(text(entry, 'recent'), 'Updated 2 days ago'); assert.equal(text(entry, 'created'), 'Created 12 Oct');
const plainEntry = { ...entry, activityAt: entry.createdAt, updated: false };
assert.equal(text(plainEntry, 'hero'), 'Created 12 Oct'); assert.equal(text(plainEntry, 'recent'), 'Created 12 Oct');
assert.equal(text({ createdAt: NaN, activityAt: NaN, updated: false }, 'hero'), '', 'invalid or missing dates are omitted');
assert.equal(describeDates(entry), 'Updated 18 October 2026. Created 12 October 2026'); assert.equal(describeDates(plainEntry), 'Created 12 October 2026');
assert.ok(!/Active|Continue|progress|Completed|Last studied/i.test(fs.readFileSync(new URL('../js/library-activity.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), 'no progress-implying labels');

// Generation controller: stamp only on a saved continue/rewrite/examples; roll back with the content; idempotent.
function fixture() {
  const state = { stories: [] }, model = createStoryModel({ state, readerStory: () => null });
  const target = story('S', at(10, 1), { chapters: [{ id: 'c1', activeVersionId: 'v1', versions: [{ id: 'v1', story: 'Stadt Haus', createdAt: at(10, 1) }], help: [{ id: 'h1', followUps: [] }] }] });
  state.stories.push(target); let failSave = false, writes = [];
  const controller = createGenerationController({ state, normalizeChapters: model.normalizeChapters, ensureStoryPaths: model.ensureStoryPaths, savedFollowUps: help => help.followUps || [],
    persistReaderStory: saved => { writes.push(JSON.stringify(saved)); if (failSave) throw new Error('disk full'); } });
  const base = { createdAt: at(10, 2), input: { prompt: '', learnerProfile: {} }, config: { providerId: 'p', model: 'm' } };
  const entries = () => structuredClone(target.paths[0].entries);
  model.ensureStoryPaths(target);
  const ops = {
    cont: { ...base, id: 'op-continue', kind: 'continue', result: { title: 'T2', story: 'Zwei', glossary: [] }, target: { storyId: 'S', pathId: 'original', chapterId: 'c1', sourceVersionId: 'v1', entries: entries(), index: 0 } },
    rewrite: { ...base, id: 'op-rewrite', kind: 'rewrite', result: { title: 'T1b', story: 'Neu', glossary: [] }, target: { storyId: 'S', pathId: 'original', chapterId: 'c1', sourceVersionId: 'v1', entries: entries(), index: 0 } },
    examples: { ...base, id: 'op-examples', kind: 'examples', result: { examples: [] }, input: { followUp: '', profile: {} }, target: { storyId: 'S', chapterId: 'c1', versionId: 'v1', helpId: 'h1', start: 0, end: 5, passage: 'Stadt' } }
  };
  return { state, target, controller, ops, writes, fail: value => { failSave = value; } };
}
for (const kind of ['cont', 'rewrite', 'examples']) {
  const f = fixture(), before = Date.now();
  f.controller.applyContentOperation(f.ops[kind]);
  const stamp = f.target.lastActivityAt;
  assert.ok(Date.parse(stamp) >= before - 1 && Date.parse(stamp) <= Date.now() + 1, `${kind}: stamped with the actual save time`);
  assert.equal(f.writes.length, 1, `${kind}: content and stamp share one write`); assert.equal(JSON.parse(f.writes[0]).lastActivityAt, stamp);
  assert.equal(storyActivity(f.target, Date.now()).updated, true);
  assert.equal(f.ops[kind].createdAt, at(10, 2), 'operation provenance is untouched');
  f.controller.applyContentOperation(f.ops[kind]);
  assert.equal(f.target.lastActivityAt, stamp, `${kind}: re-applying the same operation does not restamp`); assert.equal(f.writes.length, 1, `${kind}: idempotent re-apply writes nothing`);
  // Failure: restores absence, then a retry stamps the time it really saved.
  const g = fixture(); g.fail(true);
  assert.throws(() => g.controller.applyContentOperation(g.ops[kind]), /disk full/);
  assert.ok(!('lastActivityAt' in g.target), `${kind}: failed save leaves no stamp`);
  assert.equal(g.target.chapters[0].versions.length, 1); assert.equal(g.target.chapters[0].help[0].followUps.length, 0); assert.equal(g.target.paths.length, 1, 'content rolled back too');
  g.fail(false); g.controller.applyContentOperation(g.ops[kind]); assert.ok(Date.parse(g.target.lastActivityAt) > 0, `${kind}: retry stamps`);
  // Failure restores an earlier explicit stamp rather than deleting it.
  const h = fixture(); h.target.lastActivityAt = at(10, 5); h.fail(true);
  assert.throws(() => h.controller.applyContentOperation(h.ops[kind]), /disk full/); assert.equal(h.target.lastActivityAt, at(10, 5));
}
{
  // Background completion for a story that is not open: applied by id, stamped, and no other story touched.
  const f = fixture(), other = story('Other', at(10, 3)); f.state.stories.unshift(other); f.state.readerId = null;
  f.controller.applyContentOperation(f.ops.cont);
  assert.ok(f.target.lastActivityAt); assert.ok(!('lastActivityAt' in other));
  const hero = planLibrary(f.state.stories, { now: Date.now() + 1000 }).hero.story.id;
  assert.equal(hero, 'S', 'the story completed in the background becomes the hero');
  // A discarded destination and a changed path throw without stamping.
  const gone = fixture(); assert.throws(() => gone.controller.applyContentOperation({ ...gone.ops.cont, id: 'op-x', target: { ...gone.ops.cont.target, storyId: 'missing' } }), /no longer exists/);
  const moved = fixture(); assert.throws(() => moved.controller.applyContentOperation({ ...moved.ops.cont, id: 'op-y', target: { ...moved.ops.cont.target, entries: [] } }), /path changed/);
  assert.ok(!('lastActivityAt' in moved.target) && !moved.writes.length, 'an invalid or cancelled operation never stamps or writes');
}
{
  // Initial creation is activity stamped at save time (not operation start), kind 'created', so it reads "Created", not "Updated".
  const op = (extra = {}) => ({ id: 'op-create', kind: 'create', language: 'de', createdAt: at(10, 2), promptVersion: 'pv', input: { difficulty: 'beginner' }, config: { providerId: 'p', model: 'm' }, result: { title: 'T', story: 'S', glossary: [] }, ...extra });
  const make = (fail = false) => {
    const state = { stories: [] }, writes = [];
    const controller = createGenerationController({ state, normalizeChapters: s => s.chapters, ensureStoryPaths() {}, savedFollowUps: () => [], persistReaderStory: s => { writes.push(JSON.stringify(s)); if (fail) throw new Error('disk full'); state.stories.unshift(s); } });
    return { state, writes, controller };
  };
  const f = make(), before = Date.now();
  f.controller.applyContentOperation(op());
  const saved = f.state.stories[0];
  assert.ok(Date.parse(saved.lastActivityAt) >= before - 1 && Date.parse(saved.lastActivityAt) <= Date.now() + 1, 'stamped at the actual save time, not the operation start');
  assert.equal(saved.lastActivityKind, 'created'); assert.equal(saved.createdAt, at(10, 2), 'original createdAt kept'); assert.equal(saved.operationId, 'op-create', 'provenance kept');
  assert.equal(f.writes.length, 1); assert.equal(JSON.parse(f.writes[0]).lastActivityAt, saved.lastActivityAt, 'stamp is in the same write as the content');
  const entry = { story: saved, ...storyActivity(saved, Date.now() + 1000) };
  assert.equal(entry.updated, false, 'a freshly created (even resumed) story is Created, not Updated');
  assert.ok(entry.activityAt > entry.createdAt, 'but its save time ranks it above stories whose activity predates it');
  assert.deepEqual(dateSegments(entry, 'hero', Date.now()).map(x => x.label), ['Created']);
  const older = story('older', at(10, 5), { lastActivityAt: at(10, 6) });
  assert.equal(planLibrary([older, saved], { now: Date.now() + 1000 }).hero.story.id, saved.id, 'a resumed creation completed later outranks activity saved in between');
  f.controller.applyContentOperation(op({ input: {}, config: {}, result: {} }));
  assert.equal(f.state.stories.length, 1); assert.equal(f.writes.length, 1, 'create is idempotent by operation id: no second write or restamp');
  // Later saved content upgrades it to Updated; a failed later save restores the creation stamp and kind.
  const stamp = saved.lastActivityAt, undo = markStoryActivity(saved, new Date(Date.parse(stamp) + 5000));
  assert.equal(storyActivity(saved, Date.now() + 1e5).updated, true); undo();
  assert.equal(saved.lastActivityAt, stamp); assert.equal(saved.lastActivityKind, 'created'); assert.equal(storyActivity(saved, Date.now() + 1e5).updated, false);
  // Failed save: nothing is kept.
  const g = make(true); assert.throws(() => g.controller.applyContentOperation(op()), /disk full/); assert.equal(g.state.stories.length, 0);
  // Legacy and malformed kinds: no kind means the existing derivation; an unknown kind is not 'created'.
  assert.equal(storyActivity({ ...saved, lastActivityKind: 'junk' }, Date.now() + 1000).updated, true);
  assert.equal(storyActivity({ createdAt: at(10, 1), lastActivityAt: at(10, 5) }, NOW).updated, true, 'legacy stamp without kind still means Updated');
}

// Source contract: stamping happens only in the two content-saving paths, never in opens, positions or pre-request saves.
{
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.equal(app.match(/markStoryActivity\(/g).length, 1, 'app.js stamps only the saved explanation/detail result (the controller stamps the other content)');
  const body = name => app.slice(app.indexOf(`function ${name}(`), app.indexOf('\n}\n', app.indexOf(`function ${name}(`)));
  for (const name of ['persistReaderStory', 'openReader', 'rememberReaderPosition', 'persistReaderPosition']) assert.ok(!/markStoryActivity/.test(body(name)), `${name} does not stamp`);
  assert.match(app, /const undoActivity = markStoryActivity\(story\);/);
}

// Deferred re-render: a result saved while the library is hidden, in selection, or showing a popover never reorders under the learner,
// and Actions focus returns to the rebuilt button afterwards.
{
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const part = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
  let active = true, renders = 0, removed = 0, focused = [];
  const rebuilt = { focus() { focused.push('rebuilt'); } };
  const trigger = { isConnected: true, setAttribute() {}, focus() { focused.push('old'); } };
  const list = { querySelector: selector => (/data-story-id="S"/.test(selector) ? rebuilt : null) };
  const context = { CSS: { escape: value => value }, state: { storySelectionMode: false, storyMenu: null, libraryStale: false }, $: id => (id === 'library-list' ? list : { classList: { contains: () => active } }),
    renderLibrary() { renders++; context.state.libraryStale = false; trigger.isConnected = false; } };
  vm.createContext(context); vm.runInContext(part('function libraryChanged(', 'function storyDateLine(') + part('function closeStoryMenu(', 'function openStoryMenu('), context);
  context.libraryChanged(); assert.equal(renders, 1, 'visible and idle: re-render so the hero can change');
  trigger.isConnected = true;
  active = false; context.libraryChanged(); assert.equal(renders, 1, 'hidden library renders when next shown'); assert.equal(context.state.libraryStale, false);
  active = true; context.state.storySelectionMode = true; context.libraryChanged(); context.libraryChanged();
  assert.equal(renders, 1, 'no re-render under a selection'); assert.equal(context.state.libraryStale, true);
  context.state.storySelectionMode = false; context.state.storyMenu = { id: 'S', trigger, popover: { remove() { removed++; } } };
  context.libraryChanged(); assert.equal(renders, 1, 'no re-render under an open popover');
  context.closeStoryMenu(true); assert.equal(removed, 1); assert.equal(renders, 2, 'the stale library renders once the popover closes');
  assert.deepEqual(focused, ['rebuilt'], 'focus goes to the rebuilt Actions button, not the detached one');
  // No deferred render: focus returns to the original trigger.
  trigger.isConnected = true; focused = []; context.state.storyMenu = { id: 'S', trigger, popover: { remove() {} } }; context.closeStoryMenu(true);
  assert.deepEqual(focused, ['old']); assert.equal(renders, 2);
  assert.match(app, /state\.deleteTrigger = \{ id: story\.id, trigger \}/, 'the delete dialog restores focus by story id after a re-render');
}

// Storage: the field round-trips, a malformed value does not make the store unreadable, and an unreadable store is never overwritten.
{
  const files = new Map(); let writes = 0;
  const storage = createWorkspaceStorage({ read: p => files.get(p) ?? '', exists: p => files.has(p), write: (p, v) => { writes++; files.set(p, JSON.stringify(v)); return true; } });
  storage.load('data/stories.json');
  const stamped = story('S', at(10, 1), { lastActivityAt: at(10, 5), title: 'История' });
  storage.save('data/stories.json', [stamped]); assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(files.get('data/stories.json')), [stamped], 'round-trips unchanged');
  const malformed = [story('M', at(10, 1), { lastActivityAt: 'garbage' }), story('N', at(10, 1), { lastActivityAt: { x: 1 } })];
  files.set('data/stories.json', JSON.stringify(malformed));
  assert.equal(storage.load('data/stories.json').status, 'valid', 'malformed activity metadata does not reject the story file');
  assert.equal(storyActivity(malformed[0], NOW).activityAt, Date.parse(at(10, 1)));
  const bad = '[{"id":"S","lastActivityAt":'; files.set('data/stories.json', bad); writes = 0;
  assert.equal(storage.load('data/stories.json').status, 'invalid');
  assert.throws(() => storage.save('data/stories.json', [markedCopy()]), /preserved/);
  assert.equal(files.get('data/stories.json'), bad); assert.equal(writes, 0, 'an unreadable store is not overwritten by an activity save');
  function markedCopy() { const copy = clone(stamped); markStoryActivity(copy, new Date(NOW)); return copy; }
}
console.log('PASS library activity: derivation and malformed metadata, instant-based Updated/Created copy, single-hero/sort ordering and ties, stamp boundaries, rollback, idempotence, background completion and storage safety');
