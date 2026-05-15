# Dashboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional period selector driving cash flow and account deltas from real transaction data, a cash flow summary panel, and a goals progress section to the web Dashboard.

**Architecture:** All changes are local to `Dashboard.jsx`. A `windowStart` helper and `useMemo` derive `{ inflow, outflow, net, deltaByAcct }` from the store's `transactions` array filtered by the selected period. Two new JSX blocks render the cash flow panel and goals strip. `goals` already lives in the store — no store or data.js changes needed.

**Tech Stack:** React 19 hooks, inline styles via `theme.js` tokens, existing `useStore` hook, existing `fmtMoney`/`fmtSigned`/`fmtPct` formatters.

---

### Task 1: Add period window helper and cash flow memo

**Files:**
- Modify: `src/renderer/screens/web/Dashboard.jsx`

- [ ] **Step 1: Add `PERIOD_DAYS`, `PERIOD_LABEL`, and `windowStart` above the component**

In `Dashboard.jsx`, immediately before `export default function Dashboard(...)`, add:

```js
const PERIOD_DAYS  = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };
const PERIOD_LABEL = { '1D': '1D', '1W': '7D', '1M': '30D', '3M': '90D', '1Y': '1Y', 'MAX': 'ALL' };

function windowStart(period) {
  if (period === 'MAX') return null;
  const d = new Date();
  d.setDate(d.getDate() - PERIOD_DAYS[period]);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Pull `goals` from the store and add the cash flow memo inside the component**

The store already exposes `goals`. Update the `useStore` destructure (currently line 13) and add the memo after the existing `const todayLabel = ...` line:

```js
// Line 13 — add goals to the destructure:
const { transactions, budgetRows, accountsWithBalance, periodLabel, billRows, goals } = useStore();

// After `const todayLabel = ...`, add:
const { inflow, outflow, net, deltaByAcct } = React.useMemo(() => {
  const cutoff = windowStart(period);
  const filtered = cutoff ? transactions.filter(tx => tx.date >= cutoff) : transactions;
  let inflow = 0, outflow = 0;
  const deltaByAcct = new Map();
  for (const tx of filtered) {
    const usd = tx.ccy === 'USD' ? tx.amt : tx.amt * 1.08;
    if (usd > 0) inflow += usd;
    else outflow += usd;
    deltaByAcct.set(tx.acct, (deltaByAcct.get(tx.acct) ?? 0) + usd);
  }
  return { inflow, outflow, net: inflow + outflow, deltaByAcct };
}, [period, transactions]);
```

- [ ] **Step 3: Verify the app still loads**

Run: `npm run dev`
Expected: Browser loads without console errors. Dashboard looks identical — the memo runs but nothing reads from it yet.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/screens/web/Dashboard.jsx
git commit -m "feat(dashboard): add period window helper and cash flow memo"
```

---

### Task 2: Wire period selector to hero label and account deltas

**Files:**
- Modify: `src/renderer/screens/web/Dashboard.jsx`

- [ ] **Step 1: Update the hero period label**

Find this line in the hero section (around line 37):
```jsx
<span style={{ color: A.muted, marginLeft: 12 }}>30D</span>
```
Replace with:
```jsx
<span style={{ color: A.muted, marginLeft: 12 }}>{PERIOD_LABEL[period]}</span>
```

- [ ] **Step 2: Update the accounts table column header**

Find the accounts table header (around line 70):
```jsx
<div style={{ textAlign: 'right' }}>30D</div>
```
Replace with:
```jsx
<div style={{ textAlign: 'right' }}>{PERIOD_LABEL[period]}</div>
```

- [ ] **Step 3: Update the accounts table rows to use `deltaByAcct`**

Replace the `{accountsWithBalance.map(a => (` block (around lines 72–80) with:

```jsx
{accountsWithBalance.map(a => {
  const acctDelta = deltaByAcct.get(a.id) ?? a.delta;
  return (
    <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 80px 110px 80px', padding: t.density === 'compact' ? '7px 0' : '10px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8 }}>{a.type}</div>
      <div>{a.name}</div>
      <div style={{ color: A.muted, fontSize: 10 }}>{a.code}</div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? A.neg : A.ink }}>{fmtMoney(a.balance, a.ccy, t.decimals)}</div>
      <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: acctDelta < 0 ? A.neg : t.accent, fontSize: 10 }}>{fmtSigned(acctDelta, a.ccy, t.decimals)}</div>
    </div>
  );
})}
```

- [ ] **Step 4: Verify period selection changes account deltas**

Run: `npm run dev`, open Dashboard, click `1W` → `3M` → `MAX`. The rightmost delta column values should change. The sparkline stays fixed (expected).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/screens/web/Dashboard.jsx
git commit -m "feat(dashboard): wire period selector to account deltas"
```

---

### Task 3: Add cash flow panel

**Files:**
- Modify: `src/renderer/screens/web/Dashboard.jsx`

- [ ] **Step 1: Insert cash flow panel between sparkline and two-column grid**

Find the comment `{/* Two columns */}` (around line 61). Insert the following block immediately before it:

```jsx
{/* Cash flow */}
<div style={{ marginTop: 20, marginBottom: 8 }}>
  <ALabel>[03] {PERIOD_LABEL[period]} · CASH FLOW</ALabel>
  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2 }}>
    {[
      { l: 'IN',  v: inflow,  c: t.accent },
      { l: 'OUT', v: outflow, c: A.neg    },
      { l: 'NET', v: net,     c: A.ink    },
    ].map(x => (
      <div key={x.l} style={{ background: A.bg, padding: '14px 16px' }}>
        <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{x.l}</div>
        <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: x.c, marginTop: 6 }}>
          {fmtSigned(x.v, t.currency, t.decimals)}
        </div>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Update section labels that shift due to the new [03]**

Budgets was `[03]`, becomes `[04]`:
```jsx
// Find:
<ALabel>[03] {periodLabel} · BUDGETS</ALabel>
// Replace with:
<ALabel>[04] {periodLabel} · BUDGETS</ALabel>
```

Upcoming was `[04]`, becomes `[05]`:
```jsx
// Find:
<ALabel style={{ marginTop: 24 }}>[04] UPCOMING · 7D</ALabel>
// Replace with:
<ALabel style={{ marginTop: 24 }}>[05] UPCOMING · 7D</ALabel>
```

Recent transactions was `[05]`, becomes `[07]` (leaving `[06]` for goals in the next task):
```jsx
// Find:
<ALabel>[05] RECENT · TRANSACTIONS</ALabel>
// Replace with:
<ALabel>[07] RECENT · TRANSACTIONS</ALabel>
```

- [ ] **Step 3: Verify cash flow panel renders and responds to period**

Run: `npm run dev`. The cash flow panel should appear between the sparkline and the accounts/budgets columns. Click `1W`, `3M`, `MAX` — IN/OUT/NET values should change.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/screens/web/Dashboard.jsx
git commit -m "feat(dashboard): add cash flow panel"
```

---

### Task 4: Add goals section

**Files:**
- Modify: `src/renderer/screens/web/Dashboard.jsx`

- [ ] **Step 1: Add goals section to the right column**

The right column currently ends with the upcoming bills list (the `billRows.filter(...).map(...)` block inside `{/* Budgets + Upcoming */}`). After the closing `</div>` of that bills list (the one that closes the `<div style={{ marginTop: 8, borderTop: ...` block for upcoming), add:

```jsx
<ALabel style={{ marginTop: 24 }}>[06] GOALS</ALabel>
<div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
  {goals.map(g => (
    <div key={g.id} style={{ padding: '9px 0', borderBottom: '1px solid ' + A.rule2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: 1 }}>
        <span>{g.name}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {fmtMoney(g.current, t.currency, false)} / {fmtMoney(g.target, t.currency, false)}
        </span>
      </div>
      <div style={{ marginTop: 5, height: 4, background: A.rule2, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: Math.min(g.current / g.target * 100, 100) + '%', background: t.accent }} />
      </div>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Verify goals render correctly**

Run: `npm run dev`. The right column should show `[06] GOALS` below the upcoming bills list, with two progress bars: `EMERGENCY · 6MO` (partially filled) and `BERLIN APT · DEPOSIT` (partially filled). Values and bar widths should reflect `current / target` from the goals seed data.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/screens/web/Dashboard.jsx
git commit -m "feat(dashboard): add goals progress section"
```
