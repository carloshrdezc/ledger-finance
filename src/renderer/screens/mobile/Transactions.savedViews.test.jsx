// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

let store;

vi.mock('../../useUndoableStore', () => ({
  useUndoableStore: () => store,
}));
vi.mock('../../components/PeriodSwitcher', () => ({ default: () => <div data-testid="period-switcher" /> }));
vi.mock('../../components/EmptySectionHint', () => ({ default: () => <div data-testid="empty-hint" /> }));
vi.mock('./AddSheet', () => ({ default: () => null }));

function makeStore(overrides = {}) {
  const store = {
    transactions: [],
    periodTransactions: [],
    deleteTx: vi.fn(),
    deleteTransfer: vi.fn(),
    accountsWithBalance: [],
    periodLabel: 'May 2026',
    selectedPeriod: '2026-05',
    txFilter: { category: 'food', type: 'expense' },
    clearTxFilter: vi.fn(),
    savedViews: [],
    addView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
  };
  Object.assign(store, overrides);
  store.setSelectedPeriod = vi.fn((value) => { store.selectedPeriod = value; });
  store.setTxFilter = vi.fn((value) => { store.txFilter = value; });
  return store;
}

async function renderScreen(overrides = {}) {
  store = makeStore(overrides);
  const Transactions = (await import('./Transactions')).default;
  return render(<Transactions t={{ currency: 'USD', accent: '#0f0', decimals: 2 }} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  store = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('mobile Transactions saved views', () => {
  it('prompts for a name and saves the current tx filters', async () => {
    await renderScreen();
    vi.spyOn(window, 'prompt').mockReturnValue('Coffee run');

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'coffee' } });
    fireEvent.click(screen.getByRole('button', { name: /save current view/i }));

    expect(store.addView).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'tx',
      name: 'Coffee run',
      period: '2026-05',
      search: 'coffee',
      txFilter: { category: 'food', type: 'expense' },
    }));
  });

  it('applies a saved tx view from the dropdown', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_tx_1',
          scope: 'tx',
          name: 'Food focus',
          period: '2026-05',
          search: 'latte',
          txFilter: { category: 'dining', type: 'expense' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_tx_1' } });

    expect(store.setSelectedPeriod).toHaveBeenCalledWith('2026-05');
    expect(store.setTxFilter).toHaveBeenCalledWith({ category: 'dining', type: 'expense' });
    expect(screen.getByLabelText(/search/i).value).toBe('latte');
  });

  it('renames and updates the selected view', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_tx_1',
          scope: 'tx',
          name: 'Food focus',
          period: '2026-05',
          search: 'latte',
          txFilter: { category: 'dining', type: 'expense' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_tx_1' } });
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Food focus v2');
    fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
    expect(store.updateView).toHaveBeenCalledWith('sv_tx_1', { name: 'Food focus v2' });

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'espresso' } });
    fireEvent.click(screen.getByRole('button', { name: /update from current filters/i }));
    expect(store.updateView).toHaveBeenCalledWith('sv_tx_1', expect.objectContaining({
      period: '2026-05',
      search: 'espresso',
      txFilter: { category: 'dining', type: 'expense' },
    }));
  });

  it('confirms before deleting the selected view', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_tx_1',
          scope: 'tx',
          name: 'Food focus',
          period: '2026-05',
          search: 'latte',
          txFilter: { category: 'dining', type: 'expense' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_tx_1' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /delete view/i }));

    expect(store.deleteView).toHaveBeenCalledWith('sv_tx_1');
  });

  it('does not call updateView when the rename prompt returns whitespace-only input', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_tx_1',
          scope: 'tx',
          name: 'Food focus',
          period: '2026-05',
          search: 'latte',
          txFilter: { category: 'dining', type: 'expense' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_tx_1' } });
    vi.spyOn(window, 'prompt').mockReturnValue('   ');

    // Must not throw and must not call updateView — store.jsx throws on
    // whitespace-only names; the call site is required to trim.
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
    }).not.toThrow();
    expect(store.updateView).not.toHaveBeenCalled();
  });

  it('does not call addView when the save-current-view prompt returns whitespace-only input', async () => {
    await renderScreen();
    vi.spyOn(window, 'prompt').mockReturnValue('   ');

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: /save current view/i }));
    }).not.toThrow();
    expect(store.addView).not.toHaveBeenCalled();
  });

  it('only shows tx-scoped views in the dropdown', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_tx_1',
          scope: 'tx',
          name: 'Food focus',
          period: '2026-05',
          txFilter: { category: 'dining', type: 'expense' },
        },
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Reports view',
          period: '2026-05',
          range: { kind: 'preset', preset: 'thisMonth' },
        },
      ],
    });

    const options = Array.from(screen.getByLabelText(/views/i).options).map(o => o.textContent);
    expect(options).toEqual(['Views…', 'Food focus']);
    expect(store.setTxFilter).not.toHaveBeenCalled();
  });
});
