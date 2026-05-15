# Recurring Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing BILLS system into a full recurring transactions engine supporting five frequencies, income recurrings, per-rule pausing, and a proper add/edit UI.

**Architecture:** Bills become "recurring rules" with an in-place schema migration; existing `ledger:bills` localStorage key and all seed data are preserved. `planning.mjs` gains `getOccurrences()` (multi-frequency date math) and `markRecurringPaid()` (replaces `createBillPaymentTransaction`). The store gains four new actions plus a migration useEffect. New `RecurringFormSheet.jsx` handles mobile add/edit; `WebBills.jsx` gets an inline panel for the same. All existing `markBillPaid` callers are handled via a compatibility alias.

**Tech Stack:** React 19, inline styles (theme token `A`), localStorage via `useLS`, no test framework — verify by running `npm run dev` and exercising the UI.

---

## File Map

| File | Action |
|---|---|
| `src/renderer/data.js` | Modify — extend BILLS seed data with full schema |
| `src/renderer/planning.mjs` | Modify — add `getOccurrences`, `markRecurringPaid`, `slug` export; update `buildBillRows`, `isBillPaymentFor` |
| `src/renderer/store.jsx` | Modify — migration useEffect, four new actions, expose in context |
| `src/renderer/components/RecurringFormSheet.jsx` | Create — mobile add/edit form sheet |
| `src/renderer/screens/mobile/DetailScreens.jsx` | Modify — BillsHub: multi-occurrence, income styling, add/edit entry |
| `src/renderer/screens/web/WebBills.jsx` | Modify — rename to RECURRING, income styling, inline add/edit panel, new store action |
| `src/renderer/screens/mobile/More.jsx` | Modify — add `+ ADD` button entry point to recurring form |

---

### Task 1: Extend BILLS seed data in `data.js`

**Files:**
- Modify: `src/renderer/data.js`

- [ ] **Step 1: Locate the BILLS array in data.js and read it**

The array starts with `export const BILLS = [`. Read the current 8 entries — they have `{ name, amt, day, acct, cat }` only.

- [ ] **Step 2: Replace the BILLS array with the extended version**

Replace the entire `export const BILLS = [...]` block with:

```js
export const BILLS = [
  { id: 'rent-greenpoint_1_chk',   name: 'RENT · GREENPOINT',        type: 'expense', freq: 'monthly',  active: true, day: 1,  amt: 2450.00, acct: 'chk', cat: 'housing', path: ['housing'],        ccy: 'USD' },
  { id: 'con-edison_14_chk',       name: 'CON EDISON',               type: 'expense', freq: 'monthly',  active: true, day: 14, amt:   87.50, acct: 'chk', cat: 'bills',   path: ['bills'],          ccy: 'USD' },
  { id: 'spectrum_20_chk',         name: 'SPECTRUM · INTERNET',      type: 'expense', freq: 'monthly',  active: true, day: 20, amt:   59.99, acct: 'chk', cat: 'bills',   path: ['bills'],          ccy: 'USD' },
  { id: 'apple-one_3_amx',         name: 'APPLE ONE',                type: 'expense', freq: 'monthly',  active: true, day: 3,  amt:   32.95, acct: 'amx', cat: 'subs',    path: ['subs'],           ccy: 'USD' },
  { id: 'netflix_7_amx',           name: 'NETFLIX',                  type: 'expense', freq: 'monthly',  active: true, day: 7,  amt:   22.99, acct: 'amx', cat: 'subs',    path: ['subs'],           ccy: 'USD' },
  { id: 'spotify_12_amx',          name: 'SPOTIFY',                  type: 'expense', freq: 'monthly',  active: true, day: 12, amt:   11.99, acct: 'amx', cat: 'subs',    path: ['subs'],           ccy: 'USD' },
  { id: 'nytimes_18_amx',          name: 'NY TIMES',                 type: 'expense', freq: 'monthly',  active: true, day: 18, amt:   25.00, acct: 'amx', cat: 'subs',    path: ['subs'],           ccy: 'USD' },
  { id: 'la-fitness_1_chk',        name: 'LA FITNESS',               type: 'expense', freq: 'monthly',  active: true, day: 1,  amt:   34.99, acct: 'chk', cat: 'health',  path: ['health'],         ccy: 'USD' },
  {
    id: 'payroll-biweekly_chk',
    name: 'PAYROLL · DIRECT DEPOSIT',
    type: 'income',
    freq: 'biweekly',
    active: true,
    startDate: '2026-05-02',
    amt: 3800.00,
    acct: 'chk',
    cat: 'income',
    path: ['income', 'payroll'],
    ccy: 'USD',
  },
  {
    id: 'freelance-weekly_chk',
    name: 'FREELANCE · RETAINER',
    type: 'income',
    freq: 'weekly',
    active: true,
    day: 5,
    amt: 450.00,
    acct: 'chk',
    cat: 'income',
    path: ['income'],
    ccy: 'USD',
  },
];
```

Note: the `day` values for the first 8 entries must match whatever values are currently in the file — adjust if they differ. Verify by comparing existing entries against the originals.

- [ ] **Step 3: Start dev server and verify no JS errors**

Run `npm run dev`. Open the app. Navigate to More → RECURRING. The list should still render without errors. No assertion about content yet — content will fix after planning.mjs is updated.

- [ ] **Step 4: Commit**

```
git add src/renderer/data.js
git commit -m "feat: extend BILLS seed data with full recurring rule schema"
```

---

### Task 2: Core logic — `planning.mjs`

**Files:**
- Modify: `src/renderer/planning.mjs`

- [ ] **Step 1: Export `slug` from planning.mjs**

The `slug` function is currently private. Change:
```js
function slug(value) {
```
to:
```js
export function slug(value) {
```

- [ ] **Step 2: Add `getOccurrences(rule, period)` after the slug function**

Insert this function after `slug`:

```js
export function getOccurrences(rule, period) {
  const [year, month] = period.split('-').map(Number);
  const daysInMonth = getDaysInPeriod(period);

  if (rule.freq === 'monthly' || !rule.freq) {
    const day = Math.min(rule.day || 1, daysInMonth);
    return [`${period}-${String(day).padStart(2, '0')}`];
  }

  if (rule.freq === 'annual') {
    if (rule.month !== month) return [];
    const day = Math.min(rule.day || 1, daysInMonth);
    return [`${period}-${String(day).padStart(2, '0')}`];
  }

  if (rule.freq === 'weekly') {
    const results = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month - 1, d).getDay() === (rule.day || 0)) {
        results.push(`${period}-${String(d).padStart(2, '0')}`);
      }
    }
    return results;
  }

  // biweekly or custom: all dates = startDate + k*interval for integer k >= 0
  const interval = rule.freq === 'biweekly' ? 14 : (rule.interval || 1);
  const anchor = new Date((rule.startDate || period + '-01') + 'T00:00:00');
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month - 1, daysInMonth);
  const MS = 86400000;

  const daysFromAnchorToStart = (periodStart - anchor) / MS;
  const kMin = Math.ceil(daysFromAnchorToStart / interval);

  const results = [];
  for (let k = Math.max(0, kMin); ; k++) {
    const d = new Date(anchor.getTime() + k * interval * MS);
    if (d > periodEnd) break;
    const iso = d.toISOString().slice(0, 10);
    if (iso >= `${period}-01`) results.push(iso);
  }
  return results;
}
```

- [ ] **Step 3: Replace `buildBillRows` with multi-occurrence version**

Replace the entire `export function buildBillRows(...)` block:

```js
export function buildBillRows(bills, transactions, period, todayIso = new Date().toISOString().slice(0, 10)) {
  const rows = [];
  for (const rule of bills) {
    if (rule.active === false) continue;
    const occurrences = getOccurrences(rule, period);
    for (const occDate of occurrences) {
      const occKey = `${rule.id}|${occDate}`;
      const paidTx = transactions.find(tx => isBillPaymentFor(tx, occKey, rule, occDate));
      const status = paidTx
        ? 'paid'
        : occDate < todayIso ? 'overdue'
        : occDate === todayIso ? 'due'
        : 'upcoming';
      rows.push({
        ...rule,
        key: occKey,
        dueDate: occDate,
        status,
        paidTxId: paidTx?.id || null,
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
```

Note: `isBillPaymentFor` signature changes in the next step — update both together.

- [ ] **Step 4: Update `isBillPaymentFor` to handle new key format**

Replace the private `function isBillPaymentFor(tx, bill, dueDate)` with:

```js
function isBillPaymentFor(tx, occKey, rule, dueDate) {
  // New format: billKey = ruleId|occurrenceDate
  if (tx.billKey === occKey) return true;
  // Legacy format: name|day|acct (old billKey)
  const legacyKey = `${rule.name}|${rule.day}|${rule.acct}`;
  if (tx.billKey === legacyKey && tx.date === dueDate) return true;
  // Fallback: field-level match for old transactions with no billKey
  return (
    tx.date === dueDate &&
    tx.acct === rule.acct &&
    tx.cat === (rule.cat || 'bills') &&
    Math.abs(Math.abs(tx.amt) - rule.amt) < 0.01 &&
    tx.name === rule.name
  );
}
```

- [ ] **Step 5: Add `markRecurringPaid` export and keep `createBillPaymentTransaction` as alias**

After `buildBillRows`, add:

```js
export function markRecurringPaid(rule, occurrenceDate) {
  return {
    id: `bill_${slug(rule.id || rule.name)}_${occurrenceDate}`,
    name: rule.name,
    amt: rule.type === 'income' ? Math.abs(rule.amt) : -Math.abs(rule.amt),
    date: occurrenceDate,
    cat: rule.cat || (rule.path?.[0]) || 'bills',
    path: rule.path || [rule.cat || 'bills'],
    ccy: rule.ccy || 'USD',
    acct: rule.acct,
    billKey: `${rule.id}|${occurrenceDate}`,
  };
}
```

Keep the existing `createBillPaymentTransaction` export unchanged — the store still imports it for the `markBillPaid` compat alias until that alias is updated in Task 3.

- [ ] **Step 6: Verify in browser**

Run `npm run dev`. Navigate to More → RECURRING. The list should now show multiple rows for the weekly and bi-weekly seed entries. Monthly rules show exactly one row per period. Pausing the server.

- [ ] **Step 7: Commit**

```
git add src/renderer/planning.mjs
git commit -m "feat: add getOccurrences, markRecurringPaid; update buildBillRows for multi-frequency"
```

---

### Task 3: Store — migration, new actions, context

**Files:**
- Modify: `src/renderer/store.jsx`

- [ ] **Step 1: Update the import from planning.mjs**

Find:
```js
import { buildBillRows, createBillPaymentTransaction, createGoalContribution } from './planning.mjs';
```

Replace with:
```js
import { buildBillRows, markRecurringPaid as createRecurringPayment, getBillDueDate, slug, createGoalContribution } from './planning.mjs';
```

- [ ] **Step 2: Add `migrateBills` function near the top of the store file (after imports)**

Add this function before the `StoreProvider` component:

```js
function migrateBills(bills) {
  return bills.map(b => b.id ? b : {
    ...b,
    id: slug(b.name) + '_' + (b.day || 1) + '_' + (b.acct || ''),
    type: 'expense',
    freq: 'monthly',
    path: b.path || [b.cat || 'bills'],
    ccy: b.ccy || 'USD',
    active: true,
  });
}
```

- [ ] **Step 3: Add migration useEffect inside StoreProvider**

Find where `bills` and `setBills` are declared (the `useLS('ledger:bills', BILLS)` line). Directly after that line, add:

```js
React.useEffect(() => {
  setBills(prev => migrateBills(prev));
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Add the four new store actions**

Find the existing `markBillPaid` callback and add these four new callbacks alongside it:

```js
const addRecurring = React.useCallback(rule => {
  const id = slug(rule.name) + '_' + Date.now();
  setBills(prev => [...prev, { ...rule, id, active: rule.active !== false }]);
}, [setBills]);

const updateRecurring = React.useCallback((id, patch) => {
  setBills(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
}, [setBills]);

const deleteRecurring = React.useCallback(id => {
  setBills(prev => prev.filter(b => b.id !== id));
}, [setBills]);

const markRecurringPaid = React.useCallback((rule, occurrenceDate) => {
  const tx = createRecurringPayment(rule, occurrenceDate);
  setTxs(prev => {
    if (prev.some(ex => ex.billKey === tx.billKey)) return prev;
    return [...prev, tx];
  });
}, [setTxs]);
```

- [ ] **Step 5: Update `markBillPaid` to use the new function**

Find the existing `markBillPaid` callback:
```js
const markBillPaid = React.useCallback(bill => {
  const tx = createBillPaymentTransaction(bill, selectedPeriod);
  setTxs(prev => prev.some(existing => existing.id === tx.id || existing.billKey === tx.billKey && existing.date === tx.date)
    ...
  });
}, [...]);
```

Replace entirely with:
```js
const markBillPaid = React.useCallback(bill => {
  const occDate = getBillDueDate(bill, selectedPeriod);
  markRecurringPaid(bill, occDate);
}, [markRecurringPaid, getBillDueDate, selectedPeriod]);
```

Wait — `markRecurringPaid` here refers to the store action defined above, not the import. And `getBillDueDate` is a plain imported function (not a callback), so it doesn't belong in the dependency array. Correct form:

```js
const markBillPaid = React.useCallback(bill => {
  const occDate = getBillDueDate(bill, selectedPeriod);
  markRecurringPaid(bill, occDate);
}, [markRecurringPaid, selectedPeriod]);
```

- [ ] **Step 6: Expose new actions in StoreCtx.Provider value**

Find the `value` object passed to `StoreCtx.Provider`. Add the four new actions:

```js
addRecurring,
updateRecurring,
deleteRecurring,
markRecurringPaid,
```

alongside the existing `markBillPaid`.

- [ ] **Step 7: Verify in browser**

Run `npm run dev`. Open DevTools console. Navigate to More → RECURRING. Tap PAY on any bill row. The status chip should flip to PAID. No console errors.

- [ ] **Step 8: Commit**

```
git add src/renderer/store.jsx
git commit -m "feat: store — migrateBills, addRecurring, updateRecurring, deleteRecurring, markRecurringPaid"
```

---

### Task 4: Create `RecurringFormSheet.jsx` — mobile add/edit form

**Files:**
- Create: `src/renderer/components/RecurringFormSheet.jsx`

- [ ] **Step 1: Read `AccountFormSheet.jsx` to understand the sheet pattern**

Read `src/renderer/components/AccountFormSheet.jsx` in full. Note:
- It uses a full-screen fixed overlay with `zIndex: 1000`
- Header row with title and ✕ close button
- Scrollable content in between
- SAVE / DELETE buttons at bottom

- [ ] **Step 2: Create `RecurringFormSheet.jsx`**

Create `src/renderer/components/RecurringFormSheet.jsx` with the following content:

```jsx
import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { CATEGORIES } from '../data';
import { useStore } from '../store';

const FREQ_LABELS = ['MONTHLY', 'WEEKLY', 'BI-WEEKLY', 'ANNUAL', 'CUSTOM'];
const FREQ_VALUES = ['monthly', 'weekly', 'biweekly', 'annual', 'custom'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default function RecurringFormSheet({ t, onClose, editRule = null }) {
  const { addRecurring, updateRecurring, deleteRecurring, accountsWithBalance } = useStore();

  const [name, setName]           = React.useState(editRule?.name || '');
  const [type, setType]           = React.useState(editRule?.type || 'expense');
  const [amt, setAmt]             = React.useState(editRule ? String(editRule.amt) : '');
  const [freq, setFreq]           = React.useState(editRule?.freq || 'monthly');
  const [day, setDay]             = React.useState(editRule?.day ?? 1);
  const [month, setMonth]         = React.useState(editRule?.month ?? 1);
  const [startDate, setStartDate] = React.useState(editRule?.startDate || new Date().toISOString().slice(0, 10));
  const [interval, setInterval]   = React.useState(editRule?.interval ?? 14);
  const [acct, setAcct]           = React.useState(editRule?.acct || accountsWithBalance[0]?.id || '');
  const [cat, setCat]             = React.useState(editRule?.cat || 'bills');
  const [active, setActive]       = React.useState(editRule?.active !== false);

  const canSave = name.trim() && parseFloat(amt) > 0 && acct;

  const buildRule = () => ({
    name: name.trim(),
    type,
    amt: parseFloat(amt),
    freq,
    day: ['monthly', 'weekly', 'annual'].includes(freq) ? Number(day) : undefined,
    month: freq === 'annual' ? Number(month) : undefined,
    startDate: ['biweekly', 'custom'].includes(freq) ? startDate : undefined,
    interval: freq === 'custom' ? Number(interval) : undefined,
    acct,
    cat,
    path: [cat],
    ccy: 'USD',
    active,
  });

  const handleSave = () => {
    if (!canSave) return;
    if (editRule) {
      updateRecurring(editRule.id, buildRule());
    } else {
      addRecurring(buildRule());
    }
    onClose();
  };

  const handleDelete = () => {
    if (editRule) deleteRecurring(editRule.id);
    onClose();
  };

  const pill = (label, active, onClick) => (
    <button key={label} onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', padding: '5px 10px',
      border: '1px solid ' + (active ? A.ink : A.rule2),
      background: active ? A.ink : 'transparent',
      color: active ? A.bg : A.ink,
      fontSize: 10, letterSpacing: 1.2,
    }}>{label}</button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: A.bg, zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: A.font }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid ' + A.rule2 }}>
        <ALabel>{editRule ? 'EDIT · RECURRING' : 'NEW · RECURRING'}</ALabel>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {editRule && (
            <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.neg }}>DELETE</button>
          )}
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 20, color: A.muted }}>×</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

        {/* NAME */}
        <div style={{ marginBottom: 16 }}>
          <ALabel>NAME</ALabel>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RENT"
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 14, letterSpacing: 0.6, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }}
          />
        </div>

        {/* TYPE */}
        <div style={{ marginBottom: 16 }}>
          <ALabel>TYPE</ALabel>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {pill('EXPENSE', type === 'expense', () => setType('expense'))}
            {pill('INCOME', type === 'income', () => setType('income'))}
          </div>
        </div>

        {/* AMOUNT */}
        <div style={{ marginBottom: 16 }}>
          <ALabel>AMOUNT</ALabel>
          <input
            type="number" min="0" step="0.01" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)}
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: type === 'income' ? t.accent : A.neg, boxSizing: 'border-box' }}
          />
        </div>

        <ARule />

        {/* FREQUENCY */}
        <div style={{ margin: '12px 0' }}>
          <ALabel>FREQUENCY</ALabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {FREQ_VALUES.map((f, i) => pill(FREQ_LABELS[i], freq === f, () => setFreq(f)))}
          </div>
        </div>

        {/* Frequency-specific sub-fields */}
        {freq === 'monthly' && (
          <div style={{ marginBottom: 12 }}>
            <ALabel>DAY OF MONTH</ALabel>
            <input
              type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
              style={{ all: 'unset', display: 'block', width: 80, marginTop: 8, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }}
            />
          </div>
        )}

        {freq === 'weekly' && (
          <div style={{ marginBottom: 12 }}>
            <ALabel>DAY OF WEEK</ALabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {DOW.map((d, i) => pill(d, day === i, () => setDay(i)))}
            </div>
          </div>
        )}

        {freq === 'biweekly' && (
          <div style={{ marginBottom: 12 }}>
            <ALabel>START DATE</ALabel>
            <input
              type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ all: 'unset', display: 'block', marginTop: 8, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink }}
            />
          </div>
        )}

        {freq === 'annual' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <ALabel>MONTH</ALabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {MONTHS.map((m, i) => pill(m, month === i + 1, () => setMonth(i + 1)))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <ALabel>DAY OF MONTH</ALabel>
              <input
                type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
                style={{ all: 'unset', display: 'block', width: 80, marginTop: 8, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }}
              />
            </div>
          </>
        )}

        {freq === 'custom' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <ALabel>START DATE</ALabel>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ all: 'unset', display: 'block', marginTop: 8, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <ALabel>EVERY N DAYS</ALabel>
              <input
                type="number" min="1" value={interval} onChange={e => setInterval(e.target.value)}
                style={{ all: 'unset', display: 'block', width: 80, marginTop: 8, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }}
              />
            </div>
          </>
        )}

        <ARule />

        {/* ACCOUNT */}
        <div style={{ margin: '12px 0' }}>
          <ALabel>ACCOUNT</ALabel>
          <select value={acct} onChange={e => setAcct(e.target.value)} style={{ marginTop: 8, width: '100%', fontFamily: A.font, fontSize: 13, padding: 8, border: '1px solid ' + A.ink, background: A.bg, color: A.ink }}>
            {accountsWithBalance.filter(a => !a.archived).map(a => (
              <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
            ))}
          </select>
        </div>

        {/* CATEGORY */}
        <div style={{ margin: '12px 0' }}>
          <ALabel>CATEGORY</ALabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {Object.entries(CATEGORIES).slice(0, 8).map(([k, c]) => (
              <button key={k} onClick={() => setCat(k)} style={{
                all: 'unset', cursor: 'pointer', padding: '5px 9px',
                border: '1px solid ' + (cat === k ? A.ink : A.rule2),
                background: cat === k ? A.ink : 'transparent',
                color: cat === k ? A.bg : A.ink,
                fontSize: 10, letterSpacing: 1.2,
              }}>{c.glyph} {c.label}</button>
            ))}
          </div>
        </div>

        {/* ACTIVE (edit mode only) */}
        {editRule && (
          <div style={{ margin: '12px 0 4px' }}>
            <ALabel>STATUS</ALabel>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {pill('ACTIVE', active, () => setActive(true))}
              {pill('PAUSED', !active, () => setActive(false))}
            </div>
          </div>
        )}
      </div>

      {/* Footer SAVE */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid ' + A.rule2 }}>
        <button onClick={handleSave} style={{
          all: 'unset', cursor: canSave ? 'pointer' : 'default', display: 'block',
          textAlign: 'center', width: '100%', padding: '14px',
          background: canSave ? t.accent : A.rule2,
          color: A.bg, fontSize: 12, letterSpacing: 2, fontWeight: 700,
          boxSizing: 'border-box',
        }}>SAVE</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the component renders without errors**

Run `npm run dev`. We won't wire up the entry point until Task 5/6, but temporarily add `import RecurringFormSheet from '../../components/RecurringFormSheet'` to More.jsx and render `<RecurringFormSheet t={t} onClose={() => {}} />` to confirm no import errors. Remove the temporary import after checking. Alternatively, just proceed to Task 5 and verify there.

- [ ] **Step 4: Commit**

```
git add src/renderer/components/RecurringFormSheet.jsx
git commit -m "feat: add RecurringFormSheet mobile add/edit form"
```

---

### Task 5: Update `BillsHub` in `DetailScreens.jsx`

**Files:**
- Modify: `src/renderer/screens/mobile/DetailScreens.jsx`

The `BillsHub` component starts at line 397. Changes needed:
- Pull `markRecurringPaid`, `addRecurring` from store (replacing `markBillPaid`)
- Show RecurringFormSheet for add/edit
- Update row display: income in green, frequency label dynamic, multi-occurrence rows work automatically
- Update timeline 30-day grid (works without change since `dueDate` is still a date string)
- Remove the SUBSCRIPTIONS / BILLS split — now all rows are merged (the new `buildBillRows` doesn't split by cat)

- [ ] **Step 1: Add RecurringFormSheet import at the top of DetailScreens.jsx**

After the existing imports add:
```js
import RecurringFormSheet from '../../components/RecurringFormSheet';
```

- [ ] **Step 2: Rewrite the BillsHub component**

Find the entire `// ── Bills Hub ─...` section (lines ~396–477) and replace it with:

```jsx
// ── Bills Hub ─────────────────────────────────────────────────────────────────
const FREQ_SHORT = { monthly: 'MONTHLY', weekly: 'WEEKLY', biweekly: 'BI-WEEKLY', annual: 'ANNUAL', custom: 'CUSTOM' };

export function BillsHub({ t, onBack }) {
  const { accountsWithBalance: accts, billRows, markRecurringPaid, bills } = useStore();
  const [showForm, setShowForm] = React.useState(false);
  const [editRule, setEditRule] = React.useState(null);

  const expenseRows = billRows.filter(b => b.type !== 'income');
  const incomeRows  = billRows.filter(b => b.type === 'income');

  const monthly = expenseRows.reduce((s, b) => s + b.amt, 0);
  const paid    = expenseRows.filter(b => b.status === 'paid').reduce((s, b) => s + b.amt, 0);

  const timeline = Array.from({ length: 30 }, (_, i) =>
    billRows.filter(b => Number(b.dueDate.slice(8, 10)) === i + 1)
  );

  const openEditForm = ruleId => {
    const rule = bills.find(b => b.id === ruleId);
    setEditRule(rule || null);
    setShowForm(true);
  };

  return (
    <>
      {showForm && (
        <RecurringFormSheet
          t={t}
          onClose={() => { setShowForm(false); setEditRule(null); }}
          editRule={editRule}
        />
      )}

      <div style={{ padding: '0 18px 20px' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
          <button onClick={() => { setEditRule(null); setShowForm(true); }} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>+ ADD</button>
        </div>
        <ARule thick />

        <div style={{ padding: '14px 0 8px' }}>
          <ALabel>[01] MONTHLY · EXPENSES</ALabel>
          <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>{fmtMoney(paid, t.currency, t.decimals)}</div>
          <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>{fmtMoney(monthly, t.currency, false)} TOTAL · {expenseRows.length} THIS PERIOD</div>
        </div>

        <ARule />

        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[02] NEXT · 30 · DAYS</ALabel>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: 2 }}>
            {timeline.map((day, i) => {
              const total = day.reduce((s, b) => s + b.amt, 0);
              const has = day.length > 0;
              return (
                <div key={i} style={{
                  height: 36, background: has ? t.accent : A.rule2,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                  paddingBottom: 2, opacity: has ? Math.min(1, 0.4 + (total / 2500)) : 1,
                }}>
                  {has && <div style={{ fontSize: 8, color: A.bg, fontWeight: 700 }}>{day.length}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <ARule style={{ marginTop: 14 }} />

        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[03] RECURRING · {billRows.length} THIS PERIOD</ALabel>
          {billRows.map(b => {
            const isIncome = b.type === 'income';
            const amtColor = isIncome ? t.accent : (b.status === 'paid' ? A.muted : A.neg);
            return (
              <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid ' + A.rule2, opacity: b.status === 'paid' ? 0.58 : 1 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', width: 30, color: b.status === 'paid' ? t.accent : b.status === 'upcoming' ? A.ink : A.neg, letterSpacing: -0.5, flexShrink: 0 }}>
                    {b.dueDate.slice(8)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                    <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 2 }}>
                      {accts.find(a => a.id === b.acct)?.code} · {FREQ_SHORT[b.freq] || 'MONTHLY'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: amtColor }}>
                      {isIncome ? '↑' : ''}{fmtMoney(b.amt, t.currency, t.decimals)}
                    </div>
                  </div>
                  {b.status === 'paid'
                    ? <div style={{ fontSize: 10, color: t.accent, letterSpacing: 1, minWidth: 36, textAlign: 'right' }}>PAID</div>
                    : (
                      <button onClick={() => markRecurringPaid(b, b.dueDate)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1, padding: '5px 8px', background: A.ink, color: A.bg }}>
                        PAY
                      </button>
                    )
                  }
                  <button onClick={() => openEditForm(b.id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: A.muted }}>✎</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`. Navigate to More → RECURRING (BILLS & SUBSCRIPTIONS row). You should see:
- Multiple rows for weekly and bi-weekly seed entries
- Income rows (PAYROLL, FREELANCE) in green with ↑ glyph
- PAY button on each unpaid row — tap one, row flips to PAID
- ✎ edit button on each row opens RecurringFormSheet with pre-filled data
- "+ ADD" button in header opens blank RecurringFormSheet
- Saving a new rule adds it to the list

- [ ] **Step 4: Commit**

```
git add src/renderer/screens/mobile/DetailScreens.jsx
git commit -m "feat: BillsHub — multi-frequency rows, income styling, add/edit via RecurringFormSheet"
```

---

### Task 6: Update `WebBills.jsx` — web recurring screen

**Files:**
- Modify: `src/renderer/screens/web/WebBills.jsx`

Changes needed:
- Rename "[01] BILLS & SUBSCRIPTIONS" to "[01] RECURRING"
- Use `markRecurringPaid(row, row.dueDate)` instead of `markBillPaid(b)`
- Income rows: amount in `t.accent`, ↑ glyph
- Add inline add/edit panel (state: `showPanel`, `editRule`)
- Pull `addRecurring`, `updateRecurring`, `deleteRecurring`, `bills` from store

- [ ] **Step 1: Replace the full `WebBills.jsx` content**

```jsx
import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import WebShell from './WebShell';
import { useStore } from '../../store';
import { CATEGORIES, fmtMoney } from '../../data';

const STATUS_LABELS = { paid: 'PAID', due: 'DUE TODAY', overdue: 'OVERDUE', upcoming: 'UPCOMING' };
const FREQ_SHORT = { monthly: 'MONTHLY', weekly: 'WEEKLY', biweekly: 'BI-WK', annual: 'ANNUAL', custom: 'CUSTOM' };
const FREQ_VALUES = ['monthly', 'weekly', 'biweekly', 'annual', 'custom'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function statusColor(status, accent) {
  if (status === 'paid') return accent;
  if (status === 'due' || status === 'overdue') return A.neg;
  return A.muted;
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', padding: '4px 8px',
      border: '1px solid ' + (active ? A.ink : A.rule2),
      background: active ? A.ink : 'transparent',
      color: active ? A.bg : A.ink,
      fontSize: 9, letterSpacing: 1.1,
    }}>{label}</button>
  );
}

function RecurringPanel({ t, editRule, onClose, onSave, onDelete, accountsWithBalance }) {
  const [name, setName]           = React.useState(editRule?.name || '');
  const [type, setType]           = React.useState(editRule?.type || 'expense');
  const [amt, setAmt]             = React.useState(editRule ? String(editRule.amt) : '');
  const [freq, setFreq]           = React.useState(editRule?.freq || 'monthly');
  const [day, setDay]             = React.useState(editRule?.day ?? 1);
  const [month, setMonth]         = React.useState(editRule?.month ?? 1);
  const [startDate, setStartDate] = React.useState(editRule?.startDate || new Date().toISOString().slice(0, 10));
  const [interval, setInterval]   = React.useState(editRule?.interval ?? 14);
  const [acct, setAcct]           = React.useState(editRule?.acct || accountsWithBalance[0]?.id || '');
  const [cat, setCat]             = React.useState(editRule?.cat || 'bills');
  const [active, setActive]       = React.useState(editRule?.active !== false);

  const canSave = name.trim() && parseFloat(amt) > 0 && acct;

  const buildRule = () => ({
    name: name.trim(), type, amt: parseFloat(amt), freq,
    day: ['monthly', 'weekly', 'annual'].includes(freq) ? Number(day) : undefined,
    month: freq === 'annual' ? Number(month) : undefined,
    startDate: ['biweekly', 'custom'].includes(freq) ? startDate : undefined,
    interval: freq === 'custom' ? Number(interval) : undefined,
    acct, cat, path: [cat], ccy: 'USD', active,
  });

  return (
    <div style={{ border: '1px solid ' + A.ink, padding: 20, marginBottom: 20, background: A.bg2 || A.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <ALabel>{editRule ? 'EDIT · RECURRING' : 'NEW · RECURRING'}</ALabel>
        <div style={{ display: 'flex', gap: 16 }}>
          {editRule && <button onClick={onDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.2, color: A.neg }}>DELETE</button>}
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 16, color: A.muted }}>×</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
        <div>
          <ALabel>NAME</ALabel>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RENT"
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '5px 0', color: A.ink, boxSizing: 'border-box' }} />
        </div>
        <div>
          <ALabel>TYPE</ALabel>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Pill label="EXPENSE" active={type === 'expense'} onClick={() => setType('expense')} />
            <Pill label="INCOME" active={type === 'income'} onClick={() => setType('income')} />
          </div>
        </div>
        <div>
          <ALabel>AMOUNT</ALabel>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)}
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: type === 'income' ? t.accent : A.neg, boxSizing: 'border-box' }} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <ALabel>FREQUENCY</ALabel>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {FREQ_VALUES.map((f, i) => (
            <Pill key={f} label={['MONTHLY','WEEKLY','BI-WEEKLY','ANNUAL','CUSTOM'][i]} active={freq === f} onClick={() => setFreq(f)} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        {freq === 'monthly' && (
          <div>
            <ALabel>DAY OF MONTH</ALabel>
            <input type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
              style={{ all: 'unset', display: 'block', width: 60, marginTop: 6, fontFamily: A.font, fontSize: 14, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }} />
          </div>
        )}
        {freq === 'weekly' && (
          <div>
            <ALabel>DAY OF WEEK</ALabel>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {DOW.map((d, i) => <Pill key={d} label={d} active={day === i} onClick={() => setDay(i)} />)}
            </div>
          </div>
        )}
        {(freq === 'biweekly' || freq === 'custom') && (
          <div>
            <ALabel>START DATE</ALabel>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ all: 'unset', display: 'block', marginTop: 6, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '5px 0', color: A.ink }} />
          </div>
        )}
        {freq === 'annual' && (
          <>
            <div>
              <ALabel>MONTH</ALabel>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {MONTHS_SHORT.map((m, i) => <Pill key={m} label={m} active={month === i + 1} onClick={() => setMonth(i + 1)} />)}
              </div>
            </div>
            <div>
              <ALabel>DAY</ALabel>
              <input type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
                style={{ all: 'unset', display: 'block', width: 60, marginTop: 6, fontFamily: A.font, fontSize: 14, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }} />
            </div>
          </>
        )}
        {freq === 'custom' && (
          <div>
            <ALabel>EVERY N DAYS</ALabel>
            <input type="number" min="1" value={interval} onChange={e => setInterval(e.target.value)}
              style={{ all: 'unset', display: 'block', width: 60, marginTop: 6, fontFamily: A.font, fontSize: 14, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }} />
          </div>
        )}
        <div>
          <ALabel>ACCOUNT</ALabel>
          <select value={acct} onChange={e => setAcct(e.target.value)}
            style={{ marginTop: 6, fontFamily: A.font, fontSize: 12, padding: '4px 6px', border: '1px solid ' + A.ink, background: A.bg, color: A.ink }}>
            {accountsWithBalance.filter(a => !a.archived).map(a => (
              <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
            ))}
          </select>
        </div>
        <div>
          <ALabel>CATEGORY</ALabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {Object.entries(CATEGORIES).slice(0, 8).map(([k, c]) => (
              <Pill key={k} label={c.glyph + ' ' + c.label} active={cat === k} onClick={() => setCat(k)} />
            ))}
          </div>
        </div>
        {editRule && (
          <div>
            <ALabel>STATUS</ALabel>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <Pill label="ACTIVE" active={active} onClick={() => setActive(true)} />
              <Pill label="PAUSED" active={!active} onClick={() => setActive(false)} />
            </div>
          </div>
        )}
      </div>

      <ARule />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={() => canSave && onSave(buildRule())} style={{
          all: 'unset', cursor: canSave ? 'pointer' : 'default', padding: '10px 24px',
          background: canSave ? t.accent : A.rule2, color: A.bg,
          fontSize: 10, letterSpacing: 2, fontWeight: 700,
        }}>SAVE ↵</button>
      </div>
    </div>
  );
}

export default function WebBills({ t, onNavigate, onAdd }) {
  const { accountsWithBalance, billRows, markRecurringPaid, addRecurring, updateRecurring, deleteRecurring, bills, periodLabel } = useStore();

  const [showPanel, setShowPanel] = React.useState(false);
  const [editRule, setEditRule]   = React.useState(null);

  const totalMonthly = billRows.filter(b => b.type !== 'income').reduce((s, b) => s + b.amt, 0);
  const paidTotal    = billRows.filter(b => b.status === 'paid' && b.type !== 'income').reduce((s, b) => s + b.amt, 0);
  const openRows     = billRows.filter(b => b.status !== 'paid');
  const upcoming     = openRows.filter(b => ['due', 'overdue', 'upcoming'].includes(b.status)).slice(0, 3);

  const openAdd = () => { setEditRule(null); setShowPanel(true); };
  const openEdit = ruleId => {
    const rule = bills.find(b => b.id === ruleId);
    setEditRule(rule || null);
    setShowPanel(true);
  };
  const closePanel = () => { setShowPanel(false); setEditRule(null); };

  const handleSave = rule => {
    if (editRule) updateRecurring(editRule.id, rule);
    else addRecurring(rule);
    closePanel();
  };

  const handleDelete = () => {
    if (editRule) deleteRecurring(editRule.id);
    closePanel();
  };

  return (
    <WebShell active="bills" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <ALabel>[01] RECURRING · {periodLabel}</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(paidTotal, t.currency, t.decimals)}
            <span style={{ color: A.muted, fontSize: 24 }}> · {fmtMoney(totalMonthly, t.currency, false)}</span>
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
            PAID · TOTAL · {openRows.length} OPEN
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {upcoming.length > 0 && (
            <div style={{ border: '1px solid ' + A.ink, padding: '12px 16px', minWidth: 220 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 8 }}>NEXT ACTIONS</div>
              {upcoming.map((b, i) => (
                <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: i < upcoming.length - 1 ? '1px solid ' + A.rule2 : 'none', gap: 14 }}>
                  <span><span style={{ color: statusColor(b.status, t.accent), marginRight: 8 }}>{STATUS_LABELS[b.status]}</span>{b.name}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(b.amt, t.currency, t.decimals)}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={openAdd} style={{ all: 'unset', cursor: 'pointer', padding: '8px 16px', border: '1px solid ' + A.ink, fontSize: 10, letterSpacing: 1.4 }}>+ ADD</button>
        </div>
      </div>

      {showPanel && (
        <RecurringPanel
          t={t}
          editRule={editRule}
          onClose={closePanel}
          onSave={handleSave}
          onDelete={handleDelete}
          accountsWithBalance={accountsWithBalance}
        />
      )}

      <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
        <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr 70px 80px 90px 90px 86px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
          <div>STATUS</div><div>NAME</div><div>ACCT</div><div>FREQ</div><div>CATEGORY</div><div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>ACTION</div>
        </div>
        {billRows.map(b => {
          const acct = accountsWithBalance.find(a => a.id === b.acct);
          const cat = CATEGORIES[b.cat];
          const isIncome = b.type === 'income';
          return (
            <div key={b.key} style={{
              display: 'grid', gridTemplateColumns: '86px 1fr 70px 80px 90px 90px 86px',
              padding: t.density === 'compact' ? '8px 0' : '11px 0',
              borderBottom: '1px solid ' + A.rule2, alignItems: 'center',
              opacity: b.status === 'paid' ? 0.58 : 1,
            }}>
              <div style={{ fontSize: 9, letterSpacing: 1, color: statusColor(b.status, t.accent) }}>
                {STATUS_LABELS[b.status]}<br /><span style={{ color: A.muted }}>{b.dueDate.slice(5)}</span>
              </div>
              <div style={{ fontSize: 12 }}>{b.name}</div>
              <div style={{ fontSize: 9, color: A.muted }}>{acct?.code || b.acct}</div>
              <div style={{ fontSize: 9, color: A.muted }}>{FREQ_SHORT[b.freq] || 'MONTHLY'}</div>
              <div style={{ fontSize: 10, color: A.ink2 }}>{cat?.glyph} {cat?.label || b.cat}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: isIncome ? t.accent : A.ink }}>
                {isIncome ? '↑ ' : ''}{fmtMoney(b.amt, t.currency, t.decimals)}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                {b.status === 'paid' ? (
                  <span style={{ fontSize: 9, color: t.accent, letterSpacing: 1 }}>TX LINKED</span>
                ) : (
                  <button onClick={() => markRecurringPaid(b, b.dueDate)} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1, padding: '4px 7px', background: A.ink, color: A.bg }}>
                    PAY
                  </button>
                )}
                <button onClick={() => openEdit(b.id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: A.muted }}>✎</button>
              </div>
            </div>
          );
        })}
      </div>
    </WebShell>
  );
}
```

- [ ] **Step 2: Verify in browser at desktop width (≥ 1024px)**

Run `npm run dev`. Navigate to Bills (RECURRING) in the web layout. Verify:
- Header shows "[01] RECURRING · MAY 2026"
- Weekly FREELANCE RETAINER shows 4–5 rows for the current period
- Bi-weekly PAYROLL shows 2 rows
- Income rows show ↑ and green amount
- PAY button marks a row paid, row dims and shows TX LINKED
- + ADD opens the inline panel; fill in a rule and save — it appears in the list
- ✎ on a row opens the panel with pre-filled data for editing

- [ ] **Step 3: Commit**

```
git add src/renderer/screens/web/WebBills.jsx
git commit -m "feat: WebBills — rename to RECURRING, income styling, inline add/edit panel"
```

---

### Task 7: Update `More.jsx` — add `+ ADD` entry point

**Files:**
- Modify: `src/renderer/screens/mobile/More.jsx`

- [ ] **Step 1: Import RecurringFormSheet and add state**

Add import at top:
```js
import RecurringFormSheet from '../../components/RecurringFormSheet';
```

Add state inside the `More` component:
```js
const [showAddRecurring, setShowAddRecurring] = React.useState(false);
```

- [ ] **Step 2: Update the RECURRING section row to include a `+ ADD` button**

Find the RECURRING section in the `sections` array:
```js
{
  title: 'RECURRING',
  rows: [
    { label: 'BILLS & SUBSCRIPTIONS', sub: billRows.length + ' ACTIVE · ' + fmtMoney(billTotal, t.currency, false) + '/MO', screen: 'bills' },
  ],
},
```

This stays as-is. After the `sections.map(...)` block in the JSX (which renders the nav rows), we'll add the `+ ADD` button separately. Find the RECURRING section rendering inside the map:

Actually, the sections are rendered generically via `sections.map(sec => ...)`. We need to insert the add button specifically for the RECURRING section. The cleanest approach: after the existing `sections.map(...)` JSX, render the RecurringFormSheet overlay. Then add the `+ ADD` button inline by giving the RECURRING section a special render path.

Replace the current RECURRING entry in the `sections` array with a `customHeader` property, OR (simpler) add the button right after the RECURRING section title in the JSX by finding it by `sec.title === 'RECURRING'`:

In the `sections.map(sec => ...)` render, find the inner content:
```jsx
<div key={sec.title} style={{ marginTop: 14 }}>
  <ALabel>{sec.title}</ALabel>
  <div style={{ marginTop: 6 }}>
```

Change it to:
```jsx
<div key={sec.title} style={{ marginTop: 14 }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <ALabel>{sec.title}</ALabel>
    {sec.title === 'RECURRING' && (
      <button onClick={() => setShowAddRecurring(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>+ ADD</button>
    )}
  </div>
  <div style={{ marginTop: 6 }}>
```

- [ ] **Step 3: Update the RECURRING subtitle to show correct counts**

The current subtitle: `billRows.length + ' ACTIVE · ' + fmtMoney(billTotal, t.currency, false) + '/MO'`

`billRows` now returns one row per occurrence, not one per rule. The sub label should show the count of rules, not occurrences. Pull `bills` from the store as well:

```js
const { goals, billRows, bills } = useStore();
const activeRules = bills.filter(b => b.active !== false).length;
const billTotal = billRows.filter(b => b.type !== 'income').reduce((s, b) => s + b.amt, 0);
```

Update the sub label:
```js
sub: activeRules + ' RULES · ' + fmtMoney(billTotal, t.currency, false) + '/MO'
```

- [ ] **Step 4: Render the RecurringFormSheet overlay**

At the very end of the returned JSX (before the closing `</div>`), add:
```jsx
{showAddRecurring && (
  <RecurringFormSheet
    t={t}
    onClose={() => setShowAddRecurring(false)}
  />
)}
```

- [ ] **Step 5: Verify in browser at mobile width (< 1024px)**

Run `npm run dev`. Resize to mobile width. Open the MORE tab. You should see:
- RECURRING section with `+ ADD` button next to the header
- Subtitle shows "N RULES · $X/MO"
- Tapping `+ ADD` opens RecurringFormSheet
- Save a new rule → close sheet → navigate to RECURRING detail → new rule appears

- [ ] **Step 6: Commit**

```
git add src/renderer/screens/mobile/More.jsx
git commit -m "feat: More — add entry point for recurring form, fix subtitle to show rule count"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| 5 frequencies: monthly, weekly, bi-weekly, annual, custom | Task 2 (`getOccurrences`) |
| In-place BILLS migration on load | Task 3 (migrateBills useEffect) |
| Seed data extended; 2 non-monthly examples | Task 1 |
| `billKey` format: `${rule.id}\|${occurrenceDate}` | Task 2 (`isBillPaymentFor`, `markRecurringPaid`) |
| Old-format fallback match | Task 2 (`isBillPaymentFor` legacy branch) |
| Inactive rules excluded from billRows | Task 2 (`if rule.active === false continue`) |
| Annual rules excluded when period ≠ rule.month | Task 2 (`getOccurrences` annual branch) |
| `addRecurring`, `updateRecurring`, `deleteRecurring`, `markRecurringPaid` store actions | Task 3 |
| `markBillPaid` alias preserved | Task 3 |
| `RecurringFormSheet` with all 8 field groups | Task 4 |
| ACTIVE toggle only in edit mode | Task 4 |
| Mobile `+ ADD` entry in More.jsx | Task 7 |
| Web inline add/edit panel in WebBills | Task 6 |
| Income rows: green amount, ↑ glyph | Tasks 5, 6 |
| Mark-as-posted: `markRecurringPaid(rule, row.dueDate)` | Tasks 5, 6 |
| PAY button absent when status = paid | Tasks 5, 6 |
| BillsHub renamed from BILLS split to unified RECURRING list | Task 5 |
| WebBills renamed to RECURRING | Task 6 |
| FREQ label shown per row | Tasks 5, 6 |

### Type Consistency Check

- `getOccurrences(rule, period) → string[]` — used identically in `buildBillRows`
- `markRecurringPaid(rule, occurrenceDate) → Transaction` — imported as `createRecurringPayment` in store, called with `(b, b.dueDate)` in UI
- Row key format `${rule.id}|${occDate}` — consistent across `buildBillRows`, `isBillPaymentFor`, and `markRecurringPaid`
- `editRule` prop accepted by both `RecurringFormSheet` and `RecurringPanel` — same shape (full rule object from `bills` store array)
- `bills` array exposed in store context — consumed by BillsHub `openEditForm` and WebBills `openEdit` to look up full rule from `b.id`
