import React from 'react';
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS, ACCOUNTS } from './data';

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
    return { ...rest, date: `1970-01-${String(d || 1).padStart(2, '0')}` };
  });
}

export const StoreCtx = React.createContext(null);

export function StoreProvider({ children }) {
  const [txs, setTxs]         = useLS('ledger:tx',      TRANSACTIONS);
  const [catTree, setCatTree]  = useLS('ledger:cats',    CATEGORY_TREE);
  const [budgets, setBudgets]  = useLS('ledger:budgets', BUDGETS);
  const [hidden, setHidden]    = useLS('ledger:hidden',  []);
  const [accounts, setAccounts] = useLS('ledger:accounts', ACCOUNTS);

  React.useEffect(() => {
    // Intentional: txs is read from the initial synchronous localStorage load.
    // Empty deps ensures this runs only once on mount.
    if (txs.some(tx => !tx.date)) {
      setTxs(prev => migrateTransactions(prev));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const transactions = React.useMemo(() => txs.filter(t => !hiddenSet.has(t.id)), [txs, hiddenSet]);

  const accountsWithBalance = React.useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return accounts.map(acct => {
      const acctTxs = transactions.filter(tx => tx.acct === acct.id);
      const balance = acct.openingBal + acctTxs.reduce((s, tx) => s + tx.amt, 0);
      const delta = acctTxs
        .filter(tx => tx.date?.startsWith(thisMonth))
        .reduce((s, tx) => s + tx.amt, 0);
      return { ...acct, balance, delta };
    });
  }, [accounts, transactions]);

  const addTransactions = React.useCallback(incoming => setTxs(prev => {
    const keys = new Set(prev.map(t => `${t.name}|${t.amt}|${t.date}`));
    return [...prev, ...incoming.filter(t => !keys.has(`${t.name}|${t.amt}|${t.date}`))];
  }), [setTxs]);

  const hideTx = React.useCallback(id => setHidden(h => [...h, id]), [setHidden]);

  const addCategory = React.useCallback((pathParts, label) => {
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
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
    const idx = prev.findIndex(a => a.id === acct.id);
    if (idx >= 0) { const next = [...prev]; next[idx] = acct; return next; }
    return [...prev, acct];
  }), [setAccounts]);

  const reset = React.useCallback(() => {
    setTxs(TRANSACTIONS);
    setCatTree(CATEGORY_TREE);
    setBudgets(BUDGETS);
    setAccounts(ACCOUNTS);
    setHidden([]);
  }, [setTxs, setCatTree, setBudgets, setAccounts, setHidden]);

  return (
    <StoreCtx.Provider value={{
      transactions,
      allTransactions: txs,
      setTransactions: setTxs,
      addTransactions,
      hideTx,
      categoryTree: catTree,
      setCategoryTree: setCatTree,
      addCategory,
      budgets,
      setBudgets,
      accounts,
      accountsWithBalance,
      setAccounts,
      addAccount,
      reset,
    }}>
      {children}
    </StoreCtx.Provider>
  );
}

export const useStore = () => React.useContext(StoreCtx);
