import { toReportingCurrency } from './fx.mjs';

export const CURRENT_PERIOD_SENTINEL = '__current__';

export function monthKey(value = new Date()) {
  if (typeof value === 'string') return value.slice(0, 7);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

export function resolvePeriod(period) {
  if (period === CURRENT_PERIOD_SENTINEL) return monthKey(new Date());
  return period;
}

export function addMonths(period, amount) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1 + amount, 1);
  return monthKey(date);
}

export function formatPeriodLabel(period, startDay = 1) {
  if (startDay <= 1) {
    return new Date(`${period}-01T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    }).toUpperCase();
  }
  const [year, month] = period.split('-').map(Number);
  const startDate = new Date(year, month - 1, startDay);
  const endDate = new Date(year, month, startDay - 1);
  const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  return `${startStr} – ${endStr}`;
}

export function formatShortPeriodLabel(period) {
  return new Date(`${period}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
  }).toUpperCase();
}

export function getDaysInPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function filterTransactionsForPeriod(transactions, period, startDay = 1) {
  if (startDay <= 1) return transactions.filter(tx => tx.date?.startsWith(period));
  const [year, month] = period.split('-').map(Number);
  const start = `${period}-${String(startDay).padStart(2, '0')}`;
  const nextPeriod = monthKey(new Date(year, month, 1));
  const end = `${nextPeriod}-${String(startDay - 1).padStart(2, '0')}`;
  return transactions.filter(tx => tx.date >= start && tx.date <= end);
}

// Compute the inclusive [start, end] ISO boundaries that filterTransactionsForPeriod
// uses for a given period + budgetStartDay. Useful when an analytic helper needs
// the explicit window (e.g. net-worth attribution) rather than the filtered list.
export function getPeriodBoundaries(period, startDay = 1) {
  if (startDay <= 1) {
    return {
      start: `${period}-01`,
      end: `${period}-${String(getDaysInPeriod(period)).padStart(2, '0')}`,
    };
  }
  const [year, month] = period.split('-').map(Number);
  const start = `${period}-${String(startDay).padStart(2, '0')}`;
  const nextPeriod = monthKey(new Date(year, month, 1));
  const end = `${nextPeriod}-${String(startDay - 1).padStart(2, '0')}`;
  return { start, end };
}

// Filter transactions to an inclusive [startIso, endIso] range. Both sides
// are 'YYYY-MM-DD'. Either side may be falsy (means open-ended).
export function filterTransactionsForRange(transactions, startIso, endIso) {
  return transactions.filter(tx => {
    if (!tx.date) return false;
    if (startIso && tx.date < startIso) return false;
    if (endIso && tx.date > endIso) return false;
    return true;
  });
}

// Resolve a range preset key into { start, end } ISO date strings.
// Presets are computed against today (UTC-naive). 'thisMonth' / 'lastMonth'
// use the calendar month; the rolling presets count back exact day windows.
export function resolveRangePreset(preset, today = new Date()) {
  const fmt = d => d.toISOString().slice(0, 10);
  const startOfMonth = (y, m) => new Date(y, m, 1);
  const endOfMonth   = (y, m) => new Date(y, m + 1, 0);
  switch (preset) {
    case 'thisMonth': {
      const s = startOfMonth(today.getFullYear(), today.getMonth());
      const e = endOfMonth(today.getFullYear(), today.getMonth());
      return { start: fmt(s), end: fmt(e), label: 'THIS MONTH' };
    }
    case 'lastMonth': {
      const s = startOfMonth(today.getFullYear(), today.getMonth() - 1);
      const e = endOfMonth(today.getFullYear(), today.getMonth() - 1);
      return { start: fmt(s), end: fmt(e), label: 'LAST MONTH' };
    }
    case 'last3': {
      const s = new Date(today); s.setDate(s.getDate() - 89);
      return { start: fmt(s), end: fmt(today), label: 'LAST 90 DAYS' };
    }
    case 'last6': {
      const s = new Date(today); s.setDate(s.getDate() - 179);
      return { start: fmt(s), end: fmt(today), label: 'LAST 6 MONTHS' };
    }
    case 'ytd': {
      const s = new Date(today.getFullYear(), 0, 1);
      return { start: fmt(s), end: fmt(today), label: 'YEAR TO DATE' };
    }
    case 'last12': {
      const s = new Date(today); s.setFullYear(s.getFullYear() - 1); s.setDate(s.getDate() + 1);
      return { start: fmt(s), end: fmt(today), label: 'LAST 12 MONTHS' };
    }
    case 'lastYear': {
      const y = today.getFullYear() - 1;
      const s = new Date(y, 0, 1);
      const e = new Date(y, 11, 31);
      return { start: fmt(s), end: fmt(e), label: String(y) };
    }
    default:
      return null;
  }
}

function txBudgetCategory(tx) {
  return (tx.path || [tx.cat])[0];
}

function spentByCategory(transactions, period, cat, rates) {
  return transactions
    .filter(tx => tx.amt < 0 && tx.date?.startsWith(period) && txBudgetCategory(tx) === cat)
    .reduce((sum, tx) => sum + Math.abs(toReportingCurrency(tx.amt, tx.ccy, rates, 'USD', tx.date)), 0);
}

function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function priorPeriods(transactions, selectedPeriod) {
  const periods = [...new Set(transactions.map(tx => monthKey(tx.date)).filter(Boolean))]
    .filter(period => period < selectedPeriod)
    .sort();
  return periods;
}

export function buildBudgetRows(budgets, transactions, selectedPeriod, rates = { USD: 1 }) {
  transactions = transactions.filter(tx => tx.cat !== 'transfer');
  const periods = priorPeriods(transactions, selectedPeriod);
  return budgets.map(budget => {
    const rollover = periods.reduce((sum, period) => {
      const spent = spentByCategory(transactions, period, budget.cat, rates);
      return sum + budget.limit - spent;
    }, 0);
    const spent = spentByCategory(transactions, selectedPeriod, budget.cat, rates);
    const available = budget.limit + rollover;
    const left = available - spent;
    return {
      ...budget,
      spent: roundCents(spent),
      rollover: roundCents(rollover),
      available: roundCents(available),
      left: roundCents(left),
    };
  });
}
