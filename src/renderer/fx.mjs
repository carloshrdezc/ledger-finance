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

// Single source of truth for the currencies the app supports. Settings
// pickers, the FxRatesSection, and the ALL_CURRENCIES tests all import
// from here so adding a currency is a one-line change.
export const ALL_CURRENCIES = Object.keys(DEFAULT_RATES);

const SOURCE_PRIORITY = { seed: 0, fetched: 1, manual: 2 };
const USD_SENTINEL_DATE = '1900-01-01';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isUsableRate(r) {
  return typeof r === 'number' && Number.isFinite(r) && r > 0;
}

function toIsoDate(value, fallback = new Date()) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : toIsoDate(fallback);
  }
  if (typeof value === 'string' && value) {
    const trimmed = value.slice(0, 10);
    const parsed = Date.parse(`${trimmed}T00:00:00Z`);
    if (Number.isFinite(parsed)) return trimmed;
  }
  return fallback instanceof Date ? fallback.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function sourcePriority(source) {
  return SOURCE_PRIORITY[source] ?? SOURCE_PRIORITY.seed;
}

function sanitizeEntry(entry, fallbackDate, fallbackSource = 'seed') {
  if (!isPlainObject(entry)) return null;
  const rate = Number(entry.rate);
  if (!isUsableRate(rate)) return null;
  const effectiveFrom = toIsoDate(entry.effectiveFrom, new Date(`${fallbackDate}T00:00:00Z`));
  const source = typeof entry.source === 'string' && entry.source ? entry.source : fallbackSource;
  return { rate, effectiveFrom, source };
}

function sanitizeHistoryArray(entries, fallbackDate, fallbackSource = 'seed') {
  const byDate = new Map();
  let coalescedCount = 0;
  let corruptCount = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    // Detect corrupt effectiveFrom BEFORE sanitizeEntry (which would silently
    // rewrite it to fallbackDate). We want to know if multiple entries had
    // unparseable dates and got collapsed onto the same fallback day, because
    // that loses information distinct legitimate manual edits would carry.
    const rawDate = isPlainObject(entry) ? entry.effectiveFrom : undefined;
    const isParseable = typeof rawDate === 'string' && rawDate
      && Number.isFinite(Date.parse(`${rawDate.slice(0, 10)}T00:00:00Z`));
    const isDateObj = rawDate instanceof Date && Number.isFinite(rawDate.getTime());
    if (rawDate !== undefined && !isParseable && !isDateObj) corruptCount += 1;

    const clean = sanitizeEntry(entry, fallbackDate, fallbackSource);
    if (!clean) continue;
    const prev = byDate.get(clean.effectiveFrom);
    if (!prev) {
      byDate.set(clean.effectiveFrom, clean);
      continue;
    }
    coalescedCount += 1;
    const prevPriority = sourcePriority(prev.source);
    const nextPriority = sourcePriority(clean.source);
    if (nextPriority > prevPriority || nextPriority === prevPriority) {
      byDate.set(clean.effectiveFrom, clean);
    }
  }
  // Warn only when corrupt-date inputs caused coalescing — distinct legitimate
  // dates colliding (e.g. multiple same-day fetches) is expected behavior.
  if (corruptCount > 0 && coalescedCount > 0) {
    console.warn(`[fx] coalesced ${coalescedCount + 1} entries with corrupt effectiveFrom values onto fallback date ${fallbackDate}`);
  }
  return [...byDate.values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

function normalizeCurrencyHistory(rawValue, ccy, fallbackDate) {
  if (ccy === 'USD') {
    return [{ rate: 1.0, effectiveFrom: USD_SENTINEL_DATE, source: 'seed' }];
  }
  if (Array.isArray(rawValue)) {
    const cleaned = sanitizeHistoryArray(rawValue, fallbackDate);
    if (cleaned.length > 0) return cleaned;
  } else if (isUsableRate(rawValue)) {
    return [{ rate: rawValue, effectiveFrom: fallbackDate, source: 'seed' }];
  } else if (isPlainObject(rawValue)) {
    const clean = sanitizeEntry(rawValue, fallbackDate);
    if (clean) return [clean];
  }

  const defaultRate = DEFAULT_RATES[ccy];
  if (isUsableRate(defaultRate)) {
    return [{ rate: defaultRate, effectiveFrom: fallbackDate, source: 'seed' }];
  }
  return [];
}

// Build a complete rates-history snapshot from any supported legacy shape.
// Legacy flat maps like { EUR: 0.921 } are upgraded to one seed entry per
// currency stamped with fallbackDate.
export function normalizeRatesHistory(input, fallbackDate = toIsoDate(new Date())) {
  const today = toIsoDate(fallbackDate);
  const source = isPlainObject(input) ? input : {};
  const keys = new Set([...Object.keys(DEFAULT_RATES), ...Object.keys(source)]);
  const out = {};
  for (const ccy of keys) {
    const normalized = normalizeCurrencyHistory(source[ccy], ccy, today);
    if (normalized.length > 0) out[ccy] = normalized;
  }
  if (!out.USD) out.USD = [{ rate: 1.0, effectiveFrom: USD_SENTINEL_DATE, source: 'seed' }];
  return out;
}

export function buildDefaultRatesHistory(fallbackDate = toIsoDate(new Date())) {
  return normalizeRatesHistory(DEFAULT_RATES, fallbackDate);
}

function getHistoryEntries(ratesHistory, ccy, fallbackDate = toIsoDate(new Date())) {
  if (ccy === 'USD') {
    return [{ rate: 1.0, effectiveFrom: USD_SENTINEL_DATE, source: 'seed' }];
  }
  const history = isPlainObject(ratesHistory) ? ratesHistory[ccy] : undefined;
  if (Array.isArray(history)) {
    const cleaned = sanitizeHistoryArray(history, fallbackDate);
    if (cleaned.length > 0) return cleaned;
  } else if (isUsableRate(history)) {
    return [{ rate: history, effectiveFrom: fallbackDate, source: 'seed' }];
  } else if (isPlainObject(history)) {
    const clean = sanitizeEntry(history, fallbackDate);
    if (clean) return [clean];
  }
  const defaultRate = DEFAULT_RATES[ccy];
  if (isUsableRate(defaultRate)) {
    return [{ rate: defaultRate, effectiveFrom: fallbackDate, source: 'seed' }];
  }
  return [];
}

export function latestRateEntry(ratesHistory, ccy, fallbackDate = toIsoDate(new Date())) {
  const entries = getHistoryEntries(ratesHistory, ccy, fallbackDate);
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

// Internal lookup used by the conversion helpers.
// Picks the entry whose effectiveFrom is the latest value <= date, then falls
// back to the earliest known entry, then DEFAULT_RATES, then null.
//
// Warns once per call when the requested date is more than 30 days before the
// earliest known rate — the conversion is silently using a too-old fallback,
// which means imports of very old transactions don't get accurate historical
// conversions until the user backfills rate history.
const FALLBACK_GRACE_DAYS = 30;

function daysBetween(a, b) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function rateFor(ratesHistory, ccy, date) {
  if (ccy === 'USD') return 1.0;

  const day = toIsoDate(date);
  const entries = getHistoryEntries(ratesHistory, ccy, day);
  if (entries.length === 0) return null;

  let chosen = entries[0];
  for (const entry of entries) {
    if (entry.effectiveFrom <= day) chosen = entry;
    else break;
  }

  // If we ended up using the earliest entry as a fallback because `day` is
  // before any known rate, surface a warning when:
  //   1. the gap exceeds the 30-day grace window, AND
  //   2. the earliest entry is NOT a default seed.
  //
  // Reason for (2): a fresh app boots with default seeds stamped at TODAY.
  // Importing a year of historical transactions would otherwise spam the
  // console with one warning per old-tx conversion (CAR-157 round-2 finding).
  // Once the user manually backfills at least one historical entry — or a
  // 'fetched' rate from a price feed lands — we trust that they've opted into
  // historical accuracy and warn only for txs older than that earliest known
  // non-seed point.
  if (chosen === entries[0] && entries[0].effectiveFrom > day && entries[0].source !== 'seed') {
    const gap = daysBetween(day, entries[0].effectiveFrom);
    if (gap > FALLBACK_GRACE_DAYS) {
      console.warn(`[fx] rateFor(${ccy}, ${day}): using older fallback rate from ${entries[0].effectiveFrom} (gap ${gap} days). Historical conversion may be inaccurate.`);
    }
  }

  return isUsableRate(chosen?.rate) ? chosen.rate : null;
}

// Convert `amt` (denominated in `ccy`) into `reportingCcy`.
// Returns `amt` unchanged and warns if any required rate is unusable.
export function toReportingCurrency(amt, ccy, ratesHistory, reportingCcy, date = new Date()) {
  if (ccy === reportingCcy) return amt;

  const fromRate = rateFor(ratesHistory, ccy, date);
  const toRate = rateFor(ratesHistory, reportingCcy, date);

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
export function convertBetween(amt, fromCcy, toCcy, ratesHistory, date = new Date()) {
  return toReportingCurrency(amt, fromCcy, ratesHistory, toCcy, date);
}

// Human-readable label like "1 USD = 0.9210 EUR".
// JPY-style large rates use 2 decimals; sub-unit rates use 4.
export function formatRate(ccy, rate) {
  const decimals = rate >= 10 ? 2 : 4;
  return `1 USD = ${rate.toFixed(decimals)} ${ccy}`;
}
