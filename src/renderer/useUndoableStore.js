import React from 'react';
import { useStore } from './store';
import { useUndo } from './UndoContext';

/**
 * Drop-in replacement for useStore() that wraps the 10 destructive setters
 * with undo registrations. All other store fields and setters pass through
 * unchanged.
 *
 * See docs/superpowers/specs/2026-05-21-car-81-undo-redo-design.md
 */
export function useUndoableStore() {
  const store = useStore();
  const stack = useUndo();

  const deleteTx = React.useCallback((id) => {
    const tx = store.allTransactions.find(t => t.id === id);
    if (!tx) return;
    stack.register({
      label: 'Transaction deleted',
      batchKey: 'deleteTx',
      pluralize: (n) => `${n} transactions deleted`,
      do:   () => store.deleteTx(id),
      undo: () => store.setTransactions(prev =>
        prev.some(t => t.id === tx.id) ? prev : [...prev, tx]
      ),
    });
  }, [store, stack]);

  const hideTx = React.useCallback((id) => {
    if (!id) return;
    stack.register({
      label: 'Transaction hidden',
      batchKey: 'hideTx',
      pluralize: (n) => `${n} transactions hidden`,
      do:   () => store.hideTx(id),
      undo: () => store.setHidden(prev => prev.filter(x => x !== id)),
    });
  }, [store, stack]);

  const deleteTransfer = React.useCallback((transferId) => {
    const legs = store.allTransactions.filter(t => t.transferId === transferId);
    if (legs.length === 0) return;
    stack.register({
      label: 'Transfer deleted',
      batchKey: 'deleteTransfer',
      pluralize: (n) => `${n} transfers deleted`,
      do:   () => store.deleteTransfer(transferId),
      undo: () => store.setTransactions(prev => {
        const have = new Set(prev.map(t => t.id));
        const additions = legs.filter(l => !have.has(l.id));
        return additions.length === 0 ? prev : [...prev, ...additions];
      }),
    });
  }, [store, stack]);

  const archiveAccount = React.useCallback((id) => {
    const account = store.accounts.find(a => a.id === id);
    if (!account) return;
    stack.register({
      label: 'Account archived',
      batchKey: 'archiveAccount',
      pluralize: (n) => `${n} accounts archived`,
      do:   () => store.archiveAccount(id),
      undo: () => store.setAccounts(prev => {
        const next = prev.map(a => a.id === id ? { ...a, archived: false } : a);
        // Re-derive `order` for non-archived accounts to keep contiguous numbering.
        // Matches the pattern used by addAccount and restoreAccount.
        let i = 0;
        return next.map(a => a.archived ? a : { ...a, order: i++ });
      }),
    });
  }, [store, stack]);

  const deleteAccount = React.useCallback((id) => {
    const account = store.accounts.find(a => a.id === id);
    if (!account) return;
    // Capture the original index for restoration. `accounts` is the full list
    // (including archived).
    const originalIndex = store.accounts.findIndex(a => a.id === id);
    stack.register({
      label: 'Account deleted',
      batchKey: 'deleteAccount',
      pluralize: (n) => `${n} accounts deleted`,
      do:   () => store.deleteAccount(id),
      undo: () => store.restoreAccount(account, originalIndex),
    });
  }, [store, stack]);

  const deleteRecurring = React.useCallback((id) => {
    const rule = store.bills.find(b => b.id === id);
    if (!rule) return;
    stack.register({
      label: 'Recurring rule deleted',
      batchKey: 'deleteRecurring',
      pluralize: (n) => `${n} recurring rules deleted`,
      do:   () => store.deleteRecurring(id),
      undo: () => store.setBills(prev =>
        prev.some(b => b.id === id) ? prev : [...prev, rule]
      ),
    });
  }, [store, stack]);

  const removeBudget = React.useCallback((cat) => {
    const budget = store.budgets.find(b => b.cat === cat);
    if (!budget) return;
    stack.register({
      label: 'Budget removed',
      batchKey: 'removeBudget',
      pluralize: (n) => `${n} budgets removed`,
      do:   () => store.removeBudget(cat),
      undo: () => store.setBudgets(prev =>
        prev.some(b => b.cat === cat) ? prev : [...prev, budget]
      ),
    });
  }, [store, stack]);

  const deleteGoal = React.useCallback((id) => {
    const goal = store.goals.find(g => g.id === id);
    if (!goal) return;
    const contributions = store.goalContributions.filter(c => c.goalId === id);
    stack.register({
      label: 'Goal deleted',
      batchKey: 'deleteGoal',
      pluralize: (n) => `${n} goals deleted`,
      do:   () => store.deleteGoal(id),
      undo: () => store.restoreGoal(goal, contributions),
    });
  }, [store, stack]);

  const removeCategory = React.useCallback((pathParts) => {
    if (!pathParts || pathParts.length === 0) return;
    // Capture the leaf node (which may be a whole subtree) before removal so we can restore it.
    const tree = store.categoryTree;
    let cursor = tree;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const next = i === 0 ? cursor[pathParts[i]] : (cursor.children || {})[pathParts[i]];
      if (!next) return; // path missing
      cursor = next;
    }
    const leafKey = pathParts[pathParts.length - 1];
    const container = pathParts.length === 1 ? cursor : (cursor.children || {});
    const leaf = container[leafKey];
    if (!leaf) return;

    // Deep-clone the captured leaf so future tree mutations don't aliased-corrupt our undo data.
    const leafSnapshot = JSON.parse(JSON.stringify(leaf));

    stack.register({
      label: 'Category removed',
      batchKey: 'removeCategory',
      pluralize: (n) => `${n} categories removed`,
      do:   () => store.removeCategory(pathParts),
      undo: () => store.restoreCategory(pathParts, leafSnapshot),
    });
  }, [store, stack]);

  const removeHolding = React.useCallback((ticker) => {
    const holding = store.investments.find(h => h.ticker === ticker);
    if (!holding) return;
    const tradesForTicker = store.trades.filter(t => t.ticker === ticker);
    stack.register({
      label: 'Holding removed',
      batchKey: 'removeHolding',
      pluralize: (n) => `${n} holdings removed`,
      do:   () => store.removeHolding(ticker),
      undo: () => store.restoreHolding(holding, tradesForTicker),
    });
  }, [store, stack]);

  // ─── CAR-82 bulk wrappers ────────────────────────────────────────────────
  // batchKey: null on each — these are already batches and must not coalesce.

  const deleteTxs = React.useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const removed = store.allTransactions.filter(t => idSet.has(t.id));
    if (removed.length === 0) return;
    // Extend capture to include orphan transfer legs. If the user deletes one
    // leg of a transfer, both legs are deleted (matches single-row semantics).
    const transferIds = new Set(removed.map(t => t.transferId).filter(Boolean));
    const orphanLegs = transferIds.size === 0 ? [] :
      store.allTransactions.filter(t =>
        t.transferId && transferIds.has(t.transferId) && !idSet.has(t.id)
      );
    const fullCapture = [...removed, ...orphanLegs];
    const fullIds = fullCapture.map(t => t.id);
    stack.register({
      label: fullCapture.length === 1
        ? 'Transaction deleted'
        : `${fullCapture.length} transactions deleted`,
      batchKey: null,
      do:   () => store.deleteTxs(fullIds),
      undo: () => store.setTransactions(prev => {
        const have = new Set(prev.map(t => t.id));
        const additions = fullCapture.filter(t => !have.has(t.id));
        return additions.length === 0 ? prev : [...prev, ...additions];
      }),
    });
  }, [store, stack]);

  const hideTxs = React.useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    const beforeHidden = new Set(store.hidden || []);
    const newlyHidden = ids.filter(id => !beforeHidden.has(id));
    if (newlyHidden.length === 0) return;
    stack.register({
      label: newlyHidden.length === 1
        ? 'Transaction hidden'
        : `${newlyHidden.length} transactions hidden`,
      batchKey: null,
      do:   () => store.hideTxs(newlyHidden),
      undo: () => {
        const undoSet = new Set(newlyHidden);
        store.setHidden(prev => prev.filter(id => !undoSet.has(id)));
      },
    });
  }, [store, stack]);

  const updateTxs = React.useCallback((ids, patch) => {
    if (!ids || ids.length === 0) return;
    if (!patch || Object.keys(patch).length === 0) return;
    const idSet = new Set(ids);
    const before = store.allTransactions
      .filter(t => idSet.has(t.id))
      .map(t => {
        const snap = { id: t.id };
        for (const k of Object.keys(patch)) snap[k] = t[k];
        return snap;
      });
    if (before.length === 0) return;
    stack.register({
      label: before.length === 1
        ? 'Transaction updated'
        : `${before.length} transactions updated`,
      batchKey: null,
      do:   () => store.updateTxs(ids, patch),
      undo: () => store.setTransactions(prev => {
        const byId = Object.fromEntries(before.map(s => [s.id, s]));
        return prev.map(tx => byId[tx.id] ? { ...tx, ...byId[tx.id] } : tx);
      }),
    });
  }, [store, stack]);

  const convertToTransfer = React.useCallback((aId, bId, params) => {
    const a = store.allTransactions.find(t => t.id === aId);
    const b = store.allTransactions.find(t => t.id === bId);
    if (!a || !b) return;
    // Pre-generate the transfer id so do() and undo() share it.
    const transferId = 'xfer_' + Date.now();
    stack.register({
      label: 'Marked as transfer',
      batchKey: null,
      do:   () => store.convertToTransfer(aId, bId, params, transferId),
      undo: () => store.setTransactions(prev => {
        // Remove both new legs (matched by transferId) and re-add originals.
        const without = prev.filter(t => t.transferId !== transferId);
        const haveA = without.some(t => t.id === aId);
        const haveB = without.some(t => t.id === bId);
        const additions = [];
        if (!haveA) additions.push(a);
        if (!haveB) additions.push(b);
        return additions.length === 0 ? without : [...without, ...additions];
      }),
    });
  }, [store, stack]);

  // ─── CAR-80 per-tx bulk update (re-apply rules to existing) ──────────

  const updateTxsIndividually = React.useCallback((perTxPatches) => {
    if (!perTxPatches || perTxPatches.length === 0) return;
    // Capture pre-patch values for each id, only for keys touched by its patch.
    const idMap = new Map(perTxPatches.map(p => [p.id, p.patch]));
    const before = store.allTransactions
      .filter(t => idMap.has(t.id))
      .map(t => {
        const patch = idMap.get(t.id);
        const snap = { id: t.id };
        for (const k of Object.keys(patch)) snap[k] = t[k];
        return snap;
      });
    if (before.length === 0) return;
    stack.register({
      label: before.length === 1
        ? 'Transaction updated by rule'
        : `${before.length} transactions updated by rules`,
      batchKey: null,
      do:   () => store.updateTxsIndividually(perTxPatches),
      undo: () => store.setTransactions(prev => {
        const byId = Object.fromEntries(before.map(s => [s.id, s]));
        return prev.map(tx => byId[tx.id] ? { ...tx, ...byId[tx.id] } : tx);
      }),
    });
  }, [store, stack]);

  return {
    ...store,
    deleteTx, hideTx, deleteTransfer,
    archiveAccount, deleteAccount,
    deleteRecurring,
    removeBudget,
    deleteGoal,
    removeCategory,
    removeHolding,
    // CAR-82 bulk wrappers
    deleteTxs, hideTxs, updateTxs, convertToTransfer,
    // CAR-80 per-tx bulk update
    updateTxsIndividually,
  };
}
