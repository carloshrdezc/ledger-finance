# CAR-77 — Full-State Backup, Restore, and Auto-Backup Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, full-state backup/restore mechanism: one-click "Backup now" exports a self-contained `.ledger.json` covering every slice of user data + preferences; "Restore from backup" replaces all current data with strict validation and a summary confirmation; an auto-backup reminder nags via the existing alerts pipeline if a backup is older than the configured interval (default 30d).

**Architecture:** A new pure module `src/renderer/backup.mjs` builds and validates the backup payload. `<StoreProvider>` absorbs the 5 settings keys (`accent`, `density`, `decimals`, `currency`, `theme`) currently in `App.jsx`'s `useTweaks` plus 3 new backup-state keys; exposes `exportBackup`, `restoreBackup`, `recordBackupTaken`. `alerts.mjs` gains a `'backup'` kind and a `detectBackupReminder` detector wired into `buildAlertRows`. A new shared `<BackupSection>` component renders in both WebSettings and mobile Settings under a new `BACKUP` heading. `useTweaks` is deleted; `<AppShell>` reads settings from the store directly.

**Tech Stack:** React 19, Vite 8, Electron 42, IBM Plex Mono inline-styled UI via `A` token (theme.js), localStorage via existing `useLS` hook, Vitest 2.1 for tests on the pure `backup.mjs` module.

**Spec:** `docs/superpowers/specs/2026-05-19-car-77-backup-restore-design.md`

**Linear:** [CAR-77](https://linear.app/carloshrdezc/issue/CAR-77) — currently `In Progress`.

---

## File Inventory

| File | Status | Purpose |
|---|---|---|
| `src/renderer/backup.mjs` | NEW | Pure backup helpers: `BACKUP_FORMAT_VERSION`, `BACKUP_TYPE`, `buildBackup`, `validateBackup`, `parseBackup`. |
| `src/renderer/backup.test.mjs` | NEW | Vitest tests covering build/parse/validate, round-trip, version checks, slice tolerance. |
| `vitest.config.mjs` | MODIFY | Add `src/renderer/backup.test.mjs` to the include allowlist. |
| `src/renderer/store.jsx` | MODIFY | Move 5 settings `useLS` calls in from App.jsx + theme effect; add `lastBackupAt`, `backupReminderInterval`, `backupReminderSnoozedUntil` state; new actions `exportBackup`, `restoreBackup`, `recordBackupTaken`, `setBackupReminderInterval`; extend `dismissAlert` for `'backup:reminder'`; pass new fields into `buildAlertRows`. |
| `src/renderer/alerts.mjs` | MODIFY | Add `'backup'` to `KIND_RANK`; add `detectBackupReminder` helper; emit it from `buildAlertRows` (new params, gated by `!isAppEmpty`). |
| `src/renderer/alerts.test.mjs` | MODIFY | Add `node:test` cases for the new reminder behavior (this file is `node:test` style — see AGENTS.md). |
| `src/renderer/components/BackupSection.jsx` | NEW | Shared Settings component: LAST BACKUP row, BACKUP NOW button, RESTORE FROM BACKUP picker + confirm modal, REMINDER INTERVAL picker. |
| `src/renderer/screens/web/WebSettings.jsx` | MODIFY | Render `<BackupSection>` in a new `BACKUP` block above `DATA`. |
| `src/renderer/screens/mobile/DetailScreens.jsx` | MODIFY | Same in the mobile `Settings` export. |
| `src/renderer/App.jsx` | MODIFY | Delete `useTweaks` (and its inner `useLS` copy); `<AppShell>` reads accent/density/decimals/currency/theme from `useStore()`; build `t`/`tweakProps` from store. |
| `src/renderer/components/ImportExport.jsx` | MODIFY (small) | Update stale "Reset to sample data" toast → "Reset to empty". |

---

## Sequencing Notes

- Tasks 1–3 establish the pure module + tests first (TDD, no UI yet).
- Task 4 wires the alert detector with its own tests, still no UI.
- Task 5 does the Settings-bridge refactor (move 5 settings into store, delete `useTweaks`). Done before backup state lands so the refactor is a clean isolated commit.
- Task 6 adds the backup-state slices and store actions.
- Task 7 builds the shared `<BackupSection>`.
- Task 8 wires `<BackupSection>` into both Settings surfaces.
- Task 9 fixes the stale toast text in `<ImportExport>`.
- Task 10 verifies the build, runs tests, then a manual verification checklist.
- Task 11 covers PR creation, code review, and Linear state transitions.

---

## Task 1: Create the pure backup module (red)

**Files:**
- Create: `src/renderer/backup.mjs`
- Create: `src/renderer/backup.test.mjs`
- Modify: `vitest.config.mjs`

- [ ] **Step 1: Add the test file to the Vitest include allowlist**

Edit `vitest.config.mjs`. Inside `test.include`, add `'src/renderer/backup.test.mjs'` after the existing `sampleData.test.mjs` entry. Final array:

```js
include: [
  'src/renderer/fx.test.mjs',
  'src/renderer/sampleData.test.mjs',
  'src/renderer/backup.test.mjs',
],
```

- [ ] **Step 2: Write the failing tests**

Create `src/renderer/backup.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TYPE,
  buildBackup,
  validateBackup,
  parseBackup,
} from './backup.mjs';

const sampleState = {
  txs: [{ id: 't1', name: 'COFFEE', amt: -3.5, date: '2026-05-01', acct: 'chk', ccy: 'USD' }],
  accounts: [{ id: 'chk', name: 'CHECKING', openingBal: 100, ccy: 'USD' }],
  catTree: { food: { label: 'FOOD' } },
  budgets: [{ cat: 'food', limit: 200, spent: 3.5 }],
  hidden: [],
  bills: [],
  goals: [],
  goalContributions: [],
  investments: [],
  trades: [],
  rates: { USD: 1, EUR: 1.08 },
  ratesUpdated: { EUR: '2026-05-10' },
  selectedPeriod: '2026-05',
  budgetStartDay: 1,
  settings: {
    accent: '#fb6c2e',
    density: 'comfortable',
    decimals: true,
    currency: 'USD',
    theme: 'auto',
  },
};

describe('buildBackup', () => {
  it('returns object with correct envelope', () => {
    const b = buildBackup(sampleState);
    expect(b._type).toBe(BACKUP_TYPE);
    expect(b.version).toBe(BACKUP_FORMAT_VERSION);
    expect(typeof b.exportedAt).toBe('string');
    expect(b.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes all 14 data slices and the settings block', () => {
    const b = buildBackup(sampleState);
    expect(b.transactions).toEqual(sampleState.txs);
    expect(b.accounts).toEqual(sampleState.accounts);
    expect(b.categoryTree).toEqual(sampleState.catTree);
    expect(b.budgets).toEqual(sampleState.budgets);
    expect(b.hidden).toEqual([]);
    expect(b.bills).toEqual([]);
    expect(b.goals).toEqual([]);
    expect(b.goalContributions).toEqual([]);
    expect(b.investments).toEqual([]);
    expect(b.trades).toEqual([]);
    expect(b.fxRates).toEqual(sampleState.rates);
    expect(b.fxRatesUpdated).toEqual(sampleState.ratesUpdated);
    expect(b.selectedPeriod).toBe('2026-05');
    expect(b.budgetStartDay).toBe(1);
    expect(b.settings).toEqual(sampleState.settings);
  });

  it('handles missing/undefined slices by emitting empty defaults', () => {
    const b = buildBackup({});
    expect(b.transactions).toEqual([]);
    expect(b.accounts).toEqual([]);
    expect(b.categoryTree).toEqual({});
    expect(b.budgets).toEqual([]);
    expect(b.hidden).toEqual([]);
    expect(b.bills).toEqual([]);
    expect(b.goals).toEqual([]);
    expect(b.goalContributions).toEqual([]);
    expect(b.investments).toEqual([]);
    expect(b.trades).toEqual([]);
    expect(b.fxRates).toEqual({});
    expect(b.fxRatesUpdated).toEqual({});
    expect(b.settings).toEqual({});
  });

  it('accepts an explicit appVersion', () => {
    const b = buildBackup({}, '1.2.3');
    expect(b.appVersion).toBe('1.2.3');
  });
});

describe('parseBackup', () => {
  it('accepts a valid backup string', () => {
    const json = JSON.stringify(buildBackup(sampleState));
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    expect(result.data.transactions).toEqual(sampleState.txs);
    expect(result.summary.transactions).toBe(1);
    expect(result.summary.accounts).toBe(1);
    expect(result.summary.budgets).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('rejects non-JSON input', () => {
    const result = parseBackup('this is not json {');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid JSON/i);
  });

  it('rejects wrong _type', () => {
    const json = JSON.stringify({ _type: 'something-else', version: 1 });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Ledger backup/i);
  });

  it('rejects missing _type', () => {
    const json = JSON.stringify({ version: 1, transactions: [] });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Ledger backup/i);
  });

  it('rejects missing version', () => {
    const json = JSON.stringify({ _type: BACKUP_TYPE, transactions: [] });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/version/i);
  });

  it('rejects non-integer version', () => {
    const json = JSON.stringify({ _type: BACKUP_TYPE, version: '1' });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/version/i);
  });

  it('rejects future version', () => {
    const json = JSON.stringify({ _type: BACKUP_TYPE, version: BACKUP_FORMAT_VERSION + 1 });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/newer version/i);
  });

  it('accepts an older version (will support future migrations)', () => {
    // Even at v1 today, the codepath that accepts v < CURRENT must exist.
    const json = JSON.stringify({ _type: BACKUP_TYPE, version: 1 });
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
  });

  it('handles a backup missing the settings block', () => {
    const obj = buildBackup(sampleState);
    delete obj.settings;
    const result = parseBackup(JSON.stringify(obj));
    expect(result.ok).toBe(true);
    expect(result.data.settings).toEqual({});
  });
});

describe('validateBackup', () => {
  it('skips a wrong-typed slice and emits a warning', () => {
    const obj = buildBackup(sampleState);
    obj.accounts = 'not an array';
    const result = validateBackup(obj);
    expect(result.ok).toBe(true);
    expect(result.data.accounts).toEqual([]);
    expect(result.warnings.some(w => /accounts/i.test(w))).toBe(true);
    expect(result.summary.accounts).toBe(0);
  });

  it('builds correct summary counts', () => {
    const obj = buildBackup(sampleState);
    const result = validateBackup(obj);
    expect(result.summary.transactions).toBe(1);
    expect(result.summary.accounts).toBe(1);
    expect(result.summary.budgets).toBe(1);
    expect(result.summary.bills).toBe(0);
    expect(result.summary.goals).toBe(0);
  });
});

describe('round-trip', () => {
  it('build → JSON.stringify → parseBackup → equivalent data', () => {
    const original = buildBackup(sampleState);
    const result = parseBackup(JSON.stringify(original));
    expect(result.ok).toBe(true);
    expect(result.data.transactions).toEqual(original.transactions);
    expect(result.data.accounts).toEqual(original.accounts);
    expect(result.data.settings).toEqual(original.settings);
    expect(result.data.fxRates).toEqual(original.fxRates);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: All `backup.test.mjs` cases FAIL with "Cannot find module './backup.mjs'" or similar. Other test suites pass.

- [ ] **Step 4: Commit (red)**

```bash
git add src/renderer/backup.test.mjs vitest.config.mjs
git commit -m "CAR-77: failing tests for backup build/parse/validate"
```

---

## Task 2: Implement backup.mjs to make tests pass (green)

**Files:**
- Create: `src/renderer/backup.mjs`

- [ ] **Step 1: Write the implementation**

Create `src/renderer/backup.mjs`:

```js
// CAR-77: Pure backup helpers. No React, no localStorage, no DOM.
// All build/validate/parse logic lives here so it's testable without
// mounting a renderer.

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_TYPE = 'ledger-backup';

// The 14 user-data slices (excluded: txFilter, dismissedAlerts, welcomeSeen,
// fxMigrationToastSeen, lastBackupAt, backupReminderInterval,
// backupReminderSnoozedUntil — all session-ephemera, reset on restore).
//
// Each entry maps STATE_KEY → BACKUP_KEY → defaultEmpty (used both when
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
  ['investments',        'investments',      [], 'array'],
  ['trades',             'trades',           [], 'array'],
  ['rates',              'fxRates',          {}, 'object'],
  ['ratesUpdated',       'fxRatesUpdated',   {}, 'object'],
];

const SCALAR_SLICES = [
  // [stateKey, backupKey, defaultValue]
  ['selectedPeriod',  'selectedPeriod',  null],
  ['budgetStartDay',  'budgetStartDay',  1],
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
// preference values. Missing keys → empty defaults.
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
// and slice types (wrong type → skipped with a warning).
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test`
Expected: All `backup.test.mjs` cases PASS. Other suites still pass.

- [ ] **Step 3: Verify Vite build still works**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...` line, no errors.

- [ ] **Step 4: Commit (green)**

```bash
git add src/renderer/backup.mjs
git commit -m "CAR-77: implement backup.mjs (buildBackup, parseBackup, validateBackup)"
```

---

## Task 3: Add the auto-backup reminder detector to alerts.mjs (red)

**Files:**
- Modify: `src/renderer/alerts.test.mjs`

This file is `node:test` style (per AGENTS.md, until CAR-153 unifies test runners). New cases must use `node:test` + `node:assert/strict`, NOT Vitest.

- [ ] **Step 1: Add failing test cases**

Open `src/renderer/alerts.test.mjs`. At the end of the file, append:

```js
test('buildAlertRows emits backup reminder when last backup is older than the interval', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: '2026-04-01',
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15'); // 44 days later
  const reminder = alerts.find(a => a.id === 'backup:reminder');
  assert.ok(reminder, 'expected a backup:reminder alert');
  assert.equal(reminder.kind, 'backup');
  assert.equal(reminder.severity, 'low');
  assert.equal(reminder.action, 'BACKUP');
  assert.equal(reminder.route, 'settings');
});

test('buildAlertRows emits backup reminder when no backup has ever been taken', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  assert.ok(alerts.find(a => a.id === 'backup:reminder'));
});

test('buildAlertRows skips backup reminder when isAppEmpty is true', () => {
  const alerts = buildAlertRows({
    isAppEmpty: true,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  assert.equal(alerts.find(a => a.id === 'backup:reminder'), undefined);
});

test('buildAlertRows skips backup reminder when interval is 0 (Off)', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 0,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15');
  assert.equal(alerts.find(a => a.id === 'backup:reminder'), undefined);
});

test('buildAlertRows skips backup reminder while snoozed', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: '2026-06-01', // future
  }, '2026-05-15');
  assert.equal(alerts.find(a => a.id === 'backup:reminder'), undefined);
});

test('buildAlertRows re-emits backup reminder once snooze date passes', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: null,
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: '2026-05-01', // past
  }, '2026-05-15');
  assert.ok(alerts.find(a => a.id === 'backup:reminder'));
});

test('buildAlertRows skips backup reminder when last backup is fresh', () => {
  const alerts = buildAlertRows({
    isAppEmpty: false,
    lastBackupAt: '2026-05-10',
    backupReminderInterval: 30,
    backupReminderSnoozedUntil: null,
  }, '2026-05-15'); // 5 days later
  assert.equal(alerts.find(a => a.id === 'backup:reminder'), undefined);
});
```

- [ ] **Step 2: Run the alerts tests to verify they fail**

Vitest does NOT pick up `alerts.test.mjs` (it's not in the include allowlist). Run via Node directly:

Run: `node --test src/renderer/alerts.test.mjs`
Expected: The 7 new tests FAIL (the existing 2 tests still pass). Failure messages mention `backup:reminder` not found or undefined.

- [ ] **Step 3: Commit (red)**

```bash
git add src/renderer/alerts.test.mjs
git commit -m "CAR-77: failing tests for backup reminder detector"
```

---

## Task 4: Implement the backup reminder detector (green)

**Files:**
- Modify: `src/renderer/alerts.mjs`

- [ ] **Step 1: Add `'backup'` to KIND_RANK**

Edit `src/renderer/alerts.mjs` line 2. Change:

```js
const KIND_RANK = { bill: 0, budget: 1, account: 2, goal: 3, investment: 4, fx: 5 };
```

to:

```js
const KIND_RANK = { bill: 0, budget: 1, account: 2, goal: 3, investment: 4, fx: 5, backup: 6 };
```

- [ ] **Step 2: Add the `detectBackupReminder` helper above `buildAlertRows`**

In `src/renderer/alerts.mjs`, immediately above `export function buildAlertRows(...)` (currently line 24), insert:

```js
// CAR-77: Returns a backup reminder alert if the user hasn't backed up
// within the configured interval, or null. Pure: takes the inputs it
// needs, returns the alert shape used by AlertsHub.
export function detectBackupReminder({
  lastBackupAt,
  interval,
  snoozedUntil,
  todayIso,
}) {
  if (!interval || interval <= 0) return null;
  if (snoozedUntil && snoozedUntil > todayIso) return null;

  const daysBetween = (a, b) => {
    // Both inputs are 'YYYY-MM-DD'. Use UTC midnight to avoid DST drift.
    const ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
    return Math.floor(ms / 86_400_000);
  };

  if (!lastBackupAt) {
    return {
      id: 'backup:reminder',
      kind: 'backup',
      severity: 'low',
      title: 'BACK UP YOUR DATA',
      detail: 'NO BACKUP ON RECORD',
      metric: '',
      action: 'BACKUP',
      route: 'settings',
    };
  }

  const days = daysBetween(lastBackupAt, todayIso);
  if (days < interval) return null;

  return {
    id: 'backup:reminder',
    kind: 'backup',
    severity: 'low',
    title: 'BACK UP YOUR DATA',
    detail: `LAST BACKUP ${days} DAYS AGO`,
    metric: '',
    action: 'BACKUP',
    route: 'settings',
  };
}
```

- [ ] **Step 3: Extend `buildAlertRows` signature and emit the reminder**

Still in `src/renderer/alerts.mjs`, change the destructured parameter list of `buildAlertRows` (currently lines 24–35) to add the four new fields. The full updated signature:

```js
export function buildAlertRows({
  billRows = [],
  budgetRows = [],
  goals = [],
  accountsWithBalance = [],
  investments = [],
  dismissedAlertIds = [],
  rates = {},
  ratesUpdated = {},
  transactions = [],
  fxMigrationToastSeen = false,
  isAppEmpty = false,
  lastBackupAt = null,
  backupReminderInterval = 30,
  backupReminderSnoozedUntil = null,
} = {}, todayIso = new Date().toISOString().slice(0, 10)) {
```

Then, immediately before the final `return alerts.filter(...).sort(compareAlerts);` line (currently line 170), insert:

```js
  // CAR-77: backup reminder. Suppressed entirely when the app has no data
  // (an empty store has nothing to back up — and would just nag a brand-new
  // user). Otherwise gated by interval/snooze.
  if (!isAppEmpty) {
    const reminder = detectBackupReminder({
      lastBackupAt,
      interval: backupReminderInterval,
      snoozedUntil: backupReminderSnoozedUntil,
      todayIso,
    });
    if (reminder) alerts.push(reminder);
  }
```

- [ ] **Step 4: Run alerts tests to verify they pass**

Run: `node --test src/renderer/alerts.test.mjs`
Expected: All tests pass (existing 2 + new 7).

- [ ] **Step 5: Run Vitest to confirm nothing else regressed**

Run: `npm test`
Expected: All Vitest suites still pass.

- [ ] **Step 6: Commit (green)**

```bash
git add src/renderer/alerts.mjs
git commit -m "CAR-77: detectBackupReminder + alerts.mjs wiring"
```

---

## Task 5: Settings bridge — move 5 preferences from App.jsx into the store

This is a mechanical refactor that the spec calls "Option A" / "Settings bridge". It's required so that `exportBackup`/`restoreBackup` can read and write the settings without prop-drilling. Same localStorage keys, same defaults, no migration.

**Files:**
- Modify: `src/renderer/store.jsx`
- Modify: `src/renderer/App.jsx`

- [ ] **Step 1: Add the 5 settings useLS calls to `<StoreProvider>`**

Edit `src/renderer/store.jsx`. At the top of the file, immediately after the existing import block (after the `DEFAULT_RATES` import on line 13), add a new import line:

```js
import { ACCENTS } from './theme';
```

Inside `<StoreProvider>`, immediately after the existing `useLS` line for `fxMigrationToastSeen` (around line 110), add:

```js
  // CAR-77: settings keys moved from App.jsx's useTweaks. Same keys, same
  // defaults — zero migration. App.jsx no longer maintains its own useLS;
  // <AppShell> reads these via useStore() so backup/restore can see and
  // write them through the same surface as everything else.
  const [accent, setAccent]       = useLS('ledger:accent',   ACCENTS[0].val);
  const [density, setDensity]     = useLS('ledger:density',  'comfortable');
  const [decimals, setDecimals]   = useLS('ledger:decimals', true);
  const [currency, setCurrency]   = useLS('ledger:currency', 'USD');
  const [theme, setTheme]         = useLS('ledger:theme',    'light');

  // Move the data-theme effect from useTweaks to here.
  React.useEffect(() => {
    const valid = ['light', 'dark', 'auto'].includes(theme) ? theme : 'light';
    document.documentElement.setAttribute('data-theme', valid);
  }, [theme]);
```

- [ ] **Step 2: Expose the 5 settings on the context value**

In the `<StoreCtx.Provider value={{ ... }}>` block (currently ends around line 681), add inside the object:

```js
      accent, setAccent,
      density, setDensity,
      decimals, setDecimals,
      currency, setCurrency,
      theme, setTheme,
```

Place these alongside the other preference-style exports — e.g., right above `welcomeSeen`.

- [ ] **Step 3: Delete `useTweaks` and the duplicate `useLS` from App.jsx**

Edit `src/renderer/App.jsx`. Delete lines 36–72 (the `// ─── Tweaks ───` block, the `useLS` function, and the `useTweaks` function). Adjust top-of-file imports: keep the import of `ACCENTS` if any other file in this module uses it (it doesn't — `ACCENTS` is used elsewhere via WebSettings/DetailScreens). Change line 2 from:

```js
import { A, ACCENTS } from './theme';
```

to:

```js
import { A } from './theme';
```

- [ ] **Step 4: Read settings from the store inside `<AppShell>`**

In `src/renderer/App.jsx`, replace the body of `AppShell()` (currently lines 245–290) so it reads settings from the store instead of `useTweaks()`. The new function:

```js
function AppShell() {
  const {
    welcomeSeen, isAppEmpty,
    accent, setAccent,
    density, setDensity,
    decimals, setDecimals,
    currency, setCurrency,
    theme, setTheme,
  } = useStore();
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 1024);
  const [showImport, setShowImport] = React.useState(false);
  const [pendingAddAccount, setPendingAddAccount] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const t = { accent, density, decimals, currency, theme };
  const tweakProps = { setAccent, setDensity, setDecimals, setCurrency, setTheme };

  // Render priority:
  // 1. Welcome modal overlays everything when welcomeSeen === false.
  // 2. EmptyApp replaces the normal layout when isAppEmpty.
  // 3. Otherwise the existing MobileApp / DesktopApp.

  return (
    <>
      {isAppEmpty
        ? <EmptyApp
            onAddAccount={() => setPendingAddAccount(true)}
            onImport={() => setShowImport(true)}
          />
        : (isMobile
            ? <MobileApp t={t} {...tweakProps} />
            : <DesktopApp t={t} {...tweakProps} />)
      }
      {!welcomeSeen && (
        <Welcome onImport={() => setShowImport(true)} />
      )}
      {showImport && <ImportExport onClose={() => setShowImport(false)} />}
      {pendingAddAccount && (
        <AccountFromEmpty
          onClose={() => setPendingAddAccount(false)}
          t={t}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
```

(`MobileApp`, `DesktopApp`, and the rest of `App.jsx` are unchanged — they still receive `t` + setters as props.)

- [ ] **Step 5: Build + test verification**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...` line, no errors.

Run: `npm test`
Expected: All Vitest suites pass.

- [ ] **Step 6: Smoke test in dev (manual)**

Run: `npm run dev`

In the launched app:
1. Open Settings → change theme → confirm it applies.
2. Hard reload (Ctrl+R) → confirm the theme persists.
3. Change accent color → confirm it persists across reload.
4. Confirm DevTools → Application → Local Storage shows `ledger:accent`, `ledger:theme`, etc. unchanged in key names.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/store.jsx src/renderer/App.jsx
git commit -m "CAR-77: move 5 settings keys from App.jsx into <StoreProvider>"
```

---

## Task 6: Add backup state slices and store actions

**Files:**
- Modify: `src/renderer/store.jsx`

- [ ] **Step 1: Import buildBackup/parseBackup**

Edit `src/renderer/store.jsx`. After the existing `import { DEFAULT_RATES } from './fx.mjs';` (line 13), add:

```js
import { buildBackup } from './backup.mjs';
```

(`parseBackup` is consumed by `<BackupSection>` directly — the store only needs the builder.)

- [ ] **Step 2: Add the 3 backup state useLS calls**

Inside `<StoreProvider>`, immediately after the 5 settings `useLS` calls added in Task 5, add:

```js
  // CAR-77: backup metadata.
  // - lastBackupAt: ISO date string (YYYY-MM-DD) of the most recent successful
  //   exportBackup call, or null if the user has never backed up.
  // - backupReminderInterval: 0=Off, 7, 30, 90.
  // - backupReminderSnoozedUntil: ISO date until which the reminder is
  //   suppressed. Set when the user dismisses the reminder.
  const [lastBackupAt, setLastBackupAt] = useLS('ledger:lastBackupAt', null);
  const [backupReminderInterval, setBackupReminderIntervalRaw] = useLS('ledger:backupReminderInterval', 30);
  const [backupReminderSnoozedUntil, setBackupReminderSnoozedUntil] = useLS('ledger:backupReminderSnoozedUntil', null);

  const setBackupReminderInterval = React.useCallback(value => {
    const allowed = [0, 7, 30, 90];
    const next = allowed.includes(Number(value)) ? Number(value) : 30;
    setBackupReminderIntervalRaw(next);
  }, [setBackupReminderIntervalRaw]);
```

- [ ] **Step 3: Pass new fields into `buildAlertRows`**

In `src/renderer/store.jsx`, find the `buildAlertRows({...})` call (currently lines 165–179) and update the inputs and the dependency array. The full block becomes:

```js
  const alertRowsWithAccounts = React.useMemo(
    () => buildAlertRows({
      billRows,
      budgetRows,
      goals,
      accountsWithBalance,
      investments,
      dismissedAlertIds,
      rates,
      ratesUpdated,
      transactions,
      fxMigrationToastSeen,
      isAppEmpty,
      lastBackupAt,
      backupReminderInterval,
      backupReminderSnoozedUntil,
    }),
    [billRows, budgetRows, goals, accountsWithBalance, investments, dismissedAlertIds, rates, ratesUpdated, transactions, fxMigrationToastSeen, isAppEmpty, lastBackupAt, backupReminderInterval, backupReminderSnoozedUntil],
  );
```

NOTE: this depends on `isAppEmpty` being declared **before** the `buildAlertRows` call. In the current code, `isAppEmpty` is declared at line 181 — AFTER `buildAlertRows`. Move the `isAppEmpty` `useMemo` declaration to be immediately before the `alertRowsWithAccounts` `useMemo`. So the order becomes:

```js
  // [existing] accountsIncludedInTotals useMemo

  const isAppEmpty = React.useMemo(
    () => isAppEmptyFor({ txs, accounts, bills, goals, budgets, investments, trades }),
    [txs, accounts, bills, goals, budgets, investments, trades],
  );

  const alertRowsWithAccounts = React.useMemo(
    () => buildAlertRows({ /* …with isAppEmpty etc.… */ }),
    [/* …with isAppEmpty etc.… */],
  );
```

- [ ] **Step 4: Add `exportBackup`, `recordBackupTaken`, `restoreBackup` actions**

Still inside `<StoreProvider>`, immediately before the existing `reset` callback (currently around line 573), add:

```js
  // CAR-77: returns the JSON string the user will download. Reads the
  // current state synchronously via the captured useLS values; if React
  // hasn't yet committed a recent setter, the reader still sees the
  // committed copy in localStorage on next render — but for export-now,
  // these closure values are the live ones. Pure builder lives in
  // backup.mjs.
  const exportBackup = React.useCallback(() => {
    const obj = buildBackup({
      txs, accounts, catTree, budgets, hidden, bills, goals, goalContributions,
      investments, trades, rates, ratesUpdated,
      selectedPeriod, budgetStartDay,
      settings: { accent, density, decimals, currency, theme },
    });
    return JSON.stringify(obj, null, 2);
  }, [txs, accounts, catTree, budgets, hidden, bills, goals, goalContributions, investments, trades, rates, ratesUpdated, selectedPeriod, budgetStartDay, accent, density, decimals, currency, theme]);

  const recordBackupTaken = React.useCallback(() => {
    setLastBackupAt(new Date().toISOString().slice(0, 10));
    setBackupReminderSnoozedUntil(null); // a real backup clears any snooze.
  }, [setLastBackupAt, setBackupReminderSnoozedUntil]);

  // CAR-77: replaces the entire user-data state with the contents of a
  // validated backup. Single React batch — every setter fires before the
  // next render. Session ephemera (txFilter, dismissedAlerts, welcomeSeen,
  // fxMigrationToastSeen) is reset explicitly: post-restore they should
  // not carry over. lastBackupAt is NOT updated — restore is not a backup.
  const restoreBackup = React.useCallback(data => {
    setTxs(Array.isArray(data.transactions) ? data.transactions : []);
    setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    setCatTree(data.categoryTree && typeof data.categoryTree === 'object' ? data.categoryTree : DEFAULT_CAT_TREE);
    setBudgets(Array.isArray(data.budgets) ? data.budgets : []);
    setHidden(Array.isArray(data.hidden) ? data.hidden : []);
    setBills(Array.isArray(data.bills) ? data.bills : []);
    setGoals(Array.isArray(data.goals) ? data.goals : []);
    setGoalContributions(Array.isArray(data.goalContributions) ? data.goalContributions : []);
    setInvestments(Array.isArray(data.investments) ? data.investments : []);
    setTrades(Array.isArray(data.trades) ? data.trades : []);
    setRates(data.fxRates && typeof data.fxRates === 'object' ? data.fxRates : DEFAULT_RATES);
    setRatesUpdated(data.fxRatesUpdated && typeof data.fxRatesUpdated === 'object' ? data.fxRatesUpdated : {});
    if (data.selectedPeriod) setSelectedPeriod(data.selectedPeriod);
    if (data.budgetStartDay != null) setBudgetStartDay(data.budgetStartDay);

    // Settings: only apply keys the backup actually contains; missing keys
    // preserve the user's current setting.
    const s = data.settings || {};
    if (s.accent   !== undefined) setAccent(s.accent);
    if (s.density  !== undefined) setDensity(s.density);
    if (s.decimals !== undefined) setDecimals(s.decimals);
    if (s.currency !== undefined) setCurrency(s.currency);
    if (s.theme    !== undefined) setTheme(s.theme);

    // Session ephemera reset.
    setTxFilterRaw(null);
    setDismissedAlertIds([]);
    setWelcomeSeen(true);          // user is past the welcome by definition.
    setFxMigrationToastSeen(true); // restored data already has whatever rates it has.
    setBackupReminderSnoozedUntil(null);
    // Note: NOT touching lastBackupAt — restoring is not the same as backing up.
  }, [
    setTxs, setAccounts, setCatTree, setBudgets, setHidden, setBills, setGoals,
    setGoalContributions, setInvestments, setTrades, setRates, setRatesUpdated,
    setSelectedPeriod, setBudgetStartDay,
    setAccent, setDensity, setDecimals, setCurrency, setTheme,
    setTxFilterRaw, setDismissedAlertIds, setWelcomeSeen, setFxMigrationToastSeen,
    setBackupReminderSnoozedUntil,
  ]);
```

- [ ] **Step 5: Extend `dismissAlert` to handle the reminder**

In `src/renderer/store.jsx`, modify the `dismissAlert` callback (currently lines 508–514) to add a `'backup:reminder'` branch:

```js
  const dismissAlert = React.useCallback(id => {
    if (id === 'fx:migration-notice') {
      setFxMigrationToastSeen(true);
      return;
    }
    if (id === 'backup:reminder') {
      // Snooze for one full interval. Anchored to the dismiss-time interval,
      // not whatever the user changes it to afterwards.
      const days = Number(backupReminderInterval) || 30;
      const next = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      setBackupReminderSnoozedUntil(next);
      return;
    }
    setDismissedAlertIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, [setDismissedAlertIds, setFxMigrationToastSeen, backupReminderInterval, setBackupReminderSnoozedUntil]);
```

- [ ] **Step 6: Update the `reset` action to reset the new keys**

In the existing `reset` callback (currently lines 573–592) add three lines so the new state slices are cleared and the dep list is updated. The full updated function:

```js
  const reset = React.useCallback(() => {
    setTxs([]);
    setCatTree(DEFAULT_CAT_TREE);
    setBudgets([]);
    setAccounts([]);
    setBills([]);
    setGoals([]);
    setGoalContributions([]);
    setSelectedPeriod(monthKey(new Date()));
    setHidden([]);
    setBudgetStartDay(1);
    setInvestments([]);
    setTrades([]);
    setDismissedAlertIds([]);
    setTxFilterRaw(null);
    setRates(DEFAULT_RATES);
    setRatesUpdated({});
    setFxMigrationToastSeen(false);
    setWelcomeSeen(false);
    setLastBackupAt(null);
    setBackupReminderSnoozedUntil(null);
    setBackupReminderIntervalRaw(30);
  }, [setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades, setDismissedAlertIds, setTxFilterRaw, setRates, setRatesUpdated, setFxMigrationToastSeen, setWelcomeSeen, setLastBackupAt, setBackupReminderSnoozedUntil, setBackupReminderIntervalRaw]);
```

`resetAndLoadSampleData` should mirror these three lines. In the existing `resetAndLoadSampleData` callback (currently lines 551–571), insert after the `setWelcomeSeen(true);` line:

```js
    setLastBackupAt(null);
    setBackupReminderSnoozedUntil(null);
    setBackupReminderIntervalRaw(30);
```

And extend the dep array of `resetAndLoadSampleData` with `setLastBackupAt, setBackupReminderSnoozedUntil, setBackupReminderIntervalRaw`.

- [ ] **Step 7: Expose new fields on the context value**

In the `<StoreCtx.Provider value={{ ... }}>` block, add inside the object (alongside the other backup-adjacent items):

```js
      lastBackupAt,
      backupReminderInterval,
      setBackupReminderInterval,
      backupReminderSnoozedUntil,
      exportBackup,
      restoreBackup,
      recordBackupTaken,
```

- [ ] **Step 8: Build + test verification**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...`, no errors.

Run: `npm test`
Expected: All Vitest suites pass.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/store.jsx
git commit -m "CAR-77: store wiring — backup state, exportBackup, restoreBackup"
```

---

## Task 7: Build the shared `<BackupSection>` component

**Files:**
- Create: `src/renderer/components/BackupSection.jsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/components/BackupSection.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { useStore } from '../store';
import { parseBackup } from '../backup.mjs';

const INTERVAL_OPTIONS = [
  { val: 0,  label: 'OFF' },
  { val: 7,  label: '7d'  },
  { val: 30, label: '30d' },
  { val: 90, label: '90d' },
];

function downloadFile(name, contents, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contents], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Shared between WebSettings and mobile Settings. No layout chrome of its
// own beyond the section heading — the parent supplies surrounding
// padding/margins consistent with the rest of that screen's settings list.
export default function BackupSection() {
  const {
    lastBackupAt,
    backupReminderInterval,
    setBackupReminderInterval,
    exportBackup,
    restoreBackup,
    recordBackupTaken,
  } = useStore();

  const fileInputRef = React.useRef(null);
  const [pending, setPending] = React.useState(null); // { data, summary, warnings } | null
  const [pickerError, setPickerError] = React.useState(null);

  const handleBackupNow = () => {
    try {
      const json = exportBackup();
      downloadFile(`ledger-backup-${todayISO()}.ledger.json`, json);
      recordBackupTaken();
    } catch (err) {
      // Highly unlikely (Blob URL or builder error) — surface it.
      setPickerError('Couldn\u2019t create backup: ' + (err?.message || 'unknown error'));
    }
  };

  const handleRestoreClick = () => {
    setPickerError(null);
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseBackup(text);
      if (!result.ok) {
        setPickerError(result.error);
        return;
      }
      setPending(result);
    } catch (err) {
      setPickerError('Couldn\u2019t read file: ' + (err?.message || 'unknown error'));
    }
  };

  const handleConfirmRestore = () => {
    if (!pending) return;
    restoreBackup(pending.data);
    setPending(null);
  };

  return (
    <>
      <ALabel>BACKUP</ALabel>
      <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>

        {/* LAST BACKUP */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <span style={{ fontSize: 12 }}>LAST BACKUP</span>
          <span style={{ fontSize: 11, color: A.muted }}>
            {lastBackupAt || 'NEVER'}
          </span>
        </div>

        {/* BACKUP NOW */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>BACKUP · NOW</div>
            <div style={{ fontSize: 11, marginTop: 3 }}>Download a full snapshot</div>
          </div>
          <button onClick={handleBackupNow} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
            padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
          }}>BACKUP NOW</button>
        </div>

        {/* RESTORE FROM BACKUP */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>RESTORE · FROM · BACKUP</div>
            <div style={{ fontSize: 11, marginTop: 3 }}>Replace all current data</div>
          </div>
          <button onClick={handleRestoreClick} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
            padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
          }}>CHOOSE FILE</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.ledger.json,application/json"
            style={{ display: 'none' }}
            onChange={e => { handleFileChosen(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        {pickerError && (
          <div style={{ padding: '9px 0', fontSize: 10, letterSpacing: 1, color: A.neg, borderBottom: '1px solid ' + A.rule2 }}>
            ✗ {pickerError}
          </div>
        )}

        {/* REMINDER INTERVAL */}
        <div style={{ padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>REMINDER · INTERVAL</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {INTERVAL_OPTIONS.map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setBackupReminderInterval(val)}
                style={{
                  all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                  padding: '5px 10px', border: '1px solid ' + (backupReminderInterval === val ? A.ink : A.rule2),
                  background: backupReminderInterval === val ? A.ink : 'transparent',
                  color: backupReminderInterval === val ? A.bg : A.ink,
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {pending && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPending(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: A.font,
          }}
        >
          <div style={{
            background: A.bg, color: A.ink,
            border: '2px solid ' + A.ink,
            padding: '24px 22px',
            width: 'min(420px, 92vw)',
          }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>RESTORE · FROM · BACKUP</div>
            <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
              This will replace all current data with the contents of this backup.
            </div>

            <div style={{ marginTop: 14, fontSize: 10, color: A.ink, letterSpacing: 0.6, lineHeight: 1.7 }}>
              {Object.entries(pending.summary).map(([k, n]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: A.muted, textTransform: 'uppercase' }}>{k}</span>
                  <span>{n}</span>
                </div>
              ))}
            </div>

            {pending.warnings.length > 0 && (
              <div style={{ marginTop: 14, padding: '8px 10px', border: '1px solid ' + A.rule2, fontSize: 10, color: A.muted, letterSpacing: 0.6 }}>
                {pending.warnings.map((w, i) => <div key={i}>! {w}</div>)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setPending(null)} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
              }}>CANCEL</button>
              <button onClick={handleConfirmRestore} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.neg, background: A.neg, color: A.bg,
              }}>REPLACE MY DATA</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...`, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/BackupSection.jsx
git commit -m "CAR-77: <BackupSection> shared component"
```

---

## Task 8: Render `<BackupSection>` in WebSettings and mobile Settings

**Files:**
- Modify: `src/renderer/screens/web/WebSettings.jsx`
- Modify: `src/renderer/screens/mobile/DetailScreens.jsx`

- [ ] **Step 1: Import and render `<BackupSection>` in WebSettings**

Edit `src/renderer/screens/web/WebSettings.jsx`. After the existing import of `FxRatesSection` (line 7), add:

```js
import BackupSection from '../../components/BackupSection';
```

Then, in the right column of the preferences grid, render `<BackupSection>` immediately above the existing `{/* DATA */}` block (currently around line 300). Insert:

```jsx
          {/* BACKUP */}
          <div style={{ marginTop: 20 }}>
            <BackupSection />
          </div>
```

- [ ] **Step 2: Import and render `<BackupSection>` in mobile Settings**

Edit `src/renderer/screens/mobile/DetailScreens.jsx`. Find the existing `import FxRatesSection from ...` (it's near the top of the file with the other imports — search for `FxRatesSection`). Add after it:

```js
import BackupSection from '../../components/BackupSection';
```

Then in the `Settings` export (the function defined at line 872), render `<BackupSection>` immediately above the `{/* DATA */}` block (currently around line 1023). Insert:

```jsx
      {/* BACKUP */}
      <div style={{ marginTop: 14 }}>
        <BackupSection />
      </div>
```

- [ ] **Step 3: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...`, no errors.

- [ ] **Step 4: Smoke test in dev (manual)**

Run: `npm run dev`

In the launched app:
1. Web view: open Settings → confirm `BACKUP` section appears between FX RATES/BUDGETS area and DATA. Click `BACKUP NOW` → file downloads as `ledger-backup-YYYY-MM-DD.ledger.json`.
2. Open the downloaded file in Notepad → confirm valid JSON with `_type: "ledger-backup"`, `version: 1`, all 14 slices present.
3. Click `CHOOSE FILE` → pick the just-downloaded file → confirmation modal shows summary counts → click `REPLACE MY DATA` → app re-renders with same data.
4. Resize the window narrow (<1024px) → mobile layout → tap MORE → SETTINGS → confirm `BACKUP` section is present and functional.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/screens/web/WebSettings.jsx src/renderer/screens/mobile/DetailScreens.jsx
git commit -m "CAR-77: render <BackupSection> in WebSettings and mobile Settings"
```

---

## Task 9: Update stale toast text in `<ImportExport>`

**Files:**
- Modify: `src/renderer/components/ImportExport.jsx`

The existing legacy modal has a `RESET TO DEFAULTS` button whose toast says `'Reset to sample data'` (line 129). Since CAR-76, `reset()` no longer seeds samples — it produces an empty store. Fix the message.

- [ ] **Step 1: Fix the toast string**

Edit `src/renderer/components/ImportExport.jsx` line 129. Change:

```jsx
            onClick={() => { store.reset(); setStatus({ ok: true, msg: 'Reset to sample data' }); }}
```

to:

```jsx
            onClick={() => { store.reset(); setStatus({ ok: true, msg: 'Reset to empty' }); }}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...`, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ImportExport.jsx
git commit -m "CAR-77: ImportExport reset toast - 'Reset to empty', not samples"
```

---

## Task 10: Verification — full-stack manual checklist + final test/build

- [ ] **Step 1: Run the full Vitest suite**

Run: `npm test`
Expected: All Vitest tests pass (including new `backup.test.mjs` cases).

- [ ] **Step 2: Run the node:test suites individually**

Run: `node --test src/renderer/alerts.test.mjs src/renderer/charts.test.mjs src/renderer/period.test.mjs src/renderer/planning.test.mjs`
Expected: All tests pass (including the new backup-reminder cases in `alerts.test.mjs`).

- [ ] **Step 3: Run the production build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...`, no errors.

- [ ] **Step 4: Manual verification — backup happy path**

Run: `npm run dev`. In the launched app:

1. (Optional, only if your store is empty): Settings → DATA → `LOAD SAMPLE DATA` to get something to back up.
2. Settings → BACKUP → click `BACKUP NOW`.
3. ✅ Browser downloads `ledger-backup-YYYY-MM-DD.ledger.json`.
4. ✅ Settings shows `LAST BACKUP YYYY-MM-DD`.
5. Open the downloaded file in a text editor.
6. ✅ Valid JSON. ✅ `_type === "ledger-backup"`. ✅ `version === 1`. ✅ All 14 data slices keys present (`transactions`, `accounts`, `categoryTree`, `budgets`, `hidden`, `bills`, `goals`, `goalContributions`, `investments`, `trades`, `fxRates`, `fxRatesUpdated`, `selectedPeriod`, `budgetStartDay`). ✅ `settings` block has all 5 keys.

- [ ] **Step 5: Manual verification — restore happy path**

1. In Settings → BACKUP → `CHOOSE FILE` → pick the file you just downloaded.
2. ✅ Confirmation modal appears with summary counts matching the file.
3. Click `REPLACE MY DATA`.
4. ✅ Modal closes, app re-renders. Data unchanged (round-trip).

- [ ] **Step 6: Manual verification — restore validation**

Make a copy of the backup file. In a text editor:

1. Edit the copy → change `"_type": "ledger-backup"` to `"_type": "something-else"` → save → restore → ✅ inline error: `Not a Ledger backup file.`
2. Restore another copy → set `"version": 999` → ✅ error: `Backup was made with a newer version of Ledger (v999). Please update.`
3. Restore another copy → delete the entire `bills: [...]` line → confirm modal opens → click `REPLACE MY DATA` → ✅ Bills page is empty, everything else preserved.
4. Restore a non-JSON file (e.g., a `.txt` with junk) → ✅ error: `Not a valid JSON file.`
5. Restore a backup with `"accounts": "not an array"` → ✅ confirm modal shows a warning about `accounts` slice. Restore proceeds → accounts is empty.

- [ ] **Step 7: Manual verification — auto-backup reminder**

1. Settings → BACKUP → set `REMINDER INTERVAL` to `7d`.
2. DevTools → Application → Local Storage → set `ledger:lastBackupAt` to `"2020-01-01"` and `ledger:backupReminderSnoozedUntil` to `null`. Refresh.
3. ✅ AlertsHub shows `BACK UP YOUR DATA` reminder.
4. Dismiss the reminder → ✅ disappears.
5. DevTools → set `ledger:backupReminderSnoozedUntil` to `"2020-01-01"`. Refresh. ✅ reminder reappears.
6. Set `REMINDER INTERVAL` to `OFF`. Refresh. ✅ no reminder regardless of `lastBackupAt`.
7. Reset the store: Settings → DATA → `RESET ALL DATA`. ✅ no reminder (empty store gates it out).

- [ ] **Step 8: Manual verification — Settings refactor smoke test**

1. Open Settings → change theme to dark. ✅ dark mode applies.
2. Hard reload (Ctrl+R). ✅ theme stays dark.
3. Change accent color → reload → ✅ persists.
4. DevTools → Application → Local Storage → ✅ keys are still `ledger:accent`, `ledger:density`, `ledger:decimals`, `ledger:currency`, `ledger:theme` (unchanged from before this PR).

- [ ] **Step 9: Manual verification — ImportExport reset toast**

1. Open the legacy import/export modal (the ⇅ button bottom-right of the desktop app, OR Settings → IMPORT · EXPORT on mobile).
2. Click `RESET TO DEFAULTS` at the bottom.
3. ✅ Toast reads `Reset to empty` (NOT `Reset to sample data`).

Stop the dev server.

- [ ] **Step 10: Self-review with `git diff`**

Run: `git diff origin/dev-master..HEAD --stat`
Expected: ~10 files touched, ~one commit per task. Sanity-check no unintended changes (e.g., demo data not committed, no `.mmbak`/`.xlsx`/`patch_tasks.js` files staged).

Run: `git status`
Expected: Working tree clean (or only the pre-existing untracked stuff: `.claude/`, `.playwright-mcp/`, `20260514_130628.mmbak`, `CASHBOOK_*.xlsx`, `patch_tasks.js`, the unrelated currency-formatting spec). NONE of those should be staged or new on this branch.

---

## Task 11: PR + code review + Linear transitions

- [ ] **Step 1: Move CAR-77 to QA**

```powershell
$mut = 'mutation { issueUpdate(id: "CAR-77", input: { stateId: "1d3c43d9-e1aa-4cba-aedb-bbc69e1c9bc9" }) { success } }'
$body = @{ query = $mut } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method POST -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | Out-Null
```

NOTE: If the QA stateId above is wrong, fetch it with:

```powershell
$q = 'query { workflowStates(filter: { team: { key: { eq: "CAR" } } }) { nodes { id name } } }'
$body = @{ query = $q } | ConvertTo-Json -Compress
(Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method POST -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body).data.workflowStates.nodes | Format-Table
```

- [ ] **Step 2: Push branch and open PR**

```bash
git push -u origin car-77-backup-restore
gh pr create --base dev-master --title "CAR-77: full-state backup, restore, and auto-backup reminder" --body "Implements CAR-77 per docs/superpowers/specs/2026-05-19-car-77-backup-restore-design.md and docs/superpowers/plans/2026-05-19-car-77-backup-restore.md.

Highlights:
- New \`backup.mjs\` module: \`buildBackup\`, \`parseBackup\`, \`validateBackup\` (Vitest covered).
- Settings BACKUP section in both web and mobile: BACKUP NOW, RESTORE FROM BACKUP, REMINDER INTERVAL.
- Auto-backup reminder via existing alerts pipeline (gated by \`!isAppEmpty\`).
- Settings bridge: 5 preference keys moved from App.jsx into <StoreProvider>. Zero migration (same keys, same defaults).
- Stale 'Reset to sample data' toast fixed to 'Reset to empty'.

Out of scope (future issues): cloud backup, encryption, auto-save-to-filesystem (CAR-91), merge-mode restore, MMBAK→ledger-backup migration, component-level UI tests (CAR-90).

Fixes CAR-77"
```

- [ ] **Step 3: Dispatch code-reviewer subagent**

Per AGENTS.md flow and the lesson from CAR-75/CAR-76, do NOT skip the pre-merge code review. Use the requesting-code-review skill template, dispatch a `general` subagent against the diff `origin/dev-master..HEAD` of this branch.

If the reviewer finds Critical or Important issues:
- Move CAR-77 back to `In Progress`.
- Fix.
- Re-dispatch the reviewer.
- Repeat until approved.

- [ ] **Step 4: Move CAR-77 to Ready for Testing**

After the reviewer approves:

```powershell
$mut = 'mutation { issueUpdate(id: "CAR-77", input: { stateId: "601b0ea6-3ced-49c9-aeaa-613bb00d8b7a" }) { success } }'
$body = @{ query = $mut } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method POST -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | Out-Null
```

Hand off to user for merge.

---

## Plan complete

After PR merge:
1. Move CAR-77 to **PR ready** (when PR approved) and **Done** (after merge).
2. Surface any follow-ups discovered during review (e.g., CAR-90 component tests, CAR-153 Vitest unification) as separate issues if not already tracked.
