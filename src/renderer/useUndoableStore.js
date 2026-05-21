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

  return { ...store, deleteTx };
}
