// CAR-182: Pure helpers for the "suggest rule after 3rd identical
// re-categorization" feature. The React-coupled bits (state, callbacks,
// pendingRuleSuggestion signal) live in store.jsx; this module is pure
// data transforms that are trivial to unit test.

import { patternLiteral } from './rules.mjs';

export const SUGGEST_THRESHOLD = 3;
export const DISMISS_LIMIT = 3;

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
 * Strategy: uppercase + trim, take the leading whitespace-delimited token,
 * then strip any trailing non-alpha characters. This produces a stem like
 * "STARBUCKS" or "AMAZON.COM" that's stable across charges from the same
 * merchant. The toast then suggests a rule of the form `STEM*` which the
 * existing rules engine (patternToRegExp) matches against all variants.
 *
 * Edge cases:
 *  - Empty/whitespace name → empty stem (caller should skip).
 *  - Pure punctuation/digits → empty stem (caller skips).
 *  - Non-ASCII letters preserved (e.g. "CAFÉ" → "CAFÉ"); we only strip
 *    trailing non-alpha bytes that look like ID padding.
 */
export function merchantStem(name) {
  const norm = (name || '').trim().toUpperCase();
  if (!norm) return '';
  const first = norm.split(/\s+/)[0] || '';
  // Strip trailing punctuation, digits, and other non-letter chars.
  // Keep ASCII letters, accented Latin letters, and dots in the middle
  // (so "AMAZON.COM" survives but "AMAZON.COM*M91X23" → "AMAZON.COM").
  // We split on '*' first because '*' is the most common separator
  // before transaction-id padding.
  const beforeStar = first.split('*')[0];
  // Strip trailing non-letter bytes (digits, punct) but preserve dots
  // mid-token. Use Unicode-aware letter class.
  return beforeStar.replace(/[^\p{L}.]+$/u, '').replace(/\.+$/, '');
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
