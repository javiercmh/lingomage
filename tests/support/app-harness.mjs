// Boots the real js/app.js against a permissive stub DOM and an in-memory file backend (the bridge's
// ordinary-browser localStorage fallback). Nothing here touches the workspace's data files or any network.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let run = 0;

function createElement(registry, document, id = '') {
  const values = {id, children: [], dataset: {}, style: {}, hidden: false, disabled: false, value: '', textContent: '', className: '', checked: false, handlers: {}, attributes: {}};
  const stub = function () {};
  const element = new Proxy(stub, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === 'then') return undefined;
      if (key === 'options' || key === 'childNodes') return values.children;
      if (key === 'append') return (...nodes) => { values.children.push(...nodes); };
      if (key === 'addEventListener') return (type, handler) => { (values.handlers[type] ||= []).push(handler); };
      if (key === 'setAttribute') return (name, value) => { values.attributes[name] = String(value); };
      if (key === 'getAttribute') return name => values.attributes[name] ?? null;
      if (key === 'removeAttribute') return name => { delete values.attributes[name]; };
      if (key === 'focus') return () => { document.activeElement = element; };
      if (key in values) return values[key];
      if (key === 'classList') return {add() {}, remove() {}, toggle() {}, contains: () => false};
      if (key === 'getBoundingClientRect') return () => ({top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0});
      if (key === 'getClientRects' || key === 'querySelectorAll') return () => [];
      if (key === 'closest' || key === 'matches' || key === 'contains') return () => null;
      if (key === 'length') return 0;
      if (key === 'querySelector' || key === 'cloneNode') return () => createElement(registry, document);
      return () => undefined;
    },
    set(_, key, value) { if (key === 'textContent') values.children = []; values[key] = value; return true; }
  });
  return element;
}

// files: {'data/settings.json': '...'}; absent keys are missing files. Returns the booted app's test handles.
export async function bootApp({files = {}, seedDefaults = true} = {}) {
  const store = new Map();
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  store.set('file:data/learning-profiles.json', read('data/learning-profiles.json'));
  store.set('file:data/language-safeguards.json', read('data/language-safeguards.json'));
  for (const [name, text] of Object.entries(files)) store.set(`file:${name}`, text);
  const registry = new Map(), document = {activeElement: null, documentElement: null, body: null, head: null, visibilityState: 'visible', title: ''};
  const elementFor = id => { if (!registry.has(id)) registry.set(id, createElement(registry, document, id)); return registry.get(id); };
  Object.assign(document, {
    getElementById: elementFor, querySelector: () => createElement(registry, document), querySelectorAll: () => [],
    createElement: () => createElement(registry, document), createElementNS: () => createElement(registry, document), createTextNode: () => createElement(registry, document), createRange: () => createElement(registry, document),
    addEventListener() {}, removeEventListener() {}
  });
  document.documentElement = createElement(registry, document); document.body = createElement(registry, document); document.head = createElement(registry, document);
  const control = {failKeys: new Set(), reloads: 0};
  const windowHandlers = [];
  const stubs = {
    document, window: globalThis,
    // Stored keys are enumerable own properties, as in a browser (the bridge lists files with Object.keys).
    localStorage: new Proxy({}, {
      get: (_, key) => ({
        getItem: name => store.get(name) ?? null,
        setItem: (name, value) => { if (control.failKeys.has(name)) throw new Error('simulated write failure'); store.set(name, String(value)); },
        removeItem: name => store.delete(name), key: index => [...store.keys()][index]
      })[key] ?? store.get(key),
      ownKeys: () => [...store.keys()],
      getOwnPropertyDescriptor: (_, key) => store.has(key) ? {value: store.get(key), enumerable: true, configurable: true, writable: true} : undefined
    }),
    addEventListener: (type, handler) => windowHandlers.push([type, handler]), removeEventListener() {},
    matchMedia: () => ({matches: false, addEventListener() {}}), innerWidth: 400, innerHeight: 800, scrollTo() {},
    location: {reload: () => { control.reloads++; }}, history: {pushState() {}, back() {}, state: null}, visualViewport: null, getComputedStyle: () => ({}),
    XMLHttpRequest: class { open() {} setRequestHeader() {} send() { this.status = 0; } },
    ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, Highlight: undefined, CSS: undefined,
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  };
  for (const [key, value] of Object.entries(stubs)) Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  Object.defineProperty(globalThis, 'navigator', {value: {userAgent: 'node'}, configurable: true});
  await import(`${pathToFileURL(path.join(root, 'js/app.js')).href}?run=${++run}`);
  await new Promise(resolve => setTimeout(resolve, 0));
  const dispatch = (id, type, event = {}) => { for (const handler of elementFor(id).handlers[type] || []) handler({target: elementFor(id), preventDefault() {}, stopPropagation() {}, ...event}); };
  return {
    el: elementFor, document, store, control, dispatch,
    file: name => store.get(`file:${name}`),
    failWrites: (name, on = true) => control.failKeys[on ? 'add' : 'delete'](`file:${name}`),
    buttonWithText: (box, text) => { const find = node => { for (const child of node.children || []) { if (child.textContent === text && child.handlers?.click) return child; const nested = find(child); if (nested) return nested; } return null; }; return find(box); },
    click: (button, event = {}) => { for (const handler of button.handlers.click || []) handler({target: button, ...event}); }
  };
}
