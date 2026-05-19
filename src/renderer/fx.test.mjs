import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RATES,
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

describe('toReportingCurrency', () => {
  const rates = { USD: 1.0, EUR: 0.921, GBP: 0.787, JPY: 149.5 };

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

  it.each([0, -1, NaN])('returns input unchanged when rate is invalid (%s)', (badRate) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = toReportingCurrency(100, 'EUR', { USD: 1, EUR: badRate }, 'USD');
    expect(result).toBe(100);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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
