/**
 * @file Recurring cash-flow forecast (CAR-195)
 *
 * Project a stream of upcoming income/expense events from the user's
 * recurring rules ("bills") over a 30/60/90-day horizon, then summarize
 * net cash flow by horizon. Pure functions only — no I/O, no clock
 * dependency unless the caller passes one.
 *
 * Inputs:
 *   - rules:     Array<RecurringRule>  -- same shape stored in `ledger:bills`
 *   - fromDate:  ISO date string 'YYYY-MM-DD' -- inclusive lower bound
 *   - horizonDays: number              -- exclusive upper bound, in days
 *
 * Output:
 *   - { events, totals, horizonDays, fromDate, toDate }
 *
 * Reuses planning.mjs `getOccurrences()` for the recurrence math, so
 * monthly / annual / weekly / biweekly / custom-interval rules all
 * "just work" without re-implementing them here.
 */

import { getOccurrences } from './planning.mjs';

/**
 * @typedef {Object} RecurringRule
 * @property {string} id
 * @property {string} name
 * @property {number} amt              positive magnitude in the rule currency
 * @property {string} acct             account id
 * @property {string} [ccy]            currency, default 'USD'
 * @property {string} [cat]            category
 * @property {'income'|undefined} [type]  'income' = inflow; otherwise outflow
 * @property {boolean} [active]        defaults true; false skips
 * @property {'monthly'|'annual'|'weekly'|'biweekly'|'custom'|undefined} [freq]
 * @property {number} [day]
 * @property {number} [month]
 * @property {number} [interval]       custom freq interval in days
 * @property {string} [startDate]      anchor for biweekly/custom
 */

/**
 * @typedef {Object} ForecastEvent
 * @property {string} ruleId
 * @property {string} name
 * @property {string} date              ISO 'YYYY-MM-DD'
 * @property {number} amount            signed in rule currency: + inflow, - outflow
 * @property {'income'|'expense'} kind
 * @property {string} [acct]
 * @property {string} [ccy]
 * @property {string} [cat]
 */

/**
 * @typedef {Object} HorizonTotals
 * @property {number} inflow            sum of positive amounts (>= 0)
 * @property {number} outflow           sum of negative amounts as positive (>= 0)
 * @property {number} net               inflow - outflow
 * @property {number} count             number of events in this horizon
 */

/**
 * @typedef {Object} CashFlowForecast
 * @property {string} fromDate          inclusive ISO date
 * @property {string} toDate            exclusive ISO date (fromDate + horizonDays)
 * @property {number} horizonDays       max horizon used for `events`
 * @property {ForecastEvent[]} events   sorted ascending by `date`
 * @property {{30: HorizonTotals, 60: HorizonTotals, 90: HorizonTotals}} totals
 *                                       totals over the first 30/60/90 days from fromDate
 */

const MS_PER_DAY = 86400000;

function parseISO(iso) {
  // Treat the date string as a *calendar date*, anchored at UTC midnight.
  // Avoids local-timezone drift for date-only arithmetic.
  return new Date(iso + 'T00:00:00Z');
}

function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  return isoOf(new Date(parseISO(iso).getTime() + days * MS_PER_DAY));
}

function periodOf(iso) {
  return iso.slice(0, 7); // 'YYYY-MM'
}

function nextPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function isInflow(rule) {
  return rule.type === 'income';
}

function eventFromOccurrence(rule, dateIso) {
  const inflow = isInflow(rule);
  return {
    ruleId: rule.id,
    name: rule.name,
    date: dateIso,
    amount: inflow ? Math.abs(rule.amt) : -Math.abs(rule.amt),
    kind: inflow ? 'income' : 'expense',
    acct: rule.acct,
    ccy: rule.ccy || 'USD',
    cat: rule.cat,
  };
}

/**
 * Enumerate all occurrences of a single rule that fall within
 * [fromDate, toDate). Walks calendar months between the two endpoints
 * and delegates per-month enumeration to `getOccurrences()`.
 *
 * @param {RecurringRule} rule
 * @param {string} fromDate inclusive ISO
 * @param {string} toDate   exclusive ISO
 * @returns {ForecastEvent[]}
 */
export function expandRuleEvents(rule, fromDate, toDate) {
  if (rule.active === false) return [];
  if (!(toDate > fromDate)) return [];

  const events = [];
  const lastPeriod = periodOf(toDate);
  let period = periodOf(fromDate);

  // Cap iterations defensively — even a 10-year horizon is ~120 periods.
  for (let i = 0; i < 240; i++) {
    const occs = getOccurrences(rule, period);
    for (const occ of occs) {
      if (occ >= fromDate && occ < toDate) {
        events.push(eventFromOccurrence(rule, occ));
      }
    }
    if (period === lastPeriod) break;
    period = nextPeriod(period);
  }
  return events;
}

function emptyTotals() {
  return { inflow: 0, outflow: 0, net: 0, count: 0 };
}

function totalsForHorizon(events, fromDate, days) {
  const cutoff = addDays(fromDate, days);
  const totals = emptyTotals();
  for (const e of events) {
    if (e.date >= cutoff) break; // events are sorted ascending
    if (e.amount > 0) totals.inflow += e.amount;
    else totals.outflow += -e.amount;
    totals.count += 1;
  }
  totals.net = totals.inflow - totals.outflow;
  return totals;
}

/**
 * Build a recurring cash-flow forecast.
 *
 * Contract:
 *   - All amounts are returned in each rule's own currency. The caller is
 *     responsible for FX conversion if mixing currencies (see `fx.mjs`).
 *   - Inactive rules (`rule.active === false`) are excluded.
 *   - `events` is sorted ascending by date. Same-day events keep input order.
 *   - `totals` always covers exactly 30, 60, and 90 days regardless of
 *     `horizonDays` — but if `horizonDays < 90`, totals beyond the horizon
 *     are computed from the (necessarily smaller) `events` set, so any
 *     consumer asking for `horizonDays < 30` should treat 60- and 90-day
 *     totals as undercounts.
 *
 * @param {RecurringRule[]} rules
 * @param {string} fromDate ISO 'YYYY-MM-DD' — inclusive lower bound
 * @param {number} [horizonDays=90] — exclusive upper bound in days
 * @returns {CashFlowForecast}
 */
export function buildCashFlowForecast(rules, fromDate, horizonDays = 90) {
  const safeHorizon = Math.max(0, Number(horizonDays) || 0);
  const toDate = addDays(fromDate, safeHorizon);

  const events = [];
  for (const rule of rules || []) {
    if (!rule || !rule.id || !Number.isFinite(rule.amt)) continue;
    events.push(...expandRuleEvents(rule, fromDate, toDate));
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    fromDate,
    toDate,
    horizonDays: safeHorizon,
    events,
    totals: {
      30: totalsForHorizon(events, fromDate, Math.min(30, safeHorizon)),
      60: totalsForHorizon(events, fromDate, Math.min(60, safeHorizon)),
      90: totalsForHorizon(events, fromDate, Math.min(90, safeHorizon)),
    },
  };
}
