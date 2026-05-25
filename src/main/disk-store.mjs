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

async function atomicWriteJson(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(JSON.stringify(state, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, filePath);
}

export function createDiskStore(filePath) {
  let tail = Promise.resolve();
  let cached = {};
  const listeners = new Set();

  const enqueue = task => {
    const run = tail.then(task, task);
    tail = run.catch(() => {});
    return run;
  };

  const notify = () => {
    for (const cb of listeners) {
      try {
        cb();
      } catch {
        // Listener errors should not break store writes.
      }
    }
  };

  const read = async () => {
    await tail.catch(() => {});
    cached = await readWithTmpFallback(filePath);
    return cached;
  };

  const write = state => enqueue(async () => {
    cached = isPlainObject(state) ? state : {};
    await atomicWriteJson(filePath, cached);
    notify();
  });

  const exportBackup = async () => {
    await tail.catch(() => {});
    const snapshot = await read();
    const backupPath = path.join(path.dirname(filePath), 'ledger-state.backup.json');
    await atomicWriteJson(backupPath, snapshot);
    return backupPath;
  };

  const importState = json => enqueue(async () => {
    const parsed = safeParseJson(json);
    if (!isPlainObject(parsed)) {
      throw new TypeError('Imported state must be a JSON object');
    }
    cached = parsed;
    await atomicWriteJson(filePath, parsed);
    notify();
  });

  const subscribe = cb => {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  return {
    read,
    write,
    exportBackup,
    import: importState,
    subscribe,
  };
}
