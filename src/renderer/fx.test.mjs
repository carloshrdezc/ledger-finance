import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RATES,
  latestRateEntry,
  normalizeRatesHistory,
  rateFor,
  toReportingCurrency,
  convertBetween,
  formatRate,
} from './fx.mjs';

describe('DEFAULT_RATES', () => {
  it('USD is exactly 1.0', () => {
    expect(DEFAULT_RATES.USD).toBe(1.0);
  });

  it('covers every currency in the Settings list', () => {
    const settingsCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];
    for (const ccy of settingsCurrencies) {
      expect(DEFAULT_RATES[ccy]).toBeGreaterThan(0);
      expect(Number.isFinite(DEFAULT_RATES[ccy])).toBe(true);
    }
  });
});

describe('rates history helpers', () => {
  it('normalizes legacy flat maps into history arrays', () => {
    const history = normalizeRatesHistory({ USD: 1, EUR: 0.91 }, '2026-05-26');
    expect(history.USD).toEqual([
      { rate: 1.0, effectiveFrom: '1900-01-01', source: 'seed' },
    ]);
    expect(history.EUR).toEqual([
      { rate: 0.91, effectiveFrom: '2026-05-26', source: 'seed' },
    ]);
  });

  it('picks the latest entry at or before the requested date', () => {
    const history = {
      USD: [{ rate: 1.0, effectiveFrom: '1900-01-01', source: 'seed' }],
      EUR: [
        { rate: 0.9, effectiveFrom: '2026-01-01', source: 'seed' },
        { rate: 0.95, effectiveFrom: '2026-05-20', source: 'manual' },
      ],
    };

    expect(rateFor(history, 'EUR', '2026-05-01')).toBe(0.9);
    expect(rateFor(history, 'EUR', '2026-05-20')).toBe(0.95);
    expect(rateFor(history, 'EUR', '2026-12-31')).toBe(0.95);
    expect(latestRateEntry(history, 'EUR')?.rate).toBe(0.95);
  });
});

describe('toReportingCurrency', () => {
  const rates = {
    USD: [{ rate: 1.0, effectiveFrom: '1900-01-01', source: 'seed' }],
    EUR: [{ rate: 0.921, effectiveFrom: '2026-01-01', source: 'manual' }],
    GBP: [{ rate: 0.787, effectiveFrom: '2026-01-01', source: 'manual' }],
    JPY: [{ rate: 149.5, effectiveFrom: '2026-01-01', source: 'manual' }],
  };

  it('returns the input unchanged when ccy === reportingCcy', () => {
    expect(toReportingCurrency(100, 'EUR', rates, 'EUR')).toBe(100);
  });

  it('USD → USD short-circuits', () => {
    expect(toReportingCurrency(50, 'USD', rates, 'USD')).toBe(50);
  });

  it('EUR → USD: divides by EUR rate', () => {
    expect(toReportingCurrency(92.1, 'EUR', rates, 'USD')).toBeCloseTo(100, 5);
  });

  it('USD → EUR: multiplies by EUR rate', () => {
    expect(toReportingCurrency(100, 'USD', rates, 'EUR')).toBeCloseTo(92.1, 5);
  });

  it('EUR → GBP: routes through USD', () => {
    // 92.1 EUR / 0.921 = 100 USD * 0.787 = 78.7 GBP
    expect(toReportingCurrency(92.1, 'EUR', rates, 'GBP')).toBeCloseTo(78.7, 5);
  });

  it('round-trips USD → EUR → USD within float epsilon', () => {
    const start = 1234.56;
    const inEur = toReportingCurrency(start, 'USD', rates, 'EUR');
    const back = toReportingCurrency(inEur, 'EUR', rates, 'USD');
    expect(back).toBeCloseTo(start, 5);
  });

  it('handles negative amounts (refunds, expenses)', () => {
    expect(toReportingCurrency(-100, 'USD', rates, 'EUR')).toBeCloseTo(-92.1, 5);
  });

  it('returns input unchanged and warns when ccy rate is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = toReportingCurrency(100, 'XXX', rates, 'USD');
    expect(result).toBe(100);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns input unchanged and warns when reporting rate is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = toReportingCurrency(100, 'USD', rates, 'XXX');
    expect(result).toBe(100);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to the default rate when the stored history is invalid', () => {
    const result = toReportingCurrency(100, 'EUR', {
      USD: [{ rate: 1.0, effectiveFrom: '1900-01-01', source: 'seed' }],
      EUR: [{ rate: 0, effectiveFrom: '2026-01-01', source: 'manual' }],
    }, 'USD');
    expect(result).toBeCloseTo(108.5776330076, 10);
  });
});

describe('convertBetween', () => {
  const rates = { USD: 1.0, EUR: 0.921, GBP: 0.787 };

  it('is symmetric round-trip', () => {
    const x = convertBetween(100, 'USD', 'EUR', rates);
    const y = convertBetween(x, 'EUR', 'USD', rates);
    expect(y).toBeCloseTo(100, 5);
  });

  it('matches toReportingCurrency for the same arguments', () => {
    expect(convertBetween(100, 'USD', 'EUR', rates))
      .toBeCloseTo(toReportingCurrency(100, 'USD', rates, 'EUR'), 5);
  });
});

// CAR-157 canary: this is the entire point of the effective-date redesign.
// If editing today's rate ever changes a past-date conversion result, the
// historical-accuracy promise is broken at the data layer.
describe('CAR-157 invariant: editing today does not change the past', () => {
  it('past-date conversion is stable when a new rate is appended for today', () => {
    const before = {
      USD: [{ rate: 1.0, effectiveFrom: '1900-01-01', source: 'seed' }],
      EUR: [
        { rate: 0.90, effectiveFrom: '2026-01-01', source: 'seed' },
        { rate: 0.92, effectiveFrom: '2026-04-01', source: 'manual' },
      ],
    };
    const pastConvBefore = toReportingCurrency(100, 'EUR', before, 'USD', '2026-02-15');

    // User edits today's rate to a wildly different value
    const after = {
      ...before,
      EUR: [
        ...before.EUR,
        { rate: 0.50, effectiveFrom: '2026-05-26', source: 'manual' },
      ],
    };
    const pastConvAfter = toReportingCurrency(100, 'EUR', after, 'USD', '2026-02-15');

    expect(pastConvAfter).toBe(pastConvBefore);
  });

  it('rateFor at-or-before never returns a future entry', () => {
    const hist = {
      EUR: [
        { rate: 0.90, effectiveFrom: '2026-01-01', source: 'seed' },
        { rate: 0.95, effectiveFrom: '2026-03-01', source: 'manual' },
      ],
    };
    expect(rateFor(hist, 'EUR', '2026-02-15')).toBe(0.90);
    expect(rateFor(hist, 'EUR', '2026-02-28')).toBe(0.90);
    expect(rateFor(hist, 'EUR', '2026-03-01')).toBe(0.95); // boundary inclusive
  });
});

describe('rateFor warning behavior (CAR-157 minor #2)', () => {
  it('warns when the requested date is far before the earliest known rate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hist = {
      EUR: [{ rate: 0.92, effectiveFrom: '2026-04-01', source: 'manual' }],
    };
    // 60 days before earliest entry → should warn
    const result = rateFor(hist, 'EUR', '2026-02-01');
    expect(result).toBe(0.92);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('older fallback');
    warn.mockRestore();
  });

  it('does NOT warn when requested date is within the fallback grace window', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hist = {
      EUR: [{ rate: 0.92, effectiveFrom: '2026-04-01', source: 'manual' }],
    };
    // 5 days before earliest entry → within 30-day grace
    const result = rateFor(hist, 'EUR', '2026-03-27');
    expect(result).toBe(0.92);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does NOT warn when earliest entry is a default seed (avoids fresh-app spam)', () => {
    // Documentation-as-test. A fresh app boots with default seeds stamped at
    // TODAY for every supported currency. Importing a year of historical
    // transactions would warn on every old-tx conversion if we didn't suppress
    // seed-fallback warnings. Once the user backfills a 'manual' or 'fetched'
    // entry, the warning becomes informative again and re-enables.
    //
    // This test locks the suppression — if a future commit removes it,
    // bulk-import flows will dump thousands of warnings to the console.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const seedOnly = {
      EUR: [{ rate: 0.921, effectiveFrom: '2026-05-26', source: 'seed' }],
    };
    rateFor(seedOnly, 'EUR', '2025-05-26'); // 1 year before seed
    expect(warn).not.toHaveBeenCalled();

    // But once a manual backfill exists, gaps further back DO warn:
    const backfilled = {
      EUR: [{ rate: 0.85, effectiveFrom: '2024-01-01', source: 'manual' }],
    };
    rateFor(backfilled, 'EUR', '2023-01-01'); // 365 days before manual
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('normalizeRatesHistory warning behavior (CAR-157 minor #1)', () => {
  it('warns when corrupt-date entries collapse onto the same fallback date', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeRatesHistory({
      EUR: [
        { rate: 0.90, effectiveFrom: 'banana', source: 'manual' },
        { rate: 0.91, effectiveFrom: '', source: 'manual' },
        { rate: 0.92, effectiveFrom: null, source: 'manual' },
      ],
    }, '2026-05-26');
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('coalesced');
    warn.mockRestore();
  });

  it('does NOT warn when entries have distinct legitimate dates', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeRatesHistory({
      EUR: [
        { rate: 0.90, effectiveFrom: '2026-01-01', source: 'seed' },
        { rate: 0.92, effectiveFrom: '2026-04-01', source: 'manual' },
      ],
    }, '2026-05-26');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('formatRate', () => {
  it('formats with 4 decimals for sub-unit rates', () => {
    expect(formatRate('EUR', 0.921)).toBe('1 USD = 0.9210 EUR');
  });

  it('formats with 2 decimals for large rates (JPY)', () => {
    expect(formatRate('JPY', 149.5)).toBe('1 USD = 149.50 JPY');
  });

  it('shows USD as base', () => {
    expect(formatRate('USD', 1.0)).toBe('1 USD = 1.0000 USD');
  });
});
