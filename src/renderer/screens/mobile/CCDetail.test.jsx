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

// Mirror production TRANSACTIONS shape from src/renderer/data.js: name, amt,
// ccy, path. The component reads tx.name / tx.amt / tx.ccy / tx.path —
// previously the fixture used label/amount, which silently rendered
// `undefined` and `−$NaN` while the no-throw assertion still passed.
const SAMPLE_TXNS = [
  { id: 't1', acct: 'cc1', date: '2026-05-01', name: 'WHOLE FOODS MKT',    amt:  -50, ccy: 'USD', path: ['food', 'produce'] },
  { id: 't2', acct: 'cc1', date: '2026-05-02', name: 'BLUE BOTTLE COFFEE', amt: -120, ccy: 'USD', path: ['dining', 'cafe'] },
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

  it('falls back to first CC when acct id does not match (locks the `||` chain ordering)', () => {
    // This locks the OR-fallback in `accountsWithBalance.find(...) ||
    // ccAccounts[0] || {}`. End state of `a` is the same as test 1
    // (SAMPLE_CC), but the control-flow path differs: `find()` returns
    // undefined, then `ccAccounts[0]` wins. Pairs with the empty-accounts
    // test below, which exercises the second `||` rung.
    expect(() =>
      renderWithStore(<CCDetail t={THEME} acct={null} onBack={() => {}} />)
    ).not.toThrow();
  });

  // PR-50 review feedback (round 2): the recent-charges block at lines
  // 106-114 of CCDetail.jsx reads `tx.name`, `tx.amt`, `tx.ccy`, `tx.path` —
  // not `tx.label` / `tx.amount`. Asserting the rendered merchant name
  // forces the test fixture to mirror production data shape (see data.js
  // TRANSACTIONS), so a future commit that, e.g., adds `.toUpperCase()` on
  // `tx.name` can't slip through against an `undefined` value.
  it('renders the recent-charges block with realistic txn shape', () => {
    renderWithStore(<CCDetail t={THEME} acct="cc1" onBack={() => {}} />);
    expect(screen.getByText('WHOLE FOODS MKT')).toBeTruthy();
    expect(screen.getByText('BLUE BOTTLE COFFEE')).toBeTruthy();
  });

  // PR-50 review feedback (round 2): the test above only exercises the
  // first `||` rung (`find() || ccAccounts[0]`). The genuinely-defensive
  // case is `acct=null && no CC accounts at all` — both `||` rungs fail
  // and `a = {}`, so every read (`a.balance`, `a.creditLimit`, `a.name`)
  // is a fall-through to defaults. E.g. a fresh user with only checking
  // accounts who navigates to /cards somehow.
  it('renders without throwing when there are no CC accounts at all', () => {
    expect(() =>
      renderWithStore(<CCDetail t={THEME} acct={null} onBack={() => {}} />, {
        accounts: [],
      })
    ).not.toThrow();
  });
});
