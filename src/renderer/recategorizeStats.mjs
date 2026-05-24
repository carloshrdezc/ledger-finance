// CAR-182: Pure helpers for the "suggest rule after 3rd identical
// re-categorization" feature. The React-coupled bits (state, callbacks,
// pendingRuleSuggestion signal) live in store.jsx; this module is pure
// data transforms that are trivial to unit test.

import { patternLiteral } from './rules.mjs';

export const SUGGEST_THRESHOLD = 3;
export const DISMISS_LIMIT = 3;

/**
 * Known payment-processor prefixes. When a transaction name starts with one
 * of these followed by `*`, the actual merchant name comes after — using the
 * processor as the stem would collide unrelated merchants under one key
 * (e.g. SQ *COFFEE SHOP and SQ *WINE BAR both as "SQ"), generating overly
 * broad rules that miscategorize future charges.
 *
 * The list is conservative: only well-known processors with a stable
 * `PROCESSOR *MERCHANT` shape. Add cautiously — false positives here
 * mean a real merchant whose name is a known prefix gets mis-stripped.
 */
const PROCESSOR_PREFIXES = new Set([
  'SQ',       // Square
  'TST',      // Toast (TST*MERCHANT)
  'PAYPAL',   // PayPal
  'PP',       // PayPal short form (PP*MERCHANT)
  'IZ',       // Toast iZettle / older Toast format
  'STRIPE',   // Stripe
]);

/**
 * Strip trailing non-letter chars from a token. Preserves dots mid-token
 * (so "AMAZON.COM" survives) but trims trailing dot runs.
 */
function trimToken(token) {
  return token.replace(/[^\p{L}.]+$/u, '').replace(/\.+$/, '');
}

/**
 * Extract a stable "merchant stem" from a raw bank-transaction name.
 *
 * Real-world bank names almost always carry per-charge suffixes (store IDs,
 * dates, transaction codes), e.g.
 *   "STARBUCKS COFFEE #1234"
 *   "STARBUCKS COFFEE #5678"
 *   "Amazon.com*M91X23GH3"
 * Keying recategorize stats on the raw name would never aggregate them.
 *
 * Algorithm:
 *  1. Uppercase + trim.
 *  2. Special-case AMZN MKTP (Amazon Marketplace) → stable "AMAZON.COM_MKTP" stem.
 *  3. If name starts with a known payment-processor prefix + `*`, strip that
 *     prefix so the real merchant becomes the stem (avoids `SQ *X` / `SQ *Y`
 *     false collisions).
 *  4. Take the leading whitespace token, split on `*` (drops trailing
 *     transaction IDs after `Amazon.com*ABC`), and trim trailing non-letter chars.
 *  5. If that leaves an empty stem (purely numeric first token like `5 GUYS`),
 *     fall back to the first 1-2 tokens with trailing `#N` stripped — preserves
 *     legitimate numeric-prefixed merchants.
 *  6. Normalize hyphenated number-letter variants ("7-ELEVEN" ≡ "7 ELEVEN")
 *     by collapsing internal hyphens to spaces in the multi-word fallback.
 *
 * Edge cases:
 *  - Empty/whitespace name → empty stem (caller should skip).
 *  - Pure punctuation/digits → empty stem (caller skips, no false suggestion).
 *  - Non-ASCII letters preserved (e.g. "CAFÉ").
 */
export function merchantStem(name) {
  let norm = (name || '').trim().toUpperCase();
  if (!norm) return '';

  // Special-case Amazon Marketplace: "AMZN MKTP US*M91X23" → stable
  // AMAZON.COM_MKTP (distinct from regular Amazon.com so users can route
  // marketplace charges to a different category).
  if (/^AMZN\s+MKTP\b/.test(norm)) {
    return 'AMAZON.COM_MKTP';
  }

  // Strip known payment-processor prefix: "SQ *COFFEE SHOP" → "COFFEE SHOP".
  // Match: PREFIX (letters, optional whitespace) `*` (optional whitespace) BODY.
  const procMatch = norm.match(/^([A-Z]+)\s*\*\s*(.+)$/);
  if (procMatch && PROCESSOR_PREFIXES.has(procMatch[1])) {
    norm = procMatch[2].trim();
    if (!norm) return '';
  }

  // Normalize internal hyphens between digit and letter so "7-ELEVEN" and
  // "7 ELEVEN" produce the same stem.
  const normSpaced = norm.replace(/(\d)-(?=\p{L})/gu, '$1 ');

  const tokens = normSpaced.split(/\s+/);
  const first = tokens[0] || '';
  // Drop any trailing-after-`*` payload from the first token (Amazon.com*ID).
  const beforeStar = first.split('*')[0];
  const trimmed = trimToken(beforeStar);

  if (trimmed) {
    // Common case: clean leading word.
    return trimmed;
  }

  // Fallback for purely-numeric first tokens: take first 2 tokens, strip
  // trailing #N or pure-digit token.
  if (tokens.length >= 2) {
    // Build first-2-token stem, then drop trailing "#N" / digits.
    const head = tokens.slice(0, 2).join(' ').replace(/\s*#?\d+\s*$/, '').trim();
    return head;
  }

  return '';
}

/** Internal: build the stats key. Exposed for tests. */
export function statKey(merchantKey, targetPath) {
  return merchantKey + '|' + (targetPath || []).join('.');
}

/**
 * Pull (merchantKey, newPath, txId) tuples out of a batch of pre/post
 * patches whose `cat` or `path` actually changed. Skips no-ops (same path)
 * and skips first-categorizations (txs with no prior cat) — those are
 * imports being categorized for the first time, not user re-categorizations.
 *
 * @param {Array<{id, cat?, path?}>} before snapshot of pre-patch values for cat/path
 * @param {Map<string, {name, ...}>} idToTx live tx records keyed by id (need name for merchant key)
 * @param {object|Array} patchOrPatches either a shared patch object (updateTxs)
 *        or an array of { id, patch } per-tx patches (updateTxsIndividually)
 * @returns {Array<{merchantKey, newPath, txId}>}
 */
export function extractRecategorizationEvents(before, idToTx, patchOrPatches) {
  const events = [];
  const getNewPath = (id) => {
    if (!patchOrPatches) return null;
    if (Array.isArray(patchOrPatches)) {
      const entry = patchOrPatches.find(p => p.id === id);
      if (!entry) return null;
      const p = entry.patch || {};
      if (Array.isArray(p.path) && p.path.length) return p.path;
      if (p.cat) return [p.cat];
      return null;
    }
    const p = patchOrPatches;
    if (Array.isArray(p.path) && p.path.length) return p.path;
    if (p.cat) return [p.cat];
    return null;
  };
  for (const snap of before) {
    const tx = idToTx.get(snap.id);
    if (!tx || !tx.name) continue;
    const oldPath = Array.isArray(snap.path) && snap.path.length
      ? snap.path
      : (snap.cat ? [snap.cat] : null);
    if (!oldPath) continue;
    const newPath = getNewPath(snap.id);
    if (!newPath) continue;
    if (oldPath.length === newPath.length && oldPath.every((p, i) => p === newPath[i])) continue;
    const merchantKey = merchantStem(tx.name);
    if (!merchantKey) continue;
    events.push({ merchantKey, newPath, txId: snap.id });
  }
  return events;
}

/**
 * Apply one recategorize event to the stats map. Returns
 *   { next, fired }
 * where `next` is the new stats map (referentially the same as `prev` if
 * nothing changed) and `fired` is the suggestion payload to surface, or
 * null. Threshold is fired exactly when `count` first reaches
 * SUGGEST_THRESHOLD; subsequent re-cats don't re-fire (the user must
 * either accept or dismiss to make further suggestions for this pair).
 */
export function applyRecategorizeEvent(prev, merchantKey, targetPath, txId, now = new Date()) {
  if (!merchantKey || !targetPath || targetPath.length === 0 || !txId) {
    return { next: prev, fired: null };
  }
  const key = statKey(merchantKey, targetPath);
  const existing = prev[key] || { count: 0, lastAt: null, lastTxIds: [], dismissed: 0 };
  if ((existing.dismissed || 0) >= DISMISS_LIMIT) {
    return { next: prev, fired: null };
  }
  if (existing.lastTxIds.includes(txId)) {
    return { next: prev, fired: null };
  }
  const nextIds = [...existing.lastTxIds, txId];
  const nextCount = nextIds.length;
  const next = {
    ...prev,
    [key]: {
      ...existing,
      count: nextCount,
      lastAt: now.toISOString(),
      lastTxIds: nextIds,
    },
  };
  const fired = nextCount === SUGGEST_THRESHOLD
    ? { merchantKey, targetPath: [...targetPath] }
    : null;
  return { next, fired };
}

/**
 * Increment dismissed counter on every (merchant_key, *) entry — the spec
 * silences the merchant regardless of which target was suggested.
 */
export function applyDismiss(prev, merchantKey) {
  if (!merchantKey) return prev;
  const next = { ...prev };
  let touched = false;
  for (const k of Object.keys(prev)) {
    if (k.startsWith(merchantKey + '|')) {
      next[k] = { ...prev[k], dismissed: (prev[k].dismissed || 0) + 1 };
      touched = true;
    }
  }
  return touched ? next : prev;
}

/** Drop a (merchant, target) entry. Used when a rule covering this pair is created. */
export function applyEvict(prev, merchantKey, targetPath) {
  if (!merchantKey || !targetPath) return prev;
  const key = statKey(merchantKey, targetPath);
  if (!(key in prev)) return prev;
  const { [key]: _drop, ...rest } = prev;
  return rest;
}

/**
 * Detect when an addRule call should auto-evict a stat.
 *
 * Uses `patternLiteral` to strip leading/trailing wildcards, so a pattern
 * like `STARBUCKS*` matches stat keys keyed under `merchantStem('Starbucks #4521') === 'STARBUCKS'`.
 * Patterns with mid-string wildcards (e.g. `S*BUCKS`) still bail out — we
 * can't cheaply know which stat keys they cover.
 *
 * Returns { merchantKey, targetPath } | null.
 */
export function findEvictionForNewRule(rule) {
  if (!rule?.match?.merchantPattern || !rule?.set?.path?.length) return null;
  const literal = patternLiteral(rule.match.merchantPattern);
  if (!literal) return null;
  // Reject mid-string wildcards: only edge wildcards are supported.
  if (/\*/.test(literal)) return null;
  return {
    merchantKey: literal.toUpperCase(),
    targetPath: [...rule.set.path],
  };
}
