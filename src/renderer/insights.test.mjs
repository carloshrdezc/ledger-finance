import { expect, test } from 'vitest';

import {
  buildInsightRows,
  detectCategorySpikes,
  detectInactiveSubscriptions,
  detectIncomeChanges,
  detectNewMerchants,
  detectStreaks,
} from './insights.mjs';

const TODAY = '2026-05-24';

function isoDaysFromToday(days) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rollingWeeksTxs({ cat, weeklyAmounts, ccy = 'USD', namePrefix = cat.toUpperCase() }) {
  const txs = [];
  const currentWeekStartOffset = -13;
  weeklyAmounts.forEach((amount, weekIndex) => {
    const weekStart = currentWeekStartOffset - ((weeklyAmounts.length - 1 - weekIndex) * 7);
    txs.push({
      id: `${cat}-${weekIndex}`,
      name: `${namePrefix} ${weekIndex + 1}`,
      date: isoDaysFromToday(weekStart),
      cat,
      path: [cat],
      amt: -amount,
      ccy,
    });
  });
  return txs;
}

test('detectCategorySpikes flags categories that exceed twice the trailing 6-month weekly mean', () => {
  const txs = [
    ...rollingWeeksTxs({ cat: 'food', weeklyAmounts: Array(26).fill(100) }),
    {
      id: 'food-current',
      name: 'GROCERY MART',
      date: isoDaysFromToday(0),
      cat: 'food',
      path: ['food'],
      amt: -250,
      ccy: 'USD',
    },
  ];

  const rows = detectCategorySpikes(txs, TODAY);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 'insight:spike:food:2026-W21',
    kind: 'insight',
    type: 'spike',
    severity: 'medium',
    title: 'FOOD SPEND SPIKE',
    route: 'transactions',
    routeParams: { cat: 'food', period: 'this-week' },
  });
  expect(rows[0].metric).toBe('150%');
});

// CAR-362: goal-funding contributions are money set aside (cat:'savings',
// negative amt, carry goalId). They must NOT be treated as income, nor as
// discretionary spending — so they shouldn't trigger income-change, category
// spike, or new-merchant insights.
test('goal-funding (savings) txns are excluded from income and spending insights', () => {
  // A large weekly goal contribution that, if mistaken for spending, would
  // spike a "savings" category, and if mistaken for income would move income.
  const goalTxs = [
    ...rollingWeeksTxs({ cat: 'food', weeklyAmounts: Array(26).fill(100) }),
    {
      id: 'goal-current',
      name: 'GOAL · EMERGENCY',
      date: isoDaysFromToday(0),
      cat: 'savings',
      path: ['savings'],
      amt: -500,
      ccy: 'USD',
      goalId: 'g1',
    },
  ];

  // Not flagged as a spending spike (no 'savings' category insight).
  const spikes = detectCategorySpikes(goalTxs, TODAY);
  expect(spikes.some(r => r.title.includes('SAVINGS'))).toBe(false);

  // Not flagged as a new merchant.
  const merchants = detectNewMerchants(goalTxs, TODAY);
  expect(merchants.some(r => r.detail.includes('GOAL'))).toBe(false);

  // Not counted as income — income-change detector sees no income at all here.
  expect(detectIncomeChanges(goalTxs, TODAY)).toEqual([]);
});

test('detectCategorySpikes escalates to high when current spend is above 3x the mean', () => {
  const txs = [
    ...rollingWeeksTxs({ cat: 'dining', weeklyAmounts: Array(26).fill(50) }),
    {
      id: 'dining-current',
      name: 'DINNER CLUB',
      date: isoDaysFromToday(0),
      cat: 'dining',
      path: ['dining'],
      amt: -180,
      ccy: 'USD',
    },
  ];

  expect(detectCategorySpikes(txs, TODAY)[0].severity).toBe('high');
});

test('detectNewMerchants returns only merchants never seen in the prior 6 months and caps at five', () => {
  const txs = [];
  txs.push(
    ...Array.from({ length: 26 }, (_, i) => ({
      id: `old-${i}`,
      name: 'OLD MERCHANT',
      date: isoDaysFromToday(-13 - (i * 7)),
      cat: 'food',
      path: ['food'],
      amt: -80,
      ccy: 'USD',
    })),
    ...[1, 2, 3, 4, 5, 6].map(n => ({
      id: `new-${n}`,
      name: `NEW MERCHANT ${n}`,
      date: isoDaysFromToday(-n % 3),
      cat: 'food',
      path: ['food'],
      amt: -n * 10,
      ccy: 'USD',
    })),
  );
  txs.push({
    id: 'new-repeat',
    name: 'NEW MERCHANT 1',
    date: isoDaysFromToday(-1),
    cat: 'food',
    path: ['food'],
    amt: -5,
    ccy: 'USD',
  });

  const rows = detectNewMerchants(txs, TODAY);

  expect(rows).toHaveLength(5);
  expect(rows.map(row => row.routeParams.merchant)).toEqual([
    'NEW MERCHANT 6',
    'NEW MERCHANT 5',
    'NEW MERCHANT 4',
    'NEW MERCHANT 3',
    'NEW MERCHANT 2',
  ]);
  expect(rows[0]).toMatchObject({
    kind: 'insight',
    type: 'new-merchant',
    severity: 'low',
    route: 'transactions',
  });
});

test('detectInactiveSubscriptions flags active rules without a matching transaction in the last 60 days', () => {
  const rows = detectInactiveSubscriptions(
    [
      { id: 'r1', active: true, name: 'NETFLIX' },
      { id: 'r2', active: true, merchant: 'SPOTIFY' },
      { id: 'r3', active: false, name: 'HULU' },
    ],
    [
      { id: 't-old', name: 'NETFLIX.COM', date: '2026-03-01', cat: 'entertainment', path: ['entertainment'], amt: -15, ccy: 'USD' },
      { id: 't-recent', name: 'Spotify', date: '2026-05-10', cat: 'music', path: ['music'], amt: -12, ccy: 'USD' },
    ],
    TODAY,
  );

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 'insight:inactive-sub:r1',
    type: 'inactive-sub',
    severity: 'medium',
    route: 'recurring',
    routeParams: { ruleId: 'r1' },
  });
});

test('detectIncomeChanges surfaces both positive and negative week-over-week income changes', () => {
  const txs = [
    ...rollingWeeksTxs({ cat: 'income', weeklyAmounts: [1000, 1000, 1000, 1000], namePrefix: 'PAYROLL' }).map(tx => ({ ...tx, amt: Math.abs(tx.amt), type: 'income' })),
    {
      id: 'income-current',
      name: 'PAYROLL',
      date: TODAY,
      cat: 'income',
      path: ['income'],
      amt: 1500,
      type: 'income',
      ccy: 'USD',
    },
  ];
  const positive = detectIncomeChanges(txs, TODAY);
  expect(positive).toHaveLength(1);
  expect(positive[0]).toMatchObject({
    type: 'income-change',
    severity: 'low',
    route: 'income',
    routeParams: { period: 'this-week' },
  });
  expect(positive[0].metric).toBe('50%');

  const downTxs = [
    ...rollingWeeksTxs({ cat: 'income', weeklyAmounts: [1200, 1200, 1200, 1200], namePrefix: 'PAYROLL' }).map(tx => ({ ...tx, amt: Math.abs(tx.amt), type: 'income' })),
    {
      id: 'income-current-down',
      name: 'PAYROLL',
      date: TODAY,
      cat: 'income',
      path: ['income'],
      amt: 700,
      type: 'income',
      ccy: 'USD',
    },
  ];
  expect(detectIncomeChanges(downTxs, TODAY)[0].severity).toBe('medium');
});

test('detectIncomeChanges skips the obvious no-income cycle when the prior four weeks are also empty', () => {
  const txs = [
    {
      id: 'expense-only',
      name: 'GROCERY MART',
      date: TODAY,
      cat: 'food',
      path: ['food'],
      amt: -42,
      ccy: 'USD',
    },
  ];

  expect(detectIncomeChanges(txs, TODAY)).toEqual([]);
});

test('detectStreaks surfaces categories that stayed under budget for three consecutive weeks', () => {
  const budgetRows = [
    { cat: 'food', limit: 100, label: 'FOOD' },
    { cat: 'dining', limit: 50, label: 'DINING' },
  ];
  const txs = [
    ...rollingWeeksTxs({ cat: 'food', weeklyAmounts: [40, 45, 35] }),
    ...rollingWeeksTxs({ cat: 'dining', weeklyAmounts: [60, 40, 45] }),
    { id: 'dining-current', name: 'DINNER CLUB', date: TODAY, cat: 'dining', path: ['dining'], amt: -60, ccy: 'USD' },
  ];

  const rows = detectStreaks(txs, TODAY, budgetRows);

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: 'insight:streak:food:2026-W21',
    type: 'streak',
    severity: 'low',
    route: 'budgets',
  });
  expect(rows[0].detail).toContain('3 STRAIGHT WEEKS');
});

test('buildInsightRows returns empty rows for empty input', () => {
  expect(buildInsightRows({}, TODAY)).toEqual([]);
});

test('buildInsightRows sorts by severity and recency, filters dismissed insights, and tolerates mixed currencies without FX conversion', () => {
  const rows = buildInsightRows(
    {
      dismissedInsightIds: ['insight:new-merchant:CAFÉ ROASTERS:2026-W21'],
      recurringRules: [
        { id: 'sub-1', active: true, name: 'NETFLIX' },
      ],
      budgetRows: [
        { cat: 'food', limit: 100, label: 'FOOD' },
      ],
      transactions: [
        ...rollingWeeksTxs({ cat: 'food', weeklyAmounts: Array(26).fill(60) }),
        { id: 'grocery-history', name: 'GROCERY MART', date: isoDaysFromToday(-13), cat: 'food', path: ['food'], amt: -80, ccy: 'USD' },
        {
          id: 'food-current-usd',
          name: 'GROCERY MART',
          date: TODAY,
          cat: 'food',
          path: ['food'],
          amt: -150,
          ccy: 'USD',
        },
        {
          id: 'food-current-eur',
          name: 'GROCERY MART',
          date: TODAY,
          cat: 'food',
          path: ['food'],
          amt: -50,
          ccy: 'EUR',
        },
        {
          id: 'new-merchant',
          name: 'CAFÉ ROASTERS',
          date: TODAY,
          cat: 'food',
          path: ['food'],
          amt: -20,
          ccy: 'EUR',
        },
        ...rollingWeeksTxs({ cat: 'income', weeklyAmounts: [1000, 1000, 1000, 1000], namePrefix: 'PAYROLL' }).map(tx => ({ ...tx, amt: Math.abs(tx.amt), type: 'income' })),
        {
          id: 'income-current',
          name: 'PAYROLL',
          date: TODAY,
          cat: 'income',
          path: ['income'],
          amt: 700,
          type: 'income',
          ccy: 'EUR',
        },
      ],
    },
    TODAY,
  );

  expect(rows.map(row => row.type)).toEqual(['spike', 'income-change', 'inactive-sub']);
  expect(rows[0].severity).toBe('high');
  expect(rows[1].severity).toBe('medium');
  expect(rows[2].severity).toBe('medium');
  expect(rows.some(row => row.id.includes('CAFÉ ROASTERS'))).toBe(false);
});
