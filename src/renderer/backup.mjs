// CAR-77: Pure backup helpers. No React, no localStorage, no DOM.
// All build/validate/parse logic lives here so it's testable without
// mounting a renderer.

export const BACKUP_FORMAT_VERSION = 2;
export const BACKUP_TYPE = 'ledger-backup';

// 18 user-data slices total: 15 in SLICES + 3 in SCALAR_SLICES.
// Excluded (session-ephemera, reset on restore): txFilter, dismissedAlerts,
// dismissedInsights, welcomeSeen, fxMigrationToastSeen, lastBackupAt,
// backupReminderInterval, backupReminderSnoozedUntil,
// fxAutoFetch, fxLastFetchedAt, fxLastFetchError.
//
// Each entry maps STATE_KEY -> BACKUP_KEY -> defaultEmpty (used both when
// building from a state missing the slice AND when validating a backup
// that omits or mistypes the slice).
const SLICES = [
  // [stateKey, backupKey, defaultEmpty, expectedType]
  ['txs',                'transactions',     [], 'array'],
  ['accounts',           'accounts',         [], 'array'],
  ['catTree',            'categoryTree',     {}, 'object'],
  ['budgets',            'budgets',          [], 'array'],
  ['hidden',             'hidden',           [], 'array'],
  ['bills',              'bills',            [], 'array'],
  ['goals',              'goals',            [], 'array'],
  ['goalContributions',  'goalContributions', [], 'array'],
  ['rules',              'rules',            [], 'array'],
  ['savedViews',         'savedViews',       [], 'array'],
  ['investments',        'investments',      [], 'array'],
  ['trades',             'trades',           [], 'array'],
  ['rates',              'fxRates',          {}, 'object'],
  ['ratesUpdated',       'fxRatesUpdated',   {}, 'object'],
  // CAR-345: debt payoff planner. Optional slice — old backups without it
  // restore to [] (backward-compatible; no BACKUP_FORMAT_VERSION bump needed).
  ['debts',              'debts',            [], 'array'],
];

const SCALAR_SLICES = [
  // [stateKey, backupKey, defaultValue]
  ['selectedPeriod',  'selectedPeriod',  null],
  ['budgetStartDay',  'budgetStartDay',  1],
  // CAR-345: shared "extra monthly payment" budget for the payoff planner.
  ['debtExtraPayment', 'debtExtraPayment', 0],
];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function matchesType(value, expected) {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return isPlainObject(value);
  return false;
}

// Build a backup object from the store's current state. `state` is a plain
// object containing the same keys used by `<StoreProvider>`'s value (txs,
// accounts, catTree, budgets, ...) plus a `settings` sub-object for the 5
// preference values. Missing keys -> empty defaults.
export function buildBackup(state = {}, appVersion) {
  const out = {
    _type: BACKUP_TYPE,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  if (appVersion !== undefined) out.appVersion = appVersion;

  for (const [stateKey, backupKey, empty, expectedType] of SLICES) {
    const v = state[stateKey];
    out[backupKey] = matchesType(v, expectedType) ? v : empty;
  }
  for (const [stateKey, backupKey, dflt] of SCALAR_SLICES) {
    out[backupKey] = state[stateKey] !== undefined ? state[stateKey] : dflt;
  }
  out.settings = isPlainObject(state.settings) ? state.settings : {};
  return out;
}

// Validate an already-parsed object. Returns:
//   { ok: true,  data, summary, warnings }
//   { ok: false, error }
//
// Strict on identity (`_type`) and `version`; tolerant on slice presence
// and slice types (wrong type -> skipped with a warning).
export function validateBackup(obj) {
  if (!isPlainObject(obj)) {
    return { ok: false, error: 'Not a Ledger backup file.' };
  }
  if (obj._type !== BACKUP_TYPE) {
    return { ok: false, error: 'Not a Ledger backup file.' };
  }
  const v = obj.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return { ok: false, error: 'Backup version is missing or invalid.' };
  }
  if (v > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Backup was made with a newer version of Ledger (v${v}). Please update.`,
    };
  }

  const data = {};
  const warnings = [];
  const summary = {};

  for (const [, backupKey, empty, expectedType] of SLICES) {
    const value = obj[backupKey];
    if (value === undefined) {
      data[backupKey] = empty;
      summary[backupKey] = expectedType === 'array' ? empty.length : Object.keys(empty).length;
      continue;
    }
    if (!matchesType(value, expectedType)) {
      warnings.push(`Slice "${backupKey}" has the wrong shape and will be skipped.`);
      data[backupKey] = empty;
      summary[backupKey] = 0;
      continue;
    }
    data[backupKey] = value;
    summary[backupKey] = expectedType === 'array' ? value.length : Object.keys(value).length;
  }

  for (const [, backupKey, dflt] of SCALAR_SLICES) {
    data[backupKey] = obj[backupKey] !== undefined ? obj[backupKey] : dflt;
  }

  data.settings = isPlainObject(obj.settings) ? obj.settings : {};

  return { ok: true, data, summary, warnings };
}

// Parse a JSON string into a validated backup. The single string-in,
// result-out entry point used by the restore flow.
export function parseBackup(jsonString) {
  let obj;
  try {
    obj = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: 'Not a valid JSON file.' };
  }
  return validateBackup(obj);
}
