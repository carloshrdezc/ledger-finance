import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import { CATEGORIES, CCY_SYM } from '../../data';
import { useUndoableStore } from '../../useUndoableStore';
import { getDaysInPeriod } from '../../period.mjs';
import AccountFormModal from '../../components/AccountFormModal';

export default function WebAddModal({ t, onClose, editTx = null, convertFromTxs = null }) {
  const { addTransactions, updateTx, deleteTx, deleteTransfer, createTransfer, updateTransfer, convertToTransfer, transactions, accountsWithBalance, selectedPeriod } = useUndoableStore();
  const defaultDay = Math.min(new Date().getDate(), getDaysInPeriod(selectedPeriod));
  const defaultDate = `${selectedPeriod}-${String(defaultDay).padStart(2, '0')}`;

  const transferLegs = React.useMemo(() => {
    if (!editTx?.transferId) return null;
    const legs = transactions.filter(tx => tx.transferId === editTx.transferId);
    if (legs.length !== 2) return null;
    const out = legs.find(l => l.amt < 0);
    const inLeg = legs.find(l => l.amt > 0);
    if (!out || !inLeg) return null;
    return { out, in: inLeg };
  }, [editTx, transactions]);

  const convertingPair = React.useMemo(() => {
    if (!convertFromTxs || convertFromTxs.length !== 2) return null;
    const [a, b] = convertFromTxs;
    const out = a.amt < 0 ? a : b;
    const inn = a.amt < 0 ? b : a;
    return { out, inn };
  }, [convertFromTxs]);

  const [amt, setAmt]           = React.useState(editTx ? String(Math.abs(editTx.amt)) : '');
  const [merchant, setMerchant] = React.useState(editTx ? editTx.name : '');
  const [isExpense, setIsExpense] = React.useState(editTx ? editTx.amt < 0 : true);
  const [cat, setCat]           = React.useState(editTx ? (editTx.cat || editTx.path?.[0] || 'dining') : 'dining');
  const [acct, setAcct]         = React.useState(editTx ? editTx.acct : (accountsWithBalance[0]?.id || 'chk'));
  const [date, setDate]         = React.useState(
    editTx ? editTx.date
      : convertingPair ? convertingPair.out.date
      : defaultDate
  );

  // Transfer state
  const [isTransfer, setIsTransfer] = React.useState(
    editTx?.cat === 'transfer' || convertingPair != null
  );
  const [fromAcct, setFromAcct] = React.useState(
    transferLegs?.out.acct
      || convertingPair?.out.acct
      || editTx?.acct
      || accountsWithBalance[0]?.id
      || 'chk'
  );
  const [toAcct, setToAcct] = React.useState(() => {
    if (transferLegs) return transferLegs.in.acct;
    if (convertingPair) return convertingPair.inn.acct;
    const others = accountsWithBalance.filter(a => a.id !== (editTx?.acct || accountsWithBalance[0]?.id));
    return others[0]?.id || '';
  });
  const [amtFrom, setAmtFrom] = React.useState(
    transferLegs ? String(Math.abs(transferLegs.out.amt))
      : convertingPair ? String(Math.abs(convertingPair.out.amt))
      : ''
  );
  const [amtTo, setAmtTo] = React.useState(
    transferLegs ? String(Math.abs(transferLegs.in.amt))
      : convertingPair ? String(Math.abs(convertingPair.inn.amt))
      : ''
  );
  const [transferNote, setTransferNote] = React.useState(
    transferLegs?.out.note || convertingPair?.out.note || convertingPair?.inn.note || ''
  );

  const [showAddAccount, setShowAddAccount] = React.useState(false);

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
      if (editTx?.transferId) {
        updateTransfer(editTx.transferId, {
          fromAcct, toAcct,
          amtFrom: parseFloat(amtFrom),
          amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
          date,
          note: transferNote.trim() || undefined,
        });
      } else if (convertingPair) {
        convertToTransfer(convertingPair.out.id, convertingPair.inn.id, {
          fromAcct, toAcct,
          amtFrom: parseFloat(amtFrom),
          amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
          date,
          note: transferNote.trim() || undefined,
        });
      } else {
        createTransfer({
          fromAcct, toAcct,
          amtFrom: parseFloat(amtFrom),
          amtTo: parseFloat(isCrossCcy ? amtTo : amtFrom),
          date,
          note: transferNote.trim() || undefined,
        });
      }
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

  React.useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (accountsWithBalance.length === 0) {
    return (
      <>
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: A.font,
        }}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: A.bg, color: A.ink, border: '2px solid ' + A.ink,
              padding: '28px 24px', width: 'min(380px, 90vw)',
            }}
          >
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>ADD TRANSACTION</div>
            <div style={{ fontSize: 14, marginTop: 12, lineHeight: 1.5 }}>
              No accounts yet. Add an account to start tracking transactions.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
              }}>CANCEL</button>
              <button onClick={() => setShowAddAccount(true)} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.ink, background: A.ink, color: A.bg,
              }}>+ ADD ACCOUNT</button>
            </div>
          </div>
        </div>
        {showAddAccount && (
          <AccountFormModal
            account={null}
            t={t}
            onClose={() => { setShowAddAccount(false); onClose(); }}
          />
        )}
      </>
    );
  }

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
          width: 480, padding: 32, fontFamily: A.font,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <ALabel>{editTx ? (editTx.cat === 'transfer' ? 'EDIT · TRANSFER' : 'EDIT · TRANSACTION') : 'NEW · TRANSACTION'}</ALabel>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {editTx && (
              <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.neg }}>
                DELETE
              </button>
            )}
            <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 20, color: A.muted }}>×</button>
          </div>
        </div>

        {!editTx && (
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
        )}

        {!isTransfer && (
          <>
            <div style={{ marginBottom: 16 }}>
              <ALabel>{'AMOUNT · ' + t.currency}</ALabel>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 28, color: A.muted }}>{CCY_SYM[t.currency] || '$'}</span>
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
          </>
        )}

        {isTransfer && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <ALabel>FROM ACCOUNT</ALabel>
              <select value={fromAcct} onChange={e => {
                const newFrom = e.target.value;
                setFromAcct(newFrom);
                if (toAcct === newFrom) {
                  const next = accountsWithBalance.find(a => a.id !== newFrom);
                  setToAcct(next?.id || '');
                }
              }}
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
