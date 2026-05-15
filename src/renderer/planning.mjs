import { getDaysInPeriod } from './period.mjs';

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function billKey(bill) {
  return `${bill.name}|${bill.day}|${bill.acct}`;
}

export function getBillDueDate(bill, period) {
  const day = Math.min(Number(bill.day) || 1, getDaysInPeriod(period));
  return `${period}-${String(day).padStart(2, '0')}`;
}

function isBillPaymentFor(tx, bill, dueDate) {
  const expected = billKey(bill);
  if (tx.billKey === expected && tx.date === dueDate) return true;
  return tx.date === dueDate
    && tx.acct === bill.acct
    && tx.cat === bill.cat
    && Math.abs(Math.abs(tx.amt) - bill.amt) < 0.01
    && tx.name === bill.name;
}

export function buildBillRows(bills, transactions, period, todayIso = new Date().toISOString().slice(0, 10)) {
  return [...bills]
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name))
    .map(bill => {
      const dueDate = getBillDueDate(bill, period);
      const paidTx = transactions.find(tx => isBillPaymentFor(tx, bill, dueDate));
      const status = paidTx ? 'paid'
        : dueDate < todayIso ? 'overdue'
        : dueDate === todayIso ? 'due'
        : 'upcoming';
      return {
        ...bill,
        key: billKey(bill),
        dueDate,
        status,
        paidTxId: paidTx?.id || null,
      };
    });
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
