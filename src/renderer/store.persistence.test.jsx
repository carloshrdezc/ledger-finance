// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function clearGlobals() {
  localStorage.clear();
  delete window.ledgerDB;
  vi.resetModules();
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
    const read = vi.fn().mockResolvedValue({});
    const write = vi.fn().mockResolvedValue(undefined);
    const subscribe = vi.fn(() => () => {});
    window.ledgerDB = { read, write, exportBackup: vi.fn(), import: vi.fn(), subscribe };

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

    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0][0]).toMatchObject({
      'ledger:currency': 'EUR',
      'ledger:_migratedToDisk': true,
    });
    expect(store.currency).toBe('EUR');
  });
});
