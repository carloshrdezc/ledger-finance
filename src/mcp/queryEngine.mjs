/**
 * @file Local query engine over a Ledger disk-state snapshot (CAR-352).
 *
 * Pure, read-only query functions over the on-disk state object produced by the
 * Electron main disk-store (`<userData>/ledger-state.json`). That object maps
 * `ledger:*` keys to their raw parsed values, e.g.:
 *   { "ledger:tx": [...], "ledger:accounts": [...], "ledger:budgets": [...], ... }
 *
 * No React, no I/O, no network — the MCP server (server.mjs) reads the file and
 * hands the parsed object here. Keeping the logic pure makes every query unit
 * testable without spawning a process.
 *
 * Self-contained: the portfolio query computes its own average-cost basis so
 * this module has no cross-branch dependency on the renderer analytics.
 */

const K = {
  tx: 'ledger:tx',
  accounts: 'ledger:accounts',
  budgets: 'ledger:budgets',
  goals: 'ledger:goals',
  investments: 'ledger:investments',
  trades: 'ledger:trades',
  currency: 'ledger:currency',
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round((num(v) + Number.EPSILON) * 100) / 100;
}

function arr(state, key) {
  const v = state && state[key];
  return Array.isArray(v) ? v : [];
}

function topCat(tx) {
  if (Array.isArray(tx?.path) && tx.path.length) return String(tx.path[0]);
  return String(tx?.cat || '');
}

function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/**
 * The base currency configured in the app (for labeling; this engine does not
 * FX-convert — amounts are reported in their stored values, like the renderer's
 * pure layers).
 */
export function getCurrency(state) {
  return String(state?.[K.currency] || 'USD');
}

/**
 * List transactions with optional filters.
 *
 * @param {Object} state
 * @param {{from?:string, to?:string, category?:string, merchant?:string,
 *   type?:'expense'|'income'|'all', minAmount?:number, maxAmount?:number,
 *   limit?:number}} [opts]
 * @returns {{count:number, total:number, transactions:Array}}
 */
export function queryTransactions(state, opts = {}) {
  const { from, to, category, merchant, type = 'all', minAmount, maxAmount, limit = 100 } = opts;
  const cat = category ? String(category).toUpperCase() : null;
  const merch = merchant ? String(merchant).toUpperCase() : null;
  let rows = arr(state, K.tx).filter(tx => {
    if (!tx || typeof tx.date !== 'string') return false;
    if (!inRange(tx.date, from, to)) return false;
    const amt = num(tx.amt);
    if (type === 'expense' && amt >= 0) return false;
    if (type === 'income' && amt <= 0) return false;
    if (cat && topCat(tx).toUpperCase() !== cat) return false;
    if (merch && String(tx.name || '').toUpperCase().split(' · ')[0] !== merch) return false;
    if (minAmount != null && Math.abs(amt) < minAmount) return false;
    if (maxAmount != null && Math.abs(amt) > maxAmount) return false;
    return true;
  });
  rows = rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = round2(rows.reduce((s, tx) => s + num(tx.amt), 0));
  const limited = limit > 0 ? rows.slice(0, limit) : rows;
  return { count: rows.length, total, transactions: limited };
}

/**
 * Account balances. Balance = account opening/base balance (if present) plus
 * the sum of its transactions. Mirrors the renderer's accountsWithBalance
 * derivation at a coarse level (no FX conversion).
 *
 * @param {Object} state
 * @returns {{accounts:Array<{id,name,type,balance}>, total:number}}
 */
export function queryAccountBalances(state) {
  const txByAcct = new Map();
  for (const tx of arr(state, K.tx)) {
    const id = tx?.acct;
    if (!id) continue;
    txByAcct.set(id, round2((txByAcct.get(id) || 0) + num(tx.amt)));
  }
  const accounts = arr(state, K.accounts).map(a => {
    const base = num(a.balance ?? a.opening ?? 0);
    const balance = round2(base + (txByAcct.get(a.id) || 0));
    return { id: a.id, name: a.name || a.id, type: a.type || '', balance };
  });
  const total = round2(accounts.reduce((s, a) => s + a.balance, 0));
  return { accounts, total };
}

/**
 * Spending grouped by top-level category over an optional date range.
 * Expenses only (negative amounts), reported as positive magnitudes.
 *
 * @param {Object} state
 * @param {{from?:string, to?:string, limit?:number}} [opts]
 * @returns {{categories:Array<{category:string, spent:number, pct:number}>, total:number}}
 */
export function querySpendingByCategory(state, opts = {}) {
  const { from, to, limit = 50 } = opts;
  const byCat = new Map();
  let total = 0;
  for (const tx of arr(state, K.tx)) {
    const amt = num(tx?.amt);
    if (amt >= 0) continue;
    if (typeof tx.date !== 'string' || !inRange(tx.date, from, to)) continue;
    if (tx.cat === 'transfer') continue;
    const cat = topCat(tx) || 'uncategorized';
    const spent = Math.abs(amt);
    byCat.set(cat, round2((byCat.get(cat) || 0) + spent));
    total = round2(total + spent);
  }
  const categories = [...byCat.entries()]
    .map(([category, spent]) => ({ category, spent, pct: total > 0 ? round2((spent / total) * 100) : 0 }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
  return { categories, total };
}

/**
 * Budget status: each budget's limit vs spending in the given period (defaults
 * to all-time when no range supplied).
 *
 * @param {Object} state
 * @param {{from?:string, to?:string}} [opts]
 * @returns {{budgets:Array<{category, limit, spent, remaining, pctUsed, over:boolean}>}}
 */
export function queryBudgetStatus(state, opts = {}) {
  const { from, to } = opts;
  const spend = querySpendingByCategory(state, { from, to, limit: 1000 });
  const spentByCat = new Map(spend.categories.map(c => [String(c.category).toUpperCase(), c.spent]));
  const budgets = arr(state, K.budgets).map(b => {
    const category = b.cat ?? b.category ?? '';
    const limit = num(b.limit);
    const spent = round2(spentByCat.get(String(category).toUpperCase()) || 0);
    const remaining = round2(limit - spent);
    return {
      category,
      limit,
      spent,
      remaining,
      pctUsed: limit > 0 ? round2((spent / limit) * 100) : 0,
      over: spent > limit,
    };
  });
  return { budgets };
}

/**
 * Goals progress.
 *
 * @param {Object} state
 * @returns {{goals:Array<{name, target, current, pct, remaining, complete:boolean}>}}
 */
export function queryGoals(state) {
  const goals = arr(state, K.goals).map(g => {
    const target = num(g.target);
    const current = num(g.current);
    return {
      name: g.name || g.id,
      target,
      current,
      remaining: round2(Math.max(0, target - current)),
      pct: target > 0 ? round2(Math.min(current / target, 1) * 100) : 0,
      complete: target > 0 && current >= target,
    };
  });
  return { goals };
}

/**
 * Net worth: sum of account balances plus current investment market value.
 *
 * @param {Object} state
 * @returns {{accountsTotal:number, investmentsValue:number, netWorth:number}}
 */
export function queryNetWorth(state) {
  const accountsTotal = queryAccountBalances(state).total;
  const investmentsValue = round2(arr(state, K.investments).reduce((s, h) => s + num(h.shares) * num(h.price), 0));
  return {
    accountsTotal,
    investmentsValue,
    netWorth: round2(accountsTotal + investmentsValue),
  };
}

/**
 * Investment portfolio analytics (self-contained average-cost basis):
 * per-holding gain, allocation by asset class, and portfolio returns.
 *
 * @param {Object} state
 * @returns {{holdings:Array, allocation:Array, returns:Object}}
 */
export function queryPortfolio(state) {
  const investments = arr(state, K.investments);
  const trades = arr(state, K.trades);

  // Average-cost basis per ticker from trade history.
  const basisFor = (ticker) => {
    let shares = 0, costBasis = 0, realizedGain = 0;
    const chron = trades
      .filter(tr => tr && tr.ticker === ticker)
      .slice()
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) ||
        ((a.type === 'sell') - (b.type === 'sell')));
    for (const tr of chron) {
      const qty = num(tr.shares), price = num(tr.price);
      if (tr.type === 'sell') {
        const avg = shares > 0 ? costBasis / shares : 0;
        const sold = Math.min(qty, shares);
        realizedGain += round2(sold * (price - avg));
        costBasis -= round2(sold * avg);
        shares -= sold;
        if (shares < 1e-9) { shares = 0; costBasis = 0; }
      } else {
        shares += qty;
        costBasis += round2(qty * price);
      }
    }
    return { shares: round2(shares), costBasis: round2(costBasis), realizedGain: round2(realizedGain) };
  };

  const holdings = investments.map(h => {
    const shares = num(h.shares), price = num(h.price);
    const value = round2(shares * price);
    const b = basisFor(h.ticker);
    const hasTrades = b.shares > 0 || b.realizedGain !== 0;
    let costBasis;
    if (!hasTrades) costBasis = value;
    else if (b.shares > 0) costBasis = round2((b.costBasis / b.shares) * shares);
    else costBasis = value;
    const unrealizedGain = round2(value - costBasis);
    return {
      ticker: h.ticker,
      name: h.name || h.ticker,
      assetClass: String(h.assetClass || 'Other'),
      shares, price, value, costBasis,
      unrealizedGain,
      unrealizedPct: costBasis > 0 ? round2((unrealizedGain / costBasis) * 100) : 0,
      realizedGain: b.realizedGain,
    };
  });

  // Allocation by asset class.
  const byClass = new Map();
  let totalVal = 0;
  for (const h of holdings) {
    if (h.value <= 0) continue;
    totalVal = round2(totalVal + h.value);
    const c = byClass.get(h.assetClass) || { assetClass: h.assetClass, value: 0, tickers: [] };
    c.value = round2(c.value + h.value);
    c.tickers.push(h.ticker);
    byClass.set(h.assetClass, c);
  }
  const allocation = [...byClass.values()]
    .map(c => ({ ...c, pct: totalVal > 0 ? round2((c.value / totalVal) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);

  // Portfolio returns.
  let value = 0, costBasis = 0, unrealizedGain = 0, realizedGain = 0;
  for (const h of holdings) {
    value = round2(value + h.value);
    costBasis = round2(costBasis + h.costBasis);
    unrealizedGain = round2(unrealizedGain + h.unrealizedGain);
    realizedGain = round2(realizedGain + h.realizedGain);
  }
  let invested = 0, hasAnyTrade = false;
  for (const tr of trades) {
    hasAnyTrade = true;
    const amt = round2(num(tr.shares) * num(tr.price));
    invested = round2(invested + (tr.type === 'sell' ? -amt : amt));
  }
  if (!hasAnyTrade) invested = costBasis;
  const totalGain = round2(unrealizedGain + realizedGain);
  const returns = {
    value, costBasis, invested, unrealizedGain,
    unrealizedPct: costBasis > 0 ? round2((unrealizedGain / costBasis) * 100) : 0,
    realizedGain, totalGain,
    totalReturnPct: invested > 0 ? round2((totalGain / invested) * 100) : 0,
  };

  return { holdings, allocation, returns };
}

/**
 * A compact, machine-readable description of what queries this engine exposes,
 * used to generate the MCP tool list.
 */
export const QUERY_DESCRIPTORS = [
  { name: 'list_transactions', fn: queryTransactions, description: 'List/filter transactions (date range, category, merchant, type, amount).' },
  { name: 'account_balances', fn: (s) => queryAccountBalances(s), description: 'Current balance per account plus the total.' },
  { name: 'spending_by_category', fn: querySpendingByCategory, description: 'Expense totals grouped by top-level category over an optional date range.' },
  { name: 'budget_status', fn: queryBudgetStatus, description: 'Each budget limit vs actual spending, with over-budget flags.' },
  { name: 'goals', fn: (s) => queryGoals(s), description: 'Savings goals with progress toward target.' },
  { name: 'net_worth', fn: (s) => queryNetWorth(s), description: 'Net worth: account balances plus investment market value.' },
  { name: 'portfolio', fn: (s) => queryPortfolio(s), description: 'Investment analytics: per-holding gain, allocation by class, returns.' },
];
