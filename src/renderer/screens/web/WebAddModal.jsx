import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import { CATEGORIES } from '../../data';
import { useStore } from '../../store';
import { getDaysInPeriod } from '../../period.mjs';

export default function WebAddModal({ t, onClose, editTx = null }) {
  const { addTransactions, updateTx, deleteTx, accountsWithBalance, selectedPeriod } = useStore();
  const defaultDay = Math.min(new Date().getDate(), getDaysInPeriod(selectedPeriod));
  const defaultDate = `${selectedPeriod}-${String(defaultDay).padStart(2, '0')}`;

  const [amt, setAmt]           = React.useState(editTx ? String(Math.abs(editTx.amt)) : '');
  const [merchant, setMerchant] = React.useState(editTx ? editTx.name : '');
  const [isExpense, setIsExpense] = React.useState(editTx ? editTx.amt < 0 : true);
  const [cat, setCat]           = React.useState(editTx ? (editTx.cat || editTx.path?.[0] || 'dining') : 'dining');
  const [acct, setAcct]         = React.useState(editTx ? editTx.acct : (accountsWithBalance[0]?.id || 'chk'));
  const [date, setDate]         = React.useState(editTx ? editTx.date : defaultDate);

  const canSave = amt && parseFloat(amt) > 0 && merchant.trim();

  const handleSave = () => {
    if (!canSave) return;
    const changes = {
      name: merchant.trim(),
      amt: isExpense ? -Math.abs(parseFloat(amt)) : Math.abs(parseFloat(amt)),
      date,
      cat,
      ccy: editTx?.ccy || 'USD',
      acct,
    };
    if (editTx) {
      updateTx(editTx.id, changes);
    } else {
      addTransactions([{ id: 'add_' + Date.now(), ...changes }]);
    }
    onClose();
  };

  const handleDelete = () => {
    deleteTx(editTx.id);
    onClose();
  };

  React.useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,15,0.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: A.bg, border: '2px solid ' + A.ink,
        width: 480, padding: 32, fontFamily: A.font,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <ALabel>{editTx ? 'EDIT · TRANSACTION' : 'NEW · TRANSACTION'}</ALabel>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {editTx && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.neg }}>
                DELETE
              </button>
            )}
            <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 20, color: A.muted }}>×</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['EXPENSE', true], ['INCOME', false]].map(([label, val]) => (
            <button key={label} onClick={() => setIsExpense(val)} style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
              padding: '8px', fontSize: 10, letterSpacing: 1.4,
              border: '1px solid ' + (isExpense === val ? A.ink : A.rule2),
              background: isExpense === val ? A.ink : 'transparent',
              color: isExpense === val ? A.bg : A.ink,
            }}>{label}</button>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <ALabel>AMOUNT · USD</ALabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 28, color: A.muted }}>$</span>
            <input
              autoFocus type="number" min="0" step="0.01" placeholder="0.00"
              value={amt} onChange={e => setAmt(e.target.value)}
              style={{
                all: 'unset', flex: 1, fontSize: 40, fontVariantNumeric: 'tabular-nums',
                letterSpacing: -1, borderBottom: '1px solid ' + A.rule2,
                color: isExpense ? A.neg : t.accent, fontFamily: A.font,
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <ALabel>MERCHANT / PAYEE</ALabel>
          <input
            value={merchant} onChange={e => setMerchant(e.target.value)}
            placeholder="e.g. STARBUCKS"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              all: 'unset', display: 'block', width: '100%', marginTop: 8,
              fontFamily: A.font, fontSize: 14, letterSpacing: 0.6,
              borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <ALabel>DATE</ALabel>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              all: 'unset', display: 'block', width: '100%', marginTop: 8,
              fontFamily: A.font, fontSize: 13, letterSpacing: 0.6,
              borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <ARule />

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

        <ARule />

        <div style={{ margin: '12px 0 20px' }}>
          <ALabel>ACCOUNT</ALabel>
          <select value={acct} onChange={e => setAcct(e.target.value)} style={{
            marginTop: 8, width: '100%', fontFamily: A.font,
            fontSize: 13, padding: 8,
            border: '1px solid ' + A.ink, background: A.bg, color: A.ink,
          }}>
            {accountsWithBalance.filter(a => !['INV','CRY'].includes(a.type)).map(a => (
              <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
            ))}
          </select>
        </div>

        <button onClick={handleSave} style={{
          all: 'unset', cursor: canSave ? 'pointer' : 'default', display: 'block',
          textAlign: 'center', width: '100%', padding: '14px',
          background: canSave ? t.accent : A.rule2,
          color: A.bg, fontSize: 12, letterSpacing: 2, fontWeight: 700,
          boxSizing: 'border-box',
        }}>SAVE ↵</button>
      </div>
    </div>
  );
}
