# Investment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift WebInvestments from a static screen to a live one — holdings and trades in the store (persisted to localStorage), a computed portfolio value chart per period, and an add/edit/remove sheet.

**Architecture:** Two new `useLS` slices (`investments`, `trades`) are added to `store.jsx` following the existing pattern. `WebInvestments.jsx` reads from the store and derives a 30-point portfolio value curve from trades via `useMemo`. `WebInvestmentSheet.jsx` (new file) handles add/edit/trade interactions via a slide-in panel.

**Tech Stack:** React 19 hooks, inline styles via `theme.js` tokens, existing `useLS`/`useStore` pattern, existing `fmtMoney`/`fmtSigned`/`fmtPct` formatters.

---

### Task 1: Add seed TRADES to data.js

**Files:**
- Modify: `src/renderer/data.js`

- [ ] **Step 1: Add the TRADES export after the INVESTMENTS array**

In `data.js`, immediately after the closing `];` of the `INVESTMENTS` array (around line 208), add:

```js
export const TRADES = [
  { id: 'tr1', ticker: 'VTI',  shares: 200.00, price: 265.00, date: '2026-02-10', type: 'buy' },
  { id: 'tr2', ticker: 'VXUS', shares: 100.00, price:  65.20, date: '2026-02-10', type: 'buy' },
  { id: 'tr3', ticker: 'BND',  shares: 140.00, price:  72.50, date: '2026-02-15', type: 'buy' },
  { id: 'tr4', ticker: 'VTI',  shares: 150.00, price: 271.00, date: '2026-03-05', type: 'buy' },
  { id: 'tr5', ticker: 'VXUS', shares:  80.00, price:  66.80, date: '2026-03-18', type: 'buy' },
  { id: 'tr6', ticker: 'AAPL', shares:  48.00, price: 218.50, date: '2026-03-25', type: 'buy' },
  { id: 'tr7', ticker: 'VTI',  shares:  62.20, price: 277.00, date: '2026-04-08', type: 'buy' },
  { id: 'tr8', ticker: 'VXUS', shares:  40.00, price:  67.50, date: '2026-04-20', type: 'buy' },
  { id: 'tr9', ticker: 'BTC',  shares:   0.612,price: 65000.00,date: '2026-05-01', type: 'buy' },
];
```

These buys sum to the current share counts in `INVESTMENTS`: VTI 412.20, VXUS 220.00, BND 140.00, AAPL 48.00, BTC 0.612.

- [ ] **Step 2: Verify the app loads**

Run: `npm run dev`
Expected: App loads without console errors. (TRADES is exported but not yet imported anywhere.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/data.js
git commit -m "feat(investments): add seed TRADES to data.js"
```

---

### Task 2: Add investments and trades slices to store.jsx

**Files:**
- Modify: `src/renderer/store.jsx`

- [ ] **Step 1: Add INVESTMENTS and TRADES to the data.js import**

Find line 2:
```js
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS, ACCOUNTS, BILLS, GOALS } from './data';
```
Replace with:
```js
import { TRANSACTIONS, CATEGORY_TREE, BUDGETS, ACCOUNTS, BILLS, GOALS, INVESTMENTS, TRADES } from './data';
```

- [ ] **Step 2: Add the two useLS slices inside StoreProvider**

After the line `const [budgetStartDay, setBudgetStartDay] = useLS('ledger:budgetStartDay', 1);` (around line 63), add:

```js
const [investments, setInvestments] = useLS('ledger:investments', INVESTMENTS);
const [trades, setTrades]           = useLS('ledger:trades', TRADES);
```

- [ ] **Step 3: Add store actions**

After the `reset` useCallback (around line 239), add:

```js
const addTrade = React.useCallback(trade => {
  const newTrade = { ...trade, id: 'tr_' + Date.now() };
  setTrades(prev => [...prev, newTrade]);
  setInvestments(prev => {
    const shareDelta = trade.type === 'buy' ? trade.shares : -trade.shares;
    const existing = prev.find(h => h.ticker === trade.ticker);
    if (existing) {
      return prev.map(h => h.ticker === trade.ticker ? { ...h, shares: h.shares + shareDelta } : h);
    }
    return [...prev, { ticker: trade.ticker, name: trade.ticker, shares: shareDelta, price: trade.price, chg: 0 }];
  });
}, [setTrades, setInvestments]);

const updateHolding = React.useCallback((ticker, fields) => {
  setInvestments(prev => prev.map(h => h.ticker === ticker ? { ...h, ...fields } : h));
}, [setInvestments]);

const removeHolding = React.useCallback(ticker => {
  setInvestments(prev => prev.filter(h => h.ticker !== ticker));
  setTrades(prev => prev.filter(t => t.ticker !== ticker));
}, [setInvestments, setTrades]);
```

- [ ] **Step 4: Update the reset callback**

Find the `reset` useCallback. Add the two new reset lines and the two new dependencies:

```js
const reset = React.useCallback(() => {
  setTxs(TRANSACTIONS);
  setCatTree(CATEGORY_TREE);
  setBudgets(BUDGETS);
  setAccounts(ACCOUNTS);
  setBills(BILLS);
  setGoals(GOALS);
  setGoalContributions([]);
  setSelectedPeriod(monthKey(new Date()));
  setHidden([]);
  setBudgetStartDay(1);
  setInvestments(INVESTMENTS);
  setTrades(TRADES);
}, [setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades]);
```

- [ ] **Step 5: Expose new values and actions in the provider value object**

Inside `<StoreCtx.Provider value={{ ... }}>`, after the existing `reset,` entry, add:

```js
investments,
setInvestments,
trades,
addTrade,
updateHolding,
removeHolding,
```

- [ ] **Step 6: Verify the new store slices persist**

Run: `npm run dev`. Open DevTools → Application → Local Storage. After the first render, `ledger:investments` and `ledger:trades` keys should appear with array data.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/store.jsx
git commit -m "feat(investments): add investments and trades slices to store"
```

---

### Task 3: Wire WebInvestments to the store with functional period buttons

**Files:**
- Modify: `src/renderer/screens/web/WebInvestments.jsx`

- [ ] **Step 1: Replace the import block and add helper functions**

Replace the entire import block (lines 1–6) and everything before `export default function WebInvestments` with:

```jsx
import React from 'react';
import { A } from '../../theme';
import { AsciiSpark, ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { fmtMoney, fmtSigned, fmtPct } from '../../data';
import { useStore } from '../../store';

const PERIOD_DAYS = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '5Y': 1825 };

function windowBounds(period) {
  const end = new Date();
  const start = new Date();
  if (period !== 'MAX') start.setDate(start.getDate() - PERIOD_DAYS[period]);
  else start.setFullYear(start.getFullYear() - 10);
  return { start, end };
}

function portfolioCurve(investments, trades, period, points = 30) {
  const { start, end } = windowBounds(period);
  const step = (end - start) / (points - 1);
  return Array.from({ length: points }, (_, i) => {
    const t = new Date(start.getTime() + i * step);
    const iso = t.toISOString().slice(0, 10);
    const sharesAtT = {};
    for (const trade of trades) {
      if (trade.date <= iso) {
        sharesAtT[trade.ticker] = (sharesAtT[trade.ticker] || 0) +
          (trade.type === 'buy' ? trade.shares : -trade.shares);
      }
    }
    return investments.reduce((sum, h) => sum + (sharesAtT[h.ticker] || 0) * h.price, 0);
  });
}

function chartDateLabels(period) {
  const { start, end } = windowBounds(period);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
  const q1  = new Date(start.getTime() + (end.getTime() - start.getTime()) * 0.25);
  const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) * 0.5);
  const q3  = new Date(start.getTime() + (end.getTime() - start.getTime()) * 0.75);
  return [fmt(start), fmt(q1), fmt(mid), fmt(q3), fmt(end)];
}
```

- [ ] **Step 2: Replace the component body opening**

Replace the function body lines that derive data from the old static imports (currently lines 8–14) with:

```jsx
export default function WebInvestments({ t, onNavigate, onAdd }) {
  const { investments, trades } = useStore();
  const [period, setPeriod] = React.useState('3M');

  const totalPort  = investments.reduce((s, i) => s + i.shares * i.price, 0);
  const dayChg     = investments.reduce((s, i) => s + i.shares * i.price * i.chg / 100, 0);
  const alloc      = investments.map(i => ({ ...i, val: i.shares * i.price, pct: totalPort ? (i.shares * i.price) / totalPort : 0 }));
  const shades     = [t.accent, A.ink, '#8c8678', '#bdb6a3', '#4a463e'];

  const spark      = React.useMemo(() => portfolioCurve(investments, trades, period), [investments, trades, period]);
  const dateLabels = React.useMemo(() => chartDateLabels(period), [period]);
```

- [ ] **Step 3: Wire the period buttons to state**

Find the period buttons render. Replace the static `(i === 3 ? ...)` style comparison with active state based on `period`:

```jsx
{['1D','1W','1M','3M','1Y','5Y','MAX'].map(p => (
  <span key={p} onClick={() => setPeriod(p)} style={{
    fontSize: 10, letterSpacing: 1.2, padding: '5px 10px',
    border: '1px solid ' + (period === p ? A.ink : A.rule2),
    background: period === p ? A.ink : 'transparent',
    color: period === p ? A.bg : A.ink, cursor: 'pointer',
  }}>{p}</span>
))}
```

- [ ] **Step 4: Replace the sparkline and its date labels**

Find:
```jsx
<AsciiSpark data={SPARK_NW.map(v => v * (totalPort / NET_WORTH))} width={840} height={160} stroke={t.accent} />
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
  <span>FEB 11</span><span>MAR 02</span><span>MAR 24</span><span>APR 15</span><span>MAY 11</span>
</div>
```
Replace with:
```jsx
<AsciiSpark data={spark} width={840} height={160} stroke={t.accent} />
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
  {dateLabels.map(l => <span key={l}>{l}</span>)}
</div>
```

- [ ] **Step 5: Replace the holdings table map from `INVESTMENTS` to `investments`**

Find `{INVESTMENTS.map(i => (` and replace with `{investments.map(i => (`.

- [ ] **Step 6: Verify the screen works with live data**

Run: `npm run dev`, navigate to INVESTMENTS. Click each period button — the sparkline should re-render and date labels should update. Holdings table and allocation bar reflect live store data.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/screens/web/WebInvestments.jsx
git commit -m "feat(investments): wire WebInvestments to store with functional period buttons"
```

---

### Task 4: Build WebInvestmentSheet

**Files:**
- Create: `src/renderer/screens/web/WebInvestmentSheet.jsx`

- [ ] **Step 1: Create the sheet component**

Create `src/renderer/screens/web/WebInvestmentSheet.jsx`:

```jsx
import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';

export default function WebInvestmentSheet({ mode: initMode = 'holding', holding = null, onClose, onSaveHolding, onSaveTrade, onRemove }) {
  const [mode, setMode] = React.useState(initMode);

  const [ticker,     setTicker]     = React.useState(holding?.ticker ?? '');
  const [name,       setName]       = React.useState(holding?.name   ?? '');
  const [shares,     setShares]     = React.useState(holding?.shares != null ? String(holding.shares) : '');
  const [price,      setPrice]      = React.useState(holding?.price  != null ? String(holding.price)  : '');
  const [chg,        setChg]        = React.useState(holding?.chg    != null ? String(holding.chg)    : '');

  const [tradeType,   setTradeType]   = React.useState('buy');
  const [tradeShares, setTradeShares] = React.useState('');
  const [tradePrice,  setTradePrice]  = React.useState('');
  const [tradeDate,   setTradeDate]   = React.useState(new Date().toISOString().slice(0, 10));

  const isEdit = !!holding;

  function submitHolding(e) {
    e.preventDefault();
    onSaveHolding({
      ticker: ticker.toUpperCase().trim(),
      name:   name.trim() || ticker.toUpperCase().trim(),
      shares: parseFloat(shares) || 0,
      price:  parseFloat(price)  || 0,
      chg:    parseFloat(chg)    || 0,
    });
    onClose();
  }

  function submitTrade(e) {
    e.preventDefault();
    onSaveTrade({
      ticker: ticker.toUpperCase().trim(),
      type:   tradeType,
      shares: parseFloat(tradeShares) || 0,
      price:  parseFloat(tradePrice)  || 0,
      date:   tradeDate,
    });
    onClose();
  }

  const fieldStyle = {
    width: '100%', background: A.bg2, border: '1px solid ' + A.rule2,
    color: A.ink, fontFamily: 'inherit', fontSize: 12,
    padding: '8px 10px', boxSizing: 'border-box', marginTop: 4, outline: 'none',
  };
  const labelStyle = { fontSize: 9, color: A.muted, letterSpacing: 1.2, display: 'block', marginTop: 14 };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
      background: A.bg, borderLeft: '2px solid ' + A.ink,
      padding: 28, zIndex: 100, overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <ALabel>{isEdit ? 'EDIT HOLDING' : 'ADD'}</ALabel>
        <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 11, color: A.muted, letterSpacing: 1 }}>CLOSE ✕</span>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 1, marginBottom: 20 }}>
        {['holding', 'trade'].map(m => (
          <span key={m} onClick={() => setMode(m)} style={{
            flex: 1, textAlign: 'center', padding: '6px 0', fontSize: 10,
            letterSpacing: 1.2, cursor: 'pointer',
            border: '1px solid ' + (mode === m ? A.ink : A.rule2),
            background: mode === m ? A.ink : 'transparent',
            color: mode === m ? A.bg : A.ink,
          }}>{m.toUpperCase()}</span>
        ))}
      </div>

      {mode === 'holding' ? (
        <form onSubmit={submitHolding} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <label style={labelStyle}>TICKER</label>
          <input value={ticker} onChange={e => setTicker(e.target.value)} style={fieldStyle} placeholder="VTI" required disabled={isEdit} />
          <label style={labelStyle}>NAME</label>
          <input value={name} onChange={e => setName(e.target.value)} style={fieldStyle} placeholder="VANGUARD TOTAL MKT" />
          <label style={labelStyle}>SHARES</label>
          <input type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>PRICE</label>
          <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>DAY CHG %</label>
          <input type="number" step="any" value={chg} onChange={e => setChg(e.target.value)} style={fieldStyle} placeholder="0.00" />
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 24 }}>
            <button type="submit" style={{ flex: 1, background: A.ink, color: A.bg, border: 'none', padding: '10px 0', fontSize: 11, letterSpacing: 1.2, cursor: 'pointer' }}>
              {isEdit ? 'SAVE' : 'ADD HOLDING'}
            </button>
            {isEdit && (
              <button type="button" onClick={() => { onRemove(holding.ticker); onClose(); }} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid ' + A.neg, color: A.neg, fontSize: 11, letterSpacing: 1.2, cursor: 'pointer' }}>
                REMOVE
              </button>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={submitTrade} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <label style={labelStyle}>TICKER</label>
          <input value={ticker} onChange={e => setTicker(e.target.value)} style={fieldStyle} placeholder="VTI" required />
          <label style={labelStyle}>TYPE</label>
          <div style={{ display: 'flex', gap: 1, marginTop: 4 }}>
            {['buy', 'sell'].map(tp => (
              <span key={tp} onClick={() => setTradeType(tp)} style={{
                flex: 1, textAlign: 'center', padding: '6px 0', fontSize: 10,
                letterSpacing: 1.2, cursor: 'pointer',
                border: '1px solid ' + (tradeType === tp ? A.ink : A.rule2),
                background: tradeType === tp ? A.ink : 'transparent',
                color: tradeType === tp ? A.bg : A.ink,
              }}>{tp.toUpperCase()}</span>
            ))}
          </div>
          <label style={labelStyle}>SHARES</label>
          <input type="number" step="any" value={tradeShares} onChange={e => setTradeShares(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>PRICE</label>
          <input type="number" step="any" value={tradePrice} onChange={e => setTradePrice(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>DATE</label>
          <input value={tradeDate} onChange={e => setTradeDate(e.target.value)} style={fieldStyle} placeholder="YYYY-MM-DD" required />
          <button type="submit" style={{ marginTop: 'auto', paddingTop: 24, background: A.ink, color: A.bg, border: 'none', padding: '10px 0', fontSize: 11, letterSpacing: 1.2, cursor: 'pointer' }}>
            RECORD TRADE
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npm run dev`
Expected: App loads without console errors. (Sheet not yet imported anywhere.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/screens/web/WebInvestmentSheet.jsx
git commit -m "feat(investments): add WebInvestmentSheet component"
```

---

### Task 5: Wire WebInvestmentSheet into WebInvestments

**Files:**
- Modify: `src/renderer/screens/web/WebInvestments.jsx`

- [ ] **Step 1: Import the sheet and add sheet state**

At the top of `WebInvestments.jsx`, add:
```js
import WebInvestmentSheet from './WebInvestmentSheet';
```

Update the `useStore` destructure to include actions and `setInvestments`:
```js
const { investments, trades, addTrade, updateHolding, removeHolding, setInvestments } = useStore();
```

After `const dateLabels = ...`, add sheet state:
```js
const [sheet, setSheet] = React.useState(null); // null | { mode, holding }
```

- [ ] **Step 2: Add [+ ADD] button to the holdings header**

Find `<ALabel>[02] HOLDINGS</ALabel>`. Replace with:
```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
  <ALabel>[02] HOLDINGS</ALabel>
  <span onClick={() => setSheet({ mode: 'holding', holding: null })} style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2, cursor: 'pointer' }}>+ ADD</span>
</div>
```

- [ ] **Step 3: Make holdings rows clickable and add inline remove button**

Replace the `{investments.map(i => (` holdings table row block with:

```jsx
{investments.map(i => (
  <div key={i.ticker}
    onClick={() => setSheet({ mode: 'holding', holding: i })}
    style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 100px 90px 28px', padding: t.density === 'compact' ? '8px 0' : '12px 0', fontSize: 12, borderBottom: '1px solid ' + A.rule2, alignItems: 'center', cursor: 'pointer' }}>
    <div style={{ fontWeight: 700, letterSpacing: 0.6 }}>{i.ticker}</div>
    <div style={{ color: A.muted, fontSize: 10, letterSpacing: 0.6 }}>{i.name}</div>
    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: A.muted }}>{i.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: A.muted }}>{fmtMoney(i.price, t.currency, t.decimals)}</div>
    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(i.shares * i.price, t.currency, t.decimals)}</div>
    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: i.chg >= 0 ? t.accent : A.neg, fontSize: 11 }}>{fmtPct(i.chg)}</div>
    <div onClick={e => { e.stopPropagation(); removeHolding(i.ticker); }} style={{ textAlign: 'right', color: A.muted, fontSize: 10, cursor: 'pointer' }}>✕</div>
  </div>
))}
```

Also update the column header to add a blank 7th column:
```jsx
<div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 100px 90px 28px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
  <div>TICKER</div><div>NAME</div>
  <div style={{ textAlign: 'right' }}>SHARES</div>
  <div style={{ textAlign: 'right' }}>PRICE</div>
  <div style={{ textAlign: 'right' }}>VALUE</div>
  <div style={{ textAlign: 'right' }}>DAY</div>
  <div />
</div>
```

- [ ] **Step 4: Render the sheet before the closing WebShell tag**

Before `</WebShell>`, add:
```jsx
{sheet && (
  <WebInvestmentSheet
    mode={sheet.mode}
    holding={sheet.holding}
    onClose={() => setSheet(null)}
    onSaveHolding={h => {
      if (sheet.holding) {
        updateHolding(h.ticker, h);
      } else {
        setInvestments(prev =>
          prev.some(x => x.ticker === h.ticker)
            ? prev.map(x => x.ticker === h.ticker ? { ...x, ...h } : x)
            : [...prev, h]
        );
      }
    }}
    onSaveTrade={addTrade}
    onRemove={removeHolding}
  />
)}
```

- [ ] **Step 5: Verify the full sheet flow**

Run: `npm run dev`, navigate to INVESTMENTS:
- Click `+ ADD` → sheet opens in HOLDING mode blank
- Fill in TICKER, SHARES, PRICE → `ADD HOLDING` → new row appears in table
- Click an existing row → sheet opens pre-filled; edit and `SAVE` updates the holding
- Click `REMOVE` in edit mode → holding and its trades are removed
- Switch to TRADE mode → fill TICKER, SHARES, PRICE, DATE → `RECORD TRADE` → holding's share count updates; sparkline recalculates
- Click ✕ on a row → removes that holding without opening the sheet
- `CLOSE ✕` → sheet dismisses

- [ ] **Step 6: Commit**

```bash
git add src/renderer/screens/web/WebInvestments.jsx
git commit -m "feat(investments): wire add/edit sheet into WebInvestments"
```
