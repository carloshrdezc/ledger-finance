# CAR-81 — Undo/Redo for Destructive Actions

**Date:** 2026-05-21
**Linear:** [CAR-81](https://linear.app/carloshrdezc/issue/CAR-81/undoredo-for-destructive-actions-toast-ctrlz)
**Status:** Design approved, ready for implementation plan
**Branch:** `car-81-undo-redo` (PR base: `dev-master`)

---

## 1. Problem

Every destructive action in the Ledger store is irreversible. A misclick on a transaction, account, budget, goal, recurring rule, holding, or category leaves the user with no recourse beyond manually re-entering the data — which is impossible for a six-month-old transaction. This breeds a fear-of-clicking that slows daily use.

## 2. Goal

A consistent undo affordance for every destructive mutation in the store, exposed two ways:

- **Toast (snackbar)** — a 5-second banner with an UNDO button, shown immediately after each destructive action.
- **Keyboard** — `Cmd/Ctrl+Z` undoes; `Cmd/Ctrl+Shift+Z` (and `Cmd/Ctrl+Y` for Windows users) redoes.

The undo stack is in-memory only and holds the last 50 destructive actions.

## 3. Scope

### In scope — wrap all 10 destructive mutations

| Mutation | File:line in `store.jsx` | Notes |
|---|---|---|
| `deleteTx` | 231 | Filters tx by id. |
| `hideTx` | 229 | Adds id to `hidden[]`. Currently no UI call sites — wrapping for future-proofing. |
| `deleteTransfer` | 258-260 | Removes both legs sharing `transferId`. |
| `deleteAccount` | 414-418 | Filters + reorders remaining accounts. Restoration must preserve the original index. |
| `archiveAccount` | 410-412 | Flips `archived: true`. (Already user-recoverable, but wrapped per issue spec.) |
| `deleteRecurring` | 436-438 | Filters bill rule. |
| `removeBudget` | 500-502 | Filters by category key. |
| `deleteGoal` | 480-483 | Removes goal **and** its contributions (two slices). Atomic restore needed. |
| `removeCategory` | 345-361 | Walks `catTree` and deletes a leaf. |
| `removeHolding` | 541-544 | Removes holding **and** all matching trades (two slices). Atomic restore needed. |

### In scope — UI surfaces

- New toast component mounted at app root.
- New keyboard shortcuts in `App.jsx`.
- Two new rows in the existing shortcuts cheatsheet.

### Out of scope (deferred)

- Persisted undo across sessions (in-memory only).
- Full undo of CSV/import batches (the same-action coalescing window will cover most user-visible "I did 5 things in a second" cases; explicit batch transactions for imports are future work).
- A "history" panel UI (the architecture supports it; no UI is built in this phase).

## 4. Approach

**Standalone pure module + thin React layer + opt-in wrapper hook.** The existing `store.jsx` stays mostly untouched; components opt into undo by importing `useUndoableStore` instead of `useStore` at destructive call sites.

This matches the existing project pattern of `<module>.mjs` (pure logic) + UI consumer (e.g. `alerts.mjs` + `WebAlerts.jsx`, `commands.mjs` + `CommandPalette.jsx`).

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  src/renderer/undo.mjs (pure, no React)                 │
│    createUndoStack({ maxSize, batchWindowMs, now })     │
│      → register / undo / redo / current /               │
│        dismissCurrent / subscribe                       │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │
┌─────────────────────────────────────────────────────────┐
│  src/renderer/UndoContext.jsx                           │
│    <UndoProvider> + useUndo()                           │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │
┌─────────────────────────────────────────────────────────┐
│  src/renderer/useUndoableStore.js                       │
│    Wraps useStore() destructive setters with            │
│    register() calls. Drop-in replacement.               │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │
                ┌────────┴────────┐
                │                 │
        Components             <UndoToast>
        (call sites)           (subscriber)
```

### Module boundaries

| Unit | Purpose | Depends on | Tested by |
|---|---|---|---|
| `undo.mjs` | Stack data structure + coalescing logic | none (pure) | `undo.test.mjs` (Vitest, node env) |
| `UndoContext.jsx` | React context, single stack instance, re-render bridge | undo.mjs, React | exercised by manual UAT |
| `useUndoableStore.js` | Wrap destructive setters | UndoContext, store | exercised by manual UAT |
| `UndoToast.jsx` | Visible toast UI + 5s auto-dismiss | UndoContext | manual UAT |
| Restoration helpers in `store.jsx` | Atomic re-insert for goal/holding/account/category | none (in-store) | optionally, `store.test.jsx` (skipped for now) |

## 5. Module: `src/renderer/undo.mjs`

Pure module, default export `createUndoStack`.

### Public API

```js
createUndoStack({ maxSize = 50, batchWindowMs = 1500, now = () => performance.now() } = {}) → stack

stack.register({ do, undo, label, batchKey = null, pluralize = null })
  // Runs do() immediately. Pushes onto undo stack. Clears redo stack.
  // If batchKey matches the previous entry's batchKey AND now() - prev.createdAt <= batchWindowMs,
  // the entries coalesce: count++, do becomes (() => { prevDo(); newDo(); }),
  // undo becomes (() => { newUndo(); prevUndo(); }), label becomes pluralize(count) ?? prev.label.

stack.undo()
  // Pops top of undo stack, runs entry.undo(), pushes onto redo stack.
  // Sets current() to { entry, mode: 'redo' }. No-op if undo stack empty.

stack.redo()
  // Pops top of redo stack, runs entry.do(), pushes back onto undo stack.
  // Sets current() to null (no third toast). No-op if redo stack empty.

stack.current() → { entry, mode: 'undo' | 'redo' } | null
  // The "fresh" entry to be displayed by the toast. Cleared by dismissCurrent()
  // or by redo(). NOT cleared by time inside the stack — the toast component owns
  // the 5s timer and calls dismissCurrent() when it fires.

stack.dismissCurrent()
  // Sets current() to null. Does not affect undo/redo stacks.

stack.subscribe(listener) → unsubscribe
  // listener fires after every register/undo/redo/dismissCurrent.
```

### Entry shape (internal)

```js
{
  id: number,            // monotonic, used as React key
  label: string,         // "Transaction deleted" / "5 transactions deleted"
  do: () => void,
  undo: () => void,
  batchKey: string | null,
  count: number,         // 1 by default; incremented on coalesce
  createdAt: number      // now()
}
```

### Invariants

1. `register()` always runs `do()` exactly once (or, on coalesce, the new `do()` exactly once — the prior entry's `do()` was already run when it was registered).
2. `register()` always clears the redo stack.
3. `undoStack.length <= maxSize`. On overflow, the oldest entry is dropped (FIFO).
4. `redoStack.length <= maxSize` implicitly (it can only grow by undoing entries from the bounded undo stack).
5. The "fresh" pointer is set on `register()` and `undo()`; cleared on `redo()`, `dismissCurrent()`, and overwrite by a new register/undo.

## 6. React layer: `src/renderer/UndoContext.jsx`

```js
const UndoCtx = React.createContext(null);

export function UndoProvider({ children }) {
  const stack = React.useMemo(() => createUndoStack(), []);
  const [, setVersion] = React.useState(0);
  React.useEffect(() => stack.subscribe(() => setVersion(v => v + 1)), [stack]);
  return <UndoCtx.Provider value={stack}>{children}</UndoCtx.Provider>;
}

export function useUndo() {
  const stack = React.useContext(UndoCtx);
  if (!stack) throw new Error('useUndo must be used inside <UndoProvider>');
  return stack;
}
```

**Mounting** (`App.jsx`): `<UndoProvider>` is **inside** `<StoreProvider>` so undo callbacks can capture store setters via closure.

```jsx
function App() {
  return (
    <StoreProvider>
      <UndoProvider>
        <AppShell />
      </UndoProvider>
    </StoreProvider>
  );
}
```

## 7. Wrapper hook: `src/renderer/useUndoableStore.js`

Composes `useStore()` with `useUndo()`. Returns the full store API with the 10 destructive setters replaced by undoable versions.

```js
// Pattern (one example; same shape for all 10)
export function useUndoableStore() {
  const store = useStore();
  const stack = useUndo();

  const deleteTx = React.useCallback((id) => {
    const tx = store.txs.find(t => t.id === id);
    if (!tx) return;
    stack.register({
      label: 'Transaction deleted',
      batchKey: 'deleteTx',
      pluralize: (n) => `${n} transactions deleted`,
      do:   () => store.deleteTx(id),
      undo: () => store.addTx(tx),
    });
  }, [store, stack]);

  // ... 9 more wrappers ...

  return { ...store, deleteTx, /* etc. */ };
}
```

### Restoration helpers needed in `store.jsx`

For four mutations the existing setters aren't enough; new helpers must be added:

| Helper | Why | Location |
|---|---|---|
| `restoreAccount(account, originalIndex)` | `deleteAccount` reorders remaining accounts; restoration must re-insert at the original index. | new in `store.jsx`, exposed via context |
| `restoreGoal(goal, contributions)` | `deleteGoal` removes goal + its contributions atomically; both must come back in one render. | new in `store.jsx` |
| `restoreHolding(holding, trades)` | `removeHolding` removes holding + matching trades atomically. | new in `store.jsx` |
| `restoreCategory(pathParts, leaf)` | `removeCategory` walks a path and removes a leaf; restoration re-inserts at that path. | new in `store.jsx` |

The other six mutations restore via existing setters:
- `deleteTx` / `hideTx` / `deleteTransfer` → `addTx` / setters that already exist for `txs` / `hidden`.
- `archiveAccount` → `setAccounts` to flip the flag back.
- `deleteRecurring` → existing `setBills` / `addRecurring`.
- `removeBudget` → existing `setBudgets`.

Estimated `store.jsx` additions: ~30-50 lines. The helpers are also useful beyond undo (e.g. future import features).

### Call-site changes

For each destructive consumer (16 files identified), swap `useStore()` for `useUndoableStore()`. The destructured names are unchanged — drop-in replacement. Read-only consumers and non-destructive setters keep using `useStore()`.

Files to update:
- `screens/mobile/Transactions.jsx`
- `screens/mobile/AddSheet.jsx`
- `screens/mobile/DetailScreens.jsx`
- `screens/mobile/Investments.jsx`
- `screens/web/WebTransactions.jsx`
- `screens/web/WebAddModal.jsx`
- `screens/web/WebSettings.jsx`
- `screens/web/WebBills.jsx`
- `screens/web/WebInvestments.jsx`
- `components/AccountFormSheet.jsx`
- `components/AccountFormModal.jsx`
- `components/RecurringFormSheet.jsx`
- `components/BudgetFormSheet.jsx`
- `components/BudgetFormModal.jsx`
- `components/GoalFormSheet.jsx`
- `components/GoalFormModal.jsx`

## 8. Component: `src/renderer/components/UndoToast.jsx`

### Mount point

Inside `AppShell`'s top-level fragment, sibling to `<MobileApp / DesktopApp / EmptyApp>` (around `App.jsx:304`):

```jsx
<>
  {isAppEmpty ? <EmptyApp/> : (isMobile ? <MobileApp/> : <DesktopApp/>)}
  {!welcomeSeen && <Welcome/>}
  {showImport && <ImportExport/>}
  {pendingAddAccount && <AccountFromEmpty/>}
  <UndoToast />
</>
```

### Behavior

```js
function UndoToast() {
  const stack = useUndo();
  const fresh = stack.current();

  React.useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => stack.dismissCurrent(), 5000);
    return () => clearTimeout(t);
  }, [fresh?.entry.id, fresh?.mode]);

  if (!fresh) return null;
  // ...render
}
```

The 5s timer resets every time a new fresh entry appears (different `entry.id` or `mode`).

### Visual

Two states (per `mode`):

```
┌──────────────────────────────────┐
│ █ TRANSACTION DELETED      UNDO │   mode: 'undo'  — accent A.neg
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ █ TRANSACTION RESTORED     REDO │   mode: 'redo'  — accent A.ink (calmer)
└──────────────────────────────────┘
```

- `█`: 3px-wide vertical edge on the left (`A.neg` for undo mode, `A.ink` for redo mode).
- Container: `A.bg2` background, 1px solid `A.ink` border, no border-radius, `padding: 12px 16px`.
- Label text: `<ALabel>` — all-caps, `A.ink2`, the action description.
- Action button: right-aligned `<ALabel>` styling with `color: A.ink`, clickable. Hover: `color: A.neg` (undo) or `text-decoration: underline` (redo).
- Optional count suffix on coalesce: `"5 TRANSACTIONS DELETED"` driven by the `pluralize(count)` callback at register time.

### Position & layout

```js
position: 'fixed',
bottom: 20,
left: 20,
zIndex: 1500,
minWidth: 280,
maxWidth: 420,
fontFamily: A.font,
display: 'flex',
alignItems: 'center',
justifyContent: 'space-between',
gap: 16,
boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
```

**Mobile**: if a bottom nav exists and occludes the toast at `bottom: 20`, bump to `bottom: 80` on mobile breakpoints. Verify in QA.

### Animation

- **Mount**: fade-in + slide-up 8px over 180ms (CSS transition on `opacity` and `transform`).
- **Dismiss**: fade-out + slide-down 8px over 120ms via a local `exiting` flag; unmount after timer.
- **Replace** (new entry mid-display): React swaps content via `key={entry.id}`. No special animation.

### Accessibility

- Container: `role="status"`, `aria-live="polite"` (announces without stealing focus).
- Action: real `<button>` with `aria-label="Undo last action"` or `"Redo"`.
- Tab-reachable while visible.

### Click handlers

```js
const onAction = () => {
  if (fresh.mode === 'undo') stack.undo();   // toast becomes redo confirmation
  else                       stack.redo();   // toast hides
};
```

## 9. Keyboard shortcuts

Direct `useEffect` + `window.addEventListener('keydown', ...)` in `App.jsx`, mirroring the existing `Ctrl+K` handler at `App.jsx:176-189`. The `useKeyboardShortcuts` hook can't express modifier+key combos.

```js
const stack = useUndo();

React.useEffect(() => {
  const onKey = (e) => {
    if (paletteOpen || cheatsheetOpen || showAdd || showIO || showImport) return;

    const target = e.target;
    const isEditable =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable === true;
    if (isEditable) return;

    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      stack.undo();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      stack.redo();
    }
  };

  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [stack, paletteOpen, cheatsheetOpen, showAdd, showIO, showImport]);
```

### Decisions

- **`Ctrl+Y` also redoes** (Windows convention) — free usability win on top of the issue's required `Ctrl+Shift+Z`.
- **Disabled when any overlay is open** — same gate as `Ctrl+K`.
- **Disabled inside inputs / textareas / contenteditable** — preserves browsers' native text-undo so users can still undo typos in form fields.
- **`metaKey || ctrlKey`** — works on macOS and Windows/Linux without branching.

### Discoverability

Add two rows to the `Shortcuts` cheatsheet (the `?` overlay):

```
Ctrl+Z         Undo last action
Ctrl+Shift+Z   Redo
```

## 10. Testing

### `src/renderer/undo.test.mjs` (Vitest, node env, no DOM)

Covers the pure module. Uses an injected `now` for deterministic batch-window tests.

1. `register({ do })` runs `do()` once.
2. `undo()` runs `entry.undo()` and moves entry to redo stack.
3. `redo()` runs `entry.do()` and moves entry back to undo stack.
4. LIFO ordering: 3 registers → 3 undos in reverse order → 3 redos in original order.
5. New `register()` clears the redo stack.
6. Coalescing within `batchWindowMs` with same `batchKey`: one entry, `count === 2`, undo runs both reverse.
7. No coalesce when `batchKey: null`, when keys differ, or when outside the window.
8. `maxSize: 50` — registering 51 entries drops the oldest; 51st undo is a no-op.
9. `subscribe` fires on every state change; `unsubscribe` stops fires.
10. `current()` reflects mode; `dismissCurrent()` clears it without disturbing stacks.

### Component tests

Skipped in this phase. The renderer doesn't have jsdom-based test infra today; introducing it for one component is more work than the manual UAT checklist below.

### Manual UAT (matches issue acceptance criteria)

| Criterion | Test |
|---|---|
| Toast for 5s with UNDO; clicking UNDO restores | Delete a tx → see toast → click UNDO → tx returns. |
| `Ctrl+Z` undoes last action | Delete tx → don't click toast → press `Ctrl+Z` → tx returns. |
| Stack handles 20+ levels | Delete 25 txs → press `Ctrl+Z` 25 times → all return. |
| Undo + new action clears redo | Delete A → undo → delete B → press `Ctrl+Shift+Z` → no-op. |
| All 10 mutations covered | Exercise each: tx, transfer, account delete, account archive, recurring, budget, goal, category, holding, hide tx → toast fires for each. |
| Inside-input safety | Type into a transaction-amount field → `Ctrl+Z` undoes typing, not last delete. |
| Overlay safety | Open Command Palette → `Ctrl+Z` does nothing. |
| Coalescing | Delete 3 txs in <1.5s → single toast "3 transactions deleted" → UNDO restores all 3. |
| Redo via toast | Press UNDO → toast becomes "TRANSACTION RESTORED · REDO" → click REDO → tx is deleted again. |

## 11. Rollout (single PR per AGENTS.md)

1. `src/renderer/undo.mjs` + `src/renderer/undo.test.mjs`.
2. `src/renderer/UndoContext.jsx`.
3. New restoration helpers in `store.jsx` (`restoreAccount`, `restoreGoal`, `restoreHolding`, `restoreCategory`).
4. `src/renderer/useUndoableStore.js`.
5. `src/renderer/components/UndoToast.jsx`.
6. `App.jsx` wiring: `<UndoProvider>`, keydown effect, `<UndoToast />` mount.
7. Switch the 16 destructive call sites to `useUndoableStore()`.
8. Add two cheatsheet rows in `components/Shortcuts.jsx`.
9. Self-QA via the table above; `npm test` and `npx vite build` clean; `npm run dev` smoke check.
10. PR with `Fixes CAR-81` against `dev-master`.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Restoration helpers introduce bugs in `store.jsx` | Keep helpers small and pure; cover with manual UAT for each affected mutation. |
| Coalescing collapses unrelated rapid deletes | Different `batchKey`s never coalesce; window is short (1.5s). |
| Stale undo restores invalid state (e.g. account referenced by deleted tx) | The store's domain rules already tolerate orphan account references on a tx (existing `deleteAccount` doesn't touch tx records). Restoring an account is safe. |
| Toast occluded by mobile bottom nav | QA check; bump `bottom` on mobile breakpoint if needed. |
| Memory creep from large undo entries | Snapshots are domain objects (kilobytes per entry); 50-entry cap is well under 1MB worst case. |
| `useUndoableStore` consumers forget to switch | Manual UAT covers each mutation. After this PR, calling the raw `store.deleteTx` from a UI surface is a code-review smell. |

## 13. Open questions / future work

- A "history" panel UI that lists the undo stack and lets users undo arbitrary entries. The architecture supports it (the `subscribe` API exposes the full stack); UI is deferred.
- Persisted undo across sessions. Would require serialising `do`/`undo` callbacks, which means storing them as data (`{ kind: 'deleteTx', id }`) and reconstructing closures. Significant scope; deferred.
- Explicit batch transactions for CSV imports. The same-action coalescing window covers most cases but won't merge a batch of mixed-type imports into one entry. Deferred.
