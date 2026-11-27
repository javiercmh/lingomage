// Library selection: confirmed story removal, save rollback on persistence failure, and pending-AI guard.
import assert from 'node:assert/strict';
import { loadFactory, deps, stubDom } from './support/factory-harness.mjs';

const createLibrarySelection = await loadFactory('js/screens/library-selection.js', 'createLibrarySelection');

{
  const dom = stubDom();
  globalThis.document = dom.document;
  globalThis.window = { ...globalThis.window, scrollY: 0, scrollTo() {} };
  const state = { stories: [{ id: 'a' }, { id: 'b' }], selectedStoryIds: new Set(['a']), storySelectionMode: true };
  let fail = false;
  const selection = createLibrarySelection(deps({
    $: dom.$,
    state,
    pendingDeletionBlocked: () => Boolean(state.pendingReaderResult),
    persistStories() { if (fail) throw Error('disk'); },
    renderLibrary() {},
    toast() {}
  }));

  assert.equal(selection.removeSelectedStories(new Set(['a'])), true);
  assert.deepEqual(state.stories.map(x => x.id), ['b']);
  assert.equal(state.storySelectionMode, false);

  state.stories = [{ id: 'a' }, { id: 'b' }];
  state.selectedStoryIds = new Set(['a']);
  state.storySelectionMode = true;
  fail = true;
  assert.equal(selection.removeSelectedStories(new Set(['a'])), false);
  assert.deepEqual(state.stories.map(x => x.id), ['a', 'b']);
  assert.deepEqual(Array.from(state.selectedStoryIds), ['a']);

  fail = false;
  state.pendingReaderResult = {};
  assert.equal(selection.removeSelectedStories(new Set(['a'])), false);
  assert.equal(state.stories.length, 2);
  console.log('PASS confirmed story removal, save rollback, and pending-AI guard');
}
