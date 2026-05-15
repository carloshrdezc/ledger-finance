# Dashboard Improvements — Design Spec

Generated: 2026-05-15

## Overview

Three additions to `Dashboard.jsx`: a functional period selector that drives cash flow and account deltas from real transaction data, a cash flow summary panel, and a goals progress section.

## Period selector

`Dashboard.jsx` already owns `period` state with `['1D','1W','1M','3M','1Y','MAX']`. A `useMemo` keyed on `period` and `transactions` computes:

**Date window mapping:**
- `1D` → 1 day back
- `1W` → 7 days
- `1M` → 30 days
- `3M` → 90 days
- `1Y` → 365 days
- `MAX` → all transactions (no date filter)

**Outputs from the memo:**
- `{ inflow, outflow, net }` — sum of positive amounts (income) and negative amounts (expenses) within the window, converted to `t.currency` via the existing 1.08 FX rate for non-USD transactions
- `deltaByAcct` — a `Map<acctId, number>` summing transaction amounts per account within the window

**What responds to period:**
- The `30D` label next to the net worth delta becomes a dynamic period label (e.g. `7D`, `30D`, `90D`, `1Y`, `ALL`)
- The accounts table `30D` column header and per-row delta values use `deltaByAcct` instead of the static `a.delta`
- The cash flow panel (new, see below)

**What does not change:**
- The sparkline always shows the fixed `SPARK_NW` 30-point curve
- The sparkline date labels remain unchanged
- The net worth hero value is always current (not period-filtered)

## Cash flow panel

A new `[03] {periodLabel} · CASH FLOW` section is inserted between the sparkline and the two-column grid (above accounts + budgets). Three cells in a horizontal grid — matching the mobile `Home.jsx` layout:

| Cell | Value | Color |
|------|-------|-------|
| IN   | sum of positive-amount transactions in window | `t.accent` |
| OUT  | sum of negative-amount transactions in window (shown as negative) | `A.neg` |
| NET  | inflow + outflow | `A.ink` |

Styled as: `display: grid`, `gridTemplateColumns: repeat(3, 1fr)`, `gap: 1`, `background: A.rule2`, `border: 1px solid A.rule2`. Each cell has `background: A.bg`, `padding: 14px 16px`. Label at 9px muted, value at 18px tabular-nums.

The existing section labels shift: accounts stays `[02]`, budgets becomes `[04]`, upcoming becomes `[05]`, goals is new at `[06]`, recent transactions becomes `[07]`.

## Goals section

A `[06] GOALS` section is appended to the right column of the two-column grid, below `[05] UPCOMING · 7D`. Reads from the existing `GOALS` array imported from `data.js` — no store changes.

Each goal:
```
GOAL NAME                    current / target
████████████░░░░░░░░  (4px bar, t.accent fill)
```

- Label row: `display: flex`, `justifyContent: space-between`, `fontSize: 10`, `letterSpacing: 1`
- Right value: `{current} / {target}` formatted with `fmtMoney(v, t.currency, false)`
- Bar: same pattern as budget bars — 4px height, `A.rule2` background, `t.accent` fill at `(current / target * 100)%`, capped at 100%
- No "over" state (goals can't be overfunded in the current data model)
- No add/edit interaction — display only

## Files changed

- `src/renderer/screens/web/Dashboard.jsx` — all changes are local to this file; no store or data.js modifications needed
