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
