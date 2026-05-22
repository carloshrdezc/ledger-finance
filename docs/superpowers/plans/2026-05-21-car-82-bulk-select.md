# CAR-82 Bulk Select & Bulk Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select with bulk operations (delete, hide, categorize, set-account, mark-as-transfer) on the web transactions list, with each bulk operation registered as a single undo entry via the existing CAR-81 undo system.

**Architecture:** Pure helpers in `bulkOps.mjs` → bulk store methods in `store.jsx` → atomic undo wrappers in `useUndoableStore.js` → selection hook + extracted row/bar components → wiring in `WebTransactions.jsx`. Mobile is out of scope.

**Tech Stack:** React 18, Vite, Vitest (node env), inline-styled JSX with the `A` theme tokens. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-21-car-82-bulk-select-design.md`

**Linear:** [CAR-82](https://linear.app/carloshrdezc/issue/CAR-82/bulk-select-and-bulk-edit-on-the-transactions-list-web)

**Branch:** `car-82-bulk-select` (PR base: `dev-master`)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/renderer/bulkOps.mjs` | Pure helpers: `deleteTxsFromArray`, `hideIdsToArray`, `updateTxsInArray`, `convertToTransferInArray`, `detectTransferPair`. No React. |
| `src/renderer/bulkOps.test.mjs` | Vitest suite for the pure helpers (16 tests, node env). |
| `src/renderer/hooks/useBulkSelection.js` | React hook: `selectedIds: Set<string>` + `anchorIdx` + toggle/range/clear/selectAll/has/setAnchor. |
| `src/renderer/components/TransactionRow.jsx` | Presentational row component (extracted from `WebTransactions.jsx`). Adds 28px checkbox column. |
| `src/renderer/components/BulkActionBar.jsx` | Bottom-anchored action bar with inline category & account pickers. |

### Modified files

| Path | Change |
|---|---|
| `src/renderer/store.jsx` | Add 4 bulk methods (`deleteTxs`, `hideTxs`, `updateTxs`, `convertToTransfer`). Expose `hidden` (read side) on context. |
| `src/renderer/useUndoableStore.js` | Add 4 wrappers registering each bulk op as a single undo entry. |
| `src/renderer/components/Shared.jsx` | Add `<Checkbox>` primitive. |
| `src/renderer/screens/web/WebAddModal.jsx` | Accept `convertFromTxs` prop; route save through `convertToTransfer`. |
| `src/renderer/screens/web/WebTransactions.jsx` | Wire selection hook; render extracted row + action bar; new keyboard bindings; auto-clear effects. |
| `src/renderer/components/Shortcuts.jsx` | Four new cheatsheet rows. |

---

## Task 1: Pure helpers — `deleteTxsFromArray`, `hideIdsToArray`

**Files:**
- Create: `src/renderer/bulkOps.mjs`
- Create: `src/renderer/bulkOps.test.mjs`

- [ ] **Step 1.1: Write the failing tests**

Create `src/renderer/bulkOps.test.mjs`:

```js
import { test, expect } from 'vitest';
import {
  deleteTxsFromArray,
  hideIdsToArray,
} from './bulkOps.mjs';

test('deleteTxsFromArray removes only specified ids', () => {
  const prev = [
    { id: 'a', amt: 10 },
    { id: 'b', amt: 20 },
    { id: 'c', amt: 30 },
  ];
  const next = deleteTxsFromArray(prev, ['a', 'c']);
  expect(next).toEqual([{ id: 'b', amt: 20 }]);
});

test('deleteTxsFromArray returns prev unchanged when ids is empty', () => {
  const prev = [{ id: 'a' }];
  expect(deleteTxsFromArray(prev, [])).toBe(prev);
});

test('deleteTxsFromArray returns prev unchanged when no ids match', () => {
  const prev = [{ id: 'a' }, { id: 'b' }];
  const next = deleteTxsFromArray(prev, ['x', 'y']);
  expect(next).toBe(prev);
});

test('hideIdsToArray adds new ids preserving existing', () => {
  const prev = ['a', 'b'];
  const next = hideIdsToArray(prev, ['c', 'd']);
  expect(next).toEqual(['a', 'b', 'c', 'd']);
});

test('hideIdsToArray dedupes already-hidden ids', () => {
  const prev = ['a', 'b'];
  const next = hideIdsToArray(prev, ['b', 'c']);
  expect(next).toEqual(['a', 'b', 'c']);
});

test('hideIdsToArray returns prev unchanged when nothing new', () => {
  const prev = ['a', 'b'];
  expect(hideIdsToArray(prev, ['a', 'b'])).toBe(prev);
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: FAIL with "Cannot find module './bulkOps.mjs'".

- [ ] **Step 1.3: Create minimal `bulkOps.mjs`**

Create `src/renderer/bulkOps.mjs`:

```js
// Pure array transformations for bulk transaction operations.
// See docs/superpowers/specs/2026-05-21-car-82-bulk-select-design.md
//
// All functions are referentially transparent. Inputs are never mutated;
// outputs are new arrays. Each function returns the original input unchanged
// when there's nothing to do (so React setters can skip re-renders).

export function deleteTxsFromArray(prevTxs, ids) {
  if (!ids || ids.length === 0) return prevTxs;
  const idSet = new Set(ids);
  let removed = 0;
  for (const tx of prevTxs) if (idSet.has(tx.id)) removed++;
  if (removed === 0) return prevTxs;
  return prevTxs.filter(tx => !idSet.has(tx.id));
}

export function hideIdsToArray(prevHidden, ids) {
  if (!ids || ids.length === 0) return prevHidden;
  const have = new Set(prevHidden);
  const additions = ids.filter(id => !have.has(id));
  if (additions.length === 0) return prevHidden;
  return [...prevHidden, ...additions];
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: 6 tests PASS.

- [ ] **Step 1.5: Commit**

```powershell
git add src/renderer/bulkOps.mjs src/renderer/bulkOps.test.mjs
git commit -m "feat(car-82): pure deleteTxsFromArray and hideIdsToArray

First two of five pure helpers for bulk transaction operations. Both
return the original input array unchanged when there's nothing to do,
so consuming setTxs(prev => ...) calls can skip re-renders.

Ref CAR-82"
```

---

## Task 2: Pure helpers — `updateTxsInArray`

**Files:**
- Modify: `src/renderer/bulkOps.mjs`
- Modify: `src/renderer/bulkOps.test.mjs`

- [ ] **Step 2.1: Add failing tests**

Append to `src/renderer/bulkOps.test.mjs` (after the existing tests, before any other code):

```js
import { updateTxsInArray } from './bulkOps.mjs';

test('updateTxsInArray patches only specified ids; other fields untouched', () => {
  const prev = [
    { id: 'a', cat: 'food', name: 'COFFEE' },
    { id: 'b', cat: 'shop', name: 'SHIRT' },
    { id: 'c', cat: 'food', name: 'LUNCH' },
  ];
  const next = updateTxsInArray(prev, ['a', 'c'], { cat: 'dining' });
  expect(next).toEqual([
    { id: 'a', cat: 'dining', name: 'COFFEE' },
    { id: 'b', cat: 'shop', name: 'SHIRT' },
    { id: 'c', cat: 'dining', name: 'LUNCH' },
  ]);
});

test('updateTxsInArray with empty ids returns prev unchanged', () => {
  const prev = [{ id: 'a', cat: 'food' }];
  expect(updateTxsInArray(prev, [], { cat: 'shop' })).toBe(prev);
});

test('updateTxsInArray with empty patch returns prev unchanged', () => {
  const prev = [{ id: 'a', cat: 'food' }];
  expect(updateTxsInArray(prev, ['a'], {})).toBe(prev);
});

test('updateTxsInArray returns prev unchanged when no ids match', () => {
  const prev = [{ id: 'a', cat: 'food' }];
  expect(updateTxsInArray(prev, ['x'], { cat: 'shop' })).toBe(prev);
});
```

> **Note:** the second `import` line at the top is intentional — keeps test additions self-contained per task. The engine will hoist imports at parse time. Alternatively, add `updateTxsInArray` to the existing import statement on line 2; both approaches work.

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: FAIL with "updateTxsInArray is not a function" or similar.

- [ ] **Step 2.3: Add the implementation**

Append to `src/renderer/bulkOps.mjs`:

```js
export function updateTxsInArray(prevTxs, ids, patch) {
  if (!ids || ids.length === 0) return prevTxs;
  if (!patch || Object.keys(patch).length === 0) return prevTxs;
  const idSet = new Set(ids);
  let touched = 0;
  for (const tx of prevTxs) if (idSet.has(tx.id)) touched++;
  if (touched === 0) return prevTxs;
  return prevTxs.map(tx => idSet.has(tx.id) ? { ...tx, ...patch } : tx);
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: 10 tests PASS (6 from Task 1 + 4 new).

- [ ] **Step 2.5: Commit**

```powershell
git add src/renderer/bulkOps.mjs src/renderer/bulkOps.test.mjs
git commit -m "feat(car-82): pure updateTxsInArray

Shallow-merges patch into transactions whose id is in ids. Returns
prev unchanged when ids/patch is empty or no ids match.

Ref CAR-82"
```

---

## Task 3: Pure helpers — `convertToTransferInArray`

**Files:**
- Modify: `src/renderer/bulkOps.mjs`
- Modify: `src/renderer/bulkOps.test.mjs`

- [ ] **Step 3.1: Add failing tests**

Append to `src/renderer/bulkOps.test.mjs`:

```js
import { convertToTransferInArray } from './bulkOps.mjs';

test('convertToTransferInArray removes the two source rows', () => {
  const prev = [
    { id: 'a', amt: -100, acct: 'chk', ccy: 'USD' },
    { id: 'b', amt: 100, acct: 'sav', ccy: 'USD' },
    { id: 'other', amt: -50, acct: 'chk', ccy: 'USD' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 100, amtTo: 100, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
  }, 'xfer_test_1');
  expect(next.find(t => t.id === 'a')).toBeUndefined();
  expect(next.find(t => t.id === 'b')).toBeUndefined();
  expect(next.find(t => t.id === 'other')).toBeDefined();
});

test('convertToTransferInArray adds two legs with correct shape', () => {
  const prev = [
    { id: 'a', amt: -100, acct: 'chk', ccy: 'USD' },
    { id: 'b', amt: 100, acct: 'sav', ccy: 'USD' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 100, amtTo: 100, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
    note: 'RENT TRANSFER',
  }, 'xfer_test_2');
  const transferId = 'xfer_test_2';
  const out = next.find(t => t.id === `${transferId}_out`);
  const inn = next.find(t => t.id === `${transferId}_in`);
  expect(out).toBeDefined();
  expect(inn).toBeDefined();
  expect(out.amt).toBe(-100);
  expect(out.acct).toBe('chk');
  expect(out.transferId).toBe(transferId);
  expect(out.transferPeer).toBe(`${transferId}_in`);
  expect(out.cat).toBe('transfer');
  expect(out.path).toEqual([]);
  expect(out.note).toBe('RENT TRANSFER');
  expect(inn.amt).toBe(100);
  expect(inn.acct).toBe('sav');
  expect(inn.transferId).toBe(transferId);
  expect(inn.transferPeer).toBe(`${transferId}_out`);
});

test('convertToTransferInArray omits note field when not provided', () => {
  const prev = [
    { id: 'a', amt: -50, acct: 'chk' },
    { id: 'b', amt: 50, acct: 'sav' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 50, amtTo: 50, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
  }, 'xfer_test_3');
  const out = next.find(t => t.id === 'xfer_test_3_out');
  expect(out).toBeDefined();
  expect('note' in out).toBe(false);
});

test('convertToTransferInArray preserves untouched txs', () => {
  const prev = [
    { id: 'a', amt: -10, acct: 'chk' },
    { id: 'b', amt: 10, acct: 'sav' },
    { id: 'x', amt: -5, acct: 'chk' },
    { id: 'y', amt: -7, acct: 'chk' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 10, amtTo: 10, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
  }, 'xfer_test_4');
  expect(next.find(t => t.id === 'x')).toEqual({ id: 'x', amt: -5, acct: 'chk' });
  expect(next.find(t => t.id === 'y')).toEqual({ id: 'y', amt: -7, acct: 'chk' });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: FAIL with "convertToTransferInArray is not a function".

- [ ] **Step 3.3: Add the implementation**

Append to `src/renderer/bulkOps.mjs`:

```js
export function convertToTransferInArray(prevTxs, aId, bId, params, transferId) {
  // Mirror the leg shape used by createTransfer in store.jsx for consistency.
  const { fromAcct, toAcct, amtFrom, amtTo, date, fromCcy, toCcy, note } = params;
  const outName = note || ('TRANSFER → ' + toAcct);
  const inName  = note || ('TRANSFER ← ' + fromAcct);
  const outLeg = {
    id: transferId + '_out',
    name: outName,
    amt: -Math.abs(amtFrom),
    date,
    acct: fromAcct,
    ccy: fromCcy || 'USD',
    cat: 'transfer',
    path: [],
    transferId,
    transferPeer: transferId + '_in',
    ...(note ? { note } : {}),
  };
  const inLeg = {
    id: transferId + '_in',
    name: inName,
    amt: Math.abs(amtTo),
    date,
    acct: toAcct,
    ccy: toCcy || 'USD',
    cat: 'transfer',
    path: [],
    transferId,
    transferPeer: transferId + '_out',
    ...(note ? { note } : {}),
  };
  const removedSet = new Set([aId, bId]);
  return [...prevTxs.filter(tx => !removedSet.has(tx.id)), outLeg, inLeg];
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: 14 tests PASS.

- [ ] **Step 3.5: Commit**

```powershell
git add src/renderer/bulkOps.mjs src/renderer/bulkOps.test.mjs
git commit -m "feat(car-82): pure convertToTransferInArray

Removes two source rows and inserts two transfer legs with shape
matching the existing createTransfer in store.jsx (transferId,
transferPeer, signs, accounts, optional note).

Ref CAR-82"
```

---

## Task 4: Pure helpers — `detectTransferPair`

**Files:**
- Modify: `src/renderer/bulkOps.mjs`
- Modify: `src/renderer/bulkOps.test.mjs`

- [ ] **Step 4.1: Add failing tests**

Append to `src/renderer/bulkOps.test.mjs`:

```js
import { detectTransferPair } from './bulkOps.mjs';

test('detectTransferPair returns null when size != 2', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'sav' },
    { id: 'c', amt: -50, acct: 'chk' },
  ];
  expect(detectTransferPair(visible, new Set(['a']))).toBeNull();
  expect(detectTransferPair(visible, new Set(['a', 'b', 'c']))).toBeNull();
});

test('detectTransferPair returns null when amounts differ', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 90, acct: 'sav' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns null when same sign', () => {
  const visible = [
    { id: 'a', amt: 100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'sav' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns null when same account', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'chk' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns null when either is already a transfer', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk', transferId: 'xfer_old' },
    { id: 'b', amt: 100, acct: 'sav' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns ordered pair when valid', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'sav' },
  ];
  const result = detectTransferPair(visible, new Set(['a', 'b']));
  expect(result).not.toBeNull();
  expect(result.out).toEqual({ id: 'a', amt: -100, acct: 'chk' });
  expect(result.inn).toEqual({ id: 'b', amt: 100, acct: 'sav' });
});

test('detectTransferPair returns ordered pair regardless of input order', () => {
  // Positive row first in visible, but `out` should still be the negative one.
  const visible = [
    { id: 'b', amt: 100, acct: 'sav' },
    { id: 'a', amt: -100, acct: 'chk' },
  ];
  const result = detectTransferPair(visible, new Set(['a', 'b']));
  expect(result).not.toBeNull();
  expect(result.out.id).toBe('a');
  expect(result.inn.id).toBe('b');
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: FAIL with "detectTransferPair is not a function".

- [ ] **Step 4.3: Add the implementation**

Append to `src/renderer/bulkOps.mjs`:

```js
export function detectTransferPair(visible, selectedIds) {
  if (!selectedIds || selectedIds.size !== 2) return null;
  const matched = visible.filter(tx => selectedIds.has(tx.id));
  if (matched.length !== 2) return null;
  const [a, b] = matched;
  if (Math.abs(a.amt) !== Math.abs(b.amt)) return null;
  if (Math.sign(a.amt) === Math.sign(b.amt)) return null;
  if (a.acct === b.acct) return null;
  if (a.transferId || b.transferId) return null;
  // out = negative leg, inn = positive leg
  const out = a.amt < 0 ? a : b;
  const inn = a.amt < 0 ? b : a;
  return { out, inn };
}
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/bulkOps.test.mjs`
Expected: 21 tests PASS (14 prior + 7 new).

> **Note on test count:** the spec said 16 tests; this plan has 21 because each `detectTransferPair` failure mode got its own test for clarity. Coverage is the same.

- [ ] **Step 4.5: Run full suite**

Run: `npm test`
Expected: 138/138 passing (132 pre-CAR-82 + 6 from Task 1 + 4 from Task 2 + 4 from Task 3 + 7 from Task 4 = 153). Actually let me recount: 132 pre + 21 new = 153.

Run: `npm test`
Expected: 153 passing across 12 test files.

- [ ] **Step 4.6: Commit**

```powershell
git add src/renderer/bulkOps.mjs src/renderer/bulkOps.test.mjs
git commit -m "feat(car-82): pure detectTransferPair

Heuristic returns the ordered { out, inn } pair when exactly two
selected rows look like a transfer (equal abs amount, opposite signs,
different accounts, neither already a transfer). Returns null on any
mismatch.

Ref CAR-82"
```

---

## Task 5: Bulk methods in `store.jsx` + expose `hidden`

**Files:**
- Modify: `src/renderer/store.jsx`

- [ ] **Step 5.1: Add the import**

At the top of `src/renderer/store.jsx`, find the existing imports. Add a new import line for the bulk helpers:

```jsx
import {
  deleteTxsFromArray,
  hideIdsToArray,
  updateTxsInArray,
  convertToTransferInArray,
} from './bulkOps.mjs';
```

(Place it near the other relative imports at the top.)

- [ ] **Step 5.2: Add the four bulk setter callbacks**

Find the existing `removeBudget` callback (currently around line 500-502 — use grep to locate exactly). After the `removeBudget` block's closing `}, [setBudgets]);`, add a comment header and the four new methods:

```jsx
  // ─── CAR-82 bulk transaction operations ──────────────────────────────────
  // Single-render variants. Each is registered as ONE undo entry by the
  // useUndoableStore wrappers (see useUndoableStore.js). Atomicity matters:
  // 50 sequential setTxs calls would run the reducer 50 times even with
  // React's render batching.

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
    if (!aId || !bId || !transferId) return;
    const fromAcctObj = accounts.find(a => a.id === params.fromAcct);
    const toAcctObj   = accounts.find(a => a.id === params.toAcct);
    setTxs(prev => convertToTransferInArray(prev, aId, bId, {
      ...params,
      fromCcy: fromAcctObj?.ccy || 'USD',
      toCcy:   toAcctObj?.ccy || 'USD',
    }, transferId));
  }, [accounts, setTxs]);
```

- [ ] **Step 5.3: Expose the new methods + `hidden` on the context value**

Find the `<StoreCtx.Provider value={{ ... }}>` block. After the existing `setHidden,` line, add `hidden,` (read-side exposure for undo wrappers). Then in a sensible location (e.g. near other tx-related methods like `removeBudget,` or grouped with the new methods), add:

```jsx
      // CAR-82 bulk methods
      deleteTxs,
      hideTxs,
      updateTxs,
      convertToTransfer,
```

> **Note:** `hidden` was previously not exposed; only `setHidden` was added by CAR-81 Task 8. Locate the `setHidden,` line and add `hidden,` immediately above or below it. The `hidden` variable is already in scope (it's the `useLS('ledger:hidden', [])` value at the top of `StoreProvider`).

- [ ] **Step 5.4: Verify build is clean**

Run: `npx vite build`
Expected: clean build, no errors. (PowerShell may render the chunk-size advisory as a stderr error — that's a pre-existing cosmetic issue, not a real failure. Verify by looking for `built in` in the output.)

- [ ] **Step 5.5: Run full test suite**

Run: `npm test`
Expected: 153/153 passing (no behavioural change — methods are exposed but not yet called).

- [ ] **Step 5.6: Commit**

```powershell
git add src/renderer/store.jsx
git commit -m "feat(car-82): bulk transaction methods in store

Adds deleteTxs, hideTxs, updateTxs, convertToTransfer — single-render
wrappers around the pure helpers in bulkOps.mjs. Each does ONE setTxs
call regardless of batch size, so undo wrappers can capture state
once and restore atomically.

Also exposes 'hidden' (read-side) on the context value so undo
wrappers can compute the diff between newly-hidden and already-hidden
ids.

Ref CAR-82"
```

---

## Task 6: Undo wrappers in `useUndoableStore.js`

**Files:**
- Modify: `src/renderer/useUndoableStore.js`

- [ ] **Step 6.1: Add `deleteTxs` wrapper**

Open `src/renderer/useUndoableStore.js`. Before the `return` statement (currently around line 167-176), add a new section:

```js
  // ─── CAR-82 bulk wrappers ────────────────────────────────────────────────
  // batchKey: null on each — these are already batches and must not coalesce.

  const deleteTxs = React.useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const removed = store.allTransactions.filter(t => idSet.has(t.id));
    if (removed.length === 0) return;
    // Extend capture to include orphan transfer legs. If the user deletes one
    // leg of a transfer, both legs are deleted (matches single-row semantics).
    const transferIds = new Set(removed.map(t => t.transferId).filter(Boolean));
    const orphanLegs = transferIds.size === 0 ? [] :
      store.allTransactions.filter(t =>
        t.transferId && transferIds.has(t.transferId) && !idSet.has(t.id)
      );
    const fullCapture = [...removed, ...orphanLegs];
    const fullIds = fullCapture.map(t => t.id);
    stack.register({
      label: fullCapture.length === 1
        ? 'Transaction deleted'
        : `${fullCapture.length} transactions deleted`,
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

- [ ] **Step 6.2: Add `hideTxs` wrapper**

Continue in the same section:

```js
  const hideTxs = React.useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    const beforeHidden = new Set(store.hidden || []);
    const newlyHidden = ids.filter(id => !beforeHidden.has(id));
    if (newlyHidden.length === 0) return;
    stack.register({
      label: newlyHidden.length === 1
        ? 'Transaction hidden'
        : `${newlyHidden.length} transactions hidden`,
      batchKey: null,
      do:   () => store.hideTxs(newlyHidden),
      undo: () => {
        const undoSet = new Set(newlyHidden);
        store.setHidden(prev => prev.filter(id => !undoSet.has(id)));
      },
    });
  }, [store, stack]);
```

- [ ] **Step 6.3: Add `updateTxs` wrapper**

Continue:

```js
  const updateTxs = React.useCallback((ids, patch) => {
    if (!ids || ids.length === 0) return;
    if (!patch || Object.keys(patch).length === 0) return;
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
      label: before.length === 1
        ? 'Transaction updated'
        : `${before.length} transactions updated`,
      batchKey: null,
      do:   () => store.updateTxs(ids, patch),
      undo: () => store.setTransactions(prev => {
        const byId = Object.fromEntries(before.map(s => [s.id, s]));
        return prev.map(tx => byId[tx.id] ? { ...tx, ...byId[tx.id] } : tx);
      }),
    });
  }, [store, stack]);
```

- [ ] **Step 6.4: Add `convertToTransfer` wrapper**

Continue:

```js
  const convertToTransfer = React.useCallback((aId, bId, params) => {
    const a = store.allTransactions.find(t => t.id === aId);
    const b = store.allTransactions.find(t => t.id === bId);
    if (!a || !b) return;
    // Pre-generate the transfer id so do() and undo() share it.
    const transferId = 'xfer_' + Date.now();
    stack.register({
      label: 'Marked as transfer',
      batchKey: null,
      do:   () => store.convertToTransfer(aId, bId, params, transferId),
      undo: () => store.setTransactions(prev => {
        // Remove both new legs (matched by transferId) and re-add originals.
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

- [ ] **Step 6.5: Update the return statement**

Find the existing `return { ...store, deleteTx, hideTx, deleteTransfer, ... };` block. Add the four new wrappers:

```js
  return {
    ...store,
    deleteTx, hideTx, deleteTransfer,
    archiveAccount, deleteAccount,
    deleteRecurring, removeBudget, deleteGoal,
    removeCategory, removeHolding,
    // CAR-82 bulk wrappers
    deleteTxs, hideTxs, updateTxs, convertToTransfer,
  };
```

- [ ] **Step 6.6: Verify build is clean**

Run: `npx vite build`
Expected: clean build.

- [ ] **Step 6.7: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 6.8: Commit**

```powershell
git add src/renderer/useUndoableStore.js
git commit -m "feat(car-82): undo wrappers for the four bulk methods

deleteTxs, hideTxs, updateTxs, convertToTransfer each register as ONE
undo entry (batchKey: null prevents coalescing). deleteTxs extends
capture to orphan transfer legs. updateTxs snapshots only the patched
keys per id. convertToTransfer pre-generates the transferId so undo
can target it.

No consumers yet — wired up in Task 12.

Ref CAR-82"
```

---

## Task 7: `<Checkbox>` primitive in `Shared.jsx`

**Files:**
- Modify: `src/renderer/components/Shared.jsx`

- [ ] **Step 7.1: Add the component**

Open `src/renderer/components/Shared.jsx`. After the existing `ALabel` export (currently around lines 41-48), add:

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

- [ ] **Step 7.2: Verify build is clean**

Run: `npx vite build`
Expected: clean build.

- [ ] **Step 7.3: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 7.4: Commit**

```powershell
git add src/renderer/components/Shared.jsx
git commit -m "feat(car-82): Checkbox primitive in Shared.jsx

Custom 14x14 checkbox using A theme tokens. Supports checked /
unchecked / indeterminate (mixed) states. role=checkbox, aria-checked
honoring 'mixed', Space/Enter keyboard activation, onMouseDown
exposed for shift-click capture. No styled-checkbox precedent in the
codebase to reuse.

Ref CAR-82"
```

---

## Task 8: `useBulkSelection` hook

**Files:**
- Create: `src/renderer/hooks/useBulkSelection.js`

- [ ] **Step 8.1: Create the hook**

Create `src/renderer/hooks/useBulkSelection.js`:

```js
import React from 'react';

/**
 * Selection state for a list of items with `id` fields.
 * `visible` is the current list (used by `range` and `selectAll` to map
 * indices to ids). The hook does NOT auto-prune stale ids when items
 * disappear from `visible` — stale ids are harmless because callers only
 * consult `isSelected(id)` while rendering rows that are in `visible`.
 *
 * Auto-clearing on context changes (period, filter, search) is the
 * caller's responsibility — see WebTransactions.jsx auto-clear effects.
 */
export default function useBulkSelection(visible) {
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());
  const [anchorIdx, setAnchorIdx] = React.useState(null);

  const toggle = React.useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const range = React.useCallback((anchor, target) => {
    if (anchor == null || target == null) return;
    const lo = Math.min(anchor, target);
    const hi = Math.max(anchor, target);
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

  const isSelected = React.useCallback((id) => selectedIds.has(id), [selectedIds]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    toggle,
    range,
    selectAll,
    clear,
    anchorIdx,
    setAnchor: setAnchorIdx,
  };
}
```

- [ ] **Step 8.2: Verify build is clean**

Run: `npx vite build`
Expected: clean build (file is unused so far; just compiles).

- [ ] **Step 8.3: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 8.4: Commit**

```powershell
git add src/renderer/hooks/useBulkSelection.js
git commit -m "feat(car-82): useBulkSelection hook

Owns selectedIds (Set) and anchorIdx state. Returns toggle/range/
selectAll/clear/isSelected/setAnchor and the count. Does not
auto-prune stale ids; auto-clearing on context changes is the
caller's job.

Ref CAR-82"
```

---

## Task 9: Extract `<TransactionRow>` from `WebTransactions.jsx`

This is a refactor commit — same behaviour, code moved. The new component takes the existing row props plus a couple of bulk-aware additions that aren't yet wired (default-undefined props).

**Files:**
- Create: `src/renderer/components/TransactionRow.jsx`
- Modify: `src/renderer/screens/web/WebTransactions.jsx`

- [ ] **Step 9.1: Create the component**

Create `src/renderer/components/TransactionRow.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';
import { Checkbox } from './Shared';
import { fmtSigned, dayLabel, catGlyph, catBreadcrumb } from '../data';

/**
 * Presentational row for the web transactions list. All click decisions
 * (open edit modal vs. toggle selection vs. extend range) live in the
 * parent — this component just calls back with the click events.
 *
 * Grid columns: 28px (checkbox) | 90px (date) | 24px (glyph) | 1fr (merchant)
 * | 280px (category) | 90px (account) | 120px (amount).
 */
export default function TransactionRow({
  tx,
  t,
  isFocused = false,
  isSelected = false,
  accountsWithBalance,
  onRowClick,
  onCheckboxToggle,
  innerRef,
}) {
  const accentColor = tx.cat === 'transfer' ? A.ink2 : (tx.amt >= 0 ? t.accent : A.ink);
  return (
    <div
      ref={innerRef}
      aria-selected={isFocused ? 'true' : 'false'}
      onClick={onRowClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 90px 24px 1fr 280px 90px 120px',
        padding: t.density === 'compact' ? '7px 0' : '10px 0',
        fontSize: 11,
        borderBottom: '1px solid ' + A.rule2,
        alignItems: 'center',
        cursor: 'pointer',
        borderLeft: isFocused ? '2px solid ' + A.ink : '2px solid transparent',
        background: isSelected ? A.bg2 : 'transparent',
      }}
      onMouseEnter={e => {
        if (!isSelected) e.currentTarget.style.background = A.bg2;
      }}
      onMouseLeave={e => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Checkbox
          checked={isSelected}
          ariaLabel={`Select transaction ${tx.name}`}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onCheckboxToggle?.(e);
          }}
        />
      </div>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.date)}</div>
      <div>{tx.cat === 'transfer' ? '⇄' : catGlyph(tx.path || [tx.cat])}</div>
      <div style={{ fontSize: 12 }}>{tx.name}</div>
      <div style={{ color: A.ink2, fontSize: 10, letterSpacing: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tx.cat === 'transfer' ? 'TRANSFER' : catBreadcrumb(tx.path || [tx.cat])}
      </div>
      <div style={{ color: A.muted, fontSize: 10 }}>
        {accountsWithBalance.find(a => a.id === tx.acct)?.code}
      </div>
      <div style={{
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: accentColor,
      }}>
        {fmtSigned(tx.amt, tx.ccy, t.decimals)}
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: Update `WebTransactions.jsx`**

In `src/renderer/screens/web/WebTransactions.jsx`:

1. Add the import at the top, after the other component imports:
```jsx
import TransactionRow from '../../components/TransactionRow';
```

2. Update the column-header grid template from `90px 24px 1fr 280px 90px 120px` to `28px 90px 24px 1fr 280px 90px 120px`. The header row currently looks like (around line 146):

```jsx
<div style={{ display: 'grid', gridTemplateColumns: '90px 24px 1fr 280px 90px 120px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
  <div>DATE</div><div /><div>MERCHANT</div><div>CATEGORY</div><div>ACCT</div><div style={{ textAlign: 'right' }}>AMOUNT</div>
</div>
```

Replace with:

```jsx
<div style={{ display: 'grid', gridTemplateColumns: '28px 90px 24px 1fr 280px 90px 120px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
  <div /><div>DATE</div><div /><div>MERCHANT</div><div>CATEGORY</div><div>ACCT</div><div style={{ textAlign: 'right' }}>AMOUNT</div>
</div>
```

(One extra empty `<div />` at the start for the checkbox column header.)

3. Replace the inline row mapping (currently around lines 158-185) with `<TransactionRow>`:

```jsx
{visible.map((tx, i) => (
  <TransactionRow
    key={tx.id}
    tx={tx}
    t={t}
    isFocused={i === selectedIdx}
    isSelected={false /* wired in Task 12 */}
    accountsWithBalance={accountsWithBalance}
    onRowClick={() => setEditTx(tx)}
    onCheckboxToggle={undefined /* wired in Task 12 */}
    innerRef={el => { if (el) rowRefs.current[tx.id] = el; else delete rowRefs.current[tx.id]; }}
  />
))}
```

- [ ] **Step 9.3: Verify the dev experience**

Run: `npx vite build`
Expected: clean build.

Run `npm run dev` if you want to visually confirm the table still renders correctly with an empty checkbox column. Otherwise the build alone catches grid template issues.

- [ ] **Step 9.4: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 9.5: Commit**

```powershell
git add src/renderer/components/TransactionRow.jsx src/renderer/screens/web/WebTransactions.jsx
git commit -m "refactor(car-82): extract TransactionRow component

Pure refactor — same behaviour. Adds an empty 28px leading column
that will hold the bulk-select checkbox in Task 12. Header gets a
matching empty cell. The Checkbox is rendered but the parent passes
isSelected=false and onCheckboxToggle=undefined for now.

Ref CAR-82"
```

---

## Task 10: `<BulkActionBar>` component

**Files:**
- Create: `src/renderer/components/BulkActionBar.jsx`

- [ ] **Step 10.1: Create the component**

Create `src/renderer/components/BulkActionBar.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { CATEGORIES } from '../data';

const BAR_BUTTON_STYLE = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: A.font,
  fontSize: 10,
  letterSpacing: 1.4,
  color: A.ink,
  textTransform: 'uppercase',
  fontWeight: 600,
};

const POPOVER_STYLE = {
  position: 'absolute',
  bottom: '100%',
  marginBottom: 8,
  background: A.bg,
  border: '1px solid ' + A.ink,
  fontFamily: A.font,
  minWidth: 200,
  maxHeight: 240,
  overflow: 'auto',
  boxSizing: 'border-box',
};

const POPOVER_ITEM_STYLE = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  letterSpacing: 0.8,
  color: A.ink,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid ' + A.rule2,
  cursor: 'pointer',
  fontFamily: A.font,
};

const VRULE = (
  <div style={{ width: 1, height: 16, background: A.rule2 }} />
);

export default function BulkActionBar({
  count,
  canMarkAsTransfer,
  categoryTree,
  accountsWithBalance,
  onCategorize,
  onSetAccount,
  onMarkAsTransfer,
  onHide,
  onDelete,
  onClear,
}) {
  const [openPicker, setOpenPicker] = React.useState(null); // 'category' | 'account' | null

  // Close picker on Esc.
  React.useEffect(() => {
    if (!openPicker) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpenPicker(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPicker]);

  // Close picker on outside click.
  const barRef = React.useRef(null);
  React.useEffect(() => {
    if (!openPicker) return undefined;
    const onClick = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) {
        setOpenPicker(null);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [openPicker]);

  const handleCategorize = (key, path) => {
    onCategorize?.({ cat: key, path });
    setOpenPicker(null);
  };

  const handleSetAccount = (acctId) => {
    onSetAccount?.(acctId);
    setOpenPicker(null);
  };

  const categoryEntries = Object.entries(CATEGORIES);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={`Bulk actions for ${count} selected transactions`}
      style={{
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
      }}
    >
      <ALabel style={{ color: A.ink }}>{count} SELECTED</ALabel>

      {VRULE}

      {/* CATEGORIZE */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpenPicker(p => p === 'category' ? null : 'category')}
          style={BAR_BUTTON_STYLE}
        >
          CATEGORIZE
        </button>
        {openPicker === 'category' && (
          <div style={POPOVER_STYLE}>
            {categoryEntries.map(([key, info]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleCategorize(key, [key])}
                style={POPOVER_ITEM_STYLE}
                onMouseEnter={(e) => { e.currentTarget.style.background = A.bg2; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {info.glyph} {info.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SET ACCOUNT */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpenPicker(p => p === 'account' ? null : 'account')}
          style={BAR_BUTTON_STYLE}
        >
          SET ACCOUNT
        </button>
        {openPicker === 'account' && (
          <div style={POPOVER_STYLE}>
            {accountsWithBalance.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => handleSetAccount(a.id)}
                style={POPOVER_ITEM_STYLE}
                onMouseEnter={(e) => { e.currentTarget.style.background = A.bg2; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {a.name} · {a.code}
              </button>
            ))}
          </div>
        )}
      </div>

      {canMarkAsTransfer && (
        <button
          type="button"
          onClick={onMarkAsTransfer}
          style={BAR_BUTTON_STYLE}
        >
          MARK AS TRANSFER
        </button>
      )}

      <button
        type="button"
        onClick={onHide}
        style={BAR_BUTTON_STYLE}
      >
        HIDE
      </button>

      <button
        type="button"
        onClick={onDelete}
        onMouseEnter={(e) => { e.currentTarget.style.color = A.neg; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = A.ink; }}
        style={BAR_BUTTON_STYLE}
      >
        DELETE
      </button>

      {VRULE}

      <button
        type="button"
        onClick={onClear}
        style={{ ...BAR_BUTTON_STYLE, color: A.muted }}
        onMouseEnter={(e) => { e.currentTarget.style.color = A.ink; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = A.muted; }}
      >
        CLEAR
      </button>
    </div>
  );
}
```

> **Note on `categoryTree`:** the design originally suggested using `store.categoryTree` for the picker. The simpler approach used here is to use the static `CATEGORIES` map from `src/renderer/data.js` (the same source the existing `WebAddModal` uses for category chips). This keeps the picker simple and consistent with how the rest of the app picks categories. If the user defines custom subcategories later, this could be swapped to a tree picker — out of scope here.

- [ ] **Step 10.2: Verify build is clean**

Run: `npx vite build`
Expected: clean build (component is unused so far).

- [ ] **Step 10.3: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 10.4: Commit**

```powershell
git add src/renderer/components/BulkActionBar.jsx
git commit -m "feat(car-82): BulkActionBar component

Bottom-center fixed bar with CATEGORIZE / SET ACCOUNT (inline
popovers) / MARK AS TRANSFER (conditional) / HIDE / DELETE / CLEAR.
DELETE hover color is A.neg. Pickers close on outside click and Esc.
Uses static CATEGORIES from data.js for the category picker — same
source as WebAddModal.

No consumers yet; wired in Task 12.

Ref CAR-82"
```

---

## Task 11: `<WebAddModal>` accepts `convertFromTxs` prop

**Files:**
- Modify: `src/renderer/screens/web/WebAddModal.jsx`

- [ ] **Step 11.1: Add `convertFromTxs` prop and pre-fill logic**

In `src/renderer/screens/web/WebAddModal.jsx`:

1. Update the component signature (currently line 9):

```jsx
export default function WebAddModal({ t, onClose, editTx = null, convertFromTxs = null }) {
```

2. Update the `useUndoableStore` destructure (currently line 10) to include `convertToTransfer`:

```jsx
  const { addTransactions, updateTx, deleteTx, deleteTransfer, createTransfer, updateTransfer, convertToTransfer, transactions, accountsWithBalance, selectedPeriod } = useUndoableStore();
```

3. Add a derived `convertingPair` constant after the existing `transferLegs` block (currently around line 22, after the closing `}, [editTx, transactions]);` of `transferLegs`):

```jsx
  const convertingPair = React.useMemo(() => {
    if (!convertFromTxs || convertFromTxs.length !== 2) return null;
    const [a, b] = convertFromTxs;
    const out = a.amt < 0 ? a : b;
    const inn = a.amt < 0 ? b : a;
    return { out, inn };
  }, [convertFromTxs]);
```

4. The transfer-mode initial state currently keys off `editTx?.cat === 'transfer'` and `transferLegs` (lines 32-41). Extend each initialiser to fall back through `convertingPair`. Replace lines 32-41 with:

```jsx
  // Transfer state
  const [isTransfer, setIsTransfer] = React.useState(
    editTx?.cat === 'transfer' || convertingPair != null
  );
  const [fromAcct, setFromAcct] = React.useState(
    transferLegs?.out.acct
      || convertingPair?.out.acct
      || editTx?.acct
      || accountsWithBalance[0]?.id
      || 'chk'
  );
  const [toAcct, setToAcct] = React.useState(() => {
    if (transferLegs) return transferLegs.in.acct;
    if (convertingPair) return convertingPair.inn.acct;
    const others = accountsWithBalance.filter(a => a.id !== (editTx?.acct || accountsWithBalance[0]?.id));
    return others[0]?.id || '';
  });
  const [amtFrom, setAmtFrom] = React.useState(
    transferLegs ? String(Math.abs(transferLegs.out.amt))
      : convertingPair ? String(Math.abs(convertingPair.out.amt))
      : ''
  );
  const [amtTo, setAmtTo] = React.useState(
    transferLegs ? String(Math.abs(transferLegs.in.amt))
      : convertingPair ? String(Math.abs(convertingPair.inn.amt))
      : ''
  );
  const [transferNote, setTransferNote] = React.useState(
    transferLegs?.out.note || convertingPair?.out.note || convertingPair?.inn.note || ''
  );
```

5. Update the `date` initial state to also pre-fill from `convertingPair` (currently line 29):

Replace:
```jsx
  const [date, setDate]         = React.useState(editTx ? editTx.date : defaultDate);
```
with:
```jsx
  const [date, setDate]         = React.useState(
    editTx ? editTx.date
      : convertingPair ? convertingPair.out.date
      : defaultDate
  );
```

6. Add a new branch in `handleSave` (currently lines 56-89). After the existing `if (isTransfer) { ... }` block but before the closing brace of the function, the structure looks like:

```jsx
const handleSave = () => {
  if (!canSave) return;
  if (isTransfer) {
    if (editTx?.transferId) {
      updateTransfer(...);
    } else {
      createTransfer(...);
    }
  } else {
    // ... non-transfer save
  }
  onClose();
};
```

Replace the `if (isTransfer) { ... }` block with:

```jsx
    if (isTransfer) {
      if (editTx?.transferId) {
        updateTransfer(editTx.transferId, {
          fromAcct, toAcct,
          amtFrom: parseFloat(amtFrom),
          amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
          date,
          note: transferNote.trim() || undefined,
        });
      } else if (convertingPair) {
        convertToTransfer(convertingPair.out.id, convertingPair.inn.id, {
          fromAcct, toAcct,
          amtFrom: parseFloat(amtFrom),
          amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
          date,
          note: transferNote.trim() || undefined,
        });
      } else {
        createTransfer({
          fromAcct, toAcct,
          amtFrom: parseFloat(amtFrom),
          amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
          date,
          note: transferNote.trim() || undefined,
        });
      }
    }
```

(The `else` branch and the closing remain unchanged.)

- [ ] **Step 11.2: Verify build is clean**

Run: `npx vite build`
Expected: clean build.

- [ ] **Step 11.3: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 11.4: Commit**

```powershell
git add src/renderer/screens/web/WebAddModal.jsx
git commit -m "feat(car-82): WebAddModal accepts convertFromTxs prop

When convertFromTxs is set, the modal pre-fills transfer-mode fields
from the two source rows (out = negative leg, inn = positive leg) and
calls convertToTransfer instead of createTransfer on save. The
two source rows are atomically removed and the new legs added in one
undo entry.

No consumers yet; wired in Task 12.

Ref CAR-82"
```

---

## Task 12: Wire it all in `WebTransactions.jsx`

This is the integration commit — the largest single change in the plan.

**Files:**
- Modify: `src/renderer/screens/web/WebTransactions.jsx`

- [ ] **Step 12.1: Add imports**

At the top of `src/renderer/screens/web/WebTransactions.jsx`, add three new imports:

```jsx
import useBulkSelection from '../../hooks/useBulkSelection';
import BulkActionBar from '../../components/BulkActionBar';
import { detectTransferPair } from '../../bulkOps.mjs';
```

- [ ] **Step 12.2: Destructure new store methods**

Update the `useUndoableStore()` destructure on line 22:

```jsx
const {
  transactions, periodTransactions, deleteTx, deleteTransfer,
  accountsWithBalance, periodLabel, txFilter, clearTxFilter,
  // CAR-82
  deleteTxs, hideTxs, updateTxs,
} = useUndoableStore();
```

- [ ] **Step 12.3: Wire the selection hook**

After the existing `useState`/`useRef` lines (around line 28, after `rowRefs`), add:

```jsx
  const bulk = useBulkSelection(visible);
```

Wait — `visible` is computed below (line 53). The hook needs `visible` so it must be called after `visible` is defined. Move the `bulk` line to immediately after `const total = visible.reduce(...)` (around line 66, before the existing `useEffect` that resets `selectedIdx`).

So the order becomes:

```jsx
  const visible = sourceTxs.filter(...);
  const total = visible.reduce((s, x) => s + Math.abs(x.amt), 0);
  const bulk = useBulkSelection(visible);

  // existing useEffects below...
```

- [ ] **Step 12.4: Add auto-clear effects**

After the existing `selectedIdx` reset effect (currently around lines 68-70), add four new effects:

```jsx
  // CAR-82: clear bulk selection on context change.
  React.useEffect(() => bulk.clear(), [/* eslint-disable-line react-hooks/exhaustive-deps */ filter]);
  React.useEffect(() => bulk.clear(), [/* eslint-disable-line react-hooks/exhaustive-deps */ search]);
  React.useEffect(() => bulk.clear(), [/* eslint-disable-line react-hooks/exhaustive-deps */ txFilter]);
  // selectedPeriod is read indirectly via periodTransactions changing; clear on visible identity change
  // when the first row id flips (covers period changes that produce different first-row ids).
  React.useEffect(() => {
    bulk.clear();
  }, [/* eslint-disable-line react-hooks/exhaustive-deps */ periodLabel]);
```

> **Why `periodLabel` for the period clear:** the `selectedPeriod` value isn't directly destructured here, but `periodLabel` updates whenever `selectedPeriod` does (it's a derived display string from the store). Using `periodLabel` is cheaper than reaching for `selectedPeriod` and avoids destructuring another field.

> **Why disable exhaustive-deps:** the hook returns a stable `bulk.clear` (memoized with empty deps inside `useBulkSelection`), so listing only the trigger value is correct. Since the project has no eslint config, the disable comments are documentation rather than enforcement, but they make intent explicit.

- [ ] **Step 12.5: Update keyboard bindings**

Replace the existing `txBindings` block (currently lines 81-89) with:

```jsx
  const txBindings = React.useMemo(() => [
    { keys: 'j', handler: (e) => {
        const next = Math.min(selectedIdx + 1, Math.max(0, visible.length - 1));
        if (e.shiftKey && visible[next]) bulk.toggle(visible[next].id);
        setSelectedIdx(next);
        bulk.setAnchor(next);
      } },
    { keys: 'k', handler: (e) => {
        const next = Math.max(0, selectedIdx - 1);
        if (e.shiftKey && visible[next]) bulk.toggle(visible[next].id);
        setSelectedIdx(next);
        bulk.setAnchor(next);
      } },
    { keys: 'e', handler: () => {
        if (bulk.selectedCount > 0) return;
        const tx = visible[selectedIdx];
        if (tx) setEditTx(tx);
      } },
    { keys: '/', handler: () => searchRef.current?.focus() },
    { keys: 'x', handler: () => {
        const tx = visible[selectedIdx];
        if (tx) {
          bulk.toggle(tx.id);
          bulk.setAnchor(selectedIdx);
        }
      } },
    { keys: 'a', handler: (e) => {
        if (e.altKey) return;
        bulk.selectAll();
      } },
    { keys: 'Escape', handler: () => {
        if (bulk.selectedCount > 0) {
          bulk.clear();
        }
      } },
  ], [visible, selectedIdx, bulk]);
```

- [ ] **Step 12.6: Add `convertFromTxs` state for the mark-as-transfer flow**

After the existing `editTx` state declaration (currently line 25), add:

```jsx
  const [convertFromTxs, setConvertFromTxs] = React.useState(null);
```

- [ ] **Step 12.7: Compute the transfer-pair detection**

After the `bulk` declaration (Step 12.3), add:

```jsx
  const transferPair = React.useMemo(
    () => detectTransferPair(visible, bulk.selectedIds),
    [visible, bulk.selectedIds]
  );
  const canMarkAsTransfer = transferPair !== null;
```

- [ ] **Step 12.8: Wire the row click + checkbox**

Update the `<TransactionRow>` mapping that was scaffolded in Task 9 to actually wire the bulk handlers:

```jsx
{visible.map((tx, i) => (
  <TransactionRow
    key={tx.id}
    tx={tx}
    t={t}
    isFocused={i === selectedIdx}
    isSelected={bulk.isSelected(tx.id)}
    accountsWithBalance={accountsWithBalance}
    onRowClick={(e) => {
      // Suppress edit-modal open while in bulk-select mode.
      if (bulk.selectedCount > 0) return;
      // Shift+click on row body extends selection (alternative to checkbox).
      if (e.shiftKey) {
        if (bulk.anchorIdx != null) bulk.range(bulk.anchorIdx, i);
        else { bulk.toggle(tx.id); bulk.setAnchor(i); }
        return;
      }
      // Cmd/Ctrl+click toggles a single row.
      if (e.metaKey || e.ctrlKey) {
        bulk.toggle(tx.id);
        bulk.setAnchor(i);
        return;
      }
      // Plain click: open edit modal (existing behaviour).
      setEditTx(tx);
    }}
    onCheckboxToggle={(e) => {
      // Shift-click on checkbox extends selection.
      if (e.shiftKey && bulk.anchorIdx != null) {
        bulk.range(bulk.anchorIdx, i);
      } else {
        bulk.toggle(tx.id);
        bulk.setAnchor(i);
      }
    }}
    innerRef={el => { if (el) rowRefs.current[tx.id] = el; else delete rowRefs.current[tx.id]; }}
  />
))}
```

- [ ] **Step 12.9: Mount the bulk action bar**

After the existing `{editTx && <WebAddModal ... />}` line (currently around line 188-190), add:

```jsx
      {bulk.selectedCount > 0 && (
        <BulkActionBar
          count={bulk.selectedCount}
          canMarkAsTransfer={canMarkAsTransfer}
          accountsWithBalance={accountsWithBalance}
          onCategorize={({ cat, path }) => {
            updateTxs([...bulk.selectedIds], { cat, path });
            bulk.clear();
          }}
          onSetAccount={(acctId) => {
            updateTxs([...bulk.selectedIds], { acct: acctId });
            bulk.clear();
          }}
          onMarkAsTransfer={() => {
            if (transferPair) setConvertFromTxs([transferPair.out, transferPair.inn]);
          }}
          onHide={() => {
            hideTxs([...bulk.selectedIds]);
            bulk.clear();
          }}
          onDelete={() => {
            deleteTxs([...bulk.selectedIds]);
            bulk.clear();
          }}
          onClear={() => bulk.clear()}
        />
      )}

      {convertFromTxs && (
        <WebAddModal
          t={t}
          convertFromTxs={convertFromTxs}
          onClose={() => {
            setConvertFromTxs(null);
            bulk.clear();
          }}
        />
      )}
```

- [ ] **Step 12.10: Verify build is clean**

Run: `npx vite build`
Expected: clean build.

- [ ] **Step 12.11: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 12.12: Smoke-test in dev**

Run: `npm run dev`. Walk through the basics:
- Click a checkbox → bar appears, count = 1.
- Click another → count = 2.
- Click DELETE → both rows disappear, undo toast shows "2 transactions deleted".
- Press Ctrl+Z → both restore.
- `Esc` → selection clears.

If any obvious break, fix and re-test before committing. Quit with Ctrl+C.

- [ ] **Step 12.13: Commit**

```powershell
git add src/renderer/screens/web/WebTransactions.jsx
git commit -m "feat(car-82): wire bulk select on web transactions

Connects useBulkSelection, BulkActionBar, the four bulk wrappers, the
mark-as-transfer flow (via WebAddModal's convertFromTxs prop), and
the new keyboard bindings (x, Shift+j/k, a, Esc-clears-selection).
Auto-clears selection on filter, search, txFilter, and period
changes. Click-row-to-edit is suppressed when count > 0.

Ref CAR-82"
```

---

## Task 13: Add cheatsheet rows for the new shortcuts

**Files:**
- Modify: `src/renderer/components/Shortcuts.jsx`

- [ ] **Step 13.1: Add four rows to the TRANSACTIONS section**

Open `src/renderer/components/Shortcuts.jsx`. Find the TRANSACTIONS section (the third `SECTIONS` entry, currently with items `j/k`, `e`, `/`). Add four new entries:

```js
  {
    title: 'TRANSACTIONS',
    items: [
      ['j / k',     'Select previous / next row'],
      ['e',         'Edit selected transaction'],
      ['/',         'Focus search'],
      ['x',         'Toggle selection of current row'],
      ['Shift+j/k', 'Move and extend selection'],
      ['a',         'Select all visible'],
      ['Esc',       'Clear selection'],
    ],
  },
```

- [ ] **Step 13.2: Verify build is clean**

Run: `npx vite build`
Expected: clean build.

- [ ] **Step 13.3: Run full test suite**

Run: `npm test`
Expected: 153/153 passing.

- [ ] **Step 13.4: Commit**

```powershell
git add src/renderer/components/Shortcuts.jsx
git commit -m "docs(car-82): list bulk-select shortcuts in cheatsheet

Adds x (toggle current row), Shift+j/k (move and extend), a (select
all visible), Esc (clear selection) to the TRANSACTIONS section.

Ref CAR-82"
```

---

## Task 14: Build verification + UAT

**Files:** none (verification only)

- [ ] **Step 14.1: Production build**

Run: `npx vite build`
Expected: clean build, no errors.

- [ ] **Step 14.2: Full test suite**

Run: `npm test`
Expected: 153/153 passing across 12 test files.

- [ ] **Step 14.3: Manual UAT**

Run: `npm run dev`. Walk through the table from spec §14:

| # | Action | Pass? |
|---|---|---|
| 1 | Click row body → edit modal opens | [ ] |
| 2 | Click checkbox → row toggles, action bar shows `1 SELECTED` | [ ] |
| 3 | Click another checkbox → `2 SELECTED` | [ ] |
| 4 | Shift+click row 5 down → range of 5 selected | [ ] |
| 5 | Cmd/Ctrl+click a selected row → that row toggles off | [ ] |
| 6 | Click row body while count > 0 → edit does NOT open | [ ] |
| 7 | Esc with selection → clears | [ ] |
| 8 | Change period (`[`/`]`) → selection clears | [ ] |
| 9 | Type in search → selection clears | [ ] |
| 10 | Click filter chip → selection clears | [ ] |
| 11 | j/k movement (no shift) → no selection change | [ ] |
| 12 | Shift+j → cursor advances + new row toggles | [ ] |
| 13 | x → toggles current row | [ ] |
| 14 | a → selects all visible | [ ] |
| 15 | Bulk DELETE on 5 → all gone, undo toast `5 transactions deleted`, UNDO restores | [ ] |
| 16 | Bulk DELETE includes transfer leg → both legs deleted, full undo | [ ] |
| 17 | Bulk CATEGORIZE → all selected get new cat, UNDO reverts | [ ] |
| 18 | Bulk SET ACCOUNT → all selected get new acct, UNDO reverts | [ ] |
| 19 | Bulk HIDE on 3 → disappear, UNDO restores | [ ] |
| 20 | Bulk HIDE when one was already hidden → only new ones | [ ] |
| 21 | Select 2 valid transfer-pair rows → MARK AS TRANSFER appears | [ ] |
| 22 | Select 2 invalid → MARK AS TRANSFER does NOT appear | [ ] |
| 23 | Click MARK AS TRANSFER → modal pre-fills → SAVE → atomic, UNDO restores | [ ] |
| 24 | Inside-search-input safety: typing `a/x/j/k/e` → no shortcut fires | [ ] |
| 25 | Cheatsheet (`?`) shows new rows | [ ] |
| 26 | After bulk action, bar unmounts as toast appears | [ ] |
| 27 | Bulk action with focused row → both highlights visible | [ ] |

If anything fails, fix in a follow-up commit referencing this task before proceeding to Task 15.

- [ ] **Step 14.4: Commit (if any UAT fixes were needed)**

```powershell
# Only if fixes were needed
git add -p
git commit -m "fix(car-82): UAT-driven adjustments

<describe what was tweaked>

Ref CAR-82"
```

---

## Task 15: Move CAR-82 to QA, push, open PR

**Files:** none (workflow only)

- [ ] **Step 15.1: Self-review the diff**

```powershell
git log --oneline dev-master..HEAD
git diff dev-master...HEAD --stat
```

Expected: ~14-16 commits, all referencing CAR-82.

- [ ] **Step 15.2: Move Linear issue to QA**

```powershell
$body = @{ query = 'mutation { issueUpdate(id: "CAR-82", input: { stateId: "14279ed0-2591-4186-bebc-ab2664c83c9f" }) { success issue { identifier state { name } } } }' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method Post -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | ConvertTo-Json -Depth 5
```

- [ ] **Step 15.3: Push the branch**

```powershell
git push -u origin car-82-bulk-select
```

- [ ] **Step 15.4: Open the PR against `dev-master`**

```powershell
$prBody = @"
## Summary

Adds bulk select & bulk edit to the web transactions list:

- Always-visible checkbox column. Click checkbox to toggle, ``Shift+click`` for range, ``Cmd/Ctrl+click`` for individual toggle. Click row body still opens the edit modal (suppressed when count > 0).
- Floating action bar at the bottom: **CATEGORIZE · SET ACCOUNT · MARK AS TRANSFER · HIDE · DELETE · CLEAR**. ``MARK AS TRANSFER`` only appears when exactly two selected rows fit the heuristic (equal abs amount, opposite signs, different accounts, neither already a transfer).
- Each bulk operation registers as ONE undo entry via the CAR-81 system. Single render per batch, atomic state snapshot for restoration.
- New keyboard shortcuts: ``x`` (toggle current row), ``Shift+j/k`` (move + extend selection), ``a`` (select all visible), ``Esc`` (clear selection).
- Selection auto-clears on period, filter, search, or txFilter change.

Mobile is out of scope per the issue.

## Architecture

- ``src/renderer/bulkOps.mjs`` — pure helpers (Vitest-covered, 21 tests): ``deleteTxsFromArray``, ``hideIdsToArray``, ``updateTxsInArray``, ``convertToTransferInArray``, ``detectTransferPair``
- ``src/renderer/store.jsx`` — single-render bulk methods + exposes ``hidden`` (read side)
- ``src/renderer/useUndoableStore.js`` — four atomic undo wrappers; each captures pre-state and restores in one ``setTransactions`` call
- ``src/renderer/hooks/useBulkSelection.js`` — Set-based selection + anchor index
- ``src/renderer/components/Shared.jsx`` — new ``<Checkbox>`` primitive (no styled precedent in repo)
- ``src/renderer/components/TransactionRow.jsx`` — extracted from ``WebTransactions.jsx``; new 28px checkbox column
- ``src/renderer/components/BulkActionBar.jsx`` — bottom-center fixed bar with inline category & account pickers
- ``src/renderer/screens/web/WebAddModal.jsx`` — accepts ``convertFromTxs`` prop; routes save through ``convertToTransfer``
- ``src/renderer/screens/web/WebTransactions.jsx`` — wires it all
- ``src/renderer/components/Shortcuts.jsx`` — four new cheatsheet rows

Spec: ``docs/superpowers/specs/2026-05-21-car-82-bulk-select-design.md``
Plan: ``docs/superpowers/plans/2026-05-21-car-82-bulk-select.md``

## Test plan

- ``npm test`` — 153/153 passing (132 pre-CAR-82 + 21 new pure-helper tests)
- ``npx vite build`` — clean
- Manual UAT: walked the full 27-row acceptance criteria table from the spec — toast/undo for each bulk operation, all keyboard bindings, modal/overlay safety, transfer-pair detection edge cases

Fixes CAR-82
"@

gh pr create --base dev-master --title "CAR-82: bulk select & bulk edit on the web transactions list" --body $prBody
```

If the multi-line `$prBody` causes shell quoting issues (as happened with CAR-81's PR), write it to a temp file and use `--body-file`:

```powershell
$prBody | Out-File -FilePath "$env:TEMP\car-82-pr-body.md" -Encoding utf8
gh pr create --base dev-master --title "CAR-82: bulk select & bulk edit on the web transactions list" --body-file "$env:TEMP\car-82-pr-body.md"
```

- [ ] **Step 15.5: Move Linear issue to Ready for Testing**

```powershell
$body = @{ query = 'mutation { issueUpdate(id: "CAR-82", input: { stateId: "601b0ea6-3ced-49c9-aeaa-613bb00d8b7a" }) { success issue { identifier state { name } } } }' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method Post -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | ConvertTo-Json -Depth 5
```

---

## Done

The remaining workflow (review feedback → PR Ready → merge → Done) is per AGENTS.md and not encoded in this plan.
