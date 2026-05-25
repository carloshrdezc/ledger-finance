import { access, mkdir, open, readFile, rename } from 'fs/promises';
import path from 'path';


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

async function atomicWriteJson(filePath, state) {
  const dirPath = path.dirname(filePath);
  await mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(JSON.stringify(state, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, filePath);
  await fsyncDir(dirPath);
}

export function createDiskStore(filePath) {
  let tail = Promise.resolve();
  let cached = {};

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
    await atomicWriteJson(filePath, cached);
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
