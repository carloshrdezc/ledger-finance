const EUR_TO_USD = 1.08;

function toUsd(amount, ccy = 'USD') {
  return ccy === 'USD' ? amount : amount * EUR_TO_USD;
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

export function getRecentPeriods(selectedPeriod, count = 6) {
  const [year, month] = selectedPeriod.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(year, month - count + i, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function buildCategoryTrend(transactions, periods, limit = 6) {
  const totals = new Map();
  for (const tx of transactions) {
    if (tx.amt >= 0) continue;
    const period = txPeriod(tx);
    if (!periods.includes(period)) continue;
    const cat = txCategory(tx);
    if (!totals.has(cat)) totals.set(cat, Object.fromEntries(periods.map(p => [p, 0])));
    totals.get(cat)[period] += Math.abs(toUsd(tx.amt, tx.ccy));
  }

  return [...totals.entries()]
    .map(([cat, byPeriod]) => {
      const values = periods.map(period => roundCents(byPeriod[period] || 0));
      return { cat, values, total: roundCents(values.reduce((s, v) => s + v, 0)) };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function buildIncomeExpenseSeries(transactions, periods) {
  return periods.map(period => {
    const periodTxs = transactions.filter(tx => txPeriod(tx) === period);
    const income = periodTxs.filter(tx => tx.amt > 0).reduce((s, tx) => s + toUsd(tx.amt, tx.ccy), 0);
    const expense = periodTxs.filter(tx => tx.amt < 0).reduce((s, tx) => s + Math.abs(toUsd(tx.amt, tx.ccy)), 0);
    return {
      period,
      income: roundCents(income),
      expense: roundCents(expense),
      net: roundCents(income - expense),
    };
  });
}

export function buildNetWorthTrend(accounts, transactions, periods) {
  return periods.map(period => {
    const value = accounts.reduce((sum, account) => {
      const opening = toUsd(account.openingBal || 0, account.ccy);
      const delta = transactions
        .filter(tx => tx.acct === account.id && txPeriod(tx) <= period)
        .reduce((s, tx) => s + toUsd(tx.amt, tx.ccy), 0);
      return sum + opening + delta;
    }, 0);
    return { period, value: roundCents(value) };
  });
}

export function buildNetWorthDailyTrend(accounts, transactions, endDateIso, dayCount) {
  const safeCount = Math.max(1, Number(dayCount) || 1);
  const endDate = new Date(`${endDateIso}T00:00:00`);
  return Array.from({ length: safeCount }, (_, i) => {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - (safeCount - 1 - i));
    const iso = date.toISOString().slice(0, 10);
    const value = accounts
      .filter(account => account.archived !== true)
      .reduce((sum, account) => {
        const opening = toUsd(account.openingBal || 0, account.ccy);
        const delta = transactions
          .filter(tx => tx.acct === account.id && tx.date <= iso)
          .reduce((s, tx) => s + toUsd(tx.amt, tx.ccy), 0);
        return sum + opening + delta;
      }, 0);
    return { date: iso, value: roundCents(value) };
  });
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
