# CAR-82 — Bulk Select & Bulk Edit on the Web Transactions List

**Date:** 2026-05-21
**Linear:** [CAR-82](https://linear.app/carloshrdezc/issue/CAR-82/bulk-select-and-bulk-edit-on-the-transactions-list-web)
**Status:** Design approved, ready for implementation plan
**Branch:** `car-82-bulk-select` (PR base: `dev-master`)

---

## 1. Problem

After importing a bank file, the user typically needs to re-categorize, mark transfers, or hide dozens of rows in `WebTransactions`. The list only supports one-at-a-time clicks. Doing 30 categorizations one-by-one is tedious and breaks flow.

## 2. Goal

Multi-select with bulk operations on the web transaction list (mobile is out of scope per the issue):

- Always-visible checkbox column. Click checkbox → toggle. `Shift+click` → range. `Cmd/Ctrl+click` → individual toggle.
- Click row body → opens edit modal (today's behavior, suppressed when any rows are selected).
- Floating action bar at the bottom when ≥1 row selected: **CATEGORIZE · SET ACCOUNT · MARK AS TRANSFER · HIDE · DELETE · CLEAR**.
- Each bulk operation registers as a single undo entry via the CAR-81 undo system.
- Selection clears on period/filter/search/txFilter change.

## 3. Scope

### In scope

- Checkbox column + selection state in `screens/web/WebTransactions.jsx`.
- Bottom-anchored bulk action bar with five operations + clear.
- Inline popovers for category and account pickers (no extra modals).
- New keyboard bindings: `x`, `Shift+j`/`Shift+k`, `a`, `Esc`.
- Four new bulk store methods (`deleteTxs`, `hideTxs`, `updateTxs`, `convertToTransfer`) — each registered as a single undo entry.
- Pure-logic test coverage for the bulk operations (Vitest, node env).
- Cheatsheet rows for the new shortcuts.
- `<Checkbox>` primitive in `components/Shared.jsx`.

### Out of scope (deferred to follow-up issues)

- Mobile bulk select (different interaction model).
- Bulk edit of memo / notes.
- Drag-select / lasso selection.
- Bulk operations on Budgets, Goals, Bills, or other non-transaction lists.

## 4. Approach

**Hook + presentational components + bulk store methods.** The selection state lives in a custom hook, the row and action bar are extracted to focused components, and the operations are atomic store methods registered as single undo entries.

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│  src/renderer/bulkOps.mjs (pure, no React)                 │
│    deleteTxsFromArray, hideIdsToArray, updateTxsInArray,   │
│    convertToTransferInArray, detectTransferPair            │
└────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌────────────────────────────────────────────────────────────┐
│  src/renderer/store.jsx (additions)                        │
│    deleteTxs, hideTxs, updateTxs, convertToTransfer        │
│    (plus expose `hidden` on context for read access)       │
└────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌────────────────────────────────────────────────────────────┐
│  src/renderer/useUndoableStore.js (additions)              │
│    Wraps the four bulk methods — each is one undo entry    │
└────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌────────────────────────────────────────────────────────────┐
│  src/renderer/hooks/useBulkSelection.js (new)              │
│    selectedIds Set + anchorIdx + toggle/range/clear/       │
│    selectAll/has/setAnchor                                 │
└────────────────────────────────────────────────────────────┘
                              ▲
                              │
                  ┌───────────┴───────────┐
                  │                       │
        ┌─────────┴────────┐    ┌────────┴────────────┐
        │ <TransactionRow> │    │ <BulkActionBar>     │
        └─────────┬────────┘    └────────┬────────────┘
                  │                      │
                  │      <Checkbox>      │
                  └───────┬──────────────┘
                          │
                          ▼
              src/renderer/screens/web/WebTransactions.jsx
              (wires the hook, mounts the bar, handles keyboard)
```

### Module boundaries

| Unit | Purpose | Depends on | Tested by |
|---|---|---|---|
| `bulkOps.mjs` | Pure array transformations + heuristic for transfer pairs | none | `bulkOps.test.mjs` (Vitest, node env) |
| `store.jsx` additions | Single-render wrappers around `bulkOps` helpers | `bulkOps.mjs` | exercised through manual UAT |
| `useUndoableStore.js` additions | Atomic undo registration for the four bulk methods | store, undo context | manual UAT |
| `useBulkSelection.js` | Selection state (Set + anchor) | React | manual UAT |
| `<Checkbox>` | Custom checkbox primitive matching the `A` token system | `theme.js` | manual UAT |
| `<TransactionRow>` | Presentational row component (extracted) | `<Checkbox>`, theme | manual UAT |
| `<BulkActionBar>` | Bottom-anchored action bar with inline pickers | theme, `<ALabel>` | manual UAT |

## 5. Pure module: `src/renderer/bulkOps.mjs`

Plain functions, no React, no closures over state.

### Public API

```js
deleteTxsFromArray(prevTxs, ids) → nextTxs
  // Returns a new array with rows whose id is in `ids` removed.
  // Returns prevTxs unchanged if no matches found.

hideIdsToArray(prevHidden, ids) → nextHidden
  // Returns a new array adding only the ids not already present.
  // Returns prevHidden unchanged if all are already hidden.

updateTxsInArray(prevTxs, ids, patch) → nextTxs
  // Returns a new array where each tx in `ids` has `patch` shallowly merged.
  // Returns prevTxs unchanged if `ids` is empty or `patch` has no keys.

convertToTransferInArray(prevTxs, aId, bId, params, transferId) → nextTxs
  // Removes rows aId and bId. Adds two new transfer legs:
  //   - outLeg: id = `${transferId}_out`, amt = -|amtFrom|, acct = fromAcct,
  //     ccy from fromAcct, cat = 'transfer', path = [], transferId,
  //     transferPeer = `${transferId}_in`, plus optional note.
  //   - inLeg:  id = `${transferId}_in`,  amt = +|amtTo|,  acct = toAcct,
  //     ccy from toAcct, cat = 'transfer', path = [], transferId,
  //     transferPeer = `${transferId}_out`, plus optional note.
  // The leg shapes mirror createTransfer in store.jsx for consistency.

detectTransferPair(visible, selectedIds) → { out, inn } | null
  // Returns the ordered pair when exactly two rows match the heuristic:
  //   - selectedIds.size === 2
  //   - both rows present in `visible`
  //   - Math.abs(a.amt) === Math.abs(b.amt)
  //   - Math.sign(a.amt) !== Math.sign(b.amt)
  //   - a.acct !== b.acct
  //   - neither has a transferId (already a transfer)
  // `out` is the negative-amount row, `inn` is the positive one.
  // Returns null if any condition fails.
```

### Invariants

1. All functions are referentially transparent: same input → same output.
2. Inputs are never mutated; outputs are new arrays/objects.
3. Helpers return the original input array unchanged when there's nothing to do (enables `setTxs(prev => updateTxsInArray(prev, ...))` to skip rerenders when patch matches nothing).

## 6. Store methods: `src/renderer/store.jsx`

Four new `useCallback` setters, each calling the pure helper. Plus exposing `hidden` (currently only `setHidden` is exposed) on the provider value for read access by undo wrappers.

```jsx
const deleteTxs = React.useCallback((ids) => {
  if (!ids || ids.length === 0) return;
  setTxs(prev => deleteTxsFromArray(prev, ids));
}, [setTxs]);

const hideTxs = React.useCallback((ids) => {
  if (!ids || ids.length === 0) return;
  setHidden(prev => hideIdsToArray(prev, ids));
}, [setHidden]);

const updateTxs = React.useCallback((ids, patch) => {
  if (!ids || ids.length === 0 || !patch) return;
  setTxs(prev => updateTxsInArray(prev, ids, patch));
}, [setTxs]);

const convertToTransfer = React.useCallback((aId, bId, params, transferId) => {
  // params: { fromAcct, toAcct, amtFrom, amtTo, date, note }
  // transferId is supplied by the caller so undo can target by it.
  // Look up account ccy at call time (matches createTransfer pattern).
  const fromAcctObj = accounts.find(a => a.id === params.fromAcct);
  const toAcctObj   = accounts.find(a => a.id === params.toAcct);
  setTxs(prev => convertToTransferInArray(prev, aId, bId, {
    ...params,
    fromCcy: fromAcctObj?.ccy || 'USD',
    toCcy:   toAcctObj?.ccy || 'USD',
  }, transferId));
}, [accounts, setTxs]);
```

Expose all four plus `hidden` (already-`setHidden` exists from CAR-81) in the `<StoreCtx.Provider value={{ ... }}>` block.

## 7. Undo wrappers: `src/renderer/useUndoableStore.js`

Four new wrappers added before the `return` statement. Each captures pre-state, calls `stack.register({ batchKey: null, ... })`, and uses an atomic `undo` callback. `batchKey: null` ensures these batches never coalesce with prior or subsequent registrations.

### `deleteTxs(ids)`

```js
const deleteTxs = React.useCallback((ids) => {
  if (!ids || ids.length === 0) return;
  // Capture full tx objects for restoration. Extend to include orphan transfer
  // legs: if selection includes one leg of a transfer, both legs are deleted
  // by the user's intent (matches CAR-81's existing single-row deleteTransfer).
  const idSet = new Set(ids);
  const removed = store.allTransactions.filter(t => idSet.has(t.id));
  if (removed.length === 0) return;
  const transferIds = new Set(removed.map(t => t.transferId).filter(Boolean));
  const orphanLegs = transferIds.size === 0 ? [] :
    store.allTransactions.filter(t => t.transferId && transferIds.has(t.transferId) && !idSet.has(t.id));
  const fullCapture = [...removed, ...orphanLegs];
  const fullIds = fullCapture.map(t => t.id);

  stack.register({
    label: fullCapture.length === 1 ? 'Transaction deleted' : `${fullCapture.length} transactions deleted`,
    batchKey: null,
    do:   () => store.deleteTxs(fullIds),
    undo: () => store.setTransactions(prev => {
      const have = new Set(prev.map(t => t.id));
      const additions = fullCapture.filter(t => !have.has(t.id));
      return additions.length === 0 ? prev : [...prev, ...additions];
    }),
  });
}, [store, stack]);
```

### `hideTxs(ids)`

```js
const hideTxs = React.useCallback((ids) => {
  if (!ids || ids.length === 0) return;
  const beforeHidden = new Set(store.hidden || []);
  const newlyHidden = ids.filter(id => !beforeHidden.has(id));
  if (newlyHidden.length === 0) return;
  stack.register({
    label: newlyHidden.length === 1 ? 'Transaction hidden' : `${newlyHidden.length} transactions hidden`,
    batchKey: null,
    do:   () => store.hideTxs(newlyHidden),
    undo: () => {
      const undoSet = new Set(newlyHidden);
      store.setHidden(prev => prev.filter(id => !undoSet.has(id)));
    },
  });
}, [store, stack]);
```

### `updateTxs(ids, patch)`

Captures pre-patch values per id (only for keys in `patch`), restores those exact values on undo:

```js
const updateTxs = React.useCallback((ids, patch) => {
  if (!ids || ids.length === 0 || !patch || Object.keys(patch).length === 0) return;
  const idSet = new Set(ids);
  const before = store.allTransactions
    .filter(t => idSet.has(t.id))
    .map(t => {
      const snap = { id: t.id };
      for (const k of Object.keys(patch)) snap[k] = t[k];
      return snap;
    });
  if (before.length === 0) return;
  stack.register({
    label: before.length === 1 ? 'Transaction updated' : `${before.length} transactions updated`,
    batchKey: null,
    do:   () => store.updateTxs(ids, patch),
    undo: () => store.setTransactions(prev => {
      const byId = Object.fromEntries(before.map(s => [s.id, s]));
      return prev.map(tx => byId[tx.id] ? { ...tx, ...byId[tx.id] } : tx);
    }),
  });
}, [store, stack]);
```

### `convertToTransfer(aId, bId, params)`

Pre-generates the `transferId` so both `do` and `undo` close over it:

```js
const convertToTransfer = React.useCallback((aId, bId, params) => {
  const a = store.allTransactions.find(t => t.id === aId);
  const b = store.allTransactions.find(t => t.id === bId);
  if (!a || !b) return;
  const transferId = 'xfer_' + Date.now();
  stack.register({
    label: 'Marked as transfer',
    batchKey: null,
    do:   () => store.convertToTransfer(aId, bId, params, transferId),
    undo: () => store.setTransactions(prev => {
      // Remove both new legs (matched by transferId) and re-add the originals.
      const without = prev.filter(t => t.transferId !== transferId);
      const haveA = without.some(t => t.id === aId);
      const haveB = without.some(t => t.id === bId);
      const additions = [];
      if (!haveA) additions.push(a);
      if (!haveB) additions.push(b);
      return additions.length === 0 ? without : [...without, ...additions];
    }),
  });
}, [store, stack]);
```

### Updated return

```js
return {
  ...store,
  deleteTx, hideTx, deleteTransfer,
  archiveAccount, deleteAccount,
  deleteRecurring, removeBudget, deleteGoal,
  removeCategory, removeHolding,
  // CAR-82 bulk wrappers:
  deleteTxs, hideTxs, updateTxs, convertToTransfer,
};
```

## 8. Selection hook: `src/renderer/hooks/useBulkSelection.js`

```js
import React from 'react';

export default function useBulkSelection(visible) {
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [anchorIdx, setAnchorIdx] = React.useState(null);

  const toggle = React.useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const range = React.useCallback((anchorIdxArg, targetIdx) => {
    if (anchorIdxArg == null || targetIdx == null) return;
    const lo = Math.min(anchorIdxArg, targetIdx);
    const hi = Math.max(anchorIdxArg, targetIdx);
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) {
        const tx = visible[i];
        if (tx) next.add(tx.id);
      }
      return next;
    });
  }, [visible]);

  const selectAll = React.useCallback(() => {
    setSelectedIds(new Set(visible.map(t => t.id)));
  }, [visible]);

  const clear = React.useCallback(() => {
    setSelectedIds(new Set());
    setAnchorIdx(null);
  }, []);

  const has = React.useCallback((id) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected: has,
    toggle,
    range,
    selectAll,
    clear,
    anchorIdx,
    setAnchor: setAnchorIdx,
  };
}
```

**Stale-id policy:** when a tx is deleted (bulk or single-row), its id may briefly remain in `selectedIds` until the next clear-on-period/filter trigger. Stale ids are harmless: `isSelected(id)` is only consulted when rendering a row, and rows only render if the tx is in `visible`. No active pruning needed.

## 9. UI components

### `<Checkbox>` — added to `src/renderer/components/Shared.jsx`

```jsx
export function Checkbox({ checked, indeterminate = false, onChange, ariaLabel, onMouseDown }) {
  const filled = checked || indeterminate;
  const glyph = indeterminate ? '−' : (checked ? '✓' : '');
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseDown={onMouseDown}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange?.(e);
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        border: '1px solid ' + (filled ? A.ink : A.rule2),
        background: filled ? A.ink : 'transparent',
        color: A.bg,
        fontSize: 10,
        lineHeight: 1,
        cursor: 'pointer',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {glyph}
    </span>
  );
}
```

### `<TransactionRow>` — new file `src/renderer/components/TransactionRow.jsx`

Extracts the inline row JSX from `WebTransactions.jsx:158-185`. New leading 28px column for the checkbox (grid template becomes `28px 90px 24px 1fr 280px 90px 120px`).

**Props:**
- `tx` — transaction object
- `t` — theme settings
- `isFocused` — j/k cursor highlight
- `isSelected` — bulk-select membership
- `accountsWithBalance` — for account name lookup
- `onRowClick(e)` — fires on row body click
- `onCheckboxToggle(e)` — fires on checkbox click; receives event so caller reads `shiftKey`/`metaKey`/`ctrlKey`

**Visual:**
- Selected rows: background `A.bg2`.
- Focused row: existing `borderLeft` highlight (current behavior).
- Both can compose.

The component is purely presentational; click-routing decisions live in the parent.

### `<BulkActionBar>` — new file `src/renderer/components/BulkActionBar.jsx`

**Props:**
- `count` — number selected
- `canMarkAsTransfer` — boolean (only true when `detectTransferPair` returns non-null)
- `onCategorize`, `onSetAccount`, `onMarkAsTransfer`, `onHide`, `onDelete`, `onClear` — handlers
- `categoryTree`, `accountsWithBalance` — for the inline pickers

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ N SELECTED  │  CATEGORIZE  SET ACCOUNT  [MARK AS TRANSFER]   │
│             │  HIDE  DELETE                          │ CLEAR │
└──────────────────────────────────────────────────────────────┘
```

`MARK AS TRANSFER` is rendered conditionally on `canMarkAsTransfer`. `DELETE` hover color: `A.neg`.

**Position:**

```js
position: 'fixed',
bottom: 20,
left: '50%',
transform: 'translateX(-50%)',
zIndex: 1200,
background: A.bg2,
border: '1px solid ' + A.ink,
fontFamily: A.font,
color: A.ink,
padding: '12px 18px',
display: 'flex',
alignItems: 'center',
gap: 16,
```

**Inline pickers:**
- Category picker: opens upward (`bottom: 100%; marginBottom: 8`) with the existing `categoryTree`. Click an entry → calls `onCategorize({ cat, path })` → caller invokes `updateTxs(selectedIds, { cat, path })`. Auto-closes.
- Account picker: opens upward, lists `accountsWithBalance.map(a => a.name)`. Click → calls `onSetAccount(acctId)` → caller invokes `updateTxs(selectedIds, { acct: acctId })`. Auto-closes.

Pickers cap at ~6 visible items with `overflow: auto` for longer lists.

## 10. Mark-as-transfer flow

1. User selects exactly 2 rows that satisfy `detectTransferPair`. The `MARK AS TRANSFER` button appears in the action bar.
2. Click button → `WebTransactions.jsx` opens `<WebAddModal>` with new prop `convertFromTxs={[out, inn]}`.
3. `<WebAddModal>` detects this prop, enters transfer mode, pre-fills:
   - `fromAcct = out.acct`, `toAcct = inn.acct`
   - `amtFrom = Math.abs(out.amt)`, `amtTo = Math.abs(inn.amt)`
   - `date = out.date`
   - `note = out.note || inn.note || ''`
4. User reviews fields, clicks SAVE.
5. The modal's save handler detects `convertFromTxs` is set and calls `useUndoableStore.convertToTransfer(out.id, inn.id, params)` instead of `createTransfer(...)`.
6. After save: caller calls `bulk.clear()`, modal closes, UndoToast appears with `MARKED AS TRANSFER · UNDO`.

`<WebAddModal>` change is one new prop and one new branch in the save handler.

## 11. Keyboard handling

Inside `WebTransactions.jsx`, extend the existing `bindings` array used by `useKeyboardShortcuts`:

```js
const bindings = React.useMemo(() => [
  { keys: 'j', handler: (e) => {
      const next = Math.min(selectedIdx + 1, visible.length - 1);
      if (e.shiftKey && visible[next]) bulk.toggle(visible[next].id);
      setSelectedIdx(next);
      bulk.setAnchor(next);
    }
  },
  { keys: 'k', handler: (e) => {
      const next = Math.max(0, selectedIdx - 1);
      if (e.shiftKey && visible[next]) bulk.toggle(visible[next].id);
      setSelectedIdx(next);
      bulk.setAnchor(next);
    }
  },
  { keys: 'e', handler: () => {
      if (bulk.selectedCount > 0) return;
      setEditTx(visible[selectedIdx]);
    }
  },
  { keys: '/', handler: () => searchRef.current?.focus() },
  { keys: 'x', handler: () => {
      if (visible[selectedIdx]) {
        bulk.toggle(visible[selectedIdx].id);
        bulk.setAnchor(selectedIdx);
      }
    }
  },
  { keys: 'a', handler: (e) => {
      if (e.altKey) return;
      bulk.selectAll();
    }
  },
  { keys: 'Escape', handler: (e) => {
      if (bulk.selectedCount > 0) {
        e.preventDefault();
        bulk.clear();
      }
    }
  },
], [selectedIdx, visible, bulk]);
```

**Decisions baked in:**
- `Shift+j`/`Shift+k` extend selection by inspecting `e.shiftKey` inside the existing handlers. No hook changes.
- Bare `a` selects all; `Cmd/Ctrl+A` is not specially handled (the hook's input-target check prevents firing inside the search input).
- `Escape` clears selection when the bar is visible. The global Esc handler in `App.jsx` fires too, but only acts when an overlay is open; otherwise the local handler is the only consumer.
- `e` (edit) is suppressed when `selectedCount > 0` to avoid accidentally opening the edit modal while bulk-selecting.

## 12. Auto-clear effects

In `WebTransactions.jsx`:

```jsx
React.useEffect(() => bulk.clear(), [selectedPeriod]);
React.useEffect(() => bulk.clear(), [filter]);
React.useEffect(() => bulk.clear(), [search]);
React.useEffect(() => bulk.clear(), [txFilter]);
```

`bulk.clear` is memoized with empty deps inside `useBulkSelection`, so listing only the trigger value in each effect's dep array is correct (no infinite-loop risk).

The existing `selectedIdx` reset effect (`WebTransactions.jsx:68-70`) stays unchanged.

## 13. Cheatsheet additions

In `src/renderer/components/Shortcuts.jsx`, the TRANSACTIONS section currently lists `j/k`, `e`, `/`. Add four rows:

```js
['x',         'Toggle selection of current row'],
['Shift+j/k', 'Move and extend selection'],
['a',         'Select all visible'],
['Esc',       'Clear selection'],
```

## 14. Testing

### `src/renderer/bulkOps.test.mjs` (Vitest, node env)

16 pure-function tests:

1. `deleteTxsFromArray` removes only specified ids.
2. `deleteTxsFromArray` with empty `ids` returns prev unchanged.
3. `deleteTxsFromArray` with non-existent ids returns prev unchanged.
4. `hideIdsToArray` adds new ids; preserves existing.
5. `hideIdsToArray` dedupes (id already in `prev` doesn't double-add).
6. `hideIdsToArray` with no new ids returns prev unchanged.
7. `updateTxsInArray` patches only specified ids; other fields untouched.
8. `updateTxsInArray` with empty `patch` returns prev unchanged.
9. `updateTxsInArray` with empty `ids` returns prev unchanged.
10. `convertToTransferInArray` removes the two source rows.
11. `convertToTransferInArray` adds two new legs with correct `transferId`, `transferPeer`, signs, accounts.
12. `convertToTransferInArray` preserves untouched txs.
13. `detectTransferPair` returns null when `selectedIds.size !== 2`.
14. `detectTransferPair` returns null when amounts don't match.
15. `detectTransferPair` returns null when same sign / same account / one is already a transfer.
16. `detectTransferPair` returns `{ out, inn }` correctly ordered when valid.

### Component / integration tests

Skipped — same precedent as CAR-81. The renderer doesn't have jsdom-based test infra, and adding it for one feature is out of scope. Manual UAT covers visible behavior.

### Manual UAT checklist (matches the issue acceptance criteria + design decisions)

| # | Action | Expected |
|---|---|---|
| 1 | Click row body | Edit modal opens (unchanged). |
| 2 | Click checkbox | Row toggles selected. Action bar appears with `1 SELECTED`. Edit modal does NOT open. |
| 3 | Click another checkbox | Count → `2 SELECTED`. |
| 4 | `Shift+click` row 5 down | Range selects all 5; count updates. |
| 5 | `Cmd/Ctrl+click` a selected row | That row toggles off; others stay. |
| 6 | Click row body while count > 0 | Edit does NOT open (suppressed). |
| 7 | `Esc` while selection active | Selection clears. Action bar disappears. |
| 8 | Change period (`[`/`]`) | Selection clears. |
| 9 | Type in search box | Selection clears. |
| 10 | Click a category filter chip | Selection clears. |
| 11 | `j` / `k` cursor movement | Same as today (no selection change unless `Shift` is held). |
| 12 | `Shift+j` from focused row | Cursor advances; that new row toggles selection. |
| 13 | `x` key | Toggles selection of currently focused row. |
| 14 | `a` key | Selects all visible rows. |
| 15 | Bulk DELETE on 5 selected | All 5 disappear. UndoToast: `5 TRANSACTIONS DELETED · UNDO`. UNDO restores all 5. |
| 16 | Bulk DELETE includes a transfer leg | Both legs of every touched transfer are deleted; UndoToast count reflects total. UNDO restores all, including orphan legs. |
| 17 | Bulk CATEGORIZE → pick "Food" | All selected get `cat: 'food'`. Popover closes. UndoToast: `N TRANSACTIONS UPDATED · UNDO`. UNDO reverts each tx to its original category. |
| 18 | Bulk SET ACCOUNT → pick an account | All selected get the new `acct`. UNDO reverts. |
| 19 | Bulk HIDE on 3 selected (none already hidden) | All 3 disappear. UndoToast: `3 TRANSACTIONS HIDDEN · UNDO`. UNDO restores. |
| 20 | Bulk HIDE when one was already hidden | Only the not-already-hidden ones get hidden; UndoToast count reflects only those. |
| 21 | Select 2 txs satisfying the heuristic | `MARK AS TRANSFER` button appears. |
| 22 | Select 2 txs that don't satisfy | `MARK AS TRANSFER` button does NOT render. |
| 23 | Click `MARK AS TRANSFER` → modal pre-fills → SAVE | Two source rows disappear, two transfer legs appear. UndoToast: `MARKED AS TRANSFER · UNDO`. UNDO restores source rows and removes the transfer legs. |
| 24 | Inside-search-input safety | Typing `a`, `x`, `j`, `k`, `e` in search input → text appears, no shortcut fires. |
| 25 | Cheatsheet (`?`) | Shows new rows: `x`, `Shift+j/k`, `a`, `Esc` (Clear selection). |
| 26 | After bulk action completes | Action bar unmounts as `selectedCount` hits 0. UndoToast appears. |
| 27 | Bulk action with focused row | Cursor highlight stays on the focused row; selection styling on selected rows is independent. |

## 15. Rollout (single PR per AGENTS.md, against `dev-master`)

1. `src/renderer/bulkOps.mjs` + `src/renderer/bulkOps.test.mjs` — pure helpers + 16 tests.
2. `src/renderer/store.jsx` — add the four bulk methods + expose `hidden` on context.
3. `src/renderer/useUndoableStore.js` — add the four bulk wrappers.
4. `src/renderer/hooks/useBulkSelection.js` — new hook.
5. `src/renderer/components/Shared.jsx` — add `<Checkbox>` primitive.
6. `src/renderer/components/TransactionRow.jsx` — extract from `WebTransactions.jsx`.
7. `src/renderer/components/BulkActionBar.jsx` — new component with inline category & account pickers.
8. `src/renderer/screens/web/WebAddModal.jsx` — accept `convertFromTxs` prop; route save through `convertToTransfer`.
9. `src/renderer/screens/web/WebTransactions.jsx` — wire it all: hook, row extraction, action bar mount, keyboard extensions, auto-clear effects, transfer-pair detection.
10. `src/renderer/components/Shortcuts.jsx` — four new cheatsheet rows.
11. Self-QA per the table above; `npm test` + `npx vite build` clean.
12. PR with `Fixes CAR-82` against `dev-master`.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Bulk delete of a transfer leg orphans the peer | Wrapper extends captured set to include all legs of any touched transfer (UAT #16 covers this). |
| User accidentally hits `a` (select all) and panics | Action bar `CLEAR` button + `Esc` both work. UndoToast covers any destructive follow-up. |
| `convertToTransfer` undo creates a stale `transferId` collision | The id is `'xfer_' + Date.now()`; collision requires two transfers in the same millisecond. Same risk exists today for `createTransfer` (no regression). |
| Picker popover occluded by short viewport | Caps at ~6 items with `overflow: auto`. |
| Keyboard `a` conflicts with a future binding | Cheatsheet documents it; conflict-free today. |
| Selection persists across screen unmount | When the user navigates away, `WebTransactions.jsx` unmounts → state is destroyed naturally. |
| Multiple bulk actions in rapid succession | `batchKey: null` prevents coalescing; each batch is its own undo entry. |
| 50 sequential `setTxs` calls cause perf issue | Solved by design — the four bulk methods do ONE `setTxs` per action. |

## 17. Open questions / future work

- Mobile bulk select with a touch-friendly interaction model (separate issue).
- Bulk edit memo / notes with a small inline text input in the action bar (deferred).
- Drag-select / lasso (deferred).
- Generalizing `useBulkSelection` for other lists (Budgets, Goals, Bills) — the hook is already shape-agnostic; future surfaces can adopt without changes.
- After a bulk action runs and clears selection, briefly highlight the affected rows in the toast as a visual confirmation. Skipped now to keep scope tight.
