import { describe, it, expect } from 'vitest';
import { projectBalances, isLiquidAccount } from './forecast.mjs';
import { DEFAULT_RATES } from './fx.mjs';

const baseAccounts = [
  { id: 'chk', name: 'CHECKING', type: 'CHK', ccy: 'USD', balance: 1000 },
  { id: 'sav', name: 'SAVINGS', type: 'SAV', ccy: 'USD', balance: 5000 },
  { id: 'cc', name: 'CREDIT', type: 'CC', ccy: 'USD', balance: -200 },
  { id: 'eur', name: 'EURO', type: 'SAV', ccy: 'EUR', balance: 700 },
];

const monthlyRent = {
  id: 'rent',
  name: 'RENT',
  amt: 400,
  acct: 'chk',
  ccy: 'USD',
  cat: 'housing',
  freq: 'monthly',
  day: 2,
  active: true,
};

const monthlySalary = {
  id: 'salary',
  name: 'SALARY',
  amt: 2000,
  acct: 'chk',
  ccy: 'USD',
  cat: 'income',
  type: 'income',
  freq: 'monthly',
  day: 1,
  active: true,
};

function byAccount(rows) {
  return rows.reduce((acc, row) => {
    (acc[row.accountId] ||= []).push(row);
    return acc;
  }, {});
}

describe('projectBalances', () => {
  it('returns no rows when there are no liquid accounts', () => {
    expect(projectBalances([{ id: 'cc', type: 'CC', ccy: 'USD', balance: 0 }], [], [], '2026-01-01', 5)).toEqual([]);
  });

  it('returns no rows for a zero-day horizon', () => {
    expect(projectBalances(baseAccounts, [], [], '2026-01-01', 0)).toEqual([]);
  });

  it('projects one row per day per liquid account', () => {
    const rows = projectBalances([baseAccounts[0]], [], [], '2026-01-01', 3);
    expect(rows).toHaveLength(3);
    expect(rows.map(row => row.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(rows.every(row => row.accountId === 'chk')).toBe(true);
  });

  it('carries balances forward when there are no events', () => {
    const rows = projectBalances([baseAccounts[0]], [], [], '2026-01-01', 3);
    expect(rows.map(row => row.projectedBalance)).toEqual([1000, 1000, 1000]);
    expect(rows.every(row => Array.isArray(row.events))).toBe(true);
  });

  it('applies recurring expenses to the matching account on the matching day', () => {
    const rows = projectBalances([baseAccounts[0]], [], [monthlyRent], '2026-01-01', 4);
    expect(rows.map(row => row.projectedBalance)).toEqual([1000, 600, 600, 600]);
    expect(rows[1].events).toHaveLength(1);
    expect(rows[1].events[0]).toMatchObject({ source: 'recurring', ruleId: 'rent', acct: 'chk', amount: -400 });
  });

  it('applies recurring income and keeps the balance non-negative', () => {
    const rows = projectBalances([baseAccounts[0]], [], [monthlySalary], '2026-01-01', 3);
    expect(rows.map(row => row.projectedBalance)).toEqual([3000, 3000, 3000]);
    expect(rows.every(row => row.isRiskEvent === false)).toBe(true);
  });

  it('applies future one-off transactions in addition to recurring rules', () => {
    const rows = projectBalances(
      [baseAccounts[0]],
      [{ id: 'tx1', name: 'CAR PAYMENT', amt: -250, acct: 'chk', ccy: 'USD', date: '2026-01-03', cat: 'auto' }],
      [],
      '2026-01-01',
      4,
    );
    expect(rows.map(row => row.projectedBalance)).toEqual([1000, 1000, 750, 750]);
    expect(rows[2].events).toHaveLength(1);
    expect(rows[2].events[0]).toMatchObject({ source: 'transaction', txId: 'tx1', amount: -250 });
  });

  it('keeps multiple accounts independent', () => {
    const rows = projectBalances(
      [baseAccounts[0], baseAccounts[1]],
      [{ id: 'tx2', name: 'SAV MOVE', amt: -100, acct: 'sav', ccy: 'USD', date: '2026-01-02', cat: 'transfer' }],
      [monthlyRent],
      '2026-01-01',
      3,
    );
    const grouped = byAccount(rows);
    expect(grouped.chk.map(row => row.projectedBalance)).toEqual([1000, 600, 600]);
    expect(grouped.sav.map(row => row.projectedBalance)).toEqual([5000, 4900, 4900]);
  });

  it('filters out non-liquid accounts but now includes non-USD liquid accounts (CAR-359)', () => {
    const rows = projectBalances(baseAccounts, [], [monthlyRent], '2026-01-01', 2);
    // 'cc' (CC) is excluded; 'eur' (EUR SAV) is now included.
    expect(rows.map(row => row.accountId)).toEqual(['chk', 'sav', 'eur', 'chk', 'sav', 'eur']);
  });

  it('flags a risk event when a balance drops below zero', () => {
    const rows = projectBalances(
      [{ id: 'chk', name: 'CHECKING', type: 'CHK', ccy: 'USD', balance: 50 }],
      [{ id: 'tx3', name: 'BIG BILL', amt: -75, acct: 'chk', ccy: 'USD', date: '2026-01-02', cat: 'bills' }],
      [],
      '2026-01-01',
      3,
    );
    expect(rows.map(row => row.isRiskEvent)).toEqual([false, true, true]);
    expect(rows[1].projectedBalance).toBe(-25);
  });

  it('honors the 30/60/90 day range boundaries in the output length', () => {
    const rows30 = projectBalances([baseAccounts[0]], [], [monthlyRent], '2026-01-01', 30);
    const rows60 = projectBalances([baseAccounts[0]], [], [monthlyRent], '2026-01-01', 60);
    const rows90 = projectBalances([baseAccounts[0]], [], [monthlyRent], '2026-01-01', 90);
    expect(rows30).toHaveLength(30);
    expect(rows60).toHaveLength(60);
    expect(rows90).toHaveLength(90);
    expect(rows30.at(-1).date).toBe('2026-01-30');
    expect(rows60.at(-1).date).toBe('2026-03-01');
    expect(rows90.at(-1).date).toBe('2026-03-31');
  });

  it('uses the recurring forecast engine for the recurring events it emits', () => {
    const rows = projectBalances([baseAccounts[0]], [], [monthlyRent], '2026-01-01', 35);
    const eventDates = rows.flatMap(row => row.events.map(event => event.date));
    expect(eventDates).toContain('2026-01-02');
    expect(eventDates).toContain('2026-02-02');
  });

  it('never creates duplicate rows for the same account and date', () => {
    const rows = projectBalances([baseAccounts[0], baseAccounts[1]], [], [monthlyRent, monthlySalary], '2026-01-01', 5);
    const keys = rows.map(row => `${row.accountId}|${row.date}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('isLiquidAccount (CAR-359: currency-agnostic)', () => {
  it('returns true for USD CHK/SAV accounts', () => {
    expect(isLiquidAccount({ type: 'CHK', ccy: 'USD' })).toBe(true);
    expect(isLiquidAccount({ type: 'SAV', ccy: 'USD' })).toBe(true);
  });

  it('returns true for a non-USD CHK/SAV account', () => {
    expect(isLiquidAccount({ type: 'CHK', ccy: 'EUR' })).toBe(true);
    expect(isLiquidAccount({ type: 'SAV', ccy: 'MXN' })).toBe(true);
  });

  it('treats a missing ccy as liquid (USD-implicit)', () => {
    expect(isLiquidAccount({ type: 'CHK' })).toBe(true);
  });

  it('returns false for non-liquid types regardless of ccy', () => {
    expect(isLiquidAccount({ type: 'CC', ccy: 'USD' })).toBe(false);
    expect(isLiquidAccount({ type: 'INV', ccy: 'EUR' })).toBe(false);
    expect(isLiquidAccount(null)).toBe(false);
  });
});

describe('projectBalances currency conversion (CAR-359 OPTION A)', () => {
  // DEFAULT_RATES: USD=1, MXN=17.2, EUR=0.921 (1 USD = N units of ccy).
  const usdAccount = { id: 'usd', name: 'USD CHK', type: 'CHK', ccy: 'USD', balance: 1000 };
  const mxnAccount = { id: 'mxn', name: 'MXN SAV', type: 'SAV', ccy: 'MXN', balance: 5000 };

  it('converts each account balance to the reporting ccy before emitting projectedBalance', () => {
    const rows = projectBalances(
      [usdAccount, mxnAccount], [], [], '2026-01-01', 1,
      { rates: DEFAULT_RATES, reportingCcy: 'MXN' },
    );
    const byId = Object.fromEntries(rows.map(r => [r.accountId, r.projectedBalance]));
    // USD 1000 -> MXN: 1000 / 1 * 17.2 = 17200
    expect(byId.usd).toBeCloseTo(17200, 6);
    // MXN 5000 -> MXN: identity
    expect(byId.mxn).toBeCloseTo(5000, 6);
  });

  it('converts event deltas using the event ccy when projecting (USD event into USD account, MXN primary)', () => {
    const rows = projectBalances(
      [usdAccount, mxnAccount],
      [{ id: 'tx', name: 'BILL', amt: -100, acct: 'usd', ccy: 'USD', date: '2026-01-02', cat: 'bills' }],
      [],
      '2026-01-01',
      2,
      { rates: DEFAULT_RATES, reportingCcy: 'MXN' },
    );
    const usdRows = rows.filter(r => r.accountId === 'usd').map(r => r.projectedBalance);
    // Day 0: 1000 USD -> 17200 MXN. Day 1: (1000 - 100) USD = 900 USD -> 900*17.2 = 15480 MXN.
    expect(usdRows[0]).toBeCloseTo(17200, 6);
    expect(usdRows[1]).toBeCloseTo(15480, 6);
  });

  it('no double-conversion: USD account with USD reporting is unchanged', () => {
    const rows = projectBalances(
      [usdAccount], [], [], '2026-01-01', 1,
      { rates: DEFAULT_RATES, reportingCcy: 'USD' },
    );
    expect(rows[0].projectedBalance).toBe(1000);
  });

  it('no double-conversion: MXN account with MXN reporting is identity', () => {
    const rows = projectBalances(
      [mxnAccount], [], [], '2026-01-01', 1,
      { rates: DEFAULT_RATES, reportingCcy: 'MXN' },
    );
    expect(rows[0].projectedBalance).toBe(5000);
  });

  it('backward-compat: with no rates/reportingCcy passed, all-USD behavior is unchanged', () => {
    const legacy = projectBalances([usdAccount], [], [], '2026-01-01', 3);
    expect(legacy.map(r => r.projectedBalance)).toEqual([1000, 1000, 1000]);
  });
});
