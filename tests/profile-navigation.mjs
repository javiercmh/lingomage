import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Static contract for the Profile reorganization: three tabs, one Profile page (practice before languages)
// and a separate Settings view reached from Profile. Visual and interaction checks are manual.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

const tabs = [...html.matchAll(/<button class="tab[^"]*" data-view="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabs, ['create', 'library', 'profile'], 'bottom navigation is Create, Library, Profile');
assert.ok(!html.includes('id="view-stats"') && !html.includes('data-view="settings"'), 'Stats and Settings are not tabs');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'element ids are unique');

const profile = html.slice(html.indexOf('id="view-profile"'), html.indexOf('id="view-settings"'));
const settings = html.slice(html.indexOf('id="view-settings"'), html.indexOf('</main>'));
const at = (text, needle) => { const index = text.indexOf(needle); assert.ok(index >= 0, `missing ${needle}`); return index; };
assert.ok(at(profile, 'id="my-practice"') < at(profile, 'id="my-languages"'), 'My practice precedes My languages');
for (const id of ['open-settings', 'usage-notice', 'usage-ranges', 'usage-content', 'target-language-options', 'target-language-add', 'language-order-status']) at(profile, `id="${id}"`);
assert.match(profile, /id="open-settings"[^>]*aria-label="Settings"/, 'gear has an accessible name');
for (const id of ['settings-back', 'model-select', 'reasoning-select', 'ai-setup']) at(settings, `id="${id}"`);
assert.match(settings, /Back to Profile/);
assert.ok(!settings.includes('target-language-options'), 'language controls live in Profile only');
assert.ok(!/avatar|identity/i.test(profile), 'no avatar or identity banner');

assert.match(app, /name === 'settings' \? 'profile'/, 'Settings keeps the Profile tab current');
assert.match(app, /\$\('language-settings-open'\)[^\n]*setView\('profile'\)/, 'the Create prompt opens Profile languages');
assert.match(app, /'checkpoint-recovery-profile'/, 'checkpoint recovery renders in Profile');
console.log('PASS profile navigation structure');
