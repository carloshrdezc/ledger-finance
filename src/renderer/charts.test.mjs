import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCategoryTrend,
  buildIncomeExpenseSeries,
  buildNetWorthDailyTrend,
  buildNetWorthTrend,
  svgLinePath,
} from './charts.mjs';

const transactions = [
  { date: '2026-04-25', cat: 'income', path: ['income'], amt: 1000, acct: 'chk', ccy: 'USD' },
  { date: '2026-04-26', cat: 'food', path: ['food'], amt: -120, acct: 'amex', ccy: 'USD' },
  { date: '2026-05-01', cat: 'income', path: ['income'], amt: 2000, acct: 'chk', ccy: 'USD' },
  { date: '2026-05-02', cat: 'food', path: ['food'], amt: -150, acct: 'amex', ccy: 'USD' },
  { date: '2026-05-03', cat: 'dining', path: ['dining'], amt: -50, acct: 'csp', ccy: 'USD' },
  { date: '2026-05-04', cat: 'food', path: ['food'], amt: -10, acct: 'eur', ccy: 'EUR' },
];

test('buildCategoryTrend totals spending by category across periods', () => {
  assert.deepEqual(
    buildCategoryTrend(transactions, ['2026-04', '2026-05']),
    [
      { cat: 'food', values: [120, 160.8], total: 280.8 },
      { cat: 'dining', values: [0, 50], total: 50 },
    ],
  );
});

test('buildIncomeExpenseSeries separates income and expenses by month', () => {
  assert.deepEqual(buildIncomeExpenseSeries(transactions, ['2026-04', '2026-05']), [
    { period: '2026-04', income: 1000, expense: 120, net: 880 },
    { period: '2026-05', income: 2000, expense: 210.8, net: 1789.2 },
  ]);
});

test('buildNetWorthTrend accumulates transactions from opening balances', () => {
  const accounts = [
    { id: 'chk', openingBal: 100, ccy: 'USD' },
    { id: 'amex', openingBal: 0, ccy: 'USD' },
    { id: 'csp', openingBal: 0, ccy: 'USD' },
    { id: 'eur', openingBal: 10, ccy: 'EUR' },
  ];

  assert.deepEqual(buildNetWorthTrend(accounts, transactions, ['2026-04', '2026-05']), [
    { period: '2026-04', value: 990.8 },
    { period: '2026-05', value: 2780 },
  ]);
});

test('buildNetWorthDailyTrend returns bounded daily values for dashboard ranges', () => {
  const accounts = [
    { id: 'chk', openingBal: 100, ccy: 'USD' },
    { id: 'amex', openingBal: 0, ccy: 'USD' },
  ];
  const txs = [
    { id: 'income', date: '2026-05-13', acct: 'chk', amt: 50, ccy: 'USD' },
    { id: 'food', date: '2026-05-14', acct: 'amex', amt: -20, ccy: 'USD' },
    { id: 'future', date: '2026-05-16', acct: 'chk', amt: 999, ccy: 'USD' },
  ];

  assert.deepEqual(buildNetWorthDailyTrend(accounts, txs, '2026-05-15', 3), [
    { date: '2026-05-13', value: 150 },
    { date: '2026-05-14', value: 130 },
    { date: '2026-05-15', value: 130 },
  ]);
});

test('svgLinePath converts points into a bounded SVG path', () => {
  assert.equal(svgLinePath([10, 20, 15], 100, 50), 'M0.0 50.0 L50.0 0.0 L100.0 25.0');
});

test('svgLinePath renders a visible single-point range', () => {
  assert.equal(svgLinePath([10], 100, 50), 'M0.0 25.0 L100.0 25.0');
});
