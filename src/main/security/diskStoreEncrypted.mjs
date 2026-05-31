// CAR-242: Encrypted disk-store wrapper.
//
// Same factory shape as `disk-store.mjs` (`createDiskStore`) so the main
// process can swap implementations at boot based on
// `securityConfig.enabled`. When the runtime holds an MK, reads decrypt
// transparently and writes encrypt before atomic-writing. When the runtime
// is locked (no MK), reads return a `{ __locked: true }` sentinel so the
// renderer's StoreProvider can render the lock screen instead of children;
// writes are refused with `LOCKED` (spec test T2).

import { access, mkdir, open, readFile, rename } from 'fs/promises';
import path from 'path';
import { encodeStore, decodeStore } from './storeCodec.mjs';

async function fsyncDir(dirPath) {
  let handle;
  try {
    handle = await open(dirPath, 'r');
    await handle.sync();
  } catch {
    // Best-effort; Windows directory fsync routinely fails — see disk-store.mjs.
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* ignore */ }
    }
  }
}

async function atomicWriteJson(filePath, payload) {
  const dirPath = path.dirname(filePath);
  await mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(JSON.stringify(payload, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, filePath);
  await fsyncDir(dirPath);
}

async function readJsonOrNull(filePath) {
  try {
    await access(filePath);
  } catch {
    try {
      const tmpRaw = await readFile(`${filePath}.tmp`, 'utf8');
      return JSON.parse(tmpRaw);
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      throw err;
    }
  }
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Build a locked sentinel object. The renderer's StoreProvider checks for
 * `__locked === true` and renders <LockScreen> instead of children.
 */
export const LOCKED_SENTINEL = Object.freeze({ __locked: true });

/**
 * @param {object} args
 * @param {string} args.filePath  absolute path to the encrypted blob on disk
 * @param {object} args.runtime   security runtime (`getMk()`, `isLocked()`)
 */
export function createDiskStoreEncrypted({ filePath, runtime }) {
  if (!filePath) throw new Error('filePath required');
  if (!runtime || typeof runtime.getMk !== 'function') {
    throw new Error('runtime with getMk() required');
  }

  let tail = Promise.resolve();
  const enqueue = task => {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  };

  const read = async () => {
    await tail.catch(() => {});
    const mk = runtime.getMk();
    if (!mk) return { ...LOCKED_SENTINEL };

    const blob = await readJsonOrNull(filePath);
    if (blob === null) return {}; // fresh install, no encrypted store yet
    try {
      return decodeStore(blob, mk);
    } catch (e) {
      // Tag mismatch / malformed payload (spec I4 / STORE_PAYLOAD_MALFORMED).
      // Surface to caller; main IPC handler can decide how to render.
      throw e;
    }
  };

  const write = state => enqueue(async () => {
    const mk = runtime.getMk();
    if (!mk) {
      const err = new Error('LOCKED');
      err.code = 'LOCKED';
      throw err;
    }
    const blob = encodeStore(state, mk);
    await atomicWriteJson(filePath, blob);
  });

  const flush = () => tail.catch(() => {});

  return { read, write, flush };
}
