// @vitest-environment jsdom
// CAR-345: interaction test for the debt payoff planner UI surface. Mocks
// useStore via StoreCtx (mirrors CashFlowForecastWidget.test.jsx) so we don't
// need real localStorage or the full store.
//
// Behaviors locked down:
//   1. Empty state when there are no debts.
//   2. With debts present: both strategy summaries render with payoff date +
//      total interest, the debt row shows, and the timeline label renders.
//   3. Toggling the strategy updates the selected (aria-pressed) button and
//      the timeline label.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import PayoffPlanner from './PayoffPlanner';
import { StoreCtx } from '../store';

afterEach(() => { cleanup(); });

const THEME = { currency: 'USD', decimals: true, accent: '#0f0' };

function makeStore(overrides = {}) {
  return {
    debts: [],
    debtExtraPayment: 0,
    setDebtExtraPayment: vi.fn(),
    ...overrides,
  };
}

function renderPlanner(storeOverrides = {}, props = {}) {
  const store = makeStore(storeOverrides);
  const utils = render(
    <StoreCtx.Provider value={store}>
      <PayoffPlanner t={THEME} {...props} />
    </StoreCtx.Provider>,
  );
  return { ...utils, store };
}

const SAMPLE_DEBTS = [
  { id: 'd1', name: 'VISA', balance: 1000, apr: 24, minPayment: 80 },
  { id: 'd2', name: 'CAR LOAN', balance: 6000, apr: 6, minPayment: 200 },
];

describe('PayoffPlanner (CAR-345)', () => {
  it('renders an empty state when there are no debts', () => {
    renderPlanner({ debts: [] });
    expect(screen.getByText(/DEBT PAYOFF · 0 DEBTS/)).toBeTruthy();
    expect(screen.getByText(/NO DEBTS YET/)).toBeTruthy();
  });

  it('fires onAddDebt when the add button is clicked (empty state)', () => {
    const onAddDebt = vi.fn();
    renderPlanner({ debts: [] }, { onAddDebt });
    fireEvent.click(screen.getByText('+ ADD DEBT'));
    expect(onAddDebt).toHaveBeenCalledTimes(1);
  });

  it('renders both strategy summaries with payoff date + total interest', () => {
    renderPlanner({ debts: SAMPLE_DEBTS, debtExtraPayment: 100 });

    // Header reflects the debt count + total balance.
    expect(screen.getByText(/DEBT PAYOFF · 2 DEBTS/)).toBeTruthy();

    // Both summary cards exist (unique aria-labels avoid ambiguous queries).
    const snow = screen.getByLabelText('SUMMARY SNOWBALL');
    const aval = screen.getByLabelText('SUMMARY AVALANCHE');
    expect(snow).toBeTruthy();
    expect(aval).toBeTruthy();

    // Each card shows the DEBT-FREE + TOTAL INTEREST sections.
    expect(within(snow).getByText('DEBT-FREE')).toBeTruthy();
    expect(within(snow).getByText('TOTAL INTEREST')).toBeTruthy();
    expect(within(aval).getByText('DEBT-FREE')).toBeTruthy();
    expect(within(aval).getByText('TOTAL INTEREST')).toBeTruthy();

    // The debt row renders.
    expect(screen.getByLabelText('EDIT DEBT VISA')).toBeTruthy();

    // The timeline label renders (avalanche is the default selected strategy).
    expect(screen.getByText(/TIMELINE · AVALANCHE · REMAINING BALANCE/)).toBeTruthy();
  });

  it('toggles strategy and updates aria-pressed + timeline label', () => {
    renderPlanner({ debts: SAMPLE_DEBTS, debtExtraPayment: 100 });

    const snowBtn = screen.getByLabelText('STRATEGY SNOWBALL');
    const avalBtn = screen.getByLabelText('STRATEGY AVALANCHE');

    // Default selection is avalanche.
    expect(avalBtn.getAttribute('aria-pressed')).toBe('true');
    expect(snowBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/TIMELINE · AVALANCHE/)).toBeTruthy();

    // Switch to snowball.
    fireEvent.click(snowBtn);
    expect(snowBtn.getAttribute('aria-pressed')).toBe('true');
    expect(avalBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/TIMELINE · SNOWBALL/)).toBeTruthy();
  });

  it('commits the extra-payment input on blur', () => {
    const setDebtExtraPayment = vi.fn();
    renderPlanner({ debts: SAMPLE_DEBTS, setDebtExtraPayment });
    const input = screen.getByLabelText('EXTRA MONTHLY PAYMENT');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(setDebtExtraPayment).toHaveBeenCalledWith(250);
  });

  it('fires onEditDebt with the debt when a debt row is clicked', () => {
    const onEditDebt = vi.fn();
    renderPlanner({ debts: SAMPLE_DEBTS }, { onEditDebt });
    fireEvent.click(screen.getByLabelText('EDIT DEBT CAR LOAN'));
    expect(onEditDebt).toHaveBeenCalledWith(SAMPLE_DEBTS[1]);
  });
});
