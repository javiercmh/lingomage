// Output-directory safety, atomic JSON writes and the single-writer lock for AI evals.
// The file system is injectable so tests can simulate write failures without touching real runs.
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const RUNS_DIR = path.join(ROOT, 'docs/validation/generation-evaluation/ai-evals/runs');
export const RUN_FILE = 'run.json';

const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);

function realpathOfExisting(fs, target) {
  // Resolve the nearest existing ancestor so symlinks cannot redirect a new directory into the repository.
  let existing = target;
  const rest = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...rest);
}

// Read-only: validates and resolves; creates nothing.
export function resolveOutputDir(raw, {fs = nodeFs, root = ROOT, runsDir = RUNS_DIR} = {}) {
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) throw new Error('An explicit output directory is required.');
  if (raw.split(/[\\/]/).includes('..')) throw new Error('Output directory must not contain ".." path segments.');
  const resolved = path.resolve(raw);
  const real = realpathOfExisting(fs, resolved);
  const realRoot = fs.realpathSync(root);
  const realRuns = path.join(realpathOfExisting(fs, path.dirname(runsDir)), path.basename(runsDir));
  const home = os.homedir();
  for (const candidate of new Set([resolved, real])) {
    if (candidate === path.parse(candidate).root || candidate === home || candidate === os.tmpdir()) throw new Error('Output directory is too broad; choose a dedicated run directory.');
    if (inside(candidate, root) || inside(candidate, realRoot)) throw new Error('Output directory must not contain the repository.');
    const repoRelative = inside(root, candidate) || inside(realRoot, candidate);
    const allowed = inside(runsDir, candidate) || inside(realRuns, candidate);
    if (repoRelative && (!allowed || candidate === runsDir || candidate === realRuns)) {
      throw new Error('Inside the repository, runs belong in a subdirectory of docs/validation/generation-evaluation/ai-evals/runs/ (Git-ignored). Never use learner, packaged or source directories.');
    }
  }
  let exists = false, empty = true;
  if (fs.existsSync(real)) {
    if (fs.lstatSync(real).isSymbolicLink() || fs.lstatSync(resolved).isSymbolicLink()) throw new Error('Output directory must not be a symbolic link.');
    if (!fs.statSync(real).isDirectory()) throw new Error('Output path exists and is not a directory.');
    exists = true;
    const entries = fs.readdirSync(real);
    empty = !entries.length;
    if (!empty && !entries.includes(RUN_FILE) && !entries.includes('run.lock')) throw new Error('Output directory is not empty and is not an AI-eval run directory.');
  }
  return {dir: real, exists, empty};
}

export function writeJsonAtomic(fs, file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'w');
    fs.writeSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporary, file);
  } catch (error) {
    try { if (fd !== undefined) fs.closeSync(fd); } catch { /* best effort */ }
    try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    throw error;
  }
}

export function createStore(dir, fs = nodeFs) {
  const file = name => {
    const target = path.join(dir, name);
    if (!inside(dir, target)) throw new Error('Path escapes the run directory.');
    return target;
  };
  return {
    dir,
    fs,
    ensure() { fs.mkdirSync(dir, {recursive: true}); for (const sub of ['cases', 'attempts']) fs.mkdirSync(path.join(dir, sub), {recursive: true}); },
    exists: name => fs.existsSync(file(name)),
    read: name => JSON.parse(fs.readFileSync(file(name), 'utf8')),
    write: (name, value) => writeJsonAtomic(fs, file(name), value)
  };
}

// Exclusive creation; a leftover lock is never removed automatically because a crash may have left a request in flight.
export function acquireLock(store, now) {
  const name = 'run.lock';
  const target = path.join(store.dir, name);
  let fd;
  try { fd = store.fs.openSync(target, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('This output directory is locked by another or an interrupted evaluation (run.lock). Confirm no evaluation is running, then delete run.lock manually and resume explicitly.');
    throw error;
  }
  store.fs.writeSync(fd, JSON.stringify({pid: process.pid, host: os.hostname(), at: now().toISOString()}) + '\n');
  store.fs.closeSync(fd);
  return () => { try { store.fs.unlinkSync(target); } catch { /* already removed */ } };
}
