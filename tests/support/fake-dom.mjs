// Minimal DOM stand-in for modules that take `document` and `$` by injection. It models only
// what those modules use: children, text, attributes, listeners, focus and containment.
export function createFakeDocument(ids = []) {
  const document = {activeElement: null};
  class FakeElement {
    constructor(tagName = 'div') { this.tagName = tagName; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.dataset = {}; this.hidden = false; this.disabled = false; this.className = ''; this.text = ''; this.connected = true; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.children.forEach(child => { child.connected = false; }); this.children = []; this.text = String(value); }
    get isConnected() { return this.connected; }
    append(...nodes) { nodes.forEach(node => { node.connected = this.connected; this.children.push(node); }); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) this.listeners.get('click')?.({target: this}); }
    find(predicate) { for (const child of this.children) { if (predicate(child)) return child; const nested = child.find(predicate); if (nested) return nested; } return null; }
    button(text) { return this.find(child => child.tagName === 'button' && child.textContent === text); }
  }
  const elements = new Map(ids.map(id => { const element = new FakeElement(); element.id = id; element.hidden = true; return [id, element]; }));
  document.createElement = tag => new FakeElement(tag);
  return {document, $: id => elements.get(id), FakeElement};
}
