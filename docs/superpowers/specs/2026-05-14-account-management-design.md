# Account Management — Design Spec

Generated: 2026-05-14

## Overview

Add full account CRUD to the existing Accounts screens (Option A: inline editing). Users can add, edit, archive, reorder, and (for empty accounts) delete accounts without leaving the Accounts screen. Both mobile and desktop layouts are covered.

## Store changes

File: `src/renderer/store.jsx`

Account shape gains two new fields:

```js
{
  id: string,          // existing
  name: string,        // existing
  type: string,        // existing
  openingBal: number,  // existing
  openingDate: string, // ISO date, existing
  archived: boolean,   // NEW — default false
  order: number,       // NEW — integer sort key
}
```

New actions:

| Action | Signature | Behavior |
|---|---|---|
| `addAccount` | `(account) => void` | Appends account with `archived: false`, `order: accounts.length` |
| `updateAccount` | `(id, patch) => void` | Shallow-merges patch into matching account |
| `archiveAccount` | `(id) => void` | Sets `archived: true` on matching account |
| `reorderAccounts` | `(orderedIds: string[]) => void` | Reassigns `order` field based on array position |

Existing `accountsWithBalance` filters `archived: false` by default. A new `allAccountsWithBalance` selector includes archived accounts (used in the manage/archived view).

Seed data in `data.js` gets `archived: false` and `order` index added to all existing accounts.

## Add Account

**Trigger:** "Add account" button at the top of the accounts list on both layouts.

**UI:** Reuses `AddSheet` (mobile) / `WebAddModal` (desktop). Form fields:

- **Name** — text input, required
- **Type** — select: Checking | Savings | Credit Card | Investment | Loan | Cash
- **Opening balance** — number input, can be negative
- **Opening date** — date picker, defaults to first of current month

**On submit:** calls `addAccount({ id: crypto.randomUUID(), name, type, openingBal, openingDate, archived: false, order: accounts.length })`.

## Edit Account

**Trigger:** Pencil icon on the right of each account row.

**UI:** Same sheet/modal as Add, pre-filled with current values. Additional controls at the bottom:

- **Archive toggle** — labeled switch "Archive this account". On save with toggle on, calls `archiveAccount(id)`. Account disappears from main list.
- **Delete button** — shown only when the account has zero transactions. Zero is determined by checking `transactions.filter(tx => tx.accountId === id).length === 0`. Destructive red button "Delete account". Accounts with transactions must be archived instead.

**On save:** calls `updateAccount(id, patch)` with only changed fields.

## Archived accounts

A "Show archived (N)" link appears at the bottom of the accounts list when N > 0. Tapping it appends archived accounts to the list with muted styling (lower opacity, italic name). Archived accounts can be unarchived via the edit flow (toggle off, save).

## Reorder

**Trigger:** "Reorder" button in the accounts list header.

**Reorder mode:**
- Edit icons hidden
- Grip icon (⠿) appears on the left of each row
- Rows are draggable: HTML5 drag-and-drop on desktop, touch events on mobile
- Dropping fires `reorderAccounts(orderedIds)`
- "Done" button exits reorder mode

Archived accounts are not shown or reorderable while in reorder mode.

## Affected files

| File | Change |
|---|---|
| `src/renderer/store.jsx` | Add `archived`, `order` fields; add 4 new actions; update `accountsWithBalance`; add `allAccountsWithBalance` |
| `src/renderer/data.js` | Add `archived: false` and `order` index to seed accounts |
| `src/renderer/screens/web/WebAccounts.jsx` | Add button, edit icons, reorder mode, archived toggle |
| `src/renderer/screens/mobile/Accounts.jsx` | Same as WebAccounts for mobile layout |
| `src/renderer/components/ImportExport.jsx` | Ensure imported accounts get `archived: false` and `order` assigned |

The `AddSheet` and `WebAddModal` components are extended in-place (new form fields for account add/edit) rather than duplicated.

## Out of scope

- Account-to-account transfers (a separate feature)
- Currency per account
- Account color/icon customization
