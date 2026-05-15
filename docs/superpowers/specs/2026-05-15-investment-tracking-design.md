# Investment Tracking — Design Spec

Generated: 2026-05-15

## Overview

Lift `WebInvestments` from a fully static screen to a live one: move holdings and trades into the store (persisted to localStorage), wire the period buttons to a computed portfolio value curve, and add an add/edit panel for holdings and trades.

## Store slice

`store.jsx` gains two new slices, seeded from `data.js` on first load and persisted under `ledger:investments` and `ledger:trades`.

### Holdings shape

```js
{ ticker: string, name: string, shares: number, price: number, chg: number }
```

Seeded from the existing `INVESTMENTS` array in `data.js`. `WebInvestments` imports `investments` from the store instead of `INVESTMENTS` directly.

### Trades shape

```js
{ id: string, ticker: string, shares: number, price: number, date: string, type: 'buy' | 'sell' }
```

A seed `TRADES` array is added to `data.js` — 6–8 historical buy entries for the existing tickers spanning roughly 3 months back, at plausible prices. This gives the performance chart real data to plot.

### Exposed from store

| Name | Type | Description |
|------|------|-------------|
| `investments` | array | Current holdings |
| `trades` | array | All trades |
| `addTrade(trade)` | fn | Appends trade, updates matching holding's `shares` |
| `updateHolding(ticker, fields)` | fn | Merges fields into the matching holding |
| `removeHolding(ticker)` | fn | Removes holding and all its trades |

`addTrade` applies the share delta automatically: `buy` adds shares, `sell` subtracts. If no holding exists for the ticker, `addTrade` creates one (with `chg: 0` until manually set).

## Period performance chart

`WebInvestments.jsx` gains `period` state (same `['1D','1W','1M','3M','1Y','5Y','MAX']` the buttons already render). A `useMemo` keyed on `period` and `trades` builds a 30-point portfolio value array:

1. **Determine window:** same date-window mapping as Dashboard (`1D`=1, `1W`=7, `1M`=30, `3M`=90, `1Y`=365, `5Y`=1825, `MAX`=all).
2. **Build share timeline:** for each of the 30 evenly-spaced points within the window, walk all trades with `date ≤ point` to accumulate `sharesAtPoint[ticker]`.
3. **Compute value:** multiply `sharesAtPoint[ticker]` by `holding.price` for each ticker, sum across tickers → one value per point.
4. **Output:** 30-element array passed to `AsciiSpark`. If the window is shorter than available trades history, earlier points may be 0 (portfolio not yet started) — this is acceptable.

Date labels beneath the sparkline are computed from the window start and end, replacing the current hardcoded `FEB 11 … MAY 11` labels.

The `TODAY · {pct}` delta in the hero is computed as `dayChg / totalPort * 100` from the live `investments` store data — same formula as now, just sourced from store instead of static import.

## Add / edit panel

A slide-in panel (`WebInvestmentSheet`) handles both holding management and trade entry. Triggered by `[+ ADD]` in the `[02] HOLDINGS` header. Editing a holding row or clicking remove opens the same panel.

### Panel modes

**HOLDING mode** (default when opening via `[+ ADD]` or clicking a row):
- Fields: TICKER (text), NAME (text), SHARES (number), PRICE (number), DAY CHG % (number)
- Submit calls `updateHolding` (edit) or adds a new holding directly
- A `[REMOVE]` button (destructive, shown only in edit mode) calls `removeHolding`

**TRADE mode** (toggle at top of panel):
- Fields: TICKER (text, pre-filled if opened from a row), TYPE (BUY / SELL toggle), SHARES (number), PRICE (number), DATE (text, defaults to today `YYYY-MM-DD`)
- Submit calls `addTrade`, which updates the holding's share count automatically
- No remove — trades are append-only

### Trigger points

- `[+ ADD]` button in `[02] HOLDINGS` header → opens panel in HOLDING mode, blank
- Click a holdings row → opens panel in HOLDING mode, pre-filled with that holding's data
- Hover on a holdings row reveals a `[×]` remove affordance (calls `removeHolding` directly, no panel)

### Styling

Matches the existing `WebAddModal` pattern: fixed right-side panel, `width: 360px`, `background: A.bg`, `border-left: 2px solid A.ink`, padding 28px. Fields use the same label/input style as other add modals. No animation required.

## Files changed

| File | Change |
|------|--------|
| `src/renderer/data.js` | Add seed `TRADES` array |
| `src/renderer/store.jsx` | Add `investments` and `trades` slices with actions |
| `src/renderer/screens/web/WebInvestments.jsx` | Wire to store, functional period buttons, add/edit panel |
