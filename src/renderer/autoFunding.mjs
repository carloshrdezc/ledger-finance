/**
 * @file Goal auto-funding rules (CAR-347).
 *
 * A per-goal rule that schedules recurring contributions toward a goal. Ledger
 * is a client-only app with no backend scheduler, so — exactly like recurring
 * bills — these rules are not executed silently. This module computes which
 * contributions are DUE (occurrence dates on the rule's cadence that fall after
 * the last funded date, up to and including today). The UI surfaces them and
 * the user applies them with one action (mirroring the bills PAY pattern).
 *
 * Cadence math is delegated to `planning.mjs` `getOccurrences`, so monthly /
 * weekly / biweekly / custom all behave identically to bills. Pure functions —
 * no React, no clock dependency unless the caller passes `todayIso`.
 */

import { getOccurrences } from './planning.mjs';

/**
 * @typedef {Object} AutoFundRule
 * @property {string} id
 * @property {string} goalId
 * @property {number} amount         contribution amount per occurrence (> 0)
 * @property {string} source         account id funds are drawn from
 * @property {'monthly'|'weekly'|'biweekly'|'custom'} [freq]  cadence, default 'monthly'
 * @property {number} [day]          day-of-month (monthly) or day-of-week (weekly)
 * @property {number} [interval]     custom freq interval in days
 * @property {string} [startDate]    anchor for biweekly/custom; also the earliest fundable date
 * @property {boolean} [active]      defaults true; false suppresses
 * @property {string} [lastFundedDate] ISO date of the most recent applied contribution
 */

function periodOf(iso) {
  return iso.slice(0, 7);
}

function nextPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Compute the contribution dates a rule owes between its last funded date
 * (exclusive) and `todayIso` (inclusive).
 *
 * @param {AutoFundRule} rule
 * @param {string} [todayIso] ISO 'YYYY-MM-DD', defaults to the current date
 * @returns {string[]} occurrence dates ascending, each strictly after
 *   lastFundedDate/startDate-floor and <= today
 */
export function computeDueContributions(rule, todayIso = new Date().toISOString().slice(0, 10)) {
  if (!rule || rule.active === false) return [];
  if (!(Number(rule.amount) > 0)) return [];

  // Lower bound (exclusive): the last time we funded, or — if never funded —
  // the day before the rule's startDate so the first occurrence on/after the
  // start is included. Falls back to the start of today's month when neither
  // is set (a fresh monthly rule with no anchor).
  const floor = rule.lastFundedDate || prevDay(rule.startDate) || null;
  const startPeriod = floor ? periodOf(floor) : periodOf(todayIso);
  const endPeriod = periodOf(todayIso);

  const due = [];
  let period = startPeriod;
  for (let i = 0; i < 240; i++) { // cap: ~20 years of months
    for (const occ of getOccurrences(rule, period)) {
      if ((!floor || occ > floor) && occ <= todayIso) {
        if (!rule.startDate || occ >= rule.startDate) due.push(occ);
      }
    }
    if (period === endPeriod) break;
    period = nextPeriod(period);
  }
  return due.sort();
}

function prevDay(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Summarize what a rule owes right now: the due dates, count, and total amount.
 * When `goal` is supplied, the count/total reflect the headroom-clipped plan
 * RUN DUE will actually apply (so the badge can't promise more than it funds);
 * `dates` always lists every owed occurrence.
 *
 * @param {AutoFundRule} rule
 * @param {string} [todayIso]
 * @param {{target:number, current:number}} [goal] optional goal for headroom clipping
 * @returns {{dates:string[], count:number, total:number, nextDate:(string|null)}}
 */
export function summarizeDue(rule, todayIso = new Date().toISOString().slice(0, 10), goal = null) {
  const dates = computeDueContributions(rule, todayIso);
  if (goal) {
    const plan = planAutoFundContributions(goal, rule, dates);
    return {
      dates,
      count: plan.contributions.length,
      total: plan.total,
      nextDate: plan.contributions.length ? plan.contributions[0].date : null,
    };
  }
  const amount = Math.max(0, Number(rule?.amount) || 0);
  return {
    dates,
    count: dates.length,
    total: round2(dates.length * amount),
    nextDate: dates.length ? dates[0] : null,
  };
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100 + 0;
}

/**
 * Plan the concrete contributions a rule should apply for a set of due dates,
 * respecting the goal's remaining headroom so we never over-fund past target.
 *
 * Each record carries a STABLE id (`autofund_<ruleId>_<date>`) — unlike the
 * manual contribution path's timestamped id — so re-running a rule (double
 * click, interrupted run) is idempotent: the store dedupes on these ids and a
 * second run produces no duplicates. Records over the goal's headroom are
 * dropped entirely (no contribution, no ledger transaction), keeping the goal
 * balance, contribution history, and ledger consistent.
 *
 * @param {{id:string, name:string, target:number, current:number}} goal
 * @param {AutoFundRule} rule
 * @param {string[]} dueDates  ascending occurrence dates (from computeDueContributions)
 * @returns {{
 *   contributions: Array<{id, goalId, amount, date, acct, txId}>,
 *   transactions: Array<{id, name, amt, date, cat, path, ccy, acct, goalId, billKey}>,
 *   goalNext: object,
 *   lastFundedDate: (string|null),
 *   total: number,
 * }}
 */
export function planAutoFundContributions(goal, rule, dueDates) {
  const amount = Math.max(0, Number(rule?.amount) || 0);
  const contributions = [];
  const transactions = [];
  let current = Number.isFinite(goal?.current) ? goal.current : 0;
  const target = Number.isFinite(goal?.target) ? goal.target : Infinity;
  let lastFundedDate = null;
  let total = 0;

  for (const date of dueDates || []) {
    const headroom = round2(target - current);
    if (headroom <= 0) break;                 // goal full — stop, fund no further
    const applied = round2(Math.min(amount, headroom));
    if (applied <= 0) break;

    const id = `autofund_${rule.id}_${date}`; // STABLE → idempotent re-runs
    transactions.push({
      id,
      name: `GOAL · ${goal.name}`,
      amt: -applied,
      date,
      // CAR-362: goal funding is money set aside (transfer-like), not income
      // or consumption — tag `savings` so reports/insights exclude it.
      cat: 'savings',
      path: ['savings'],
      ccy: 'USD',
      acct: rule.source || 'chk',
      goalId: goal.id,
      autoFundRuleId: rule.id,
    });
    contributions.push({
      id: `contrib_${id}`,
      goalId: goal.id,
      amount: applied,
      date,
      acct: rule.source || 'chk',
      txId: id,
    });
    current = round2(current + applied);
    total = round2(total + applied);
    lastFundedDate = date;
  }

  return {
    contributions,
    transactions,
    goalNext: { ...goal, current },
    lastFundedDate,
    total,
  };
}
