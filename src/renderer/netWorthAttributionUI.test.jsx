// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import Dashboard from './screens/web/Dashboard';
import WebReports from './screens/web/WebReports';
import { StoreCtx } from './store';

let store;
afterEach(() => {
  cleanup();
});

const THEME = { currency: 'USD', decimals: 2, accent: '#00a', density: 'comfortable' };

function makeStore(overrides = {}) {
  return {
    transactions: [],
    periodTransactions: [],
    accounts: [],
    accountsWithBalance: [],
    accountsIncludedInTotals: [],
    periodLabel: 'MAY 2026',
    selectedPeriod: '2026-05',
    rates: { USD: 1 },
    categoryTree: {},
    billRows: [],
    budgetRows: [],
    goals: [],
    alertRows: [],
    insightRows: [],
    dismissInsight: vi.fn(),
    setTxFilter: vi.fn(),
    savedViews: [],
    addView: vi.fn(),
    updateView: vi.fn(),
    deleteView: vi.fn(),
    bills: [],
    ...overrides,
  };
}

function renderWithStore(ui, storeOverrides = {}) {
  const store = makeStore(storeOverrides);
  return {
    store,
    ...render(<StoreCtx.Provider value={store}>{ui}</StoreCtx.Provider>),
  };
}

describe('net-worth attribution drill-downs', () => {
  it('Dashboard contribution bucket drills into investment transfers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T12:00:00Z'));

    const store = makeStore({
      transactions: [
        { id: 'inc', date: '2026-05-10', acct: 'chk', cat: 'income', amt: 1000, ccy: 'USD' },
        { id: 'xfer-out', date: '2026-05-15', acct: 'chk', cat: 'transfer', amt: -300, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-in' },
        { id: 'xfer-in', date: '2026-05-15', acct: 'vti', cat: 'transfer', amt: 300, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-out' },
      ],
      accounts: [
        { id: 'chk', type: 'CHK', ccy: 'USD', openingBal: 1000, balance: 1700 },
        { id: 'vti', type: 'INV', ccy: 'USD', openingBal: 2000, balance: 2300 },
      ],
      accountsWithBalance: [
        { id: 'chk', type: 'CHK', ccy: 'USD', balance: 1700, delta: 700 },
        { id: 'vti', type: 'INV', ccy: 'USD', balance: 2300, delta: 300 },
      ],
      accountsIncludedInTotals: [
        { id: 'chk', type: 'CHK', ccy: 'USD', balance: 1700, delta: 700 },
        { id: 'vti', type: 'INV', ccy: 'USD', balance: 2300, delta: 300 },
      ],
      budgetRows: [],
      billRows: [],
      alertRows: [],
      insightRows: [],
    });
    const onNavigate = vi.fn();

    render(
      <StoreCtx.Provider value={store}>
        <Dashboard t={THEME} onNavigate={onNavigate} onAdd={() => {}} />
      </StoreCtx.Provider>,
    );

    fireEvent.click(screen.getByText('CONTRIBUTIONS'));
    expect(store.setTxFilter).toHaveBeenCalledWith({ type: 'transfer', accountType: ['INV', 'CRY'] });
    expect(onNavigate).toHaveBeenCalledWith('tx');

    vi.useRealTimers();
  });

  it('Reports market-gains bucket is non-drillable (residual, no underlying txs)', () => {
    store = makeStore({
      transactions: [
        { id: 'xfer-out', date: '2026-05-15', acct: 'chk', cat: 'transfer', amt: -300, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-in' },
        { id: 'xfer-in', date: '2026-05-15', acct: 'vti', cat: 'transfer', amt: 300, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-out' },
      ],
      periodTransactions: [
        { id: 'xfer-out', date: '2026-05-15', acct: 'chk', cat: 'transfer', amt: -300, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-in' },
        { id: 'xfer-in', date: '2026-05-15', acct: 'vti', cat: 'transfer', amt: 300, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-out' },
      ],
      accounts: [
        { id: 'chk', type: 'CHK', ccy: 'USD', openingBal: 1000, balance: 700 },
        { id: 'vti', type: 'INV', ccy: 'USD', openingBal: 2000, balance: 2300 },
      ],
      periodLabel: 'MAY 2026',
      selectedPeriod: '2026-05',
      categoryTree: {},
      accountsWithBalance: [
        { id: 'chk', type: 'CHK', ccy: 'USD', balance: 700, delta: -300 },
        { id: 'vti', type: 'INV', ccy: 'USD', balance: 2300, delta: 300 },
      ],
      accountsIncludedInTotals: [
        { id: 'chk', type: 'CHK', ccy: 'USD', balance: 700, delta: -300 },
        { id: 'vti', type: 'INV', ccy: 'USD', balance: 2300, delta: 300 },
      ],
    });
    const onNavigate = vi.fn();

    render(
      <StoreCtx.Provider value={store}>
        <WebReports t={THEME} onNavigate={onNavigate} onAdd={() => {}} />
      </StoreCtx.Provider>,
    );

    fireEvent.click(screen.getByText('MARKET GAINS'));
    // CAR-87 review: marketGains is a residual (close-open minus tx flow),
    // not transaction-backed. The breakdown disables click on this bucket;
    // setTxFilter / onNavigate must NOT fire.
    // Explicit disabled-wiring assertion so an accidental regression to a
    // clickable button (without removing the no-op intent) fails fast.
    const marketGainsButton = screen.getByText('MARKET GAINS').closest('button');
    expect(marketGainsButton.disabled).toBe(true);
    expect(marketGainsButton.getAttribute('aria-disabled')).toBe('true');
    expect(store.setTxFilter).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
