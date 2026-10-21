import assert from 'node:assert/strict';
import { aiNotification } from '../js/ai-notification.js';

const cases = [
  ['create', 'plan', 'Planning your story'], ['create', 'prose', 'Writing your story'],
  ['continue', 'prose', 'Writing the next chapter'], ['rewrite', 'prose', 'Rewriting this chapter'],
  ['examples', 'prose', 'Writing examples'], ['continue', 'notes', 'Writing study notes'],
  ['create', 'readings', 'Adding readings'], ['explain', undefined, 'Explaining your selection'],
  ['summary', undefined, 'Preparing story context']
];
for (const [kind, stage, title] of cases) {
  const copy = aiNotification(kind, stage);
  assert.equal(copy.title, title);
  assert.ok(copy.body.length <= 80 && copy.title.length <= 40, 'Notification copy stays concise');
}
assert.equal(aiNotification('create').body, 'Working now. Reopen LingoMage if it pauses between steps.');
assert.ok(!/keeps going|safe to switch/i.test(aiNotification('create').body), 'No promise that the page keeps orchestrating while suspended');
assert.equal(aiNotification('unknown').title, 'Working on your story');
assert.deepEqual(Object.keys(aiNotification('create')), ['title', 'body']);
console.log('ai-notification: ok');
