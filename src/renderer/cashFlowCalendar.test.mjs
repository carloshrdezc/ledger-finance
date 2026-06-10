import { describe, it, expect } from 'vitest';
import { buildCashFlowCalendar } from './cashFlowCalendar.mjs';
import { projectBalances } from './forecast.mjs';

const accounts = [
  { id: 'chk', name: 'CHECKING', type: 'CHK', ccy: 'USD', balance: 1000 },
  { id: 'sav', name: 'SAVINGS', type: 'SAV', ccy: 'USD', balance: 5000 },
];

const salary = {
  id: 'salary', name: 'SALARY', amt: 2000, acct: 'chk', ccy: 'USD',
  cat: 'income', type: 'income', freq: 'monthly', day: 1, active: true,
};
const rent = {
  id: 'rent', name: 'RENT', amt: 400, acct: 'chk', ccy: 'USD',
  cat: 'housing', freq: 'monthly', day: 2, active: true,
};

describe('buildCashFlowCalendar', () => {
  it('returns an empty shape for empty rows', () => {
    expect(buildCashFlowCalendar([], '2026-01')).toEqual({
      period: '2026-01', days: [], minBalance: 0, minDate: null, billCount: 0,
    });
  });

  it('rolls up per-day-per-account rows into one entry per calendar day', () => {
    const rows = projectBalances(accounts, [], [salary, rent], '2026-01-01', 3);
    const cal = buildCashFlowCalendar(rows, '2026-01');

    expect(cal.days).toHaveLength(3);
    // Day 1: salary +2000 on chk → chk 3000 + sav 5000 = 8000
    expect(cal.days[0]).toMatchObject({ date: '2026-01-01', day: 1, balance: 8000 });
    expect(cal.days[0].events).toEqual([
      { name: 'SALARY', amount: 2000, kind: 'income', source: 'recurring' },
    ]);
    // Day 2: rent -400 → chk 2600 + sav 5000 = 7600
    expect(cal.days[1]).toMatchObject({ date: '2026-01-02', day: 2, balance: 7600 });
    expect(cal.days[1].events).toEqual([
      { name: 'RENT', amount: -400, kind: 'expense', source: 'recurring' },
    ]);
    expect(cal.days[1].outflow).toBe(400);
    // Day 3: no events, balance carries forward
    expect(cal.days[2]).toMatchObject({ date: '2026-01-03', balance: 7600, events: [] });
  });

  it('tracks the low point and counts days with bills', () => {
    const rows = projectBalances(accounts, [], [salary, rent], '2026-01-01', 3);
    const cal = buildCashFlowCalendar(rows, '2026-01');
    expect(cal.minBalance).toBe(7600);
    expect(cal.minDate).toBe('2026-01-02');
    expect(cal.billCount).toBe(2); // day 1 (salary) + day 2 (rent)
  });

  it('flags a risk day when the projected total goes negative', () => {
    const broke = [{ id: 'chk', name: 'CHK', type: 'CHK', ccy: 'USD', balance: 100 }];
    const bigRent = { ...rent, amt: 500, day: 2 };
    const rows = projectBalances(broke, [], [bigRent], '2026-01-01', 3);
    const cal = buildCashFlowCalendar(rows, '2026-01');
    const day2 = cal.days.find(d => d.day === 2);
    expect(day2.balance).toBe(-400);
    expect(day2.isRisk).toBe(true);
  });

  it('restricts to the requested accounts and ignores other months', () => {
    const rows = projectBalances(accounts, [], [salary, rent], '2026-01-01', 3);
    const cal = buildCashFlowCalendar(rows, '2026-01', ['chk']);
    // Only chk counted: day 1 = 1000 + 2000 = 3000
    expect(cal.days[0].balance).toBe(3000);
    // Rows are all January; February filter yields nothing.
    expect(buildCashFlowCalendar(rows, '2026-02').days).toHaveLength(0);
  });

  it('does not flag a sub-cent-negative day that rounds to zero (CAR-349 review M1)', () => {
    // A residual like -0.004 must not flag RISK when the day renders as $0.00.
    const rows = [
      { date: '2026-01-01', accountId: 'chk', projectedBalance: -0.004, events: [], isRiskEvent: false },
    ];
    const cal = buildCashFlowCalendar(rows, '2026-01');
    expect(cal.days[0].balance).toBe(0);
    expect(cal.days[0].isRisk).toBe(false);
  });
});
