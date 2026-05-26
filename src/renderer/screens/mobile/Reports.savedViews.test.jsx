// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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
    vi.spyOn(window, 'prompt').mockReturnValue('Monthly report');

    fireEvent.click(screen.getByRole('button', { name: /save current view/i }));

    expect(store.addView).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'reports',
      name: 'Monthly report',
      period: '2026-05',
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

    vi.spyOn(window, 'prompt').mockReturnValueOnce('Last month v2');
    fireEvent.click(screen.getByRole('button', { name: /rename view/i }));
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /delete view/i }));

    expect(store.deleteView).toHaveBeenCalledWith('sv_reports_1');
  });

  it('does not call updateView when the rename prompt returns whitespace-only input', async () => {
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
});
