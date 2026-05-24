// @vitest-environment jsdom
// CAR-206: regression test for CCDetail crash. Pre-CAR-206, the EXPORT button
// in CCDetail's header referenced `handleExport` and `heroLabel` that only
// existed inside Reports' scope (sibling top-level functions in the old
// DetailScreens.jsx megafile). Opening any credit-card detail screen on
// mobile threw `ReferenceError: handleExport is not defined`.
//
// CAR-199 surfaced the bug by splitting DetailScreens.jsx into per-screen
// modules and deliberately preserved the broken behavior to keep that PR
// purely structural. This test locks the fix: rendering CCDetail with a
// realistic store must not throw.
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CCDetail from './CCDetail';
import { StoreCtx } from '../../store';

afterEach(() => {
  cleanup();
});

const SAMPLE_CC = {
  id: 'cc1',
  name: 'AMEX PLATINUM',
  type: 'CC',
  balance: -1234.56,
  creditLimit: 10000,
  apr: 22.99,
  statementDay: 15,
};

const SAMPLE_TXNS = [
  { id: 't1', acct: 'cc1', date: '2026-05-01', amount: -50, label: 'COFFEE' },
  { id: 't2', acct: 'cc1', date: '2026-05-02', amount: -120, label: 'GROCERIES' },
];

const THEME = { currency: 'USD', decimals: 2, accent: '#0f0' };

function renderWithStore(ui, { transactions = SAMPLE_TXNS, accounts = [SAMPLE_CC] } = {}) {
  const value = {
    transactions,
    accountsWithBalance: accounts,
  };
  return render(
    <StoreCtx.Provider value={value}>{ui}</StoreCtx.Provider>
  );
}

describe('CCDetail — CAR-206 crash regression', () => {
  it('renders without throwing when opened on a credit-card account', () => {
    // The pre-fix bug threw `ReferenceError: handleExport is not defined`
    // synchronously during render. The render call below would re-throw
    // the React error so an explicit assertion is enough.
    expect(() =>
      renderWithStore(<CCDetail t={THEME} acct="cc1" onBack={() => {}} />)
    ).not.toThrow();
    // Sanity check that the component actually rendered card content.
    expect(screen.getByText('AMEX PLATINUM')).toBeTruthy();
  });

  it('renders without throwing when no acct id is provided (falls back to first CC)', () => {
    // Defensive: the bug also reproduced if the user navigated without a
    // pre-selected acct, since CCDetail picks `ccAccounts[0]` and still
    // tries to render the EXPORT button.
    expect(() =>
      renderWithStore(<CCDetail t={THEME} acct={null} onBack={() => {}} />)
    ).not.toThrow();
  });
});
