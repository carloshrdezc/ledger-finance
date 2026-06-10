/**
 * @file Transaction-level anomaly detection (CAR-351).
 *
 * The weekly insights layer (insights.mjs) flags AGGREGATE trends (category
 * spend spikes, income changes, streaks). This module is the per-TRANSACTION
 * complement: it scans recent individual expense transactions and flags ones
 * that look anomalous, each with a human-readable reason, so the user can catch
 * overspending, mistakes, or fraud early.
 *
 * Three detectors:
 *   - amount-outlier:    a charge far above the category's typical amount,
 *                        relative to a trailing baseline (median + k·MAD-ish).
 *   - large-new-merchant: a sizable first-ever charge from a never-seen merchant.
 *   - possible-duplicate: same merchant + same amount within a few days.
 *
 * Contract: pure, deterministic, no React / storage / network. Raw `tx.amt`
 * values are used without FX conversion — the surface above owns currency
 * presentation (matching insights.mjs). Each flag carries `txId` so the UI can
 * link to the transaction, and a stable `id` for dismiss/restore.
 */

const DAY_MS = 86_400_000;
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

// Tunables. Conservative defaults so the list stays signal, not noise.
const RECENT_WINDOW_DAYS = 30;     // only flag transactions from the last N days
const BASELINE_WINDOW_DAYS = 180;  // category/merchant history to learn from
const MIN_BASELINE_COUNT = 4;      // need this many priors before calling an outlier
const OUTLIER_MULTIPLE = 3;        // charge >= this * category median => outlier
const MIN_OUTLIER_AMOUNT = 50;     // ignore small outliers (noise)
const LARGE_NEW_MERCHANT_AMOUNT = 200;
const DUPLICATE_WINDOW_DAYS = 3;

/** @typedef {'low'|'medium'|'high'} AnomalySeverity */

/**
 * @typedef {Object} AnomalyRow
 * @property {string} id        stable id (for dismiss/restore)
 * @property {string} txId
 * @property {string} merchantRaw  raw (un-uppercased) merchant for drill-down filtering
 * @property {'amount-outlier'|'large-new-merchant'|'possible-duplicate'} reason
 * @property {AnomalySeverity} severity
 * @property {string} title     merchant/name
 * @property {string} detail    human-readable reason
 * @property {number} metric    the transaction's absolute amount
 * @property {string} date      tx date (ISO)
 */

function parseIso(iso) {
  if (typeof iso !== 'string' || !iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function categoryKey(tx) {
  const cat = Array.isArray(tx?.path) && tx.path.length ? tx.path[0] : tx?.cat;
  return normalizeText(cat);
}

function merchantKey(tx) {
  // Merchant is the part before a ' · ' suffix (matches WebReports' convention).
  return normalizeText(String(tx?.name || '').split(' · ')[0]);
}

function isExpense(tx) {
  const amt = safeNumber(tx?.amt);
  // Exclude transfers and goal contributions — they aren't "spending".
  if (amt == null || amt >= 0) return false;
  if (tx?.cat === 'transfer') return false;
  return true;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compareRows(a, b) {
  const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (sev) return sev;
  if (a.date !== b.date) return b.date.localeCompare(a.date); // newest first
  return b.metric - a.metric;
}

/**
 * Flag anomalous recent expense transactions.
 *
 * @param {Array<Object>} transactions
 * @param {string} [todayIso]
 * @returns {AnomalyRow[]} sorted by severity, then recency, then amount
 */
export function detectTransactionAnomalies(transactions, todayIso = new Date().toISOString().slice(0, 10)) {
  const today = parseIso(todayIso);
  if (!today) return [];
  const recentStart = new Date(today.getTime() - RECENT_WINDOW_DAYS * DAY_MS);
  const baselineStart = new Date(today.getTime() - BASELINE_WINDOW_DAYS * DAY_MS);

  const expenses = [];
  for (const tx of transactions || []) {
    if (!isExpense(tx)) continue;
    const date = parseIso(tx.date);
    if (!date || date < baselineStart || date > today) continue;
    expenses.push({ tx, date, amount: Math.abs(Number(tx.amt)) });
  }

  // Category baselines (median of priors) over the baseline window.
  const byCategory = new Map();
  for (const e of expenses) {
    const cat = categoryKey(e.tx);
    if (cat) {
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push({ date: e.date, amount: e.amount });
    }
  }

  // Merchant first-seen dates — built from the FULL transaction history (not
  // the 180-day baseline window), so an annual/semi-annual charge whose prior
  // occurrence predates the window isn't mis-flagged as a brand-new merchant.
  const merchantFirstSeen = new Map();
  for (const tx of transactions || []) {
    if (!isExpense(tx)) continue;
    const date = parseIso(tx.date);
    if (!date) continue;
    const merch = merchantKey(tx);
    if (!merch) continue;
    const prev = merchantFirstSeen.get(merch);
    if (!prev || date < prev) merchantFirstSeen.set(merch, date);
  }

  const rows = [];
  const seenTxIds = new Set(); // one flag per tx (highest-severity reason wins)

  const pushRow = (row) => {
    if (seenTxIds.has(row.txId)) return;
    seenTxIds.add(row.txId);
    rows.push(row);
  };

  // Recent expenses, newest-first so the strongest signal is considered first.
  const recent = expenses
    .filter(e => e.date >= recentStart)
    .sort((a, b) => b.date - a.date || b.amount - a.amount);

  for (const e of recent) {
    const tx = e.tx;
    const txId = tx.id;
    if (!txId) continue;
    const merch = merchantKey(tx);
    const cat = categoryKey(tx);
    const title = merch || normalizeText(tx.name) || (cat ? cat : 'TRANSACTION');
    // Raw (un-uppercased) merchant for the drill-down filter, which compares
    // against the original tx.name case-sensitively (see WebTransactions).
    const merchantRaw = String(tx.name || '').split(' · ')[0];
    const dateIso = tx.date;

    // 1) possible-duplicate: same merchant + same amount within a few days.
    let dup = null;
    if (merch) {
      for (const other of expenses) {
        if (other.tx === e.tx || other.tx.id === txId) continue;
        if (merchantKey(other.tx) !== merch) continue;
        if (round2(other.amount) !== round2(e.amount)) continue;
        const gapDays = Math.abs((other.date - e.date) / DAY_MS);
        if (gapDays <= DUPLICATE_WINDOW_DAYS) { dup = other; break; }
      }
    }
    if (dup) {
      pushRow({
        id: `anomaly:duplicate:${txId}`,
        txId,
        merchantRaw,
        reason: 'possible-duplicate',
        severity: 'high',
        title,
        detail: `SAME AMOUNT AS ${dup.tx.date} — POSSIBLE DUPLICATE CHARGE`,
        metric: round2(e.amount),
        date: dateIso,
      });
      continue;
    }

    // 2) amount-outlier: charge >= OUTLIER_MULTIPLE × category median (priors only).
    if (cat) {
      const priors = (byCategory.get(cat) || [])
        .filter(p => p.date < e.date)
        .map(p => p.amount);
      if (priors.length >= MIN_BASELINE_COUNT && e.amount >= MIN_OUTLIER_AMOUNT) {
        const med = median(priors);
        if (med > 0 && e.amount >= OUTLIER_MULTIPLE * med) {
          const ratio = e.amount / med;
          pushRow({
            id: `anomaly:outlier:${txId}`,
            txId,
            merchantRaw,
            reason: 'amount-outlier',
            severity: ratio >= 5 ? 'high' : 'medium',
            title,
            detail: `${Math.round(ratio)}× THE TYPICAL ${cat} CHARGE (MEDIAN ${Math.round(med)})`,
            metric: round2(e.amount),
            date: dateIso,
          });
          continue;
        }
      }
    }

    // 3) large-new-merchant: sizable first-ever charge from a never-seen
    // merchant. merchantFirstSeen spans the full history, so this is true only
    // when no earlier charge from this merchant exists anywhere in the ledger.
    if (merch && e.amount >= LARGE_NEW_MERCHANT_AMOUNT) {
      const firstSeen = merchantFirstSeen.get(merch);
      if (firstSeen && firstSeen.getTime() === e.date.getTime()) {
        pushRow({
          id: `anomaly:new-merchant:${txId}`,
          txId,
          merchantRaw,
          reason: 'large-new-merchant',
          severity: 'medium',
          title,
          detail: `LARGE FIRST CHARGE FROM A NEW MERCHANT`,
          metric: round2(e.amount),
          date: dateIso,
        });
        continue;
      }
    }
  }

  return rows.sort(compareRows);
}

/**
 * Build the flagged-transaction rows for the UI, dropping dismissed ids.
 *
 * @param {{transactions?:Array<Object>, dismissedAnomalyIds?:Array<string>}} input
 * @param {string} [todayIso]
 * @returns {AnomalyRow[]}
 */
export function buildAnomalyRows(input = {}, todayIso = new Date().toISOString().slice(0, 10)) {
  const dismissed = new Set(input.dismissedAnomalyIds || []);
  return detectTransactionAnomalies(input.transactions || [], todayIso)
    .filter(row => !dismissed.has(row.id));
}
