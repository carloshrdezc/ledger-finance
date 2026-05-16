import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAlertRows } from './alerts.mjs';

test('buildAlertRows ranks overdue bills and overspent budgets first', () => {
  const alerts = buildAlertRows({
    billRows: [
      { key: 'rent|2026-05-01', name: 'RENT', amt: 2400, status: 'overdue', dueDate: '2026-05-01', type: 'expense' },
      { key: 'payroll|2026-05-16', name: 'PAYROLL', amt: 3800, status: 'upcoming', dueDate: '2026-05-16', type: 'income' },
    ],
    budgetRows: [
      { cat: 'food', label: 'GROCERIES', spent: 360, available: 300, left: -60 },
      { cat: 'subs', label: 'SUBSCRIPTIONS', spent: 92, available: 100, left: 8 },
    ],
    goals: [],
    accountsWithBalance: [],
    investments: [],
  }, '2026-05-15');

  assert.deepEqual(alerts.map(a => a.id), [
    'bill:rent|2026-05-01',
    'budget:food:over',
    'budget:subs:near',
  ]);
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[0].kind, 'bill');
  assert.equal(alerts[1].metric, '120%');
});

test('buildAlertRows supports due bills, low cash, goal gaps, investment drops, and dismissals', () => {
  const alerts = buildAlertRows({
    billRows: [
      { key: 'electric|2026-05-15', name: 'ELECTRIC', amt: 112, status: 'due', dueDate: '2026-05-15', type: 'expense' },
    ],
    budgetRows: [],
    goals: [
      { id: 'g1', name: 'EMERGENCY', target: 1000, current: 200 },
    ],
    accountsWithBalance: [
      { id: 'chk', name: 'CHECKING', type: 'CHK', balance: -25, ccy: 'USD' },
      { id: 'amex', name: 'AMEX', type: 'CC', balance: -80, ccy: 'USD' },
    ],
    investments: [
      { ticker: 'VTI', name: 'VANGUARD TOTAL MKT', chg: -3.2, shares: 4, price: 100 },
    ],
    dismissedAlertIds: ['goal:g1:behind'],
  }, '2026-05-15');

  assert.deepEqual(alerts.map(a => a.id), [
    'account:chk:negative',
    'bill:electric|2026-05-15',
    'investment:VTI:drop',
  ]);
  assert.equal(alerts.find(a => a.id === 'bill:electric|2026-05-15').severity, 'high');
  assert.equal(alerts.some(a => a.id === 'goal:g1:behind'), false);
});
