import { toReportingCurrency } from './fx.mjs';
import { isGoalFunding } from './planning.mjs';

// CAR-348: convert `amount` (in `ccy`) into the user's PRIMARY reporting
// currency. Defaults to 'USD' so existing call sites and tests are unchanged;
// the public builders below thread the user's primary currency through.
function toReporting(amount, ccy, rates, date, reportingCcy = 'USD') {
  return toReportingCurrency(amount, ccy, rates, reportingCcy, date);
}

function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function txPeriod(tx) {
  return tx.date?.slice(0, 7);
}

function txCategory(tx) {
  return (tx.path || [tx.cat])[0];
}

function countedAccount(account) {
  return account.archived !== true && account.includeInTotals !== false;
}

export function getRecentPeriods(selectedPeriod, count = 6) {
  const [year, month] = selectedPeriod.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(year, month - count + i, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function buildCategoryTrend(transactions, periods, limit = 6, rates = { USD: 1 }, reportingCcy = 'USD') {
  const totals = new Map();
  for (const tx of transactions) {
    if (tx.amt >= 0) continue;
    if (isGoalFunding(tx)) continue; // CAR-362: money set aside, not spending
    const period = txPeriod(tx);
    if (!periods.includes(period)) continue;
    const cat = txCategory(tx);
    if (!totals.has(cat)) totals.set(cat, Object.fromEntries(periods.map(p => [p, 0])));
    totals.get(cat)[period] += Math.abs(toReporting(tx.amt, tx.ccy, rates, tx.date, reportingCcy));
  }

  return [...totals.entries()]
    .map(([cat, byPeriod]) => {
      const values = periods.map(period => roundCents(byPeriod[period] || 0));
      return { cat, values, total: roundCents(values.reduce((s, v) => s + v, 0)) };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function buildIncomeExpenseSeries(transactions, periods, rates = { USD: 1 }, reportingCcy = 'USD') {
  return periods.map(period => {
    // CAR-362: exclude goal-funding (savings) txns from BOTH income and expense
    // aggregation — they're money set aside, not income and not consumption.
    const periodTxs = transactions.filter(tx => txPeriod(tx) === period && !isGoalFunding(tx));
    const income = periodTxs.filter(tx => tx.amt > 0).reduce((s, tx) => s + toReporting(tx.amt, tx.ccy, rates, tx.date, reportingCcy), 0);
    const expense = periodTxs.filter(tx => tx.amt < 0).reduce((s, tx) => s + Math.abs(toReporting(tx.amt, tx.ccy, rates, tx.date, reportingCcy)), 0);
    return {
      period,
      income: roundCents(income),
      expense: roundCents(expense),
      net: roundCents(income - expense),
    };
  });
}

export function buildNetWorthTrend(accounts, transactions, periods, rates = { USD: 1 }, reportingCcy = 'USD') {
  return periods.map(period => {
    const value = accounts.reduce((sum, account) => {
      if (!countedAccount(account)) return sum;
      // Opening balances stay at current valuation (date-free) — they're user-entered
      // current numbers, not aggregations of historical txs. Don't thread a date here.
      const opening = toReporting(account.openingBal || 0, account.ccy, rates, undefined, reportingCcy);
      const delta = transactions
        .filter(tx => tx.acct === account.id && txPeriod(tx) <= period)
        .reduce((s, tx) => s + toReporting(tx.amt, tx.ccy, rates, tx.date, reportingCcy), 0);
      return sum + opening + delta;
    }, 0);
    return { period, value: roundCents(value) };
  });
}

export function buildNetWorthDailyTrend(accounts, transactions, endDateIso, dayCount, rates = { USD: 1 }, reportingCcy = 'USD') {
  const safeCount = Math.max(1, Number(dayCount) || 1);
  const endDate = new Date(`${endDateIso}T00:00:00`);
  return Array.from({ length: safeCount }, (_, i) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (safeCount - 1 - i));
    const iso = date.toISOString().slice(0, 10);
    const value = accounts
      .filter(countedAccount)
      .reduce((sum, account) => {
        // Opening balance is current valuation (date-free); only the tx delta below threads tx.date.
        const opening = toReporting(account.openingBal || 0, account.ccy, rates, undefined, reportingCcy);
        const delta = transactions
          .filter(tx => tx.acct === account.id && tx.date <= iso)
          .reduce((s, tx) => s + toReporting(tx.amt, tx.ccy, rates, tx.date, reportingCcy), 0);
        return sum + opening + delta;
      }, 0);
    return { date: iso, value: roundCents(value) };
  });
}

// CAR-350: aggregate inflows/outflows for a Sankey cash-flow diagram.
// Income categories flow into a central hub; the hub flows out to spending
// categories. Any surplus (income > expense) becomes a "SAVINGS" outflow.
// Shape: { nodes: [{ id, label, side, value }], links: [{ source, target, value }] }
// where `side` is 'in' | 'hub' | 'out'. Values are in the reporting currency.
export function buildSankeyFlows(transactions, periods, rates = { USD: 1 }, reportingCcy = 'USD', limit = 8) {
  const HUB = '__hub__';
  const SAVINGS = '__savings__';
  const inflows = new Map();
  const outflows = new Map();

  for (const tx of transactions) {
    if (tx.cat === 'transfer') continue;   // CAR-350: internal movements aren't cash flow
    if (isGoalFunding(tx)) continue;       // CAR-362: goal funding is set-aside savings, not a spend
    if (!periods.includes(txPeriod(tx))) continue;
    const cat = txCategory(tx) || (tx.amt >= 0 ? 'income' : 'other');
    const value = toReporting(tx.amt, tx.ccy, rates, tx.date, reportingCcy);
    if (value > 0) {
      inflows.set(cat, (inflows.get(cat) || 0) + value);
    } else if (value < 0) {
      outflows.set(cat, (outflows.get(cat) || 0) + Math.abs(value));
    }
  }

  const collapse = (map) => {
    const sorted = [...map.entries()]
      .map(([cat, v]) => [cat, roundCents(v)])
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (sorted.length <= limit) return sorted;
    const kept = sorted.slice(0, limit - 1);
    const rest = sorted.slice(limit - 1).reduce((s, [, v]) => s + v, 0);
    kept.push(['__other__', roundCents(rest)]);
    return kept;
  };

  const inEntries = collapse(inflows);
  const outEntries = collapse(outflows);
  const totalIn = roundCents(inEntries.reduce((s, [, v]) => s + v, 0));
  const totalOut = roundCents(outEntries.reduce((s, [, v]) => s + v, 0));

  const nodes = [];
  const links = [];
  for (const [cat, v] of inEntries) {
    nodes.push({ id: `in:${cat}`, label: cat, side: 'in', value: v });
    links.push({ source: `in:${cat}`, target: HUB, value: v });
  }
  nodes.push({ id: HUB, label: 'budget', side: 'hub', value: Math.max(totalIn, totalOut) });
  for (const [cat, v] of outEntries) {
    nodes.push({ id: `out:${cat}`, label: cat, side: 'out', value: v });
    links.push({ source: HUB, target: `out:${cat}`, value: v });
  }

  const surplus = roundCents(totalIn - totalOut);
  if (surplus > 0) {
    nodes.push({ id: SAVINGS, label: 'savings', side: 'out', value: surplus });
    links.push({ source: HUB, target: SAVINGS, value: surplus });
  }

  return { nodes, links, totalIn, totalOut };
}

export function svgLinePath(values, width, height) {
  if (!values.length) return '';
  if (values.length === 1) return `M0.0 ${(height / 2).toFixed(1)} L${width.toFixed(1)} ${(height / 2).toFixed(1)}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value, i) => {
    const x = i * (width / (values.length - 1));
    const y = height - ((value - min) / range) * height;
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}
