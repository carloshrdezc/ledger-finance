import { test, expect } from 'vitest';

import {
  CURRENT_PERIOD_SENTINEL,
  addMonths,
  buildBudgetRows,
  filterTransactionsForPeriod,
  filterTransactionsForRange,
  formatPeriodLabel,
  formatShortPeriodLabel,
  getDaysInPeriod,
  monthKey,
  resolvePeriod,
  resolveRangePreset,
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
  expect(monthKey('2026-05-14')).toBe('2026-05');
  expect(monthKey(new Date('2026-04-02T12:00:00Z'))).toBe('2026-04');
});

test('resolvePeriod resolves the current-period sentinel to the current month', () => {
  expect(resolvePeriod(CURRENT_PERIOD_SENTINEL)).toBe(monthKey(new Date()));
});

test('resolvePeriod leaves literal periods unchanged', () => {
  expect(resolvePeriod('2026-05')).toBe('2026-05');
});

test('addMonths moves across year boundaries', () => {
  expect(addMonths('2026-01', -1)).toBe('2025-12');
  expect(addMonths('2026-12', 1)).toBe('2027-01');
});

test('formatPeriodLabel renders compact month labels', () => {
  expect(formatPeriodLabel('2026-05')).toBe('MAY 2026');
});

test('filterTransactionsForPeriod keeps only selected month transactions', () => {
  expect(filterTransactionsForPeriod(txs, '2026-05').map(tx => tx.id)).toEqual(['may-food', 'may-dining', 'may-eur']);
});

test('buildBudgetRows computes monthly spend and carries previous rollover', () => {
  // Preserves the pre-CAR-75 hardcoded EUR_TO_USD = 1.08 behaviour: rates
  // are stored as "1 USD = N units of X", so 1 EUR = 1.08 USD means
  // rates.EUR = 1 / 1.08.
  const rates = { USD: 1, EUR: 1 / 1.08 };
  const rows = buildBudgetRows(
    [
      { cat: 'food', limit: 300, spent: 999 },
      { cat: 'dining', limit: 100, spent: 999 },
    ],
    txs,
    '2026-05',
    rates,
  );

  expect(rows.map(row => row.cat)).toEqual(['food', 'dining']);
  expect(rows[0].spent).toBe(130.8);
  expect(rows[0].rollover).toBe(150);
  expect(rows[0].available).toBe(450);
  expect(rows[0].left).toBe(319.2);
  expect(rows[1].spent).toBe(80);
  expect(rows[1].rollover).toBe(100);
});

test('filterTransactionsForPeriod with startDay=1 matches existing behavior', () => {
  expect(filterTransactionsForPeriod(txs, '2026-05', 1).map(tx => tx.id)).toEqual(['may-food', 'may-dining', 'may-eur']);
});

test('filterTransactionsForPeriod with startDay=5 includes May 5 through Jun 4', () => {
  // may-food is 2026-05-04 — before start day 5, excluded
  // may-dining is 2026-05-05 — on start day, included
  // may-eur is 2026-05-06 — after start, included
  // jun-food is 2026-06-01 — before end (Jun 4), included
  expect(filterTransactionsForPeriod(txs, '2026-05', 5).map(tx => tx.id)).toEqual(['may-dining', 'may-eur', 'jun-food']);
});

test('formatPeriodLabel with startDay=1 matches existing behavior', () => {
  expect(formatPeriodLabel('2026-05', 1)).toBe('MAY 2026');
});

test('formatPeriodLabel with startDay=15 shows date range', () => {
  expect(formatPeriodLabel('2026-05', 15)).toBe('MAY 15 – JUN 14, 2026');
});

test('formatShortPeriodLabel renders three-letter uppercase month', () => {
  expect(formatShortPeriodLabel('2026-05')).toBe('MAY');
  expect(formatShortPeriodLabel('2026-12')).toBe('DEC');
});

test('getDaysInPeriod returns the calendar length of a month', () => {
  expect(getDaysInPeriod('2026-01')).toBe(31);
  expect(getDaysInPeriod('2026-02')).toBe(28); // 2026 is not a leap year
  expect(getDaysInPeriod('2024-02')).toBe(29); // 2024 is a leap year
  expect(getDaysInPeriod('2026-04')).toBe(30);
});

test('filterTransactionsForRange keeps transactions within an inclusive ISO range', () => {
  expect(filterTransactionsForRange(txs, '2026-05-01', '2026-05-31').map(tx => tx.id))
    .toEqual(['may-food', 'may-dining', 'may-eur']);
});

test('filterTransactionsForRange treats falsy bounds as open-ended', () => {
  // No start, end at end of April → only April transactions
  expect(filterTransactionsForRange(txs, null, '2026-04-30').map(tx => tx.id))
    .toEqual(['apr-food', 'apr-income']);
  // Start at June 1, no end → June onward
  expect(filterTransactionsForRange(txs, '2026-06-01', null).map(tx => tx.id))
    .toEqual(['jun-food']);
  // Drops transactions with no date
  expect(filterTransactionsForRange([{ id: 'no-date', amt: 1 }], null, null)).toEqual([]);
});

test('resolveRangePreset thisMonth returns the calendar month bounds', () => {
  const today = new Date(2026, 4, 14); // May 14, 2026
  const range = resolveRangePreset('thisMonth', today);
  expect(range).toEqual({ start: '2026-05-01', end: '2026-05-31', label: 'THIS MONTH' });
});

test('resolveRangePreset lastMonth returns the prior calendar month', () => {
  const today = new Date(2026, 4, 14); // May 14, 2026
  const range = resolveRangePreset('lastMonth', today);
  expect(range).toEqual({ start: '2026-04-01', end: '2026-04-30', label: 'LAST MONTH' });
});

test('resolveRangePreset ytd returns Jan 1 through today', () => {
  const today = new Date(2026, 4, 14); // May 14, 2026
  const range = resolveRangePreset('ytd', today);
  expect(range.start).toBe('2026-01-01');
  expect(range.end).toBe('2026-05-14');
  expect(range.label).toBe('YEAR TO DATE');
});

test('resolveRangePreset returns null for unknown presets', () => {
  expect(resolveRangePreset('nonsense', new Date(2026, 4, 14))).toBeNull();
});
