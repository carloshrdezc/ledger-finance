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
