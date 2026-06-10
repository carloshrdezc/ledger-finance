// CAR-345: Debt / loan payoff planner engine. Pure logic — NO React, NO DOM.
// Co-located tests live in payoff.test.mjs.
//
// Models paying down a set of debts using either the "snowball" (smallest
// balance first) or "avalanche" (highest APR first) strategy. Every debt
// always receives at least its minimum payment; the strategy's current
// "focus" debt additionally receives the extra monthly budget PLUS the
// minimum payments freed up by debts that have already been paid off
// (the classic debt-snowball rollover).
//
// Monthly interest accrues as balance * (apr / 100 / 12). Pathological inputs
// (a minimum payment that never overcomes the monthly interest) are guarded
// by an iteration cap; rather than looping forever the engine returns
// `neverPaysOff: true`.

const MAX_MONTHS = 1200; // 100 years — the hard iteration cap.
const EPSILON = 0.005;   // sub-cent residue counts as paid off.

function toNum(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

// Normalize an arbitrary debt-like object into the shape the engine uses.
function normalizeDebt(d) {
  return {
    id: d?.id,
    name: d?.name ?? '',
    balance: Math.max(0, toNum(d?.balance)),
    apr: Math.max(0, toNum(d?.apr)),
    minPayment: Math.max(0, toNum(d?.minPayment)),
  };
}

// Return debts sorted into the order the strategy attacks them. Snowball =
// smallest balance first; avalanche = highest APR first. Ties fall back to the
// other metric, then to the original array order, so the result is
// deterministic. Does not mutate the input array.
export function payoffOrder(debts, strategy) {
  const list = (debts || []).map((d, i) => ({ d: normalizeDebt(d), i }));
  const cmp = strategy === 'avalanche'
    ? (a, b) => (b.d.apr - a.d.apr) || (a.d.balance - b.d.balance) || (a.i - b.i)
    : (a, b) => (a.d.balance - b.d.balance) || (b.d.apr - a.d.apr) || (a.i - b.i);
  return list.sort(cmp).map(x => x.d);
}

// Add `months` whole months to a 'YYYY-MM' or 'YYYY-MM-DD' string and return
// 'YYYY-MM'. month 0 = the start month itself.
function addMonths(startIso, months) {
  const parts = String(startIso).slice(0, 7).split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10); // 1-based
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  // month index 1 = first payment lands in the start month.
  const total = (year * 12 + (month - 1)) + Math.max(0, months - 1);
  year = Math.floor(total / 12);
  month = (total % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Compute a month-by-month amortization schedule.
 *
 * @param {Array} rawDebts  list of { id, name, balance, apr, minPayment }
 * @param {'snowball'|'avalanche'} strategy
 * @param {number} extraPayment  monthly budget ABOVE the sum of minimums
 * @param {{ startDate?: string }} [opts]
 * @returns {{
 *   strategy: string,
 *   neverPaysOff: boolean,
 *   totalMonths: number,
 *   totalInterest: number,
 *   payoffMonthIndex: number,   // 1-based; 0 when nothing to pay
 *   payoffDate: string|null,    // 'YYYY-MM' or null when no startDate
 *   series: number[],           // remaining TOTAL balance per month (incl. month 0 = start)
 *   debts: Array<{ id, name, payoffMonthIndex, totalInterest, schedule }>,
 * }}
 */
export function computePayoff(rawDebts, strategy = 'snowball', extraPayment = 0, opts = {}) {
  const ordered = payoffOrder(rawDebts, strategy);
  const extra = Math.max(0, toNum(extraPayment));
  const startDate = opts.startDate || null;

  // Per-debt working state, kept in attack order.
  const state = ordered.map(d => ({
    id: d.id,
    name: d.name,
    apr: d.apr,
    minPayment: d.minPayment,
    balance: d.balance,
    paidOff: d.balance <= EPSILON,
    payoffMonthIndex: d.balance <= EPSILON ? 0 : null,
    totalInterest: 0,
    schedule: [],
  }));

  const startingTotal = state.reduce((s, x) => s + x.balance, 0);
  const series = [round2(startingTotal)];

  if (startingTotal <= EPSILON) {
    return {
      strategy,
      neverPaysOff: false,
      totalMonths: 0,
      totalInterest: 0,
      payoffMonthIndex: 0,
      payoffDate: startDate ? addMonths(startDate, 1) : null,
      series,
      debts: state.map(s => ({
        id: s.id, name: s.name, payoffMonthIndex: 0, totalInterest: 0, schedule: [],
      })),
    };
  }

  let month = 0;
  let neverPaysOff = false;

  while (true) {
    const remainingBefore = state.reduce((s, x) => s + x.balance, 0);
    if (remainingBefore <= EPSILON) break;
    if (month >= MAX_MONTHS) { neverPaysOff = true; break; }
    month += 1;

    // 1. Accrue interest on every active debt.
    for (const s of state) {
      if (s.balance <= EPSILON) continue;
      const interest = s.balance * (s.apr / 100 / 12);
      s.balance += interest;
      s.totalInterest += interest;
      s._monthInterest = interest;
    }

    // 2. Build this month's payment pool: extra budget + minimums freed by
    //    debts that are already cleared.
    let pool = extra;
    for (const s of state) {
      if (s.balance <= EPSILON && s.paidOff) pool += s.minPayment;
    }

    // 3. Pay each active debt its minimum (capped at the outstanding balance).
    const monthPay = new Map();
    for (const s of state) {
      if (s.balance <= EPSILON) { monthPay.set(s, 0); continue; }
      const pay = Math.min(s.minPayment, s.balance);
      s.balance -= pay;
      monthPay.set(s, pay);
    }

    // 4. Funnel the pool into the focus debt (first un-cleared in attack
    //    order), cascading any leftover to the next debt.
    for (const s of state) {
      if (pool <= EPSILON) break;
      if (s.balance <= EPSILON) continue;
      const pay = Math.min(pool, s.balance);
      s.balance -= pay;
      pool -= pay;
      monthPay.set(s, (monthPay.get(s) || 0) + pay);
    }

    // 5. Detect progress: if nobody's balance moved this is a stall → guard.
    const remainingAfter = state.reduce((s, x) => s + x.balance, 0);
    const totalPaid = Array.from(monthPay.values()).reduce((a, b) => a + b, 0);
    const interestThisMonth = state.reduce((s, x) => s + (x._monthInterest || 0), 0);

    // 6. Record per-debt schedule rows + mark fresh payoffs.
    for (const s of state) {
      if (s.balance <= EPSILON && !s.paidOff) {
        s.balance = 0;
        s.paidOff = true;
        s.payoffMonthIndex = month;
      }
      s.schedule.push({
        month,
        interest: round2(s._monthInterest || 0),
        payment: round2(monthPay.get(s) || 0),
        endingBalance: round2(s.balance),
      });
      s._monthInterest = 0;
    }

    series.push(round2(remainingAfter));

    // Stall guard: total balance didn't shrink and we made no net progress.
    if (remainingAfter >= remainingBefore - EPSILON && totalPaid <= interestThisMonth + EPSILON) {
      // Continue accruing until the cap so neverPaysOff is reported, but avoid
      // unbounded growth blowing up — keep looping to the cap (cheap, ≤1200).
      // The MAX_MONTHS check at the top terminates it.
      continue;
    }
  }

  const totalInterest = state.reduce((s, x) => s + x.totalInterest, 0);
  const payoffMonthIndex = neverPaysOff ? month : month;

  return {
    strategy,
    neverPaysOff,
    totalMonths: month,
    totalInterest: round2(totalInterest),
    payoffMonthIndex,
    payoffDate: startDate ? addMonths(startDate, month) : null,
    series,
    debts: state.map(s => ({
      id: s.id,
      name: s.name,
      payoffMonthIndex: s.payoffMonthIndex,
      totalInterest: round2(s.totalInterest),
      schedule: s.schedule,
    })),
  };
}

// Run BOTH strategies and report which one pays less total interest. Ties (and
// the "never pays off" case) default to avalanche, the mathematically optimal
// interest-minimizing strategy.
export function comparePayoff(rawDebts, extraPayment = 0, opts = {}) {
  const snowball = computePayoff(rawDebts, 'snowball', extraPayment, opts);
  const avalanche = computePayoff(rawDebts, 'avalanche', extraPayment, opts);
  const interestSaved = round2(snowball.totalInterest - avalanche.totalInterest);
  const recommended = avalanche.totalInterest <= snowball.totalInterest ? 'avalanche' : 'snowball';
  return { snowball, avalanche, recommended, interestSaved };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
