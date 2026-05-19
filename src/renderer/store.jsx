import React from 'react';
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS, ACCOUNTS, BILLS, GOALS, INVESTMENTS, TRADES } from './data';
import {
  addMonths,
  buildBudgetRows,
  filterTransactionsForPeriod,
  formatPeriodLabel,
  monthKey,
} from './period.mjs';
import { buildBillRows, markRecurringPaid as createRecurringPayment, getBillDueDate, slug, createGoalContribution } from './planning.mjs';
import { buildAlertRows } from './alerts.mjs';

function useLS(key, def) {
  const [v, setV] = React.useState(() => {
    try { const s = localStorage.getItem(key); return s !== null ? JSON.parse(s) : def; }
    catch { return def; }
  });
  const set = React.useCallback(u => setV(prev => {
    const next = typeof u === 'function' ? u(prev) : u;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    return next;
  }), [key]);
  return [v, set];
}

function migrateTransactions(txs) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return txs.map(tx => {
    if (tx.date) return tx;
    const { d, ...rest } = tx;
    return { ...rest, date: `${yyyy}-${mm}-${String(d || 1).padStart(2, '0')}` };
  });
}

function migrateBills(bills) {
  return bills.map(b => b.id ? b : {
    ...b,
    id: slug(b.name) + '_' + (b.day || 1) + '_' + (b.acct || ''),
    type: 'expense',
    freq: 'monthly',
    path: b.path || [b.cat || 'bills'],
    ccy: b.ccy || 'USD',
    active: true,
  });
}

export const StoreCtx = React.createContext(null);

export function StoreProvider({ children }) {
  const [txs, setTxs]         = useLS('ledger:tx',      TRANSACTIONS);
  const [catTree, setCatTree]  = useLS('ledger:cats',    CATEGORY_TREE);
  const [budgets, setBudgets]  = useLS('ledger:budgets', BUDGETS);
  const [hidden, setHidden]    = useLS('ledger:hidden',  []);
  const [accounts, setAccounts] = useLS('ledger:accounts', ACCOUNTS);
  const [selectedPeriod, setSelectedPeriod] = useLS('ledger:period', monthKey(new Date()));
  const [bills, setBills] = useLS('ledger:bills', BILLS);
  React.useEffect(() => {
    setBills(prev => migrateBills(prev));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [goals, setGoals] = useLS('ledger:goals', GOALS);
  const [goalContributions, setGoalContributions] = useLS('ledger:goalContributions', []);
  const [budgetStartDay, setBudgetStartDay] = useLS('ledger:budgetStartDay', 1);
  const [investments, setInvestments] = useLS('ledger:investments', INVESTMENTS);
  const [trades, setTrades]           = useLS('ledger:trades', TRADES);
  const [dismissedAlertIds, setDismissedAlertIds] = useLS('ledger:dismissedAlerts', []);

  React.useEffect(() => {
    // Intentional: txs is read from the initial synchronous localStorage load.
    // Empty deps ensures this runs only once on mount.
    if (txs.some(tx => !tx.date)) {
      setTxs(prev => migrateTransactions(prev));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const transactions = React.useMemo(() => txs.filter(t => !hiddenSet.has(t.id)), [txs, hiddenSet]);
  const periodTransactions = React.useMemo(
    () => filterTransactionsForPeriod(transactions, selectedPeriod, budgetStartDay),
    [transactions, selectedPeriod, budgetStartDay],
  );
  const periodLabel = React.useMemo(() => formatPeriodLabel(selectedPeriod, budgetStartDay), [selectedPeriod, budgetStartDay]);
  const budgetRows = React.useMemo(
    () => buildBudgetRows(Array.isArray(budgets) ? budgets : [], transactions, selectedPeriod),
    [budgets, transactions, selectedPeriod],
  );
  const billRows = React.useMemo(
    () => buildBillRows(bills, transactions, selectedPeriod),
    [bills, transactions, selectedPeriod],
  );
  const allAccountsWithBalance = React.useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return accounts
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(acct => {
        const acctTxs = transactions.filter(tx => tx.acct === acct.id);
        const balance = acct.openingBal + acctTxs.reduce((s, tx) => s + tx.amt, 0);
        const delta = acctTxs
          .filter(tx => tx.date?.startsWith(thisMonth))
          .reduce((s, tx) => s + tx.amt, 0);
        return { ...acct, balance, delta };
      });
  }, [accounts, transactions]);

  const accountsWithBalance = React.useMemo(
    () => allAccountsWithBalance.filter(a => !a.archived),
    [allAccountsWithBalance],
  );

  const accountsIncludedInTotals = React.useMemo(
    () => accountsWithBalance.filter(a => a.includeInTotals !== false),
    [accountsWithBalance],
  );

  const alertRowsWithAccounts = React.useMemo(
    () => buildAlertRows({
      billRows,
      budgetRows,
      goals,
      accountsWithBalance,
      investments,
      dismissedAlertIds,
    }),
    [billRows, budgetRows, goals, accountsWithBalance, investments, dismissedAlertIds],
  );

  const addTransactions = React.useCallback(incoming => setTxs(prev => {
    const keys = new Set(prev.map(t => `${t.name}|${t.amt}|${t.date}`));
    return [...prev, ...incoming.filter(t => !keys.has(`${t.name}|${t.amt}|${t.date}`))];
  }), [setTxs]);

  const hideTx = React.useCallback(id => setHidden(h => [...h, id]), [setHidden]);

  const deleteTx = React.useCallback(id => setTxs(prev => prev.filter(tx => tx.id !== id)), [setTxs]);

  const createTransfer = React.useCallback(({ fromAcct, toAcct, amtFrom, amtTo, date, note }) => {
    const id = 'xfer_' + Date.now();
    const fromAcctObj = accounts.find(a => a.id === fromAcct);
    const toAcctObj   = accounts.find(a => a.id === toAcct);
    const outName = note || ('TRANSFER → ' + (toAcctObj?.name   || toAcct));
    const inName  = note || ('TRANSFER ← ' + (fromAcctObj?.name || fromAcct));
    const outLeg = {
      id: id + '_out', name: outName,
      amt: -Math.abs(amtFrom), date, acct: fromAcct,
      ccy: fromAcctObj?.ccy || 'USD',
      cat: 'transfer', path: [],
      transferId: id, transferPeer: id + '_in',
      ...(note ? { note } : {}),
    };
    const inLeg = {
      id: id + '_in', name: inName,
      amt: Math.abs(amtTo), date, acct: toAcct,
      ccy: toAcctObj?.ccy || 'USD',
      cat: 'transfer', path: [],
      transferId: id, transferPeer: id + '_out',
      ...(note ? { note } : {}),
    };
    setTxs(prev => [...prev, outLeg, inLeg]);
  }, [accounts, setTxs]);

  const deleteTransfer = React.useCallback(transferId => {
    setTxs(prev => prev.filter(tx => tx.transferId !== transferId));
  }, [setTxs]);

  const updateTransfer = React.useCallback((transferId, { fromAcct, toAcct, amtFrom, amtTo, date, note }) => {
    setTxs(prev => {
      const legs = prev.filter(tx => tx.transferId === transferId);
      if (legs.length !== 2) return prev;
      const fromLegId = legs.find(l => l.amt < 0)?.id;
      const toLegId   = legs.find(l => l.amt > 0)?.id;
      const fromAcctObj = accounts.find(a => a.id === fromAcct);
      const toAcctObj   = accounts.find(a => a.id === toAcct);
      const outName = note || ('TRANSFER → ' + (toAcctObj?.name   || toAcct));
      const inName  = note || ('TRANSFER ← ' + (fromAcctObj?.name || fromAcct));
      return prev.map(tx => {
        if (tx.id === fromLegId) {
          return {
            ...tx,
            name: outName,
            amt: -Math.abs(amtFrom),
            date,
            acct: fromAcct,
            ccy: fromAcctObj?.ccy || tx.ccy,
            ...(note ? { note } : {}),
          };
        }
        if (tx.id === toLegId) {
          return {
            ...tx,
            name: inName,
            amt: Math.abs(amtTo),
            date,
            acct: toAcct,
            ccy: toAcctObj?.ccy || tx.ccy,
            ...(note ? { note } : {}),
          };
        }
        return tx;
      });
    });
  }, [accounts, setTxs]);

  const updateTx = React.useCallback((id, changes) => setTxs(prev =>
    prev.map(tx => tx.id === id ? { ...tx, ...changes } : tx)
  ), [setTxs]);

  const addCategory = React.useCallback((pathParts, label) => {
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      if (pathParts.length === 0) {
        tree['c_' + Date.now()] = { label };
        return tree;
      }
      let node = tree;
      for (let i = 0; i < pathParts.length; i++) {
        node = i === 0 ? node[pathParts[i]] : (node.children || {})[pathParts[i]];
        if (!node) return prev;
      }
      if (!node.children) node.children = {};
      node.children['c_' + Date.now()] = { label };
      return tree;
    });
  }, [setCatTree]);

  // Walk a path of keys into the tree and apply a mutator function to the
  // leaf parent (so it can rename/remove the leaf key). pathParts[0] is a
  // top-level key; subsequent parts are children keys.
  const renameCategory = React.useCallback((pathParts, newLabel) => {
    if (!pathParts || pathParts.length === 0) return;
    const trimmed = (newLabel || '').trim();
    if (!trimmed) return;
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      let parent = tree;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const next = i === 0 ? parent[pathParts[i]] : (parent.children || {})[pathParts[i]];
        if (!next) return prev;
        parent = next;
      }
      const leafKey = pathParts[pathParts.length - 1];
      const container = pathParts.length === 1 ? parent : (parent.children || {});
      if (!container[leafKey]) return prev;
      container[leafKey] = { ...container[leafKey], label: trimmed };
      return tree;
    });
  }, [setCatTree]);

  const removeCategory = React.useCallback(pathParts => {
    if (!pathParts || pathParts.length === 0) return;
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      let parent = tree;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const next = i === 0 ? parent[pathParts[i]] : (parent.children || {})[pathParts[i]];
        if (!next) return prev;
        parent = next;
      }
      const leafKey = pathParts[pathParts.length - 1];
      const container = pathParts.length === 1 ? parent : (parent.children || {});
      if (!container[leafKey]) return prev;
      delete container[leafKey];
      return tree;
    });
  }, [setCatTree]);

  const addAccount = React.useCallback(acct => setAccounts(prev => {
    if (prev.some(a => a.id === acct.id)) return prev;
    return [...prev, { archived: false, includeInTotals: true, order: prev.filter(a => !a.archived).length, ...acct }];
  }), [setAccounts]);

  const updateAccount = React.useCallback((id, patch) => setAccounts(prev =>
    prev.map(a => a.id === id ? { ...a, ...patch } : a)
  ), [setAccounts]);

  const archiveAccount = React.useCallback(id => setAccounts(prev =>
    prev.map(a => a.id === id ? { ...a, archived: true } : a)
  ), [setAccounts]);

  const deleteAccount = React.useCallback(id => setAccounts(prev => {
    const next = prev.filter(a => a.id !== id);
    let i = 0;
    return next.map(a => a.archived ? a : { ...a, order: i++ });
  }), [setAccounts]);

  const reorderAccounts = React.useCallback(orderedIds => setAccounts(prev => {
    const byId = Object.fromEntries(prev.map(a => [a.id, a]));
    const reordered = orderedIds.filter(id => byId[id]).map((id, i) => ({ ...byId[id], order: i }));
    const untouched = prev.filter(a => !orderedIds.includes(a.id));
    return [...reordered, ...untouched];
  }), [setAccounts]);

  const addRecurring = React.useCallback(rule => {
    const id = slug(rule.name) + '_' + Date.now();
    setBills(prev => [...prev, { ...rule, id, active: rule.active !== false }]);
  }, [setBills]);

  const updateRecurring = React.useCallback((id, patch) => {
    setBills(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }, [setBills]);

  const deleteRecurring = React.useCallback(id => {
    setBills(prev => prev.filter(b => b.id !== id));
  }, [setBills]);

  const markRecurringPaid = React.useCallback((rule, occurrenceDate) => {
    const tx = createRecurringPayment(rule, occurrenceDate);
    setTxs(prev => {
      if (prev.some(ex => ex.billKey === tx.billKey)) return prev;
      return [...prev, tx];
    });
  }, [setTxs]);

  const markBillPaid = React.useCallback(bill => {
    const occDate = getBillDueDate(bill, selectedPeriod);
    markRecurringPaid(bill, occDate);
  }, [markRecurringPaid, selectedPeriod]);

  const contributeToGoal = React.useCallback((goalId, details) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const result = createGoalContribution(goal, details);
    setGoals(prev => prev.map(g => g.id === goalId ? result.goal : g));
    setGoalContributions(prev => prev.some(c => c.id === result.contribution.id) ? prev : [...prev, result.contribution]);
    setTxs(prev => prev.some(tx => tx.id === result.transaction.id) ? prev : [...prev, result.transaction]);
  }, [goals, setGoals, setGoalContributions, setTxs]);

  const addGoal = React.useCallback(({ name, target, targetDate }) => {
    const id = 'g_' + Date.now();
    const goal = {
      id,
      name: (name || '').trim().toUpperCase(),
      target: Math.max(0, Number(target) || 0),
      current: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      ...(targetDate ? { targetDate } : {}),
    };
    setGoals(prev => [...prev, goal]);
    return goal;
  }, [setGoals]);

  const updateGoal = React.useCallback((id, patch) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  }, [setGoals]);

  const deleteGoal = React.useCallback(id => {
    setGoals(prev => prev.filter(g => g.id !== id));
    setGoalContributions(prev => prev.filter(c => c.goalId !== id));
  }, [setGoals, setGoalContributions]);

  const addBudget = React.useCallback(({ cat, limit, rollover }) => {
    const entry = {
      cat,
      limit: Math.max(0, Number(limit) || 0),
      spent: 0,
      ...(rollover != null ? { rollover: Number(rollover) || 0 } : {}),
    };
    setBudgets(prev => prev.some(b => b.cat === cat) ? prev : [...prev, entry]);
    return entry;
  }, [setBudgets]);

  const updateBudget = React.useCallback((cat, patch) => {
    setBudgets(prev => prev.map(b => b.cat === cat ? { ...b, ...patch } : b));
  }, [setBudgets]);

  const removeBudget = React.useCallback(cat => {
    setBudgets(prev => prev.filter(b => b.cat !== cat));
  }, [setBudgets]);

  const goToPreviousPeriod = React.useCallback(() => {
    setSelectedPeriod(period => addMonths(period, -1));
  }, [setSelectedPeriod]);

  const goToNextPeriod = React.useCallback(() => {
    setSelectedPeriod(period => addMonths(period, 1));
  }, [setSelectedPeriod]);

  const addTrade = React.useCallback(trade => {
    const newTrade = { ...trade, id: 'tr_' + Date.now() };
    setTrades(prev => [...prev, newTrade]);
    setInvestments(prev => {
      const shareDelta = trade.type === 'buy' ? trade.shares : -trade.shares;
      const existing = prev.find(h => h.ticker === trade.ticker);
      if (existing) {
        return prev.map(h => h.ticker === trade.ticker ? { ...h, shares: h.shares + shareDelta } : h);
      }
      return [...prev, { ticker: trade.ticker, name: trade.ticker, shares: shareDelta, price: trade.price, chg: 0 }];
    });
  }, [setTrades, setInvestments]);

  const updateHolding = React.useCallback((ticker, fields) => {
    setInvestments(prev => prev.map(h => h.ticker === ticker ? { ...h, ...fields } : h));
  }, [setInvestments]);

  const removeHolding = React.useCallback(ticker => {
    setInvestments(prev => prev.filter(h => h.ticker !== ticker));
    setTrades(prev => prev.filter(t => t.ticker !== ticker));
  }, [setInvestments, setTrades]);

  const dismissAlert = React.useCallback(id => {
    setDismissedAlertIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, [setDismissedAlertIds]);

  const restoreAlerts = React.useCallback(() => {
    setDismissedAlertIds([]);
  }, [setDismissedAlertIds]);

  const reset = React.useCallback(() => {
    setTxs([]);
    setCatTree({});
    setBudgets([]);
    setAccounts([]);
    setBills([]);
    setGoals([]);
    setGoalContributions([]);
    setSelectedPeriod(monthKey(new Date()));
    setHidden([]);
    setBudgetStartDay(1);
    setInvestments([]);
    setTrades([]);
    setDismissedAlertIds([]);
  }, [setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades, setDismissedAlertIds]);

  return (
    <StoreCtx.Provider value={{
      transactions,
      periodTransactions,
      allTransactions: txs,
      setTransactions: setTxs,
      addTransactions,
      hideTx,
      deleteTx,
      createTransfer,
      updateTransfer,
      deleteTransfer,
      updateTx,
      categoryTree: catTree,
      setCategoryTree: setCatTree,
      addCategory,
      renameCategory,
      removeCategory,
      budgets,
      setBudgets,
      addBudget,
      updateBudget,
      removeBudget,
      budgetRows,
      bills,
      setBills,
      billRows,
      alertRows: alertRowsWithAccounts,
      dismissedAlertIds,
      dismissAlert,
      restoreAlerts,
      markBillPaid,
      addRecurring,
      updateRecurring,
      deleteRecurring,
      markRecurringPaid,
      goals,
      setGoals,
      goalContributions,
      setGoalContributions,
      contributeToGoal,
      addGoal,
      updateGoal,
      deleteGoal,
      selectedPeriod,
      setSelectedPeriod,
      periodLabel,
      goToPreviousPeriod,
      goToNextPeriod,
      accounts,
      accountsWithBalance,
      accountsIncludedInTotals,
      allAccountsWithBalance,
      setAccounts,
      addAccount,
      updateAccount,
      archiveAccount,
      deleteAccount,
      reorderAccounts,
      reset,
      budgetStartDay,
      setBudgetStartDay,
      investments,
      setInvestments,
      trades,
      addTrade,
      updateHolding,
      removeHolding,
    }}>
      {children}
    </StoreCtx.Provider>
  );
}

export const useStore = () => React.useContext(StoreCtx);
