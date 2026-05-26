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

  it('gives unique ids to views created in the same tick', async () => {
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

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1710000000000);
    const randomSpy = vi.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.123456).mockReturnValueOnce(0.654321);

    act(() => {
      store.addView({
        scope: 'tx',
        name: 'Coffee run',
        period: '2026-05',
        search: 'coffee',
        txFilter: { type: 'expense', category: 'food' },
      });
      store.addView({
        scope: 'reports',
        name: 'Monthly reports',
        period: '2026-05',
        range: { kind: 'preset', preset: 'thisMonth' },
      });
    });

    expect(store.savedViews).toHaveLength(2);
    expect(store.savedViews[0].id).toMatch(/^sv_1710000000000_/);
    expect(store.savedViews[1].id).toMatch(/^sv_1710000000000_/);
    expect(store.savedViews[0].id).not.toBe(store.savedViews[1].id);

    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('upserts duplicate saved view names within the same scope', async () => {
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
        name: 'Foo',
        period: '2026-05',
        search: 'coffee',
        txFilter: { type: 'expense', category: 'food' },
      });
      store.addView({
        scope: 'tx',
        name: ' fOO ',
        period: '2026-06',
        search: 'latte',
        txFilter: { type: 'expense', category: 'dining' },
      });
    });

    expect(store.savedViews).toHaveLength(1);
    expect(store.savedViews[0]).toMatchObject({
      scope: 'tx',
      name: 'fOO',
      period: '2026-06',
      search: 'latte',
      txFilter: { type: 'expense', category: 'dining' },
    });
  });

  it('throws when updateView receives a whitespace-only name', async () => {
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
        name: 'Foo',
        period: '2026-05',
        search: 'coffee',
        txFilter: { type: 'expense' },
      });
    });

    expect(() => {
      act(() => {
        store.updateView(store.savedViews[0].id, { name: '   ' });
      });
    }).toThrow('LEDGER_INVALID_VIEW_NAME');
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
