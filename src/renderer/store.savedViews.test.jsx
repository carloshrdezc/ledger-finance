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

describe('saved views store', () => {
  it('adds, updates, deletes, and clears saved views', async () => {
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

    expect(store.savedViews).toEqual([]);

    act(() => {
      store.addView({
        scope: 'tx',
        name: 'Coffee run',
        period: '2026-05',
        search: 'coffee',
        txFilter: { type: 'expense', category: 'food' },
      });
    });

    expect(store.savedViews).toHaveLength(1);
    const [saved] = store.savedViews;
    expect(saved).toMatchObject({
      scope: 'tx',
      name: 'Coffee run',
      period: '2026-05',
      search: 'coffee',
      txFilter: { type: 'expense', category: 'food' },
    });
    expect(JSON.parse(localStorage.getItem('ledger:savedViews'))).toEqual(store.savedViews);

    act(() => {
      store.updateView(saved.id, {
        name: 'Coffee run v2',
        search: 'latte',
        txFilter: { type: 'expense', category: 'dining' },
      });
    });

    expect(store.savedViews[0]).toMatchObject({
      name: 'Coffee run v2',
      search: 'latte',
      txFilter: { type: 'expense', category: 'dining' },
    });

    act(() => {
      store.deleteView(saved.id);
    });

    expect(store.savedViews).toEqual([]);
    expect(JSON.parse(localStorage.getItem('ledger:savedViews'))).toEqual([]);

    act(() => {
      store.addView({
        scope: 'reports',
        name: 'Monthly reports',
        period: '2026-05',
        range: { kind: 'preset', preset: 'thisMonth' },
      });
    });
    expect(store.savedViews).toHaveLength(1);

    act(() => {
      store.reset();
    });

    expect(store.savedViews).toEqual([]);
    expect(JSON.parse(localStorage.getItem('ledger:savedViews'))).toEqual([]);
  });

  it('hydrates saved views from persisted storage', async () => {
    localStorage.setItem(
      'ledger:savedViews',
      JSON.stringify([
        {
          id: 'sv_1',
          scope: 'reports',
          name: 'Persisted view',
          period: '2026-05',
          range: { kind: 'preset', preset: 'lastMonth' },
        },
      ]),
    );

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

    await waitFor(() => expect(store.savedViews).toHaveLength(1));
    expect(store.savedViews[0]).toMatchObject({
      id: 'sv_1',
      scope: 'reports',
      name: 'Persisted view',
    });
  });

  it('keeps saved views empty after resetAndLoadSampleData', async () => {
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

    act(() => {
      store.addView({
        scope: 'tx',
        name: 'Temporary',
        period: '2026-05',
        search: 'coffee',
        txFilter: { type: 'expense' },
      });
    });

    act(() => {
      store.resetAndLoadSampleData();
    });

    expect(store.savedViews).toEqual([]);
  });
});
