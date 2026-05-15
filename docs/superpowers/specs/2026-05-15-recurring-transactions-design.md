# Recurring Transactions — Design Spec
_Date: 2026-05-15_

## Overview

Extend the existing BILLS system into a full recurring transactions engine supporting five frequencies (monthly, weekly, bi-weekly, annual, custom interval), income recurrings, and per-rule pausing. Bills become recurring rules with monthly frequency via an in-place migration. The posting model stays manual (mark-as-posted), matching the existing user experience.

---

## Data Model

The existing BILLS schema is extended in-place. New fields are optional with safe defaults applied on migration. The `ledger:bills` localStorage key is preserved.

### Full Rule Schema

```js
{
  // Stable identity (new — migrated bills get this on first load)
  id: string,           // slug: e.g. 'rent-greenpoint_1_chk'

  // Classification (new)
  type: 'expense' | 'income',   // default: 'expense'
  freq: 'monthly' | 'weekly' | 'biweekly' | 'annual' | 'custom',  // default: 'monthly'
  active: boolean,      // false = paused. default: true

  // Frequency-specific (only the relevant fields are set per rule)
  day: number,          // monthly: day-of-month (1–31) | weekly: day-of-week (0–6, Sun=0)
  month: number,        // annual only: month (1–12)
  startDate: string,    // biweekly/custom: ISO date anchor for occurrence computation
  interval: number,     // custom: every N days (e.g. 10 for every 10 days)

  // Category (extended)
  path: string[],       // category path, e.g. ['income', 'payroll']. default: [cat]
  ccy: string,          // default: 'USD'

  // Existing fields (unchanged)
  name: string,
  amt: number,          // always positive — sign is derived from type at post time
  acct: string,
  cat: string,
}
```

### Frequency Logic

| Freq | Occurrences per period | Key fields |
|---|---|---|
| `monthly` | Exactly 1 | `day` (day of month) |
| `annual` | 1 if period matches `month`, else 0 | `month`, `day` |
| `weekly` | 4–5 (all matching weekdays in period) | `day` (0–6, Sun=0) |
| `biweekly` | 1–2 | `startDate` (anchor), interval fixed at 14 days |
| `custom` | Variable | `startDate` (anchor), `interval` (days) |

### Occurrence Key

Each occurrence has a unique key: `${rule.id}|${occurrenceDate}` (e.g. `rent-greenpoint_1_chk|2026-05-01`). This key links posted transactions back to their rule+occurrence. It is stored as `billKey` on the created transaction.

---

## Migration

On store load, any bill object missing an `id` field is migrated in-place:

```js
function migrateBills(bills) {
  return bills.map(b => b.id ? b : {
    ...b,
    id: slug(b.name) + '_' + b.day + '_' + (b.acct || ''),
    type: 'expense',
    freq: 'monthly',
    path: b.path || [b.cat || 'bills'],
    ccy: b.ccy || 'USD',
    active: true,
  });
}
```

Where `slug` lowercases and replaces non-alphanumeric characters with hyphens (same function already used in `planning.mjs`).

**Existing paid transactions** are still matched via the existing name/date/amt/acct fallback in `isBillPaymentFor` — old-style `billKey` format is kept as a secondary match. No data loss.

**Seed data** (`data.js` `BILLS` array): all eight existing entries gain `id`, `type: 'expense'`, `freq: 'monthly'`, `path`, `ccy: 'USD'`, `active: true`. Two new entries are added to demonstrate non-monthly frequencies: a bi-weekly payroll income recurring and a weekly recurring.

---

## Core Logic Changes (`planning.mjs`)

### `getOccurrences(rule, period) → string[]`

New function. Returns all ISO due dates for `rule` within the given `YYYY-MM` period.

```js
// monthly: ['2026-05-01']
// annual (wrong month): []
// weekly (Mondays in May 2026): ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25']
// biweekly (from startDate): ['2026-05-08', '2026-05-22']
// custom (every 10 days from startDate): ['2026-05-03', '2026-05-13', '2026-05-23']
```

Implementation uses only native `Date` arithmetic — no external date libraries.

### `buildBillRows(bills, transactions, period, todayIso)` — updated

Iterates `bills.filter(b => b.active !== false)` × `getOccurrences(rule, period)`. Returns one row per occurrence:

```js
{
  ...rule,
  key: `${rule.id}|${occDate}`,
  dueDate: occDate,
  status: 'paid' | 'overdue' | 'due' | 'upcoming',
  paidTxId: string | null,
}
```

Inactive rules (`active: false`) contribute zero rows. Annual rules in non-matching periods contribute zero rows. Rows are sorted by `dueDate` ascending.

### `markRecurringPaid(rule, occurrenceDate) → Transaction`

Replaces `createBillPaymentTransaction`. Accepts the specific `occurrenceDate` directly (no period inference). Amount sign is derived from `rule.type`:

```js
amt: rule.type === 'income' ? Math.abs(rule.amt) : -Math.abs(rule.amt)
```

Transaction `billKey` is `${rule.id}|${occurrenceDate}`.

### `isBillPaymentFor` — backward-compatible update

Checks `tx.billKey === occurrence.key` first (new format), then falls back to the existing name/date/amt/acct matching for old-format transactions.

---

## Store Changes (`store.jsx`)

### Migration

`migrateBills` runs once during `useLS('ledger:bills', BILLS)` initialization via a `useEffect` — same pattern as the existing `migrateTransactions`.

### New Actions

| Action | Signature | What it does |
|---|---|---|
| `addRecurring` | `(rule)` | Appends rule with generated `id` to bills state |
| `updateRecurring` | `(id, patch)` | Patches matching rule by id |
| `deleteRecurring` | `(id)` | Removes rule by id |
| `markRecurringPaid` | `(rule, occurrenceDate)` | Creates and appends the posting transaction |

`markBillPaid` is kept as a compatibility alias: `(bill) => markRecurringPaid(bill, getBillDueDate(bill, selectedPeriod))`. This preserves any existing callers during the transition.

All four new actions are exposed in `StoreCtx.Provider value`.

### `reset()`

`reset()` already calls `setBills(BILLS)`. After the seed data update, `BILLS` will include the migrated schema, so reset restores the extended seed. No change needed.

---

## UI

### Screens Updated

| Screen | Change |
|---|---|
| `WebBills.jsx` | Rename to "RECURRING"; extend list for multi-occurrence and income; add edit/add entry point |
| `src/renderer/screens/mobile/More.jsx` | Bills section: rename label, update `markBillPaid` → `markRecurringPaid` call |

### New Component: `RecurringFormSheet.jsx`

Mobile bottom-sheet for adding/editing a recurring rule. Follows the same pattern as `AccountFormSheet.jsx`. Props: `{ t, onClose, editRule = null }`.

Fields in order:
1. **NAME** — text input
2. **TYPE** — EXPENSE | INCOME toggle (affects amount color and sign)
3. **AMOUNT** — number input (always positive)
4. **FREQUENCY** — pill selector: `MONTHLY` / `WEEKLY` / `BI-WEEKLY` / `ANNUAL` / `CUSTOM`
5. **Frequency-specific sub-fields:**
   - Monthly: Day of month (1–31) number input
   - Weekly: Day-of-week pill row: `SUN MON TUE WED THU FRI SAT`
   - Bi-weekly: Start date picker (ISO date)
   - Annual: Month picker (pill row 1–12) + day of month input
   - Custom: Start date picker + interval input (labeled "EVERY N DAYS")
6. **ACCOUNT** — select from non-archived accounts
7. **CATEGORY** — pill grid (same as AddSheet)
8. **ACTIVE** — toggle pill (only shown in edit mode; default on for new rules)

Entry point on mobile: `+ ADD` button on the recurring section in `More.jsx`.

### Web: Inline Add/Edit Panel (`WebBills.jsx`)

No separate component. A collapsible panel slides open above the list when ADD is clicked, containing the same fields as `RecurringFormSheet`. Edit mode opens on row click.

### List Row Display

Income recurrings: amount in `A.pos` green, `↑` glyph.
Expense recurrings: amount in `A.ink`, category glyph (unchanged).
Paused rules: do not appear in the period list (filtered by `active !== false` in `buildBillRows`).

### Mark as Posted

Tapping the status chip on a row calls `markRecurringPaid(rule, row.dueDate)`. Creates the transaction and re-derives `billRows` — the row flips to `paid` status immediately.

---

## Out of Scope

- Auto-posting on due date (manual mark-as-posted only)
- Variable amounts per occurrence (amount is fixed on the rule)
- End dates / occurrence limits (rules run indefinitely until deleted)
- Recurring transfers (transfers are always one-off)
- Skipping individual occurrences without marking paid
