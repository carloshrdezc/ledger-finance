// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, cleanup, render, screen } from '@testing-library/react';

let store;

vi.mock('../../useUndoableStore', () => ({
  useUndoableStore: () => store,
}));
vi.mock('../../hooks/useKeyboardShortcuts', () => ({ default: () => {} }));
vi.mock('../../hooks/useBulkSelection', () => ({
  default: () => ({
    selectedCount: 0,
    selectedIds: [],
    anchorIdx: null,
    clear: vi.fn(),
    setAnchor: vi.fn(),
    toggle: vi.fn(),
    selectAll: vi.fn(),
    isSelected: () => false,
    range: vi.fn(),
  }),
}));
vi.mock('./WebShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./WebAddModal', () => ({ default: () => null }));
vi.mock('../../components/EmptySectionHint', () => ({ default: () => <div data-testid="empty-hint" /> }));
vi.mock('../../components/TransactionRow', () => ({ default: () => <div data-testid="tx-row" /> }));
vi.mock('../../components/BulkActionBar', () => ({ default: () => null }));
vi.mock('../../components/PeriodSwitcher', () => ({ default: () => <div data-testid="period-switcher" /> }));
vi.mock('../../bulkOps.mjs', () => ({ detectTransferPair: () => null }));

function makeStore(overrides = {}) {
  return {
    transactions: [],
    periodTransactions: [],
    deleteTx: vi.fn(),
    deleteTransfer: vi.fn(),
    accountsWithBalance: [],
    periodLabel: 'May 2026',
    selectedPeriod: '2026-05',
    txFilter: { category: 'food', type: 'expense' },
    clearTxFilter: vi.fn(),
    deleteTxs: vi.fn(),
    hideTxs: vi.fn(),
    updateTxs: vi.fn(),
    categoryTree: {},
    savedViews: [],
    addView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
    setSelectedPeriod: vi.fn(),
    setTxFilter: vi.fn(),
    ...overrides,
  };
}

async function renderScreen(overrides = {}) {
  store = makeStore(overrides);
  const WebTransactions = (await import('./WebTransactions')).default;
  return render(
    <WebTransactions
      t={{ currency: 'USD', accent: '#0f0' }}
      onNavigate={vi.fn()}
      onAdd={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  store = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WebTransactions saved views', () => {
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
      txFilter: { category: 'food', type: 'expense' },
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
});
