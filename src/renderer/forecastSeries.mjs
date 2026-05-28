/**
 * @file Forecast series compaction (CAR-218).
 *
 * The CAR-84 data layer (`forecast.mjs`) returns per-day-per-account rows.
 * The dashboard widget renders a single time series of total liquid balance,
 * plus a set of "risk" indices to highlight on the chart. This module is
 * the pure transform between the two — no React, no DOM, no I/O.
 *
 * Risk policy:
 *   - A day is a risk event if the **total** projected balance across the
 *     selected liquid accounts dips below `threshold` (default 0).
 *   - We also mark a day as risky if any individual account's
 *     `isRiskEvent` flag (from the data layer's hard-floor-at-zero rule)
 *     is set, so a single overdrawn account isn't hidden by surplus elsewhere.
 *   - Threshold is applied to the total only — per-account thresholds are
 *     out of scope for CAR-218.
 */

/**
 * Compact per-day-per-account projection rows into a per-day total series.
 *
 * @param {Array<{date:string, accountId:string, projectedBalance:number, isRiskEvent:boolean}>} rows
 *   Rows from `projectBalances` (CAR-84 data layer). May be empty.
 * @param {Object} [options]
 * @param {number} [options.threshold=0]
 *   Total-balance floor below which a day is flagged as risky.
 * @param {Set<string>|Array<string>|null} [options.accountIds=null]
 *   When provided, restrict the projection to these account ids. Null means
 *   "use every account in `rows`" (the data layer already filtered to
 *   liquid accounts).
 * @returns {{
 *   dates: string[],
 *   totals: number[],
 *   riskIndices: number[],
 *   minTotal: number,
 *   minDate: (string|null),
 * }}
 */
export function compactForecastSeries(rows, options = {}) {
  const { threshold = 0, accountIds = null } = options;
  const allowedAccounts = accountIds == null
    ? null
    : (accountIds instanceof Set ? accountIds : new Set(accountIds));

  if (!Array.isArray(rows) || rows.length === 0) {
    return { dates: [], totals: [], riskIndices: [], minTotal: 0, minDate: null };
  }

  // Group by date — preserve insertion order, which matches the data layer
  // contract ("ordered by date, then by account order").
  const totalsByDate = new Map();
  const riskByDate = new Map();

  for (const row of rows) {
    if (!row || !row.date) continue;
    if (allowedAccounts && !allowedAccounts.has(row.accountId)) continue;

    const total = totalsByDate.get(row.date) || 0;
    totalsByDate.set(row.date, total + (Number.isFinite(row.projectedBalance) ? row.projectedBalance : 0));

    if (row.isRiskEvent) {
      riskByDate.set(row.date, true);
    }
  }

  const dates = Array.from(totalsByDate.keys());
  const totals = dates.map(d => totalsByDate.get(d));
  const riskIndices = [];
  let minTotal = totals.length ? totals[0] : 0;
  let minDate = dates.length ? dates[0] : null;

  for (let i = 0; i < dates.length; i++) {
    const total = totals[i];
    if (total < minTotal) {
      minTotal = total;
      minDate = dates[i];
    }
    if (total < threshold || riskByDate.get(dates[i])) {
      riskIndices.push(i);
    }
  }

  return { dates, totals, riskIndices, minTotal, minDate };
}
