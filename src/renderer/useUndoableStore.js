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
      undo: () => store.setAccounts(prev =>
        prev.map(a => a.id === id ? { ...a, archived: false } : a)
      ),
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

  return {
    ...store,
    deleteTx, hideTx, deleteTransfer,
    archiveAccount, deleteAccount,
    deleteRecurring,
    removeBudget,
    deleteGoal,
  };
}
