# Account Transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class account transfer support — paired debit/credit transactions linked by a `transferId`, excluded from budgets, with a dedicated form tab and neutral list display.

**Architecture:** Transfers are two regular transactions in `ledger:tx` sharing a `transferId` field (`cat: 'transfer'`). The existing balance formula and storage layer need no changes — each leg belongs to its own account. Budget calculations filter out `cat === 'transfer'` before computing spending. The Add forms gain a third TRANSFER toggle that renders a different form and calls a new `createTransfer` store action.

**Tech Stack:** React 19, localStorage via `useLS`, inline styles with `A` theme tokens. No test framework — verification is manual in the running app (`npm run dev`).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/data.js` | Modify | Replace seed `t17` with two proper transfer legs |
| `src/renderer/period.mjs` | Modify | Filter transfers out of budget spending calc |
| `src/renderer/store.jsx` | Modify | Add `createTransfer`, `deleteTransfer` actions; expose in context |
| `src/renderer/screens/mobile/AddSheet.jsx` | Modify | Add TRANSFER toggle + form; read-only transfer detail view |
| `src/renderer/screens/web/WebAddModal.jsx` | Modify | Same as AddSheet for desktop |
| `src/renderer/screens/mobile/Transactions.jsx` | Modify | `⇄` glyph, neutral color, correct delete/tap for transfers |
| `src/renderer/screens/web/WebTransactions.jsx` | Modify | Same display + interaction for desktop |

---

## Task 1: Seed data + budget exclusion

**Files:**
- Modify: `src/renderer/data.js`
- Modify: `src/renderer/period.mjs`

- [ ] **Step 1: Replace t17 with paired transfer legs in `data.js`**

Find and replace the single `t17` entry:
```js
// REMOVE this line:
{ id: 't17', date: '2026-05-04', name: 'TRANSFER → SAVINGS',  acct: 'chk',  cat: 'income', path:['income','payroll'], amt:-1000.00, ccy: 'USD' },

// ADD these two lines in its place:
{ id: 'xfer_seed01_out', date: '2026-05-04', name: 'TRANSFER → ALLY SAVINGS',    acct: 'chk', ccy: 'USD', cat: 'transfer', path: [], amt: -1000.00, transferId: 'xfer_seed01', transferPeer: 'xfer_seed01_in'  },
{ id: 'xfer_seed01_in',  date: '2026-05-04', name: 'TRANSFER ← CHASE CHECKING',  acct: 'sav', ccy: 'USD', cat: 'transfer', path: [], amt:  1000.00, transferId: 'xfer_seed01', transferPeer: 'xfer_seed01_out' },
```

- [ ] **Step 2: Filter transfers from budget spending in `period.mjs`**

Open `src/renderer/period.mjs` and locate `buildBudgetRows`. Add the filter as the first line of its body:
```js
transactions = transactions.filter(tx => tx.cat !== 'transfer');
```

- [ ] **Step 3: Start the dev server and verify**

Run: `npm run dev`

Open the app. Navigate to Budgets. Confirm budget spending totals are unchanged (the old `t17` was mis-tagged `income/payroll` so it didn't affect spending anyway — what matters is the new seed entries don't inflate any budget category).

Navigate to Accounts — confirm Checking balance decreased by $1000 and Savings increased by $1000 compared to before (net transfer properly reflected).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/data.js src/renderer/period.mjs
git commit -m "feat: transfer seed data + budget exclusion filter"
```

---

## Task 2: Store actions — `createTransfer` and `deleteTransfer`

**Files:**
- Modify: `src/renderer/store.jsx`

- [ ] **Step 1: Add `createTransfer` after the existing `deleteTx` callback (around line 102)**

```js
const createTransfer = React.useCallback(({ fromAcct, toAcct, amtFrom, amtTo, date, note }) => {
  const id = 'xfer_' + Date.now();
  const fromAcctObj = accounts.find(a => a.id === fromAcct);
  const toAcctObj   = accounts.find(a => a.id === toAcct);
  const outName = note || ('TRANSFER → ' + (toAcctObj?.name   || toAcct));
  const inName  = note || ('TRANSFER ← ' + (fromAcctObj?.name || fromAcct));
  const outLeg = {
    id: id + '_out', name: outName,
    amt: -Math.abs(amtFrom), date, acct: fromAcct,
    ccy: fromAcctObj?.ccy || 'USD',
    cat: 'transfer', path: [],
    transferId: id, transferPeer: id + '_in',
    ...(note ? { note } : {}),
  };
  const inLeg = {
    id: id + '_in', name: inName,
    amt: Math.abs(amtTo), date, acct: toAcct,
    ccy: toAcctObj?.ccy || 'USD',
    cat: 'transfer', path: [],
    transferId: id, transferPeer: id + '_out',
    ...(note ? { note } : {}),
  };
  setTxs(prev => [...prev, outLeg, inLeg]);
}, [accounts, setTxs]);
```

- [ ] **Step 2: Add `deleteTransfer` after `createTransfer`**

```js
const deleteTransfer = React.useCallback(transferId => {
  setTxs(prev => prev.filter(tx => tx.transferId !== transferId));
}, [setTxs]);
```

- [ ] **Step 3: Expose both in the context value**

In the `StoreCtx.Provider value={{...}}` block (around line 190), add after `deleteTx`:
```js
createTransfer,
deleteTransfer,
```

- [ ] **Step 4: Update `reset()` to clear any user-created transfers**

`reset()` already calls `setTxs(TRANSACTIONS)` which replaces all transactions with seed data — the new paired seed entries are already in `TRANSACTIONS`, so no change needed here.

- [ ] **Step 5: Verify in console**

With the dev server running, open browser DevTools → Console. In the React DevTools or via the store context, confirm `createTransfer` and `deleteTransfer` appear in the store. No visual test yet — UI comes in Tasks 3–4.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/store.jsx
git commit -m "feat: add createTransfer and deleteTransfer store actions"
```

---

## Task 3: Mobile AddSheet — TRANSFER tab

**Files:**
- Modify: `src/renderer/screens/mobile/AddSheet.jsx`

The current AddSheet has `EXPENSE | INCOME` toggles and common fields (`amt`, `merchant`, `isExpense`, `cat`, `acct`, `date`). We add a third mode (`isTransfer`) with its own form fields.

- [ ] **Step 1: Add transfer state and destructure `createTransfer` from the store**

Replace the existing `useStore` destructure line:
```js
// BEFORE:
const { addTransactions, updateTx, deleteTx, accountsWithBalance, selectedPeriod } = useStore();

// AFTER:
const { addTransactions, updateTx, deleteTx, deleteTransfer, createTransfer, accountsWithBalance, selectedPeriod } = useStore();
```

Add new state after the existing `useState` declarations:
```js
const [isTransfer, setIsTransfer] = React.useState(editTx?.cat === 'transfer');
const [fromAcct, setFromAcct]     = React.useState(editTx?.acct || accountsWithBalance[0]?.id || 'chk');
const [toAcct, setToAcct]         = React.useState(() => {
  const others = accountsWithBalance.filter(a => a.id !== (editTx?.acct || accountsWithBalance[0]?.id));
  return others[0]?.id || '';
});
const [amtFrom, setAmtFrom]       = React.useState('');
const [amtTo, setAmtTo]           = React.useState('');
const [transferNote, setTransferNote] = React.useState('');
```

- [ ] **Step 2: Add cross-currency helper and canSave update**

After the state declarations, add:
```js
const fromAcctObj   = accountsWithBalance.find(a => a.id === fromAcct);
const toAcctObj     = accountsWithBalance.find(a => a.id === toAcct);
const isCrossCcy    = fromAcctObj?.ccy !== toAcctObj?.ccy;
const impliedRate   = isCrossCcy && parseFloat(amtFrom) > 0 && parseFloat(amtTo) > 0
  ? (parseFloat(amtTo) / parseFloat(amtFrom)).toFixed(4)
  : null;
```

Replace the `canSave` line:
```js
const canSave = isTransfer
  ? parseFloat(amtFrom) > 0 && parseFloat(amtTo) > 0 && fromAcct && toAcct && fromAcct !== toAcct
  : amt && parseFloat(amt) > 0 && merchant.trim();
```

- [ ] **Step 3: Update `handleSave` to branch on `isTransfer`**

Replace the existing `handleSave` function:
```js
const handleSave = () => {
  if (!canSave) return;
  if (isTransfer) {
    createTransfer({
      fromAcct, toAcct,
      amtFrom: parseFloat(amtFrom),
      amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
      date,
      note: transferNote.trim() || undefined,
    });
  } else {
    const changes = {
      name: merchant.trim(),
      amt: isExpense ? -Math.abs(parseFloat(amt)) : Math.abs(parseFloat(amt)),
      date, cat, ccy: editTx?.ccy || 'USD', acct,
    };
    if (editTx) {
      updateTx(editTx.id, changes);
    } else {
      addTransactions([{ id: 'add_' + Date.now(), ...changes }]);
    }
  }
  onClose();
};
```

- [ ] **Step 4: Update `handleDelete` for transfers**

Replace the existing `handleDelete`:
```js
const handleDelete = () => {
  if (editTx?.transferId) {
    deleteTransfer(editTx.transferId);
  } else {
    deleteTx(editTx.id);
  }
  onClose();
};
```

- [ ] **Step 5: Add TRANSFER toggle button to the toggle row**

Find the toggle buttons JSX (the `[['EXPENSE', true], ['INCOME', false]].map(...)` block). Replace it with:
```jsx
<div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
  {[['EXPENSE', 'exp'], ['INCOME', 'inc'], ['TRANSFER', 'xfer']].map(([label, mode]) => {
    const active = mode === 'xfer' ? isTransfer : (!isTransfer && (mode === 'exp') === isExpense);
    return (
      <button key={label} onClick={() => {
        if (mode === 'xfer') { setIsTransfer(true); }
        else { setIsTransfer(false); setIsExpense(mode === 'exp'); }
      }} style={{
        all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
        padding: '7px', fontSize: 10, letterSpacing: 1.4,
        border: '1px solid ' + (active ? A.ink : A.rule2),
        background: active ? A.ink : 'transparent',
        color: active ? A.bg : A.ink,
      }}>{label}</button>
    );
  })}
</div>
```

- [ ] **Step 6: Add the transfer form (rendered when `isTransfer && !editTx`)**

After the toggle row JSX (before the existing amount/merchant/category fields), add a conditional block. Wrap all the existing fields in `{!isTransfer && ( ... )}`. Then add the transfer form:

```jsx
{isTransfer && !editTx && (
  <div style={{ marginTop: 12 }}>
    <div style={{ marginBottom: 14 }}>
      <ALabel>FROM</ALabel>
      <select value={fromAcct} onChange={e => { setFromAcct(e.target.value); if (toAcct === e.target.value) setToAcct(''); }}
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }}>
        {accountsWithBalance.map(a => <option key={a.id} value={a.id}>{a.name} · {a.code}</option>)}
      </select>
    </div>
    <div style={{ marginBottom: 14 }}>
      <ALabel>TO</ALabel>
      <select value={toAcct} onChange={e => setToAcct(e.target.value)}
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }}>
        {accountsWithBalance.filter(a => a.id !== fromAcct).map(a => <option key={a.id} value={a.id}>{a.name} · {a.code}</option>)}
      </select>
    </div>
    <div style={{ marginBottom: 14 }}>
      <ALabel>{'AMOUNT · ' + (fromAcctObj?.ccy || 'USD')}</ALabel>
      <input autoFocus type="number" min="0" step="0.01" placeholder="0.00"
        value={amtFrom} onChange={e => { setAmtFrom(e.target.value); if (!isCrossCcy) setAmtTo(e.target.value); }}
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 28, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }} />
    </div>
    {isCrossCcy && (
      <div style={{ marginBottom: 14 }}>
        <ALabel>{'RECEIVED · ' + (toAcctObj?.ccy || '')}</ALabel>
        <input type="number" min="0" step="0.01" placeholder="0.00"
          value={amtTo} onChange={e => setAmtTo(e.target.value)}
          style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 28, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }} />
        {impliedRate && (
          <div style={{ fontSize: 10, color: A.muted, marginTop: 4, letterSpacing: 0.8 }}>
            {'1 ' + fromAcctObj.ccy + ' = ' + impliedRate + ' ' + toAcctObj.ccy}
          </div>
        )}
      </div>
    )}
    <div style={{ marginBottom: 14 }}>
      <ALabel>DATE</ALabel>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }} />
    </div>
    <div style={{ marginBottom: 14 }}>
      <ALabel>NOTE (OPTIONAL)</ALabel>
      <input value={transferNote} onChange={e => setTransferNote(e.target.value)}
        placeholder="e.g. RENT SAVINGS"
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 13, letterSpacing: 0.6, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }} />
    </div>
  </div>
)}
```

- [ ] **Step 7: Add read-only transfer detail view (for `editTx.cat === 'transfer'`)**

When `editTx` is a transfer, show a minimal read-only view instead of the edit form. After the toggle row (while still inside the sheet container), add:

```jsx
{isTransfer && editTx && (
  <div style={{ marginTop: 16 }}>
    <div style={{ fontSize: 12, color: A.muted, letterSpacing: 1, marginBottom: 12 }}>TRANSFER DETAIL</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + A.rule2 }}>
      <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>NAME</span>
      <span style={{ fontSize: 12 }}>{editTx.name}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + A.rule2 }}>
      <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>DATE</span>
      <span style={{ fontSize: 12 }}>{editTx.date}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + A.rule2 }}>
      <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>AMOUNT</span>
      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{Math.abs(editTx.amt).toFixed(2)} {editTx.ccy}</span>
    </div>
    {editTx.note && (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + A.rule2 }}>
        <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>NOTE</span>
        <span style={{ fontSize: 12 }}>{editTx.note}</span>
      </div>
    )}
    <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.8, marginTop: 12, lineHeight: 1.5 }}>
      Editing transfers is not supported. Delete both legs and re-enter to correct.
    </div>
  </div>
)}
```

Make sure the existing non-transfer form fields are hidden when `isTransfer` is true. Ensure `{!isTransfer && ( <amount/merchant/cat/acct fields> )}` wraps all the normal fields.

- [ ] **Step 8: Verify mobile transfer flow**

Open the app in mobile viewport. Tap ADD → select TRANSFER. Confirm:
- FROM / TO pickers show all accounts
- Same-currency: RECEIVED field is absent, amount mirrors FROM
- Switch FROM to `WISE EUR` (EUR account): RECEIVED field appears and is editable; implied rate shows below
- Fill valid data → SAVE → two entries appear in Transactions list
- Tap either transfer row → sheet opens showing read-only detail with DELETE button
- DELETE removes both legs

- [ ] **Step 9: Commit**

```bash
git add src/renderer/screens/mobile/AddSheet.jsx
git commit -m "feat: add TRANSFER tab to mobile AddSheet"
```

---

## Task 4: Web WebAddModal — TRANSFER tab

**Files:**
- Modify: `src/renderer/screens/web/WebAddModal.jsx`

Identical logic to Task 3 but adapted to WebAddModal's layout (centered modal, larger padding, Enter key handler).

- [ ] **Step 1: Destructure new store actions**

```js
// BEFORE:
const { addTransactions, updateTx, deleteTx, accountsWithBalance, selectedPeriod } = useStore();

// AFTER:
const { addTransactions, updateTx, deleteTx, deleteTransfer, createTransfer, accountsWithBalance, selectedPeriod } = useStore();
```

- [ ] **Step 2: Add transfer state (same as Task 3 Step 1)**

```js
const [isTransfer, setIsTransfer] = React.useState(editTx?.cat === 'transfer');
const [fromAcct, setFromAcct]     = React.useState(editTx?.acct || accountsWithBalance[0]?.id || 'chk');
const [toAcct, setToAcct]         = React.useState(() => {
  const others = accountsWithBalance.filter(a => a.id !== (editTx?.acct || accountsWithBalance[0]?.id));
  return others[0]?.id || '';
});
const [amtFrom, setAmtFrom]       = React.useState('');
const [amtTo, setAmtTo]           = React.useState('');
const [transferNote, setTransferNote] = React.useState('');
```

- [ ] **Step 3: Add helpers and update `canSave` (same as Task 3 Step 2)**

```js
const fromAcctObj = accountsWithBalance.find(a => a.id === fromAcct);
const toAcctObj   = accountsWithBalance.find(a => a.id === toAcct);
const isCrossCcy  = fromAcctObj?.ccy !== toAcctObj?.ccy;
const impliedRate = isCrossCcy && parseFloat(amtFrom) > 0 && parseFloat(amtTo) > 0
  ? (parseFloat(amtTo) / parseFloat(amtFrom)).toFixed(4)
  : null;
```

```js
const canSave = isTransfer
  ? parseFloat(amtFrom) > 0 && parseFloat(amtTo) > 0 && fromAcct && toAcct && fromAcct !== toAcct
  : amt && parseFloat(amt) > 0 && merchant.trim();
```

- [ ] **Step 4: Update `handleSave` (same as Task 3 Step 3)**

```js
const handleSave = () => {
  if (!canSave) return;
  if (isTransfer) {
    createTransfer({
      fromAcct, toAcct,
      amtFrom: parseFloat(amtFrom),
      amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
      date,
      note: transferNote.trim() || undefined,
    });
  } else {
    const changes = {
      name: merchant.trim(),
      amt: isExpense ? -Math.abs(parseFloat(amt)) : Math.abs(parseFloat(amt)),
      date, cat, ccy: editTx?.ccy || 'USD', acct,
    };
    if (editTx) {
      updateTx(editTx.id, changes);
    } else {
      addTransactions([{ id: 'add_' + Date.now(), ...changes }]);
    }
  }
  onClose();
};
```

- [ ] **Step 5: Update `handleDelete` (same as Task 3 Step 4)**

```js
const handleDelete = () => {
  if (editTx?.transferId) {
    deleteTransfer(editTx.transferId);
  } else {
    deleteTx(editTx.id);
  }
  onClose();
};
```

- [ ] **Step 6: Add TRANSFER toggle to the toggle row**

Replace the existing `[['EXPENSE', true], ['INCOME', false]].map(...)` block:
```jsx
<div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
  {[['EXPENSE', 'exp'], ['INCOME', 'inc'], ['TRANSFER', 'xfer']].map(([label, mode]) => {
    const active = mode === 'xfer' ? isTransfer : (!isTransfer && (mode === 'exp') === isExpense);
    return (
      <button key={label} onClick={() => {
        if (mode === 'xfer') { setIsTransfer(true); }
        else { setIsTransfer(false); setIsExpense(mode === 'exp'); }
      }} style={{
        all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
        padding: '8px', fontSize: 10, letterSpacing: 1.4,
        border: '1px solid ' + (active ? A.ink : A.rule2),
        background: active ? A.ink : 'transparent',
        color: active ? A.bg : A.ink,
      }}>{label}</button>
    );
  })}
</div>
```

- [ ] **Step 7: Wrap existing fields in `{!isTransfer && (...)}`, add transfer form**

Wrap the amount, merchant, date, category, and account sections in `{!isTransfer && (...)}`.

Then add the transfer form after the toggle row (inside the modal, before `<ARule />`):

```jsx
{isTransfer && !editTx && (
  <div>
    <div style={{ marginBottom: 16 }}>
      <ALabel>FROM ACCOUNT</ALabel>
      <select value={fromAcct} onChange={e => { setFromAcct(e.target.value); if (toAcct === e.target.value) setToAcct(''); }}
        style={{ marginTop: 8, width: '100%', fontFamily: A.font, fontSize: 13, padding: 8, border: '1px solid ' + A.ink, background: A.bg, color: A.ink }}>
        {accountsWithBalance.map(a => <option key={a.id} value={a.id}>{a.name} · {a.code}</option>)}
      </select>
    </div>
    <div style={{ marginBottom: 16 }}>
      <ALabel>TO ACCOUNT</ALabel>
      <select value={toAcct} onChange={e => setToAcct(e.target.value)}
        style={{ marginTop: 8, width: '100%', fontFamily: A.font, fontSize: 13, padding: 8, border: '1px solid ' + A.ink, background: A.bg, color: A.ink }}>
        {accountsWithBalance.filter(a => a.id !== fromAcct).map(a => <option key={a.id} value={a.id}>{a.name} · {a.code}</option>)}
      </select>
    </div>
    <div style={{ marginBottom: 16 }}>
      <ALabel>{'AMOUNT · ' + (fromAcctObj?.ccy || 'USD')}</ALabel>
      <input autoFocus type="number" min="0" step="0.01" placeholder="0.00"
        value={amtFrom} onChange={e => { setAmtFrom(e.target.value); if (!isCrossCcy) setAmtTo(e.target.value); }}
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink, boxSizing: 'border-box' }} />
    </div>
    {isCrossCcy && (
      <div style={{ marginBottom: 16 }}>
        <ALabel>{'RECEIVED · ' + (toAcctObj?.ccy || '')}</ALabel>
        <input type="number" min="0" step="0.01" placeholder="0.00"
          value={amtTo} onChange={e => setAmtTo(e.target.value)}
          style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink, boxSizing: 'border-box' }} />
        {impliedRate && (
          <div style={{ fontSize: 10, color: A.muted, marginTop: 4, letterSpacing: 0.8 }}>
            {'1 ' + fromAcctObj.ccy + ' = ' + impliedRate + ' ' + toAcctObj.ccy}
          </div>
        )}
      </div>
    )}
    <div style={{ marginBottom: 16 }}>
      <ALabel>DATE</ALabel>
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }} />
    </div>
    <div style={{ marginBottom: 16 }}>
      <ALabel>NOTE (OPTIONAL)</ALabel>
      <input value={transferNote} onChange={e => setTransferNote(e.target.value)}
        placeholder="e.g. RENT SAVINGS"
        onKeyDown={e => e.key === 'Enter' && handleSave()}
        style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 14, letterSpacing: 0.6, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }} />
    </div>
  </div>
)}
```

- [ ] **Step 8: Add read-only transfer detail view for `editTx.cat === 'transfer'`**

```jsx
{isTransfer && editTx && (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 11, color: A.muted, letterSpacing: 1, marginBottom: 12 }}>TRANSFER DETAIL · READ ONLY</div>
    {[['NAME', editTx.name], ['DATE', editTx.date], ['AMOUNT', Math.abs(editTx.amt).toFixed(2) + ' ' + editTx.ccy]].map(([k, v]) => (
      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + A.rule2 }}>
        <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>{k}</span>
        <span style={{ fontSize: 12 }}>{v}</span>
      </div>
    ))}
    {editTx.note && (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + A.rule2 }}>
        <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>NOTE</span>
        <span style={{ fontSize: 12 }}>{editTx.note}</span>
      </div>
    )}
    <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.8, marginTop: 12, lineHeight: 1.5 }}>
      Editing transfers is not supported. Delete both legs and re-enter to correct.
    </div>
  </div>
)}
```

- [ ] **Step 9: Verify web transfer flow**

Open the app in full-width viewport. Click ADD → select TRANSFER. Confirm:
- FROM/TO selects show all accounts
- Same-currency: no RECEIVED field; AMOUNT mirrors to both legs
- Switch to cross-currency accounts: RECEIVED appears; implied rate displays
- Save → two rows appear in Transactions
- Click either row → modal shows read-only detail + DELETE
- DELETE removes both

- [ ] **Step 10: Commit**

```bash
git add src/renderer/screens/web/WebAddModal.jsx
git commit -m "feat: add TRANSFER tab to web WebAddModal"
```

---

## Task 5: Transaction list display — glyph, color, interaction

**Files:**
- Modify: `src/renderer/screens/mobile/Transactions.jsx`
- Modify: `src/renderer/screens/web/WebTransactions.jsx`

- [ ] **Step 1: Update mobile `SwipeRow` to detect transfers**

In `Transactions.jsx`, `SwipeRow` currently receives `onDelete` and `onTap`. We need to pass `deleteTransfer` down and detect transfer rows.

First update the `Transactions` component to destructure `deleteTransfer`:
```js
const { periodTransactions, deleteTx, deleteTransfer, accountsWithBalance, periodLabel } = useStore();
```

Update the `SwipeRow` usage inside the map:
```jsx
<SwipeRow
  key={tx.id}
  t={t}
  tx={tx}
  onDelete={() => tx.transferId ? deleteTransfer(tx.transferId) : deleteTx(tx.id)}
  onTap={() => setEditTx(tx)}
  accountsWithBalance={accountsWithBalance}
/>
```

- [ ] **Step 2: Update `SwipeRow` glyph and amount color for transfers**

In the `SwipeRow` render, find these two lines and update them:

```jsx
// BEFORE — glyph:
{catGlyph(tx.path || [tx.cat])}

// AFTER:
{tx.cat === 'transfer' ? '⇄' : catGlyph(tx.path || [tx.cat])}
```

```jsx
// BEFORE — amount color:
color: tx.amt >= 0 ? t.accent : A.ink

// AFTER:
color: tx.cat === 'transfer' ? A.ink2 : (tx.amt >= 0 ? t.accent : A.ink)
```

- [ ] **Step 3: Handle transfer tap in mobile `Transactions`**

`setEditTx(tx)` opens `AddSheet` with `editTx={tx}`. Since `AddSheet` already handles `editTx.cat === 'transfer'` (Task 3 Step 7), this works as-is. No change needed here.

- [ ] **Step 4: Update `WebTransactions` row glyph and amount color**

In `WebTransactions.jsx`, find the row render (around line 88–96). Update:

```jsx
// BEFORE — glyph cell:
<div>{catGlyph(tx.path || [tx.cat])}</div>

// AFTER:
<div>{tx.cat === 'transfer' ? '⇄' : catGlyph(tx.path || [tx.cat])}</div>
```

```jsx
// BEFORE — category cell:
<div style={{ color: A.ink2, fontSize: 10, ... }}>
  {catBreadcrumb(tx.path || [tx.cat])}
</div>

// AFTER:
<div style={{ color: A.ink2, fontSize: 10, ... }}>
  {tx.cat === 'transfer' ? 'TRANSFER' : catBreadcrumb(tx.path || [tx.cat])}
</div>
```

```jsx
// BEFORE — amount color:
color: tx.amt >= 0 ? t.accent : A.ink

// AFTER:
color: tx.cat === 'transfer' ? A.ink2 : (tx.amt >= 0 ? t.accent : A.ink)
```

- [ ] **Step 5: Handle transfer click in `WebTransactions`**

`setEditTx(tx)` opens `WebAddModal` with `editTx={tx}`. Since `WebAddModal` handles `editTx.cat === 'transfer'` (Task 4 Step 8), no extra change needed.

- [ ] **Step 6: Final verification**

Open the app. Navigate to Transactions.

**Mobile viewport:**
- Confirm the seed transfer (`TRANSFER → ALLY SAVINGS` / `TRANSFER ← CHASE CHECKING`) shows `⇄` glyph and amount in neutral `A.ink2` (grey, not green or black)
- Swipe left on a transfer row → both legs disappear
- Tap a transfer row → read-only sheet opens

**Desktop viewport:**
- Same rows show `⇄` glyph, `TRANSFER` in category column, neutral amount color
- Click a row → read-only modal opens with DELETE button
- DELETE → both legs removed

**Budgets:** Go to Budgets screen — verify no budget category shows inflated spending from the transfer.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/screens/mobile/Transactions.jsx src/renderer/screens/web/WebTransactions.jsx
git commit -m "feat: transfer display — glyph, neutral color, paired delete"
```
