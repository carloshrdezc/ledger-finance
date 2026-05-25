import { test, expect, describe } from 'vitest';
import { compactForecastSeries } from './forecastSeries.mjs';

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
