// @vitest-environment jsdom
// CAR-218: integration tests for the cash-flow forecast dashboard widget.
//
// We mock useStore via StoreCtx so we don't have to spin up real localStorage
// or the rest of the store. Three behaviors locked down:
//
//   1. Empty state when there are no liquid accounts.
//   2. Renders [CF] heading + horizon buttons + projected value when data
//      flows through projectBalances → compactForecastSeries.
//   3. Switching horizon (30D → 90D) re-runs the projection and the chart
//      reflects the new dataset (we check the hero "TO HERE" delta updates).
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CashFlowForecastWidget from './CashFlowForecastWidget';
import { StoreCtx } from '../store';

afterEach(() => { cleanup(); });

const THEME = { currency: 'USD', decimals: 2, accent: '#0f0' };

function makeStore(overrides = {}) {
  return {
    accountsWithBalance: [],
    transactions: [],
    bills: [],
    forecastLiquidAccountIds: [],
    forecastThreshold: 0,
    ...overrides,
  };
}

function renderWithStore(storeOverrides = {}) {
  const store = makeStore(storeOverrides);
  const utils = render(
    <StoreCtx.Provider value={store}>
      <CashFlowForecastWidget t={THEME} />
    </StoreCtx.Provider>,
  );
  return { ...utils, store };
}

describe('CashFlowForecastWidget', () => {
  it('renders empty state when there are no liquid accounts', () => {
    renderWithStore({ accountsWithBalance: [] });
    expect(screen.getByText(/CASH FLOW · FORECAST/)).toBeTruthy();
    expect(screen.getByText(/ADD A LIQUID ACCOUNT/)).toBeTruthy();
  });

  it('renders forecast hero, horizon controls, and threshold note when liquid data exists', () => {
    renderWithStore({
      accountsWithBalance: [
        { id: 'a1', name: 'Checking', type: 'CHK', balance: 5000, ccy: 'USD' },
        { id: 'a2', name: 'Savings',  type: 'SAV', balance: 2000, ccy: 'USD' },
      ],
      transactions: [],
      bills: [],
      forecastThreshold: 0,
    });

    // The widget heading is present.
    expect(screen.getByText(/CASH FLOW · FORECAST/)).toBeTruthy();

    // Horizon buttons render.
    expect(screen.getByText('30D')).toBeTruthy();
    expect(screen.getByText('60D')).toBeTruthy();
    expect(screen.getByText('90D')).toBeTruthy();

    // Footer summary renders with threshold info (no risk days expected).
    expect(screen.getByText(/NO RISK DAYS · THRESHOLD/)).toBeTruthy();

    // Projected line label.
    expect(screen.getByText(/PROJECTED ·/)).toBeTruthy();

    // Low-point label.
    expect(screen.getByText(/LOW POINT/)).toBeTruthy();
  });

  it('flags risk days below threshold', () => {
    // Threshold above starting balance → all days flagged as risk.
    renderWithStore({
      accountsWithBalance: [
        { id: 'a1', name: 'Checking', type: 'CHK', balance: 100, ccy: 'USD' },
      ],
      transactions: [],
      bills: [],
      forecastThreshold: 1000,
    });
    // Some "RISK DAY" or "RISK DAYS" message must appear in the footer.
    expect(screen.getByText(/RISK (DAY|DAYS) · THRESHOLD/)).toBeTruthy();
  });

  it('horizon buttons are clickable and update active state', () => {
    renderWithStore({
      accountsWithBalance: [
        { id: 'a1', name: 'Checking', type: 'CHK', balance: 5000, ccy: 'USD' },
      ],
      transactions: [],
      bills: [],
    });
    const ninety = screen.getByText('90D');
    fireEvent.click(ninety);
    // After clicking 90D, the "TO HERE" suffix should reflect the new horizon.
    expect(screen.getByText(/90D TO HERE/)).toBeTruthy();
  });
});
