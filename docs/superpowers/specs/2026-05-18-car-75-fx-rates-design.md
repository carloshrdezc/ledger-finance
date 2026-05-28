# CAR-75 — Real FX Rates: Design

**Status:** Draft → review
**Date:** 2026-05-18
**Linear:** [CAR-75](https://linear.app/carloshrdezc/issue/CAR-75)
**Supersedes:** none. (See CAR-93 for the separate currency-symbol formatting issue.)

## Summary

Replace the hardcoded `EUR_TO_USD = 1.08` constant scattered across 8+ files with a real FX-rate system. Rates are user-editable in Settings, stored as ratios to USD, and used by every aggregation that crosses currencies. v1 is manual-entry only; an online-fetch follow-up will be tracked separately.

## Problem

The same magic number `1.08` appears at least 26 times across the renderer to convert EUR amounts to USD for aggregations (net worth, cash flow, totals). This is a real correctness bug: every non-USD account silently shows the wrong value in net worth, cash flow, dashboard, reports, and accounts screens, and there is no way for the user to update the rate.

Verified call sites (via grep):

- `src/renderer/period.mjs` — `EUR_TO_USD = 1.08`
- `src/renderer/charts.mjs` — `EUR_TO_USD = 1.08`
- `src/renderer/screens/web/Dashboard.jsx` — 3 occurrences
- `src/renderer/screens/web/WebReports.jsx` — 1 occurrence
- `src/renderer/screens/web/WebAccounts.jsx` — 1 occurrence
- `src/renderer/screens/mobile/Home.jsx` — 5 occurrences
- `src/renderer/screens/mobile/Accounts.jsx` — 2 occurrences
- `src/renderer/screens/mobile/DetailScreens.jsx` — 8 occurrences

## Goal

There is exactly **one** path from `(amount, ccy) → reportingCurrency`. Every magic `1.08` is gone. The user can maintain rates in Settings.

## Non-goals (in scope of separate issues)

- **Online rate fetching** — follow-up issue to be created at end of this phase.
- **Effective-date / historical rates** — follow-up issue to be created at end of this phase. v1 uses today's rate for all historical aggregations (matches current `1.08` behavior; strictly an improvement).
- **Per-transaction currency override** — out of scope.
- **Currency-symbol formatting** — separate, see [CAR-93](https://linear.app/carloshrdezc/issue/CAR-93).
- **Locale-specific number formatting** — out of scope.

## Decisions (from brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | How does the user enter rates? | Manual only in v1. Follow-up issue for online fetch. |
| 2 | What is the reporting currency? | `t.currency` from Settings is the unambiguous reporting currency. |
| 3 | How are rates stored? | As ratios to USD (1 USD = N units of currency X). USD always 1.0. |
| 4 | Where do rates come from on first run? | Auto-seed sensible defaults. New currencies auto-create rate=1.0 placeholder + alert. |
| 5 | Where does conversion live? | Pure functions in `fx.mjs` + `useFx()` hook for React. |
| 6 | What does the Settings UI look like? | Inline FX Rates section in existing Settings screen, web + mobile. |
| 7 | Historical accuracy? | Today's rate for everything in v1. Follow-up issue for effective-date rates. |
| 8 | Migration? | Auto-seed defaults silently. One-time toast only when user has non-USD data. |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  src/renderer/fx.mjs           (pure, no React)     │
│  ─────────────────────────────                      │
│  DEFAULT_RATES = { USD:1, EUR:0.921, GBP:0.787,     │
│                     JPY:149.5, CAD:1.35, AUD:1.51,  │
│                     CHF:0.885, MXN:17.2 }           │
│                                                      │
│  toReportingCurrency(amt, ccy, rates, reportingCcy) │
│    → number                                          │
│  convertBetween(amt, fromCcy, toCcy, rates)         │
│    → number                                          │
│  formatRate(ccy, rate) → "1 USD = 0.921 EUR"        │
└─────────────────────────────────────────────────────┘
                       ▲
                       │ imports
┌──────────────────────┴──────────────────────────────┐
│  src/renderer/store.jsx                             │
│  ─────────────────────                              │
│  rates:        useLS('ledger:fxRates', DEFAULT_RATES)│
│  ratesUpdated: useLS('ledger:fxRatesUpdated', {})   │
│  Exposed:                                            │
│    rates, ratesUpdated,                             │
│    setRate(ccy, rate),                              │
│    removeRate(ccy),                                 │
│    resetRates()                                     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  src/renderer/useFx.js                              │
│  ──────────────────────                             │
│  useFx() returns {                                   │
│    rates, reportingCcy, ratesUpdated,               │
│    toReporting(amt, ccy),                           │
│    fmtReporting(amt, ccy, decimals),                │
│  }                                                   │
└─────────────────────────────────────────────────────┘
                       ▲
                       │ used by
┌──────────────────────┴──────────────────────────────┐
│  Every screen that aggregates across currencies     │
│  (Dashboard, Home, Accounts, Reports, etc.)         │
│  charts.mjs and period.mjs use pure fx.mjs directly │
└─────────────────────────────────────────────────────┘
```

### Storage shape

```js
// localStorage key: ledger:fxRates
{
  USD: 1.0,
  EUR: 0.921,
  GBP: 0.787,
  JPY: 149.5,
  CAD: 1.35,
  AUD: 1.51,
  CHF: 0.885,
  MXN: 17.2,
}

// localStorage key: ledger:fxRatesUpdated
{
  USD: null,            // base, never edited
  EUR: '2026-05-18',    // ISO date, set by setRate
  GBP: null,            // null = default seed, never edited
  ...
}
```

### Invariants

- `rates.USD === 1.0` always. `setRate('USD', anything)` is a no-op.
- Every currency present in any account's `ccy` must have an entry in `rates` (auto-created on `addAccount`).
- `ratesUpdated[ccy] === null` means "currently the default seed; never edited by user."

## Components & Data Flow

### Aggregation example (Dashboard net worth)

Before:
```jsx
const NET_WORTH = accountsIncludedInTotals.reduce(
  (s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08),
  0,
);
```

After:
```jsx
const { toReporting } = useFx();
const NET_WORTH = accountsIncludedInTotals.reduce(
  (s, a) => s + toReporting(a.balance, a.ccy),
  0,
);
```

### `toReporting(amt, ccy)` algorithm

1. If `ccy === reportingCcy`, return `amt` (short-circuit, no rounding error).
2. `usdAmount = amt / rates[ccy]`.
3. If `reportingCcy === 'USD'`, return `usdAmount`.
4. Return `usdAmount * rates[reportingCcy]`.
5. If any required rate is missing or invalid (≤0, NaN), return `amt` and `console.warn`.

### Settings UI

New section in both `WebSettings.jsx` and the mobile `Settings` (currently in `DetailScreens.jsx`):

```
─── FX RATES ─────────────────────────
 1 USD = 1.000 USD                base
 1 USD = 0.921 EUR    2026-05-18  ✎
 1 USD = 0.787 GBP    DEFAULT     ✎
 1 USD = 149.50 JPY   DEFAULT     ✎
 [+ ADD CURRENCY]   [RESET DEFAULTS]
```

- USD row has no edit affordance.
- `lastUpdated === null` displays as `DEFAULT`.
- `lastUpdated` set displays as ISO date.
- Edit → inline numeric input → save calls `setRate(ccy, value)` which sets `ratesUpdated[ccy] = today`.
- `+ ADD CURRENCY` shows a picker of currencies in `CCY_SYM` not yet in `rates`.
- `RESET DEFAULTS` confirms via modal, then resets both `rates` and `ratesUpdated`.

### Add-account flow

```
addAccount(acct)
  ├─ if acct.ccy !== 'USD' && !rates[acct.ccy]:
  │    setRate(acct.ccy, 1.0, lastUpdated: null)
  │    (alerts.mjs detector picks it up automatically)
  └─ existing addAccount logic
```

### Alerts integration

`alerts.mjs` gains `detectMissingFxRates(rates, ratesUpdated, accounts, transactions)`:

- Find every `ccy` used in any non-USD account or transaction.
- If `rates[ccy] === 1.0 && ratesUpdated[ccy] === null` AND `ccy !== 'USD'`, emit alert:
  - `severity: 'medium'`
  - `title: 'Set FX rate for ${ccy}'`
  - `route: 'settings'` (with optional anchor to `#fx-rates` for future)

### Migration alert (no toast system exists)

There is no toast system in the codebase today. The "migration notification" reuses the existing `alerts.mjs` infrastructure rather than building a new one:

In `StoreProvider`'s mount effect:

```js
// One-time migration marker
const seen = localStorage.getItem('ledger:fxMigrationToastSeen');
if (!seen && hasNonUsdData(accounts, txs)) {
  // Inject a one-time alert into the alerts pipeline; it appears in
  // Dashboard's PRIORITY ALERTS and the AlertsHub. Severity: low.
  // Dismissing it (existing alert dismiss flow) sets the flag.
  localStorage.setItem('ledger:fxMigrationToastSeen', '1');
}
```

The alert detector `detectFxMigrationNotice` returns:

- `id: 'fx-migration-notice'`
- `severity: 'low'`
- `title: 'FX rates are now configurable'`
- `detail: 'Set your own rates in Settings'`
- `route: 'settings'`

Once dismissed (existing dismiss-alert flow), it never reappears. This piggybacks on the existing alert UX rather than introducing a new toast surface — keeps scope tight.

## Files Touched

| File | Change |
|---|---|
| `src/renderer/fx.mjs` | NEW — pure functions + `DEFAULT_RATES` |
| `src/renderer/useFx.js` | NEW — hook wrapping `fx.mjs` with store-bound rates |
| `src/renderer/store.jsx` | + `rates`, `ratesUpdated`, `setRate`, `removeRate`, `resetRates`; auto-seed missing rate on `addAccount`; migration toast trigger |
| `src/renderer/period.mjs` | replace `EUR_TO_USD = 1.08` and `convertToUSD` with `fx.mjs` calls (rates passed as arg) |
| `src/renderer/charts.mjs` | replace local `EUR_TO_USD = 1.08` with `fx.mjs` calls |
| `src/renderer/alerts.mjs` | add `detectMissingFxRates` detector |
| `src/renderer/screens/web/Dashboard.jsx` | replace 3× ternaries with `toReporting` |
| `src/renderer/screens/web/WebReports.jsx` | replace 1× ternary |
| `src/renderer/screens/web/WebAccounts.jsx` | replace 1× ternary |
| `src/renderer/screens/mobile/Home.jsx` | replace 5× ternaries |
| `src/renderer/screens/mobile/Accounts.jsx` | replace 2× ternaries |
| `src/renderer/screens/mobile/DetailScreens.jsx` | replace 8× ternaries |
| `src/renderer/screens/web/WebSettings.jsx` | + `<FxRatesSection>` |
| `src/renderer/screens/mobile/DetailScreens.jsx` (Settings part) | + `<FxRatesSection>` |
| `src/renderer/components/FxRatesSection.jsx` | NEW — shared component, web + mobile |
| `src/renderer/fx.test.mjs` | NEW — Vitest tests for pure helpers |
| `package.json` | + `vitest` devDep, `"test": "vitest"` script |
| `vitest.config.mjs` | NEW — minimal Vitest config |

**NOT changing:**
- `tx.ccy`, `acct.ccy` storage shape — currencies stay attached to data.
- `fmtMoney` / `fmtSigned` — they still take a `ccy` and format that currency. Conversion happens *before* formatting at the call site.
- `t.currency` setting — unchanged; just becomes an authoritative input to `useFx()`.

## Error Handling and Edge Cases

| Case | Behavior |
|---|---|
| Rate is `0` | `setRate` rejects with inline error "Rate must be > 0". Read path returns input unchanged + warns if rate is `0`/NaN/negative. |
| Rate missing for currency in use | `toReporting` returns input unchanged + console warn. `detectMissingFxRates` surfaces alert. |
| User edits USD rate | Edit affordance hidden. `setRate('USD', x)` is a no-op. |
| Delete currency still in use | `removeRate` blocks: "Currency X is in use; archive those accounts first." |
| `t.currency` set to a rate-less currency | Falls back to USD as reporting currency + console warn. (Unreachable in practice — Settings only offers currencies in `CCY_SYM`/`DEFAULT_RATES`.) |
| `ccy === reportingCcy` | Short-circuit, no math. |
| Import introduces new currency on transaction | `detectMissingFxRates` extended to scan transactions, not just accounts; alert appears. |
| Migration: existing user with USD reporting + EUR data | Auto-seed runs once. EUR rate goes from implicit `1/1.08 = 0.926` to default seed `0.921`. Net worth shifts ~0.5%. Toast explains. |
| Migration: user with USD-only data | Silent. No toast. |
| Reset to defaults | Modal confirm. Wipes both `rates` and `ratesUpdated` to seed values. |

## Testing

CAR-75 ships with Vitest bootstrapped (minimum install) and tests for `fx.mjs` only. CAR-90 (test suite) then expands coverage to other modules and adds CI.

Test cases for `fx.mjs`:

- USD → USD returns input unchanged (no rate lookup).
- EUR → USD with rate 0.921 returns `amt / 0.921`.
- USD → EUR returns `amt * 0.921`.
- EUR → GBP with rates `{EUR: 0.921, GBP: 0.787}` returns `amt / 0.921 * 0.787`.
- Missing rate returns input unchanged + warns.
- Zero rate falls back / warns.
- Negative rate falls back / warns.
- NaN rate falls back / warns.
- Round-trip `USD → EUR → USD` recovers within float epsilon.
- `formatRate` produces expected human strings.

## Manual Verification

- `rg "\* 1\.08"` on `src/renderer` returns zero matches (no multiplication by the magic constant).
- `rg "ccy === 'USD' \? .* : .* \* 1\.08"` returns zero matches.
- The digit string `1.08` may appear in `fx.mjs` as a default seed value or in inline test data; that is intentional and acceptable. What's not acceptable is a multiplication operator next to it.
- Setting EUR rate to `1.0` in Settings makes Dashboard net worth equal sum of raw balances.
- Setting EUR rate to `0.5` halves the EUR contribution to net worth.
- Adding an account in a never-seen currency surfaces the missing-rate alert within one render.
- Setting `t.currency = 'EUR'` makes Dashboard net worth render in EUR and shift by the inverse factor.
- Restart the app after editing a rate; the edit persists.

## Acceptance Criteria

(Replaces and clarifies the criteria in CAR-75.)

- [ ] `fx.mjs` exists with `DEFAULT_RATES`, `toReportingCurrency`, `convertBetween`, `formatRate`.
- [ ] `useFx()` hook exists and is used by every screen that does cross-currency aggregation.
- [ ] `rg "\* 1\.08"` returns zero matches across `src/renderer`.
- [ ] `rg "EUR_TO_USD"` returns zero matches except inside `fx.mjs`.
- [ ] Net worth, cash flow, reports, account totals all use `toReporting` from `useFx()`.
- [ ] Settings shows FX Rates section listing every rate, with last-updated indicator and edit affordance.
- [ ] Editing a rate immediately updates every aggregation in the app.
- [ ] Adding an account with a brand-new currency creates a rate=1.0 placeholder and surfaces a missing-rate alert.
- [ ] First boot of new version with non-USD data injects a one-time low-severity migration alert; dismissing it persists.
- [ ] First boot of new version with USD-only data is silent (no migration alert).
- [ ] `npm test` runs Vitest with passing `fx.mjs` tests.
- [ ] Acceptance criteria in CAR-75 amended to match (the original "no `1.08` literal anywhere" target is clarified to "no `1.08` in conversion math").

## Dependencies and Sequencing

- **Depends on:** none.
- **Unblocks:** CAR-93 (currency symbols can layer on top), all aggregation correctness work, accurate net-worth attribution (CAR-87), accurate forecasts (CAR-84).
- **Pairs with:** none required, but CAR-90 (test suite) is strictly easier after CAR-75 ships Vitest.

## Follow-up Issues to Create After This Phase

1. **Online FX rate fetching** — "Fetch latest rates" button in Settings using a free no-key API. Builds on this issue's manual-entry foundation.
2. **Effective-date FX rates** — Time-series rate table where historical aggregations use the rate effective on that transaction's date.
