# CAR-76 — Empty First-Run State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop seeding demo data into a real user's `localStorage` on first launch. Replace it with an opt-in welcome modal, an `<EmptyApp>` screen, and per-section empty-state guidance, so a new user gets a clean app with clear paths forward.

**Architecture:** State defaults change to `[]`/`{}`/`DEFAULT_CAT_TREE` instead of seed arrays. A new `welcomeSeen` boolean and an `isAppEmpty` derivation gate two new components: `<Welcome>` (one-time first-launch modal) and `<EmptyApp>` (whole-app-empty centered welcome). A shared `<EmptySectionHint>` component handles partial-empty guidance. Demo data is loaded explicitly via `loadSampleData()`, refused unless the store is empty, with a confirm-and-reset flow when not.

**Tech Stack:** React 19, Vite 8, Electron 42, IBM Plex Mono inline-styled UI, localStorage via existing `useLS` hook, Vitest 2.1 (already installed in CAR-75) for tests.

**Spec:** `docs/superpowers/specs/2026-05-19-car-76-empty-first-run-design.md`

---

## File Inventory

| File | Status | Purpose |
|---|---|---|
| `src/renderer/data.js` | MODIFY | Add `DEFAULT_CAT_TREE` export; add comments marking the seed exports as demo content |
| `src/renderer/sampleData.mjs` | NEW | Pure helpers: `isAppEmptyFor(state)`, `isDefaultCatTreeFor(tree)` |
| `src/renderer/sampleData.test.mjs` | NEW | Vitest tests for the pure helpers |
| `src/renderer/store.jsx` | MODIFY | Defaults change; `welcomeSeen` state; `loadSampleData`, `dismissWelcome`; `isAppEmpty` derivation; `reset()` updates; migration mount-effect |
| `src/renderer/components/EmptySectionHint.jsx` | NEW | Shared per-section empty UI component |
| `src/renderer/screens/Welcome.jsx` | NEW | First-launch welcome modal |
| `src/renderer/screens/EmptyApp.jsx` | NEW | Whole-app-empty centered welcome |
| `src/renderer/App.jsx` | MODIFY | Render `<Welcome>` and `<EmptyApp>` based on store flags |
| `src/renderer/screens/web/Dashboard.jsx` | MODIFY | Empty hero + cash flow + recent transactions guidance |
| `src/renderer/screens/mobile/Home.jsx` | MODIFY | Same |
| `src/renderer/screens/web/WebTransactions.jsx` | MODIFY | Empty list guidance |
| `src/renderer/screens/mobile/Transactions.jsx` | MODIFY | Same |
| `src/renderer/screens/web/WebAccounts.jsx` | MODIFY | Empty list guidance |
| `src/renderer/screens/mobile/Accounts.jsx` | MODIFY | Same |
| `src/renderer/screens/web/WebBills.jsx` | MODIFY | Empty list guidance |
| `src/renderer/screens/web/WebReports.jsx` | MODIFY | Empty period guidance |
| `src/renderer/screens/web/WebInvestments.jsx` | MODIFY | Empty list guidance |
| `src/renderer/screens/web/WebSettings.jsx` | MODIFY | + LOAD SAMPLE DATA button + reset-and-load confirm modal |
| `src/renderer/screens/mobile/DetailScreens.jsx` | MODIFY | Same in mobile Settings export |
| `src/renderer/screens/web/WebAddModal.jsx` | MODIFY | "Add an account first" branch when no accounts |
| `src/renderer/screens/mobile/AddSheet.jsx` | MODIFY | Same |
| `vitest.config.mjs` | MODIFY | Add `sampleData.test.mjs` to include glob |

---

## Task 1: Add DEFAULT_CAT_TREE export to data.js

**Files:**
- Modify: `src/renderer/data.js`

- [ ] **Step 1: Add the new export below CATEGORY_TREE**

Edit `src/renderer/data.js`. Find the closing `};` of the existing `CATEGORY_TREE` export (around line 92, immediately before `export function catBreadcrumb`). Insert the new export right after `};` and before `catBreadcrumb`:

```js
// Minimal category tree for new users (Start Fresh). Top-level categories
// only, no children. Users can extend via the Settings category editor.
// `CATEGORY_TREE` above is the demo seed used by store.loadSampleData().
export const DEFAULT_CAT_TREE = {
  income:  { label: 'INCOME',     glyph: '↑' },
  food:    { label: 'GROCERIES',  glyph: '◇' },
  dining:  { label: 'DINING',     glyph: '◆' },
  rent:    { label: 'RENT',       glyph: '▣' },
  trans:   { label: 'TRANSPORT',  glyph: '▷' },
  bills:   { label: 'UTILITIES',  glyph: '▢' },
  shop:    { label: 'SHOPPING',   glyph: '○' },
  travel:  { label: 'TRAVEL',     glyph: '▲' },
  health:  { label: 'HEALTH',     glyph: '+' },
  subs:    { label: 'SUBSCRIPT.', glyph: '∞' },
  edu:     { label: 'EDUCATION',  glyph: '✎' },
};
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: `built in ...` line present, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/data.js
git commit -m "CAR-76: add DEFAULT_CAT_TREE export for empty first-run users"
```

---

## Task 2: Write sampleData helpers tests (red)

**Files:**
- Create: `src/renderer/sampleData.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/sampleData.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { isAppEmptyFor, isDefaultCatTreeFor } from './sampleData.mjs';
import { DEFAULT_CAT_TREE, CATEGORY_TREE } from './data.js';

describe('isAppEmptyFor', () => {
  const empty = {
    txs: [],
    accounts: [],
    bills: [],
    goals: [],
    budgets: [],
    investments: [],
    trades: [],
  };

  it('returns true when every major slice is empty', () => {
    expect(isAppEmptyFor(empty)).toBe(true);
  });

  it('returns false when accounts has any entry', () => {
    expect(isAppEmptyFor({ ...empty, accounts: [{ id: 'chk' }] })).toBe(false);
  });

  it('returns false when transactions has any entry', () => {
    expect(isAppEmptyFor({ ...empty, txs: [{ id: 't1', amt: 0 }] })).toBe(false);
  });

  it('returns false for any single non-empty slice', () => {
    expect(isAppEmptyFor({ ...empty, bills: [{ id: 'b1' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, goals: [{ id: 'g1' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, budgets: [{ cat: 'food' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, investments: [{ ticker: 'VTI' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, trades: [{ id: 'tr1' }] })).toBe(false);
  });

  it('handles undefined/null slices gracefully', () => {
    expect(isAppEmptyFor({})).toBe(true);
    expect(isAppEmptyFor({ txs: null })).toBe(true);
  });
});

describe('isDefaultCatTreeFor', () => {
  it('returns true for DEFAULT_CAT_TREE', () => {
    expect(isDefaultCatTreeFor(DEFAULT_CAT_TREE)).toBe(true);
  });

  it('returns false for the full CATEGORY_TREE (has children)', () => {
    expect(isDefaultCatTreeFor(CATEGORY_TREE)).toBe(false);
  });

  it('returns false for an empty tree', () => {
    expect(isDefaultCatTreeFor({})).toBe(false);
  });

  it('returns false when the user has added a custom top-level category', () => {
    expect(isDefaultCatTreeFor({
      ...DEFAULT_CAT_TREE,
      custom: { label: 'CUSTOM' },
    })).toBe(false);
  });

  it('returns false when the user has added children to a default node', () => {
    const modified = JSON.parse(JSON.stringify(DEFAULT_CAT_TREE));
    modified.food.children = { produce: { label: 'PRODUCE' } };
    expect(isDefaultCatTreeFor(modified)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isDefaultCatTreeFor(null)).toBe(false);
    expect(isDefaultCatTreeFor(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Add the new test file to Vitest's include glob**

Edit `vitest.config.mjs`. Replace the `include` array so it picks up the new file:

```js
import { defineConfig } from 'vitest/config';

// Until CAR-153 unifies all tests onto Vitest, the include glob is an
// explicit allowlist of Vitest-style files. Anything not listed here is
// presumed to be node:test style (alerts/charts/period/planning) and is
// run separately via `node --test` if at all.
export default defineConfig({
  test: {
    include: [
      'src/renderer/fx.test.mjs',
      'src/renderer/sampleData.test.mjs',
    ],
    environment: 'node',
    globals: false,
  },
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: tests FAIL with module-resolution error on `./sampleData.mjs` (the implementation does not exist yet). The existing `fx.test.mjs` should still pass (19/19).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/sampleData.test.mjs vitest.config.mjs
git commit -m "CAR-76: add failing tests for sampleData helpers"
```

---

## Task 3: Implement sampleData.mjs (green)

**Files:**
- Create: `src/renderer/sampleData.mjs`

- [ ] **Step 1: Write the implementation**

Create `src/renderer/sampleData.mjs`:

```js
// Pure helpers for CAR-76's empty first-run state. No React, no I/O.

const SLICES = ['txs', 'accounts', 'bills', 'goals', 'budgets', 'investments', 'trades'];

// True iff every major data slice is empty. The category tree and goal
// contributions are deliberately excluded — modifying the tree is not
// "having data," and contributions are downstream of goals.
export function isAppEmptyFor(state) {
  if (!state || typeof state !== 'object') return true;
  for (const key of SLICES) {
    const slice = state[key];
    if (Array.isArray(slice) && slice.length > 0) return false;
  }
  return true;
}

// True iff `tree` is the unmodified DEFAULT_CAT_TREE shape: the same set of
// top-level keys with no `children` property on any node. Used by
// loadSampleData() to decide whether to overwrite the tree with the full
// demo CATEGORY_TREE, vs preserving the user's customizations.
const DEFAULT_KEYS = [
  'income', 'food', 'dining', 'rent', 'trans',
  'bills', 'shop', 'travel', 'health', 'subs', 'edu',
];

export function isDefaultCatTreeFor(tree) {
  if (!tree || typeof tree !== 'object') return false;
  const keys = Object.keys(tree);
  if (keys.length !== DEFAULT_KEYS.length) return false;
  for (const k of DEFAULT_KEYS) {
    const node = tree[k];
    if (!node) return false;
    if (node.children) return false;
  }
  return true;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test`
Expected: all `sampleData.test.mjs` tests PASS, plus existing `fx.test.mjs` 19/19. Total ~30+ tests, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/sampleData.mjs
git commit -m "CAR-76: implement sampleData.mjs (isAppEmptyFor, isDefaultCatTreeFor)"
```

---

## Task 4: Change store defaults from seed data to empty

**Files:**
- Modify: `src/renderer/store.jsx`

- [ ] **Step 1: Update the imports**

Edit `src/renderer/store.jsx`. Find the existing data import (around line 2):

```js
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS, ACCOUNTS, BILLS, GOALS, INVESTMENTS, TRADES } from './data';
```

Replace with:

```js
import { TRANSACTIONS, CATEGORY_TREE, DEFAULT_CAT_TREE, BUDGETS, ACCOUNTS, BILLS, GOALS, INVESTMENTS, TRADES } from './data';
import { isAppEmptyFor, isDefaultCatTreeFor } from './sampleData.mjs';
```

- [ ] **Step 2: Change the `useLS` defaults**

Find these lines (in `StoreProvider`, around lines 52-67):

```js
const [txs, setTxs]         = useLS('ledger:tx',      TRANSACTIONS);
const [catTree, setCatTree]  = useLS('ledger:cats',    CATEGORY_TREE);
const [budgets, setBudgets]  = useLS('ledger:budgets', BUDGETS);
const [hidden, setHidden]    = useLS('ledger:hidden',  []);
const [accounts, setAccounts] = useLS('ledger:accounts', ACCOUNTS);
```

Replace with:

```js
const [txs, setTxs]         = useLS('ledger:tx',      []);
const [catTree, setCatTree]  = useLS('ledger:cats',    DEFAULT_CAT_TREE);
const [budgets, setBudgets]  = useLS('ledger:budgets', []);
const [hidden, setHidden]    = useLS('ledger:hidden',  []);
const [accounts, setAccounts] = useLS('ledger:accounts', []);
```

Then find:

```js
const [bills, setBills] = useLS('ledger:bills', BILLS);
```

Replace with:

```js
const [bills, setBills] = useLS('ledger:bills', []);
```

Then find:

```js
const [goals, setGoals] = useLS('ledger:goals', GOALS);
```

Replace with:

```js
const [goals, setGoals] = useLS('ledger:goals', []);
```

Then find:

```js
const [investments, setInvestments] = useLS('ledger:investments', INVESTMENTS);
const [trades, setTrades]           = useLS('ledger:trades', TRADES);
```

Replace with:

```js
const [investments, setInvestments] = useLS('ledger:investments', []);
const [trades, setTrades]           = useLS('ledger:trades', []);
```

- [ ] **Step 3: Verify build still compiles**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: build succeeds. The `TRANSACTIONS`/`CATEGORY_TREE`/`BUDGETS`/etc. imports are still used (we'll reference them in `loadSampleData` next task), so no unused-import warnings.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store.jsx
git commit -m "CAR-76: change store defaults to empty arrays / DEFAULT_CAT_TREE"
```

---

## Task 5: Add welcomeSeen state, dismissWelcome, loadSampleData, isAppEmpty

**Files:**
- Modify: `src/renderer/store.jsx`

- [ ] **Step 1: Add welcomeSeen state**

In `StoreProvider`, find the line that reads `const [dismissedAlertIds, setDismissedAlertIds] = useLS('ledger:dismissedAlerts', []);` (around line 67). Immediately AFTER that line and BEFORE the FX rates state added in CAR-75, add:

```js
const [welcomeSeen, setWelcomeSeen] = useLS('ledger:welcomeSeen', false);
```

- [ ] **Step 2: Add the migration mount-effect**

Find the existing migration `useEffect` at the top of `StoreProvider` (the one that calls `setBills(prev => migrateBills(prev))`, around line 59-61). AFTER that effect, add a new effect:

```js
React.useEffect(() => {
  // CAR-76: existing users with non-empty data should not see the welcome
  // modal on first post-upgrade boot. Read slices directly from initial
  // state — useLS already loaded localStorage synchronously.
  if (!welcomeSeen && !isAppEmptyFor({ txs, accounts, bills, goals, budgets, investments, trades })) {
    setWelcomeSeen(true);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // run once on mount; reading initial state is intentional
```

- [ ] **Step 3: Add `isAppEmpty` derivation**

Find the existing `accountsWithBalance` and `accountsIncludedInTotals` derivations. Below them (after `alertRowsWithAccounts`, around line 128), add:

```js
const isAppEmpty = React.useMemo(
  () => isAppEmptyFor({ txs, accounts, bills, goals, budgets, investments, trades }),
  [txs, accounts, bills, goals, budgets, investments, trades],
);
```

- [ ] **Step 4: Add the `dismissWelcome` and `loadSampleData` actions**

Find the `reset` callback (around line 422). Immediately BEFORE it, add:

```js
const dismissWelcome = React.useCallback(() => {
  setWelcomeSeen(true);
}, [setWelcomeSeen]);

const loadSampleData = React.useCallback(() => {
  if (!isAppEmptyFor({ txs, accounts, bills, goals, budgets, investments, trades })) {
    throw new Error('LEDGER_NOT_EMPTY');
  }
  setTxs(TRANSACTIONS);
  setAccounts(ACCOUNTS);
  setBudgets(BUDGETS);
  setBills(BILLS);
  setGoals(GOALS);
  setInvestments(INVESTMENTS);
  setTrades(TRADES);
  setCatTree(prev => isDefaultCatTreeFor(prev) ? CATEGORY_TREE : prev);
}, [txs, accounts, bills, goals, budgets, investments, trades, setTxs, setAccounts, setBudgets, setBills, setGoals, setInvestments, setTrades, setCatTree]);
```

- [ ] **Step 5: Update `reset()` to flip welcomeSeen**

Find the `reset` callback. Replace its body so it includes `setWelcomeSeen(false)` and update the dep array:

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
}, [setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades, setDismissedAlertIds, setTxFilterRaw, setRates, setRatesUpdated, setFxMigrationToastSeen, setWelcomeSeen]);
```

Note the change: `setCatTree(DEFAULT_CAT_TREE)` instead of `setCatTree({})`. Reset goes back to the minimal usable tree, not an empty one.

- [ ] **Step 6: Expose new values in the context**

Find the `<StoreCtx.Provider value={{ ... }}>` block. Add these keys (place them anywhere sensible; group near related state):

```js
welcomeSeen,
dismissWelcome,
loadSampleData,
isAppEmpty,
```

- [ ] **Step 7: Verify build and tests**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.
Run: `npm test` — expect all tests still passing.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/store.jsx
git commit -m "CAR-76: add welcomeSeen, dismissWelcome, loadSampleData, isAppEmpty to store"
```

---

## Task 6: Build the EmptySectionHint component

**Files:**
- Create: `src/renderer/components/EmptySectionHint.jsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/components/EmptySectionHint.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';

// Shared partial-empty UI: a one-line message + optional CTA, used
// inside sections of normal screens where data hasn't been entered yet.
// Visual style A from the CAR-76 design.
export default function EmptySectionHint({ message, ctaLabel, onCta, ctaIcon = '+' }) {
  return (
    <div style={{
      padding: '14px 0',
      fontSize: 11,
      color: A.muted,
      letterSpacing: 0.6,
      lineHeight: 1.5,
    }}>
      <div>{message}</div>
      {ctaLabel && onCta && (
        <button onClick={onCta} style={{
          all: 'unset',
          cursor: 'pointer',
          marginTop: 8,
          fontSize: 10,
          letterSpacing: 1.2,
          padding: '5px 12px',
          border: '1px solid ' + A.ink,
          background: A.ink,
          color: A.bg,
        }}>
          {ctaIcon} {ctaLabel}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/EmptySectionHint.jsx
git commit -m "CAR-76: add shared EmptySectionHint component"
```

---

## Task 7: Build the Welcome modal

**Files:**
- Create: `src/renderer/screens/Welcome.jsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/screens/Welcome.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';
import { useStore } from '../store';

// First-launch modal. Renders only when welcomeSeen === false. Three
// vertical buttons: Start Fresh / Load Sample Data / Import Bank File.
// Esc / X / click-outside is treated as Start Fresh (welcomeSeen flipped,
// no other action).
export default function Welcome({ onImport }) {
  const { dismissWelcome, loadSampleData } = useStore();

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') dismissWelcome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissWelcome]);

  const handleStartFresh = () => {
    dismissWelcome();
  };

  const handleLoadSample = () => {
    try {
      loadSampleData();
    } catch (err) {
      // Should never happen on first run; defensive only.
      console.warn('[welcome] loadSampleData failed:', err.message);
    }
    dismissWelcome();
  };

  const handleImport = () => {
    dismissWelcome();
    if (onImport) onImport();
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) dismissWelcome(); }}
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
        padding: '36px 32px 28px',
        width: 'min(420px, 90vw)',
        position: 'relative',
      }}>
        <button onClick={dismissWelcome} title="Close"
          style={{
            all: 'unset', cursor: 'pointer',
            position: 'absolute', top: 10, right: 12,
            fontSize: 14, color: A.muted, padding: '2px 6px',
          }}>×</button>

        <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>
          [01] WELCOME
        </div>
        <div style={{ fontSize: 28, letterSpacing: -0.5, marginTop: 6, fontWeight: 600 }}>
          LEDGER
        </div>
        <div style={{ fontSize: 11, color: A.ink2, letterSpacing: 0.5, marginTop: 8, lineHeight: 1.5 }}>
          A personal-finance ledger. All data stays on your machine.
        </div>

        <div style={{ marginTop: 24, borderTop: '2px solid ' + A.ink }}>
          <button onClick={handleStartFresh} style={{
            all: 'unset', cursor: 'pointer',
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '14px 0', borderBottom: '1px solid ' + A.rule2,
            fontSize: 12, letterSpacing: 1, fontWeight: 600,
          }}>
            START FRESH ▸
          </button>
          <button onClick={handleLoadSample} style={{
            all: 'unset', cursor: 'pointer',
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '14px 0', borderBottom: '1px solid ' + A.rule2,
            fontSize: 12, letterSpacing: 1,
          }}>
            LOAD SAMPLE DATA ▸
          </button>
          <button onClick={handleImport} style={{
            all: 'unset', cursor: 'pointer',
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '14px 0',
            fontSize: 12, letterSpacing: 1,
          }}>
            IMPORT A BANK FILE ▸
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/screens/Welcome.jsx
git commit -m "CAR-76: add Welcome modal component"
```

---

## Task 8: Build the EmptyApp screen

**Files:**
- Create: `src/renderer/screens/EmptyApp.jsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/screens/EmptyApp.jsx`:

```jsx
import React from 'react';
import { A } from '../theme';
import { useStore } from '../store';

// Whole-app-empty welcome screen (Style B from the CAR-76 design).
// Renders when welcomeSeen === true AND isAppEmpty === true.
// No top-level navigation — the user has nothing to navigate to yet.
export default function EmptyApp({ onAddAccount, onImport }) {
  const { loadSampleData } = useStore();

  const handleLoadSample = () => {
    try {
      loadSampleData();
    } catch (err) {
      console.warn('[empty-app] loadSampleData failed:', err.message);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', background: A.bg, color: A.ink,
      fontFamily: A.font, padding: '40px 24px', boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>
        [—]  NO DATA YET
      </div>
      <div style={{ fontSize: 32, letterSpacing: -0.5, marginTop: 8, fontWeight: 600 }}>
        LEDGER
      </div>
      <div style={{ fontSize: 12, color: A.ink2, letterSpacing: 0.5, marginTop: 12, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
        Add an account to begin tracking. You can also import from your bank or load sample data.
      </div>

      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10, width: 'min(280px, 100%)' }}>
        <button onClick={onAddAccount} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          textAlign: 'center', padding: '12px 20px',
          border: '1.5px solid ' + A.ink, background: A.ink, color: A.bg,
          fontSize: 11, letterSpacing: 1.2, fontWeight: 600,
        }}>
          + ADD YOUR FIRST ACCOUNT
        </button>
        <button onClick={onImport} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          textAlign: 'center', padding: '12px 20px',
          border: '1px solid ' + A.ink, background: 'transparent', color: A.ink,
          fontSize: 11, letterSpacing: 1.2,
        }}>
          IMPORT A BANK FILE
        </button>
        <button onClick={handleLoadSample} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          textAlign: 'center', padding: '10px 20px',
          border: '1px dashed ' + A.rule2, background: 'transparent', color: A.muted,
          fontSize: 10, letterSpacing: 1.2,
        }}>
          LOAD SAMPLE DATA
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/screens/EmptyApp.jsx
git commit -m "CAR-76: add EmptyApp whole-app-empty welcome screen"
```

---

## Task 9: Wire Welcome and EmptyApp into App.jsx

**Files:**
- Modify: `src/renderer/App.jsx`

- [ ] **Step 1: Add the imports**

Edit `src/renderer/App.jsx`. Find the existing imports near the top. Add to the imports section:

```js
import Welcome from './screens/Welcome';
import EmptyApp from './screens/EmptyApp';
import { useStore } from './store';
import ImportExport from './components/ImportExport';
import AccountFormSheet from './components/AccountFormSheet';
import AccountFormModal from './components/AccountFormModal';
```

(`ImportExport` may already be present — verify before adding to avoid a duplicate.)

- [ ] **Step 2: Refactor the root App component**

Find the root `export default function App()` at the bottom of the file. The existing implementation renders `<StoreProvider>` with `MobileApp`/`DesktopApp` inside.

We introduce a child component (`AppShell`) that consumes the store inside the provider, plus a small helper (`AccountFromEmpty`) that picks the right account form by viewport. Replace the existing `App` export with:

```jsx
function AccountFromEmpty({ onClose, t, isMobile }) {
  return isMobile
    ? <AccountFormSheet onClose={onClose} t={t} account={null} />
    : <AccountFormModal onClose={onClose} t={t} account={null} />;
}

function AppShell() {
  const { welcomeSeen, isAppEmpty } = useStore();
  const { accent, setAccent, density, setDensity, decimals, setDecimals, currency, setCurrency, theme, setTheme } = useTweaks();
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

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"`
Expected: build succeeds.

- [ ] **Step 4: Smoke test (manual)**

Run: `npm run dev`
Verify in the browser:
- If your localStorage already has data, the app loads normally (no welcome modal). Migration effect set `welcomeSeen = true` silently.
- Open DevTools → Application → Local Storage → clear `ledger:welcomeSeen`. Reload. Welcome modal appears with three buttons.
- Click `Start Fresh`. Modal disappears. If you have data, normal layout renders. If not, EmptyApp renders.
- To test EmptyApp: in DevTools, clear all `ledger:*` keys, reload. Welcome appears → click Start Fresh → EmptyApp appears with three CTAs.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.jsx
git commit -m "CAR-76: render Welcome modal and EmptyApp based on store flags"
```

---

## Task 10: Add LOAD SAMPLE DATA button + reset-and-load modal to WebSettings

**Files:**
- Modify: `src/renderer/screens/web/WebSettings.jsx`

- [ ] **Step 1: Read the current DATA section**

Run: `rg -n "RESET ALL DATA|RESET · ALL · DATA" src/renderer/screens/web/WebSettings.jsx`
Identify the DATA section (search for `<ALabel>DATA</ALabel>`).

- [ ] **Step 2: Add state, hook, and modal handlers**

In the component body (around the existing `useStore` destructure near the top), add these to the destructure:

Find:
```js
const { categoryTree, addCategory, renameCategory, removeCategory, budgetStartDay, setBudgetStartDay, reset } = useStore();
```

Replace with:
```js
const { categoryTree, addCategory, renameCategory, removeCategory, budgetStartDay, setBudgetStartDay, reset, loadSampleData } = useStore();
```

In the body of the component, find the existing `confirmReset` state and `handleResetClick` (the two-stage reset confirm logic). Below them, add new state and a handler:

```js
const [showResetAndLoad, setShowResetAndLoad] = React.useState(false);

const handleLoadSampleClick = () => {
  try {
    loadSampleData();
  } catch (err) {
    if (err.message === 'LEDGER_NOT_EMPTY') {
      setShowResetAndLoad(true);
    } else {
      throw err;
    }
  }
};

const handleResetAndLoad = () => {
  reset();
  // After reset, isAppEmpty becomes true synchronously on next render.
  // Defer the load via a microtask so React processes the reset first.
  Promise.resolve().then(() => {
    try { loadSampleData(); } catch (err) { console.warn(err); }
  });
  setShowResetAndLoad(false);
};
```

- [ ] **Step 3: Add the LOAD SAMPLE DATA button next to RESET ALL DATA**

Find the existing DATA section. It looks like:

```jsx
<div style={{ marginTop: 20 }}>
  <ALabel>DATA</ALabel>
  <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
    <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>RESET · ALL · DATA</div>
      <button onClick={handleResetClick} style={{ ... }}>
        {confirmReset ? 'CLICK AGAIN TO CONFIRM ↩' : 'RESET ALL DATA'}
      </button>
    </div>
  </div>
</div>
```

Add a new row INSIDE the DATA container, immediately after the closing `</div>` of the RESET row's outer div, but BEFORE the DATA container's closing `</div>`. The new row:

```jsx
<div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>SAMPLE · DATA</div>
  <button onClick={handleLoadSampleClick} style={{
    all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
    padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
  }}>
    LOAD SAMPLE DATA
  </button>
</div>
```

- [ ] **Step 4: Add the reset-and-load confirm modal at the end of the component JSX**

In the `return (...)` block, find the closing `</WebShell>` tag. Immediately BEFORE it, add:

```jsx
{showResetAndLoad && (
  <div
    onClick={(e) => { if (e.target === e.currentTarget) setShowResetAndLoad(false); }}
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
      width: 'min(360px, 90vw)',
    }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>
        SAMPLE · DATA
      </div>
      <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
        Your data isn't empty. Loading sample data would mix real and demo entries. Reset to empty first, then load samples?
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button onClick={() => setShowResetAndLoad(false)} style={{
          all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
          padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
        }}>CANCEL</button>
        <button onClick={handleResetAndLoad} style={{
          all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
          padding: '5px 12px', border: '1px solid ' + A.neg, background: A.neg, color: A.bg,
        }}>RESET & LOAD SAMPLES</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/screens/web/WebSettings.jsx
git commit -m "CAR-76: add Load Sample Data button + reset-and-load modal to WebSettings"
```

---

## Task 11: Add LOAD SAMPLE DATA + reset-and-load modal to mobile Settings

**Files:**
- Modify: `src/renderer/screens/mobile/DetailScreens.jsx`

- [ ] **Step 1: Locate the mobile Settings export**

Run: `rg -n "^export function Settings" src/renderer/screens/mobile/DetailScreens.jsx`
Note the line number where the `Settings` component begins.

- [ ] **Step 2: Add useStore destructure for `loadSampleData` and `reset`**

Inside the `Settings` function, find the existing `useStore()` destructure. Add `loadSampleData` and `reset` to it (if `reset` is not already there).

Example: if it currently reads `const { categoryTree, addCategory, ... } = useStore();`, change to include `loadSampleData, reset`:

```js
const { categoryTree, addCategory, renameCategory, removeCategory, budgetStartDay, setBudgetStartDay, reset, loadSampleData } = useStore();
```

- [ ] **Step 3: Add state and handlers**

Below the existing `useStore` destructure, add:

```js
const [showResetAndLoad, setShowResetAndLoad] = React.useState(false);

const handleLoadSampleClick = () => {
  try {
    loadSampleData();
  } catch (err) {
    if (err.message === 'LEDGER_NOT_EMPTY') {
      setShowResetAndLoad(true);
    } else {
      throw err;
    }
  }
};

const handleResetAndLoad = () => {
  reset();
  Promise.resolve().then(() => {
    try { loadSampleData(); } catch (err) { console.warn(err); }
  });
  setShowResetAndLoad(false);
};
```

- [ ] **Step 4: Add the LOAD SAMPLE DATA button row in the DATA section**

Find the existing DATA / RESET ALL DATA row in mobile Settings (search for `RESET · ALL · DATA` or similar). Add a row above or below it:

```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
  <div>
    <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>SAMPLE · DATA</div>
    <div style={{ fontSize: 11, marginTop: 3 }}>Load demo entries</div>
  </div>
  <button onClick={handleLoadSampleClick} style={{
    all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
    padding: '5px 10px', border: '1px solid ' + A.ink, color: A.ink,
  }}>LOAD</button>
</div>
```

(Match the style of the surrounding mobile-Settings rows — confirm via the read tool before placing.)

- [ ] **Step 5: Add the reset-and-load modal at the end of the Settings JSX**

Find the closing of the `Settings` component's return statement. Immediately before its outermost closing tag, add:

```jsx
{showResetAndLoad && (
  <div
    onClick={(e) => { if (e.target === e.currentTarget) setShowResetAndLoad(false); }}
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
      width: 'min(320px, 88vw)',
    }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>SAMPLE · DATA</div>
      <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
        Your data isn't empty. Reset to empty first, then load samples?
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
        <button onClick={() => setShowResetAndLoad(false)} style={{
          all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
          padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
        }}>CANCEL</button>
        <button onClick={handleResetAndLoad} style={{
          all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
          padding: '5px 12px', border: '1px solid ' + A.neg, background: A.neg, color: A.bg,
        }}>RESET & LOAD</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/screens/mobile/DetailScreens.jsx
git commit -m "CAR-76: add Load Sample Data + reset-and-load modal to mobile Settings"
```

---

## Task 12: Handle "no accounts" in WebAddModal

**Files:**
- Modify: `src/renderer/screens/web/WebAddModal.jsx`

- [ ] **Step 1: Add AccountFormModal import and "no accounts" branch**

Edit `src/renderer/screens/web/WebAddModal.jsx`. At the top of the file, add to the imports:

```js
import AccountFormModal from '../../components/AccountFormModal';
```

In the component body, immediately after the `useStore()` destructure, add:

```js
const [showAddAccount, setShowAddAccount] = React.useState(false);
```

Then, at the very top of the existing return JSX (before any other rendering), add an early-return branch for the no-accounts case. Find the existing `return (` line and insert this block at the beginning of the returned JSX:

```jsx
if (accountsWithBalance.length === 0) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: A.font,
      }}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: A.bg, color: A.ink, border: '2px solid ' + A.ink,
          padding: '28px 24px', width: 'min(380px, 90vw)',
        }}>
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>ADD TRANSACTION</div>
          <div style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
            No accounts yet. Add an account to start tracking transactions.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
              padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
            }}>CANCEL</button>
            <button onClick={() => setShowAddAccount(true)} style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
              padding: '5px 12px', border: '1px solid ' + A.ink, background: A.ink, color: A.bg,
            }}>+ ADD ACCOUNT</button>
          </div>
        </div>
      </div>
      {showAddAccount && (
        <AccountFormModal
          account={null}
          t={t}
          onClose={() => { setShowAddAccount(false); onClose(); }}
        />
      )}
    </>
  );
}
```

This branch must be placed BEFORE the existing return — read the existing function body first to understand its current return structure, then insert the early-return at the top.

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/screens/web/WebAddModal.jsx
git commit -m "CAR-76: WebAddModal shows Add Account first when no accounts exist"
```

---

## Task 13: Handle "no accounts" in mobile AddSheet

**Files:**
- Modify: `src/renderer/screens/mobile/AddSheet.jsx`

- [ ] **Step 1: Add import and state**

Edit `src/renderer/screens/mobile/AddSheet.jsx`. Add to the imports at the top:

```js
import AccountFormSheet from '../../components/AccountFormSheet';
```

In the component body, after the `useStore()` destructure, add:

```js
const [showAddAccount, setShowAddAccount] = React.useState(false);
```

- [ ] **Step 2: Add the early-return branch**

In the component body, immediately before the existing `return` statement, add:

```jsx
if (accountsWithBalance.length === 0) {
  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-end',
        fontFamily: A.font,
      }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{
          background: A.bg, width: '100%', borderTop: '2px solid ' + A.ink,
          padding: '24px 18px',
        }}>
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>ADD TRANSACTION</div>
          <div style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
            No accounts yet. Add an account to start tracking transactions.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button onClick={onClose} style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
              fontSize: 11, letterSpacing: 1.2,
              padding: '12px 0', border: '1px solid ' + A.rule2, color: A.muted,
            }}>CANCEL</button>
            <button onClick={() => setShowAddAccount(true)} style={{
              all: 'unset', cursor: 'pointer', flex: 2, textAlign: 'center',
              fontSize: 11, letterSpacing: 1.2,
              padding: '12px 0', border: '1px solid ' + A.ink, background: A.ink, color: A.bg,
            }}>+ ADD ACCOUNT</button>
          </div>
        </div>
      </div>
      {showAddAccount && (
        <AccountFormSheet
          account={null}
          t={t}
          onClose={() => { setShowAddAccount(false); onClose(); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/screens/mobile/AddSheet.jsx
git commit -m "CAR-76: AddSheet shows Add Account first when no accounts exist"
```

---

## Task 14: Add empty-state hints to Dashboard

**Files:**
- Modify: `src/renderer/screens/web/Dashboard.jsx`

- [ ] **Step 1: Add the import**

Edit `src/renderer/screens/web/Dashboard.jsx`. Add to imports:

```js
import EmptySectionHint from '../../components/EmptySectionHint';
```

- [ ] **Step 2: Replace the hero NET WORTH section when no accounts**

Read the file (around lines 60-90 where the hero block is rendered). Find the block that renders `[01] NET WORTH · ...` followed by the big dollar amount. Wrap it conditionally:

When `accountsIncludedInTotals.length === 0`, replace the dollar amount + period chips with `<EmptySectionHint message="Add your first account to see your net worth." ctaLabel="ADD ACCOUNT" onCta={onAdd} />`. Keep the `[01] NET WORTH` label visible.

Find this block (the hero):
```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
  <div>
    <ALabel>[01] NET WORTH · {todayLabel}</ALabel>
    <div style={{ fontSize: 64, ... }}>
      {fmtMoney(heroVal, ...)}
    </div>
    <div style={{ fontSize: 12, marginTop: 6 }}>
      <span>...</span>
    </div>
  </div>
  <div style={{ display: 'flex', gap: 6 }}>
    {/* period chips */}
  </div>
</div>
```

Replace with:

```jsx
{accountsIncludedInTotals.length === 0 ? (
  <div>
    <ALabel>[01] NET WORTH</ALabel>
    <EmptySectionHint
      message="Add your first account to see your net worth."
      ctaLabel="ADD ACCOUNT"
      onCta={onAdd}
    />
  </div>
) : (
  // ... existing hero block ...
)}
```

(Read the file to get the exact existing JSX, and put it inside the `:` branch verbatim.)

- [ ] **Step 3: Replace the cash flow / sparkline / accounts table when empty**

Below the hero, the same pattern: when `transactions.length === 0`, hide the sparkline + cash-flow tiles and show:

```jsx
<EmptySectionHint
  message="Cash flow appears once you have transactions."
  ctaLabel="ADD TRANSACTION"
  onCta={onAdd}
/>
```

When `accountsIncludedInTotals.length === 0`, the [02] ACCOUNTS section is empty — show no rows. The existing fall-through (zero rows render nothing) is acceptable; no explicit hint needed since the hero already drives "add an account."

- [ ] **Step 4: Replace the [08] RECENT TRANSACTIONS section when empty**

Find the recent-transactions list (`transactions.slice(0, 8).map(...)`). When `transactions.length === 0`, replace with:

```jsx
<div style={{ padding: '12px 0', fontSize: 11, color: A.muted, letterSpacing: 1 }}>
  NO TRANSACTIONS YET
</div>
```

- [ ] **Step 5: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/screens/web/Dashboard.jsx
git commit -m "CAR-76: Dashboard shows empty-state hints for net worth, cash flow, recent transactions"
```

---

## Task 15: Add empty-state hints to mobile Home

**Files:**
- Modify: `src/renderer/screens/mobile/Home.jsx`

- [ ] **Step 1: Add the import**

Add to imports:
```js
import EmptySectionHint from '../../components/EmptySectionHint';
```

- [ ] **Step 2: Replace empty-data sections with hints**

Apply the same pattern as Task 14: when `accountsIncludedInTotals.length === 0`, replace the hero metric block with `<EmptySectionHint message="Add your first account to see your net worth." ctaLabel="ADD ACCOUNT" onCta={onAddTx} />` (note: `onAddTx` is the prop in mobile Home; if you need a separate `onAddAccount` prop, plumb it through).

When `transactions.length === 0`, the cash flow tiles are zero — replace with `<EmptySectionHint message="Cash flow appears once you have transactions." ctaLabel="ADD TRANSACTION" onCta={onAddTx} />`.

When the accounts mini-list is empty, hide it entirely (existing fall-through is fine).

- [ ] **Step 3: Verify build**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/screens/mobile/Home.jsx
git commit -m "CAR-76: mobile Home shows empty-state hints for net worth and cash flow"
```

---

## Task 16: Add empty-state hint to WebTransactions

**Files:**
- Modify: `src/renderer/screens/web/WebTransactions.jsx`

- [ ] **Step 1: Add the import and empty branch**

Add `import EmptySectionHint from '../../components/EmptySectionHint';` to imports.

Find the transaction list render (the `visible.map(tx => ...)` block). Below the table-header row but above the map, add:

```jsx
{visible.length === 0 ? (
  <EmptySectionHint
    message={transactions.length === 0
      ? "No transactions yet. Add one with the + button or import a bank file."
      : "No transactions match the current filter."}
    ctaLabel={transactions.length === 0 ? "ADD TRANSACTION" : null}
    onCta={transactions.length === 0 ? onAdd : null}
  />
) : null}
```

Place this BEFORE `{visible.map(tx => (...))}` so the hint shows when the visible list is empty. The map itself naturally renders nothing when `visible.length === 0`, so no further change needed.

- [ ] **Step 2: Verify and commit**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

```bash
git add src/renderer/screens/web/WebTransactions.jsx
git commit -m "CAR-76: WebTransactions shows empty-state hint"
```

---

## Task 17: Add empty-state hint to mobile Transactions

**Files:**
- Modify: `src/renderer/screens/mobile/Transactions.jsx`

Same approach as Task 16. Add `EmptySectionHint` import. Find the list render, wrap with empty-check:

```jsx
{visible.length === 0 && (
  <EmptySectionHint
    message="No transactions yet. Add one with the + button."
  />
)}
```

(Mobile doesn't have an `onAdd` prop in this screen by default — verify and either add the CTA + plumb the prop, or omit the CTA and let the global `+` button serve.)

- [ ] **Step 1: Apply the change**

(See above)

- [ ] **Step 2: Verify and commit**

```bash
git add src/renderer/screens/mobile/Transactions.jsx
git commit -m "CAR-76: mobile Transactions shows empty-state hint"
```

---

## Task 18: Add empty-state hints to Accounts (web + mobile) and other screens

**Files:**
- Modify: `src/renderer/screens/web/WebAccounts.jsx`
- Modify: `src/renderer/screens/mobile/Accounts.jsx`
- Modify: `src/renderer/screens/web/WebBills.jsx`
- Modify: `src/renderer/screens/web/WebReports.jsx`
- Modify: `src/renderer/screens/web/WebInvestments.jsx`

For each file, follow the same pattern as Tasks 14-17:

1. Add `import EmptySectionHint from '../../components/EmptySectionHint';` to imports.
2. Before the existing list rendering, add a conditional empty-state hint based on the relevant slice:

| File | Empty check | Message | CTA |
|---|---|---|---|
| WebAccounts | `accountsWithBalance.length === 0` | "No accounts yet." | "ADD ACCOUNT" → opens AccountFormModal (already wired in this screen) |
| mobile Accounts | `accountsWithBalance.length === 0` | "No accounts yet." | "ADD ACCOUNT" → opens AccountFormSheet |
| WebBills | `billRows.length === 0` | "No bills yet." | "ADD BILL" → opens RecurringFormSheet (already wired) |
| WebReports | `transactions.length === 0` (for the period) | "No spending data for this period." | (no CTA; user can change period) |
| WebInvestments | `investments.length === 0` | "No holdings yet." | "ADD HOLDING" → opens existing add-holding flow |

- [ ] **Step 1: Apply changes to all 5 files**

Read each file to confirm the existing list-render structure and add the empty-state hint before the `.map()` call. Wire CTAs to whatever existing add-flow each screen uses.

- [ ] **Step 2: Verify**

Run: `npx vite build 2>&1 | Select-String -Pattern "built in|error"` — expect success.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/screens/web/WebAccounts.jsx src/renderer/screens/mobile/Accounts.jsx src/renderer/screens/web/WebBills.jsx src/renderer/screens/web/WebReports.jsx src/renderer/screens/web/WebInvestments.jsx
git commit -m "CAR-76: empty-state hints for Accounts, Bills, Reports, Investments"
```

---

## Task 19: Final verification + PR

**Files:**
- Read-only: every file modified in this plan.

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all `fx.test.mjs` (19) + `sampleData.test.mjs` (~14) pass. Total ~33+ tests, 0 failures.

- [ ] **Step 2: Verify no leftover seed-as-default references**

Run: `rg "useLS\('ledger:tx', TRANSACTIONS\)" src/renderer/store.jsx`
Expected: zero matches.

Run: `rg "useLS\('ledger:accounts', ACCOUNTS\)" src/renderer/store.jsx`
Expected: zero matches.

(Same for budgets/bills/goals/investments/trades/cats.)

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: Vite portion exits 0 (electron-builder packaging may fail on this machine — that's pre-existing, see CAR-154 follow-up if any issues remain).

- [ ] **Step 4: Manual end-to-end smoke test**

Run: `npm run dev`. Test these flows in the browser:

- DevTools → Application → Local Storage → clear all `ledger:*` keys → reload. Welcome modal appears with three buttons.
- Click `Start Fresh` → Welcome dismisses → `<EmptyApp>` renders with three CTAs.
- From `<EmptyApp>`: `+ ADD YOUR FIRST ACCOUNT` → AccountFormModal/Sheet opens → save a checking account → `<EmptyApp>` is replaced by normal layout. Dashboard shows empty-state hints for cash flow / recent transactions, Accounts shows the one account.
- Reset all data via Settings → Welcome modal re-appears.
- From Welcome: `Load Sample Data` → demo content loads, normal layout fully populated.
- From Welcome: `Import a bank file` → ImportExport opens; cancel → `<EmptyApp>` renders.
- Settings → `Load sample data` with non-empty store → confirm modal appears; Cancel preserves data; Reset & Load wipes and reloads.
- Existing-user simulation: pre-populate localStorage, ensure `ledger:welcomeSeen` is unset, reload → no welcome modal, app normal.
- Add-transaction with zero accounts → modal/sheet shows "Add an account first" CTA, tap → AccountForm opens.
- All screens render without console errors when fully empty AND when populated.

Stop the dev server.

- [ ] **Step 5: Update CAR-76 in Linear with verification comment**

```powershell
$envFile = "$env:USERPROFILE\.claude\.env"
foreach ($line in (Get-Content -LiteralPath $envFile)) {
  $t = $line.Trim()
  if ($t -and -not $t.StartsWith('#') -and $t.Contains('=')) {
    $kv = $t -split '=', 2
    [System.Environment]::SetEnvironmentVariable($kv[0], $kv[1].Trim('"'), 'Process')
  }
}
$comment = @'
Implementation complete on branch `car-76-empty-first-run`. Opening PR.

## Verification summary

- ✅ `npm test` — all sampleData.test.mjs + fx.test.mjs tests pass.
- ✅ Store defaults are `[]` / `DEFAULT_CAT_TREE`.
- ✅ Welcome modal appears for fresh installs; doesn't appear for existing users (migration effect).
- ✅ EmptyApp renders when isAppEmpty.
- ✅ Per-screen empty-state hints on Dashboard, Home, Transactions (web+mobile), Accounts (web+mobile), Bills, Reports, Investments.
- ✅ Settings Load Sample Data button refuses on non-empty with confirm-and-reset modal.
- ✅ Add-transaction with no accounts shows Add Account first.
- ✅ Reset wipes data + flips welcomeSeen so welcome reappears.
- ✅ `npm run build` Vite portion succeeds.
'@
$mut = 'mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }'
$vars = @{ id = "CAR-76"; body = $comment }
$body = (@{ query = $mut; variables = $vars } | ConvertTo-Json -Depth 5 -Compress)
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method POST -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | Out-Null
```

- [ ] **Step 6: Move CAR-76 to QA**

```powershell
$mut = 'mutation { issueUpdate(id: "CAR-76", input: { stateId: "14279ed0-2591-4186-bebc-ab2664c83c9f" }) { success } }'
$body = @{ query = $mut } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method POST -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | Out-Null
```

- [ ] **Step 7: Self-review every commit's diff**

Review each commit on this branch. Verify: no stray `console.log`, no commented-out code, indentation matches, all messages prefixed `CAR-76:`. If anything fails self-review, move CAR-76 back to In Progress, fix, re-commit, then move back to QA.

- [ ] **Step 8: Push and open PR**

```bash
git push -u origin HEAD
```

Open PR with `gh pr create --base dev-master --title "CAR-76: empty first-run state + welcome modal" --body-file <prepared-body-file>`. PR body should include:
- Summary
- What is new
- Verification (bulleted list from Step 5)
- Migration impact for existing users
- Out of scope (CAR-77 backup, CAR-89 onboarding wizard)
- Closing tag: `Fixes CAR-76`

- [ ] **Step 9: Dispatch code-reviewer subagent**

Per AGENTS.md flow and the lesson from CAR-75, do NOT skip the pre-merge code review. Use the requesting-code-review skill template, dispatch a `general` subagent against the diff `origin/dev-master..HEAD` of this branch.

If reviewer finds Critical or Important issues:
- Move CAR-76 back to `In Progress`
- Fix
- Re-dispatch reviewer
- Repeat until approved

- [ ] **Step 10: Move CAR-76 to Ready for Testing**

After reviewer approves:

```powershell
$mut = 'mutation { issueUpdate(id: "CAR-76", input: { stateId: "601b0ea6-3ced-49c9-aeaa-613bb00d8b7a" }) { success } }'
$body = @{ query = $mut } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.linear.app/graphql" -Method POST -Headers @{ "Authorization" = $env:LINEAR_API_KEY; "Content-Type" = "application/json" } -Body $body | Out-Null
```

Hand off to user for merge.

---

## Plan complete

After PR merge:
1. Move CAR-76 to **Done**.
2. Begin Phase 3 (CAR-77).
