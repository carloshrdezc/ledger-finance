// Pure helpers for working with the category tree.
// See docs/superpowers/specs/2026-05-21-car-80-rules-design.md

/**
 * Resolve a category path (array of keys) to a human-readable breadcrumb,
 * walking the tree to substitute labels for keys.
 *
 * Example: formatPath(['food', 'produce'], tree) → "GROCERIES › PRODUCE"
 *
 * Falls back to the uppercased key when a node is missing from the tree.
 */
export function formatPath(path, tree) {
  if (!path || path.length === 0) return '';
  const segments = [];
  let cursor = tree || {};
  for (const key of path) {
    const node = cursor[key];
    if (!node) {
      segments.push(key.toUpperCase());
      break;
    }
    segments.push(node.label || key.toUpperCase());
    cursor = node.children || {};
  }
  return segments.join(' › ');
}
