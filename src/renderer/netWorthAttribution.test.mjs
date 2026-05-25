import { describe, expect, test } from 'vitest';

import { attributeNetWorthChange, buildNetWorthAttributionFilter } from './netWorthAttribution.mjs';

const RATES = { USD: 1, EUR: 2 };

const empty = { contributions: 0, marketGains: 0, spending: 0, income: 0, transfers: 0 };

describe('attributeNetWorthChange', () => {
  test('returns zeroes for an empty period', () => {
    expect(attributeNetWorthChange([], [], '2026-05-01', '2026-05-31')).toEqual(empty);
  });

  test('separates income, spending, and transfers in a single currency period', () => {
    const accounts = [
      { id: 'chk', type: 'CHK', ccy: 'USD', openingBal: 1000, balance: 1800 },
      { id: 'sav', type: 'SAV', ccy: 'USD', openingBal: 500, balance: 500 },
    ];

    const transactions = [
      { id: 'inc', date: '2026-05-10', acct: 'chk', cat: 'income', amt: 1000, ccy: 'USD' },
      { id: 'exp', date: '2026-05-11', acct: 'chk', cat: 'food', amt: -200, ccy: 'USD' },
      { id: 'xfer-out', date: '2026-05-12', acct: 'chk', cat: 'transfer', amt: -100, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-in' },
      { id: 'xfer-in', date: '2026-05-12', acct: 'sav', cat: 'transfer', amt: 100, ccy: 'USD', transferId: 'xfer-1', transferPeer: 'xfer-out' },
    ];

    expect(attributeNetWorthChange(accounts, transactions, '2026-05-01', '2026-05-31')).toEqual({
      contributions: 0,
      marketGains: 0,
      spending: -200,
      income: 1000,
      transfers: 0,
    });
  });

  test('converts multi-currency amounts with FX before bucketing', () => {
    const accounts = [
      { id: 'chk', type: 'CHK', ccy: 'USD', openingBal: 100, balance: 100 },
      { id: 'eur', type: 'SAV', ccy: 'EUR', openingBal: 50, balance: 50 },
    ];

    const transactions = [
      { id: 'inc-usd', date: '2026-05-03', acct: 'chk', cat: 'income', amt: 100, ccy: 'USD' },
      { id: 'exp-eur', date: '2026-05-04', acct: 'eur', cat: 'food', amt: -25, ccy: 'EUR' },
    ];

    expect(attributeNetWorthChange(accounts, transactions, '2026-05-01', '2026-05-31', RATES)).toEqual({
      contributions: 0,
      marketGains: 0,
      spending: -12.5,
      income: 100,
      transfers: 0,
    });
  });

  test('sees investment balance changes as market gains when no contributions exist', () => {
    const accounts = [
      { id: 'vti', type: 'INV', ccy: 'EUR', openingBal: 100, balance: 110 },
      { id: 'chk', type: 'CHK', ccy: 'USD', openingBal: 100, balance: 100 },
    ];

    expect(attributeNetWorthChange(accounts, [], '2026-05-01', '2026-05-31', RATES)).toEqual({
      contributions: 0,
      marketGains: 5,
      spending: 0,
      income: 0,
      transfers: 0,
    });
  });

  test('treats cash-to-investment transfers as contributions and nets transfers to zero', () => {
    const accounts = [
      { id: 'chk', type: 'CHK', ccy: 'USD', openingBal: 1000, balance: 700 },
      { id: 'vti', type: 'INV', ccy: 'USD', openingBal: 2000, balance: 2300 },
    ];

    const transactions = [
      { id: 'xfer-out', date: '2026-05-18', acct: 'chk', cat: 'transfer', amt: -300, ccy: 'USD', transferId: 'xfer-2', transferPeer: 'xfer-in' },
      { id: 'xfer-in', date: '2026-05-18', acct: 'vti', cat: 'transfer', amt: 300, ccy: 'USD', transferId: 'xfer-2', transferPeer: 'xfer-out' },
    ];

    expect(attributeNetWorthChange(accounts, transactions, '2026-05-01', '2026-05-31')).toEqual({
      contributions: 300,
      marketGains: 0,
      spending: 0,
      income: 0,
      transfers: -300,
    });
  });

  test('does not count investment-to-investment rebalance transfers as contributions', () => {
    const accounts = [
      { id: 'vti', type: 'INV', ccy: 'USD', openingBal: 2000, balance: 2000 },
      { id: '401k', type: 'INV', ccy: 'USD', openingBal: 1500, balance: 1500 },
    ];

    const transactions = [
      { id: 'move-out', date: '2026-05-20', acct: 'vti', cat: 'transfer', amt: -100, ccy: 'USD', transferId: 'xfer-3', transferPeer: 'move-in' },
      { id: 'move-in', date: '2026-05-20', acct: '401k', cat: 'transfer', amt: 100, ccy: 'USD', transferId: 'xfer-3', transferPeer: 'move-out' },
    ];

    expect(attributeNetWorthChange(accounts, transactions, '2026-05-01', '2026-05-31')).toEqual({
      contributions: 0,
      marketGains: 0,
      spending: 0,
      income: 0,
      transfers: 0,
    });
  });

  test('mixed period sums back to the net-worth delta', () => {
    const accounts = [
      { id: 'chk', type: 'CHK', ccy: 'USD', openingBal: 1000, balance: 1500 },
      { id: 'vti', type: 'INV', ccy: 'USD', openingBal: 2000, balance: 2350 },
    ];

    const transactions = [
      { id: 'inc', date: '2026-05-05', acct: 'chk', cat: 'income', amt: 1000, ccy: 'USD' },
      { id: 'exp', date: '2026-05-06', acct: 'chk', cat: 'food', amt: -200, ccy: 'USD' },
      { id: 'xfer-out', date: '2026-05-07', acct: 'chk', cat: 'transfer', amt: -300, ccy: 'USD', transferId: 'xfer-4', transferPeer: 'xfer-in' },
      { id: 'xfer-in', date: '2026-05-07', acct: 'vti', cat: 'transfer', amt: 300, ccy: 'USD', transferId: 'xfer-4', transferPeer: 'xfer-out' },
    ];

    const buckets = attributeNetWorthChange(accounts, transactions, '2026-05-01', '2026-05-31');
    expect(buckets).toEqual({
      contributions: 300,
      marketGains: 50,
      spending: -200,
      income: 1000,
      transfers: -300,
    });
    expect(Object.values(buckets).reduce((sum, value) => sum + value, 0)).toBe(850);
  });
});

describe('buildNetWorthAttributionFilter', () => {
  test('routes each bucket to the relevant transaction filter', () => {
    expect(buildNetWorthAttributionFilter('contributions')).toEqual({ type: 'transfer', accountType: ['INV', 'CRY'] });
    expect(buildNetWorthAttributionFilter('marketGains')).toEqual({ accountType: ['INV', 'CRY'] });
    expect(buildNetWorthAttributionFilter('spending')).toEqual({ type: 'expense' });
    expect(buildNetWorthAttributionFilter('income')).toEqual({ type: 'income' });
    expect(buildNetWorthAttributionFilter('transfers')).toEqual({ type: 'transfer' });
  });
});
