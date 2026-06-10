/**
 * @file Bill / cash-flow calendar projection (CAR-349).
 *
 * The CAR-84 data layer (`forecast.mjs` `projectBalances`) returns
 * per-day-per-account rows over a horizon. The calendar view needs a
 * per-CALENDAR-DAY rollup for a single month: the projected end-of-day
 * total balance across the selected liquid accounts, plus the bill /
 * scheduled events that land on each day (the "bills on due dates" half
 * of the acceptance criteria). This module is the pure transform between
 * the two — no React, no DOM, no I/O.
 *
 * Reuses `projectBalances` output verbatim, so recurrence + FX are already
 * resolved upstream; this only groups and sums.
 */

/**
 * @typedef {Object} CalendarDay
 * @property {string} date     ISO 'YYYY-MM-DD'
 * @property {number} day      day-of-month (1-31)
 * @property {number} balance  projected end-of-day total across accounts
 * @property {number} inflow   sum of positive event amounts that day (>= 0)
 * @property {number} outflow  sum of negative event amounts as positive (>= 0)
 * @property {Array<{name:string, amount:number, kind:string, source:string}>} events
 *                             scheduled items landing this day (one entry per item;
 *                             projectBalances keys events per account, so no cross-account dup)
 * @property {boolean} isRisk  any account overdrawn OR total balance < 0 this day
 */

/**
 * @typedef {Object} CashFlowCalendar
 * @property {string} period          'YYYY-MM'
 * @property {CalendarDay[]} days      one entry per projected day in the month, ascending
 * @property {number} minBalance      lowest end-of-day total in the month
 * @property {string|null} minDate    ISO date of the low point
 * @property {number} billCount       number of days that have at least one event
 */

/**
 * Roll up per-day-per-account projection rows into a single month's calendar.
 *
 * @param {Array<{date:string, accountId:string, projectedBalance:number, events:Array<Object>, isRiskEvent:boolean}>} rows
 *   Rows from `projectBalances`. May be empty.
 * @param {string} period 'YYYY-MM' — only rows whose date starts with this are included.
 * @param {Set<string>|Array<string>|null} [accountIds=null]
 *   When provided, restrict to these account ids. Null = every account in `rows`.
 * @returns {CashFlowCalendar}
 */
export function buildCashFlowCalendar(rows, period, accountIds = null) {
  const allowed = accountIds == null
    ? null
    : (accountIds instanceof Set ? accountIds : new Set(accountIds));

  const empty = { period, days: [], minBalance: 0, minDate: null, billCount: 0 };
  if (!Array.isArray(rows) || rows.length === 0 || !period) return empty;

  // Group rows by date — preserve ascending order (data layer contract).
  const byDate = new Map();
  for (const row of rows) {
    if (!row || !row.date || !row.date.startsWith(period)) continue;
    if (allowed && !allowed.has(row.accountId)) continue;

    let entry = byDate.get(row.date);
    if (!entry) {
      entry = { date: row.date, balance: 0, inflow: 0, outflow: 0, events: [], isRisk: false };
      byDate.set(row.date, entry);
    }
    entry.balance += Number.isFinite(row.projectedBalance) ? row.projectedBalance : 0;
    if (row.isRiskEvent) entry.isRisk = true;
    for (const ev of row.events || []) {
      const amount = Number.isFinite(ev.amount) ? ev.amount : 0;
      if (amount > 0) entry.inflow += amount;
      else entry.outflow += -amount;
      entry.events.push({
        name: ev.name || (ev.kind === 'income' ? 'INCOME' : 'EXPENSE'),
        amount,
        kind: ev.kind || (amount >= 0 ? 'income' : 'expense'),
        source: ev.source || 'recurring',
      });
    }
  }

  const days = Array.from(byDate.values()).map(entry => {
    const balance = roundCents(entry.balance);
    return {
      ...entry,
      day: Number(entry.date.slice(8, 10)),
      balance,
      inflow: roundCents(entry.inflow),
      outflow: roundCents(entry.outflow),
      // A day is risky if any account was overdrawn OR the rounded total dips
      // below 0. Compare the rounded value so the flag matches the displayed
      // balance (a -0.004 residual shouldn't flag a $0.00 day as RISK).
      isRisk: entry.isRisk || balance < 0,
    };
  });

  let minBalance = days.length ? days[0].balance : 0;
  let minDate = days.length ? days[0].date : null;
  let billCount = 0;
  for (const d of days) {
    if (d.balance < minBalance) {
      minBalance = d.balance;
      minDate = d.date;
    }
    if (d.events.length > 0) billCount += 1;
  }

  return { period, days, minBalance, minDate, billCount };
}

function roundCents(value) {
  // `+ 0` normalizes -0 to 0 so a sub-cent-negative residual never renders as "-$0.00".
  return Math.round((value + Number.EPSILON) * 100) / 100 + 0;
}
