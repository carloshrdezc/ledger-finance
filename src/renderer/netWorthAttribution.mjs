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

function buildTransferGroups(transactions) {
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
 * @param {string|null|undefined} fromDate inclusive ISO date
 * @param {string|null|undefined} toDate inclusive ISO date
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

    const open = isFiniteNumber(account.openingBal)
      ? toReportingCurrency(account.openingBal, account.ccy || reportingCcy, rates, reportingCcy)
      : 0;
    const close = isFiniteNumber(account.balance)
      ? toReportingCurrency(account.balance, account.ccy || reportingCcy, rates, reportingCcy)
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
      return { accountType: ['INV', 'CRY'] };
    case 'spending':
      return { type: 'expense' };
    case 'income':
      return { type: 'income' };
    case 'transfers':
      return { type: 'transfer' };
    default:
      return null;
  }
}
