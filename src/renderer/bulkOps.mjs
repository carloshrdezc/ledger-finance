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

export function updateTxsInArray(prevTxs, ids, patch) {
  if (!ids || ids.length === 0) return prevTxs;
  if (!patch || Object.keys(patch).length === 0) return prevTxs;
  const idSet = new Set(ids);
  if (!prevTxs.some(tx => idSet.has(tx.id))) return prevTxs;
  return prevTxs.map(tx => idSet.has(tx.id) ? { ...tx, ...patch } : tx);
}

export function convertToTransferInArray(prevTxs, aId, bId, params, transferId) {
  // Mirror the leg shape used by createTransfer in store.jsx for consistency.
  const { fromAcct, toAcct, amtFrom, amtTo, date, fromCcy, toCcy, note } = params;
  const outName = note || ('TRANSFER → ' + toAcct);
  const inName  = note || ('TRANSFER ← ' + fromAcct);
  const outLeg = {
    id: transferId + '_out',
    name: outName,
    amt: -Math.abs(amtFrom),
    date,
    acct: fromAcct,
    ccy: fromCcy || 'USD',
    cat: 'transfer',
    path: [],
    transferId,
    transferPeer: transferId + '_in',
    ...(note ? { note } : {}),
  };
  const inLeg = {
    id: transferId + '_in',
    name: inName,
    amt: Math.abs(amtTo),
    date,
    acct: toAcct,
    ccy: toCcy || 'USD',
    cat: 'transfer',
    path: [],
    transferId,
    transferPeer: transferId + '_out',
    ...(note ? { note } : {}),
  };
  const removedSet = new Set([aId, bId]);
  return [...prevTxs.filter(tx => !removedSet.has(tx.id)), outLeg, inLeg];
}

export function detectTransferPair(visible, selectedIds) {
  if (!selectedIds || selectedIds.size !== 2) return null;
  const matched = visible.filter(tx => selectedIds.has(tx.id));
  if (matched.length !== 2) return null;
  const [a, b] = matched;
  if (Math.abs(a.amt) !== Math.abs(b.amt)) return null;
  if (Math.sign(a.amt) === Math.sign(b.amt)) return null;
  if (a.acct === b.acct) return null;
  if (a.transferId || b.transferId) return null;
  // out = negative leg, inn = positive leg
  const out = a.amt < 0 ? a : b;
  const inn = a.amt < 0 ? b : a;
  return { out, inn };
}
