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

  return { ...store, deleteTx, hideTx, deleteTransfer };
}
