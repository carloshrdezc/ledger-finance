const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const KIND_RANK = { bill: 0, budget: 1, account: 2, goal: 3, investment: 4 };

function pct(n) {
  return Math.round(n * 100) + '%';
}

function moneyValue(value) {
  return Math.round(Math.abs(Number(value) || 0));
}

function budgetLabel(row) {
  return row.label || row.name || String(row.cat || 'BUDGET').toUpperCase();
}

function compareAlerts(a, b) {
  const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (severity) return severity;
  const kind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (kind) return kind;
  return String(a.sortDate || a.title).localeCompare(String(b.sortDate || b.title));
}

export function buildAlertRows({
  billRows = [],
  budgetRows = [],
  goals = [],
  accountsWithBalance = [],
  investments = [],
  dismissedAlertIds = [],
} = {}, todayIso = new Date().toISOString().slice(0, 10)) {
  const dismissed = new Set(dismissedAlertIds);
  const alerts = [];

  for (const bill of billRows) {
    if (bill.status === 'paid') continue;
    if (!['overdue', 'due'].includes(bill.status)) continue;

    const isOverdue = bill.status === 'overdue';
    alerts.push({
      id: `bill:${bill.key}`,
      kind: 'bill',
      severity: isOverdue ? 'critical' : 'high',
      title: bill.name,
      detail: isOverdue ? `OVERDUE SINCE ${bill.dueDate}` : `DUE TODAY ${todayIso}`,
      metric: moneyValue(bill.amt),
      action: 'PAY',
      route: 'bills',
      sortDate: bill.dueDate,
    });
  }

  for (const row of budgetRows) {
    const available = Math.max(Number(row.available) || Number(row.limit) || 0, 1);
    const spent = Math.max(Number(row.spent) || 0, 0);
    const ratio = spent / available;
    if (Number(row.left) < 0) {
      alerts.push({
        id: `budget:${row.cat}:over`,
        kind: 'budget',
        severity: 'critical',
        title: budgetLabel(row),
        detail: 'BUDGET EXCEEDED',
        metric: pct(ratio),
        action: 'REVIEW',
        route: 'budgets',
      });
    } else if (ratio >= 0.9) {
      alerts.push({
        id: `budget:${row.cat}:near`,
        kind: 'budget',
        severity: 'medium',
        title: budgetLabel(row),
        detail: 'NEAR BUDGET LIMIT',
        metric: pct(ratio),
        action: 'REVIEW',
        route: 'budgets',
      });
    }
  }

  for (const account of accountsWithBalance) {
    if (account.type === 'CC') continue;
    if (Number(account.balance) >= 0) continue;
    alerts.push({
      id: `account:${account.id}:negative`,
      kind: 'account',
      severity: 'critical',
      title: account.name,
      detail: 'CASH BALANCE BELOW ZERO',
      metric: moneyValue(account.balance),
      action: 'REVIEW',
      route: 'accounts',
    });
  }

  for (const goal of goals) {
    const target = Math.max(Number(goal.target) || 0, 1);
    const progress = (Number(goal.current) || 0) / target;
    if (progress >= 0.35) continue;
    alerts.push({
      id: `goal:${goal.id}:behind`,
      kind: 'goal',
      severity: 'low',
      title: goal.name,
      detail: 'GOAL NEEDS ATTENTION',
      metric: pct(progress),
      action: 'CONTRIBUTE',
      route: 'goals',
    });
  }

  for (const holding of investments) {
    if (Number(holding.chg) > -3) continue;
    alerts.push({
      id: `investment:${holding.ticker}:drop`,
      kind: 'investment',
      severity: 'medium',
      title: holding.name || holding.ticker,
      detail: `${holding.ticker} DOWN ${Math.abs(holding.chg).toFixed(1)}% TODAY`,
      metric: moneyValue((holding.shares || 0) * (holding.price || 0) * (holding.chg || 0) / 100),
      action: 'REVIEW',
      route: 'investments',
    });
  }

  return alerts
    .filter(alert => !dismissed.has(alert.id))
    .sort(compareAlerts);
}
