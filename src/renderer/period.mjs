const EUR_TO_USD = 1.08;

export function monthKey(value = new Date()) {
  if (typeof value === 'string') return value.slice(0, 7);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
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

function toUsd(amount, ccy = 'USD') {
  return ccy === 'USD' ? amount : amount * EUR_TO_USD;
}

function txBudgetCategory(tx) {
  return (tx.path || [tx.cat])[0];
}

function spentByCategory(transactions, period, cat) {
  return transactions
    .filter(tx => tx.amt < 0 && tx.date?.startsWith(period) && txBudgetCategory(tx) === cat)
    .reduce((sum, tx) => sum + Math.abs(toUsd(tx.amt, tx.ccy)), 0);
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

export function buildBudgetRows(budgets, transactions, selectedPeriod) {
  transactions = transactions.filter(tx => tx.cat !== 'transfer');
  const periods = priorPeriods(transactions, selectedPeriod);
  return budgets.map(budget => {
    const rollover = periods.reduce((sum, period) => {
      const spent = spentByCategory(transactions, period, budget.cat);
      return sum + budget.limit - spent;
    }, 0);
    const spent = spentByCategory(transactions, selectedPeriod, budget.cat);
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
