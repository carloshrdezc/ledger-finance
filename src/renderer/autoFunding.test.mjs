import { describe, it, expect } from 'vitest';
import { GOAL_TEMPLATES, getGoalTemplate, goalFromTemplate } from './goalTemplates.mjs';
import { computeDueContributions, summarizeDue } from './autoFunding.mjs';

describe('goalTemplates', () => {
  it('exposes a non-empty library with the required shape', () => {
    expect(GOAL_TEMPLATES.length).toBeGreaterThan(0);
    for (const tpl of GOAL_TEMPLATES) {
      expect(tpl).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        target: expect.any(Number),
        suggestedMonthly: expect.any(Number),
        blurb: expect.any(String),
      });
    }
  });

  it('getGoalTemplate finds by id and returns null otherwise', () => {
    expect(getGoalTemplate('emergency')?.name).toBe('EMERGENCY FUND');
    expect(getGoalTemplate('nope')).toBeNull();
  });

  it('goalFromTemplate maps to addGoal fields with overrides', () => {
    const tpl = getGoalTemplate('vacation');
    expect(goalFromTemplate(tpl)).toEqual({ name: 'VACATION', target: 3000 });
    expect(goalFromTemplate(tpl, { target: 5000, name: 'japan trip', targetDate: '2027-04-01' }))
      .toEqual({ name: 'JAPAN TRIP', target: 5000, targetDate: '2027-04-01' });
  });

  it('goalFromTemplate clamps a negative target to 0', () => {
    expect(goalFromTemplate(getGoalTemplate('car'), { target: -10 }).target).toBe(0);
  });
});

describe('computeDueContributions', () => {
  const monthly = { id: 'r1', goalId: 'g1', amount: 200, source: 'chk', freq: 'monthly', day: 1, startDate: '2026-01-01' };

  it('returns no dates for an inactive or zero-amount rule', () => {
    expect(computeDueContributions({ ...monthly, active: false }, '2026-06-01')).toEqual([]);
    expect(computeDueContributions({ ...monthly, amount: 0 }, '2026-06-01')).toEqual([]);
  });

  it('lists every monthly occurrence from start through today when never funded', () => {
    expect(computeDueContributions(monthly, '2026-03-15')).toEqual([
      '2026-01-01', '2026-02-01', '2026-03-01',
    ]);
  });

  it('only counts occurrences strictly after the last funded date', () => {
    const funded = { ...monthly, lastFundedDate: '2026-02-01' };
    expect(computeDueContributions(funded, '2026-04-15')).toEqual(['2026-03-01', '2026-04-01']);
  });

  it('does not include future occurrences', () => {
    expect(computeDueContributions(monthly, '2026-01-15')).toEqual(['2026-01-01']);
  });

  it('never funds before the rule startDate', () => {
    const late = { ...monthly, startDate: '2026-03-01' };
    expect(computeDueContributions(late, '2026-05-10')).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']);
  });

  it('handles biweekly cadence via the shared occurrence engine', () => {
    const biweekly = { id: 'r2', goalId: 'g1', amount: 50, source: 'chk', freq: 'biweekly', startDate: '2026-01-02' };
    // Jan 2 + 14 = Jan 16, + 14 = Jan 30
    expect(computeDueContributions(biweekly, '2026-01-31')).toEqual(['2026-01-02', '2026-01-16', '2026-01-30']);
  });
});

describe('summarizeDue', () => {
  it('totals the due contributions and reports the next date', () => {
    const rule = { id: 'r1', goalId: 'g1', amount: 200, source: 'chk', freq: 'monthly', day: 1, startDate: '2026-01-01' };
    expect(summarizeDue(rule, '2026-03-15')).toEqual({
      dates: ['2026-01-01', '2026-02-01', '2026-03-01'],
      count: 3,
      total: 600,
      nextDate: '2026-01-01',
    });
  });

  it('reports nothing due when fully funded', () => {
    const rule = { id: 'r1', goalId: 'g1', amount: 200, source: 'chk', freq: 'monthly', day: 1, lastFundedDate: '2026-03-01' };
    expect(summarizeDue(rule, '2026-03-15')).toEqual({ dates: [], count: 0, total: 0, nextDate: null });
  });
});
