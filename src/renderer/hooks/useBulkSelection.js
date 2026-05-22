import React from 'react';

/**
 * Selection state for a list of items with `id` fields.
 * `visible` is the current list (used by `range` and `selectAll` to map
 * indices to ids). The hook does NOT auto-prune stale ids when items
 * disappear from `visible` — stale ids are harmless because callers only
 * consult `isSelected(id)` while rendering rows that are in `visible`.
 *
 * Auto-clearing on context changes (period, filter, search) is the
 * caller's responsibility — see WebTransactions.jsx auto-clear effects.
 */
export default function useBulkSelection(visible) {
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [anchorIdx, setAnchorIdx] = React.useState(null);

  const toggle = React.useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const range = React.useCallback((anchor, target) => {
    if (anchor == null || target == null) return;
    const lo = Math.min(anchor, target);
    const hi = Math.max(anchor, target);
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) {
        const tx = visible[i];
        if (tx) next.add(tx.id);
      }
      return next;
    });
  }, [visible]);

  const selectAll = React.useCallback(() => {
    setSelectedIds(new Set(visible.map(t => t.id)));
  }, [visible]);

  const clear = React.useCallback(() => {
    setSelectedIds(new Set());
    setAnchorIdx(null);
  }, []);

  const isSelected = React.useCallback((id) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    toggle,
    range,
    selectAll,
    clear,
    anchorIdx,
    setAnchor: setAnchorIdx,
  };
}
