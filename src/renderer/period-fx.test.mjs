import { test, expect } from 'vitest';

import {
  buildIncomeExpenseSeries,
  buildCategoryTrend,
  buildNetWorthTrend,
} from './charts.mjs';

// Canonical 2-rate history: EUR is 1.0 in Feb (1 EUR = 1 USD) and 5.0 in May
// (1 USD = 5 EUR). A €100 tx in Feb must convert at the Feb rate (100 USD), and
// a €50 tx in May must convert at the May rate (10 USD). The two-rate gap is
// what locks "tx-date-rate selection actually fires" — a single-rate history
// would let a regression that ignores the date arg pass silently.
const ratesTwoStep = {
  USD: [{ rate: 1.0, effectiveFrom: '1900-01-01', source: 'seed' }],
  EUR: [
    { rate: 1.0, effectiveFrom: '2026-02-01', source: 'manual' },
    { rate: 5.0, effectiveFrom: '2026-05-01', source: 'manual' },
  ],
};

test('buildIncomeExpenseSeries: Feb tx keeps Feb rate after May rate edit', () => {
  // Two-rate history (1.0 in Feb, 5.0 in May). If the tx.date arg were ever
  // dropped, BOTH rows would use the latest rate (5.0) → feb.income would
  // collapse from 100 to 20. This is the regression-locking canary.
  const transactions = [
    { date: '2026-02-15', amt: 100, ccy: 'EUR' },
    { date: '2026-05-15', amt: 50, ccy: 'EUR' },
  ];

  const [feb, may] = buildIncomeExpenseSeries(transactions, ['2026-02', '2026-05'], ratesTwoStep);

  expect(feb.income).toBeCloseTo(100, 5);  // Feb rate 1.0 → €100 = $100
  expect(may.income).toBeCloseTo(10, 5);   // May rate 5.0 → €50  = $10
  expect(feb.net).toBeCloseTo(100, 5);
  expect(may.net).toBeCloseTo(10, 5);
});

test('buildCategoryTrend: per-period expenses use tx-date rate, not latest', () => {
  // Same regression class for the category breakdown surface.
  const transactions = [
    { date: '2026-02-15', amt: -100, ccy: 'EUR', cat: 'food', path: ['food'] },
    { date: '2026-05-15', amt: -50, ccy: 'EUR', cat: 'food', path: ['food'] },
  ];

  const result = buildCategoryTrend(transactions, ['2026-02', '2026-05'], 6, ratesTwoStep);

  expect(result).toHaveLength(1);
  const food = result[0];
  expect(food.cat).toBe('food');
  expect(food.values[0]).toBeCloseTo(100, 5);  // Feb spend at Feb rate
  expect(food.values[1]).toBeCloseTo(10, 5);   // May spend at May rate
});

test('buildNetWorthTrend: per-tx historical rates AND date-free opening balance', () => {
  // Locks the per-tx-vs-balance contract. Opening balance MUST stay at current
  // valuation (date-free), while tx deltas MUST use tx-date rate.
  //
  // EUR account opens at €0. Feb tx: +€100. May tx: +€50.
  //  - Feb-end:  opening 0 + Feb-tx €100 @ 1.0 = $100
  //  - May-end:  opening 0 + Feb-tx €100 @ 1.0 + May-tx €50 @ 5.0 = $110
  //
  // If a future cleanup threads a date into the opening reduce, it will use
  // the period's rate and the assertion below will break. If a future cleanup
  // drops the date from the tx delta reduce, may-end will collapse to 30 USD
  // (both txs at 5.0). Either regression is caught here.
  const accounts = [{ id: 'a1', ccy: 'EUR', openingBal: 0 }];
  const transactions = [
    { date: '2026-02-15', amt: 100, ccy: 'EUR', acct: 'a1' },
    { date: '2026-05-15', amt: 50, ccy: 'EUR', acct: 'a1' },
  ];

  const trend = buildNetWorthTrend(accounts, transactions, ['2026-02', '2026-05'], ratesTwoStep);

  expect(trend[0].value).toBeCloseTo(100, 5);
  expect(trend[1].value).toBeCloseTo(110, 5);
});

test('buildNetWorthTrend: opening balance uses CURRENT valuation, not period rate', () => {
  // Documentation-as-test for the opening-bal-stays-date-free contract.
  // EUR account opens at €100, no transactions.
  // Whether you ask for Feb-end or May-end, opening should ALWAYS be at the
  // latest rate (5.0): €100 / 5.0 = $20. If a future "cleanup" threads a date
  // into the opening reduce, Feb-end would be $100 (Feb rate) and break this.
  const accounts = [{ id: 'a1', ccy: 'EUR', openingBal: 100 }];
  const transactions = [];

  const trend = buildNetWorthTrend(accounts, transactions, ['2026-02', '2026-05'], ratesTwoStep);

  expect(trend[0].value).toBeCloseTo(20, 5);  // Latest rate (5.0), NOT Feb rate
  expect(trend[1].value).toBeCloseTo(20, 5);  // Same — opening is current valuation
});
