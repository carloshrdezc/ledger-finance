// Rule-based auto-categorization for transactions.
// See docs/superpowers/specs/2026-05-21-car-80-rules-design.md
//
// All functions in this module are pure (no React, no side effects). Rules
// are matched against transactions to produce a `cat` and `path` patch.

/**
 * Convert a user-friendly pattern to a case-insensitive RegExp.
 * - Plain text matches as substring: 'STARBUCKS' matches 'SQ *STARBUCKS'.
 * - Trailing * means starts-with: 'STARBUCKS*' matches 'STARBUCKS #4521'.
 * - Leading * means ends-with: '*COFFEE' matches 'BLUE BOTTLE COFFEE'.
 * - Regex metachars in the user's pattern are escaped (so 'AT.T' matches
 *   the literal '.', not "any char").
 */
export function patternToRegExp(pattern) {
  // Detect anchor intent. Bookend `*PATTERN*` is treated as plain substring
  // (no anchors) — the natural "contains" sigil. Anchoring only applies when
  // a wildcard is on exactly one side.
  const trailingStar = pattern.endsWith('*');
  const leadingStar = pattern.startsWith('*');
  const anchorStart = trailingStar && !leadingStar;  // '...PAT*' -> need ^PAT
  const anchorEnd   = leadingStar && !trailingStar;  // '*PAT...' -> need PAT$

  const core = pattern.replace(/^\*+|\*+$/g, '');
  const escaped = core.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  const anchored =
    (anchorStart ? '^' : '') + withWildcards + (anchorEnd ? '$' : '');
  return new RegExp(anchored, 'i');
}

/** Normalize a merchant string for case-insensitive comparison. */
export function normalizeMerchant(name) {
  return (name || '').trim().toUpperCase();
}

/**
 * Compile a rule's match config into a fast matcher function.
 * Returns null if the rule is disabled or has no usable conditions.
 * The returned function takes a tx and returns true if it matches.
 */
export function compileRule(rule) {
  if (!rule || !rule.enabled) return null;
  const m = rule.match;
  if (!m || !m.merchantPattern || !m.merchantPattern.trim()) return null;
  const re = patternToRegExp(m.merchantPattern);

  return (tx) => {
    if (!re.test(normalizeMerchant(tx.name))) return false;
    if (m.amountRange) {
      const abs = Math.abs(tx.amt);
      if (m.amountRange.min != null && abs < m.amountRange.min) return false;
      if (m.amountRange.max != null && abs > m.amountRange.max) return false;
    }
    if (m.accountId && tx.acct !== m.accountId) return false;
    return true;
  };
}

/**
 * Apply the first matching rule's `set` to the tx.
 * Returns a new tx with shallow-merged patch, OR the original tx if no match.
 * Identity preservation: callers can check `if (next === prev) skip` to
 * avoid spurious React renders.
 */
export function applyRules(tx, rules) {
  if (!rules || rules.length === 0) return tx;
  for (const rule of rules) {
    const matcher = compileRule(rule);
    if (!matcher) continue;
    if (matcher(tx)) {
      const path = rule.set && rule.set.path;
      if (!path || path.length === 0) continue;
      return { ...tx, cat: path[0], path };
    }
  }
  return tx;
}

/**
 * Bulk apply for the import flow. Maps each tx through applyRules.
 * Returns input array identity if no tx matched any rule.
 */
export function applyRulesToBatch(txs, rules) {
  if (!rules || rules.length === 0) return txs;
  let changed = false;
  const next = txs.map(tx => {
    const after = applyRules(tx, rules);
    if (after !== tx) changed = true;
    return after;
  });
  return changed ? next : txs;
}

/**
 * Generate a "what would change" preview without mutating anything.
 * Returns an array of { txId, before: {cat, path}, after: {cat, path} } for
 * each tx that would be modified by applying the rules.
 */
export function previewRulesAgainst(txs, rules) {
  if (!rules || rules.length === 0) return [];
  const changes = [];
  for (const tx of txs) {
    const after = applyRules(tx, rules);
    if (after === tx) continue;
    const beforePath = tx.path || [tx.cat];
    const afterPath = after.path;
    if (after.cat === tx.cat && pathsEqual(afterPath, beforePath)) continue;
    changes.push({
      txId: tx.id,
      before: { cat: tx.cat, path: beforePath },
      after:  { cat: after.cat, path: afterPath },
    });
  }
  return changes;
}

function pathsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
