# Phase 1 — Live Data Layer

**Date:** 2026-05-14  
**Status:** Approved

## Goal

Make account balances computed and live: they update automatically as transactions are added, edited, or deleted. Also fix two foundational bugs in the data model that block all future phases: lossy date storage and missing account linkage on import.

---

## Part 1 — Transaction date model

### Current state
Transactions store `d: number` — the day-of-month only (e.g. `d: 15`). The seed data uses it as a relative offset from a hardcoded `TODAY` constant. The year and month are lost, making period filtering and chronological sorting impossible.

### Change
Replace `d` with `date: string` in ISO format `"YYYY-MM-DD"`.

**Seed data (`data.js`):** Convert all existing `d` offsets to real dates relative to today (2026-05-14). Remove the `TODAY` constant and `dayLabel` function that computed display dates from it. Add a new `dayLabel(isoDate)` that formats an ISO date string for display.

**Store (`store.jsx`):** No schema change needed — the store is a pass-through for transaction objects. The `addTransactions` dedup key changes from `` `${name}|${amt}|${d}` `` to `` `${name}|${amt}|${date}` ``.

**All screens:** Any place that reads `tx.d` to display or filter must be updated to read `tx.date`. The `dayLabel` import from `data.js` is updated in-place; call sites need no change.

---

## Part 2 — Accounts in the store

### Current state
`ACCOUNTS` is a static array in `data.js`. Balances and deltas are hardcoded. No screen reacts to transaction changes.

### Change

**Account shape:**
```js
{
  id: string,          // e.g. 'chk', 'sav'
  name: string,        // e.g. 'CHASE CHECKING'
  type: string,        // 'CHK' | 'SAV' | 'CC' | 'INV' | 'CRY' | 'FX'
  code: string,        // last-4 or ticker label
  openingBal: number,  // balance before any tracked transactions
  ccy: string,         // 'USD' | 'EUR' etc.
}
```

`balance` and `delta` are **not stored** — they are derived at read time.

**StoreProvider additions:**
- `accounts` state — initialized from `ACCOUNTS` seed data (with `openingBal` back-calculated so computed balance matches current hardcoded `bal`; see below)
- `setAccounts` — replaces the full account list (used on MMBAK import)
- `addAccount` — upserts a single account by id
- Computed `accountsWithBalance` — memoized array where each account has:
  - `balance = openingBal + sum(tx.amt for tx where tx.acct === id and tx.ccy === ccy)`
  - `delta = sum(tx.amt for tx where tx.acct === id and tx.date is in current calendar month)`

**Back-calculating opening balances for seed data:**  
For each seed account: `openingBal = hardcoded_bal - sum(seed_transactions for that account)`. This preserves the current displayed numbers after the switch.

**All screens** that read `ACCOUNTS` directly from `data.js` switch to `store.accountsWithBalance`. The `HERO_METRICS` derived values (`NET_WORTH`, `MONTH_SPEND`, `CASH`) move from static constants in `data.js` to computed values inside the component that displays them (the Dashboard / Home screen), derived from `accountsWithBalance` and the live transaction list.

---

## Part 3 — MMBAK importer upgrade

### Current problems
- All transactions get `acct: 'chk1'` (hardcoded)
- Dates store only `d: day_of_month`; year and month are lost
- Money Manager's ACCOUNT table is never read

### Changes to `parseSQLiteMMBAK` in `importExport.js`

**Read the ACCOUNT table:**  
After opening the DB, query for a table matching `/ACCOUNT/i` (skip `TRANSACTIONACCOUNT` join tables). Read `id/ZPRIMARYKEY`, `name/ZNAME`, `balance/ZAMOUNT/ZINITIALBALANCE`, `currency/ZCURRENCY`, and `type/ZKIND/ZTYPE` columns (with the same flexible column-picker pattern already used for the transaction table). Return an `accounts` array alongside `transactions`.

**Fix date parsing:**  
The current parser extracts only the day number. Change it to return a full ISO string `"YYYY-MM-DD"`. The Core Data timestamp heuristic (`raw > 1e9 ? unix : raw + 978307200`) is correct and stays; just format the full date instead of calling `.getDate()`.

**Link transactions to accounts:**  
Money Manager transaction rows contain a foreign key column (likely `ZACCOUNT`, `ZACCOUNTID`, or similar). Read this value and map it to the imported account's `id`. Fall back to `'imported'` if the column is absent.

**Return shape change:**  
```js
// was:
{ isLedgerBackup: false, transactions: [...] }

// becomes:
{ isLedgerBackup: false, transactions: [...], accounts: [...] }
```

**`ImportExport.jsx`** handles the new shape: when `data.accounts` is present, call `store.setAccounts(data.accounts)` before adding transactions. Show the account count in the success message.

**`exportMMBAK`** adds `accounts: store.accounts` to the JSON backup so the full dataset round-trips.

---

## Migration / backward compatibility

- Existing `localStorage` data uses the old `d: number` shape. On load, `StoreProvider` runs a one-time migration: if any transaction has `d` (number) and no `date`, it synthesizes `date` as `YYYY-MM-{d}` using the current year/month. This is approximate but prevents a blank screen on first launch after the update.
- The `reset()` function clears to the new seed data format, so "RESET TO DEFAULTS" always puts the app in a clean state.

---

## Files to change

| File | Change |
|------|--------|
| `src/renderer/data.js` | Convert `d` offsets to ISO dates; back-calculate `openingBal`; remove `TODAY`; update `dayLabel` |
| `src/renderer/store.jsx` | Add `accounts` state + `setAccounts` + `addAccount` + `accountsWithBalance` memo; update dedup key; add migration shim |
| `src/renderer/importExport.js` | Fix date format; read ACCOUNT table; link transactions to accounts; update return shape |
| `src/renderer/components/ImportExport.jsx` | Handle `accounts` in import result; update export to include accounts |
| `src/renderer/screens/mobile/Home.jsx` | Compute hero metrics from live store data |
| `src/renderer/screens/mobile/Accounts.jsx` | Read from `store.accountsWithBalance` |
| `src/renderer/screens/web/Dashboard.jsx` | Compute hero metrics from live store data |
| `src/renderer/screens/web/WebAccounts.jsx` | Read from `store.accountsWithBalance` |
| All screens reading `tx.d` | Update to `tx.date` |

---

## Out of scope for Phase 1

- FX conversion (EUR accounts show balance in their native currency; no live exchange rates)
- Investment account balance (INV/CRY types show `openingBal` only — market prices are Phase 6)
- Manual account creation UI (accounts come from import or seed data; editing is Phase 2)
