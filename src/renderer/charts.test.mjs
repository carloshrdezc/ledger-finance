import { test, expect } from 'vitest';

import {
  buildCategoryTrend,
  buildIncomeExpenseSeries,
  buildNetWorthDailyTrend,
  buildNetWorthTrend,
  buildSankeyFlows,
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

// Preserves the pre-CAR-75 hardcoded EUR_TO_USD = 1.08 behaviour. Rates
// are stored as "1 USD = N units of X" so 1 EUR = 1.08 USD means
// rates.EUR = 1 / 1.08. Used by the three trend-builder tests below.
const RATES = { USD: 1, EUR: 1 / 1.08 };

test('buildCategoryTrend totals spending by category across periods', () => {
  expect(buildCategoryTrend(transactions, ['2026-04', '2026-05'], 6, RATES)).toEqual([
      { cat: 'food', values: [120, 160.8], total: 280.8 },
      { cat: 'dining', values: [0, 50], total: 50 },
    ]);
});

test('buildIncomeExpenseSeries separates income and expenses by month', () => {
  expect(buildIncomeExpenseSeries(transactions, ['2026-04', '2026-05'], RATES)).toEqual([
    { period: '2026-04', income: 1000, expense: 120, net: 880 },
    { period: '2026-05', income: 2000, expense: 210.8, net: 1789.2 },
  ]);
});

// CAR-362: goal-funding txns (cat:'savings', negative amt, carry goalId) are
// money set aside — neither income nor consumption. They must be excluded from
// BOTH the income and expense totals (and from the spending category trend).
test('buildIncomeExpenseSeries excludes goal-funding (savings) txns from both income and expense', () => {
  const withGoalFunding = [
    { date: '2026-05-01', cat: 'income', path: ['income'], amt: 2000, acct: 'chk', ccy: 'USD' },
    { date: '2026-05-02', cat: 'food', path: ['food'], amt: -150, acct: 'amex', ccy: 'USD' },
    // goal contribution: negative amount, savings category, goalId present
    { date: '2026-05-10', cat: 'savings', path: ['savings'], amt: -300, acct: 'chk', ccy: 'USD', goalId: 'g1', name: 'GOAL · EMERGENCY' },
  ];
  const series = buildIncomeExpenseSeries(withGoalFunding, ['2026-05'], RATES);
  // Income unchanged (2000), expense is ONLY the $150 food — the $300 goal
  // contribution is counted in neither total.
  expect(series).toEqual([{ period: '2026-05', income: 2000, expense: 150, net: 1850 }]);
});

test('buildCategoryTrend excludes goal-funding (savings) txns from spending categories', () => {
  const withGoalFunding = [
    { date: '2026-05-02', cat: 'food', path: ['food'], amt: -150, acct: 'amex', ccy: 'USD' },
    { date: '2026-05-10', cat: 'savings', path: ['savings'], amt: -300, acct: 'chk', ccy: 'USD', goalId: 'g1' },
  ];
  const trend = buildCategoryTrend(withGoalFunding, ['2026-05'], 6, RATES);
  expect(trend).toEqual([{ cat: 'food', values: [150], total: 150 }]);
  expect(trend.some(row => row.cat === 'savings')).toBe(false);
});

test('buildNetWorthTrend accumulates transactions from opening balances', () => {
  const accounts = [
    { id: 'chk', openingBal: 100, ccy: 'USD' },
    { id: 'amex', openingBal: 0, ccy: 'USD' },
    { id: 'csp', openingBal: 0, ccy: 'USD' },
    { id: 'eur', openingBal: 10, ccy: 'EUR' },
  ];

  expect(buildNetWorthTrend(accounts, transactions, ['2026-04', '2026-05'], RATES)).toEqual([
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

  expect(buildNetWorthDailyTrend(accounts, txs, '2026-05-15', 3)).toEqual([
    { date: '2026-05-13', value: 150 },
    { date: '2026-05-14', value: 130 },
    { date: '2026-05-15', value: 130 },
  ]);
});

test('svgLinePath converts points into a bounded SVG path', () => {
  expect(svgLinePath([10, 20, 15], 100, 50)).toBe('M0.0 50.0 L50.0 0.0 L100.0 25.0');
});

test('svgLinePath renders a visible single-point range', () => {
  expect(svgLinePath([10], 100, 50)).toBe('M0.0 25.0 L100.0 25.0');
});

test('buildSankeyFlows splits income into a hub and out to categories + savings', () => {
  const { nodes, links, totalIn, totalOut } = buildSankeyFlows(transactions, ['2026-04', '2026-05'], RATES);

  expect(totalIn).toBe(3000);          // 1000 + 2000 income
  expect(totalOut).toBe(330.8);        // food 280.8 + dining 50

  // income flows into the hub
  expect(links).toContainEqual({ source: 'in:income', target: '__hub__', value: 3000 });
  // hub flows out to each spending category
  expect(links).toContainEqual({ source: '__hub__', target: 'out:food', value: 280.8 });
  expect(links).toContainEqual({ source: '__hub__', target: 'out:dining', value: 50 });
  // surplus (3000 - 330.8) becomes a savings outflow
  expect(links).toContainEqual({ source: '__hub__', target: '__savings__', value: 2669.2 });

  // nodes carry side + value; hub sizes to the larger of in/out
  expect(nodes.find(n => n.id === '__hub__')).toEqual({ id: '__hub__', label: 'budget', side: 'hub', value: 3000 });
  expect(nodes.find(n => n.id === 'in:income')).toEqual({ id: 'in:income', label: 'income', side: 'in', value: 3000 });
});

test('buildSankeyFlows ignores periods outside the selected window', () => {
  const { totalIn, totalOut } = buildSankeyFlows(transactions, ['2026-04'], RATES);
  expect(totalIn).toBe(1000);
  expect(totalOut).toBe(120);
});

test('buildSankeyFlows collapses long category tails into __other__', () => {
  const txs = Array.from({ length: 12 }, (_, i) => ({
    date: '2026-05-10', cat: `c${i}`, path: [`c${i}`], amt: -(i + 1), acct: 'a', ccy: 'USD',
  }));
  const { nodes } = buildSankeyFlows(txs, ['2026-05'], RATES, 'USD', 8);
  const outNodes = nodes.filter(n => n.side === 'out');
  expect(outNodes).toHaveLength(8);                       // limit respected
  expect(outNodes.some(n => n.id === 'out:__other__')).toBe(true);
});

test('buildSankeyFlows omits savings flow when spending exceeds income', () => {
  const txs = [
    { date: '2026-05-01', cat: 'income', path: ['income'], amt: 100, acct: 'a', ccy: 'USD' },
    { date: '2026-05-02', cat: 'food', path: ['food'], amt: -150, acct: 'a', ccy: 'USD' },
  ];
  const { links } = buildSankeyFlows(txs, ['2026-05'], RATES);
  expect(links.some(l => l.target === '__savings__')).toBe(false);
});

test('buildSankeyFlows excludes internal transfers from cash flow', () => {
  // Transfer legs have cat:'transfer' and path:[]. Without filtering, the +leg
  // would mislabel as income and the -leg as 'other' spending — double-counting
  // a single internal movement (CAR-350 review M1).
  const txs = [
    { date: '2026-05-01', cat: 'income', path: ['income'], amt: 1000, acct: 'chk', ccy: 'USD' },
    { date: '2026-05-02', cat: 'food', path: ['food'], amt: -200, acct: 'chk', ccy: 'USD' },
    { date: '2026-05-03', cat: 'transfer', path: [], amt: -5000, acct: 'chk', ccy: 'USD', transferId: 't1' },
    { date: '2026-05-03', cat: 'transfer', path: [], amt: 5000, acct: 'sav', ccy: 'USD', transferId: 't1' },
  ];
  const { nodes, links, totalIn, totalOut } = buildSankeyFlows(txs, ['2026-05'], RATES);
  expect(totalIn).toBe(1000);
  expect(totalOut).toBe(200);
  expect(nodes.some(n => n.label === 'income' && n.value === 6000)).toBe(false);
  expect(links.some(l => l.value === 5000)).toBe(false);
});
