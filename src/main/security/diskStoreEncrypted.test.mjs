// CAR-242: diskStoreEncrypted tests — encrypt/decrypt roundtrip via slice 1
// codec, locked-write refusal (spec test T2), locked-read sentinel.

import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { createDiskStoreEncrypted, LOCKED_SENTINEL } from './diskStoreEncrypted.mjs';
import { randBytes } from './aead.mjs';

function makeRuntime(initialMk = null) {
  let mk = initialMk;
  return {
    getMk: () => mk,
    setMk: next => { mk = next; },
    clearMk: () => { mk = null; },
  };
}

async function makeStore({ unlocked = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ledger-encstore-'));
  const filePath = path.join(dir, 'ledger-encrypted.json');
  const runtime = makeRuntime(unlocked ? randBytes(32) : null);
  const store = createDiskStoreEncrypted({ filePath, runtime });
  return { dir, filePath, runtime, store };
}

describe('encrypted disk store', () => {
  it('write then read round-trips the plaintext payload', async () => {
    const { store } = await makeStore({ unlocked: true });
    const payload = { 'ledger:tx': [{ id: 't1', amount: 42 }], 'ledger:currency': 'EUR' };

    await store.write(payload);

    await expect(store.read()).resolves.toEqual(payload);
  });

  it('read returns LOCKED sentinel when MK is absent', async () => {
    const { store } = await makeStore({ unlocked: false });
    const result = await store.read();
    expect(result).toEqual(LOCKED_SENTINEL);
    expect(result.__locked).toBe(true);
  });

  it('write rejects with LOCKED when MK is absent (spec T2)', async () => {
    const { store } = await makeStore({ unlocked: false });
    await expect(store.write({ 'ledger:tx': [] })).rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('write after lock-now (clearMk) refuses subsequent writes', async () => {
    const { store, runtime } = await makeStore({ unlocked: true });
    await store.write({ 'ledger:tx': [{ id: 'a' }] });
    runtime.clearMk();
    await expect(store.write({ 'ledger:tx': [{ id: 'b' }] })).rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('read on a fresh install (no file yet) returns {}', async () => {
    const { store } = await makeStore({ unlocked: true });
    await expect(store.read()).resolves.toEqual({});
  });
});
