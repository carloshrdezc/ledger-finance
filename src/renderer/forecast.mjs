/**
 * @file Daily liquid-account cash-flow projection.
 *
 * Pure helper for forecasting projected balances from the current account
 * snapshot, future one-off transactions, and recurring rules. The consumer
 * can use the returned per-day/per-account rows to render charts, risk
 * highlights, or summary widgets.
 *
 * Contract:
 *   - `accounts` is expected to follow the `accountsWithBalance` shape from
 *     `store.jsx`.
 *   - Only liquid accounts are included by default: type `CHK` and `SAV`.
 *   - Non-USD accounts are skipped rather than FX-converted. That keeps the
 *     projection deterministic until FX rules become a follow-up setting.
 *   - `transactions` and recurring-rule events are applied only when their
 *     dates fall within `[fromDate, fromDate + daysAhead)`.
 *   - Output rows are ordered by date, then by account order in the input.
 *   - `isRiskEvent` is a simple hard floor at $0 for now; thresholding should
 *     become a configurable setting in a follow-up.
 */

import { buildCashFlowForecast } from './cashFlowForecast.mjs';

const MS_PER_DAY = 86400000;
const LIQUID_TYPES = new Set(['CHK', 'SAV']);

function parseISO(iso) {
  return new Date(iso + 'T00:00:00Z');
}

function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  return isoOf(new Date(parseISO(iso).getTime() + days * MS_PER_DAY));
}

function isLiquidAccount(account) {
  return Boolean(
    account &&
    LIQUID_TYPES.has(account.type) &&
    (account.ccy == null || account.ccy === 'USD')
  );
}

function buildEvent(date, amount, source) {
  return {
    date,
    amount,
    ...source,
  };
}

function normalizeTransaction(tx) {
  if (!tx || !tx.date || !Number.isFinite(tx.amt)) return null;
  return buildEvent(tx.date, tx.amt, {
    kind: tx.amt >= 0 ? 'income' : 'expense',
    source: 'transaction',
    txId: tx.id || null,
    acct: tx.acct,
    ruleId: null,
    name: tx.name,
    ccy: tx.ccy || 'USD',
    cat: tx.cat,
  });
}

/**
 * Project per-day balances for liquid accounts.
 *
 * @param {Array<{id:string,balance:number,type?:string,ccy?:string}>} accounts
 * @param {Array<Object>} transactions
 * @param {Array<Object>} recurringRules
 * @param {string} fromDate ISO 'YYYY-MM-DD' inclusive start date
 * @param {number} [daysAhead=90] number of days to project forward
 * @returns {Array<{date:string, accountId:string, projectedBalance:number, events:Array<Object>, isRiskEvent:boolean}>}
 */
export function projectBalances(accounts, transactions, recurringRules, fromDate, daysAhead = 90) {
  const horizon = Math.max(0, Number(daysAhead) || 0);
  if (!fromDate || horizon === 0) return [];

  const liquidAccounts = (Array.isArray(accounts) ? accounts : [])
    .filter(isLiquidAccount)
    .map(account => ({
      ...account,
      balance: Number.isFinite(account.balance) ? account.balance : 0,
    }));

  if (liquidAccounts.length === 0) return [];

  const toDate = addDays(fromDate, horizon);
  const recurringForecast = buildCashFlowForecast(Array.isArray(recurringRules) ? recurringRules : [], fromDate, horizon);
  const eventsByAccountAndDate = new Map();

  const addToBucket = (accountId, event) => {
    if (!accountId || !event) return;
    const dateBucketKey = `${accountId}|${event.date}`;
    const bucket = eventsByAccountAndDate.get(dateBucketKey) || [];
    bucket.push(event);
    eventsByAccountAndDate.set(dateBucketKey, bucket);
  };

  for (const event of recurringForecast.events) {
    const bucketed = buildEvent(event.date, event.amount, {
      kind: event.kind,
      source: 'recurring',
      txId: null,
      acct: event.acct,
      ruleId: event.ruleId,
      name: event.name,
      ccy: event.ccy || 'USD',
      cat: event.cat,
    });
    addToBucket(event.acct, bucketed);
  }

  for (const tx of Array.isArray(transactions) ? transactions : []) {
    const event = normalizeTransaction(tx);
    if (!event) continue;
    if (event.date < fromDate || event.date >= toDate) continue;
    addToBucket(event.acct, event);
  }

  const balancesByAccount = new Map(liquidAccounts.map(account => [account.id, account.balance]));
  const rows = [];

  for (let day = 0; day < horizon; day++) {
    const date = addDays(fromDate, day);
    for (const account of liquidAccounts) {
      const key = `${account.id}|${date}`;
      const dayEvents = eventsByAccountAndDate.get(key) || [];
      const priorBalance = balancesByAccount.get(account.id) || 0;
      const delta = dayEvents.reduce((sum, event) => sum + (Number.isFinite(event.amount) ? event.amount : 0), 0);
      const projectedBalance = priorBalance + delta;
      balancesByAccount.set(account.id, projectedBalance);
      rows.push({
        date,
        accountId: account.id,
        projectedBalance,
        events: dayEvents,
        isRiskEvent: projectedBalance < 0,
      });
    }
  }

  return rows;
}
