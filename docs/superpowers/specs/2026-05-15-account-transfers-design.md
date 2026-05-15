# Account Transfers — Design Spec
_Date: 2026-05-15_

## Overview

Enable users to record money movements between their own accounts, including cross-currency transfers. Transfers appear in the transaction list with a distinct display but are excluded from category/budget totals.

---

## Data Model

A transfer creates two transactions atomically in `ledger:tx`, linked by a shared `transferId`.

### Debit leg (FROM account)
```js
{
  id: 'xfer_<id>_out',
  name: 'TRANSFER → <toAcctName>',
  amt: -amtFrom,           // negative, in FROM account's currency
  date: 'YYYY-MM-DD',
  acct: fromAcctId,
  ccy: fromCcy,
  cat: 'transfer',
  path: [],
  transferId: '<id>',
  transferPeer: 'xfer_<id>_in',
}
```

### Credit leg (TO account)
```js
{
  id: 'xfer_<id>_in',
  name: 'TRANSFER ← <fromAcctName>',
  amt: +amtTo,             // positive, in TO account's currency
  date: 'YYYY-MM-DD',
  acct: toAcctId,
  ccy: toCcy,
  cat: 'transfer',
  path: [],
  transferId: '<id>',
  transferPeer: 'xfer_<id>_out',
}
```

### Cross-currency
When `fromCcy !== toCcy`, `amtFrom` and `amtTo` are entered independently by the user. The implied rate (`amtTo / amtFrom`) is displayed as muted helper text in the form but is not persisted.

### Same-currency
`amtTo` is always equal to `amtFrom`. The RECEIVED field is auto-filled and locked.

---

## Store Changes (`store.jsx`)

### New actions

**`createTransfer({ fromAcct, toAcct, amtFrom, amtTo, date, note })`**
- Generates a unique `transferId` (`xfer_` + `Date.now()`)
- Constructs both legs and writes them to `txs` in a single `setTxs` call
- `note` overrides the default name if provided

**`deleteTransfer(transferId)`**
- Removes both legs in a single `setTxs(prev => prev.filter(tx => tx.transferId !== transferId))` call
- Exposed in store context alongside existing `deleteTx`

### Budget exclusion

In `planning.mjs` → `buildBudgetRows`, filter out transfers before computing spending:
```js
const spendingTxs = transactions.filter(tx => tx.cat !== 'transfer');
```

No changes to `periodTransactions`, balance math, or `allAccountsWithBalance` — each leg naturally belongs to its own account.

### Seed data

`t17` (`TRANSFER → SAVINGS`, currently miscategorised as `income/payroll`) is replaced at `reset()` with a proper paired transfer using `createTransfer`-equivalent seed entries.

---

## UI

### Entry point

A third toggle is added to the existing transaction add forms:

- **Mobile:** `AddSheet.jsx` — `EXPENSE | INCOME | TRANSFER` row of toggle buttons
- **Web:** `WebAddModal.jsx` — same three-way toggle

### Transfer form fields (when TRANSFER is selected)

| Field | Behaviour |
|---|---|
| FROM | Account picker — all non-archived accounts |
| TO | Account picker — same list, FROM account excluded |
| AMOUNT | Amount leaving FROM account, in FROM currency |
| RECEIVED | Amount arriving in TO account, in TO currency. Auto-filled + locked when same-currency. Editable when cross-currency; implied rate shown as muted helper below (`1 USD = 0.923 EUR`) |
| DATE | Date picker, same as existing |
| NOTE | Optional free-text annotation stored as `note` on both legs. Does not replace the directional name — displayed as a secondary line if present. |

### Transaction list display

Both legs appear as normal rows with the following changes:

- **Glyph:** `⇄` replaces the category glyph
- **Name:** `TRANSFER → ALLY SAVINGS` (out leg) / `TRANSFER ← CHASE CHECKING` (in leg)
- **Amount color:** Neutral ink (`A.ink` / `A.ink2`) — neither `A.pos` green nor `A.neg` red

### Detail / edit view

Tapping either transfer leg opens a read-only detail view (both legs must stay in sync; free editing is disallowed). The only available action is **Delete**, which calls `deleteTransfer(transferId)` and removes both legs.

---

## Budget & Reporting Impact

- Transfers with `cat === 'transfer'` are excluded from all spending/budget calculations
- They do not appear in category breakdowns or period totals
- They do not contribute to the INCOME or EXPENSE summary lines
- They still appear in the full transaction list for audit purposes

---

## Out of Scope

- Transfer scheduling / recurring transfers (handled by Recurring Transactions spec)
- Fee capture for FX transfers (implied rate is display-only; no explicit fee field)
- Undo / merge detection for imported transfers
