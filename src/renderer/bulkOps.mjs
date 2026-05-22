// Pure array transformations for bulk transaction operations.
// See docs/superpowers/specs/2026-05-21-car-82-bulk-select-design.md
//
// All functions are referentially transparent. Inputs are never mutated;
// outputs are new arrays. Each function returns the original input unchanged
// when there's nothing to do (so React setters can skip re-renders).

export function deleteTxsFromArray(prevTxs, ids) {
  if (!ids || ids.length === 0) return prevTxs;
  const idSet = new Set(ids);
  if (!prevTxs.some(tx => idSet.has(tx.id))) return prevTxs;
  return prevTxs.filter(tx => !idSet.has(tx.id));
}

export function hideIdsToArray(prevHidden, ids) {
  if (!ids || ids.length === 0) return prevHidden;
  const have = new Set(prevHidden);
  const additions = [];
  for (const id of ids) {
    if (!have.has(id)) {
      have.add(id);
      additions.push(id);
    }
  }
  if (additions.length === 0) return prevHidden;
  return [...prevHidden, ...additions];
}
