# CAR-77 — Full-State Backup, Restore, and Auto-Backup Reminder: Design

**Status:** Draft → review
**Date:** 2026-05-19
**Linear:** [CAR-77](https://linear.app/carloshrdezc/issue/CAR-77)

## Summary

Add a dedicated, full-state backup/restore mechanism: one-click "Backup now" exports a self-contained `.ledger.json` file covering every slice of user data plus user preferences; "Restore from backup" replaces all current data with a backup's contents (with strict validation and a summary confirmation); an auto-backup reminder nags the user via the existing alerts pipeline if they haven't backed up in a configurable interval (default 30 days). Backup is the canonical recovery mechanism for an app whose only persistence is `localStorage`.

## Problem

Today, every byte of user data lives in `localStorage`:

- 18 ledger keys (transactions, accounts, categories, budgets, bills, goals, contributions, investments, trades, FX rates, plus session-ephemera like `txFilter` and dismissed alerts) — written by `<StoreProvider>`.
- 5 App-level settings keys (accent, density, decimals, currency, theme) — written by `App.jsx` via a duplicate `useLS` hook.

A single Chrome cache clear, a `localStorage.clear()` from DevTools, an extension misbehavior, or a moved-to-new-machine scenario destroys everything irrecoverably. The existing `<ImportExport>` modal has a `MMBAK · FULL BACKUP` button — but it's *partial* (covers only 7 of the 14 user-data slices), confusingly shares its file format with the MoneyMoney importer, and is not surfaced as the recovery mechanism.

CAR-77 fixes this by introducing a separate, complete, well-validated backup format and a dedicated Settings surface that says clearly: *"this is how you make sure your data survives."*

## Goal

A user can:

1. **Click one button** → download a single file that captures everything.
2. **Click another button** → pick that file → confirm → restore everything.
3. Be **reminded** when their last backup is stale.
4. Have their backup work **across machines** with no machine-bound IDs.

## Decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Relate to existing MMBAK / `<ImportExport>` | **B** — Build a new dedicated format separate from MMBAK; keep MMBAK for what it is today (MoneyMoney import). |
| 2 | What does "everything" cover | **B** — All 14 user-data slices + 5 user preferences; skip 4 session-ephemera keys. |
| 3a | File format shape | **A** — Flat JSON with top-level `version` + each slice as a top-level key. |
| 3b | File extension | `.ledger.json` (double-extension; the `.json` part lets editors recognize it). |
| 4 | Restore mode | **A** — Replace only. Merge is a future issue if anyone needs it. |
| 5 | Auto-backup reminder | **A** — Reuse the existing alerts pipeline (matches the FX migration notice pattern from CAR-75). |
| 6 | Settings UI placement | **A** — New top-level `BACKUP` section in Settings, separate from `DATA`. |
| 7 | Restore validation strictness | **C** — Strict on identity/version, tolerant on slice presence. |
| Settings bridge | App-level settings need to be reachable from `exportBackup`/`restoreBackup` | **A** — Move the 5 settings keys from `App.jsx`'s `useTweaks` into `<StoreProvider>`. Eliminates duplicate `useLS`, makes backup/restore clean, addresses a deferred CAR-76 review item. |

## Non-goals (separate issues)

- **Cloud / server-side backup** — out of scope. v1 is local-file only.
- **Encrypted backups** — out of scope. JSON is plaintext.
- **Auto-save-to-filesystem without user confirmation** — requires Electron IPC + permissions; covered by CAR-91 later.
- **Merge mode for restore** — future issue if the use case appears.
- **Migration from existing `.mmbak` Ledger backups** — YAGNI for v1; the new format is what we recommend going forward, MMBAK still exists in `<ImportExport>` for legacy users.
- **Component-level tests for `<BackupSection>`, alert detector, store actions** — deferred to CAR-90.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  src/renderer/backup.mjs       (new, pure)          │
│  ─────────────────────────────                       │
│  BACKUP_FORMAT_VERSION = 1                          │
│  BACKUP_TYPE = 'ledger-backup'                      │
│                                                      │
│  buildBackup(state, appVersion?) → object           │
│  parseBackup(jsonString)                            │
│    → { ok: true, data, summary, warnings }          │
│    | { ok: false, error }                           │
│  validateBackup(obj) → same shape (testable)        │
└──────────────────────┬──────────────────────────────┘
                       │ used by
┌──────────────────────▼──────────────────────────────┐
│  src/renderer/store.jsx                             │
│  ─────────────────────                              │
│  + Settings useLS calls (moved from App.jsx):       │
│    accent, density, decimals, currency, theme       │
│  + Backup-related state:                             │
│    lastBackupAt        (ISO date or null)           │
│    backupReminderInterval  (number; 0=Off)          │
│    backupReminderSnoozedUntil  (ISO date or null)   │
│  + New actions:                                     │
│    exportBackup() → string                          │
│    restoreBackup(data) → void                       │
│    recordBackupTaken() → void                       │
│  + dismissAlert('backup:reminder') → sets snooze    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  src/renderer/alerts.mjs                            │
│  + KIND_RANK gains 'backup'                         │
│  + detectBackupReminder(...) detector               │
│    Gated by !isAppEmpty (no nag for empty stores)   │
│  + dismissAlert mapping: 'backup:reminder' →        │
│    setBackupReminderSnoozedUntil = today + interval │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  src/renderer/components/BackupSection.jsx (new)    │
│  ──────────────────────────────────────────         │
│  Shared UI used by both WebSettings and mobile      │
│  Settings:                                           │
│   - LAST BACKUP row (read-only display)             │
│   - BACKUP NOW button → exportBackup → download     │
│     (calls recordBackupTaken on success)            │
│   - RESTORE FROM BACKUP button → file picker →      │
│     parseBackup → confirmation modal → confirm →    │
│     restoreBackup                                   │
│   - REMINDER INTERVAL picker (Off / 7 / 30 / 90)    │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  src/renderer/App.jsx                               │
│  Settings hook (`useTweaks`) is removed.            │
│  AppShell reads accent/density/decimals/currency/   │
│  theme from useStore() directly.                    │
└─────────────────────────────────────────────────────┘
```

### Backup file shape

```json
{
  "_type": "ledger-backup",
  "version": 1,
  "exportedAt": "2026-05-19T15:30:00Z",
  "appVersion": "1.0.0",

  "transactions": [...],
  "accounts": [...],
  "categoryTree": {...},
  "budgets": [...],
  "hidden": [...],
  "bills": [...],
  "goals": [...],
  "goalContributions": [...],
  "investments": [...],
  "trades": [...],
  "fxRates": {...},
  "fxRatesUpdated": {...},
  "selectedPeriod": "2026-05",
  "budgetStartDay": 1,

  "settings": {
    "accent": "#fb6c2e",
    "density": "comfortable",
    "decimals": true,
    "currency": "USD",
    "theme": "auto"
  }
}
```

**Skipped (session ephemera):** `txFilter`, `dismissedAlerts`, `welcomeSeen`, `fxMigrationToastSeen`, `lastBackupAt`, `backupReminderInterval`, `backupReminderSnoozedUntil`. These reset to clean state on restore.

**Default download filename:** `ledger-backup-YYYY-MM-DD.ledger.json`.

### Storage shape

No localStorage key changes for existing data slices. New keys:

```
ledger:lastBackupAt              = ISO date string | null  (default null)
ledger:backupReminderInterval    = 0 | 7 | 30 | 90         (default 30)
ledger:backupReminderSnoozedUntil = ISO date string | null  (default null)
```

The 5 settings keys (`ledger:accent`, `ledger:density`, `ledger:decimals`, `ledger:currency`, `ledger:theme`) are NOT migrated — `<StoreProvider>` uses the same key names with the same defaults that `App.jsx` was using. Existing users see no migration; the hook just moved files.

## Components & Data Flow

### Backup flow

```
user clicks "BACKUP NOW"
  ↓
BackupSection.handleBackup()
  ↓
const json = exportBackup()           // store action
              ↓
              buildBackup(state)      // pure
  ↓
download(`ledger-backup-${today}.ledger.json`, json)
  ↓
recordBackupTaken()                   // store action
  ↓
setLastBackupAt(today)                // hides the reminder alert
```

### Restore flow

```
user clicks "RESTORE FROM BACKUP"
  ↓
hidden <input type="file"> opens
  ↓
file selected → file.text()
  ↓
const result = parseBackup(text)      // pure (validation)
  ↓
if (!result.ok) → show error inline; restore disabled
else → show confirmation modal with result.summary + warnings
  ↓
user clicks "Replace my data"
  ↓
restoreBackup(result.data)            // store action — atomic React batch
  ↓
session ephemera cleared (txFilter, dismissedAlerts, welcomeSeen=true,
fxMigrationToastSeen=true)
```

### Alert reminder flow

```
buildAlertRows({ ..., lastBackupAt, backupReminderInterval,
                 backupReminderSnoozedUntil, isAppEmpty, todayIso })
  ↓
if (isAppEmpty) → skip
else detectBackupReminder({ lastBackupAt, interval, snoozedUntil, todayIso })
  ↓
returns { id: 'backup:reminder', kind: 'backup', severity: 'low',
          title, detail, action: 'BACKUP', route: 'settings' }  | null
  ↓
user dismisses → dismissAlert('backup:reminder')
  ↓
store sets backupReminderSnoozedUntil = today + interval
  ↓
detector now returns null until that date passes
```

### `<BackupSection>` UI sketch

```
─── BACKUP ──────────────────────────────────
 LAST BACKUP                  2026-05-14
                              (or "never")
─────────────────────────────────────────────
 BACKUP NOW           [BACKUP NOW]
─────────────────────────────────────────────
 RESTORE FROM BACKUP  [CHOOSE FILE]
─────────────────────────────────────────────
 REMINDER INTERVAL    OFF · 7d · 30d · 90d
─────────────────────────────────────────────
```

Visual style follows the existing Settings DATA section pattern.

### Settings bridge — what moves

App.jsx today:

```js
function useTweaks() {
  const [accent, setAccent]     = useLS('ledger:accent',   ACCENTS[0].val);
  const [density, setDensity]   = useLS('ledger:density',  'comfortable');
  const [decimals, setDecimals] = useLS('ledger:decimals', true);
  const [currency, setCurrency] = useLS('ledger:currency', 'USD');
  const [theme, setTheme]       = useLS('ledger:theme',    'light');

  React.useEffect(() => { /* apply theme to <html data-theme> */ }, [theme]);

  return { accent, setAccent, density, setDensity, decimals, setDecimals, currency, setCurrency, theme, setTheme };
}
```

After this issue:

- `useTweaks` is deleted.
- The 5 `useLS` calls move into `<StoreProvider>` alongside the other state slices.
- The `data-theme` effect moves into `<StoreProvider>` too.
- Store context exposes: `accent`, `setAccent`, `density`, `setDensity`, `decimals`, `setDecimals`, `currency`, `setCurrency`, `theme`, `setTheme`.
- `<AppShell>` reads them from `useStore()` instead of calling `useTweaks()`.
- `t` object construction (`{ accent, density, decimals, currency, theme }`) moves into `<AppShell>`.
- `MobileApp`/`DesktopApp` prop signatures unchanged — they still accept `t` and the setters.

Pre-existing localStorage keys (`ledger:accent`, etc.) are unchanged. Existing users see no migration.

## Files Touched

| File | Status | Purpose |
|---|---|---|
| `src/renderer/backup.mjs` | NEW | Pure backup helpers + format constants |
| `src/renderer/backup.test.mjs` | NEW | Vitest tests |
| `src/renderer/store.jsx` | MODIFY | Settings useLS calls moved in; backup state + actions; alerts wiring |
| `src/renderer/alerts.mjs` | MODIFY | Add `'backup'` kind + `detectBackupReminder` |
| `src/renderer/components/BackupSection.jsx` | NEW | Shared Settings UI |
| `src/renderer/screens/web/WebSettings.jsx` | MODIFY | Render `<BackupSection>` |
| `src/renderer/screens/mobile/DetailScreens.jsx` | MODIFY | Same in mobile Settings export |
| `src/renderer/App.jsx` | MODIFY | Delete `useTweaks`; `<AppShell>` reads settings from store; theme effect moved out |
| `src/renderer/components/ImportExport.jsx` | MODIFY (small) | Update stale "Reset to sample data" toast → "Reset to empty" |
| `vitest.config.mjs` | MODIFY | Allowlist `backup.test.mjs` |

## Error Handling and Edge Cases

| Case | Behavior |
|---|---|
| User picks a non-JSON file | `parseBackup` catches the SyntaxError; modal shows "Not a valid JSON file." Restore button stays disabled. |
| JSON without `_type` or wrong `_type` | "Not a Ledger backup file." |
| `version` missing or non-integer or `< 1` | "Backup version is missing or invalid." |
| Future `version > BACKUP_FORMAT_VERSION` | "Backup was made with a newer version of Ledger (vN). Please update." Refuse. |
| Older `version` (e.g., v0 if we ever bump) | Accept. Slices added later are absent → defaults applied. Console warn each missing slice. |
| Slice exists with wrong type (e.g., `accounts` is a string) | Skip that slice; surface in confirmation modal as a warning. User decides to proceed. |
| Backup with empty store | Backup still works; produces JSON with empty arrays. Reminder alert wouldn't have triggered (gated by `!isAppEmpty`), but explicit backup-now is always allowed. |
| Restore confirmation — user clicks "Replace my data" | All 14 data slices + settings written in one React batch. Session ephemera (`txFilter`, `dismissedAlerts`, `welcomeSeen`, `fxMigrationToastSeen`) explicitly reset. `lastBackupAt` is NOT updated — restore ≠ backup. |
| Restore with missing settings | `applySettings` is a no-op; existing settings preserved. |
| Reminder interval = 0 (Off) | Detector returns `null` immediately. |
| User dismisses the reminder | Sets `backupReminderSnoozedUntil = today + interval`. Detector returns null until that date passes. |
| User changes interval AFTER snoozing | Snooze stays anchored to the dismiss-time interval; new interval applies the next time the alert is calculated post-snooze-expiry. |
| User clicks "Backup now" while snoozed | `lastBackupAt` updates → detector now uses real backup date instead of snooze. Reminder is suppressed by the actual backup. |
| File picker cancelled | No-op. |
| File reader fails (corrupt, encoding) | Caught in BackupSection's wrapper; surfaces "Couldn't read file." inline. |
| User restores while welcome modal is open | After restore, `setWelcomeSeen(true)` ensures the welcome doesn't re-appear. |
| Hand-edited / third-party `.ledger.json` | Same validation path. If `_type === 'ledger-backup'` and `version` valid → accepted, tolerant on slices. |
| Existing `.mmbak` Ledger backups in the wild | Not handled. CAR-77 introduces a NEW format; the old MMBAK round-trip stays in `<ImportExport>`. |
| `lastBackupAt` ISO date timezone | Use `new Date().toISOString().slice(0, 10)` — UTC date. Consistent with how `ratesUpdated` already formats. |

### Settings-bridge edge cases

| Case | Behavior |
|---|---|
| Existing user has `ledger:accent` etc. in localStorage from before this PR | `<StoreProvider>` reads same keys via `useLS('ledger:accent', ...)`. Same key, same default. Zero migration needed. |
| `<App>` previously called `useTweaks()` | Replaced by `useStore()` reads inside `<AppShell>`. Existing prop signatures of `MobileApp`/`DesktopApp` unchanged. |
| Theme `<html data-theme>` effect | Moves from `useTweaks` to `<StoreProvider>`. Same trigger, same DOM mutation. |

## Testing

`backup.test.mjs` (Vitest):

- `buildBackup` returns object with `_type === 'ledger-backup'`, `version === 1`, all 14 slices, settings.
- `buildBackup` handles missing/undefined slices in input → emits empty arrays/objects.
- `parseBackup` accepts valid JSON with our shape → `{ ok: true, data, summary }`.
- `parseBackup` rejects invalid JSON.
- `parseBackup` rejects wrong `_type`.
- `parseBackup` rejects missing/non-integer `version`.
- `parseBackup` rejects future `version` (>BACKUP_FORMAT_VERSION).
- `parseBackup` accepts older `version` (e.g., 0 or 1 after we bump to 2).
- `validateBackup` skips wrong-typed slices and emits warnings.
- `validateBackup` builds correct summary counts.
- Round-trip: `parseBackup(JSON.stringify(buildBackup(state)))` returns equivalent data.
- `parseBackup` handles a backup missing entire settings block.

Component-level tests for `<BackupSection>`, alert detector, store actions deferred to CAR-90 per established pattern.

## Manual Verification

After implementation:

- "Backup now" → `ledger-backup-YYYY-MM-DD.ledger.json` downloads. Open file → valid JSON, all 14 slices and settings present.
- "Restore from backup" → file picker → pick the just-downloaded file → confirmation modal shows correct summary → "Replace my data" → app re-renders with the same data.
- Edit the JSON: remove `bills` array → restore → Bills page is empty, everything else preserved.
- Edit the JSON: corrupt `_type` → restore button shows "Not a Ledger backup file." Refuses.
- Edit the JSON: `version` = 999 → "newer version of Ledger" error.
- Reminder interval = 7d, set `lastBackupAt` to 8 days ago via DevTools → AlertsHub shows "BACKUP REMINDER".
- Dismiss the reminder → it disappears. Set system date forward by `interval` days → reminder reappears.
- Reminder interval = Off → no alert appears regardless of `lastBackupAt`.
- Empty store + reminder enabled → no reminder.
- After restore: previous `welcomeSeen=false` is overridden to `true`; existing `dismissedAlerts` cleared.
- Settings refactor smoke test: change theme → dark mode applies AND persists across page reload.
- "RESET TO DEFAULTS" button in `<ImportExport>` (the legacy modal) toast text reads "Reset to empty" not "Reset to sample data".

## Acceptance Criteria

- [ ] `backup.mjs` exists with `BACKUP_FORMAT_VERSION = 1`, `BACKUP_TYPE = 'ledger-backup'`, `buildBackup`, `parseBackup`, `validateBackup`.
- [ ] `<BackupSection>` shared component exists and is rendered in WebSettings AND mobile Settings.
- [ ] Backup file name format: `ledger-backup-YYYY-MM-DD.ledger.json`.
- [ ] Backup covers all 14 data slices listed in the spec + 5 settings keys.
- [ ] Restore validates `_type`, `version`; refuses unknown / future versions; tolerant on slice presence.
- [ ] Restore confirmation modal shows summary counts AND any warnings before user confirms.
- [ ] Restore writes all setters in one React batch; clears session ephemera.
- [ ] App-level settings (accent/density/decimals/currency/theme) move from `App.jsx` `useTweaks` into `<StoreProvider>`.
- [ ] `useTweaks` is deleted; `<AppShell>` reads from `useStore()`.
- [ ] Auto-backup reminder alert appears in AlertsHub when conditions met; doesn't appear when `isAppEmpty` or interval=0 or snoozed.
- [ ] Dismissing the reminder snoozes it for one interval.
- [ ] `<ImportExport>` "RESET TO DEFAULTS" toast updated to reflect new reset behavior.
- [ ] `npm test` runs Vitest with passing `backup.test.mjs`.
- [ ] `npx vite build` exits 0.

## Dependencies and Sequencing

- **Depends on:** none (CAR-75 and CAR-76 already merged).
- **Unblocks:** real data safety story for any user; CAR-91 (Electron IPC + on-disk state) eventually replaces the localStorage substrate but Backup remains useful regardless.
- **Pairs with:** none required, but every issue that adds new state slices going forward should also extend `BACKUP_FORMAT_VERSION` and add the slice to `buildBackup`.

## Notes for Implementers

- The `BACKUP_FORMAT_VERSION` constant is the only place to bump when slices change. Tests verify a `version` greater than the current is rejected.
- `restoreBackup` should NOT call `recordBackupTaken` — restore is not a backup.
- The `<a download>` Blob URL approach works in Electron renderer; no IPC needed.
- The Settings refactor (Option A) is included in this issue intentionally — it's a small change that makes backup/restore much cleaner. Reviewer can verify the move is mechanical (same keys, same defaults, just relocated) and zero-migration.
