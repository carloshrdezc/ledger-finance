import { getDaysInPeriod } from './period.mjs';

export function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function billKey(bill) {
  return `${bill.name}|${bill.day}|${bill.acct}`;
}

export function getBillDueDate(bill, period) {
  const day = Math.min(Number(bill.day) || 1, getDaysInPeriod(period));
  return `${period}-${String(day).padStart(2, '0')}`;
}

export function getOccurrences(rule, period) {
  const [year, month] = period.split('-').map(Number);
  const daysInMonth = getDaysInPeriod(period);

  if (rule.freq === 'monthly' || !rule.freq) {
    const day = Math.min(rule.day || 1, daysInMonth);
    return [`${period}-${String(day).padStart(2, '0')}`];
  }

  if (rule.freq === 'annual') {
    if (rule.month !== month) return [];
    const day = Math.min(rule.day || 1, daysInMonth);
    return [`${period}-${String(day).padStart(2, '0')}`];
  }

  if (rule.freq === 'weekly') {
    const results = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month - 1, d).getDay() === (rule.day || 0)) {
        results.push(`${period}-${String(d).padStart(2, '0')}`);
      }
    }
    return results;
  }

  // biweekly or custom: all dates = startDate + k*interval for integer k >= 0
  const interval = rule.freq === 'biweekly' ? 14 : Number(rule.interval);
  if (!interval || interval < 1) return [];
  const anchor = new Date((rule.startDate || period + '-01') + 'T00:00:00');
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month - 1, daysInMonth);
  const MS = 86400000;

  const daysFromAnchorToStart = (periodStart - anchor) / MS;
  const kMin = Math.ceil(daysFromAnchorToStart / interval);

  const results = [];
  for (let k = Math.max(0, kMin); ; k++) {
    const d = new Date(anchor.getTime() + k * interval * MS);
    if (d > periodEnd) break;
    const iso = d.toISOString().slice(0, 10);
    if (iso >= `${period}-01`) results.push(iso);
  }
  return results;
}

function isBillPaymentFor(tx, occKey, rule, dueDate) {
  // New format: billKey = ruleId|occurrenceDate
  if (tx.billKey === occKey) return true;
  // Legacy format: name|day|acct
  const legacyKey = `${rule.name}|${rule.day}|${rule.acct}`;
  if (tx.billKey === legacyKey && tx.date === dueDate) return true;
  // Fallback: field-level match for old transactions with no billKey
  return (
    tx.date === dueDate &&
    tx.acct === rule.acct &&
    tx.cat === (rule.cat || 'bills') &&
    Math.abs(Math.abs(tx.amt) - rule.amt) < 0.01 &&
    tx.name === rule.name
  );
}

export function buildBillRows(bills, transactions, period, todayIso = new Date().toISOString().slice(0, 10)) {
  const rows = [];
  for (const rule of bills) {
    if (rule.active === false) continue;
    const occurrences = getOccurrences(rule, period);
    for (const occDate of occurrences) {
      const occKey = `${rule.id}|${occDate}`;
      const paidTx = transactions.find(tx => isBillPaymentFor(tx, occKey, rule, occDate));
      const status = paidTx
        ? 'paid'
        : occDate < todayIso ? 'overdue'
        : occDate === todayIso ? 'due'
        : 'upcoming';
      rows.push({
        ...rule,
        key: occKey,
        dueDate: occDate,
        status,
        paidTxId: paidTx?.id || null,
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function markRecurringPaid(rule, occurrenceDate) {
  return {
    id: `bill_${slug(rule.id || rule.name)}_${occurrenceDate}`,
    name: rule.name,
    amt: rule.type === 'income' ? Math.abs(rule.amt) : -Math.abs(rule.amt),
    date: occurrenceDate,
    cat: rule.cat || (rule.path?.[0]) || 'bills',
    path: rule.path || [rule.cat || 'bills'],
    ccy: rule.ccy || 'USD',
    acct: rule.acct,
    billKey: `${rule.id}|${occurrenceDate}`,
  };
}

export function createBillPaymentTransaction(bill, period) {
  const dueDate = getBillDueDate(bill, period);
  return {
    id: `bill_${slug(bill.name)}_${dueDate}`,
    name: bill.name,
    amt: -Math.abs(bill.amt),
    date: dueDate,
    cat: bill.cat || 'bills',
    path: [bill.cat || 'bills'],
    ccy: bill.ccy || 'USD',
    acct: bill.acct,
    billKey: billKey(bill),
  };
}

export function createGoalContribution(goal, { amount, date, acct = 'chk' }) {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const id = `goal_${goal.id}_${date}_${Math.round(safeAmount * 100)}_${Date.now()}`;
  const transaction = {
    id,
    name: `GOAL · ${goal.name}`,
    amt: -safeAmount,
    date,
    cat: 'income',
    path: ['income'],
    ccy: 'USD',
    acct,
    goalId: goal.id,
  };
  const contribution = {
    id: `contrib_${id}`,
    goalId: goal.id,
    amount: safeAmount,
    date,
    acct,
    txId: transaction.id,
  };
  const goalNext = {
    ...goal,
    current: Math.min(goal.target, goal.current + safeAmount),
  };
  return { goal: goalNext, contribution, transaction };
}
