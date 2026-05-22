# CAR-81 Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-memory undo/redo stack with a 5-second toast (UNDO/REDO button) and `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` keyboard shortcuts for the 10 destructive mutations in `src/renderer/store.jsx`.

**Architecture:** Pure module (`undo.mjs`) + thin React context (`UndoContext.jsx`) + opt-in wrapper hook (`useUndoableStore.js`) that overrides destructive setters. A `<UndoToast />` consumes the context and renders the bottom-left banner. Same-action coalescing within 1.5s; bounded to 50 entries.

**Tech Stack:** React 18, Vite, Vitest (node env), inline-styled JSX with the `A` theme tokens. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-21-car-81-undo-redo-design.md`

**Linear:** [CAR-81](https://linear.app/carloshrdezc/issue/CAR-81/undoredo-for-destructive-actions-toast-ctrlz)

**Branch:** `car-81-undo-redo` (PR base: `dev-master`)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/renderer/undo.mjs` | Pure undo-stack factory: `createUndoStack({ maxSize, batchWindowMs, now })`. Exports `register/undo/redo/current/dismissCurrent/subscribe`. |
| `src/renderer/undo.test.mjs` | Vitest suite for the pure module (node env). |
| `src/renderer/UndoContext.jsx` | React context: `<UndoProvider>` + `useUndo()`. Holds one stack instance. |
| `src/renderer/useUndoableStore.js` | Wrapper hook: returns `useStore()`'s API with the 10 destructive setters replaced by undoable versions. |
| `src/renderer/components/UndoToast.jsx` | Visible 5s toast with UNDO/REDO button. Subscribes to `useUndo()`. |

### Modified files

| Path | Change |
|---|---|
| `src/renderer/store.jsx` | Add 4 restoration helpers (`restoreAccount`, `restoreGoal`, `restoreHolding`, `restoreCategory`). Expose them on the context value. |
| `src/renderer/App.jsx` | Wrap `<AppShell />` with `<UndoProvider>`. Add `<UndoToast />` mount. Add `Ctrl+Z`/`Ctrl+Shift+Z`/`Ctrl+Y` keydown effect. |
| `src/renderer/components/Shortcuts.jsx` | Add two rows to GLOBAL section. |
| 16 consumer files | Swap `useStore()` → `useUndoableStore()` for destructive call sites. Listed in Task 17. |

---

## Task 1: Pure undo module — register and undo

**Files:**
- Create: `src/renderer/undo.mjs`
- Test: `src/renderer/undo.test.mjs`

- [ ] **Step 1.1: Write the failing tests**

Create `src/renderer/undo.test.mjs`:

```js
import { test, expect, vi } from 'vitest';
import { createUndoStack } from './undo.mjs';

test('register runs do() exactly once', () => {
  const stack = createUndoStack();
  const doFn = vi.fn();
  stack.register({ label: 'A', do: doFn, undo: () => {} });
  expect(doFn).toHaveBeenCalledTimes(1);
});

test('undo runs the entry undo() and clears current after', () => {
  const stack = createUndoStack();
  const undoFn = vi.fn();
  stack.register({ label: 'A', do: () => {}, undo: undoFn });
  expect(stack.current()?.mode).toBe('undo');
  stack.undo();
  expect(undoFn).toHaveBeenCalledTimes(1);
  expect(stack.current()?.mode).toBe('redo');
});

test('undo on empty stack is a no-op', () => {
  const stack = createUndoStack();
  expect(() => stack.undo()).not.toThrow();
  expect(stack.current()).toBeNull();
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/undo.test.mjs`
Expected: FAIL with "Cannot find module './undo.mjs'" or similar.

- [ ] **Step 1.3: Create minimal `undo.mjs`**

Create `src/renderer/undo.mjs`:

```js
// In-memory undo/redo stack. Pure (no React).
// See docs/superpowers/specs/2026-05-21-car-81-undo-redo-design.md

let __nextId = 1;

export function createUndoStack({
  maxSize = 50,
  batchWindowMs = 1500,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
} = {}) {
  const undoStack = [];
  const redoStack = [];
  let fresh = null; // { entry, mode: 'undo' | 'redo' } | null
  const listeners = new Set();

  const notify = () => listeners.forEach(fn => fn());

  function register({ label = '', do: doFn, undo: undoFn, batchKey = null, pluralize = null }) {
    if (typeof doFn !== 'function' || typeof undoFn !== 'function') {
      throw new Error('register requires do and undo functions');
    }
    doFn();
    redoStack.length = 0;

    const top = undoStack[undoStack.length - 1];
    const canCoalesce =
      top &&
      batchKey != null &&
      top.batchKey === batchKey &&
      now() - top.createdAt <= batchWindowMs;

    if (canCoalesce) {
      const prevDo = top.do;
      const prevUndo = top.undo;
      top.do = () => { prevDo(); doFn(); };
      top.undo = () => { undoFn(); prevUndo(); };
      top.count += 1;
      top.createdAt = now();
      if (pluralize) top.label = pluralize(top.count);
      fresh = { entry: top, mode: 'undo' };
    } else {
      const entry = {
        id: __nextId++,
        label,
        do: doFn,
        undo: undoFn,
        batchKey,
        count: 1,
        createdAt: now(),
      };
      undoStack.push(entry);
      while (undoStack.length > maxSize) undoStack.shift();
      fresh = { entry, mode: 'undo' };
    }
    notify();
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    entry.undo();
    redoStack.push(entry);
    fresh = { entry, mode: 'redo' };
    notify();
  }

  function redo() {
    const entry = redoStack.pop();
    if (!entry) return;
    entry.do();
    undoStack.push(entry);
    fresh = null;
    notify();
  }

  function current() {
    return fresh;
  }

  function dismissCurrent() {
    if (fresh === null) return;
    fresh = null;
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { register, undo, redo, current, dismissCurrent, subscribe };
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/undo.test.mjs`
Expected: 3 tests PASS.

- [ ] **Step 1.5: Commit**

```powershell
git add src/renderer/undo.mjs src/renderer/undo.test.mjs
git commit -m "feat(car-81): pure undo stack with register/undo

Adds createUndoStack factory exposing register/undo/redo/current/
dismissCurrent/subscribe. Covers register, undo, and empty-stack no-op.

Ref CAR-81"
```

---

## Task 2: Pure undo module — redo, ordering, redo invalidation

**Files:**
- Modify: `src/renderer/undo.test.mjs`

- [ ] **Step 2.1: Add failing tests**

Append to `src/renderer/undo.test.mjs`:

```js
test('redo replays the entry do() and moves it back to undo stack', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => log.push('do'), undo: () => log.push('undo') });
  stack.undo();           // log: ['do', 'undo']
  stack.redo();           // log: ['do', 'undo', 'do']
  expect(log).toEqual(['do', 'undo', 'do']);
  // After redo, current is cleared (no third toast).
  expect(stack.current()).toBeNull();
  // Entry is back on the undo stack — undoing again works.
  stack.undo();
  expect(log).toEqual(['do', 'undo', 'do', 'undo']);
});

test('LIFO: three registers, three undos run in reverse order', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => {}, undo: () => log.push('A') });
  stack.register({ label: 'B', do: () => {}, undo: () => log.push('B') });
  stack.register({ label: 'C', do: () => {}, undo: () => log.push('C') });
  stack.undo();
  stack.undo();
  stack.undo();
  expect(log).toEqual(['C', 'B', 'A']);
});

test('register clears the redo stack', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => log.push('do-A'), undo: () => log.push('undo-A') });
  stack.undo();
  // Register B clears redo (A is no longer in the redo stack)
  stack.register({ label: 'B', do: () => log.push('do-B'), undo: () => log.push('undo-B') });
  // Now redo should be a no-op — A's do() must NOT run.
  stack.redo();
  // After register A: ['do-A']; after undo: ['do-A','undo-A']; after register B: ['do-A','undo-A','do-B']
  // After redo (no-op): unchanged.
  expect(log).toEqual(['do-A', 'undo-A', 'do-B']);
});

test('redo on empty stack is a no-op', () => {
  const stack = createUndoStack();
  expect(() => stack.redo()).not.toThrow();
});
```

- [ ] **Step 2.2: Run tests**

Run: `npx vitest run src/renderer/undo.test.mjs`
Expected: 7 tests PASS (3 from Task 1 + 4 new).

- [ ] **Step 2.3: Commit**

```powershell
git add src/renderer/undo.test.mjs
git commit -m "test(car-81): cover redo, LIFO ordering, redo invalidation

Ref CAR-81"
```

---

## Task 3: Pure undo module — coalescing within batch window

**Files:**
- Modify: `src/renderer/undo.test.mjs`

- [ ] **Step 3.1: Add failing tests**

Append to `src/renderer/undo.test.mjs`:

```js
test('two registers with same batchKey within window coalesce', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({
    label: '1 deleted',
    batchKey: 'deleteTx',
    pluralize: (n) => `${n} deleted`,
    do: () => log.push('do1'),
    undo: () => log.push('undo1'),
  });
  t = 1000; // within window
  stack.register({
    label: '1 deleted',
    batchKey: 'deleteTx',
    pluralize: (n) => `${n} deleted`,
    do: () => log.push('do2'),
    undo: () => log.push('undo2'),
  });
  // Both do() calls ran during register
  expect(log).toEqual(['do1', 'do2']);
  // Coalesced into one fresh entry with count 2 and pluralized label
  expect(stack.current().entry.count).toBe(2);
  expect(stack.current().entry.label).toBe('2 deleted');
  // Single undo restores both, in reverse order
  stack.undo();
  expect(log).toEqual(['do1', 'do2', 'undo2', 'undo1']);
});

test('registers outside the batch window do not coalesce', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({ label: 'A', batchKey: 'deleteTx', do: () => {}, undo: () => log.push('A') });
  t = 2000; // outside window
  stack.register({ label: 'B', batchKey: 'deleteTx', do: () => {}, undo: () => log.push('B') });
  stack.undo();
  expect(log).toEqual(['B']);
  stack.undo();
  expect(log).toEqual(['B', 'A']);
});

test('batchKey null never coalesces even within window', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({ label: 'A', batchKey: null, do: () => {}, undo: () => log.push('A') });
  t = 100;
  stack.register({ label: 'B', batchKey: null, do: () => {}, undo: () => log.push('B') });
  stack.undo(); // should pop B only
  expect(log).toEqual(['B']);
  stack.undo(); // pops A
  expect(log).toEqual(['B', 'A']);
});

test('different batchKeys never coalesce', () => {
  let t = 0;
  const stack = createUndoStack({ batchWindowMs: 1500, now: () => t });
  const log = [];
  stack.register({ label: 'A', batchKey: 'deleteTx', do: () => {}, undo: () => log.push('A') });
  t = 100;
  stack.register({ label: 'B', batchKey: 'deleteAccount', do: () => {}, undo: () => log.push('B') });
  stack.undo();
  stack.undo();
  expect(log).toEqual(['B', 'A']);
});
```

(4 tests added — coalesce-in-window, no-coalesce-outside-window, no-coalesce-with-null-key, no-coalesce-with-different-keys.)

- [ ] **Step 3.2: Run tests**

Run: `npx vitest run src/renderer/undo.test.mjs`
Expected: 11 tests PASS.

- [ ] **Step 3.3: Commit**

```powershell
git add src/renderer/undo.test.mjs
git commit -m "test(car-81): cover coalescing rules

Ref CAR-81"
```

---

## Task 4: Pure undo module — bounded size and subscribe

**Files:**
- Modify: `src/renderer/undo.test.mjs`

- [ ] **Step 4.1: Add failing tests**

Append to `src/renderer/undo.test.mjs`:

```js
test('maxSize bounds the undo stack with FIFO eviction', () => {
  const stack = createUndoStack({ maxSize: 3 });
  const undone = [];
  for (let i = 0; i < 5; i++) {
    stack.register({ label: String(i), do: () => {}, undo: () => undone.push(i) });
  }
  // Only the last 3 entries (2, 3, 4) remain
  stack.undo();
  stack.undo();
  stack.undo();
  expect(undone).toEqual([4, 3, 2]);
  // Fourth undo is a no-op
  stack.undo();
  expect(undone).toEqual([4, 3, 2]);
});

test('subscribe fires on register/undo/redo/dismissCurrent and unsubscribe stops fires', () => {
  const stack = createUndoStack();
  let count = 0;
  const unsub = stack.subscribe(() => { count += 1; });
  stack.register({ label: 'A', do: () => {}, undo: () => {} });
  stack.undo();
  stack.redo();
  stack.dismissCurrent(); // current is null after redo, so this is a no-op
  expect(count).toBe(3);
  unsub();
  stack.register({ label: 'B', do: () => {}, undo: () => {} });
  expect(count).toBe(3); // no further increments after unsubscribe
});

test('dismissCurrent clears fresh without disturbing stacks', () => {
  const stack = createUndoStack();
  const log = [];
  stack.register({ label: 'A', do: () => {}, undo: () => log.push('A') });
  expect(stack.current()).not.toBeNull();
  stack.dismissCurrent();
  expect(stack.current()).toBeNull();
  // Stack still works
  stack.undo();
  expect(log).toEqual(['A']);
});
```

- [ ] **Step 4.2: Run tests**

Run: `npx vitest run src/renderer/undo.test.mjs`
Expected: 14 tests PASS.

- [ ] **Step 4.3: Run full test suite**

Run: `npm test`
Expected: All existing tests PASS plus the 14 new undo tests.

- [ ] **Step 4.4: Commit**

```powershell
git add src/renderer/undo.test.mjs
git commit -m "test(car-81): cover maxSize, subscribe, dismissCurrent

Pure undo module is now fully covered.

Ref CAR-81"
```

---

## Task 5: Restoration helpers in `store.jsx`

Add four helpers needed by the wrapper hook. These re-insert deleted records (account, goal+contributions, holding+trades, category leaf) atomically.

**Files:**
- Modify: `src/renderer/store.jsx` (insert helpers + expose on context value)

- [ ] **Step 5.1: Add `restoreAccount` after `deleteAccount`**

Open `src/renderer/store.jsx`. After the `deleteAccount` block (currently lines 414-418), add:

```jsx
  const restoreAccount = React.useCallback((account, originalIndex) => {
    if (!account) return;
    setAccounts(prev => {
      if (prev.some(a => a.id === account.id)) return prev;
      const next = [...prev];
      const insertAt = Math.max(0, Math.min(originalIndex ?? next.length, next.length));
      next.splice(insertAt, 0, account);
      // Re-derive `order` for non-archived accounts to keep contiguous numbering.
      let i = 0;
      return next.map(a => a.archived ? a : { ...a, order: i++ });
    });
  }, [setAccounts]);
```

- [ ] **Step 5.2: Add `restoreGoal` after `deleteGoal`**

After the `deleteGoal` block (currently lines 480-483), add:

```jsx
  const restoreGoal = React.useCallback((goal, contributions = []) => {
    if (!goal) return;
    setGoals(prev => prev.some(g => g.id === goal.id) ? prev : [...prev, goal]);
    if (contributions.length > 0) {
      setGoalContributions(prev => {
        const seen = new Set(prev.map(c => c.id));
        const additions = contributions.filter(c => !seen.has(c.id));
        return additions.length === 0 ? prev : [...prev, ...additions];
      });
    }
  }, [setGoals, setGoalContributions]);
```

- [ ] **Step 5.3: Add `restoreHolding` after `removeHolding`**

After the `removeHolding` block (currently lines 541-544), add:

```jsx
  const restoreHolding = React.useCallback((holding, trades = []) => {
    if (!holding) return;
    setInvestments(prev => prev.some(h => h.ticker === holding.ticker) ? prev : [...prev, holding]);
    if (trades.length > 0) {
      setTrades(prev => {
        const seen = new Set(prev.map(t => t.id));
        const additions = trades.filter(t => !seen.has(t.id));
        return additions.length === 0 ? prev : [...prev, ...additions];
      });
    }
  }, [setInvestments, setTrades]);
```

- [ ] **Step 5.4: Add `restoreCategory` after `removeCategory`**

After the `removeCategory` block (currently lines 345-361), add:

```jsx
  const restoreCategory = React.useCallback((pathParts, leaf) => {
    if (!pathParts || pathParts.length === 0 || !leaf) return;
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      let parent = tree;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const next = i === 0 ? parent[pathParts[i]] : (parent.children || {})[pathParts[i]];
        if (!next) return prev; // path missing — abort
        parent = next;
      }
      const leafKey = pathParts[pathParts.length - 1];
      const container = pathParts.length === 1 ? parent : (parent.children = parent.children || {});
      if (container[leafKey]) return prev; // already exists
      container[leafKey] = leaf;
      return tree;
    });
  }, [setCatTree]);
```

- [ ] **Step 5.5: Expose the helpers on the context value**

In the provider's `value={{ ... }}` block (currently around lines 724-819), add the four new keys. Insert each near its sibling:

- After `removeCategory,` add: `restoreCategory,`
- After `deleteGoal,` add: `restoreGoal,`
- After `deleteAccount,` add: `restoreAccount,`
- After `removeHolding,` add: `restoreHolding,`

- [ ] **Step 5.6: Sanity check — start dev server and confirm app boots**

Run: `npm run dev`
Expected: Vite + Electron start without errors. Quit with Ctrl+C after confirming.

- [ ] **Step 5.7: Run full test suite**

Run: `npm test`
Expected: all tests still pass (no behavioural change yet).

- [ ] **Step 5.8: Commit**

```powershell
git add src/renderer/store.jsx
git commit -m "feat(car-81): add restoration helpers to store

restoreAccount, restoreGoal, restoreHolding, restoreCategory re-insert
deleted records atomically. Used by the upcoming useUndoableStore hook.

Ref CAR-81"
```

---

## Task 6: React `<UndoProvider>` and `useUndo()`

**Files:**
- Create: `src/renderer/UndoContext.jsx`

- [ ] **Step 6.1: Create the context module**

Create `src/renderer/UndoContext.jsx`:

```jsx
import React from 'react';
import { createUndoStack } from './undo.mjs';

const UndoCtx = React.createContext(null);

export function UndoProvider({ children }) {
  const stack = React.useMemo(() => createUndoStack(), []);
  const [, setVersion] = React.useState(0);

  React.useEffect(() => {
    return stack.subscribe(() => setVersion(v => v + 1));
  }, [stack]);

  return <UndoCtx.Provider value={stack}>{children}</UndoCtx.Provider>;
}

export function useUndo() {
  const stack = React.useContext(UndoCtx);
  if (!stack) {
    throw new Error('useUndo must be used inside <UndoProvider>');
  }
  return stack;
}
```

- [ ] **Step 6.2: Wire `<UndoProvider>` into `App.jsx`**

In `src/renderer/App.jsx`, add the import near the top (after `import { StoreProvider, useStore }`):

```jsx
import { UndoProvider } from './UndoContext';
```

Then update the default `App` export (currently lines 330-336):

```jsx
export default function App() {
  return (
    <StoreProvider>
      <UndoProvider>
        <AppShell />
      </UndoProvider>
    </StoreProvider>
  );
}
```

- [ ] **Step 6.3: Sanity check — boot the app**

Run: `npm run dev`
Expected: app boots without console errors. The provider has no consumers yet, so behaviour is unchanged. Quit with Ctrl+C.

- [ ] **Step 6.4: Run tests**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 6.5: Commit**

```powershell
git add src/renderer/UndoContext.jsx src/renderer/App.jsx
git commit -m "feat(car-81): add UndoProvider and useUndo hook

Mounts a single undo stack inside StoreProvider. No consumers yet.

Ref CAR-81"
```

---

## Task 7: `useUndoableStore` hook — scaffold + `deleteTx`

**Files:**
- Create: `src/renderer/useUndoableStore.js`

- [ ] **Step 7.1: Create the wrapper hook with `deleteTx` only**

Create `src/renderer/useUndoableStore.js`:

```js
import React from 'react';
import { useStore } from './store';
import { useUndo } from './UndoContext';

/**
 * Drop-in replacement for useStore() that wraps the 10 destructive setters
 * with undo registrations. All other store fields and setters pass through
 * unchanged.
 *
 * See docs/superpowers/specs/2026-05-21-car-81-undo-redo-design.md
 */
export function useUndoableStore() {
  const store = useStore();
  const stack = useUndo();

  const deleteTx = React.useCallback((id) => {
    const tx = store.allTransactions.find(t => t.id === id);
    if (!tx) return;
    stack.register({
      label: 'Transaction deleted',
      batchKey: 'deleteTx',
      pluralize: (n) => `${n} transactions deleted`,
      do:   () => store.deleteTx(id),
      undo: () => store.setTransactions(prev =>
        prev.some(t => t.id === tx.id) ? prev : [...prev, tx]
      ),
    });
  }, [store, stack]);

  return { ...store, deleteTx };
}
```

> **Note for the engineer:** the store exposes the full transaction list as `allTransactions` and the setter as `setTransactions` (see `src/renderer/store.jsx:728-729`). There is no `addTx` — restoration uses `setTransactions(prev => ...)`.

- [ ] **Step 7.2: Verify by switching ONE consumer**

Open `src/renderer/screens/mobile/Transactions.jsx`. Find `import { useStore } from '../../store';` (line 11) and:

1. Replace `import { useStore } from '../../store';` with `import { useUndoableStore } from '../../useUndoableStore';`
2. Find the `useStore()` call (likely a destructure including `deleteTx`) and replace it with `useUndoableStore()`. The destructured names stay the same.

- [ ] **Step 7.3: Smoke-test via dev server**

Run: `npm run dev`
- Navigate to the mobile transactions screen (resize window < 1024 px or use the mobile route).
- Delete a transaction.
- Expected: the transaction disappears from the list. (No toast yet — `<UndoToast>` ships in Task 11.)
- Open DevTools console — no errors.
- Quit with Ctrl+C.

- [ ] **Step 7.4: Verify undo works via React DevTools**

Optional but recommended: open React DevTools, inspect the `UndoProvider`'s stack via the hook value. After deleting a tx, the undo stack should have one entry. If you can manually trigger `stack.undo()` from the console (after exposing it for debug), the tx returns. Skip if too fiddly — full UAT happens after Task 11.

- [ ] **Step 7.5: Run tests**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 7.6: Commit**

```powershell
git add src/renderer/useUndoableStore.js src/renderer/screens/mobile/Transactions.jsx
git commit -m "feat(car-81): useUndoableStore hook with deleteTx

First wrapped destructive setter. Consumer in mobile Transactions
switched over for smoke testing.

Ref CAR-81"
```

---

## Task 8: Wrap remaining transaction-related mutations

Add `hideTx` and `deleteTransfer` to `useUndoableStore`.

**Files:**
- Modify: `src/renderer/useUndoableStore.js`

- [ ] **Step 8.1: Add `hideTx` wrapper**

In `src/renderer/useUndoableStore.js`, before the `return`, add:

```js
  const hideTx = React.useCallback((id) => {
    // hideTx adds id to a `hidden[]` array. Restoration removes it.
    // The store doesn't expose a public unhide setter, but it does expose the
    // raw `setHidden` via the store provider — verify this. If not exposed,
    // expose it now (single line in store.jsx provider value).
    if (!store.setHidden) {
      // eslint-disable-next-line no-console
      console.warn('useUndoableStore.hideTx: store.setHidden not exposed; undo unavailable');
      store.hideTx(id);
      return;
    }
    stack.register({
      label: 'Transaction hidden',
      batchKey: 'hideTx',
      pluralize: (n) => `${n} transactions hidden`,
      do:   () => store.hideTx(id),
      undo: () => store.setHidden(prev => prev.filter(x => x !== id)),
    });
  }, [store, stack]);
```

> **Setup note:** `setHidden` is currently NOT in the `StoreCtx.Provider` value block. You must expose it. Open `src/renderer/store.jsx` and locate the `<StoreCtx.Provider value={{ ... }}>` block (around line 724). After `hideTx,` add a new line `setHidden,`. The local variable `setHidden` is already defined earlier in the provider (it's the `useLS('ledger:hidden', [])` setter).

- [ ] **Step 8.2: Add `deleteTransfer` wrapper**

```js
  const deleteTransfer = React.useCallback((transferId) => {
    const legs = store.allTransactions.filter(t => t.transferId === transferId);
    if (legs.length === 0) return;
    stack.register({
      label: 'Transfer deleted',
      batchKey: 'deleteTransfer',
      pluralize: (n) => `${n} transfers deleted`,
      do:   () => store.deleteTransfer(transferId),
      undo: () => store.setTransactions(prev => {
        const have = new Set(prev.map(t => t.id));
        const additions = legs.filter(l => !have.has(l.id));
        return additions.length === 0 ? prev : [...prev, ...additions];
      }),
    });
  }, [store, stack]);
```

- [ ] **Step 8.3: Update return**

Change the return to include the new wrappers:

```js
  return { ...store, deleteTx, hideTx, deleteTransfer };
```

- [ ] **Step 8.4: Smoke-test in dev**

Run: `npm run dev`
- Delete a transfer (mobile Transactions list, swipe-delete on a transfer row).
- Confirm both legs disappear and no console errors.

- [ ] **Step 8.5: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8.6: Commit**

```powershell
git add src/renderer/useUndoableStore.js src/renderer/store.jsx
git commit -m "feat(car-81): wrap hideTx and deleteTransfer

Also exposes setHidden on the store context for undo-side restoration.

Ref CAR-81"
```

---

## Task 9: Wrap account, recurring, budget, goal mutations

**Files:**
- Modify: `src/renderer/useUndoableStore.js`

- [ ] **Step 9.1: Add `archiveAccount` and `deleteAccount` wrappers**

In `src/renderer/useUndoableStore.js`, before the `return`, add:

```js
  const archiveAccount = React.useCallback((id) => {
    const account = store.accounts.find(a => a.id === id);
    if (!account) return;
    stack.register({
      label: 'Account archived',
      batchKey: 'archiveAccount',
      pluralize: (n) => `${n} accounts archived`,
      do:   () => store.archiveAccount(id),
      undo: () => store.setAccounts(prev =>
        prev.map(a => a.id === id ? { ...a, archived: false } : a)
      ),
    });
  }, [store, stack]);

  const deleteAccount = React.useCallback((id) => {
    const account = store.accounts.find(a => a.id === id);
    if (!account) return;
    // Capture the original index for restoration. `accounts` is the full list
    // (including archived).
    const originalIndex = store.accounts.findIndex(a => a.id === id);
    stack.register({
      label: 'Account deleted',
      batchKey: 'deleteAccount',
      pluralize: (n) => `${n} accounts deleted`,
      do:   () => store.deleteAccount(id),
      undo: () => store.restoreAccount(account, originalIndex),
    });
  }, [store, stack]);
```

- [ ] **Step 9.2: Add `deleteRecurring` wrapper**

```js
  const deleteRecurring = React.useCallback((id) => {
    const rule = store.bills.find(b => b.id === id);
    if (!rule) return;
    stack.register({
      label: 'Recurring rule deleted',
      batchKey: 'deleteRecurring',
      pluralize: (n) => `${n} recurring rules deleted`,
      do:   () => store.deleteRecurring(id),
      undo: () => store.setBills(prev =>
        prev.some(b => b.id === id) ? prev : [...prev, rule]
      ),
    });
  }, [store, stack]);
```

- [ ] **Step 9.3: Add `removeBudget` wrapper**

```js
  const removeBudget = React.useCallback((cat) => {
    const budget = store.budgets.find(b => b.cat === cat);
    if (!budget) return;
    stack.register({
      label: 'Budget removed',
      batchKey: 'removeBudget',
      pluralize: (n) => `${n} budgets removed`,
      do:   () => store.removeBudget(cat),
      undo: () => store.setBudgets(prev =>
        prev.some(b => b.cat === cat) ? prev : [...prev, budget]
      ),
    });
  }, [store, stack]);
```

- [ ] **Step 9.4: Add `deleteGoal` wrapper**

```js
  const deleteGoal = React.useCallback((id) => {
    const goal = store.goals.find(g => g.id === id);
    if (!goal) return;
    const contributions = store.goalContributions.filter(c => c.goalId === id);
    stack.register({
      label: 'Goal deleted',
      batchKey: 'deleteGoal',
      pluralize: (n) => `${n} goals deleted`,
      do:   () => store.deleteGoal(id),
      undo: () => store.restoreGoal(goal, contributions),
    });
  }, [store, stack]);
```

- [ ] **Step 9.5: Update return**

```js
  return {
    ...store,
    deleteTx, hideTx, deleteTransfer,
    archiveAccount, deleteAccount,
    deleteRecurring,
    removeBudget,
    deleteGoal,
  };
```

- [ ] **Step 9.6: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9.7: Commit**

```powershell
git add src/renderer/useUndoableStore.js
git commit -m "feat(car-81): wrap account/recurring/budget/goal mutations

Adds archiveAccount, deleteAccount, deleteRecurring, removeBudget,
deleteGoal wrappers. UI swap happens in Task 17.

Ref CAR-81"
```

---

## Task 10: Wrap remaining mutations (`removeCategory`, `removeHolding`)

**Files:**
- Modify: `src/renderer/useUndoableStore.js`

- [ ] **Step 10.1: Add `removeCategory` wrapper**

In `src/renderer/useUndoableStore.js`, before the `return`, add:

```js
  const removeCategory = React.useCallback((pathParts) => {
    if (!pathParts || pathParts.length === 0) return;
    // Capture the leaf node before removal so we can restore it.
    const tree = store.categoryTree;
    let cursor = tree;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const next = i === 0 ? cursor[pathParts[i]] : (cursor.children || {})[pathParts[i]];
      if (!next) return; // path missing
      cursor = next;
    }
    const leafKey = pathParts[pathParts.length - 1];
    const container = pathParts.length === 1 ? cursor : (cursor.children || {});
    const leaf = container[leafKey];
    if (!leaf) return;

    stack.register({
      label: 'Category removed',
      batchKey: 'removeCategory',
      pluralize: (n) => `${n} categories removed`,
      do:   () => store.removeCategory(pathParts),
      undo: () => store.restoreCategory(pathParts, leaf),
    });
  }, [store, stack]);
```

- [ ] **Step 10.2: Add `removeHolding` wrapper**

```js
  const removeHolding = React.useCallback((ticker) => {
    const holding = store.investments.find(h => h.ticker === ticker);
    if (!holding) return;
    const tradesForTicker = store.trades.filter(t => t.ticker === ticker);
    stack.register({
      label: 'Holding removed',
      batchKey: 'removeHolding',
      pluralize: (n) => `${n} holdings removed`,
      do:   () => store.removeHolding(ticker),
      undo: () => store.restoreHolding(holding, tradesForTicker),
    });
  }, [store, stack]);
```

- [ ] **Step 10.3: Final return**

```js
  return {
    ...store,
    deleteTx, hideTx, deleteTransfer,
    archiveAccount, deleteAccount,
    deleteRecurring,
    removeBudget,
    deleteGoal,
    removeCategory,
    removeHolding,
  };
```

- [ ] **Step 10.4: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10.5: Commit**

```powershell
git add src/renderer/useUndoableStore.js
git commit -m "feat(car-81): wrap removeCategory and removeHolding

All 10 destructive mutations now have undo wrappers. Consumer call
sites are still using useStore() for now — Task 17 swaps them.

Ref CAR-81"
```

---

## Task 11: `<UndoToast>` component

**Files:**
- Create: `src/renderer/components/UndoToast.jsx`

- [ ] **Step 11.1: Create the component**

Create `src/renderer/components/UndoToast.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { useUndo } from '../UndoContext';

const FRESH_MS = 5000;
const ENTER_MS = 180;
const EXIT_MS  = 120;

export default function UndoToast() {
  const stack = useUndo();
  const fresh = stack.current();
  const [exiting, setExiting] = React.useState(false);

  // Reset exiting flag whenever a new fresh entry appears.
  React.useEffect(() => {
    if (fresh) setExiting(false);
  }, [fresh?.entry.id, fresh?.mode]);

  // Auto-dismiss after FRESH_MS.
  React.useEffect(() => {
    if (!fresh) return undefined;
    const dismissTimer = setTimeout(() => {
      setExiting(true);
      const unmountTimer = setTimeout(() => {
        stack.dismissCurrent();
      }, EXIT_MS);
      // Clean up nested timer on identity change
      return () => clearTimeout(unmountTimer);
    }, FRESH_MS);
    return () => clearTimeout(dismissTimer);
  }, [fresh?.entry.id, fresh?.mode, stack]);

  if (!fresh) return null;

  const isUndoMode = fresh.mode === 'undo';
  const accentColor = isUndoMode ? A.neg : A.ink;
  const actionLabel = isUndoMode ? 'UNDO' : 'REDO';
  const ariaLabel = isUndoMode ? 'Undo last action' : 'Redo last undone action';
  const baseLabel = fresh.entry.label || (isUndoMode ? 'Action performed' : 'Action undone');
  const displayLabel = isUndoMode
    ? baseLabel.toUpperCase()
    : (baseLabel.replace(/deleted$/i, 'restored')
              .replace(/removed$/i, 'restored')
              .replace(/archived$/i, 'unarchived')
              .replace(/hidden$/i, 'unhidden')
              .toUpperCase());

  const onAction = () => {
    if (isUndoMode) stack.undo();
    else            stack.redo();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      key={`${fresh.entry.id}-${fresh.mode}`}
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 1500,
        minWidth: 280,
        maxWidth: 420,
        background: A.bg2,
        border: '1px solid ' + A.ink,
        fontFamily: A.font,
        color: A.ink,
        display: 'flex',
        alignItems: 'stretch',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(8px)' : 'translateY(0)',
        transition: `opacity ${exiting ? EXIT_MS : ENTER_MS}ms ease, transform ${exiting ? EXIT_MS : ENTER_MS}ms ease`,
      }}
    >
      <div style={{ width: 3, background: accentColor, flexShrink: 0 }} />
      <div style={{
        flex: 1,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <ALabel style={{ color: A.ink2, letterSpacing: 1.4 }}>{displayLabel}</ALabel>
        <button
          type="button"
          onClick={onAction}
          aria-label={ariaLabel}
          style={{
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
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: Mount in `App.jsx`**

In `src/renderer/App.jsx`:

1. Add the import near the other component imports:

```jsx
import UndoToast from './components/UndoToast';
```

2. Add `<UndoToast />` as the last child of the `AppShell` fragment. Currently lines 304-326 return:

```jsx
return (
  <>
    {isAppEmpty ? <EmptyApp ... /> : (isMobile ? <MobileApp ... /> : <DesktopApp ... />)}
    {!welcomeSeen && <Welcome ... />}
    {showImport && <ImportExport ... />}
    {pendingAddAccount && <AccountFromEmpty ... />}
  </>
);
```

Add `<UndoToast />` right before the closing `</>`:

```jsx
return (
  <>
    {/* ... existing children ... */}
    {pendingAddAccount && <AccountFromEmpty ... />}
    <UndoToast />
  </>
);
```

- [ ] **Step 11.3: Smoke-test the toast**

Run: `npm run dev`
- Navigate to mobile Transactions (the only consumer wired so far).
- Delete a transaction.
- Expected: bottom-left toast appears with `TRANSACTION DELETED · UNDO`. Click UNDO. Toast becomes `TRANSACTION RESTORED · REDO` for 5s. Click REDO — toast disappears, transaction is gone again.
- Expected: with no action, the toast fades out after 5s.
- Quit with Ctrl+C.

- [ ] **Step 11.4: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 11.5: Commit**

```powershell
git add src/renderer/components/UndoToast.jsx src/renderer/App.jsx
git commit -m "feat(car-81): UndoToast component

Bottom-left fixed banner with UNDO button (5s auto-dismiss).
After undo, becomes a REDO confirmation. Mounted at AppShell root.

Ref CAR-81"
```

---

## Task 12: Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)

**Files:**
- Modify: `src/renderer/App.jsx`

- [ ] **Step 12.1: Add the import**

Add at the top of `App.jsx` (alongside the existing `UndoProvider` import added in Task 6):

```jsx
import { UndoProvider, useUndo } from './UndoContext';
```

- [ ] **Step 12.2: Add the keydown effect inside `MobileApp` / `DesktopApp` parent — but easier in `AppShell`**

Open `src/renderer/App.jsx`. Find `AppShell()` (currently line 277). Inside it, after the existing `useState`/`useEffect` blocks but before the `return`, add:

```jsx
  const stack = useUndo();

  React.useEffect(() => {
    const onKey = (e) => {
      // Bail when an overlay is open — match the existing Ctrl+K policy.
      if (showImport || pendingAddAccount) return;
      // The cheatsheet/palette/showAdd flags live in MobileApp/DesktopApp,
      // not AppShell. Their open state intercepts events via Esc handlers.
      // We rely on the input-target check for those cases too.

      const tgt = e.target;
      const tag = tgt?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tgt?.isContentEditable;
      if (isEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = (e.key || '').toLowerCase();
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
  }, [stack, showImport, pendingAddAccount]);
```

> **Engineer note on overlay gating:** the `paletteOpen / cheatsheetOpen / showAdd / showIO` flags live inside `MobileApp` and `DesktopApp` (not `AppShell`), so we can't access them here. The combination of (a) the input-target check and (b) the natural Esc-closes-overlay behaviour covers the realistic risk. If during QA we find Ctrl+Z firing while the command palette is open and stealing focus, we'll lift the relevant flag into AppShell or pass it down via context — but the current design keeps the change localised.

- [ ] **Step 12.3: Smoke-test keyboard shortcuts**

Run: `npm run dev`

Test matrix:
- Delete a tx, press Ctrl+Z → tx restored.
- Press Ctrl+Shift+Z → tx deleted again.
- Delete a tx, press Ctrl+Y → tx restored. (Windows redo alias.)
- Type into a transaction-amount input; press Ctrl+Z → browser undoes typing, NOT the last destructive action.
- Open Welcome modal (if accessible from settings) or Import flow → Ctrl+Z does nothing.

Quit with Ctrl+C.

- [ ] **Step 12.4: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 12.5: Commit**

```powershell
git add src/renderer/App.jsx
git commit -m "feat(car-81): Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts

Mirrors the existing Ctrl+K direct-listener pattern. Bails inside
inputs/textareas/contenteditable so native text-undo still works.

Ref CAR-81"
```

---

## Task 13: Add cheatsheet rows for the new shortcuts

**Files:**
- Modify: `src/renderer/components/Shortcuts.jsx`

- [ ] **Step 13.1: Add two rows to GLOBAL section**

In `src/renderer/components/Shortcuts.jsx`, edit the `SECTIONS` array. The GLOBAL section currently has 5 items (lines 7-13). Add two more entries at the end of that `items` array:

```js
      ['Cmd/Ctrl+Z',       'Undo last destructive action'],
      ['Cmd/Ctrl+Shift+Z', 'Redo'],
```

Final GLOBAL section:

```js
  {
    title: 'GLOBAL',
    items: [
      ['?',                 'Toggle this cheatsheet'],
      ['Esc',               'Close any open modal'],
      ['n',                 'New transaction'],
      ['[ / ]',             'Previous / next period'],
      ['Cmd/Ctrl+K',        'Command palette'],
      ['Cmd/Ctrl+Z',        'Undo last destructive action'],
      ['Cmd/Ctrl+Shift+Z',  'Redo'],
    ],
  },
```

- [ ] **Step 13.2: Smoke-test**

Run: `npm run dev`
- Press `?` to open the shortcuts cheatsheet.
- Confirm the two new rows render and the layout doesn't break.
- Quit.

- [ ] **Step 13.3: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 13.4: Commit**

```powershell
git add src/renderer/components/Shortcuts.jsx
git commit -m "docs(car-81): list undo/redo shortcuts in cheatsheet

Ref CAR-81"
```

---

## Task 14: Switch consumers — transactions and add sheets

**Files:**
- Modify: `src/renderer/screens/mobile/AddSheet.jsx`
- Modify: `src/renderer/screens/web/WebTransactions.jsx`
- Modify: `src/renderer/screens/web/WebAddModal.jsx`

(`screens/mobile/Transactions.jsx` was switched in Task 7.)

For each file, the change is mechanical: replace the import and the hook call.

- [ ] **Step 14.1: `screens/mobile/AddSheet.jsx`**

Find: `import { useStore } from '../../store';`
Replace with: `import { useUndoableStore } from '../../useUndoableStore';`

Find the `useStore()` destructure (around line 10) and replace with `useUndoableStore()`. The destructured names stay the same.

- [ ] **Step 14.2: `screens/web/WebTransactions.jsx`**

Find: `import { useStore } from '../../store';`
Replace with: `import { useUndoableStore } from '../../useUndoableStore';`

Find the `useStore()` destructure (around line 22) and replace with `useUndoableStore()`.

- [ ] **Step 14.3: `screens/web/WebAddModal.jsx`**

Find: `import { useStore } from '../../store';`
Replace with: `import { useUndoableStore } from '../../useUndoableStore';`

Find the `useStore()` destructure (around line 10) and replace with `useUndoableStore()`.

- [ ] **Step 14.4: Smoke-test**

Run: `npm run dev`
- Desktop: open WebTransactions, delete a tx → toast appears → UNDO restores.
- Desktop: open WebAddModal (the edit modal), delete a tx via the form → toast appears → UNDO restores.
- Resize < 1024 px to mobile: open AddSheet for an existing tx, delete → toast → UNDO restores.

Quit.

- [ ] **Step 14.5: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 14.6: Commit**

```powershell
git add src/renderer/screens/mobile/AddSheet.jsx src/renderer/screens/web/WebTransactions.jsx src/renderer/screens/web/WebAddModal.jsx
git commit -m "feat(car-81): wire transaction consumers to useUndoableStore

Mobile AddSheet, WebTransactions, WebAddModal now go through the
undoable wrapper for delete actions.

Ref CAR-81"
```

---

## Task 15: Switch consumers — accounts, categories, recurring, budgets

**Files (each gets the same mechanical swap):**
- `src/renderer/components/AccountFormSheet.jsx`
- `src/renderer/components/AccountFormModal.jsx`
- `src/renderer/screens/web/WebSettings.jsx` (categories)
- `src/renderer/screens/mobile/DetailScreens.jsx` (categories)
- `src/renderer/components/RecurringFormSheet.jsx`
- `src/renderer/screens/web/WebBills.jsx`
- `src/renderer/components/BudgetFormSheet.jsx`
- `src/renderer/components/BudgetFormModal.jsx`

The relative import path differs by depth:
- Files in `src/renderer/components/` → `import { useUndoableStore } from '../useUndoableStore';`
- Files in `src/renderer/screens/web/` or `src/renderer/screens/mobile/` → `import { useUndoableStore } from '../../useUndoableStore';`

- [ ] **Step 15.1: `components/AccountFormSheet.jsx`**

Replace `import { useStore } from '../store';` with `import { useUndoableStore } from '../useUndoableStore';`.
Replace the `useStore()` call with `useUndoableStore()`.

- [ ] **Step 15.2: `components/AccountFormModal.jsx`**

Same as above.

- [ ] **Step 15.3: `screens/web/WebSettings.jsx`**

Replace `import { useStore } from '../../store';` with `import { useUndoableStore } from '../../useUndoableStore';`.
Replace the `useStore()` call (line 13) with `useUndoableStore()`.

- [ ] **Step 15.4: `screens/mobile/DetailScreens.jsx`**

Same as above. Note: this file is large; only the destructure that includes `removeCategory` needs to swap. If multiple `useStore()` calls exist, switch only the one that destructures destructive setters.

Verify:
```powershell
Select-String -Path "src\renderer\screens\mobile\DetailScreens.jsx" -Pattern "useStore\(\)"
```

If a single match, replace it. If multiple, only the one that destructures `removeCategory` (around line 1109) needs the change.

- [ ] **Step 15.5: `components/RecurringFormSheet.jsx`**

Same depth as Account*. Swap import and hook call.

- [ ] **Step 15.6: `screens/web/WebBills.jsx`**

Swap import and hook call.

- [ ] **Step 15.7: `components/BudgetFormSheet.jsx`**

Swap import and hook call.

- [ ] **Step 15.8: `components/BudgetFormModal.jsx`**

Swap import and hook call.

- [ ] **Step 15.9: Smoke-test**

Run: `npm run dev`
For each:
- Account: edit an account, click Archive → toast → UNDO restores. Edit again, click Delete → toast → UNDO restores.
- Category: WebSettings → categories editor → delete a leaf category → toast → UNDO restores.
- Recurring: WebBills → click a bill → delete → toast → UNDO restores.
- Budget: open a budget form for a category that already has a budget → click Remove → toast → UNDO restores.

Quit.

- [ ] **Step 15.10: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 15.11: Commit**

```powershell
git add src/renderer/components/AccountFormSheet.jsx src/renderer/components/AccountFormModal.jsx src/renderer/screens/web/WebSettings.jsx src/renderer/screens/mobile/DetailScreens.jsx src/renderer/components/RecurringFormSheet.jsx src/renderer/screens/web/WebBills.jsx src/renderer/components/BudgetFormSheet.jsx src/renderer/components/BudgetFormModal.jsx
git commit -m "feat(car-81): wire account/category/recurring/budget consumers

Eight more consumer files now use useUndoableStore.

Ref CAR-81"
```

---

## Task 16: Switch consumers — goals and investments

**Files:**
- `src/renderer/components/GoalFormSheet.jsx`
- `src/renderer/components/GoalFormModal.jsx`
- `src/renderer/screens/web/WebInvestments.jsx`
- `src/renderer/screens/mobile/Investments.jsx`

- [ ] **Step 16.1: `components/GoalFormSheet.jsx`**

Replace `import { useStore } from '../store';` with `import { useUndoableStore } from '../useUndoableStore';`.
Replace the `useStore()` call with `useUndoableStore()`.

- [ ] **Step 16.2: `components/GoalFormModal.jsx`**

Same as above.

- [ ] **Step 16.3: `screens/web/WebInvestments.jsx`**

Replace `import { useStore } from '../../store';` with `import { useUndoableStore } from '../../useUndoableStore';`.
Replace the `useStore()` call (line 86) with `useUndoableStore()`.

- [ ] **Step 16.4: `screens/mobile/Investments.jsx`**

Same as above. Replace the `useStore()` call (line 34) with `useUndoableStore()`.

- [ ] **Step 16.5: Smoke-test**

Run: `npm run dev`
- Goals: WebGoals → click a goal → form opens → click Delete → toast → UNDO restores goal AND its contributions.
- Holdings: WebInvestments → click ✕ on a holding → toast → UNDO restores holding AND its trades.

Quit.

- [ ] **Step 16.6: Verify all consumer call sites have been swapped**

Run:
```powershell
Select-String -Path "src\renderer\**\*.jsx" -Pattern "useStore\(\)" | Where-Object { $_.Line -notmatch '^\s*//' }
```
Expected: only files that need read-only or non-destructive store access remain. Cross-check any matches against the list of 16 files in the spec.

- [ ] **Step 16.7: Run tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 16.8: Commit**

```powershell
git add src/renderer/components/GoalFormSheet.jsx src/renderer/components/GoalFormModal.jsx src/renderer/screens/web/WebInvestments.jsx src/renderer/screens/mobile/Investments.jsx
git commit -m "feat(car-81): wire goal and holding consumers

All 16 destructive consumer files now use useUndoableStore.

Ref CAR-81"
```

---

## Task 17: Build verification

**Files:** none (verification only)

- [ ] **Step 17.1: Production build**

Run: `npx vite build`
Expected: build completes without errors. Warnings about chunk size are acceptable if they were already there before this work.

- [ ] **Step 17.2: Full test suite**

Run: `npm test`
Expected: all tests pass, including the 14 new undo tests.

- [ ] **Step 17.3: Manual UAT — full acceptance criteria**

Run: `npm run dev`

Walk through the table from the spec (section 10 of `2026-05-21-car-81-undo-redo-design.md`):

| Criterion | Pass? |
|---|---|
| Toast for 5s with UNDO; clicking UNDO restores | [ ] |
| `Ctrl+Z` undoes last action | [ ] |
| Stack handles 20+ levels (delete 25 txs, undo 25 times) | [ ] |
| Undo + new action clears redo (delete A → undo → delete B → Ctrl+Shift+Z is no-op) | [ ] |
| All 10 mutations toast: tx delete, tx hide (if exposed in UI; otherwise N/A), transfer, account delete, account archive, recurring, budget, goal, category, holding | [ ] |
| Inside-input safety (typing + Ctrl+Z undoes typing, not last delete) | [ ] |
| Coalescing: delete 3 txs in <1.5s → "3 transactions deleted" → UNDO restores all 3 | [ ] |
| Redo via toast: UNDO → toast becomes "RESTORED · REDO" → click REDO → tx is deleted again | [ ] |

> **`hideTx` UI exposure note:** the codebase scan found no UI call site for `hideTx` today. Wrapping it is future-proofing per the spec; during UAT, treat that row as N/A unless a hide affordance is found.

- [ ] **Step 17.4: Mobile-breakpoint check**

Resize the dev window below 1024px. Trigger a delete. Verify the toast at `bottom: 20` doesn't get hidden behind a mobile bottom nav. If it does, raise the issue (likely fix: bump `bottom` to `80` for the mobile breakpoint via `window.matchMedia` or a media-query inline check).

- [ ] **Step 17.5: Self-QA per AGENTS.md**

- Build passes ✅
- Tests pass ✅
- Manual UAT passes ✅

- [ ] **Step 17.6: Commit (if anything was tweaked during UAT, e.g. mobile bottom offset)**

```powershell
# Only if changes were made
git add -p
git commit -m "fix(car-81): UAT-driven adjustments

<describe what was tweaked>

Ref CAR-81"
```

---

## Task 18: Move Linear issue to QA, push, and open PR

**Files:** none (workflow only)

- [ ] **Step 18.1: Move Linear CAR-81 to QA**

Self-review the diff first:

```powershell
git log --oneline dev-master..HEAD
git diff dev-master...HEAD --stat
```

Then move CAR-81 to QA via the Linear API:

```powershell
$body = @{ query = 'mutation { issueUpdate(id: "CAR-81", input: { stateId: "14279ed0-2591-4186-bebc-ab2664c83c9f" }) { success issue { identifier state { name } } } }' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method Post -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | ConvertTo-Json -Depth 5
```

(The `stateId` for QA on the CAR team is `14279ed0-2591-4186-bebc-ab2664c83c9f` — verified from this project's Linear workspace.)

- [ ] **Step 18.2: Run QA verification (final pass)**

Re-run the full UAT table from Task 17.3. If anything fails, transition CAR-81 back to In Progress (state `3c2a264e-e4b8-42fb-b5b6-6be39c6351a4`) and fix before reaching Step 18.3.

- [ ] **Step 18.3: Push the branch**

```powershell
git push -u origin car-81-undo-redo
```

- [ ] **Step 18.4: Open the PR**

```powershell
gh pr create --base dev-master --title "CAR-81: undo/redo for destructive actions (toast + Ctrl+Z)" --body @"
## Summary

Adds in-memory undo/redo for the 10 destructive store mutations, surfaced via:

- Bottom-left toast with UNDO button (5s auto-dismiss); becomes a REDO confirmation after undo
- ``Cmd/Ctrl+Z`` to undo, ``Cmd/Ctrl+Shift+Z`` and ``Cmd/Ctrl+Y`` to redo
- Same-action coalescing within a 1.5s window (e.g. ``5 transactions deleted``)
- Stack bounded to 50 entries; in-memory only

## Architecture

- ``src/renderer/undo.mjs`` — pure stack factory (Vitest-covered, 14 tests)
- ``src/renderer/UndoContext.jsx`` — single ``<UndoProvider>`` mounted inside ``<StoreProvider>``
- ``src/renderer/useUndoableStore.js`` — drop-in replacement for ``useStore()`` that wraps the 10 destructive setters
- ``src/renderer/components/UndoToast.jsx`` — bottom-left banner using existing ``A`` theme tokens
- 4 new restoration helpers in ``store.jsx`` (``restoreAccount``, ``restoreGoal``, ``restoreHolding``, ``restoreCategory``)
- 16 consumer files swap ``useStore()`` → ``useUndoableStore()``

Design spec: ``docs/superpowers/specs/2026-05-21-car-81-undo-redo-design.md``

## Test plan

- ``npm test`` — passes (14 new + existing)
- ``npx vite build`` — clean
- Manual UAT walked the full acceptance-criteria table from the spec (delete each of: tx, transfer, account, account-archive, recurring, budget, goal, category, holding) — all toast/UNDO/keyboard paths verified

Fixes CAR-81
"@
```

- [ ] **Step 18.5: Move Linear CAR-81 to Ready for Testing**

```powershell
$body = @{ query = 'mutation { issueUpdate(id: "CAR-81", input: { stateId: "601b0ea6-3ced-49c9-aeaa-613bb00d8b7a" }) { success issue { identifier state { name } } } }' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method Post -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | ConvertTo-Json -Depth 5
```

(The `stateId` for Ready for Testing is `601b0ea6-3ced-49c9-aeaa-613bb00d8b7a`.)

---

## Done

The remaining workflow (review feedback → PR Ready → merge → Done) is per AGENTS.md and not encoded in this plan.
