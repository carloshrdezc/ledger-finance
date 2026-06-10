import { test, expect, describe } from 'vitest';
import { compactForecastSeries } from './forecastSeries.mjs';
import { projectBalances } from './forecast.mjs';
import { DEFAULT_RATES } from './fx.mjs';

const row = (date, accountId, projectedBalance, isRiskEvent = false) => ({
  date, accountId, projectedBalance, isRiskEvent, events: [],
});

describe('compactForecastSeries', () => {
  test('returns empty shape on empty input', () => {
    expect(compactForecastSeries([])).toEqual({
      dates: [], totals: [], riskIndices: [], minTotal: 0, minDate: null,
    });
    expect(compactForecastSeries(null)).toEqual({
      dates: [], totals: [], riskIndices: [], minTotal: 0, minDate: null,
    });
  });

  test('sums per-day totals across accounts', () => {
    const rows = [
      row('2026-06-01', 'a1', 1000),
      row('2026-06-01', 'a2', 500),
      row('2026-06-02', 'a1', 900),
      row('2026-06-02', 'a2', 500),
    ];
    const out = compactForecastSeries(rows);
    expect(out.dates).toEqual(['2026-06-01', '2026-06-02']);
    expect(out.totals).toEqual([1500, 1400]);
    expect(out.riskIndices).toEqual([]);
    expect(out.minTotal).toBe(1400);
    expect(out.minDate).toBe('2026-06-02');
  });

  test('flags total-below-threshold days', () => {
    const rows = [
      row('2026-06-01', 'a1', 200),
      row('2026-06-02', 'a1', 50),
      row('2026-06-03', 'a1', -10),
    ];
    const out = compactForecastSeries(rows, { threshold: 100 });
    // Day 0: 200 >= 100 (safe)
    // Day 1: 50 < 100 (risk)
    // Day 2: -10 < 100 AND row.isRiskEvent (still just one entry)
    expect(out.riskIndices).toEqual([1, 2]);
  });

  test('flags days where any account is overdrawn even if total is positive', () => {
    const rows = [
      row('2026-06-01', 'a1', 1000),
      row('2026-06-01', 'a2', -50, true), // hard-floor flag from data layer
    ];
    const out = compactForecastSeries(rows, { threshold: 0 });
    expect(out.totals).toEqual([950]);
    expect(out.riskIndices).toEqual([0]);
  });

  test('respects accountIds filter (Set)', () => {
    const rows = [
      row('2026-06-01', 'a1', 1000),
      row('2026-06-01', 'a2', 500),
    ];
    const out = compactForecastSeries(rows, { accountIds: new Set(['a1']) });
    expect(out.totals).toEqual([1000]);
  });

  test('respects accountIds filter (array)', () => {
    const rows = [
      row('2026-06-01', 'a1', 1000),
      row('2026-06-01', 'a2', 500),
    ];
    const out = compactForecastSeries(rows, { accountIds: ['a2'] });
    expect(out.totals).toEqual([500]);
  });

  test('null accountIds means "all accounts"', () => {
    const rows = [
      row('2026-06-01', 'a1', 1000),
      row('2026-06-01', 'a2', 500),
    ];
    expect(compactForecastSeries(rows, { accountIds: null }).totals).toEqual([1500]);
  });

  test('finds the minimum total and its date', () => {
    const rows = [
      row('2026-06-01', 'a1', 1500),
      row('2026-06-02', 'a1', 800),
      row('2026-06-03', 'a1', 1200),
      row('2026-06-04', 'a1', 600), // min
      row('2026-06-05', 'a1', 900),
    ];
    const out = compactForecastSeries(rows);
    expect(out.minTotal).toBe(600);
    expect(out.minDate).toBe('2026-06-04');
  });

  test('coerces non-finite balances to 0', () => {
    const rows = [
      row('2026-06-01', 'a1', NaN),
      row('2026-06-01', 'a2', 500),
    ];
    expect(compactForecastSeries(rows).totals).toEqual([500]);
  });
});

describe('forecast pipeline mixed-currency aggregation (CAR-359)', () => {
  // DEFAULT_RATES: USD=1, MXN=17.2 (1 USD = N units of ccy). Primary = MXN.
  const accounts = [
    { id: 'usd', name: 'USD CHK', type: 'CHK', ccy: 'USD', balance: 1000 },
    { id: 'mxn', name: 'MXN SAV', type: 'SAV', ccy: 'MXN', balance: 5000 },
  ];

  test('per-date total is the sum of each account balance CONVERTED to primary ccy, not the raw sum', () => {
    const rows = projectBalances(
      accounts, [], [], '2026-01-01', 1,
      { rates: DEFAULT_RATES, reportingCcy: 'MXN' },
    );
    const out = compactForecastSeries(rows);
    // USD 1000 -> 17200 MXN; MXN 5000 -> 5000 MXN. Converted total = 22200.
    // Raw (unconverted, buggy) sum would have been 1000 + 5000 = 6000.
    expect(out.totals[0]).toBeCloseTo(22200, 6);
    expect(out.totals[0]).not.toBe(6000);
  });

  test('an event in a non-USD account moves the converted total by the converted delta', () => {
    const rows = projectBalances(
      accounts,
      // -344 MXN expense on the MXN account on day 1.
      [{ id: 'tx', name: 'TIENDA', amt: -344, acct: 'mxn', ccy: 'MXN', date: '2026-01-02', cat: 'food' }],
      [],
      '2026-01-01',
      2,
      { rates: DEFAULT_RATES, reportingCcy: 'MXN' },
    );
    const out = compactForecastSeries(rows);
    // Day 0: 17200 + 5000 = 22200. Day 1: 17200 + (5000 - 344) = 21856.
    expect(out.totals[0]).toBeCloseTo(22200, 6);
    expect(out.totals[1]).toBeCloseTo(21856, 6);
  });

  test('backward-compat: all-USD pipeline with no rates is unchanged', () => {
    const usdOnly = [
      { id: 'a', type: 'CHK', ccy: 'USD', balance: 1000 },
      { id: 'b', type: 'SAV', ccy: 'USD', balance: 500 },
    ];
    const rows = projectBalances(usdOnly, [], [], '2026-01-01', 1);
    expect(compactForecastSeries(rows).totals[0]).toBe(1500);
  });
});
