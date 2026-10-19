// Small real-tree DOM for behavioral reader tests: parent/child links, text-node splitting and merging,
// simple selectors (tag, .class, #id, [attr], [attr="v"], :not(...), comma lists), event capture/bubble and focus.
// It models only what the reader modules use; it is not a browser, so layout and native menus stay unverified.
const SHOW_TEXT = 4;

function matchesCompound(node, compound) {
  let rest = compound.trim();
  const tag = /^[a-z][a-z0-9-]*/i.exec(rest);
  if (tag) { if (node.tagName !== tag[0].toLowerCase()) return false; rest = rest.slice(tag[0].length); }
  while (rest) {
    let match;
    if ((match = /^\.([\w-]+)/.exec(rest))) { if (!node.className.split(/\s+/).includes(match[1])) return false; }
    else if ((match = /^#([\w-]+)/.exec(rest))) { if (node.id !== match[1]) return false; }
    else if ((match = /^\[([\w-]+)(?:="([^"]*)")?\]/.exec(rest))) {
      const value = node.getAttribute(match[1]);
      if (value === null || (match[2] !== undefined && value !== match[2])) return false;
    } else if ((match = /^:not\(((?:[^()]|\([^)]*\))*)\)/.exec(rest))) { if (matchesCompound(node, match[1])) return false; }
    else throw new Error(`Unsupported selector: ${compound}`);
    rest = rest.slice(match[0].length);
  }
  return true;
}
function splitSelector(selector) {
  const parts = []; let depth = 0, current = '';
  for (const char of selector) {
    if (char === '(' ) depth++; if (char === ')') depth--;
    if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char;
  }
  return [...parts, current];
}

export function createTreeDom() {
  const listeners = new WeakMap();
  const add = (node, type, handler, options) => {
    const capture = options === true || Boolean(options?.capture);
    if (!listeners.has(node)) listeners.set(node, []);
    listeners.get(node).push({ type, handler, capture });
  };
  class Node {
    constructor(nodeType) { this.nodeType = nodeType; this.parentNode = null; this.childNodes = []; }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node === document; }
    contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
    append(...nodes) { for (const node of nodes) { if (node.nodeType === 11) this.append(...node.childNodes); else { node.remove?.(); node.parentNode = this; this.childNodes.push(node); } } }
    remove() { if (!this.parentNode) return; this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; }
    replaceWith(...nodes) {
      const parent = this.parentNode, index = parent.childNodes.indexOf(this), flat = nodes.flatMap(node => node.nodeType === 11 ? [...node.childNodes] : [node]);
      for (const node of flat) { node.remove(); node.parentNode = parent; }
      parent.childNodes.splice(parent.childNodes.indexOf(this), 1, ...flat); this.parentNode = null;
      return index;
    }
    addEventListener(type, handler, options) { add(this, type, handler, options); }
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  }
  class Text extends Node {
    constructor(value) { super(3); this.nodeValue = value; }
    get textContent() { return this.nodeValue; }
    set textContent(value) { this.nodeValue = String(value); }
  }
  class Element extends Node {
    constructor(tagName) {
      super(1); this.tagName = tagName.toLowerCase(); this.attributes = new Map(); this.dataset = {}; this.className = ''; this.id = '';
      this.hidden = false; this.style = {}; this.tabIndex = -1; this.rect = { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 };
    }
    get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
    set textContent(value) { this.childNodes.forEach(node => { node.parentNode = null; }); this.childNodes = []; if (value !== '') this.append(new Text(String(value))); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'tabindex') this.tabIndex = Number(value); if (name === 'class') this.className = String(value); if (name === 'id') this.id = String(value); }
    getAttribute(name) {
      if (name === 'class') return this.className || null; if (name === 'id') return this.id || null;
      if (name === 'tabindex' && this.tabIndex >= 0) return String(this.tabIndex);
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    removeAttribute(name) { this.attributes.delete(name); }
    matches(selector) { return splitSelector(selector).some(part => matchesCompound(this, part)); }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) { const found = []; const visit = node => { for (const child of node.childNodes) if (child.nodeType === 1) { if (child.matches(selector)) found.push(child); visit(child); } }; visit(this); return found; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    normalize() {
      for (const child of [...this.childNodes]) if (child.nodeType === 1) child.normalize();
      const merged = [];
      for (const child of this.childNodes) {
        if (child.nodeType !== 3) { merged.push(child); continue; }
        if (child.nodeValue === '') { child.parentNode = null; continue; }
        const previous = merged[merged.length - 1];
        if (previous?.nodeType === 3) { previous.nodeValue += child.nodeValue; child.parentNode = null; } else merged.push(child);
      }
      this.childNodes = merged;
    }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return this.rect; }
    get nodeName() { return this.tagName.toUpperCase(); }
  }
  class Fragment extends Node { constructor() { super(11); } }
  class Document extends Node {
    constructor() { super(9); this.activeElement = null; }
    createElement(tag) { return new Element(tag); }
    createTextNode(value) { return new Text(String(value)); }
    createDocumentFragment() { return new Fragment(); }
    createTreeWalker(root, what, filter) {
      const queue = [];
      const visit = node => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3 && what & SHOW_TEXT) { const verdict = filter?.acceptNode ? filter.acceptNode(child) : 1; if (verdict === 1) queue.push(child); }
          else if (child.nodeType === 1) visit(child);
        }
      };
      visit(root); let index = 0;
      return { nextNode: () => queue[index++] || null };
    }
  }
  const document = new Document();
  document.body = document.createElement('body'); document.append(document.body);
  const windowListeners = new Map();
  const window = {
    innerWidth: 400, innerHeight: 800, selection: { isCollapsed: true, anchorNode: null, focusNode: null },
    getSelection() { return window.selection; },
    addEventListener(type, handler) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(handler); },
    fire(type) { for (const handler of windowListeners.get(type) || []) handler({ type }); }
  };
  // Dispatches through capture then bubble listeners; returns the event so tests can inspect defaultPrevented.
  function dispatch(target, type, init = {}) {
    const event = { type, target, defaultPrevented: false, propagationStopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...init };
    const path = []; for (let node = target; node; node = node.parentNode) path.push(node);
    const run = (node, capture) => { for (const entry of listeners.get(node) || []) if (entry.type === type && entry.capture === capture) entry.handler(event); };
    for (const node of [...path].reverse()) { if (event.propagationStopped) break; run(node, true); }
    for (const node of path) { if (event.propagationStopped) break; run(node, false); }
    return event;
  }
  const globals = { document, window, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 }, NodeFilter: { SHOW_TEXT, FILTER_ACCEPT: 1, FILTER_REJECT: 2 } };
  return { document, window, dispatch, globals, Element, Text };
}
