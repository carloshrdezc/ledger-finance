import { access, mkdir, open, readFile, rename } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

// CAR-245: serialize state on a worker thread so a large stringify (a ~50k
// transaction state is multiple MB of JSON) doesn't block the main process
// event loop while the user is interacting with the renderer. Resolved
// relative to this module via import.meta.url so it works both in dev and in
// the electron-builder package (the worker ships via the `src/main/**/*`
// glob in package.json `build.files`).
const WORKER_PATH = fileURLToPath(new URL('./disk-store-stringify-worker.mjs', import.meta.url));

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = safeParseJson(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

async function readWithTmpFallback(filePath) {
  try {
    await access(filePath);
    return await readJsonFile(filePath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }

  try {
    const tmpRaw = await readFile(`${filePath}.tmp`, 'utf8');
    const parsed = safeParseJson(tmpRaw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

async function fsyncDir(dirPath) {
  // fsync the parent directory so the rename is durable across crash/power-loss.
  // Best-effort: Windows fails with EPERM/EISDIR/EINVAL on directory handles
  // depending on the platform — that's fine, NTFS gives us metadata journaling
  // and on POSIX the fsync is what matters.
  let handle;
  try {
    handle = await open(dirPath, 'r');
    await handle.sync();
  } catch {
    // Ignore — see comment above.
  } finally {
    if (handle) {
      try { await handle.close(); } catch { /* ignore */ }
    }
  }
}

async function atomicWriteJson(filePath, serialized) {
  const dirPath = path.dirname(filePath);
  await mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(serialized);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, filePath);
  await fsyncDir(dirPath);
}

// CAR-245: per-store wrapper around the stringify worker. The worker is
// spawned lazily on first write and reused for the lifetime of the store.
// Each call to stringify() owns the worker exclusively (writes are already
// serialized through the disk store's `enqueue` tail, so there is never more
// than one in-flight message), and resolves with the serialized string.
// On ANY worker failure (spawn error, runtime error, or premature exit) we
// fall back to an inline JSON.stringify so a write is never lost.
function createStringifier() {
  let worker = null;

  const disposeWorker = () => {
    if (worker) {
      const dead = worker;
      worker = null;
      try { dead.terminate(); } catch { /* ignore */ }
    }
  };

  const stringifyInline = state => JSON.stringify(state);

  const stringifyViaWorker = state => new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(WORKER_PATH);
      // Don't let the worker keep the event loop (and the app) alive on quit.
      worker.unref();
    }
    const active = worker;

    const cleanup = () => {
      active.off('message', onMessage);
      active.off('error', onError);
      active.off('exit', onExit);
    };
    const onMessage = result => {
      cleanup();
      resolve(result);
    };
    const onError = err => {
      cleanup();
      disposeWorker();
      reject(err);
    };
    const onExit = () => {
      cleanup();
      // Worker exited before replying — treat as failure so we fall back.
      if (worker === active) worker = null;
      reject(new Error('disk-store stringify worker exited before responding'));
    };

    active.on('message', onMessage);
    active.on('error', onError);
    active.on('exit', onExit);
    active.postMessage(state);
  });

  return {
    stringify: async state => {
      try {
        return await stringifyViaWorker(state);
      } catch {
        // Crash-safety: never lose a write because the worker died.
        return stringifyInline(state);
      }
    },
    dispose: disposeWorker,
  };
}

export function createDiskStore(filePath) {
  let tail = Promise.resolve();
  let cached = {};
  const stringifier = createStringifier();

  const enqueue = task => {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  };

  const read = async () => {
    await tail.catch(() => {});
    cached = await readWithTmpFallback(filePath);
    return cached;
  };

  const write = state => enqueue(async () => {
    cached = isPlainObject(state) ? state : {};
    // CAR-245: serialize off the main thread (worker), with an inline
    // fallback baked into the stringifier if the worker dies.
    const serialized = await stringifier.stringify(cached);
    await atomicWriteJson(filePath, serialized);
  });

  // Awaits whatever's currently queued. Used by `before-quit` to drain pending
  // debounced writes from the renderer before the process exits — guards
  // against the data-loss-on-quit window where a debounced write hasn't fired.
  const flush = () => tail.catch(() => {});

  return {
    read,
    write,
    flush,
  };
}
