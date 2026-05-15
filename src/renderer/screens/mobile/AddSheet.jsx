import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { CATEGORIES, CCY_SYM } from '../../data';
import { useStore } from '../../store';
import { getDaysInPeriod } from '../../period.mjs';

export default function AddSheet({ t, onClose, editTx = null }) {
  const { addTransactions, updateTx, deleteTx, deleteTransfer, createTransfer, accountsWithBalance, selectedPeriod } = useStore();
  const defaultDay = Math.min(new Date().getDate(), getDaysInPeriod(selectedPeriod));
  const defaultDate = `${selectedPeriod}-${String(defaultDay).padStart(2, '0')}`;

  const [amt, setAmt]           = React.useState(editTx ? String(Math.abs(editTx.amt)) : '');
  const [merchant, setMerchant] = React.useState(editTx ? editTx.name : '');
  const [isExpense, setIsExpense] = React.useState(editTx ? editTx.amt < 0 : true);
  const [cat, setCat]           = React.useState(editTx ? (editTx.cat || editTx.path?.[0] || 'dining') : 'dining');
  const [acct, setAcct]         = React.useState(editTx ? editTx.acct : (accountsWithBalance[0]?.id || 'chk'));
  const [date, setDate]         = React.useState(editTx ? editTx.date : defaultDate);

  const [isTransfer, setIsTransfer] = React.useState(editTx?.cat === 'transfer');
  const [fromAcct, setFromAcct]     = React.useState(editTx?.acct || accountsWithBalance[0]?.id || 'chk');
  const [toAcct, setToAcct]         = React.useState(() => {
    const others = accountsWithBalance.filter(a => a.id !== (editTx?.acct || accountsWithBalance[0]?.id));
    return others[0]?.id || '';
  });
  const [amtFrom, setAmtFrom]       = React.useState('');
  const [amtTo, setAmtTo]           = React.useState('');
  const [transferNote, setTransferNote] = React.useState('');

  const fromAcctObj = accountsWithBalance.find(a => a.id === fromAcct);
  const toAcctObj   = accountsWithBalance.find(a => a.id === toAcct);
  const isCrossCcy  = fromAcctObj?.ccy !== toAcctObj?.ccy;
  const impliedRate = isCrossCcy && parseFloat(amtFrom) > 0 && parseFloat(amtTo) > 0
    ? (parseFloat(amtTo) / parseFloat(amtFrom)).toFixed(4)
    : null;

  const canSave = isTransfer
    ? parseFloat(amtFrom) > 0 && parseFloat(amtTo) > 0 && fromAcct && toAcct && fromAcct !== toAcct
    : amt && parseFloat(amt) > 0 && merchant.trim();

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

  const handleDelete = () => {
    if (editTx?.transferId) {
      deleteTransfer(editTx.transferId);
    } else {
      deleteTx(editTx.id);
    }
    onClose();
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
            {editTx ? (editTx.cat === 'transfer' ? 'VIEW · TRANSFER' : 'EDIT · TRANSACTION') : 'NEW · TRANSACTION'}
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {editTx && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.neg }}>
                DELETE
              </button>
            )}
            <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>CLOSE ×</button>
          </div>
        </div>
        <ARule thick style={{ marginTop: 8 }} />

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

        {isTransfer && !editTx && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 14 }}>
              <ALabel>FROM</ALabel>
              <select value={fromAcct} onChange={e => {
                const newFrom = e.target.value;
                setFromAcct(newFrom);
                if (toAcct === newFrom) {
                  const next = accountsWithBalance.find(a => a.id !== newFrom);
                  setToAcct(next?.id || '');
                }
              }}
                style={{ marginTop: 6, width: '100%', fontFamily: A.font, fontSize: 13, padding: 8, border: '1px solid ' + A.rule2, background: A.bg, color: A.ink }}>
                {accountsWithBalance.map(a => <option key={a.id} value={a.id}>{a.name} · {a.code}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <ALabel>TO</ALabel>
              <select value={toAcct} onChange={e => setToAcct(e.target.value)}
                style={{ marginTop: 6, width: '100%', fontFamily: A.font, fontSize: 13, padding: 8, border: '1px solid ' + A.rule2, background: A.bg, color: A.ink }}>
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

        {!isTransfer && (<>
        <div style={{ padding: '14px 0 6px' }}>
          <ALabel>{'AMOUNT · ' + t.currency}</ALabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 32, color: A.muted }}>{CCY_SYM[t.currency] || '$'}</span>
            <input
              autoFocus type="number" min="0" step="0.01" placeholder="0.00"
              value={amt} onChange={e => setAmt(e.target.value)}
              style={{
                all: 'unset', flex: 1, fontSize: 44, fontVariantNumeric: 'tabular-nums',
                letterSpacing: -1, borderBottom: '1px solid ' + A.rule2,
                color: isExpense ? A.neg : t.accent, fontFamily: A.font,
              }}
            />
          </div>
        </div>

        <div style={{ paddingBottom: 12 }}>
          <ALabel>MERCHANT / PAYEE</ALabel>
          <input
            value={merchant} onChange={e => setMerchant(e.target.value)}
            placeholder="e.g. STARBUCKS"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              all: 'unset', display: 'block', width: '100%', marginTop: 6,
              fontFamily: A.font, fontSize: 14, letterSpacing: 0.6,
              borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ paddingBottom: 12 }}>
          <ALabel>DATE</ALabel>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              all: 'unset', display: 'block', width: '100%', marginTop: 6,
              fontFamily: A.font, fontSize: 13, letterSpacing: 0.6,
              borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink,
              boxSizing: 'border-box',
            }}
          />
        </div>
        <ARule />

        <div style={{ padding: '10px 0' }}>
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

        <div style={{ padding: '10px 0' }}>
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
        </>)}

        {!(isTransfer && editTx) && (
          <button onClick={handleSave} style={{
            all: 'unset', cursor: canSave ? 'pointer' : 'default', display: 'block',
            textAlign: 'center', width: '100%', padding: '14px', marginTop: 6,
            background: canSave ? t.accent : A.rule2,
            color: A.bg, fontSize: 12, letterSpacing: 2, fontWeight: 700,
            boxSizing: 'border-box',
          }}>SAVE ↵</button>
        )}
      </div>
    </div>
  );
}
