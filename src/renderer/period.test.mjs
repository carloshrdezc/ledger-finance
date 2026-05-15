import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonths,
  buildBudgetRows,
  filterTransactionsForPeriod,
  formatPeriodLabel,
  monthKey,
} from './period.mjs';

const txs = [
  { id: 'apr-food', date: '2026-04-20', cat: 'food', path: ['food'], amt: -150, ccy: 'USD' },
  { id: 'apr-income', date: '2026-04-25', cat: 'income', path: ['income'], amt: 2000, ccy: 'USD' },
  { id: 'may-food', date: '2026-05-04', cat: 'food', path: ['food'], amt: -120, ccy: 'USD' },
  { id: 'may-dining', date: '2026-05-05', cat: 'dining', path: ['dining'], amt: -80, ccy: 'USD' },
  { id: 'may-eur', date: '2026-05-06', cat: 'food', path: ['food'], amt: -10, ccy: 'EUR' },
  { id: 'jun-food', date: '2026-06-01', cat: 'food', path: ['food'], amt: -20, ccy: 'USD' },
];

test('monthKey normalizes dates to YYYY-MM', () => {
  assert.equal(monthKey('2026-05-14'), '2026-05');
  assert.equal(monthKey(new Date('2026-04-02T12:00:00Z')), '2026-04');
});

test('addMonths moves across year boundaries', () => {
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
});

test('formatPeriodLabel renders compact month labels', () => {
  assert.equal(formatPeriodLabel('2026-05'), 'MAY 2026');
});

test('filterTransactionsForPeriod keeps only selected month transactions', () => {
  assert.deepEqual(
    filterTransactionsForPeriod(txs, '2026-05').map(tx => tx.id),
    ['may-food', 'may-dining', 'may-eur'],
  );
});

test('buildBudgetRows computes monthly spend and carries previous rollover', () => {
  const rows = buildBudgetRows(
    [
      { cat: 'food', limit: 300, spent: 999 },
      { cat: 'dining', limit: 100, spent: 999 },
    ],
    txs,
    '2026-05',
  );

  assert.deepEqual(rows.map(row => row.cat), ['food', 'dining']);
  assert.equal(rows[0].spent, 130.8);
  assert.equal(rows[0].rollover, 150);
  assert.equal(rows[0].available, 450);
  assert.equal(rows[0].left, 319.2);
  assert.equal(rows[1].spent, 80);
  assert.equal(rows[1].rollover, 100);
});
