import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { useStore } from '../store';

// CAR-345: add/edit a single debt. Desktop modal — mirrors GoalFormModal.
export default function DebtFormModal({ t, onClose, editDebt = null }) {
  const { addDebt, updateDebt, deleteDebt } = useStore();

  const [name, setName]             = React.useState(editDebt?.name ?? '');
  const [balance, setBalance]       = React.useState(editDebt != null ? String(editDebt.balance) : '');
  const [apr, setApr]               = React.useState(editDebt != null ? String(editDebt.apr) : '');
  const [minPayment, setMinPayment] = React.useState(editDebt != null ? String(editDebt.minPayment) : '');

  const isEdit = !!editDebt;
  const canSave = name.trim() && balance !== '' && parseFloat(balance) > 0 && minPayment !== '' && parseFloat(minPayment) >= 0;

  const handleSave = () => {
    if (!canSave) return;
    const fields = {
      name: name.trim().toUpperCase(),
      balance: parseFloat(balance),
      apr: apr === '' ? 0 : parseFloat(apr),
      minPayment: parseFloat(minPayment),
    };
    if (isEdit) updateDebt(editDebt.id, fields);
    else addDebt(fields);
    onClose();
  };

  const handleDelete = () => {
    deleteDebt(editDebt.id);
    onClose();
  };

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
        aria-label="DEBT FORM"
        onClick={e => e.stopPropagation()}
        style={{
          background: A.bg, border: '2px solid ' + A.ink,
          width: 420, padding: 32, fontFamily: A.font,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <ALabel>{isEdit ? 'EDIT · DEBT' : 'NEW · DEBT'}</ALabel>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>ESC ×</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={fieldLabel}>NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="E.G. VISA · CAR LOAN" aria-label="DEBT NAME" style={input} autoFocus />
          </div>
          <div>
            <div style={fieldLabel}>BALANCE</div>
            <input type="number" min="0" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0.00" aria-label="DEBT BALANCE" style={input} />
          </div>
          <div>
            <div style={fieldLabel}>APR %</div>
            <input type="number" min="0" step="0.01" value={apr} onChange={e => setApr(e.target.value)} placeholder="E.G. 19.99" aria-label="DEBT APR" style={input} />
          </div>
          <div>
            <div style={fieldLabel}>MINIMUM PAYMENT / MONTH</div>
            <input type="number" min="0" step="0.01" value={minPayment} onChange={e => setMinPayment(e.target.value)} placeholder="0.00" aria-label="DEBT MIN PAYMENT" style={input} />
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {isEdit && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1 }}>
                DELETE DEBT
              </button>
            )}
          </div>
          <button onClick={handleSave} disabled={!canSave} style={{
            all: 'unset', cursor: canSave ? 'pointer' : 'default', fontSize: 11,
            letterSpacing: 1.5, padding: '8px 20px',
            background: canSave ? t.accent : A.rule2,
            color: canSave ? A.bg : A.muted,
          }}>
            SAVE
          </button>
        </div>
      </div>
    </div>
  );
}
