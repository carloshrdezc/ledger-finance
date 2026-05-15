import test from 'node:test';
import assert from 'node:assert/strict';

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
  assert.equal(getBillDueDate({ day: 31 }, '2026-02'), '2026-02-28');
  assert.equal(getBillDueDate({ day: 6 }, '2026-05'), '2026-05-06');
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

  assert.equal(comcast.status, 'paid');
  assert.equal(comcast.paidTxId, 'tx_paid');
  assert.equal(rent.status, 'overdue');
  assert.equal(rent.dueDate, '2026-05-01');
});

test('createBillPaymentTransaction creates an expense on the due date', () => {
  assert.deepEqual(createBillPaymentTransaction(bill, '2026-05'), {
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

  assert.equal(result.goal.current, 175);
  assert.equal(result.contribution.amount, 75);
  assert.equal(result.contribution.txId, result.transaction.id);
  assert.equal(result.transaction.amt, -75);
  assert.equal(result.transaction.goalId, 'g1');
});
