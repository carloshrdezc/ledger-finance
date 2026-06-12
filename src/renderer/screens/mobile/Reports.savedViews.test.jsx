// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { monthKey } from '../../period.mjs';

let store;

vi.mock('../../store', () => ({
  useStore: () => store,
}));
vi.mock('../../useFx', () => ({
  useFx: () => ({ toReporting: (value) => value }),
}));
vi.mock('../../components/Shared', () => ({
  ALabel: ({ children }) => <div>{children}</div>,
  ARule: () => <div data-testid="rule" />,
  CategoryTrendChart: () => <div data-testid="category-chart" />,
  IncomeExpenseChart: () => <div data-testid="income-chart" />,
  LineChart: () => <div data-testid="line-chart" />,
  SankeyChart: () => <div data-testid="sankey-chart" />,
}));
vi.mock('../../components/NetWorthAttributionBreakdown', () => ({ default: () => <div data-testid="net-worth-breakdown" /> }));
vi.mock('../../components/PeriodSwitcher', () => ({ default: () => <div data-testid="period-switcher" /> }));
vi.mock('../../components/RangeSelector', () => ({
  default: ({ range }) => <div data-testid="range-state">{range.kind}:{range.preset || range.label || ''}</div>,
}));
vi.mock('../../components/EmptySectionHint', () => ({ default: () => <div data-testid="empty-hint" /> }));
vi.mock('../../importExport', () => ({ exportReportCSV: vi.fn(() => 'csv') }));
vi.mock('../../download.mjs', () => ({ downloadFile: vi.fn() }));
vi.mock('../../charts.mjs', () => ({
  addMonths: (p, n) => `${p}:${n}`,
  filterTransactionsForPeriod: () => [],
  filterTransactionsForRange: () => [],
  formatShortPeriodLabel: (p) => p,
  resolveRangePreset: (preset) => ({ start: '2026-05-01', end: '2026-05-31', label: preset }),
  buildCategoryTrend: () => [],
  buildIncomeExpenseSeries: () => [],
  buildNetWorthTrend: () => [],
  buildSankeyFlows: () => ({ nodes: [], links: [], totalIn: 0, totalOut: 0 }),
  getRecentPeriods: () => ['2026-05'],
}));

function makeStore(overrides = {}) {
  const store = {
    transactions: [],
    periodTransactions: [],
    categoryTree: {},
    selectedPeriod: '2026-05',
    periodLabel: 'May 2026',
    accounts: [],
    bills: [],
    rates: { USD: 1 },
    txFilter: null,
    savedViews: [],
    addView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
  };
  Object.assign(store, overrides);
  store.setTxFilter = vi.fn((value) => { store.txFilter = value; });
  store.setSelectedPeriod = vi.fn((value) => { store.selectedPeriod = value; });
  return store;
}

async function renderScreen(overrides = {}) {
  store = makeStore(overrides);
  const Reports = (await import('./Reports')).default;
  return render(<Reports t={{ currency: 'USD', decimals: true, accent: '#0f0' }} onBack={() => {}} onGoToRoute={() => {}} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  store = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('mobile Reports saved views', () => {
  it('prompts for a name and saves the current reports view', async () => {
    await renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /save current view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Monthly report' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(store.addView).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'reports',
      name: 'Monthly report',
      period: '2026-05',
      range: { kind: 'preset', preset: 'thisMonth' },
    }));
  });

  it('saves with __current__ sentinel when user picks follow-current-period', async () => {
    await renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /save current view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Monthly report' } });
    fireEvent.click(screen.getByLabelText(/follow current period/i));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(store.addView).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'reports',
      name: 'Monthly report',
      period: '__current__',
      range: { kind: 'preset', preset: 'thisMonth' },
    }));
  });

  it('applies a saved reports view from the dropdown', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Last month',
          period: '2026-04',
          range: { kind: 'preset', preset: 'lastMonth' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_reports_1' } });

    expect(store.setSelectedPeriod).toHaveBeenCalledWith('2026-04');
    expect(screen.getByTestId('range-state').textContent).toContain('preset:lastMonth');
  });

  it('applying a __current__ sentinel view sets selectedPeriod to the current month, not the snapshot date', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Follow current',
          period: '__current__',
          range: { kind: 'preset', preset: 'thisMonth' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_reports_1' } });

    expect(store.setSelectedPeriod).toHaveBeenCalledWith(monthKey(new Date()));
  });

  it('renames and updates the selected reports view', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Last month',
          period: '2026-04',
          range: { kind: 'preset', preset: 'lastMonth' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_reports_1' } });

    fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Last month v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^rename$/i }));
    expect(store.updateView).toHaveBeenCalledWith('sv_reports_1', { name: 'Last month v2' });

    fireEvent.click(screen.getByRole('button', { name: /update from current filters/i }));
    expect(store.updateView).toHaveBeenCalledWith('sv_reports_1', expect.objectContaining({
      period: '2026-04',
      range: { kind: 'preset', preset: 'lastMonth' },
      txFilter: null,
    }));
  });

  it('confirms before deleting the selected reports view', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Last month',
          period: '2026-04',
          range: { kind: 'preset', preset: 'lastMonth' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_reports_1' } });
    fireEvent.click(screen.getByRole('button', { name: /delete view/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(store.deleteView).toHaveBeenCalledWith('sv_reports_1');
  });

  it('disables the rename SAVE button on whitespace-only input and never calls updateView', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Last month',
          period: '2026-04',
          range: { kind: 'preset', preset: 'lastMonth' },
        },
      ],
    });

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_reports_1' } });
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

  it('only shows reports-scoped views in the dropdown', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Last month',
          period: '2026-04',
          range: { kind: 'preset', preset: 'lastMonth' },
        },
        {
          id: 'sv_tx_1',
          scope: 'tx',
          name: 'Tx view',
          period: '2026-05',
          txFilter: { category: 'food', type: 'expense' },
        },
      ],
    });

    const options = Array.from(screen.getByLabelText(/views/i).options).map(o => o.textContent);
    expect(options).toEqual(['Views…', 'Last month']);
    expect(store.setTxFilter).not.toHaveBeenCalled();
  });

  it('shows an inline error and keeps the modal open when renaming collides', async () => {
    await renderScreen({
      savedViews: [
        {
          id: 'sv_reports_1',
          scope: 'reports',
          name: 'Last month',
          period: '2026-04',
          range: { kind: 'preset', preset: 'lastMonth' },
        },
        {
          id: 'sv_reports_2',
          scope: 'reports',
          name: 'Quarterly',
          period: '2026-03',
          range: { kind: 'preset', preset: 'thisMonth' },
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

    fireEvent.change(screen.getByLabelText(/views/i), { target: { value: 'sv_reports_1' } });
    fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: 'Quarterly' } });

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: /^rename$/i }));
    }).not.toThrow();

    expect(screen.getByRole('alert').textContent).toContain('Quarterly');
    expect(screen.queryByLabelText(/view name/i)).not.toBeNull();
  });
});
