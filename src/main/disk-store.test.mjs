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
});
