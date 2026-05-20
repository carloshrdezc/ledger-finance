import { test, expect } from 'vitest';

import {
  buildBillRows,
  createBillPaymentTransaction,
  createGoalContribution,
  getBillDueDate,
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
