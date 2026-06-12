// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { monthKey } from '../../period.mjs';

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

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'coffee' } });
    fireEvent.click(screen.getByRole('button', { name: /save current view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Coffee run' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(store.addView).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'tx',
      name: 'Coffee run',
      period: '2026-05',
      search: 'coffee',
      txFilter: { category: 'food', type: 'expense' },
    }));
  });

  it('saves with __current__ sentinel when user picks follow-current-period', async () => {
    await renderScreen();

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: 'coffee' } });
    fireEvent.click(screen.getByRole('button', { name: /save current view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Coffee run' } });
    fireEvent.click(screen.getByLabelText(/follow current period/i));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(store.addView).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'tx',
      name: 'Coffee run',
      period: '__current__',
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

  it('applying a __current__ sentinel view sets selectedPeriod to the current month, not the snapshot date', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_tx_1',
          scope: 'tx',
          name: 'Follow current',
          period: '__current__',
          search: 'latte',
          txFilter: { category: 'dining', type: 'expense' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_tx_1' } });

    expect(store.setSelectedPeriod).toHaveBeenCalledWith(monthKey(new Date()));
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
    fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Food focus v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^rename$/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /delete view/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(store.deleteView).toHaveBeenCalledWith('sv_tx_1');
  });

  it('disables the rename SAVE button on whitespace-only input and never calls updateView', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: '   ' } });

    const renameBtn = screen.getByRole('button', { name: /^rename$/i });
    expect(renameBtn.disabled).toBe(true);
    fireEvent.click(renameBtn);
    expect(store.updateView).not.toHaveBeenCalled();
  });

  it('disables the save SAVE button on whitespace-only input and never calls addView', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /save current view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: '   ' } });

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(saveBtn);
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

  it('shows an inline error and keeps the modal open when renaming collides in scope', async () => {
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
          id: 'sv_tx_2',
          scope: 'tx',
          name: 'Travel',
          period: '2026-05',
          txFilter: { category: 'travel', type: 'expense' },
        },
      ],
      // Real updateView contract: throws on duplicate (scope, name).
      // Without the try/catch in handleRenameSubmit this would surface
      // as an uncaught exception in a React event handler → renderer
      // crash. Locking it here keeps mobile parity with web behavior.
      updateView: vi.fn(() => {
        throw new Error('LEDGER_DUPLICATE_VIEW_NAME');
      }),
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_tx_1' } });
    fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Travel' } });

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: /^rename$/i }));
    }).not.toThrow();

    expect(screen.getByRole('alert').textContent).toContain('Travel');
    expect(screen.queryByLabelText(/view name/i)).not.toBeNull();
  });
});
