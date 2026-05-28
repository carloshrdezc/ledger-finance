import { latestRateEntry } from './fx.mjs';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const KIND_RANK = { bill: 0, budget: 1, account: 2, goal: 3, investment: 4, fx: 5, backup: 6 };

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

// CAR-77: Returns a backup reminder alert if the user hasn't backed up
// within the configured interval, or null. Pure: takes the inputs it
// needs, returns the alert shape used by AlertsHub.
//
// Caller is responsible for app-empty gating — `detectBackupReminder`
// does not know about app state by design (see buildAlertRows below).
export function detectBackupReminder({
  lastBackupAt,
  interval,
  snoozedUntil,
  todayIso,
}) {
  if (!Number.isFinite(interval) || interval <= 0) return null;
  // `>=` so the alert is suppressed THROUGH the snooze date inclusive
  // (a user who picks "snooze until June 1" means "don't bother me on
  // June 1 either"). Comparison is lexical on YYYY-MM-DD which is correct
  // for that format.
  if (snoozedUntil && snoozedUntil >= todayIso) return null;

  const reminder = (detail) => ({
    id: 'backup:reminder',
    kind: 'backup',
    severity: 'low',
    title: 'BACK UP YOUR DATA',
    detail,
    metric: '',
    action: 'BACKUP',
    route: 'settings',
  });

  if (!lastBackupAt) return reminder('NO BACKUP ON RECORD');

  // Both inputs are 'YYYY-MM-DD'. Use UTC midnight to avoid DST drift.
  const ms = Date.parse(todayIso + 'T00:00:00Z') - Date.parse(lastBackupAt + 'T00:00:00Z');
  const days = Math.floor(ms / 86_400_000);

  // Treat unparseable / future dates as "no record" — same UX, never NaN.
  // (Negative `days` happens if `lastBackupAt` is later than today, e.g.
  // clock skew or a corrupted future date — fall through to no-record
  // since we can't trust it.)
  if (!Number.isFinite(days) || days < 0) return reminder('NO BACKUP ON RECORD');

  if (days < interval) return null;

  return reminder(`LAST BACKUP ${days} DAYS AGO`);
}

export function buildAlertRows({
  billRows = [],
  budgetRows = [],
  goals = [],
  accountsWithBalance = [],
  investments = [],
  dismissedAlertIds = [],
  rates = {},
  ratesUpdated = {},
  transactions = [],
  fxMigrationToastSeen = false,
  isAppEmpty = false,
  lastBackupAt = null,
  backupReminderInterval = 30,
  backupReminderSnoozedUntil = null,
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

  // Missing FX rate: every non-USD currency in use must have a confirmed
  // rate. ratesUpdated[ccy] === null/undefined means the rate is the
  // default seed (or auto-seeded 1.0 placeholder); we surface that.
  const usedCcys = new Set();
  for (const a of accountsWithBalance) if (a.ccy && a.ccy !== 'USD') usedCcys.add(a.ccy);
  for (const tx of transactions) if (tx.ccy && tx.ccy !== 'USD') usedCcys.add(tx.ccy);
  for (const ccy of usedCcys) {
    const entry = latestRateEntry(rates, ccy, todayIso);
    const rate = entry?.rate;
    const updated = ratesUpdated[ccy];
    if (rate == null || updated == null) {
      alerts.push({
        id: `fx:missing:${ccy}`,
        kind: 'fx',
        severity: rate == null || rate === 1.0 ? 'medium' : 'low',
        title: `SET FX RATE FOR ${ccy}`,
        detail: rate == null ? 'NO RATE CONFIGURED' : 'USING DEFAULT RATE',
        metric: '',
        action: 'SET',
        route: 'settings',
      });
    }
  }

  // Migration notice: one-time low-severity nudge for users upgrading
  // from the hardcoded-1.08 era who hold non-USD data. Dismiss = mark
  // fxMigrationToastSeen via the store.
  if (!fxMigrationToastSeen && usedCcys.size > 0) {
    alerts.push({
      id: 'fx:migration-notice',
      kind: 'fx',
      severity: 'low',
      title: 'FX RATES NOW CONFIGURABLE',
      detail: 'SET YOUR OWN RATES IN SETTINGS',
      metric: '',
      action: 'OPEN',
      route: 'settings',
    });
  }

  // CAR-77: backup reminder. Suppressed entirely when the app has no data
  // (an empty store has nothing to back up — and would just nag a brand-new
  // user). Otherwise gated by interval/snooze.
  if (!isAppEmpty) {
    const reminder = detectBackupReminder({
      lastBackupAt,
      interval: backupReminderInterval,
      snoozedUntil: backupReminderSnoozedUntil,
      todayIso,
    });
    if (reminder) alerts.push(reminder);
  }

  return alerts
    .filter(alert => !dismissed.has(alert.id))
    .sort(compareAlerts);
}
