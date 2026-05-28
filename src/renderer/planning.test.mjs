import { test, expect } from 'vitest';

import {
  billKey,
  buildBillRows,
  createBillPaymentTransaction,
  createGoalContribution,
  getBillDueDate,
  getOccurrences,
  markRecurringPaid,
  slug,
} from './planning.mjs';

const bill = {
  name: 'COMCAST XFINITY',
  amt: 89,
  day: 6,
  acct: 'chk',
  cat: 'bills',
};

test('getBillDueDate clamps days to the selected month length', () => {
  expect(getBillDueDate({ day: 31 }, '2026-02')).toBe('2026-02-28');
  expect(getBillDueDate({ day: 6 }, '2026-05')).toBe('2026-05-06');
});

test('buildBillRows marks paid, due, overdue, and upcoming bills', () => {
  const rows = buildBillRows(
    [bill, { ...bill, name: 'RENT', amt: 2400, day: 1 }],
    [
      { id: 'tx_paid', name: 'COMCAST XFINITY', amt: -89, acct: 'chk', cat: 'bills', date: '2026-05-06' },
    ],
    '2026-05',
    '2026-05-10',
  );

  const comcast = rows.find(row => row.name === 'COMCAST XFINITY');
  const rent = rows.find(row => row.name === 'RENT');

  expect(comcast.status).toBe('paid');
  expect(comcast.paidTxId).toBe('tx_paid');
  expect(rent.status).toBe('overdue');
  expect(rent.dueDate).toBe('2026-05-01');
});

test('createBillPaymentTransaction creates an expense on the due date', () => {
  expect(createBillPaymentTransaction(bill, '2026-05')).toEqual({
    id: 'bill_comcast-xfinity_2026-05-06',
    name: 'COMCAST XFINITY',
    amt: -89,
    date: '2026-05-06',
    cat: 'bills',
    path: ['bills'],
    ccy: 'USD',
    acct: 'chk',
    billKey: 'COMCAST XFINITY|6|chk',
  });
});

test('createGoalContribution returns linked contribution and transaction records', () => {
  const result = createGoalContribution(
    { id: 'g1', name: 'EMERGENCY', target: 1000, current: 100 },
    { amount: 75, date: '2026-05-14', acct: 'chk' },
  );

  expect(result.goal.current).toBe(175);
  expect(result.contribution.amount).toBe(75);
  expect(result.contribution.txId).toBe(result.transaction.id);
  expect(result.transaction.amt).toBe(-75);
  expect(result.transaction.goalId).toBe('g1');
});

test('slug lowercases and collapses non-alphanumerics into single dashes', () => {
  expect(slug('COMCAST XFINITY')).toBe('comcast-xfinity');
  expect(slug('Starbucks Coffee #42 / Café')).toBe('starbucks-coffee-42-caf');
  expect(slug('  --hello--world--  ')).toBe('hello-world');
  expect(slug('')).toBe('');
});

test('billKey is a stable dedup key derived from name, day, and account', () => {
  const a = { name: 'COMCAST XFINITY', day: 6, acct: 'chk' };
  const b = { name: 'COMCAST XFINITY', day: 6, acct: 'chk', amt: 89 }; // amt differs but key should match
  const c = { name: 'COMCAST XFINITY', day: 7, acct: 'chk' };          // different day
  const d = { name: 'COMCAST XFINITY', day: 6, acct: 'sav' };          // different account
  expect(billKey(a)).toBe('COMCAST XFINITY|6|chk');
  expect(billKey(a)).toBe(billKey(b));
  expect(billKey(a)).not.toBe(billKey(c));
  expect(billKey(a)).not.toBe(billKey(d));
});

test('getOccurrences returns one date for a monthly rule, clamped to month length', () => {
  expect(getOccurrences({ freq: 'monthly', day: 6 }, '2026-05')).toEqual(['2026-05-06']);
  // day=31 in February clamps to last day of month
  expect(getOccurrences({ freq: 'monthly', day: 31 }, '2026-02')).toEqual(['2026-02-28']);
  // missing freq defaults to monthly
  expect(getOccurrences({ day: 1 }, '2026-05')).toEqual(['2026-05-01']);
});

test('getOccurrences returns no dates for an annual rule outside its month', () => {
  // Annual rule on month 12 (December), day 25
  expect(getOccurrences({ freq: 'annual', month: 12, day: 25 }, '2026-12')).toEqual(['2026-12-25']);
  expect(getOccurrences({ freq: 'annual', month: 12, day: 25 }, '2026-05')).toEqual([]);
});

test('getOccurrences expands biweekly rules to every other week within the period', () => {
  // Anchor on a Friday, biweekly → expect Fridays every 14 days starting from anchor
  const occ = getOccurrences(
    { freq: 'biweekly', startDate: '2026-05-01' },
    '2026-05',
  );
  expect(occ).toEqual(['2026-05-01', '2026-05-15', '2026-05-29']);
});

test('markRecurringPaid creates an expense with an occurrence-scoped billKey', () => {
  const rule = {
    id: 'rule_comcast',
    name: 'COMCAST XFINITY',
    amt: 89,
    acct: 'chk',
    cat: 'bills',
    ccy: 'USD',
  };
  expect(markRecurringPaid(rule, '2026-05-06')).toEqual({
    id: 'bill_rule-comcast_2026-05-06',
    name: 'COMCAST XFINITY',
    amt: -89,
    date: '2026-05-06',
    cat: 'bills',
    path: ['bills'],
    ccy: 'USD',
    acct: 'chk',
    billKey: 'rule_comcast|2026-05-06',
  });
});

test('markRecurringPaid produces a positive amount for income-type rules', () => {
  const rule = {
    id: 'rule_paycheck',
    name: 'PAYCHECK',
    amt: 2500,
    acct: 'chk',
    type: 'income',
    cat: 'income',
    ccy: 'USD',
  };
  const tx = markRecurringPaid(rule, '2026-05-15');
  expect(tx.amt).toBe(2500);
  expect(tx.billKey).toBe('rule_paycheck|2026-05-15');
});
