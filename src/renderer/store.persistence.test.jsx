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
});
