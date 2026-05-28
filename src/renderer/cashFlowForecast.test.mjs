import { describe, it, expect } from 'vitest';
import { buildCashFlowForecast, expandRuleEvents } from './cashFlowForecast.mjs';

// Helpers ------------------------------------------------------------------

function rule(over) {
  return {
    id: 'r1',
    name: 'Rent',
    amt: 1500,
    acct: 'chk',
    ccy: 'USD',
    cat: 'housing',
    freq: 'monthly',
    day: 1,
    active: true,
    ...over,
  };
}

// Tests --------------------------------------------------------------------

describe('expandRuleEvents', () => {
  it('expands a monthly rule across the horizon, signed as outflow', () => {
    const r = rule({ freq: 'monthly', day: 5, amt: 100 });
    const events = expandRuleEvents(r, '2026-01-01', '2026-04-01');
    expect(events.map(e => e.date)).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
    for (const e of events) {
      expect(e.amount).toBe(-100);
      expect(e.kind).toBe('expense');
      expect(e.ruleId).toBe('r1');
    }
  });

  it('flags income rules as positive amounts', () => {
    const r = rule({ type: 'income', amt: 3000, day: 15 });
    const [evt] = expandRuleEvents(r, '2026-02-01', '2026-03-01');
    expect(evt.amount).toBe(3000);
    expect(evt.kind).toBe('income');
  });

  it('skips inactive rules entirely', () => {
    const r = rule({ active: false });
    expect(expandRuleEvents(r, '2026-01-01', '2027-01-01')).toEqual([]);
  });

  it('handles annual rules — only fires in the configured month', () => {
    const r = rule({ freq: 'annual', month: 4, day: 15, amt: 800, name: 'Property tax' });
    const events = expandRuleEvents(r, '2026-01-01', '2027-01-01');
    expect(events.map(e => e.date)).toEqual(['2026-04-15']);
  });

  it('handles weekly rules — fires every matching weekday in horizon', () => {
    // 2026-01-05 is a Monday (rule.day=1). Expect 4 Mondays in Jan 2026.
    const r = rule({ freq: 'weekly', day: 1, amt: 50 });
    const events = expandRuleEvents(r, '2026-01-01', '2026-02-01');
    expect(events.map(e => e.date)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
    ]);
  });

  it('handles biweekly rules using the startDate anchor', () => {
    const r = rule({ freq: 'biweekly', startDate: '2026-01-02', amt: 75 });
    const events = expandRuleEvents(r, '2026-01-01', '2026-02-15');
    expect(events.map(e => e.date)).toEqual([
      '2026-01-02',
      '2026-01-16',
      '2026-01-30',
      '2026-02-13',
    ]);
  });

  it('handles custom-interval rules', () => {
    const r = rule({ freq: 'custom', interval: 10, startDate: '2026-03-01', amt: 20 });
    const events = expandRuleEvents(r, '2026-03-01', '2026-04-01');
    expect(events.map(e => e.date)).toEqual([
      '2026-03-01',
      '2026-03-11',
      '2026-03-21',
      '2026-03-31',
    ]);
  });

  it('returns empty when toDate <= fromDate', () => {
    const r = rule();
    expect(expandRuleEvents(r, '2026-01-01', '2026-01-01')).toEqual([]);
    expect(expandRuleEvents(r, '2026-01-05', '2026-01-01')).toEqual([]);
  });

  it('clamps day-of-month for short months (Feb monthly rule.day=31)', () => {
    // Feb 2026 has 28 days — the rule should fire on the 28th, not 31st.
    const r = rule({ freq: 'monthly', day: 31, amt: 50 });
    const events = expandRuleEvents(r, '2026-02-01', '2026-03-01');
    expect(events.map(e => e.date)).toEqual(['2026-02-28']);
  });
});

describe('buildCashFlowForecast', () => {
  it('returns the right shape and bounds', () => {
    const fc = buildCashFlowForecast([], '2026-01-01', 30);
    expect(fc.fromDate).toBe('2026-01-01');
    expect(fc.toDate).toBe('2026-01-31');
    expect(fc.horizonDays).toBe(30);
    expect(fc.events).toEqual([]);
    expect(fc.totals[30]).toEqual({ inflow: 0, outflow: 0, net: 0, count: 0 });
    expect(fc.totals[60]).toEqual({ inflow: 0, outflow: 0, net: 0, count: 0 });
    expect(fc.totals[90]).toEqual({ inflow: 0, outflow: 0, net: 0, count: 0 });
  });

  it('totals split inflow and outflow over each horizon', () => {
    const rent = rule({ id: 'rent', amt: 1500, day: 1, freq: 'monthly' });
    const salary = rule({ id: 'sal', type: 'income', amt: 4000, day: 15, freq: 'monthly', name: 'Salary' });
    const fc = buildCashFlowForecast([rent, salary], '2026-01-01', 90);

    // Jan: rent on 1st, salary on 15th
    // Feb: rent on 1st, salary on 15th
    // Mar: rent on 1st, salary on 15th — but 'to' is 2026-04-01 (exclusive)
    // 30-day window (Jan 1 .. Jan 31): rent Jan 1 + salary Jan 15 = 2 events
    expect(fc.totals[30].count).toBe(2);
    expect(fc.totals[30].inflow).toBe(4000);
    expect(fc.totals[30].outflow).toBe(1500);
    expect(fc.totals[30].net).toBe(2500);

    // 60-day window (Jan 1 .. Mar 2 exclusive): + rent Feb 1, salary Feb 15, rent Mar 1 = 5 events
    expect(fc.totals[60].count).toBe(5);
    expect(fc.totals[60].net).toBe(2500 + 4000 - 1500 - 1500); // = 3500

    // 90-day window (Jan 1 .. Apr 1 exclusive): + salary Mar 15 = 6 events total
    expect(fc.totals[90].count).toBe(6);
    expect(fc.totals[90].net).toBe(7500);
  });

  it('events are sorted ascending by date', () => {
    const a = rule({ id: 'a', name: 'A', day: 20, amt: 10 });
    const b = rule({ id: 'b', name: 'B', day: 5, amt: 20 });
    const fc = buildCashFlowForecast([a, b], '2026-01-01', 30);
    const dates = fc.events.map(e => e.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates).toEqual(['2026-01-05', '2026-01-20']);
  });

  it('excludes inactive rules', () => {
    const active = rule({ id: 'a', amt: 100, day: 1 });
    const inactive = rule({ id: 'b', amt: 999, day: 5, active: false });
    const fc = buildCashFlowForecast([active, inactive], '2026-01-01', 30);
    expect(fc.events.map(e => e.ruleId)).toEqual(['a']);
  });

  it('skips malformed rules (no id, no amount, NaN)', () => {
    const good = rule({ id: 'good', amt: 100 });
    const bad1 = { name: 'no id', amt: 50, day: 5, freq: 'monthly' };
    const bad2 = rule({ id: 'no-amt', amt: NaN });
    const bad3 = rule({ id: 'no-amt2', amt: undefined });
    const fc = buildCashFlowForecast([good, bad1, bad2, bad3, null], '2026-01-01', 30);
    expect(fc.events.map(e => e.ruleId)).toEqual(['good']);
  });

  it('handles fromDate mid-month correctly', () => {
    // Monthly rule on day 1 — starting Jan 15 should NOT include Jan 1
    const r = rule({ freq: 'monthly', day: 1, amt: 100 });
    const fc = buildCashFlowForecast([r], '2026-01-15', 60);
    expect(fc.events.map(e => e.date)).toEqual(['2026-02-01', '2026-03-01']);
  });

  it('handles leap-day annual rule across years (2028 is a leap year)', () => {
    const r = rule({ freq: 'annual', month: 2, day: 29, amt: 100 });
    // Non-leap 2026 — Feb 29 doesn't exist; annual occurrence engine clamps to last day (28)
    const fc2026 = buildCashFlowForecast([r], '2026-02-01', 31);
    expect(fc2026.events.map(e => e.date)).toEqual(['2026-02-28']);
    // Leap 2028 — real Feb 29
    const fc2028 = buildCashFlowForecast([r], '2028-02-01', 31);
    expect(fc2028.events.map(e => e.date)).toEqual(['2028-02-29']);
  });

  it('zero horizon returns no events but valid totals', () => {
    const r = rule({ amt: 100, day: 1 });
    const fc = buildCashFlowForecast([r], '2026-01-01', 0);
    expect(fc.events).toEqual([]);
    expect(fc.toDate).toBe('2026-01-01');
    expect(fc.totals[30]).toEqual({ inflow: 0, outflow: 0, net: 0, count: 0 });
  });

  it('default horizon is 90 days', () => {
    const r = rule({ amt: 100, day: 1, freq: 'monthly' });
    const fc = buildCashFlowForecast([r], '2026-01-01');
    expect(fc.horizonDays).toBe(90);
    expect(fc.toDate).toBe('2026-04-01');
    expect(fc.events).toHaveLength(3); // Jan, Feb, Mar
  });

  it('preserves currency per event (no FX conversion)', () => {
    const usd = rule({ id: 'usd', amt: 100, ccy: 'USD' });
    const eur = rule({ id: 'eur', amt: 50, ccy: 'EUR', day: 10 });
    const fc = buildCashFlowForecast([usd, eur], '2026-01-01', 30);
    const byRule = Object.fromEntries(fc.events.map(e => [e.ruleId, e.ccy]));
    expect(byRule).toEqual({ usd: 'USD', eur: 'EUR' });
  });
});
