/**
 * Weekly insight detectors for the renderer data layer.
 *
 * Contract:
 * - Pure, deterministic helpers. No React, no storage, no network.
 * - Each detector returns an array of insight rows with the shared shape:
 *   { id, kind, type, severity, title, detail, metric, action, route,
 *     routeParams?, sortDate? }
 * - Callers may dismiss rows by id before rendering.
 * - This layer intentionally uses raw `tx.amt` values without FX conversion.
 *   The UI/data surface above this module already owns currency presentation,
 *   and keeping the detector pure avoids hidden rate dependencies.
 */

const DAY_MS = 86_400_000;
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
const WINDOWS_TO_LOOKBACK = 26; // ~6 months of weekly buckets

/** @typedef {'low'|'medium'|'high'} InsightSeverity */

/**
 * @typedef {Object} InsightRow
 * @property {string} id
 * @property {'insight'} kind
 * @property {'spike'|'new-merchant'|'inactive-sub'|'income-change'|'streak'} type
 * @property {InsightSeverity} severity
 * @property {string} title
 * @property {string} detail
 * @property {string} metric  // CAR-217: locked to string. UI surfaces render this raw;
 *                            // detectors must format (e.g. '$42', '150%', '60d').
 * @property {'REVIEW'|'OPEN'|'DISMISS'} action
 * @property {string} route
 * @property {Record<string, string>|undefined} [routeParams]
 * @property {string|undefined} [sortDate]
 */

/**
 * @typedef {Object} InsightInput
 * @property {Array<Object>} [transactions]
 * @property {Array<Object>} [recurringRules]
 * @property {Array<Object>} [budgetRows]
 * @property {Array<string>} [dismissedInsightIds]
 */

function parseIsoDate(iso) {
  if (typeof iso !== 'string' || !iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getTxDate(tx) {
  return parseIsoDate(tx?.date);
}

function getTxCategoryLabel(tx) {
  const cat = Array.isArray(tx?.path) && tx.path.length ? tx.path[0] : tx?.cat;
  return String(cat || '').trim();
}

function getTxCategoryKey(tx) {
  return normalizeText(getTxCategoryLabel(tx));
}

function isExpenseTx(tx) {
  return safeNumber(tx?.amt) != null && Number(tx.amt) < 0;
}

function isIncomeTx(tx) {
  if (safeNumber(tx?.amt) == null || Number(tx.amt) <= 0) return false;
  const cat = normalizeText(tx?.cat);
  const pathCat = normalizeText(Array.isArray(tx?.path) ? tx.path[0] : '');
  return tx?.type === 'income' || cat.startsWith('INCOME') || pathCat.startsWith('INCOME');
}

function weekLabelFromIso(todayIso) {
  const date = parseIsoDate(todayIso);
  if (!date) return todayIso || '';
  const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((working - yearStart) / DAY_MS) + 1) / 7);
  return `${working.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function buildRollingWindows(todayIso, lookbackWeeks = WINDOWS_TO_LOOKBACK) {
  const today = parseIsoDate(todayIso);
  if (!today) return null;
  const currentEnd = today;
  const currentStart = addUtcDays(currentEnd, -6);
  const lookbackStart = addUtcDays(currentStart, -(lookbackWeeks * 7));
  const windows = [];
  for (let i = 0; i <= lookbackWeeks; i += 1) {
    const start = addUtcDays(lookbackStart, i * 7);
    const end = addUtcDays(start, 6);
    windows.push({ start, end });
  }
  return { windows, currentIndex: lookbackWeeks, currentStart, currentEnd, lookbackStart };
}

function bucketIndexForDate(date, lookbackStart, bucketCount) {
  const diffDays = Math.floor((date - lookbackStart) / DAY_MS);
  const index = Math.floor(diffDays / 7);
  return index >= 0 && index < bucketCount ? index : null;
}

function compareInsightRows(a, b) {
  const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (severity) return severity;
  const dateA = a.sortDate || '';
  const dateB = b.sortDate || '';
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  return a.title.localeCompare(b.title);
}

function formatPct(value) {
  return `${Math.round(value)}%`;
}

function formatMoneyish(value) {
  return Math.round(Math.abs(value));
}

function buildCategoryBuckets(transactions, todayIso) {
  const windows = buildRollingWindows(todayIso);
  if (!windows) return null;
  const buckets = Array.from({ length: windows.windows.length }, () => new Map());
  const labels = new Map();
  for (const tx of transactions || []) {
    const date = getTxDate(tx);
    const amt = safeNumber(tx?.amt);
    if (!date || amt == null || amt >= 0) continue;
    const catKey = getTxCategoryKey(tx);
    const catLabel = getTxCategoryLabel(tx);
    if (!catKey) continue;
    const index = bucketIndexForDate(date, windows.lookbackStart, buckets.length);
    if (index == null) continue;
    labels.set(catKey, labels.get(catKey) || catLabel || catKey.toLowerCase());
    const bucket = buckets[index];
    bucket.set(catKey, (bucket.get(catKey) || 0) + Math.abs(amt));
  }
  return { windows, buckets, labels };
}

function buildIncomeBuckets(transactions, todayIso) {
  const windows = buildRollingWindows(todayIso);
  if (!windows) return null;
  const buckets = Array.from({ length: windows.windows.length }, () => 0);
  for (const tx of transactions || []) {
    const date = getTxDate(tx);
    const amt = safeNumber(tx?.amt);
    if (!date || amt == null || !isIncomeTx(tx)) continue;
    const index = bucketIndexForDate(date, windows.lookbackStart, buckets.length);
    if (index == null) continue;
    buckets[index] += amt;
  }
  return { windows, buckets };
}

export function detectCategorySpikes(transactions, todayIso) {
  const data = buildCategoryBuckets(transactions, todayIso);
  if (!data) return [];
  const { buckets, windows, labels } = data;
  const current = buckets[windows.currentIndex];
  const rows = [];
  for (const [catKey, currentTotal] of current.entries()) {
    if (currentTotal < 25) continue;
    let trailingTotal = 0;
    for (let i = 0; i < windows.currentIndex; i += 1) {
      trailingTotal += buckets[i].get(catKey) || 0;
    }
    const mean = trailingTotal / windows.currentIndex;
    if (mean <= 0 ? currentTotal >= 25 : currentTotal < 2 * mean) continue;
    const ratio = mean <= 0 ? Infinity : currentTotal / mean;
    const cat = labels.get(catKey) || catKey.toLowerCase();
    rows.push({
      id: `insight:spike:${cat}:${weekLabelFromIso(todayIso)}`,
      kind: 'insight',
      type: 'spike',
      severity: ratio > 3 ? 'high' : 'medium',
      title: `${cat.toUpperCase()} SPEND SPIKE`,
      detail: `THIS WEEK ${formatMoneyish(currentTotal)} VS 6-MONTH AVG ${formatMoneyish(mean)}`,
      metric: formatPct((ratio - 1) * 100),
      action: 'REVIEW',
      route: 'transactions',
      routeParams: { cat, period: 'this-week' },
      sortDate: todayIso,
    });
  }
  return rows.sort(compareInsightRows);
}

export function detectNewMerchants(transactions, todayIso) {
  const windows = buildRollingWindows(todayIso);
  if (!windows) return [];
  const seenPrior = new Set();
  const current = new Map();
  for (const tx of transactions || []) {
    const date = getTxDate(tx);
    const amt = safeNumber(tx?.amt);
    if (!date || amt == null || amt >= 0) continue;
    const merchant = normalizeText(tx?.name);
    if (!merchant) continue;
    if (date < windows.currentStart) {
      if (date >= windows.lookbackStart) seenPrior.add(merchant);
      continue;
    }
    if (date > windows.currentEnd) continue;
    current.set(merchant, (current.get(merchant) || 0) + Math.abs(amt));
  }
  const rows = [...current.entries()]
    .filter(([merchant]) => !seenPrior.has(merchant))
    .map(([merchant, amount]) => ({
      id: `insight:new-merchant:${merchant}:${weekLabelFromIso(todayIso)}`,
      kind: 'insight',
      type: 'new-merchant',
      severity: 'low',
      title: 'NEW MERCHANT',
      detail: `${merchant} APPEARED THIS WEEK`,
      metric: formatMoneyish(amount),
      action: 'OPEN',
      route: 'transactions',
      routeParams: { merchant },
      sortDate: todayIso,
    }))
    .sort((a, b) => b.metric - a.metric || a.title.localeCompare(b.title))
    .slice(0, 5);
  return rows;
}

function matchesRuleTx(ruleLabel, txName) {
  if (!ruleLabel || !txName) return false;
  return txName.includes(ruleLabel) || ruleLabel.includes(txName);
}

export function detectInactiveSubscriptions(recurringRules, transactions, todayIso) {
  const cutoff = addUtcDays(parseIsoDate(todayIso), -59);
  const rows = [];
  for (const rule of recurringRules || []) {
    if (!rule || rule.active !== true) continue;
    const ruleId = rule.id;
    if (!ruleId) continue;
    const labels = [rule.name, rule.merchant, rule.category, rule.cat]
      .map(normalizeText)
      .filter(Boolean);
    if (!labels.length) continue;
    let matched = false;
    for (const tx of transactions || []) {
      const date = getTxDate(tx);
      const amt = safeNumber(tx?.amt);
      const txName = normalizeText(tx?.name);
      const txCat = normalizeText(tx?.cat);
      if (!date || amt == null || date < cutoff || date > parseIsoDate(todayIso)) continue;
      if (labels.some(label => matchesRuleTx(label, txName) || matchesRuleTx(label, txCat))) {
        matched = true;
        break;
      }
    }
    if (matched) continue;
    rows.push({
      id: `insight:inactive-sub:${ruleId}`,
      kind: 'insight',
      type: 'inactive-sub',
      severity: 'medium',
      title: labels[0],
      detail: 'NO MATCHING TRANSACTION IN LAST 60 DAYS',
      metric: 60,
      action: 'REVIEW',
      route: 'recurring',
      routeParams: { ruleId },
      sortDate: todayIso,
    });
  }
  return rows.sort(compareInsightRows);
}

export function detectIncomeChanges(transactions, todayIso) {
  const data = buildIncomeBuckets(transactions, todayIso);
  if (!data) return [];
  const { buckets, windows } = data;
  const current = buckets[windows.currentIndex];
  const prior = buckets.slice(windows.currentIndex - 4, windows.currentIndex);
  const priorTotal = prior.reduce((sum, value) => sum + value, 0);
  if (priorTotal <= 0 && current <= 0) return [];
  const mean = priorTotal / prior.length;
  if (mean <= 0) return [];
  const delta = current - mean;
  const change = delta / mean;
  if (Math.abs(change) <= 0.2) return [];
  const severity = change < 0 ? 'medium' : 'low';
  return [{
    id: `insight:income-change:${weekLabelFromIso(todayIso)}`,
    kind: 'insight',
    type: 'income-change',
    severity,
    title: change < 0 ? 'INCOME DOWN' : 'INCOME UP',
    detail: `THIS WEEK ${formatMoneyish(current)} VS 4-WEEK AVG ${formatMoneyish(mean)}`,
    metric: formatPct(Math.abs(change) * 100),
    action: 'REVIEW',
    route: 'income',
    routeParams: { period: 'this-week' },
    sortDate: todayIso,
  }];
}

export function detectStreaks(transactions, todayIso, budgetRows = []) {
  if (!Array.isArray(budgetRows) || budgetRows.length === 0) return [];
  const data = buildCategoryBuckets(transactions, todayIso);
  if (!data) return [];
  const { windows, buckets, labels } = data;
  const rows = [];
  for (const budget of budgetRows) {
    const cat = normalizeText(budget?.cat);
    const limit = safeNumber(budget?.limit);
    if (!cat || limit == null) continue;
    let streak = 0;
    for (let i = windows.currentIndex; i >= 0; i -= 1) {
      const weeklySpend = buckets[i].get(cat) || 0;
      if (weeklySpend <= limit) streak += 1;
      else break;
      if (streak >= 3) break;
    }
    if (streak < 3) continue;
    const label = labels.get(cat) || cat.toLowerCase();
    rows.push({
      id: `insight:streak:${label}:${weekLabelFromIso(todayIso)}`,
      kind: 'insight',
      type: 'streak',
      severity: 'low',
      title: `${label.toUpperCase()} UNDER BUDGET`,
      detail: `${streak} STRAIGHT WEEKS UNDER ${formatMoneyish(limit)} BUDGET`,
      metric: `${streak}W`,
      action: 'OPEN',
      route: 'budgets',
      sortDate: todayIso,
    });
  }
  return rows.sort(compareInsightRows);
}

export function buildInsightRows(input = {}, todayIso = new Date().toISOString().slice(0, 10)) {
  const dismissed = new Set(input.dismissedInsightIds || []);
  const rows = [
    ...detectCategorySpikes(input.transactions || [], todayIso),
    ...detectNewMerchants(input.transactions || [], todayIso),
    ...detectInactiveSubscriptions(input.recurringRules || [], input.transactions || [], todayIso),
    ...detectIncomeChanges(input.transactions || [], todayIso),
    ...detectStreaks(input.transactions || [], todayIso, input.budgetRows || []),
  ];
  return rows
    .filter(row => !dismissed.has(row.id))
    .sort(compareInsightRows);
}
