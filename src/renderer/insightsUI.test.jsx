// @vitest-environment jsdom
// CAR-217: regression tests for the weekly-insights UI integration. Locks
// down three behaviors:
//
//   1. WebAlerts renders insightRows with dismiss + restore wired through.
//   2. Mobile Home renders an insights teaser that calls onInsight on tap.
//   3. Dashboard's category-spike drill-down sets the right tx-filter and
//      navigates to the transactions tab — the AC 3 contract.
//
// We mock useStore via StoreCtx so we don't have to spin up real localStorage.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import WebAlerts from './screens/web/WebAlerts';
import Home from './screens/mobile/Home';
import Dashboard from './screens/web/Dashboard';
import { StoreCtx } from './store';

afterEach(() => {
  cleanup();
});

const THEME = { currency: 'USD', decimals: 2, accent: '#0f0', density: 'comfortable', theme: 'light' };

// Minimum-viable insight row matching the shape buildInsightRows produces.
function makeSpike(overrides = {}) {
  return {
    id: 'insight:spike:food:2026-W21',
    kind: 'insight',
    type: 'spike',
    severity: 'medium',
    title: 'FOOD SPEND SPIKE',
    detail: '2x trailing avg',
    metric: '150%',
    action: 'REVIEW',
    route: 'transactions',
    routeParams: { cat: 'food', period: 'this-week' },
    ...overrides,
  };
}

function makeInactiveSub(overrides = {}) {
  return {
    id: 'insight:inactive-sub:r1',
    kind: 'insight',
    type: 'inactive-sub',
    severity: 'low',
    title: 'NETFLIX UNUSED',
    detail: 'No charge in 60 days',
    metric: '60d',
    action: 'REVIEW',
    route: 'recurring',
    routeParams: {},
    ...overrides,
  };
}

// Bare-minimum store value satisfying the consumers under test.
function makeStore(overrides = {}) {
  return {
    // Shared / required by every screen
    transactions: [],
    accounts: [],
    accountsWithBalance: [],
    accountsIncludedInTotals: [],
    periodLabel: 'MAY 2026',
    rates: { USD: 1, MXN: 17, EUR: 0.92 },
    billRows: [],
    budgetRows: [],
    goals: [],
    alertRows: [],
    dismissAlert: vi.fn(),
    restoreAlerts: vi.fn(),
    // CAR-217 surface
    insightRows: [],
    dismissInsight: vi.fn(),
    restoreInsights: vi.fn(),
    setTxFilter: vi.fn(),
    ...overrides,
  };
}

function renderWithStore(ui, storeOverrides = {}) {
  const store = makeStore(storeOverrides);
  const utils = render(<StoreCtx.Provider value={store}>{ui}</StoreCtx.Provider>);
  return { ...utils, store };
}

describe('CAR-217 · WebAlerts insights section', () => {
  it('renders the [02] WEEKLY INSIGHTS heading even when no insights are active', () => {
    renderWithStore(<WebAlerts t={THEME} onNavigate={() => {}} />, {
      insightRows: [],
    });
    expect(screen.getByText(/\[02\] WEEKLY INSIGHTS/)).toBeTruthy();
    expect(screen.getByText(/NO ACTIVE INSIGHTS/)).toBeTruthy();
  });

  it('renders each active insight and its dismiss button calls dismissInsight(id)', () => {
    const spike = makeSpike();
    const sub = makeInactiveSub();
    const { store } = renderWithStore(<WebAlerts t={THEME} onNavigate={() => {}} />, {
      insightRows: [spike, sub],
    });

    expect(screen.getByText('FOOD SPEND SPIKE')).toBeTruthy();
    expect(screen.getByText('NETFLIX UNUSED')).toBeTruthy();

    // Each insight row has exactly one DISMISS button. Insights render
    // AFTER alerts in WebAlerts, so insight dismiss buttons are the LAST
    // `insightRows.length` entries in the DISMISS list. Use a length-aware
    // slice instead of fixed indices so the test stays correct if the
    // alerts fixture grows in the future.
    const allDismiss = screen.getAllByText('DISMISS');
    const insightDismissButtons = allDismiss.slice(-2); // 2 insights = last 2
    expect(insightDismissButtons).toHaveLength(2);
    fireEvent.click(insightDismissButtons[0]); // first insight (FOOD SPEND SPIKE)
    expect(store.dismissInsight).toHaveBeenCalledWith(spike.id);
  });

  it('clicking an insight with route=transactions calls setTxFilter + onNavigate(tx)', () => {
    const onNavigate = vi.fn();
    const { store } = renderWithStore(
      <WebAlerts t={THEME} onNavigate={onNavigate} />,
      { insightRows: [makeSpike()] },
    );

    fireEvent.click(screen.getByText('FOOD SPEND SPIKE'));
    expect(store.setTxFilter).toHaveBeenCalledWith({
      type: 'expense',
      category: 'food',
    });
    expect(onNavigate).toHaveBeenCalledWith('tx');
  });

  it('clicking an insight with a non-tx route falls through to plain onNavigate(route)', () => {
    const onNavigate = vi.fn();
    const { store } = renderWithStore(
      <WebAlerts t={THEME} onNavigate={onNavigate} />,
      { insightRows: [makeInactiveSub()] },
    );

    fireEvent.click(screen.getByText('NETFLIX UNUSED'));
    // applyInsightDrillDown forwards routeParams as the 2nd arg so callers
    // can opt into params per-route. Fixture has routeParams: {}.
    expect(onNavigate).toHaveBeenCalledWith('recurring', {});
    expect(store.setTxFilter).not.toHaveBeenCalled();
  });

  it('RESTORE DISMISSED button calls restoreInsights', () => {
    const { store } = renderWithStore(<WebAlerts t={THEME} onNavigate={() => {}} />, {
      insightRows: [],
    });
    // Both Alerts and Insights sections have a RESTORE DISMISSED button.
    // Insights is the second one (rendered after the alerts list).
    const restoreButtons = screen.getAllByText('RESTORE DISMISSED');
    expect(restoreButtons).toHaveLength(2);
    fireEvent.click(restoreButtons[1]);
    expect(store.restoreInsights).toHaveBeenCalled();
  });
});

describe('CAR-217 · Mobile Home insights teaser', () => {
  it('hides the insights section entirely when insightRows is empty', () => {
    renderWithStore(<Home t={THEME} onAcct={() => {}} onAdd={() => {}} onViewAll={() => {}} />, {
      insightRows: [],
    });
    // No "[02B] INSIGHTS" header should render — this is intentional. We
    // don't want to clutter Home with a "no insights" empty-state on mobile.
    expect(screen.queryByText(/\[02B\] INSIGHTS/)).toBeNull();
  });

  it('renders top 2 insights and forwards the row to onInsight on tap', () => {
    const spike = makeSpike();
    const sub = makeInactiveSub();
    const onInsight = vi.fn();
    renderWithStore(
      <Home
        t={THEME}
        onAcct={() => {}}
        onAdd={() => {}}
        onViewAll={() => {}}
        onInsight={onInsight}
      />,
      { insightRows: [spike, sub, makeSpike({ id: 'insight:spike:dining:2026-W21', title: 'DINING SPIKE' })] },
    );

    expect(screen.getByText(/\[02B\] INSIGHTS · 3/)).toBeTruthy();
    expect(screen.getByText('FOOD SPEND SPIKE')).toBeTruthy();
    expect(screen.getByText('NETFLIX UNUSED')).toBeTruthy();
    // Third insight should NOT render — Home only shows top 2.
    expect(screen.queryByText('DINING SPIKE')).toBeNull();

    fireEvent.click(screen.getByText('FOOD SPEND SPIKE'));
    expect(onInsight).toHaveBeenCalledWith(spike);
  });
});

describe('CAR-217 · Dashboard category-spike drill-down (AC 3)', () => {
  it('clicking a category-spike insight applies the tx filter and navigates to tx', () => {
    const onNavigate = vi.fn();
    const spike = makeSpike();
    const { store } = renderWithStore(
      <Dashboard t={THEME} onNavigate={onNavigate} onAdd={() => {}} />,
      { insightRows: [spike] },
    );

    fireEvent.click(screen.getByText('FOOD SPEND SPIKE'));
    expect(store.setTxFilter).toHaveBeenCalledWith({
      type: 'expense',
      category: 'food',
    });
    expect(onNavigate).toHaveBeenCalledWith('tx');
  });

  it('new-merchant insights drill via the merchant filter', () => {
    const onNavigate = vi.fn();
    const newMerchant = {
      id: 'insight:new-merchant:NEW STORE',
      kind: 'insight',
      type: 'new-merchant',
      severity: 'low',
      title: 'NEW MERCHANT: NEW STORE',
      detail: 'First seen this week',
      metric: '$42',
      action: 'REVIEW',
      route: 'transactions',
      routeParams: { merchant: 'NEW STORE' },
    };
    const { store } = renderWithStore(
      <Dashboard t={THEME} onNavigate={onNavigate} onAdd={() => {}} />,
      { insightRows: [newMerchant] },
    );

    fireEvent.click(screen.getByText('NEW MERCHANT: NEW STORE'));
    expect(store.setTxFilter).toHaveBeenCalledWith({
      type: 'expense',
      merchant: 'NEW STORE',
    });
    expect(onNavigate).toHaveBeenCalledWith('tx');
  });
});

// CAR-217: lock the empty-app gate. The store memo wraps buildInsightRows
// with `isAppEmpty ? [] : buildInsightRows(...)` so a brand-new user isn't
// shown stale-looking detector output. This test mounts the real
// StoreProvider with empty localStorage and asserts the gate holds.
describe('insightRows gate', () => {
  it('returns [] when isAppEmpty is true (fresh install)', async () => {
    // Reset localStorage so isAppEmptyFor returns true.
    window.localStorage.clear();
    const { StoreProvider, useStore } = await import('./store');

    let captured = null;
    function Probe() {
      const { insightRows, isAppEmpty } = useStore();
      captured = { insightRows, isAppEmpty };
      return null;
    }
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    expect(captured.isAppEmpty).toBe(true);
    expect(captured.insightRows).toEqual([]);
  });
});
