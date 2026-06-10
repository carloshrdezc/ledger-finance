import { test, expect, describe } from 'vitest';

import { buildBudgetRows } from './period.mjs';
import { buildCategoryTrend, buildIncomeExpenseSeries } from './charts.mjs';
import { computeSafeToSpend } from './safeToSpend.mjs';
import { toReportingCurrency } from './fx.mjs';
import { buildBackup, parseBackup } from './backup.mjs';
import { exportCSV, parseCSV } from './importExport.js';

// CAR-348: complete multi-currency story. These tests lock the contract that
// a chosen PRIMARY (reporting) currency threads consistently through the
// aggregation/reporting layer — budgets, charts, safe-to-spend — rather than
// hardcoding USD. Rates are stored "1 USD = N ccy" (fx.mjs convention).
//
// Canonical rates: 1 USD = 0.5 EUR (so 1 EUR = 2 USD). Round numbers chosen so
// the conversions are exact and a double-conversion bug (USD→EUR twice) shows
// up as a 4x / 0.25x error, not a rounding wobble.
const RATES = {
  USD: [{ rate: 1.0, effectiveFrom: '1900-01-01', source: 'seed' }],
  EUR: [{ rate: 0.5, effectiveFrom: '2026-01-01', source: 'manual' }],
};

describe('currency-aware budgets (buildBudgetRows reportingCcy)', () => {
  test('mixed EUR + USD txs, primary EUR: spent + remaining are in EUR', () => {
    // Budget limit 200 EUR (limits are interpreted in the primary currency).
    // Spend: €60 (already EUR) + $40 (USD → €20). Total spent = €80.
    // Remaining (left) = 200 − 80 = 120 EUR.
    const budgets = [{ cat: 'food', limit: 200 }];
    const txs = [
      { id: 't1', date: '2026-03-05', cat: 'food', path: ['food'], amt: -60, ccy: 'EUR' },
      { id: 't2', date: '2026-03-06', cat: 'food', path: ['food'], amt: -40, ccy: 'USD' },
    ];
    const [row] = buildBudgetRows(budgets, txs, '2026-03', RATES, 'EUR');
    expect(row.spent).toBeCloseTo(80, 5);   // €60 + ($40 → €20)
    expect(row.left).toBeCloseTo(120, 5);   // 200 − 80
    expect(row.available).toBeCloseTo(200, 5);
  });

  test('default reportingCcy is USD (backward compatible)', () => {
    // Same txs, no reportingCcy arg → USD reporting. €60 → $120, $40 → $40.
    const budgets = [{ cat: 'food', limit: 200 }];
    const txs = [
      { id: 't1', date: '2026-03-05', cat: 'food', path: ['food'], amt: -60, ccy: 'EUR' },
      { id: 't2', date: '2026-03-06', cat: 'food', path: ['food'], amt: -40, ccy: 'USD' },
    ];
    const [row] = buildBudgetRows(budgets, txs, '2026-03', RATES);
    expect(row.spent).toBeCloseTo(160, 5);  // $120 + $40
  });
});

describe('charts respect a non-USD reporting currency', () => {
  test('buildCategoryTrend with primary EUR converts USD txs into EUR', () => {
    // $100 USD spend in food, primary EUR → €50.
    const txs = [
      { date: '2026-03-05', cat: 'food', path: ['food'], amt: -100, ccy: 'USD' },
    ];
    const [food] = buildCategoryTrend(txs, ['2026-03'], 6, RATES, 'EUR');
    expect(food.cat).toBe('food');
    expect(food.values[0]).toBeCloseTo(50, 5);
  });

  test('buildIncomeExpenseSeries with primary EUR', () => {
    // +$200 income → €100; −$100 expense → €50.
    const txs = [
      { date: '2026-03-01', amt: 200, ccy: 'USD' },
      { date: '2026-03-02', amt: -100, ccy: 'USD' },
    ];
    const [row] = buildIncomeExpenseSeries(txs, ['2026-03'], RATES, 'EUR');
    expect(row.income).toBeCloseTo(100, 5);
    expect(row.expense).toBeCloseTo(50, 5);
    expect(row.net).toBeCloseTo(50, 5);
  });
});

describe('safe-to-spend converts to the primary currency', () => {
  test('non-USD primary: convert fn maps account balances into EUR', () => {
    // $1000 USD balance, primary EUR → €500. No commitments.
    const convert = (amt, ccy) => toReportingCurrency(amt, ccy, RATES, 'EUR');
    const out = computeSafeToSpend({
      accounts: [{ id: 'a', balance: 1000, ccy: 'USD' }],
      convert,
    });
    expect(out.liquidBalance).toBeCloseTo(500, 5);
    expect(out.safeToSpend).toBeCloseTo(500, 5);
  });
});

describe('no double-conversion', () => {
  test('EUR tx, primary EUR → amount unchanged (single no-op convert)', () => {
    expect(toReportingCurrency(60, 'EUR', RATES, 'EUR')).toBeCloseTo(60, 9);
  });

  test('EUR tx, primary USD → single conversion equals direct rate', () => {
    // 1 USD = 0.5 EUR ⇒ 1 EUR = 2 USD ⇒ €60 = $120 in ONE step (engine
    // pivots through USD internally, never converting twice).
    expect(toReportingCurrency(60, 'EUR', RATES, 'USD')).toBeCloseTo(120, 9);
  });

  test('buildBudgetRows EUR primary on a pure-EUR budget is a no-op (no 4x drift)', () => {
    // If a double-convert (EUR→USD→EUR) regression slipped in, €100 spend
    // would land at €25 or €400 instead of €100.
    const budgets = [{ cat: 'food', limit: 300 }];
    const txs = [{ id: 't', date: '2026-03-05', cat: 'food', path: ['food'], amt: -100, ccy: 'EUR' }];
    const [row] = buildBudgetRows(budgets, txs, '2026-03', RATES, 'EUR');
    expect(row.spent).toBeCloseTo(100, 5);
    expect(row.left).toBeCloseTo(200, 5);
  });
});

describe('per-transaction foreign amount round-trips through backup', () => {
  test('origAmt / origCcy persist through buildBackup → parseBackup', () => {
    const txs = [
      // A foreign spend: €42 charged to a USD account, stored as the
      // account-currency amt (-45.30 USD) plus the original (€42 EUR).
      { id: 'fx1', date: '2026-03-10', name: 'PARIS CAFE', amt: -45.30, ccy: 'USD', origAmt: -42, origCcy: 'EUR' },
      // A plain domestic tx with no foreign fields — must survive unchanged.
      { id: 'plain', date: '2026-03-11', name: 'GROCERY', amt: -20, ccy: 'USD' },
    ];
    const backup = buildBackup({ txs });
    const json = JSON.stringify(backup);
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    const restored = result.data.transactions;
    expect(restored).toHaveLength(2);
    const fx = restored.find(t => t.id === 'fx1');
    expect(fx.origAmt).toBe(-42);
    expect(fx.origCcy).toBe('EUR');
    expect(fx.amt).toBe(-45.30);
    expect(fx.ccy).toBe('USD');
    const plain = restored.find(t => t.id === 'plain');
    expect(plain.origAmt).toBeUndefined();
    expect(plain.origCcy).toBeUndefined();
  });

  test('a foreign tx aggregates on its account-currency amt (origAmt is display-only)', () => {
    // The budget/report math uses tx.amt + tx.ccy (account currency), NOT the
    // original foreign amount — origAmt/origCcy are for display provenance.
    // €42 spend booked to a USD account at $45.30: in a USD-primary budget the
    // spend counted is $45.30, not the €42 face value.
    const budgets = [{ cat: 'dining', limit: 500 }];
    const txs = [
      { id: 'fx1', date: '2026-03-10', cat: 'dining', path: ['dining'], amt: -45.30, ccy: 'USD', origAmt: -42, origCcy: 'EUR' },
    ];
    const [row] = buildBudgetRows(budgets, txs, '2026-03', RATES, 'USD');
    expect(row.spent).toBeCloseTo(45.30, 5);
  });

  test('origAmt / origCcy round-trip through CSV export → import', () => {
    const txs = [
      { id: 'fx1', date: '2026-03-10', name: 'PARIS CAFE', amt: -45.30, cat: 'dining', acct: 'amex', ccy: 'USD', origAmt: -42, origCcy: 'EUR' },
      { id: 'plain', date: '2026-03-11', name: 'GROCERY', amt: -20, cat: 'food', acct: 'chk', ccy: 'USD' },
    ];
    const csv = exportCSV(txs);
    const parsed = parseCSV(csv);
    expect(parsed).toHaveLength(2);
    const fx = parsed.find(t => t.name === 'PARIS CAFE');
    expect(fx.amt).toBeCloseTo(-45.30, 2);
    expect(fx.ccy).toBe('USD');
    expect(fx.origAmt).toBeCloseTo(-42, 2);
    expect(fx.origCcy).toBe('EUR');
    // The main amount/currency columns must NOT be mis-bound to the foreign ones.
    const plain = parsed.find(t => t.name === 'GROCERY');
    expect(plain.amt).toBeCloseTo(-20, 2);
    expect(plain.ccy).toBe('USD');
    expect(plain.origAmt).toBeUndefined();
    expect(plain.origCcy).toBeUndefined();
  });
});
