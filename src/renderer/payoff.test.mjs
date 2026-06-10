// CAR-345: tests for the debt payoff planner engine. Pure logic, no React.
// Written test-first (TDD). Covers: single-debt amortization sanity, snowball
// vs avalanche ordering, freed-minimum rollover, extra-payment effect, and the
// never-pays-off guard.
import { test, expect } from 'vitest';
import { computePayoff, comparePayoff, payoffOrder } from './payoff.mjs';

function debt(id, name, balance, apr, minPayment) {
  return { id, name, balance, apr, minPayment };
}

test('payoffOrder: snowball orders by smallest balance first', () => {
  const debts = [
    debt('a', 'A', 5000, 10, 100),
    debt('b', 'B', 1000, 25, 50),
    debt('c', 'C', 3000, 5, 60),
  ];
  const order = payoffOrder(debts, 'snowball').map(d => d.id);
  expect(order).toEqual(['b', 'c', 'a']);
});

test('payoffOrder: avalanche orders by highest APR first', () => {
  const debts = [
    debt('a', 'A', 5000, 10, 100),
    debt('b', 'B', 1000, 25, 50),
    debt('c', 'C', 3000, 5, 60),
  ];
  const order = payoffOrder(debts, 'avalanche').map(d => d.id);
  expect(order).toEqual(['b', 'a', 'c']);
});

test('single debt with no interest pays off in exact whole months', () => {
  // 1000 balance, 0% APR, 100/mo => 10 months, no interest.
  const res = computePayoff([debt('x', 'X', 1000, 0, 100)], 'snowball', 0);
  expect(res.neverPaysOff).toBe(false);
  expect(res.totalMonths).toBe(10);
  expect(res.totalInterest).toBeCloseTo(0, 6);
  // Series starts at the full balance and ends at zero.
  expect(res.series[0]).toBeCloseTo(1000, 6);
  expect(res.series[res.series.length - 1]).toBeCloseTo(0, 6);
});

test('single debt amortization known-value sanity (interest accrues monthly)', () => {
  // 1000 @ 12% APR (1%/mo), pay 100/mo.
  // Month 1: interest = 10, balance -> 1000 + 10 - 100 = 910
  // Month 2: interest = 9.10, balance -> 910 + 9.10 - 100 = 819.10
  const res = computePayoff([debt('x', 'X', 1000, 12, 100)], 'avalanche', 0);
  const perDebt = res.debts.find(d => d.id === 'x');
  expect(perDebt.schedule[0].interest).toBeCloseTo(10, 6);
  expect(perDebt.schedule[0].endingBalance).toBeCloseTo(910, 6);
  expect(perDebt.schedule[1].interest).toBeCloseTo(9.1, 6);
  expect(perDebt.schedule[1].endingBalance).toBeCloseTo(819.1, 6);
  // It does eventually pay off and accrues some positive interest.
  expect(res.neverPaysOff).toBe(false);
  expect(res.totalInterest).toBeGreaterThan(0);
});

test('freed-up minimums roll over to the focus debt (snowball rollover)', () => {
  // Two debts. After the small one is cleared, its minimum should accelerate
  // the larger one — so total months are fewer than paying each in isolation.
  const debts = [
    debt('small', 'SMALL', 500, 0, 100),
    debt('big', 'BIG', 2000, 0, 100),
  ];
  const withRollover = computePayoff(debts, 'snowball', 0);
  // small: 500/100 = 5 months. During those 5 months big also gets 100/mo => 500 paid.
  // After month 5 big has 1500 left, now receiving 200/mo => 7.5 -> 8 more months.
  // Total ~13 months. Without rollover big alone would be 2000/100 = 20 months.
  expect(withRollover.neverPaysOff).toBe(false);
  expect(withRollover.totalMonths).toBeLessThan(20);
  expect(withRollover.totalMonths).toBe(13);
});

test('extra payment shortens payoff and reduces total interest', () => {
  const debts = [debt('x', 'X', 5000, 18, 150)];
  const base = computePayoff(debts, 'avalanche', 0);
  const boosted = computePayoff(debts, 'avalanche', 200);
  expect(boosted.neverPaysOff).toBe(false);
  expect(base.neverPaysOff).toBe(false);
  expect(boosted.totalMonths).toBeLessThan(base.totalMonths);
  expect(boosted.totalInterest).toBeLessThan(base.totalInterest);
});

test('never-pays-off guard: min payment below monthly interest', () => {
  // 10000 @ 24% APR => 2%/mo = 200/mo interest. Paying only 50/mo never clears.
  const res = computePayoff([debt('x', 'X', 10000, 24, 50)], 'avalanche', 0);
  expect(res.neverPaysOff).toBe(true);
  expect(res.totalMonths).toBe(1200); // capped, not infinite
  expect(res.series.length).toBeGreaterThan(0);
});

test('snowball vs avalanche differ in interest when ordering matters', () => {
  // Small balance carries the HIGHEST apr; with a fixed extra budget the two
  // strategies attack different debts first, so total interest differs.
  const debts = [
    debt('a', 'A', 1000, 30, 25),   // small balance, highest APR
    debt('b', 'B', 6000, 8, 120),   // big balance, low APR
  ];
  const snow = computePayoff(debts, 'snowball', 200);
  const aval = computePayoff(debts, 'avalanche', 200);
  // Both pay off.
  expect(snow.neverPaysOff).toBe(false);
  expect(aval.neverPaysOff).toBe(false);
  // Here snowball and avalanche happen to attack the same debt first (the
  // small one is also the highest APR), so interest is identical — assert that
  // invariant explicitly so we know ordering logic is consistent.
  expect(aval.totalInterest).toBeCloseTo(snow.totalInterest, 6);

  // Now flip it: small balance has the LOWEST apr. Avalanche should pay less
  // interest than snowball.
  const debts2 = [
    debt('a', 'A', 1000, 5, 25),    // small balance, low APR
    debt('b', 'B', 6000, 28, 120),  // big balance, high APR
  ];
  const snow2 = computePayoff(debts2, 'snowball', 200);
  const aval2 = computePayoff(debts2, 'avalanche', 200);
  expect(aval2.totalInterest).toBeLessThan(snow2.totalInterest);
});

test('comparePayoff returns both strategies plus a recommendation', () => {
  const debts = [
    debt('a', 'A', 1000, 5, 25),
    debt('b', 'B', 6000, 28, 120),
  ];
  const cmp = comparePayoff(debts, 200);
  expect(cmp.snowball.neverPaysOff).toBe(false);
  expect(cmp.avalanche.neverPaysOff).toBe(false);
  // Avalanche saves interest here, so it is the recommended strategy.
  expect(cmp.recommended).toBe('avalanche');
  expect(cmp.interestSaved).toBeCloseTo(
    cmp.snowball.totalInterest - cmp.avalanche.totalInterest,
    6,
  );
});

test('empty debt list is handled without throwing', () => {
  const res = computePayoff([], 'snowball', 0);
  expect(res.neverPaysOff).toBe(false);
  expect(res.totalMonths).toBe(0);
  expect(res.totalInterest).toBe(0);
  expect(res.series).toEqual([0]);
});

test('payoffDate reflects totalMonths from a given start date', () => {
  const res = computePayoff([debt('x', 'X', 1000, 0, 100)], 'snowball', 0, {
    startDate: '2026-01-15',
  });
  // Payment 1 lands in 2026-01; payment 10 (the last) lands in 2026-10.
  expect(res.payoffDate).toBe('2026-10');
});
