import { DEFAULT_RATES, toReportingCurrency } from './fx.mjs';

const INVESTMENT_TYPES = new Set(['INV', 'CRY']);

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inRange(tx, fromDate, toDate) {
  if (!tx || !tx.date) return false;
  if (fromDate && tx.date < fromDate) return false;
  if (toDate && tx.date > toDate) return false;
  return true;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function txKey(tx) {
  return tx?.transferId || tx?.id || null;
}

/**
 * Compute the balance of an account on a given ISO date (txs with date <= asOfDate
 * are applied). When asOfDate is null/undefined the function returns the
 * pre-history balance (just openingBal). Mirrors the convention used by
 * buildNetWorthTrend / buildNetWorthDailyTrend in charts.mjs.
 */
function balanceAsOf(account, transactions, asOfDate, rates, reportingCcy) {
  const opening = isFiniteNumber(account?.openingBal)
    ? toReportingCurrency(account.openingBal, account.ccy || reportingCcy, rates, reportingCcy)
    : 0;
  if (!asOfDate) return opening;
  const delta = transactions
    .filter(tx => tx?.acct === account.id && tx.date && tx.date <= asOfDate)
    .reduce((s, tx) => s + toReportingCurrency(tx.amt || 0, tx.ccy || account.ccy || reportingCcy, rates, reportingCcy), 0);
  return opening + delta;
}

/**
 * Return the ISO date one day before fromDate. Used to compute the
 * period-opening balance: balance at end-of-day BEFORE the period starts.
 */
function dayBefore(isoDate) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function buildTransferGroups(transactions) {
  // Groups transfer legs that share a transferId (or falls back to tx.id).
  // Caveat: when called on a period-filtered tx list, a transfer whose two
  // legs straddle the period boundary (rare — both legs normally share a date)
  // produces an orphan group. The orphan fails the
  // hasInvestment && hasNonInvestment check downstream and is bucketed as
  // a plain transfer instead of a contribution. Acceptable for the current
  // dataset; if same-transfer date-skew becomes common, group over the full
  // tx list and post-filter legs to the period.
  const groups = new Map();
  for (const tx of transactions) {
    if (tx?.cat !== 'transfer') continue;
    const key = txKey(tx);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  return groups;
}

function reportingAmt(tx, account, rates, reportingCcy) {
  const ccy = tx?.ccy || account?.ccy || reportingCcy;
  return toReportingCurrency(tx?.amt || 0, ccy, rates, reportingCcy);
}

/**
 * Attribute a net-worth change into buckets.
 *
 * Returns signed amounts in the requested reporting currency.
 * - contributions: positive transfer inflows into investment accounts from
 *   non-investment accounts
 * - marketGains: residual change in investment account balances after all
 *   investment-account transactions in the period
 * - spending: negative non-transfer transactions
 * - income: positive non-transfer transactions
 * - transfers: all transfer flows, net of contribution inflows
 *
 * @param {Array} accounts
 * @param {Array} transactions
 * @param {string|null|undefined} fromDate inclusive ISO date — null/undefined means "from beginning of history"
 * @param {string|null|undefined} toDate inclusive ISO date — null/undefined collapses the closing balance
 *   to the opening balance (investmentBalanceDelta = 0), which makes marketGains = -investmentTxTotal.
 *   This is intentional: an open-ended toDate has no defined "as-of" point for closing market value.
 *   Callers should pass a concrete toDate (e.g. today) when they want a meaningful marketGains figure.
 * @param {Object<string, number>} [rates=DEFAULT_RATES]
 * @param {string} [reportingCcy='USD']
 * @returns {{ contributions: number, marketGains: number, spending: number, income: number, transfers: number }}
 */
export function attributeNetWorthChange(
  accounts = [],
  transactions = [],
  fromDate,
  toDate,
  rates = DEFAULT_RATES,
  reportingCcy = 'USD',
) {
  const accountById = new Map((accounts || []).map(account => [account.id, account]));
  const periodTxs = (transactions || []).filter(tx => inRange(tx, fromDate, toDate));
  const transferGroups = buildTransferGroups(periodTxs);

  let contributions = 0;
  let spending = 0;
  let income = 0;
  let transfers = 0;
  let investmentTxTotal = 0;
  let investmentBalanceDelta = 0;

  for (const account of accounts || []) {
    if (!INVESTMENT_TYPES.has(account?.type)) continue;

    // Period-boundary balances: opening = balance at end-of-day before fromDate;
    // closing = balance at toDate. This mirrors buildNetWorthTrend's convention
    // and is correct for arbitrary periods, including periods with prior history.
    const openingAsOf = dayBefore(fromDate);
    const open = balanceAsOf(account, transactions, openingAsOf, rates, reportingCcy);
    const close = toDate
      ? balanceAsOf(account, transactions, toDate, rates, reportingCcy)
      : open;
    investmentBalanceDelta += close - open;
  }

  for (const tx of periodTxs) {
    const account = accountById.get(tx.acct);
    const isInvestment = INVESTMENT_TYPES.has(account?.type);
    const amt = reportingAmt(tx, account, rates, reportingCcy);

    if (tx.cat !== 'transfer') {
      if (amt >= 0) income += amt;
      else spending += amt;
      if (isInvestment) investmentTxTotal += amt;
      continue;
    }

    transfers += amt;
    if (isInvestment) investmentTxTotal += amt;
  }

  for (const [groupKey, group] of transferGroups.entries()) {
    const positiveLegs = group.filter(tx => tx.amt > 0);
    if (positiveLegs.length === 0) continue;

    const hasInvestment = group.some(tx => INVESTMENT_TYPES.has(accountById.get(tx.acct)?.type));
    const hasNonInvestment = group.some(tx => !INVESTMENT_TYPES.has(accountById.get(tx.acct)?.type));
    if (!hasInvestment || !hasNonInvestment) continue;

    for (const leg of positiveLegs) {
      const account = accountById.get(leg.acct);
      if (!INVESTMENT_TYPES.has(account?.type)) continue;
      contributions += reportingAmt(leg, account, rates, reportingCcy);
      transfers -= reportingAmt(leg, account, rates, reportingCcy);
    }
  }

  const marketGains = investmentBalanceDelta - investmentTxTotal;

  return {
    contributions: round2(contributions),
    marketGains: round2(marketGains),
    spending: round2(spending),
    income: round2(income),
    transfers: round2(transfers),
  };
}

export function buildNetWorthAttributionFilter(bucket) {
  switch (bucket) {
    case 'contributions':
      return { type: 'transfer', accountType: ['INV', 'CRY'] };
    case 'marketGains':
      // Market gains are a residual (close-open minus tx flow), not transaction-
      // backed — there are no underlying txs to drill into. Returning null
      // disables the click affordance in the breakdown UI.
      return null;
    case 'spending':
      // Spending excludes transfers (transfer-out legs are negative but should
      // not appear here).
      return { type: 'expense', excludeTransfers: true };
    case 'income':
      // Income excludes transfers (transfer-in legs are positive but should
      // not appear here).
      return { type: 'income', excludeTransfers: true };
    case 'transfers':
      return { type: 'transfer' };
    default:
      return null;
  }
}
