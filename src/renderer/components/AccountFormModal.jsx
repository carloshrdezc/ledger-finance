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
      updateAccount(editAccount.id, fields);
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
