// Test stand-in for js/bridge.js, loaded by factory-harness.mjs in place of the real bridge so production
// modules can be imported in Node. Every export is a mutable object or a function that tests may replace
// through `bridge` (for example `bridge.ai.providers = async () => …`); nothing touches a host or the network.
const files = new Map();
export const bridge = {
  ai: { available: true, developmentLive: false, developmentMock: false,
    providers: async () => ({ providers: [] }), models: async () => ({ models: [] }),
    start: async () => { throw new Error('ai.start is not stubbed'); }, wait: async () => '', acknowledge: async () => {}, cancel: async () => {} },
  speech: { available: false, speak: async () => ({ status: 'completed' }), stop: async () => {} },
  translation: { available: false, open: async () => ({ launched: true }), availability: async () => ({ available: false }) },
  selectionMenu: { available: false, set() {} },
  share: { available: false, text: async () => ({ launched: true }), file: async () => ({ launched: true }) },
  save: { available: false, text: async () => ({ saved: true }) },
  files
};
export const isNative = false;
export const ai = bridge.ai, speech = bridge.speech, translation = bridge.translation;
export const selectionMenu = bridge.selectionMenu, share = bridge.share, save = bridge.save;
export function readFile(path) { return files.get(path) ?? ''; }
export function writeFile(path, text) { files.set(path, String(text)); return true; }
export function listFiles() { return [...files.keys()].map(name => ({ name, size: files.get(name).length, lastModified: 0 })); }
export function notify() { return false; }
export function hasNotificationPermission() { return false; }
export async function requestNotificationPermission() { return false; }
