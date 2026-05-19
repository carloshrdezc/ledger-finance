// Pure helpers for CAR-76's empty first-run state. No React, no I/O.

const SLICES = ['txs', 'accounts', 'bills', 'goals', 'budgets', 'investments', 'trades'];

// True iff every major data slice is empty. The category tree and goal
// contributions are deliberately excluded — modifying the tree is not
// "having data," and contributions are downstream of goals.
export function isAppEmptyFor(state) {
  if (!state || typeof state !== 'object') return true;
  for (const key of SLICES) {
    const slice = state[key];
    if (Array.isArray(slice) && slice.length > 0) return false;
  }
  return true;
}

// True iff `tree` is the unmodified DEFAULT_CAT_TREE shape: the same set of
// top-level keys with no `children` property on any node. Used by
// loadSampleData() to decide whether to overwrite the tree with the full
// demo CATEGORY_TREE, vs preserving the user's customizations.
const DEFAULT_KEYS = [
  'income', 'food', 'dining', 'rent', 'trans',
  'bills', 'shop', 'travel', 'health', 'subs', 'edu',
];

export function isDefaultCatTreeFor(tree) {
  if (!tree || typeof tree !== 'object') return false;
  const keys = Object.keys(tree);
  if (keys.length !== DEFAULT_KEYS.length) return false;
  for (const k of DEFAULT_KEYS) {
    const node = tree[k];
    if (!node) return false;
    if (node.children) return false;
  }
  return true;
}
