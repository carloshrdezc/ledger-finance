# Settings Page — Design Spec

Generated: 2026-05-14

## Overview

Make the Settings page fully functional on both desktop and mobile. Replace the static/hardcoded preferences panel with live controls, remove the floating `TweaksPanel`, wire up currency and budget start day to the store, and hook up the "Add top-level category" button. All display preferences (accent, density, decimals) and the new currency setting are threaded from `App.jsx` via props. Budget start day is added to the store.

## Store changes

File: `src/renderer/store.jsx`

New field on the store (persisted via `useLS`):

```js
const [budgetStartDay, setBudgetStartDay] = useLS('ledger:budgetStartDay', 1);
```

Exposed on the context value: `budgetStartDay`, `setBudgetStartDay`.

`filterTransactionsForPeriod` and `formatPeriodLabel` in `period.mjs` gain an optional `startDay` parameter (default 1). The store passes `budgetStartDay` when computing `periodTransactions` and `periodLabel`.

## App.jsx changes

`useTweaks()` gains a `currency` / `setCurrency` field (key `ledger:currency`, default `'USD'`):

```js
const [currency, setCurrency] = useLS('ledger:currency', 'USD');
return { accent, setAccent, density, setDensity, decimals, setDecimals, currency, setCurrency };
```

`TweaksPanel` component and its trigger button are deleted from `App.jsx`.

`WebSettings` receives new props: `setAccent`, `setDensity`, `setDecimals`, `setCurrency`.
Mobile `Settings` receives same props plus `setBudgetStartDay`, all threaded from `MobileApp`.

## Desktop — WebSettings

File: `src/renderer/screens/web/WebSettings.jsx`

The static preferences panel is replaced with live controls split into three groups:

### DISPLAY group

| Row | Control |
|-----|---------|
| ACCENT COLOR | 5 small color swatches (from `ACCENTS` array defined in `theme.js` and imported in both `App.jsx` and `WebSettings`). Active swatch has `border: 2px solid A.ink`. Clicking calls `setAccent(color)`. |
| DENSITY | Two toggle buttons: COMFORTABLE / COMPACT. Active state uses filled background. Calls `setDensity(val)`. |
| DECIMALS | Two toggle buttons: SHOW / HIDE. Calls `setDecimals(val)`. |
| CURRENCY | `<select>` with options: USD, EUR, GBP, JPY, CAD, AUD, CHF, MXN. Calls `setCurrency(val)`. |

### BUDGETS group

| Row | Control |
|-----|---------|
| BUDGET · PERIOD · START DAY | Number `<input>` (min 1, max 28). `onBlur` and `onKeyDown Enter` clamp to 1–28 and call `setBudgetStartDay(val)`. |

### DATA group

| Row | Control |
|-----|---------|
| RESET · ALL · DATA | Red-styled button. First click sets local `confirmReset` state to true and shows a red "CLICK AGAIN TO CONFIRM" label. Second click calls `store.reset()` and resets `confirmReset`. Clicking elsewhere (blur / 3s timeout) cancels. |

Category tree section: the `+ ADD · TOP · LEVEL · CATEGORY` div at the bottom gains an `onClick` that sets `adding` state to `''` (the root path sentinel), showing an inline input. On Enter, calls `addCategory([], newName.trim().toUpperCase())`. The existing per-node add flow is unchanged.

## Mobile — Settings

File: `src/renderer/screens/mobile/DetailScreens.jsx` (`Settings` export)

Props added: `setAccent`, `setDensity`, `setDecimals`, `setCurrency`, `setBudgetStartDay`.

The static groups are replaced:

### DISPLAY group (replaces PROFILE)

- **Accent color** — a horizontal row of 5 × 18px color swatches (same `ACCENTS` array from `theme.js`). Active swatch has a 2px border ring. Tapping calls `setAccent(color)`.
- **Density** — row with current value shown right (COMFORTABLE / COMPACT). Tapping cycles the value.
- **Decimals** — row with current value (SHOW / HIDE). Tapping toggles.
- **Currency** — row with current value. Tapping cycles through USD → EUR → GBP → JPY → CAD → AUD → CHF → MXN → USD.

### BUDGETS group (replaces static BUDGETS)

- **BUDGET · PERIOD · START DAY** — row with current value shown right. Tapping shows an inline number input (1–28) in place of the value. Confirming with the checkmark button calls `setBudgetStartDay(val)`.

### DATA group (keep functional rows, replace static ones)

- **CATEGORIES** → navigates to `categories` (unchanged)
- **IMPORT · EXPORT** → opens ImportExport sheet (unchanged)
- **RESET ALL DATA** — red-tinted value text "RESET ▸". First tap changes value to "TAP AGAIN ↩". Second tap calls `store.reset()` and navigates back. Tap elsewhere cancels.

Static SECURITY, ABOUT, and non-functional PROFILE rows are removed.

## Affected files

| File | Change |
|---|---|
| `src/renderer/theme.js` | Add `ACCENTS` array (moved from `App.jsx`) |
| `src/renderer/store.jsx` | Add `budgetStartDay` / `setBudgetStartDay` |
| `src/renderer/period.mjs` | Add optional `startDay` param to `filterTransactionsForPeriod` and `formatPeriodLabel` |
| `src/renderer/App.jsx` | Add `currency`/`setCurrency` to `useTweaks`; remove `TweaksPanel`; thread new props to screens |
| `src/renderer/screens/web/WebSettings.jsx` | Replace static panel with live DISPLAY/BUDGETS/DATA controls; wire top-level category add |
| `src/renderer/screens/mobile/DetailScreens.jsx` | Replace static `Settings` groups with live controls |

## Out of scope

- Notifications / alerts
- Linked institutions
- Security / biometrics
- Automatic rules
- Per-account currency
- Cloud sync
