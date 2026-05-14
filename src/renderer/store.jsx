import React from 'react';
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS } from './data';

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

export const StoreCtx = React.createContext(null);

export function StoreProvider({ children }) {
  const [txs, setTxs]         = useLS('ledger:tx',      TRANSACTIONS);
  const [catTree, setCatTree]  = useLS('ledger:cats',    CATEGORY_TREE);
  const [budgets, setBudgets]  = useLS('ledger:budgets', BUDGETS);
  const [hidden, setHidden]    = useLS('ledger:hidden',  []);

  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const transactions = React.useMemo(() => txs.filter(t => !hiddenSet.has(t.id)), [txs, hiddenSet]);

  const addTransactions = React.useCallback(incoming => setTxs(prev => {
    const keys = new Set(prev.map(t => `${t.name}|${t.amt}|${t.d}`));
    return [...prev, ...incoming.filter(t => !keys.has(`${t.name}|${t.amt}|${t.d}`))];
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

  const reset = React.useCallback(() => {
    setTxs(TRANSACTIONS);
    setCatTree(CATEGORY_TREE);
    setBudgets(BUDGETS);
    setHidden([]);
  }, [setTxs, setCatTree, setBudgets, setHidden]);

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
      reset,
    }}>
      {children}
    </StoreCtx.Provider>
  );
}

export const useStore = () => React.useContext(StoreCtx);
