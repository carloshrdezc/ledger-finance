// Foreign-exchange rate math for LEDGER.
//
// Storage convention: rates are "1 USD = N units of currency X".
// USD itself is always 1.0. Pure functions; no React, no I/O.

export const DEFAULT_RATES = {
  USD: 1.0,
  EUR: 0.921,
  GBP: 0.787,
  JPY: 149.5,
  CAD: 1.35,
  AUD: 1.51,
  CHF: 0.885,
  MXN: 17.2,
};

function isUsableRate(r) {
  return typeof r === 'number' && Number.isFinite(r) && r > 0;
}

// Convert `amt` (denominated in `ccy`) into `reportingCcy`.
// Returns `amt` unchanged and warns if any required rate is unusable.
export function toReportingCurrency(amt, ccy, rates, reportingCcy) {
  if (ccy === reportingCcy) return amt;

  const fromRate = rates && rates[ccy];
  const toRate = rates && rates[reportingCcy];

  if (!isUsableRate(fromRate)) {
    console.warn(`[fx] missing/invalid rate for ${ccy}; returning unconverted amount`);
    return amt;
  }
  if (!isUsableRate(toRate)) {
    console.warn(`[fx] missing/invalid rate for reporting currency ${reportingCcy}; returning unconverted amount`);
    return amt;
  }

  const usd = amt / fromRate;
  if (reportingCcy === 'USD') return usd;
  return usd * toRate;
}

// Symmetric pair conversion. Equivalent to toReportingCurrency but reads
// nicer at call sites that aren't aggregating to a "reporting" currency.
export function convertBetween(amt, fromCcy, toCcy, rates) {
  return toReportingCurrency(amt, fromCcy, rates, toCcy);
}

// Human-readable label like "1 USD = 0.9210 EUR".
// JPY-style large rates use 2 decimals; sub-unit rates use 4.
export function formatRate(ccy, rate) {
  const decimals = rate >= 10 ? 2 : 4;
  return `1 USD = ${rate.toFixed(decimals)} ${ccy}`;
}
