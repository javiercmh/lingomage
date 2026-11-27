// Library view: long-press cancellation/suppression, selectable text exclusion, and story deletion confirmation.
import assert from 'node:assert/strict';
import { loadFactory, deps, stubDom } from './support/factory-harness.mjs';

const createLibraryView = await loadFactory('js/screens/library-view.js', 'createLibraryView');

// 1. Long press cancels on leaving, outside release, scrolling, cancellation and movement; completed holds suppress clicks.
{
  const dom = stubDom();
  const pointerEvents = new Map(), timers = new Map();
  let nextTimer = 0, holds = 0;
  const origSetTimeout = globalThis.setTimeout, origClearTimeout = globalThis.clearTimeout;
  const origDoc = globalThis.document;
  try {
    dom.document.addEventListener = (name, fn) => {
      if (name === 'pointerup' || name === 'pointercancel' || name === 'scroll') pointerEvents.set(name, fn);
    };
    dom.document.removeEventListener = name => { pointerEvents.delete(name); };
    globalThis.document = dom.document;
    globalThis.setTimeout = fn => { const id = ++nextTimer; timers.set(id, fn); return id; };
    globalThis.clearTimeout = id => { timers.delete(id); };

    const view = createLibraryView(deps({ $: dom.$, state: {}, pendingDeletionBlocked: () => false }));
    const pressCard = { events: {}, addEventListener(name, fn) { this.events[name] = fn; } };
    view.wireLongPress(pressCard, () => holds++);

    const down = { button: 0, clientX: 10, clientY: 10, target: { closest: () => null } };
    const expire = () => { for (const fn of [...timers.values()]) fn(); };
    for (const cancel of [
      () => pressCard.events.pointerleave(),
      () => pointerEvents.get('pointerup')(),
      () => pointerEvents.get('pointercancel')(),
      () => pointerEvents.get('scroll')(),
      () => pressCard.events.pointermove({ clientX: 30, clientY: 10 })
    ]) {
      pressCard.events.pointerdown(down); cancel(); expire();
      assert.equal(holds, 0); assert.equal(pointerEvents.size, 0);
    }

    pressCard.events.pointerdown(down); expire();
    assert.equal(holds, 1); assert.equal(pointerEvents.size, 0);
    let suppressed = 0;
    pressCard.events.click({ preventDefault() { suppressed++; }, stopPropagation() {} });
    assert.equal(suppressed, 1);

    const textTarget = { closest: selector => selector === '.help-text-selectable' ? {} : null };
    let textToggles = 0;
    view.wireLongPress(
      pressCard,
      () => holds++,
      event => { if (event.target.closest?.('.help-text-selectable')) return; textToggles++; },
      false,
      event => !!event.target.closest?.('.help-text-selectable')
    );
    pressCard.events.pointerdown({ ...down, target: textTarget }); expire();
    assert.equal(holds, 1); assert.equal(timers.size, 0);
    pressCard.events.click({ target: textTarget, preventDefault() {}, stopPropagation() {} });
    assert.equal(textToggles, 0);
  } finally {
    globalThis.setTimeout = origSetTimeout;
    globalThis.clearTimeout = origClearTimeout;
    globalThis.document = origDoc;
  }
  console.log('PASS long press cancels on leaving, outside release, scrolling, cancellation and movement; completed holds suppress clicks');
  console.log('PASS selectable explanation text is excluded from long-press and bulk-toggle handling');
}

// 2. Named story deletion confirmation shows title as plain text, focuses Cancel, and records deleteStoryIds.
{
  const dom = stubDom();
  const state = { stories: [{ id: 'a' }, { id: 'b' }] };
  globalThis.document = dom.document;
  const view = createLibraryView(deps({ $: dom.$, state, pendingDeletionBlocked: () => false }));
  let dialogOpened = false;
  dom.$('delete-stories-dialog').showModal = () => { dialogOpened = true; };
  view.confirmStoryDeletion(new Set(['a']), { title: '<b>Title</b>' });
  assert.ok(dialogOpened);
  assert.ok(dom.$('delete-stories-message').textContent.includes('<b>Title</b>'));
  assert.equal(dom.document.activeElement, dom.$('cancel-delete-stories'));
  assert.deepEqual(Array.from(state.deleteStoryIds), ['a']);
  console.log('PASS named story deletion confirmation opens modal, displays plain title, focuses Cancel, and stores target IDs');
}
