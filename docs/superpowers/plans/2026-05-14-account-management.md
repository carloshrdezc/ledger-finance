# Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full account CRUD (add, edit, archive, delete, reorder) to the existing Accounts screens on both desktop and mobile.

**Architecture:** Inline editing on the existing Accounts screens — no new routes or pages. A shared form component (one for desktop modal, one for mobile sheet) handles add and edit. The store gains four new account actions plus an `allAccountsWithBalance` selector that includes archived accounts.

**Tech Stack:** React 19, inline styles with `theme.js` tokens, localStorage via `useLS`, HTML5 drag-and-drop (desktop reorder), up/down buttons (mobile reorder).

---

### Task 1: Add `archived` and `order` to seed accounts

**Files:**
- Modify: `src/renderer/data.js:1-10`

This prevents existing localStorage data from having missing fields — the store's memos use `?? 0` and `!acct.archived` guards so old data still works. The seed data should be canonical.

- [ ] **Step 1: Update ACCOUNTS in data.js**

Replace the current ACCOUNTS export with:

```js
export const ACCOUNTS = [
  { id: 'chk',  name: 'CHASE CHECKING',  type: 'CHK', code: '··4218', openingBal:  -1223.33, ccy: 'USD', archived: false, order: 0 },
  { id: 'sav',  name: 'ALLY SAVINGS',    type: 'SAV', code: '··9931', openingBal:  24618.00, ccy: 'USD', archived: false, order: 1 },
  { id: 'amex', name: 'AMEX PLATINUM',   type: 'CC',  code: '··1009', openingBal:    150.46, ccy: 'USD', archived: false, order: 2 },
  { id: 'csp',  name: 'CHASE SAPPHIRE',  type: 'CC',  code: '··7720', openingBal:    453.40, ccy: 'USD', archived: false, order: 3 },
  { id: 'vti',  name: 'VANGUARD VTI',    type: 'INV', code: 'BROK',   openingBal: 187201.00, ccy: 'USD', archived: false, order: 4 },
  { id: '401k', name: 'FIDELITY 401(K)', type: 'INV', code: 'IRA',    openingBal:  92140.00, ccy: 'USD', archived: false, order: 5 },
  { id: 'btc',  name: 'COINBASE BTC',    type: 'CRY', code: '0.612',  openingBal:  42180.00, ccy: 'USD', archived: false, order: 6 },
  { id: 'eur',  name: 'WISE EUR',        type: 'FX',  code: 'EUR',    openingBal:   1316.25, ccy: 'EUR', archived: false, order: 7 },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/data.js
git commit -m "feat: add archived/order fields to seed accounts"
```

---

### Task 2: Extend the store with account CRUD actions

**Files:**
- Modify: `src/renderer/store.jsx`

The existing `addAccount` is an upsert used only internally. We refactor it to a true add and add four new actions. `accountsWithBalance` now filters archived; `allAccountsWithBalance` includes them.

- [ ] **Step 1: Replace the `accountsWithBalance` memo and add `allAccountsWithBalance`**

Find the existing `accountsWithBalance` memo (lines 73–84) and replace it with:

```js
  const allAccountsWithBalance = React.useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return accounts
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(acct => {
        const acctTxs = transactions.filter(tx => tx.acct === acct.id);
        const balance = acct.openingBal + acctTxs.reduce((s, tx) => s + tx.amt, 0);
        const delta = acctTxs
          .filter(tx => tx.date?.startsWith(thisMonth))
          .reduce((s, tx) => s + tx.amt, 0);
        return { ...acct, balance, delta };
      });
  }, [accounts, transactions]);

  const accountsWithBalance = React.useMemo(
    () => allAccountsWithBalance.filter(a => !a.archived),
    [allAccountsWithBalance],
  );
```

- [ ] **Step 2: Replace the existing `addAccount` with a true-add and add the four new actions**

Find the existing `addAccount` callback (lines 113–117) and replace it with:

```js
  const addAccount = React.useCallback(acct => setAccounts(prev => [
    ...prev,
    { archived: false, order: prev.filter(a => !a.archived).length, ...acct },
  ]), [setAccounts]);

  const updateAccount = React.useCallback((id, patch) => setAccounts(prev =>
    prev.map(a => a.id === id ? { ...a, ...patch } : a)
  ), [setAccounts]);

  const archiveAccount = React.useCallback(id => setAccounts(prev =>
    prev.map(a => a.id === id ? { ...a, archived: true } : a)
  ), [setAccounts]);

  const deleteAccount = React.useCallback(id => setAccounts(prev =>
    prev.filter(a => a.id !== id)
  ), [setAccounts]);

  const reorderAccounts = React.useCallback(orderedIds => setAccounts(prev => {
    const byId = Object.fromEntries(prev.map(a => [a.id, a]));
    const reordered = orderedIds.map((id, i) => ({ ...byId[id], order: i }));
    const untouched = prev.filter(a => !orderedIds.includes(a.id));
    return [...reordered, ...untouched];
  }), [setAccounts]);
```

- [ ] **Step 3: Export the new actions and `allAccountsWithBalance` in the context value**

Find the `StoreCtx.Provider value={{...}}` block (around line 156) and add these lines inside the value object (alongside the existing `accounts`, `accountsWithBalance`, `setAccounts`, `addAccount`):

```js
      allAccountsWithBalance,
      updateAccount,
      archiveAccount,
      deleteAccount,
      reorderAccounts,
```

- [ ] **Step 4: Verify the app still loads**

Run `npm run dev`. Open the Accounts screen. Confirm all 8 accounts are visible with correct balances. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store.jsx
git commit -m "feat: account CRUD actions + allAccountsWithBalance in store"
```

---

### Task 3: Create `AccountFormModal` (desktop add/edit)

**Files:**
- Create: `src/renderer/components/AccountFormModal.jsx`

Follows the same modal pattern as `WebAddModal.jsx` — fixed overlay, centered box with `border: '2px solid ' + A.ink`.

- [ ] **Step 1: Create the file**

```jsx
import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { useStore } from '../store';

const ACCOUNT_TYPES = [
  { value: 'CHK',  label: 'Checking' },
  { value: 'SAV',  label: 'Savings' },
  { value: 'CC',   label: 'Credit Card' },
  { value: 'INV',  label: 'Investment' },
  { value: 'CRY',  label: 'Crypto' },
  { value: 'FX',   label: 'Foreign' },
  { value: 'LOAN', label: 'Loan' },
  { value: 'CASH', label: 'Cash' },
];

function defaultOpeningDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function AccountFormModal({ t, onClose, editAccount = null }) {
  const { addAccount, updateAccount, archiveAccount, deleteAccount, transactions } = useStore();

  const [name, setName]             = React.useState(editAccount?.name ?? '');
  const [type, setType]             = React.useState(editAccount?.type ?? 'CHK');
  const [openingBal, setOpeningBal] = React.useState(editAccount != null ? String(editAccount.openingBal) : '');
  const [openingDate, setOpeningDate] = React.useState(editAccount?.openingDate ?? defaultOpeningDate());
  const [archiving, setArchiving]   = React.useState(false);

  const txCount  = editAccount ? transactions.filter(tx => tx.acct === editAccount.id).length : 0;
  const canDelete = editAccount && txCount === 0;
  const canSave   = name.trim() && openingBal !== '' && !isNaN(parseFloat(openingBal));

  const handleSave = () => {
    if (!canSave) return;
    const fields = {
      name: name.trim().toUpperCase(),
      type,
      openingBal: parseFloat(openingBal),
      openingDate,
      ccy: editAccount?.ccy ?? 'USD',
      code: editAccount?.code ?? '',
    };
    if (archiving) {
      archiveAccount(editAccount.id);
    } else if (editAccount) {
      updateAccount(editAccount.id, fields);
    } else {
      addAccount({ id: 'acct_' + Date.now(), ...fields });
    }
    onClose();
  };

  const handleDelete = () => { deleteAccount(editAccount.id); onClose(); };

  React.useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const input = {
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: '1px solid ' + A.ink, color: A.ink,
    fontFamily: A.font, fontSize: 13, padding: '6px 0', outline: 'none',
    boxSizing: 'border-box',
  };
  const fieldLabel = { fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,15,0.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: A.bg, border: '2px solid ' + A.ink,
        width: 420, padding: 32, fontFamily: A.font,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <ALabel>{editAccount ? 'EDIT · ACCOUNT' : 'NEW · ACCOUNT'}</ALabel>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>ESC ×</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={fieldLabel}>NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="E.G. CHASE CHECKING" style={input} autoFocus />
          </div>
          <div>
            <div style={fieldLabel}>TYPE</div>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {ACCOUNT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>OPENING BALANCE</div>
            <input type="number" value={openingBal} onChange={e => setOpeningBal(e.target.value)} placeholder="0.00" style={input} />
          </div>
          <div>
            <div style={fieldLabel}>OPENING DATE</div>
            <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} style={input} />
          </div>
        </div>

        {editAccount && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid ' + A.rule2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 11, letterSpacing: 1 }}>
              <input type="checkbox" checked={archiving} onChange={e => setArchiving(e.target.checked)} />
              ARCHIVE THIS ACCOUNT
            </label>
            {archiving && (
              <div style={{ fontSize: 10, color: A.muted, marginTop: 6 }}>
                Account will be hidden. Transactions are preserved.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {canDelete && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1 }}>
                DELETE ACCOUNT
              </button>
            )}
          </div>
          <button onClick={handleSave} disabled={!canSave} style={{
            all: 'unset', cursor: canSave ? 'pointer' : 'default', fontSize: 11,
            letterSpacing: 1.5, padding: '8px 20px',
            background: canSave ? A.ink : A.rule2,
            color: canSave ? A.bg : A.muted,
          }}>
            {archiving ? 'ARCHIVE' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/AccountFormModal.jsx
git commit -m "feat: AccountFormModal for desktop account add/edit"
```

---

### Task 4: Create `AccountFormSheet` (mobile add/edit)

**Files:**
- Create: `src/renderer/components/AccountFormSheet.jsx`

Same form logic as `AccountFormModal`; different container (slides up from bottom, matches `AddSheet.jsx` pattern).

- [ ] **Step 1: Create the file**

```jsx
import React from 'react';
import { A } from '../theme';
import { ARule } from './Shared';
import { useStore } from '../store';

const ACCOUNT_TYPES = [
  { value: 'CHK',  label: 'Checking' },
  { value: 'SAV',  label: 'Savings' },
  { value: 'CC',   label: 'Credit Card' },
  { value: 'INV',  label: 'Investment' },
  { value: 'CRY',  label: 'Crypto' },
  { value: 'FX',   label: 'Foreign' },
  { value: 'LOAN', label: 'Loan' },
  { value: 'CASH', label: 'Cash' },
];

function defaultOpeningDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function AccountFormSheet({ t, onClose, editAccount = null }) {
  const { addAccount, updateAccount, archiveAccount, deleteAccount, transactions } = useStore();

  const [name, setName]             = React.useState(editAccount?.name ?? '');
  const [type, setType]             = React.useState(editAccount?.type ?? 'CHK');
  const [openingBal, setOpeningBal] = React.useState(editAccount != null ? String(editAccount.openingBal) : '');
  const [openingDate, setOpeningDate] = React.useState(editAccount?.openingDate ?? defaultOpeningDate());
  const [archiving, setArchiving]   = React.useState(false);

  const txCount   = editAccount ? transactions.filter(tx => tx.acct === editAccount.id).length : 0;
  const canDelete = editAccount && txCount === 0;
  const canSave   = name.trim() && openingBal !== '' && !isNaN(parseFloat(openingBal));

  const handleSave = () => {
    if (!canSave) return;
    const fields = {
      name: name.trim().toUpperCase(),
      type,
      openingBal: parseFloat(openingBal),
      openingDate,
      ccy: editAccount?.ccy ?? 'USD',
      code: editAccount?.code ?? '',
    };
    if (archiving) {
      archiveAccount(editAccount.id);
    } else if (editAccount) {
      updateAccount(editAccount.id, fields);
    } else {
      addAccount({ id: 'acct_' + Date.now(), ...fields });
    }
    onClose();
  };

  const handleDelete = () => { deleteAccount(editAccount.id); onClose(); };

  const input = {
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: '1px solid ' + A.ink, color: A.ink,
    fontFamily: A.font, fontSize: 14, padding: '8px 0', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0,
      background: 'rgba(20,18,15,0.4)', zIndex: 30,
      animation: 'fadeIn .15s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: A.bg, padding: 18,
        borderTop: '2px solid ' + A.ink,
        animation: 'slideUp .2s ease-out',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
            {editAccount ? 'EDIT · ACCOUNT' : 'NEW · ACCOUNT'}
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>CANCEL</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="E.G. CHASE CHECKING" style={input} autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>TYPE</div>
            <select value={type} onChange={e => setType(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {ACCOUNT_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>OPENING BALANCE</div>
            <input type="number" value={openingBal} onChange={e => setOpeningBal(e.target.value)} placeholder="0.00" style={input} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>OPENING DATE</div>
            <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} style={input} />
          </div>
        </div>

        {editAccount && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid ' + A.rule2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12, letterSpacing: 1 }}>
              <input type="checkbox" checked={archiving} onChange={e => setArchiving(e.target.checked)} />
              ARCHIVE THIS ACCOUNT
            </label>
            {archiving && (
              <div style={{ fontSize: 10, color: A.muted, marginTop: 6 }}>
                Account will be hidden. Transactions are preserved.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {canDelete && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1 }}>
                DELETE
              </button>
            )}
          </div>
          <button onClick={handleSave} disabled={!canSave} style={{
            all: 'unset', cursor: canSave ? 'pointer' : 'default', fontSize: 11,
            letterSpacing: 1.5, padding: '10px 24px',
            background: canSave ? A.ink : A.rule2,
            color: canSave ? A.bg : A.muted,
          }}>
            {archiving ? 'ARCHIVE' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/AccountFormSheet.jsx
git commit -m "feat: AccountFormSheet for mobile account add/edit"
```

---

### Task 5: Update `WebAccounts` — add, edit, reorder, archive

**Files:**
- Modify: `src/renderer/screens/web/WebAccounts.jsx`

In reorder mode the screen switches to a flat draggable list. Normal mode shows the existing grouped view with an edit icon (✎) appended to each row.

- [ ] **Step 1: Replace the entire file content**

```jsx
import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import WebShell from './WebShell';
import AccountFormModal from '../../components/AccountFormModal';
import { fmtMoney, fmtSigned, dayLabel, catGlyph } from '../../data';
import { useStore } from '../../store';

const TYPE_LABELS = {
  CHK: 'CHECKING', SAV: 'SAVINGS', CC: 'CREDIT CARD',
  INV: 'INVESTMENT', CRY: 'CRYPTO', FX: 'FOREIGN',
  LOAN: 'LOAN', CASH: 'CASH',
};
const TYPE_ORDER = ['CHK', 'SAV', 'CC', 'INV', 'CRY', 'FX', 'LOAN', 'CASH'];

export default function WebAccounts({ t, onNavigate, onAdd }) {
  const { transactions, accountsWithBalance, allAccountsWithBalance, reorderAccounts } = useStore();
  const [selected, setSelected]       = React.useState(null);
  const [modalAccount, setModalAccount] = React.useState(undefined); // undefined=closed, null=new, obj=edit
  const [reorderMode, setReorderMode] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [dragIdx, setDragIdx]         = React.useState(null);
  const [overIdx, setOverIdx]         = React.useState(null);

  const archivedAccounts = (allAccountsWithBalance || []).filter(a => a.archived);
  const archivedCount    = archivedAccounts.length;

  const NET_WORTH = accountsWithBalance.reduce(
    (s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0
  );

  const acctTxs = selected ? transactions.filter(tx => tx.acct === selected) : [];

  // Flat sorted active accounts (used for reorder mode and drag logic)
  const flatSorted = [...accountsWithBalance].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleDragStart = idx => setDragIdx(idx);
  const handleDragOver  = (e, idx) => { e.preventDefault(); setOverIdx(idx); };
  const handleDrop      = () => {
    if (dragIdx === null || dragIdx === overIdx) { setDragIdx(null); setOverIdx(null); return; }
    const ids = flatSorted.map(a => a.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(overIdx, 0, moved);
    reorderAccounts(ids);
    setDragIdx(null);
    setOverIdx(null);
  };

  // Grouped by type for normal view
  const grouped = TYPE_ORDER
    .map(type => ({ type, accounts: flatSorted.filter(a => a.type === type) }))
    .filter(g => g.accounts.length > 0);

  return (
    <WebShell active="accounts" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      {modalAccount !== undefined && (
        <AccountFormModal
          t={t}
          onClose={() => setModalAccount(undefined)}
          editAccount={modalAccount}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] ACCOUNTS · {accountsWithBalance.length} LINKED</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(NET_WORTH, 'USD', t.decimals)}
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>NET WORTH</div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {reorderMode ? (
            <button onClick={() => setReorderMode(false)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.4, color: t.accent }}>DONE</button>
          ) : (
            <>
              <button onClick={() => setReorderMode(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.4, color: A.muted }}>REORDER</button>
              <button onClick={() => setModalAccount(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.4, color: A.ink }}>+ ADD ACCOUNT</button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: selected && !reorderMode ? '1fr 1fr' : '1fr', gap: 28 }}>
        <div>
          {reorderMode ? (
            /* ── Reorder mode: flat draggable list ── */
            <div>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 8 }}>DRAG TO REORDER</div>
              <div style={{ borderTop: '2px solid ' + A.ink }}>
                {flatSorted.map((a, idx) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={handleDrop}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    style={{
                      display: 'grid', gridTemplateColumns: '24px 1fr 80px',
                      padding: '10px 0', borderBottom: '1px solid ' + A.rule2,
                      alignItems: 'center', cursor: 'grab',
                      background: overIdx === idx ? A.ink + '18' : 'transparent',
                      opacity: dragIdx === idx ? 0.4 : 1,
                    }}
                  >
                    <div style={{ fontSize: 12, color: A.muted, userSelect: 'none' }}>⠿</div>
                    <div style={{ fontSize: 12 }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: A.muted }}>{a.type}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── Normal grouped view ── */
            <>
              {grouped.map(({ type, accounts }) => (
                <div key={type} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 6 }}>
                    {TYPE_LABELS[type] || type}
                  </div>
                  <div style={{ borderTop: '2px solid ' + A.ink }}>
                    {accounts.map(a => (
                      <div key={a.id} style={{ display: 'flex', borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
                        <button
                          onClick={() => setSelected(selected === a.id ? null : a.id)}
                          style={{
                            all: 'unset', cursor: 'pointer', flex: 1,
                            display: 'grid', gridTemplateColumns: '24px 1fr 80px 120px 90px',
                            padding: t.density === 'compact' ? '8px 0' : '11px 0',
                            alignItems: 'center',
                            background: selected === a.id ? A.ink + '10' : 'transparent',
                          }}>
                          <div style={{ fontSize: 9, color: A.muted }}>{a.type}</div>
                          <div style={{ fontSize: 12, fontWeight: selected === a.id ? 600 : 400 }}>{a.name}</div>
                          <div style={{ fontSize: 10, color: A.muted }}>{a.code}</div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: a.balance < 0 ? A.neg : A.ink }}>
                            {fmtMoney(a.balance, a.ccy, t.decimals)}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 10, color: a.delta < 0 ? A.neg : t.accent }}>
                            {fmtSigned(a.delta, a.ccy, t.decimals)}
                          </div>
                        </button>
                        <button
                          onClick={() => setModalAccount(a)}
                          style={{ all: 'unset', cursor: 'pointer', padding: '0 10px', fontSize: 13, color: A.muted }}>
                          ✎
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Archived rows (muted) */}
              {showArchived && archivedAccounts.map(a => (
                <div key={a.id} style={{ display: 'flex', borderBottom: '1px solid ' + A.rule2, alignItems: 'center', opacity: 0.45 }}>
                  <div style={{
                    flex: 1, display: 'grid', gridTemplateColumns: '24px 1fr 80px 120px 90px',
                    padding: '8px 0', alignItems: 'center',
                  }}>
                    <div style={{ fontSize: 9, color: A.muted }}>{a.type}</div>
                    <div style={{ fontSize: 12, fontStyle: 'italic' }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: A.muted }}>{a.code}</div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: A.muted }}>
                      {fmtMoney(a.balance, a.ccy, t.decimals)}
                    </div>
                    <div />
                  </div>
                  <button onClick={() => setModalAccount(a)} style={{ all: 'unset', cursor: 'pointer', padding: '0 10px', fontSize: 13, color: A.muted }}>✎</button>
                </div>
              ))}

              {archivedCount > 0 && (
                <button onClick={() => setShowArchived(s => !s)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1, marginTop: 8, display: 'block' }}>
                  {showArchived ? 'HIDE ARCHIVED' : `SHOW ARCHIVED (${archivedCount})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Transaction detail panel */}
        {selected && !reorderMode && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <ALabel>{accountsWithBalance.find(a => a.id === selected)?.name}</ALabel>
              <button onClick={() => setSelected(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>CLOSE ×</button>
            </div>
            <div style={{ borderTop: '2px solid ' + A.ink }}>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 18px 1fr 90px', padding: '6px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
                <div>DATE</div><div /><div>MERCHANT</div><div style={{ textAlign: 'right' }}>AMOUNT</div>
              </div>
              {acctTxs.length === 0 && (
                <div style={{ fontSize: 11, color: A.muted, padding: '16px 0', letterSpacing: 1 }}>NO TRANSACTIONS</div>
              )}
              {acctTxs.map(tx => (
                <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '70px 18px 1fr 90px', padding: t.density === 'compact' ? '7px 0' : '9px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.date)}</div>
                  <div style={{ fontSize: 11 }}>{catGlyph(tx.path || [tx.cat])}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tx.amt >= 0 ? t.accent : A.ink }}>
                    {fmtSigned(tx.amt, tx.ccy, t.decimals)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </WebShell>
  );
}
```

- [ ] **Step 2: Verify desktop accounts screen**

Run `npm run dev`. On the Accounts page:
1. "+ ADD ACCOUNT" button appears in the top-right → click it → modal opens with empty form → fill in name + balance → Save → new account appears in the list.
2. ✎ icon appears on each account row → click it → modal opens pre-filled → change name → Save → name updates immediately.
3. ✎ on an account with zero transactions shows "DELETE ACCOUNT" link in red → clicking it removes the account.
4. ✎ on any account → check "ARCHIVE THIS ACCOUNT" → Save → account disappears from main list → "SHOW ARCHIVED (1)" link appears → clicking it reveals the archived account in muted/italic style.
5. "REORDER" button → flat list appears with ⠿ handles → drag a row to a new position → "DONE" → accounts reflect new order.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/screens/web/WebAccounts.jsx
git commit -m "feat: WebAccounts — add, edit, archive, reorder accounts"
```

---

### Task 6: Update mobile `Accounts` — add, edit, reorder, archive

**Files:**
- Modify: `src/renderer/screens/mobile/Accounts.jsx`

Mobile reorder uses ▲/▼ buttons (touch drag-and-drop on a scrolling list is unreliable). The `AccountDetail` component is unchanged.

- [ ] **Step 1: Replace the `Accounts` export (lines 1–60) — leave `AccountDetail` untouched**

Replace from the top of the file up to (but not including) `export function AccountDetail`) with:

```jsx
import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel, ADetailCell } from '../../components/Shared';
import { fmtMoney, fmtSigned, dayLabel, catBreadcrumb } from '../../data';
import { useStore } from '../../store';
import AccountFormSheet from '../../components/AccountFormSheet';

export function Accounts({ t, onAcct }) {
  const { accountsWithBalance, allAccountsWithBalance, reorderAccounts } = useStore();
  const [sheetAccount, setSheetAccount] = React.useState(undefined); // undefined=closed, null=new, obj=edit
  const [reorderMode, setReorderMode]   = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);

  const NET_WORTH = accountsWithBalance.reduce(
    (s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0
  );

  const flatSorted      = [...accountsWithBalance].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const archivedAccounts = (allAccountsWithBalance || []).filter(a => a.archived);
  const archivedCount   = archivedAccounts.length;

  const moveAccount = (idx, dir) => {
    const ids = flatSorted.map(a => a.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    reorderAccounts(ids);
  };

  const groups = [
    ['CASH',        flatSorted.filter(a => ['CHK', 'SAV', 'FX', 'CASH'].includes(a.type))],
    ['CREDIT',      flatSorted.filter(a => a.type === 'CC')],
    ['INVESTMENTS', flatSorted.filter(a => a.type === 'INV')],
    ['CRYPTO',      flatSorted.filter(a => a.type === 'CRY')],
    ['LOANS',       flatSorted.filter(a => a.type === 'LOAN')],
  ].filter(([, rows]) => rows.length > 0);

  return (
    <div style={{ padding: '0 18px 20px', position: 'relative' }}>
      {sheetAccount !== undefined && (
        <AccountFormSheet t={t} onClose={() => setSheetAccount(undefined)} editAccount={sheetAccount} />
      )}

      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>ACCOUNTS</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {reorderMode ? (
            <button onClick={() => setReorderMode(false)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>DONE</button>
          ) : (
            <>
              <button onClick={() => setReorderMode(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.muted }}>REORDER</button>
              <button onClick={() => setSheetAccount(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.ink }}>+ ADD</button>
            </>
          )}
        </div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0' }}>
        <ALabel>TOTAL</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>
          {fmtMoney(NET_WORTH, 'USD', t.decimals)}
        </div>
      </div>
      <ARule />

      {reorderMode ? (
        /* ── Reorder mode: up/down arrows ── */
        <div>
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, padding: '10px 0 6px' }}>TAP ▲▼ TO REORDER</div>
          {flatSorted.map((a, idx) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button onClick={() => moveAccount(idx, -1)} disabled={idx === 0} style={{ all: 'unset', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 11, color: idx === 0 ? A.rule2 : A.muted, lineHeight: 1 }}>▲</button>
                <button onClick={() => moveAccount(idx, 1)} disabled={idx === flatSorted.length - 1} style={{ all: 'unset', cursor: idx === flatSorted.length - 1 ? 'default' : 'pointer', fontSize: 11, color: idx === flatSorted.length - 1 ? A.rule2 : A.muted, lineHeight: 1 }}>▼</button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>{a.type}</div>
              </div>
              <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoney(a.balance, a.ccy, t.decimals)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Normal grouped view ── */
        <>
          {groups.map(([title, rows]) => (
            <div key={title}>
              <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'space-between' }}>
                <ALabel>{title}</ALabel>
                <ALabel>{fmtMoney(rows.reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0), 'USD', t.decimals)}</ALabel>
              </div>
              {rows.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid ' + A.rule2 }}>
                  <button onClick={() => onAcct(a.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: t.density === 'compact' ? '8px 0' : '12px 0' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>{a.type} · {a.code}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? A.neg : A.ink }}>
                          {fmtMoney(a.balance, a.ccy, t.decimals)}
                        </div>
                        <div style={{ fontSize: 10, color: a.delta < 0 ? A.neg : t.accent, marginTop: 2 }}>
                          {fmtSigned(a.delta, a.ccy, t.decimals)}
                        </div>
                      </div>
                    </div>
                  </button>
                  <button onClick={() => setSheetAccount(a)} style={{ all: 'unset', cursor: 'pointer', padding: '12px 0 12px 14px', fontSize: 15, color: A.muted }}>✎</button>
                </div>
              ))}
            </div>
          ))}

          {/* Archived rows */}
          {showArchived && archivedAccounts.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid ' + A.rule2, opacity: 0.45 }}>
              <div style={{ flex: 1, padding: '10px 0' }}>
                <div style={{ fontSize: 13, fontStyle: 'italic' }}>{a.name}</div>
                <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>ARCHIVED · {a.type}</div>
              </div>
              <button onClick={() => setSheetAccount(a)} style={{ all: 'unset', cursor: 'pointer', padding: '12px 0 12px 14px', fontSize: 15, color: A.muted }}>✎</button>
            </div>
          ))}

          {archivedCount > 0 && (
            <button onClick={() => setShowArchived(s => !s)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1, padding: '12px 0', display: 'block' }}>
              {showArchived ? 'HIDE ARCHIVED' : `SHOW ARCHIVED (${archivedCount})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify mobile accounts screen**

Resize the browser window below 1024px (or use DevTools device emulation). On the Accounts tab:
1. "+ ADD" in the header → sheet slides up → fill form → Save → account appears in list.
2. ✎ icon on any row → sheet slides up pre-filled → edit → Save → updates.
3. "REORDER" → ▲/▼ buttons appear → tap to shift accounts → "DONE" → order persists.
4. Archive and show-archived work identically to the desktop flow.

- [ ] **Step 3: Final commit**

```bash
git add src/renderer/screens/mobile/Accounts.jsx
git commit -m "feat: mobile Accounts — add, edit, archive, reorder accounts"
```
