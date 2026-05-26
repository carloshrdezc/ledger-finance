// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function clearGlobals() {
  localStorage.clear();
  delete window.ledgerDB;
  vi.resetModules();
}

function makeLedgerDB(overrides = {}) {
  return {
    read: vi.fn().mockResolvedValue({}),
    write: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

afterEach(() => {
  clearGlobals();
});

describe('store persistence', () => {
  it('falls back to localStorage when Electron IPC is absent', async () => {
    localStorage.setItem('ledger:currency', JSON.stringify('EUR'));

    const { StoreProvider, useStore } = await import('./store.jsx');
    let store;

    function Probe() {
      store = useStore();
      return null;
    }

    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );

    expect(store.currency).toBe('EUR');

    act(() => {
      store.setCurrency('GBP');
    });

    expect(store.currency).toBe('GBP');
    expect(localStorage.getItem('ledger:currency')).toBe(JSON.stringify('GBP'));
  });

  it('migrates localStorage into Electron disk state with a single bulk read', async () => {
    localStorage.setItem('ledger:currency', JSON.stringify('EUR'));
    window.ledgerDB = makeLedgerDB();

    const { StoreProvider, useStore } = await import('./store.jsx');
    let store;

    function Probe() {
      store = useStore();
      return null;
    }

    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );

    await waitFor(() => expect(window.ledgerDB.read).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.ledgerDB.write).toHaveBeenCalledTimes(1));
    expect(window.ledgerDB.write.mock.calls[0][0]).toMatchObject({
      'ledger:currency': 'EUR',
      'ledger:_migratedToDisk': true,
    });
    expect(store.currency).toBe('EUR');
  });

  it('persists ledger:onboarded and clears it on reset', async () => {
    localStorage.setItem('ledger:onboarded', JSON.stringify(true));
    window.ledgerDB = makeLedgerDB();

    const { StoreProvider, useStore } = await import('./store.jsx');
    let store;

    function Probe() {
      store = useStore();
      return null;
    }

    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );

    await waitFor(() => expect(window.ledgerDB.read).toHaveBeenCalledTimes(1));
    expect(store.onboarded).toBe(true);

    act(() => {
      store.reset();
    });

    expect(store.onboarded).toBe(false);
    expect(localStorage.getItem('ledger:onboarded')).toBe(JSON.stringify(false));
  });

  // CAR-91 review fix: durability on quit. The disk write is debounced by
  // 250 ms and disk is authoritative on boot, so without a quit-time flush an
  // edit made within the debounce window would be lost forever. The renderer
  // installs a `pagehide` listener that fires the pending write immediately
  // and asks main to flush its queue.
  it('flushes pending writes on pagehide so quit-window edits are not lost', async () => {
    window.ledgerDB = makeLedgerDB({ read: vi.fn().mockResolvedValue({ 'ledger:_migratedToDisk': true }) });

    const { StoreProvider, useStore } = await import('./store.jsx');
    let store;

    function Probe() {
      store = useStore();
      return null;
    }

    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );

    // Boot/migration writes finish first.
    await waitFor(() => expect(window.ledgerDB.read).toHaveBeenCalled());
    const writesBeforeEdit = window.ledgerDB.write.mock.calls.length;

    act(() => {
      store.setCurrency('JPY');
    });

    // Edit is debounced — no new disk write yet.
    expect(window.ledgerDB.write.mock.calls.length).toBe(writesBeforeEdit);

    // User quits before debounce fires.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // pagehide must trigger an immediate write of the latest snapshot AND
    // ask main to flush its queue.
    await waitFor(() => {
      expect(window.ledgerDB.write.mock.calls.length).toBeGreaterThan(writesBeforeEdit);
    });
    const lastWrite = window.ledgerDB.write.mock.calls.at(-1)[0];
    expect(lastWrite['ledger:currency']).toBe('JPY');
    expect(window.ledgerDB.flush).toHaveBeenCalled();
  });

  // CAR-91 review fix: stale-key pruning. `writeLedgerStorageSnapshot`
  // mirrors the disk snapshot back to localStorage; previously it only added
  // keys, so a value removed from the snapshot lingered in the mirror and
  // could resurface if a future disk read fell back to localStorage.
  it('prunes ledger:* keys absent from the disk snapshot from the localStorage mirror', async () => {
    localStorage.setItem('ledger:stale', JSON.stringify('old-value'));
    localStorage.setItem('ledger:keep', JSON.stringify('still-here'));
    localStorage.setItem('not-ledger', 'untouched');

    window.ledgerDB = makeLedgerDB({
      // Disk has 'keep' but not 'stale'.
      read: vi.fn().mockResolvedValue({
        'ledger:_migratedToDisk': true,
        'ledger:keep': 'still-here',
      }),
    });

    const { StoreProvider } = await import('./store.jsx');

    render(
      <StoreProvider>
        <div />
      </StoreProvider>,
    );

    await waitFor(() => expect(window.ledgerDB.read).toHaveBeenCalled());
    await waitFor(() => {
      // 'ledger:stale' should have been pruned from the mirror.
      expect(localStorage.getItem('ledger:stale')).toBeNull();
    });
    expect(localStorage.getItem('ledger:keep')).toBe(JSON.stringify('still-here'));
    expect(localStorage.getItem('not-ledger')).toBe('untouched');
  });

  // CAR-91 review-round-2 fix: the ordering race on quit. The first attempt
  // relied on `pagehide` to fire-and-forget a write, but `pagehide` happens
  // *after* main's `before-quit` handler resolves — so `ledgerStore.flush()`
  // drained a queue that didn't yet contain the pending edit, and the IPC
  // raced process exit. The fix exposes `window.__ledgerFlush` which main
  // calls via `executeJavaScript` and AWAITS before draining its queue.
  //
  // This test is the renderer half of the contract: __ledgerFlush must
  // resolve only after the pending debounced write's IPC has completed.
  // The main-side test would require an Electron harness; here we lock the
  // promise-completion contract with a controllable IPC mock.
  // PR #62 round-2 fix: hasExistingUserData must consider catTree and rules.
  // Original first-run-detection logic only looked at tx/accounts/etc. — a
  // returning user who had customized categories or rules but never added a
  // transaction would be re-onboarded after the upgrade.
  describe('boot migration seeds onboarded for returning users', () => {
    async function bootWith(snapshot) {
      window.ledgerDB = makeLedgerDB({
        read: vi.fn().mockResolvedValue(snapshot),
      });
      const { StoreProvider, useStore } = await import('./store.jsx');
      let store;
      function Probe() { store = useStore(); return null; }
      render(<StoreProvider><Probe /></StoreProvider>);
      await waitFor(() => expect(window.ledgerDB.read).toHaveBeenCalled());
      return () => store;
    }

    it('seeds onboarded=true for a user with only customized catTree (no transactions/accounts)', async () => {
      const get = await bootWith({
        'ledger:_migratedToDisk': true,
        'ledger:catTree': { food: { dining: {} } },
      });
      expect(get().onboarded).toBe(true);
    });

    it('seeds onboarded=true for a user with only customized rules (no transactions/accounts)', async () => {
      const get = await bootWith({
        'ledger:_migratedToDisk': true,
        'ledger:rules': [{ id: 'r1', match: 'amazon', cat: 'shopping' }],
      });
      expect(get().onboarded).toBe(true);
    });

    it('does not seed onboarded for a fresh install (no existing data)', async () => {
      const get = await bootWith({ 'ledger:_migratedToDisk': true });
      expect(get().onboarded).toBe(false);
    });

    it('preserves an explicit onboarded=false (re-seed via Settings replay)', async () => {
      const get = await bootWith({
        'ledger:_migratedToDisk': true,
        'ledger:onboarded': false,
        'ledger:accounts': [{ id: 'a1', name: 'CHK' }],
      });
      expect(get().onboarded).toBe(false);
    });
  });

  it('exposes window.__ledgerFlush that resolves only after the pending write IPC completes', async () => {
    let resolveWrite;
    const writePromise = new Promise(resolve => { resolveWrite = resolve; });
    const write = vi.fn(() => writePromise);
    window.ledgerDB = makeLedgerDB({
      read: vi.fn().mockResolvedValue({ 'ledger:_migratedToDisk': true }),
      write,
    });

    const { StoreProvider, useStore } = await import('./store.jsx');
    let store;

    function Probe() {
      store = useStore();
      return null;
    }

    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );

    await waitFor(() => expect(window.ledgerDB.read).toHaveBeenCalled());
    await waitFor(() => expect(typeof window.__ledgerFlush).toBe('function'));

    // Make a debounced edit, then trigger __ledgerFlush. The returned
    // promise must NOT resolve until we resolve the underlying IPC write —
    // that's the whole point of the round-trip from main's before-quit.
    act(() => { store.setCurrency('CHF'); });

    let flushResolved = false;
    const flushPromise = window.__ledgerFlush().then(() => { flushResolved = true; });

    // Yield so any synchronous setup runs, but the IPC is still pending.
    await Promise.resolve();
    await Promise.resolve();
    expect(flushResolved).toBe(false);

    // The pending write must have been forwarded immediately (debounce
    // bypassed) — the timer should be cancelled.
    const lastWrite = write.mock.calls.at(-1);
    expect(lastWrite[0]['ledger:currency']).toBe('CHF');

    // Resolve the IPC; only then __ledgerFlush should resolve.
    resolveWrite();
    await flushPromise;
    expect(flushResolved).toBe(true);
  });
});
