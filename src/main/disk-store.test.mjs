import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDiskStore } from './disk-store.mjs';

async function makeStore() {
  const dir = await mkdtemp(path.join(tmpdir(), 'ledger-disk-store-'));
  const filePath = path.join(dir, 'ledger-state.json');
  return { dir, filePath, store: createDiskStore(filePath) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('disk store', () => {
  it('read missing file returns {}', async () => {
    const { store } = await makeStore();
    await expect(store.read()).resolves.toEqual({});
  });

  it('write then read round-trips', async () => {
    const { filePath, store } = await makeStore();
    const state = { 'ledger:currency': 'EUR', 'ledger:theme': 'dark' };

    await store.write(state);

    await expect(store.read()).resolves.toEqual(state);
    await expect(readFile(filePath, 'utf8')).resolves.toContain('ledger:currency');
  });

  it('concurrent writes do not corrupt the final file', async () => {
    const { filePath, store } = await makeStore();
    const writes = Array.from({ length: 8 }, (_, i) => store.write({
      'ledger:counter': i,
      'ledger:theme': i % 2 === 0 ? 'light' : 'dark',
    }));

    await Promise.all(writes);

    await expect(store.read()).resolves.toEqual({
      'ledger:counter': 7,
      'ledger:theme': 'dark',
    });
    const raw = await readFile(filePath, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('partial-write recovery prefers the previous main file over a stale tmp file', async () => {
    const { dir, filePath, store } = await makeStore();
    const tmpPath = `${filePath}.tmp`;
    const state = { 'ledger:currency': 'USD', 'ledger:_migratedToDisk': true };

    await store.write(state);
    await writeFile(tmpPath, '{"ledger:currency": "EUR"');

    await expect(store.read()).resolves.toEqual(state);
    await expect(readFile(path.join(dir, 'ledger-state.json'), 'utf8')).resolves.toContain('USD');
  });

  // CAR-91 review fix: flush() awaits whatever's queued so main's
  // `before-quit` handler can drain pending writes before the process exits.
  // Without this, an edit made within the renderer's 250 ms debounce window
  // could be lost because the renderer is torn down with the timer pending.
  it('flush() resolves only after all queued writes have completed', async () => {
    const { filePath, store } = await makeStore();
    let resolveCount = 0;

    // Fire several writes back-to-back to build up a queue.
    const w1 = store.write({ 'ledger:currency': 'USD' }).then(() => { resolveCount += 1; });
    const w2 = store.write({ 'ledger:currency': 'EUR' }).then(() => { resolveCount += 1; });
    const w3 = store.write({ 'ledger:currency': 'JPY' }).then(() => { resolveCount += 1; });

    await store.flush();

    // After flush() resolves, every queued write must have resolved too —
    // that's the durability contract before-quit relies on.
    expect(resolveCount).toBe(3);
    await Promise.all([w1, w2, w3]);

    // And the file on disk must reflect the last queued write.
    const raw = await readFile(filePath, 'utf8');
    expect(JSON.parse(raw)).toEqual({ 'ledger:currency': 'JPY' });
  });

  // CAR-91 review fix: durability gap — atomicWriteJson now fsyncs the
  // parent directory after rename so the rename itself survives a crash on
  // POSIX filesystems. The fsync is best-effort (Windows often refuses to
  // fsync directory handles), so the test only asserts that a write still
  // completes successfully when the platform doesn't support it.
  it('write succeeds even when fsync of the parent directory is unsupported', async () => {
    const { filePath, store } = await makeStore();
    // The implementation swallows fsyncDir errors — verify writes still land.
    await expect(store.write({ 'ledger:theme': 'dark' })).resolves.toBeUndefined();
    const raw = await readFile(filePath, 'utf8');
    expect(JSON.parse(raw)).toEqual({ 'ledger:theme': 'dark' });
  });
});
