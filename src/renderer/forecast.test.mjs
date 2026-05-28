import { describe, it, expect } from 'vitest';
import { projectBalances } from './forecast.mjs';

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

  it('filters out non-liquid and non-USD accounts', () => {
    const rows = projectBalances(baseAccounts, [], [monthlyRent], '2026-01-01', 2);
    expect(rows.map(row => row.accountId)).toEqual(['chk', 'sav', 'chk', 'sav']);
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
