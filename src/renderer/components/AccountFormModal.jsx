import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { useUndoableStore } from '../useUndoableStore';

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
  const { addAccount, updateAccount, archiveAccount, deleteAccount, transactions } = useUndoableStore();

  const [name, setName]             = React.useState(editAccount?.name ?? '');
  const [type, setType]             = React.useState(editAccount?.type ?? 'CHK');
  const [openingBal, setOpeningBal] = React.useState(editAccount != null ? String(editAccount.openingBal) : '');
  const [openingDate, setOpeningDate] = React.useState(editAccount?.openingDate ?? defaultOpeningDate());
  const [includeInTotals, setIncludeInTotals] = React.useState(editAccount?.includeInTotals !== false);
  const [creditLimit, setCreditLimit]   = React.useState(editAccount?.creditLimit != null ? String(editAccount.creditLimit) : '');
  const [apr, setApr]                   = React.useState(editAccount?.apr != null ? String(editAccount.apr) : '');
  const [statementDay, setStatementDay] = React.useState(editAccount?.statementDay != null ? String(editAccount.statementDay) : '');
  const [apy, setApy]                   = React.useState(editAccount?.apy != null ? String(editAccount.apy) : '');
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
      includeInTotals,
    };
    if (type === 'CC') {
      if (creditLimit !== '' && !isNaN(parseFloat(creditLimit))) fields.creditLimit = parseFloat(creditLimit);
      if (apr !== '' && !isNaN(parseFloat(apr))) fields.apr = parseFloat(apr);
      if (statementDay !== '' && !isNaN(parseInt(statementDay, 10))) fields.statementDay = parseInt(statementDay, 10);
    } else if (type === 'SAV') {
      if (apy !== '' && !isNaN(parseFloat(apy))) fields.apy = parseFloat(apy);
    }
    if (archiving) {
      updateAccount(editAccount.id, fields);
      archiveAccount(editAccount.id);
    } else if (editAccount) {
      updateAccount(editAccount.id, fields);
    } else {
      addAccount({ id: crypto.randomUUID(), ...fields });
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
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          background: A.bg, border: '2px solid ' + A.ink,
          width: 420, padding: 32, fontFamily: A.font,
        }}
      >
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 11, letterSpacing: 1 }}>
            <input type="checkbox" checked={includeInTotals} onChange={e => setIncludeInTotals(e.target.checked)} />
            INCLUDE IN TOTALS
          </label>
          {type === 'CC' && (
            <>
              <div>
                <div style={fieldLabel}>CREDIT LIMIT</div>
                <input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="10000" style={input} />
              </div>
              <div>
                <div style={fieldLabel}>APR (%)</div>
                <input type="number" step="0.01" value={apr} onChange={e => setApr(e.target.value)} placeholder="22.74" style={input} />
              </div>
              <div>
                <div style={fieldLabel}>STATEMENT DAY (1-28)</div>
                <input type="number" min="1" max="28" value={statementDay} onChange={e => setStatementDay(e.target.value)} placeholder="28" style={input} />
              </div>
            </>
          )}
          {type === 'SAV' && (
            <div>
              <div style={fieldLabel}>APY (%)</div>
              <input type="number" step="0.01" value={apy} onChange={e => setApy(e.target.value)} placeholder="4.20" style={input} />
            </div>
          )}
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
            background: canSave ? t.accent : A.rule2,
            color: canSave ? A.bg : A.muted,
          }}>
            {archiving ? 'ARCHIVE' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}
