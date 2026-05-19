# CAR-76 — Empty First-Run State + Demo Data: Design

**Status:** Draft → review
**Date:** 2026-05-19
**Linear:** [CAR-76](https://linear.app/carloshrdezc/issue/CAR-76)

## Summary

Stop seeding demo data into a real user's `localStorage` on first launch. New users get an empty store, a one-time welcome modal with three clear paths (Start Fresh / Load Sample Data / Import Bank File), and meaningful empty-state UI on every screen. Demo data becomes opt-in via an explicit "Load sample data" Settings button.

## Problem

`StoreProvider` currently seeds `localStorage` with `data.js` exports on first launch: 8 fake accounts (CHASE CHECKING, AMEX PLATINUM, ALLY, etc.), 30+ fake transactions, fake goals, fake holdings, fake bills. A real user has to manually delete every fake entry before the app is usable. The seed doubles as a "first-run experience" because the alternative — staring at blank screens with no path forward — is worse.

The fix has two parts that must ship together:

1. **Stop the auto-seed.** New users land in a genuinely empty app.
2. **Replace the seed's accidental "this is what the app does" function with deliberate empty-state UI** — a welcome modal on first launch, plus inline guidance on each screen so the empty state isn't a dead end.

## Goal

A real user gets a clean app on first launch, knows what to do next, and can opt into demo content if they want to explore.

## Decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Empty-by-default vs demo-mode toggle | **B** — Empty by default; demo data is an additive button, no mode concept. |
| 2 | Load demo when data already exists | **B** — Refuse with a confirmation modal; offer "Reset & Load Samples" as the only forward path. |
| 3 | What does Reset do | **A** — Reset wipes everything, period. Re-loading demo is a separate action. |
| 4 | First-launch experience | **B** — Lightweight first-run modal: Start Fresh / Load Sample Data / Import Bank File. CAR-89 covers the full guided onboarding later. |
| 5 | What "Import a bank file" button does | **A** — Opens the existing `<ImportExport>` component. |
| 6 | Empty-state visual style | **B** for whole-app-empty + **A** for partial-empty — composed. |

## Non-goals (separate issues)

- **Full guided onboarding wizard** — covered by CAR-89.
- **Backup / restore** — covered by CAR-77. A user who experiments and wants to recover should have CAR-77 available; CAR-76 alone provides Reset as the recovery path.
- **Visual mark for "this entry came from demo data"** — explicitly out of scope per Q2 decision B. Demo and real are kept exclusive instead of mixed.
- **Onboarding analytics** — out of scope.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  src/renderer/store.jsx                             │
│  ─────────────────────                              │
│  Default values change:                              │
│    useLS('ledger:tx',          [])                  │
│    useLS('ledger:accounts',    [])                  │
│    useLS('ledger:cats',        DEFAULT_CAT_TREE)    │
│    useLS('ledger:budgets',     [])                  │
│    useLS('ledger:bills',       [])                  │
│    useLS('ledger:goals',       [])                  │
│    useLS('ledger:investments', [])                  │
│    useLS('ledger:trades',      [])                  │
│                                                      │
│  + new state:                                        │
│    useLS('ledger:welcomeSeen', false)               │
│                                                      │
│  + new actions:                                      │
│    loadSampleData()  — refuses unless empty         │
│    dismissWelcome()                                 │
│                                                      │
│  + new derived value:                                │
│    isAppEmpty: boolean                              │
│                                                      │
│  reset() change: also flips welcomeSeen → false     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  src/renderer/App.jsx                               │
│  ────────────────────                                │
│  Render gating:                                      │
│    StoreProvider                                     │
│      └── if !welcomeSeen → <Welcome /> overlay     │
│          (always; over MobileApp/DesktopApp)        │
│      └── if isAppEmpty   → <EmptyApp />            │
│          (replaces MobileApp/DesktopApp body)       │
│          else → existing layout                     │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  Per-screen empty-state UI                          │
│  ─────────────────────────                          │
│  Style A (partial-empty): inline guidance + CTA     │
│    in each empty section (Dashboard hero, TX list,  │
│    Accounts, Bills, Reports, etc.)                  │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  Settings — DATA section                            │
│  ──────────────────────────                          │
│  + LOAD SAMPLE DATA button                          │
│    (calls loadSampleData; on LEDGER_NOT_EMPTY       │
│     shows confirm modal with Reset & Load Samples)  │
│  Existing RESET ALL DATA button — unchanged usage,  │
│  but reset() now also flips welcomeSeen.            │
└─────────────────────────────────────────────────────┘
```

### `DEFAULT_CAT_TREE`

For Start Fresh users to be able to add transactions immediately, the category tree starts with the top-level categories only (no children). This is small enough to live next to `CATEGORY_TREE` in `data.js`:

```js
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

`CATEGORY_TREE` (with children) stays alongside as the demo seed used by `loadSampleData()`.

### Storage shape

No localStorage key changes. Only the default values for existing keys, plus one new key:

```
ledger:welcomeSeen   = boolean   (default false)
```

## Components & Data Flow

### `isAppEmpty` derivation

In `StoreProvider`:

```js
const isAppEmpty = (
  txs.length === 0 &&
  accounts.length === 0 &&
  bills.length === 0 &&
  goals.length === 0 &&
  budgets.length === 0 &&
  investments.length === 0 &&
  trades.length === 0
);
```

`categoryTree` is excluded — modifying the tree is not "having data," and the tree always defaults to `DEFAULT_CAT_TREE` rather than `{}`.
`goalContributions` is excluded — downstream of `goals`.

Exposed in the context value alongside the other derived values.

### `<Welcome>` modal

New file: `src/renderer/screens/Welcome.jsx`. Renders only when `welcomeSeen === false`. Overlay-style (full-screen on mobile, centered modal on desktop). Three vertical buttons:

- **START FRESH** — primary visual weight. Calls `dismissWelcome()`. App proceeds to `<EmptyApp>`.
- **LOAD SAMPLE DATA** — secondary. Calls `loadSampleData()` then `dismissWelcome()`. App proceeds to normal layout populated.
- **IMPORT A BANK FILE** — tertiary. Calls `dismissWelcome()` and opens `<ImportExport>`. After import (success or cancel), normal layout takes over based on whether transactions landed.

`Esc` or click-outside is treated as Start Fresh: only `dismissWelcome()` runs. There is no "later" — once seen, it does not reappear unless `reset()` flips the flag.

Visual style follows the existing `<ImportExport>` modal pattern (the same `[01] HEADER` + bordered button stack convention).

### `<EmptyApp>`

New file: `src/renderer/screens/EmptyApp.jsx`. Renders when `welcomeSeen === true && isAppEmpty === true`. Replaces both `MobileApp` and `DesktopApp` bodies. Centered single-column layout. Three CTAs in priority order:

- `+ ADD YOUR FIRST ACCOUNT` (primary) — opens `<AccountFormModal>` on web, `<AccountFormSheet>` on mobile.
- `IMPORT A BANK FILE` (secondary) — opens `<ImportExport>`.
- `LOAD SAMPLE DATA` (tertiary, lighter) — calls `loadSampleData()`. Should never fail here since the precondition is `isAppEmpty`.

Does NOT show the existing top-level navigation (tabs / sidebar). The user has nothing to navigate to until they have data.

### Per-screen partial-empty UI (Style A)

Once any data exists, `MobileApp`/`DesktopApp` render normally. Sections that are individually empty get inline guidance using a consistent pattern:

```jsx
<EmptySectionHint
  message="Cash flow appears once you have transactions."
  ctaLabel="+ ADD TRANSACTION"
  onCta={() => setShowAdd(true)}
/>
```

New file: `src/renderer/components/EmptySectionHint.jsx`. Used by:

| Screen | Section | Message | CTA |
|---|---|---|---|
| Dashboard / Home | NET WORTH hero | "Add your first account to see net worth." | + ADD ACCOUNT |
| Dashboard / Home | CASH FLOW | "Cash flow appears once you have transactions." | + ADD TRANSACTION |
| Dashboard / Home | UPCOMING | "No upcoming bills." | (none — already exists in some form) |
| Dashboard / Home | RECENT TRANSACTIONS | "No recent transactions." | (none) |
| WebTransactions / mobile Transactions | list | "No transactions yet. Add one with the + button or import a bank file." | + ADD TRANSACTION |
| WebAccounts / mobile Accounts | list | "No accounts yet." | + ADD ACCOUNT |
| WebBills | list | "No bills yet." | + ADD BILL |
| WebReports | spending breakdown / charts | "No spending data for this period." | (none) |
| WebInvestments / mobile Investments | list | "No holdings yet." | + ADD HOLDING |

Existing empty-state UI in `WebGoals`, `WebBudgets`, `mobile Budgets`, `mobile Investments`, AlertsHub remains as-is (these files are NOT in the Files Touched table — no change needed). Where useful, those screens could migrate to use `<EmptySectionHint>` for visual consistency in a future polish pass, but that is out of scope for CAR-76.

### `loadSampleData` action

```js
const loadSampleData = React.useCallback(() => {
  if (!isAppEmpty) {
    throw new Error('LEDGER_NOT_EMPTY');
  }
  setTxs(TRANSACTIONS);
  setAccounts(ACCOUNTS);
  setBudgets(BUDGETS);
  setBills(BILLS);
  setGoals(GOALS);
  setInvestments(INVESTMENTS);
  setTrades(TRADES);
  // Only seed the full tree if the user hasn't customized.
  setCatTree(prev => isDefaultCatTree(prev) ? CATEGORY_TREE : prev);
}, [isAppEmpty, ...setters]);

function isDefaultCatTree(tree) {
  // Equality check against DEFAULT_CAT_TREE keys + lack of children.
  const defaultKeys = Object.keys(DEFAULT_CAT_TREE);
  const treeKeys = Object.keys(tree);
  if (treeKeys.length !== defaultKeys.length) return false;
  return defaultKeys.every(k =>
    tree[k] && !tree[k].children
  );
}
```

The Settings "Load sample data" button calls this in a try/catch:

```js
try {
  loadSampleData();
} catch (err) {
  if (err.message === 'LEDGER_NOT_EMPTY') {
    setShowResetAndLoadModal(true);
  }
}
```

The confirmation modal (`<ResetAndLoadModal>` or inline JSX in WebSettings/mobile Settings):

> Your data isn't empty. Loading sample data would mix real and demo entries. Reset to empty first, then load samples?
>
> `[Cancel]   [Reset & Load Samples]`

`Reset & Load Samples` calls `reset()` then `loadSampleData()` sequentially.

### `reset()` change

```js
const reset = React.useCallback(() => {
  // ... all existing wipes ...
  setWelcomeSeen(false);
}, [...existing deps, setWelcomeSeen]);
```

Effect: after Reset, the welcome modal re-appears on next render (since `welcomeSeen === false`). The user effectively gets a fresh first-launch experience. Useful when handing the device to someone else or starting over.

### Add-transaction flow with zero accounts

Today the existing `<AddSheet>` / `<WebAddModal>` shows a transfer/expense/income picker, then an account selector that's empty if no accounts exist — leaving the user stuck.

Fix in this phase: at the top of those modals, when `accounts.length === 0`, replace the form with:

> No accounts yet. Add one to start tracking.
>
> `[ + ADD ACCOUNT ]`

Tapping the button closes the add-transaction modal and opens `<AccountFormSheet>`/`<AccountFormModal>`. Once the account is saved, the user can re-trigger the `+` button. (We don't auto-bounce back into add-transaction — that's a chained-modal UX that often surprises users.)

### Migration for existing users

In `StoreProvider`'s mount-effect, alongside the existing `migrateTransactions` and `migrateBills`:

```js
React.useEffect(() => {
  // One-time: existing users with non-empty data should not see the welcome modal.
  // Read the slices directly from state (which `useLS` already loaded synchronously
  // from localStorage) — do NOT depend on the derived `isAppEmpty` value, since
  // that's defined later in the component and we want this effect to run with
  // empty deps for one-time semantics.
  const empty = (
    txs.length === 0 &&
    accounts.length === 0 &&
    bills.length === 0 &&
    goals.length === 0 &&
    budgets.length === 0 &&
    investments.length === 0 &&
    trades.length === 0
  );
  if (!welcomeSeen && !empty) {
    setWelcomeSeen(true);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // run once on mount; reading initial values is intentional
```

This makes the upgrade silent for existing users. Brand-new users (or post-Reset users) see the welcome.
```

This makes the upgrade silent for existing users. Brand-new users (or post-Reset users) see the welcome.

## Files Touched

| File | Status | Purpose |
|---|---|---|
| `src/renderer/store.jsx` | MODIFY | Default values → `[]`/`{}`/`DEFAULT_CAT_TREE`; `welcomeSeen` state; `loadSampleData`, `dismissWelcome` actions; `isAppEmpty` derivation; `reset()` flips welcomeSeen; migration effect |
| `src/renderer/data.js` | MODIFY | Add `DEFAULT_CAT_TREE` export. `CATEGORY_TREE`, `TRANSACTIONS`, `ACCOUNTS`, etc. unchanged in shape — comment to mark them as "demo content, accessed via store.loadSampleData" |
| `src/renderer/screens/Welcome.jsx` | NEW | First-launch modal |
| `src/renderer/screens/EmptyApp.jsx` | NEW | Whole-app-empty welcome screen |
| `src/renderer/components/EmptySectionHint.jsx` | NEW | Shared per-section empty UI |
| `src/renderer/sampleData.mjs` | NEW | Pure helpers: `isAppEmptyFor(state)`, `isDefaultCatTreeFor(tree)`. Lives outside store for testability |
| `src/renderer/sampleData.test.mjs` | NEW | Vitest tests for the pure helpers |
| `src/renderer/App.jsx` | MODIFY | Render `<Welcome>` overlay; render `<EmptyApp>` when `isAppEmpty` |
| `src/renderer/screens/web/Dashboard.jsx` | MODIFY | Empty hero + cash flow + recent transactions guidance |
| `src/renderer/screens/mobile/Home.jsx` | MODIFY | Same |
| `src/renderer/screens/web/WebTransactions.jsx` | MODIFY | Empty list guidance |
| `src/renderer/screens/mobile/Transactions.jsx` | MODIFY | Same |
| `src/renderer/screens/web/WebAccounts.jsx` | MODIFY | Empty list guidance |
| `src/renderer/screens/mobile/Accounts.jsx` | MODIFY | Same |
| `src/renderer/screens/web/WebBills.jsx` | MODIFY | Empty list guidance |
| `src/renderer/screens/web/WebReports.jsx` | MODIFY | Empty period guidance |
| `src/renderer/screens/web/WebInvestments.jsx` | MODIFY | Empty list guidance (if not already covered) |
| `src/renderer/screens/web/WebSettings.jsx` | MODIFY | + LOAD SAMPLE DATA button + reset-and-load confirm modal |
| `src/renderer/screens/mobile/DetailScreens.jsx` (Settings export) | MODIFY | Same |
| `src/renderer/screens/web/WebAddModal.jsx` | MODIFY | "Add an account first" branch when `accounts.length === 0` |
| `src/renderer/screens/mobile/AddSheet.jsx` | MODIFY | Same |

## Error Handling and Edge Cases

| Case | Behavior |
|---|---|
| Load sample data with non-empty store | `loadSampleData()` throws `'LEDGER_NOT_EMPTY'`. Settings catches, shows confirm modal with `Cancel` and `Reset & Load Samples`. |
| Load sample data with empty store but customized `categoryTree` | Sample data loads; the customized tree is preserved (helper `isDefaultCatTree` returns false → setCatTree no-ops on the tree). Seed transactions still load and reference standard category keys; if those keys aren't in the customized tree, breadcrumbs show raw IDs. Acceptable for demo. |
| Dismiss welcome with `Esc` or `X` | Treated as Start Fresh: `dismissWelcome()` only. |
| Import button → user cancels picker | `<ImportExport>` closes; store stays empty; `<EmptyApp>` renders. |
| Import succeeds but produces zero transactions | Same as cancel. |
| Reset on a non-Settings screen | `reset()` clears state and flips `welcomeSeen = false`. Welcome re-appears on next render. |
| Add-transaction with zero accounts | Modal/sheet shows "Add an account first" CTA; tapping opens AccountFormSheet/Modal. |
| Existing user, non-empty localStorage, `welcomeSeen` unset | Mount-effect sets `welcomeSeen = true` immediately. They never see the welcome. |
| Existing user with empty localStorage | Welcome modal appears once. Acceptable. |
| User wipes localStorage via DevTools | Next launch: welcomeSeen defaults to false, isAppEmpty true → welcome modal appears. Same as new user. |
| Welcome flicker on first-paint | `useLS` reads localStorage synchronously in its `useState` initializer, so `welcomeSeen` is correct on first render. No flicker. |
| `categoryTree` ends up `{}` somehow | `useLS('ledger:cats', DEFAULT_CAT_TREE)` ensures it can't start as `{}`. If user removes every category via the editor (a separate concern), they'd be unable to add transactions. Existing edge case, not regressed by this issue. |
| `loadSampleData` race: user clicks Settings button twice rapidly | Second call: by then `isAppEmpty === false` (after first batch of setters), throws `LEDGER_NOT_EMPTY`. Confirmation modal pops up over the populated app — slightly weird but not broken. Acceptable. |
| User reads URL parameters or other "advanced" routes during welcome | The welcome overlay blocks any underlying interaction by virtue of the existing modal-style overlay (z-index above everything). |

## Testing

Tests for pure helpers in `sampleData.mjs` via Vitest:

- `isAppEmptyFor({ txs: [], accounts: [], ... })` → `true`.
- `isAppEmptyFor({ txs: [], accounts: [{...}], ... })` → `false`.
- `isAppEmptyFor` ignores `categoryTree` and `goalContributions` (state with non-empty tree but empty everything else → still `true`).
- `isDefaultCatTreeFor(DEFAULT_CAT_TREE)` → `true`.
- `isDefaultCatTreeFor(CATEGORY_TREE)` → `false` (has children).
- `isDefaultCatTreeFor({})` → `false`.
- `isDefaultCatTreeFor({ ...DEFAULT_CAT_TREE, custom: { label: 'X' } })` → `false`.

Component-level tests defer to CAR-90.

## Manual Verification

After implementation:

- Fresh install (`localStorage.clear()` then reload) shows welcome modal with three buttons.
- `Start Fresh` → modal disappears, `<EmptyApp>` renders, three CTAs visible.
- From `<EmptyApp>`, `+ ADD YOUR FIRST ACCOUNT` → AccountForm opens, save → app transitions to normal layout, populated sections render normally, empty sections show inline guidance.
- Reset all data → welcome modal re-appears.
- Welcome → `Load sample data` → demo content loads, normal layout renders fully populated.
- Welcome → `Import bank file` → ImportExport opens; cancel → `<EmptyApp>` renders.
- Welcome → `Import bank file` → ImportExport opens; import succeeds → transactions land, normal layout.
- Settings → Load sample data with non-empty store → confirm modal; Cancel preserves data; Reset & Load Samples wipes and reloads.
- Existing-user simulation: pre-populate localStorage with sample data, set `welcomeSeen` unset, reload → no welcome modal, app renders normally.
- Add-transaction with zero accounts → "Add an account first" CTA, tap → AccountForm opens.
- All 11+ screens render without console errors in the fully-empty state.
- All 11+ screens render normally with seed data loaded.

## Acceptance Criteria

- [ ] Fresh `localStorage` produces an app with zero accounts, zero transactions, zero bills, zero goals, zero investments, zero trades, zero budgets, and the minimal `DEFAULT_CAT_TREE`.
- [ ] First launch shows the welcome modal with three buttons.
- [ ] Welcome modal does not reappear after dismissal (until Reset).
- [ ] `<EmptyApp>` renders when the app is fully empty post-welcome.
- [ ] Each main screen has empty-state UI (inline guidance + CTA where appropriate); no screen renders a "structure with zeros" anymore.
- [ ] Settings → Load sample data → if empty, populates demo content; if not empty, shows confirm modal with Reset & Load Samples option.
- [ ] Reset all data wipes everything AND flips `welcomeSeen = false` so the welcome modal re-appears.
- [ ] Existing users on first upgrade do NOT see the welcome modal (mount-effect sets `welcomeSeen = true` for non-empty stores).
- [ ] Add-transaction modal/sheet handles zero-accounts case with a clear "Add an account first" CTA.
- [ ] `npm test` runs Vitest with passing `sampleData.test.mjs` tests.

## Dependencies and Sequencing

- **Depends on:** none.
- **Unblocks:** CAR-77 (full-state backup/restore — once users have real data instead of seeded demo data, backups become the recovery mechanism), CAR-89 (proper guided onboarding builds on top of `<EmptyApp>` and the welcome modal).
- **Pairs with:** CAR-77. Recommendation: ship CAR-77 close after CAR-76 so users who experiment have a recovery path.

## Visual Design

**Whole-app-empty (`<EmptyApp>`):** Style B from the visual companion — centered single-column, three vertical CTAs, no top-level navigation visible. Same on web and mobile, just different padding.

**Welcome modal (`<Welcome>`):** Existing `<ImportExport>` modal pattern (header bar, button stack, dark overlay). Three vertical buttons with a small `X` to close.

**Per-section empty (`<EmptySectionHint>`):** Style A — keeps existing section header, replaces the would-be data area with one short sentence + 1-2 CTAs in the existing button styling.

All visual elements use `theme.js` tokens — no hardcoded hex.
