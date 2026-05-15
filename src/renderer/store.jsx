import React from 'react';
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS, ACCOUNTS, BILLS, GOALS } from './data';
import {
  addMonths,
  buildBudgetRows,
  filterTransactionsForPeriod,
  formatPeriodLabel,
  monthKey,
} from './period.mjs';
import { buildBillRows, createBillPaymentTransaction, createGoalContribution } from './planning.mjs';

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

export const StoreCtx = React.createContext(null);

export function StoreProvider({ children }) {
  const [txs, setTxs]         = useLS('ledger:tx',      TRANSACTIONS);
  const [catTree, setCatTree]  = useLS('ledger:cats',    CATEGORY_TREE);
  const [budgets, setBudgets]  = useLS('ledger:budgets', BUDGETS);
  const [hidden, setHidden]    = useLS('ledger:hidden',  []);
  const [accounts, setAccounts] = useLS('ledger:accounts', ACCOUNTS);
  const [selectedPeriod, setSelectedPeriod] = useLS('ledger:period', monthKey(new Date()));
  const [bills, setBills] = useLS('ledger:bills', BILLS);
  const [goals, setGoals] = useLS('ledger:goals', GOALS);
  const [goalContributions, setGoalContributions] = useLS('ledger:goalContributions', []);
  const [budgetStartDay, setBudgetStartDay] = useLS('ledger:budgetStartDay', 1);

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
    () => buildBudgetRows(budgets, transactions, selectedPeriod),
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

  const addAccount = React.useCallback(acct => setAccounts(prev => {
    if (prev.some(a => a.id === acct.id)) return prev;
    return [...prev, { archived: false, order: prev.filter(a => !a.archived).length, ...acct }];
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

  const markBillPaid = React.useCallback(bill => {
    const tx = createBillPaymentTransaction(bill, selectedPeriod);
    setTxs(prev => prev.some(existing => existing.id === tx.id || existing.billKey === tx.billKey && existing.date === tx.date)
      ? prev
      : [...prev, tx]);
  }, [selectedPeriod, setTxs]);

  const contributeToGoal = React.useCallback((goalId, details) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const result = createGoalContribution(goal, details);
    setGoals(prev => prev.map(g => g.id === goalId ? result.goal : g));
    setGoalContributions(prev => prev.some(c => c.id === result.contribution.id) ? prev : [...prev, result.contribution]);
    setTxs(prev => prev.some(tx => tx.id === result.transaction.id) ? prev : [...prev, result.transaction]);
  }, [goals, setGoals, setGoalContributions, setTxs]);

  const goToPreviousPeriod = React.useCallback(() => {
    setSelectedPeriod(period => addMonths(period, -1));
  }, [setSelectedPeriod]);

  const goToNextPeriod = React.useCallback(() => {
    setSelectedPeriod(period => addMonths(period, 1));
  }, [setSelectedPeriod]);

  const reset = React.useCallback(() => {
    setTxs(TRANSACTIONS);
    setCatTree(CATEGORY_TREE);
    setBudgets(BUDGETS);
    setAccounts(ACCOUNTS);
    setBills(BILLS);
    setGoals(GOALS);
    setGoalContributions([]);
    setSelectedPeriod(monthKey(new Date()));
    setHidden([]);
    setBudgetStartDay(1);
  }, [setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setSelectedPeriod, setHidden, setBudgetStartDay]);

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
      deleteTransfer,
      updateTx,
      categoryTree: catTree,
      setCategoryTree: setCatTree,
      addCategory,
      budgets,
      setBudgets,
      budgetRows,
      bills,
      setBills,
      billRows,
      markBillPaid,
      goals,
      setGoals,
      goalContributions,
      setGoalContributions,
      contributeToGoal,
      selectedPeriod,
      setSelectedPeriod,
      periodLabel,
      goToPreviousPeriod,
      goToNextPeriod,
      accounts,
      accountsWithBalance,
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
    }}>
      {children}
    </StoreCtx.Provider>
  );
}

export const useStore = () => React.useContext(StoreCtx);
