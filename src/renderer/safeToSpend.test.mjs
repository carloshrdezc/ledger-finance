import { test, expect, describe } from 'vitest';
import {
  computeSafeToSpend,
  sumLiquidBalance,
  sumUnpaidBills,
  sumBudgetRemaining,
  sumGoalsRemaining,
} from './safeToSpend.mjs';

// --- Fixtures matching the shapes the store actually feeds in. -------------
const acct = (id, balance, ccy = 'USD') => ({ id, balance, ccy, type: 'CHK' });
const bill = (amt, status = 'upcoming', type = 'expense') => ({ amt, status, type });
const budget = (left) => ({ cat: 'food', limit: 0, spent: 0, available: 0, left });
const goal = (current, target) => ({ id: 'g', current, target });

describe('component sums', () => {
  test('sumLiquidBalance adds account balances', () => {
    expect(sumLiquidBalance([acct('a', 1000), acct('b', 500)])).toBe(1500);
  });

  test('sumLiquidBalance applies a currency converter', () => {
    const convert = (amt, ccy) => (ccy === 'EUR' ? amt * 1.1 : amt);
    expect(sumLiquidBalance([acct('a', 100, 'USD'), acct('b', 100, 'EUR')], convert)).toBeCloseTo(210);
  });

  test('sumUnpaidBills excludes paid + income, uses absolute value', () => {
    const rows = [
      bill(-200, 'upcoming'),  // owed 200
      bill(-50, 'due'),        // owed 50
      bill(-75, 'overdue'),    // owed 75
      bill(-300, 'paid'),      // excluded (already spent)
      bill(2000, 'upcoming', 'income'), // excluded (income)
      bill(40, 'upcoming'),    // owed 40 (stored positive)
    ];
    expect(sumUnpaidBills(rows)).toBe(200 + 50 + 75 + 40);
  });

  test('sumBudgetRemaining counts only positive remaining', () => {
    // 300 remaining + 0 (overspent floored) + 120 remaining
    expect(sumBudgetRemaining([budget(300), budget(-80), budget(120)])).toBe(420);
  });

  test('sumGoalsRemaining floors each goal at zero', () => {
    // 500 to go + 0 (already met) + 0 (over-funded)
    expect(sumGoalsRemaining([goal(500, 1000), goal(1000, 1000), goal(1200, 1000)])).toBe(500);
  });
});

describe('computeSafeToSpend', () => {
  test('normal case: balance minus all commitments', () => {
    const out = computeSafeToSpend({
      accounts: [acct('chk', 5000)],
      billRows: [bill(-1200, 'upcoming'), bill(-300, 'due')],
      budgetRows: [budget(400)],
      goals: [goal(0, 500)],
    });
    expect(out.liquidBalance).toBe(5000);
    expect(out.unpaidBills).toBe(1500);
    expect(out.budgetRemaining).toBe(400);
    expect(out.goalsRemaining).toBe(500);
    expect(out.reserved).toBe(2400);
    expect(out.safeToSpend).toBe(2600);
    expect(out.isNegative).toBe(false);
  });

  test('zero / empty inputs yield $0 with no NaN', () => {
    const out = computeSafeToSpend({});
    expect(out).toEqual({
      safeToSpend: 0,
      liquidBalance: 0,
      unpaidBills: 0,
      budgetRemaining: 0,
      goalsRemaining: 0,
      reserved: 0,
      isNegative: false,
    });
    // Explicit empty arrays behave identically.
    expect(computeSafeToSpend({ accounts: [], billRows: [], budgetRows: [], goals: [] }).safeToSpend).toBe(0);
  });

  test('negative safe-to-spend when commitments exceed cash', () => {
    const out = computeSafeToSpend({
      accounts: [acct('chk', 800)],
      billRows: [bill(-1000, 'overdue')],
      budgetRows: [budget(200)],
      goals: [],
    });
    expect(out.reserved).toBe(1200);
    expect(out.safeToSpend).toBe(-400);
    expect(out.isNegative).toBe(true);
  });

  test('only liquid balance, nothing reserved → safe == balance', () => {
    const out = computeSafeToSpend({ accounts: [acct('chk', 1234.56)] });
    expect(out.safeToSpend).toBe(1234.56);
    expect(out.reserved).toBe(0);
  });

  test('matches the underlying ledger math (component sum identity)', () => {
    const accounts = [acct('chk', 4200.5), acct('sav', 1800.25)];
    const billRows = [bill(-450, 'upcoming'), bill(-99.99, 'due'), bill(-500, 'paid')];
    const budgetRows = [budget(610.1), budget(-40)];
    const goals = [goal(250, 1000), goal(500, 500)];
    const out = computeSafeToSpend({ accounts, billRows, budgetRows, goals });

    // Re-derive each component the long way and assert the hero number is
    // exactly balance − bills − budgets − goals (rounded to cents).
    const liquid = 4200.5 + 1800.25;
    const bills = 450 + 99.99;               // paid excluded
    const budgetsLeft = 610.1;               // overspent floored to 0
    const goalsLeft = 750;                   // (1000-250) + max(0,500-500)
    const expected = Math.round((liquid - bills - budgetsLeft - goalsLeft + Number.EPSILON) * 100) / 100;

    expect(out.liquidBalance).toBe(liquid);
    expect(out.unpaidBills).toBe(bills);
    expect(out.budgetRemaining).toBe(budgetsLeft);
    expect(out.goalsRemaining).toBe(goalsLeft);
    expect(out.safeToSpend).toBe(expected);
    expect(out.safeToSpend).toBe(out.liquidBalance - out.reserved);
  });

  test('reactivity proxy: a new transaction that moves balance moves the metric', () => {
    const before = computeSafeToSpend({ accounts: [acct('chk', 1000)], billRows: [bill(-200)] });
    // Simulate a -150 expense transaction lowering the balance.
    const after = computeSafeToSpend({ accounts: [acct('chk', 850)], billRows: [bill(-200)] });
    expect(after.safeToSpend).toBe(before.safeToSpend - 150);
  });
});
