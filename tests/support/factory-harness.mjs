// Runs one production create…(deps) factory in Node without booting the whole app.
//   const { loadFactory, stubDom } = await import('./support/factory-harness.mjs');
//   const createX = await loadFactory('js/x.js', 'createX');
//   const dom = stubDom(); const api = createX(deps({ $: dom.$, state, … }));
// js/bridge.js is replaced by fake-bridge.mjs (see `bridge` there). deps() returns a dependency object in which
// every name the test does not give is a no-op function, so a test lists only what it exercises.
import * as nodeModule from 'node:module';
const fakeBridge = new URL('./fake-bridge.mjs', import.meta.url).href;
// Production imports of js/bridge.js get fake-bridge.mjs (module.registerHooks, Node 22.15+; check.py enforces it).
nodeModule.registerHooks({ resolve(specifier, context, next) {
  const result = next(specifier, context);
  return result.url.endsWith('/js/bridge.js') ? { ...result, url: fakeBridge } : result;
} });

export const { bridge } = await import('./fake-bridge.mjs');

const root = new URL('../../', import.meta.url);
export async function loadFactory(file, name) {
  globalThis.window ??= { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 360, innerHeight: 800 };
  globalThis.document ??= stubDom().document;
  const module = await import(new URL(file, root).href);
  if (typeof module[name] !== 'function') throw new Error(`${file} does not export ${name}`);
  return module[name];
}

// Name every callback whose effect the test checks: a silent default would let a missing call pass. With
// { strict: true } an unnamed dependency throws when the factory calls it.
export function deps(given = {}, { strict = false } = {}) {
  const fallback = key => strict ? () => { throw new Error(`Dependency ${String(key)} was called but not given`); } : () => undefined;
  return new Proxy(given, { get: (target, key) => key in target ? target[key] : fallback(key), has: () => true });
}

// Elements are created on first $(id); each records listeners (element.listeners[type] = [fn…]) and attributes.
export function stubDom() {
  const elements = new Map();
  const element = (id = '') => {
    const node = {
      id, hidden: false, disabled: false, open: false, value: '', textContent: '', checked: false, selectedIndex: 0,
      dataset: {}, style: { setProperty() {}, removeProperty() {} }, attributes: {}, listeners: {}, children: [],
      classList: { values: new Set(), add(...names) { names.forEach(n => this.values.add(n)); }, remove(...names) { names.forEach(n => this.values.delete(n)); },
        toggle(name, force) { const on = force ?? !this.values.has(name); if (on) this.values.add(name); else this.values.delete(name); return on; }, contains(name) { return this.values.has(name); } },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== fn); },
      dispatch(type, event = {}) { return Promise.all((this.listeners[type] || []).map(fn => fn({ target: node, preventDefault() {}, stopPropagation() {}, ...event }))); },
      setAttribute(name, value) { this.attributes[name] = String(value); }, getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; },
      append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, remove() { this.removed = true; },
      querySelector: () => element(), querySelectorAll: () => [], closest: () => null, contains: () => false, matches: () => false,
      focus() { document.activeElement = node; }, scrollIntoView() {}, showModal() { this.open = true; }, close() { this.open = false; },
      dispatchEvent() { return true; }, getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }), getClientRects: () => []
    };
    return node;
  };
  const document = {
    activeElement: null, body: element('body'), visibilityState: 'visible',
    createElement: tag => Object.assign(element(), { tagName: String(tag).toUpperCase() }),
    getElementById: id => $(id), querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}
  };
  const $ = id => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); };
  return { $, document, elements };
}
