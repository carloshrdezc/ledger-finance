/**
 * @file CAR-344 — "Safe to spend" hero metric.
 *
 * Pure-logic helper that answers the one glanceable question "can I afford
 * this?" by reducing the user's liquid money down to the discretionary amount
 * left after the commitments they've already made for the current period:
 * unpaid bills, un-spent budget allocations, and un-funded goal targets.
 *
 * Contract / formula:
 *
 *   safeToSpend = liquidBalance
 *               − unpaidBills        (recurring expenses still due this period)
 *               − budgetRemaining    (un-spent portion of period budgets)
 *               − goalsRemaining      (target − current across active goals)
 *
 * The result is intentionally derived from the SAME shapes the rest of the app
 * already computes (`accountsIncludedInTotals`, `billRows`, `budgetRows`,
 * `goals`) rather than re-deriving from raw transactions. That keeps the hero
 * number provably consistent with the Accounts / Bills / Budgets / Goals
 * surfaces — when a transaction changes those derived rows, this number moves
 * with them.
 *
 * Edge cases:
 *   - No accounts / bills / budgets / goals configured → the corresponding
 *     component is 0; an entirely empty store yields a $0 safe-to-spend.
 *   - Negative result (commitments exceed liquid cash) → returned as-is
 *     (negative). Callers render it in the "negative" color; the number itself
 *     is the honest math, not clamped.
 *   - Budgets that are already overspent (`left < 0`) contribute 0 remaining,
 *     not a negative — the overspend is already reflected in the balance via
 *     the underlying transactions, so counting it again would double-charge.
 *   - Goals already at/over target contribute 0 remaining (never negative).
 *   - Bills already `paid` are excluded — their cash impact is already in the
 *     balance. Only `upcoming` / `due` / `overdue` expense bills are reserved.
 *   - Income-type recurring rules are NOT added back (conservative: only money
 *     in the bank counts toward "safe to spend"; future income is a forecast
 *     concern handled by the cash-flow widget).
 */

function num(value) {
  return Number.isFinite(value) ? value : 0;
}

function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Sum the liquid (already-banked) balance the user can actually spend from.
 *
 * `accounts` is expected to be the `accountsIncludedInTotals` shape (already
 * filtered to non-archived, totals-included accounts, each with a numeric
 * `balance`). A `convert` fn maps an account balance to the reporting
 * currency; defaults to identity so the helper stays unit-testable without FX.
 *
 * @param {Array<{balance:number, ccy?:string}>} accounts
 * @param {(amt:number, ccy?:string) => number} [convert]
 * @returns {number}
 */
export function sumLiquidBalance(accounts, convert = amt => amt) {
  return (Array.isArray(accounts) ? accounts : []).reduce(
    (sum, acct) => sum + num(convert(num(acct?.balance), acct?.ccy)),
    0,
  );
}

/**
 * Sum the still-owed amount of unpaid expense bills for the period.
 *
 * `billRows` is the `buildBillRows` shape — each row has `amt`, `status`, and
 * an optional `type`. Paid rows are excluded; income rows are excluded. `amt`
 * may be stored negative (expense) or positive depending on the rule, so we
 * take the absolute value.
 *
 * @param {Array<{amt:number, status:string, type?:string}>} billRows
 * @param {(amt:number, ccy?:string) => number} [convert]
 * @returns {number}
 */
export function sumUnpaidBills(billRows, convert = amt => amt) {
  return (Array.isArray(billRows) ? billRows : []).reduce((sum, row) => {
    if (!row) return sum;
    if (row.status === 'paid') return sum;
    if (row.type === 'income') return sum;
    const owed = Math.abs(num(convert(num(row.amt), row.ccy)));
    return sum + owed;
  }, 0);
}

/**
 * Sum the un-spent (remaining) portion of period budgets.
 *
 * `budgetRows` is the `buildBudgetRows` shape — each row has `left`
 * (available − spent). Already-overspent budgets (`left < 0`) contribute 0:
 * the overspend is already reflected in the balance, so reserving it again
 * would double-count. Only positive remaining allocations are reserved.
 *
 * @param {Array<{left:number}>} budgetRows
 * @returns {number}
 */
export function sumBudgetRemaining(budgetRows) {
  return (Array.isArray(budgetRows) ? budgetRows : []).reduce((sum, row) => {
    if (!row) return sum;
    return sum + Math.max(0, num(row.left));
  }, 0);
}

/**
 * Sum the un-funded portion of goals (target − current), floored at 0 per goal.
 *
 * @param {Array<{current:number, target:number}>} goals
 * @returns {number}
 */
export function sumGoalsRemaining(goals) {
  return (Array.isArray(goals) ? goals : []).reduce((sum, goal) => {
    if (!goal) return sum;
    const remaining = num(goal.target) - num(goal.current);
    return sum + Math.max(0, remaining);
  }, 0);
}

/**
 * Compute the "safe to spend" hero metric and its component breakdown.
 *
 * @param {Object} input
 * @param {Array} input.accounts        accountsIncludedInTotals shape
 * @param {Array} input.billRows        buildBillRows shape
 * @param {Array} input.budgetRows      buildBudgetRows shape
 * @param {Array} input.goals           raw goals (current/target)
 * @param {(amt:number, ccy?:string) => number} [input.convert] FX → reporting
 * @returns {{
 *   safeToSpend:number,
 *   liquidBalance:number,
 *   unpaidBills:number,
 *   budgetRemaining:number,
 *   goalsRemaining:number,
 *   reserved:number,
 *   isNegative:boolean,
 * }}
 */
export function computeSafeToSpend({ accounts, billRows, budgetRows, goals, convert } = {}) {
  // M1 (CAR-344 review): return FULL-PRECISION component values, do NOT round
  // to cents here. The consuming hero card FX-converts each component
  // (`toReporting(value, 'USD')`) and then `fmtMoney` rounds for display.
  // Rounding in USD *before* that conversion would drift by a sub-cent versus
  // the Accounts/Bills/Budgets screens (which convert-then-round, the
  // net-worth pattern) for any non-USD reporting currency. Keeping precision
  // here makes the breakdown line tie out to the penny in every locale.
  // `isNegative` is derived from a cents-rounded copy so a -0.004-style FP
  // residue never flips the sign / color.
  const liquidBalance = sumLiquidBalance(accounts, convert);
  const unpaidBills = sumUnpaidBills(billRows, convert);
  const budgetRemaining = sumBudgetRemaining(budgetRows);
  const goalsRemaining = sumGoalsRemaining(goals);
  const reserved = unpaidBills + budgetRemaining + goalsRemaining;
  const safeToSpend = liquidBalance - reserved;
  return {
    safeToSpend,
    liquidBalance,
    unpaidBills,
    budgetRemaining,
    goalsRemaining,
    reserved,
    isNegative: roundCents(safeToSpend) < 0,
  };
}
