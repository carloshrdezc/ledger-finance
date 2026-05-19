import React from 'react';
import { A } from '../theme';
import { useStore } from '../store';
import { DEFAULT_RATES } from '../fx.mjs';

const ALL_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];

export default function FxRatesSection() {
  const { rates, ratesUpdated, setRate, removeRate, resetRates, accounts, allTransactions } = useStore();
  const [editing, setEditing] = React.useState(null);
  const [editVal, setEditVal] = React.useState('');
  const [confirmReset, setConfirmReset] = React.useState(false);

  const ccysInUse = React.useMemo(() => {
    const s = new Set();
    for (const a of accounts || []) if (a.ccy) s.add(a.ccy);
    for (const tx of allTransactions || []) if (tx.ccy) s.add(tx.ccy);
    return s;
  }, [accounts, allTransactions]);

  const ordered = React.useMemo(() => {
    const ccys = Object.keys(rates);
    return ['USD', ...ccys.filter(c => c !== 'USD').sort()];
  }, [rates]);

  const startEdit = (ccy) => {
    setEditing(ccy);
    setEditVal(String(rates[ccy] ?? 1));
  };

  const commitEdit = () => {
    if (!editing) return;
    const n = Number(editVal);
    if (Number.isFinite(n) && n > 0) setRate(editing, n);
    setEditing(null);
    setEditVal('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditVal('');
  };

  const addCurrency = (ccy) => {
    if (rates[ccy] != null) return;
    setRate(ccy, DEFAULT_RATES[ccy] ?? 1.0);
  };

  const candidateCurrencies = ALL_CURRENCIES.filter(c => rates[c] == null);

  return (
    <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
      {ordered.map(ccy => {
        const rate = rates[ccy];
        const updated = ratesUpdated[ccy];
        const isUsd = ccy === 'USD';
        const isEditing = editing === ccy;
        const inUse = ccysInUse.has(ccy);
        const updatedLabel = isUsd ? 'BASE' : (updated ? updated : 'DEFAULT');

        return (
          <div key={ccy} style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 24px',
            alignItems: 'center', padding: '8px 0',
            borderBottom: '1px solid ' + A.rule2,
          }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, fontVariantNumeric: 'tabular-nums' }}>
              {isEditing ? (
                <span>1 USD = </span>
              ) : (
                <span>1 USD = {Number(rate).toFixed(rate >= 10 ? 2 : 4)} {ccy}</span>
              )}
              {isEditing && (
                <input
                  autoFocus
                  type="number"
                  step="any"
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit();
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  style={{
                    fontFamily: A.font, fontSize: 11, width: 90,
                    background: 'transparent', border: 'none',
                    borderBottom: '1px solid ' + A.ink, outline: 'none',
                    padding: '2px 0', color: A.ink, marginRight: 6,
                  }}
                />
              )}
              {isEditing && <span> {ccy}</span>}
            </div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, textAlign: 'right' }}>
              {updatedLabel}
            </div>
            <div style={{ textAlign: 'right' }}>
              {!isUsd && !isEditing && (
                <button onClick={() => startEdit(ccy)} title="Edit rate"
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.ink2, padding: '0 4px' }}>
                  ✎
                </button>
              )}
              {!isUsd && !isEditing && !inUse && (
                <button onClick={() => removeRate(ccy)} title="Remove currency"
                  style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, marginLeft: 6 }}>
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}

      {candidateCurrencies.length > 0 && (
        <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 6 }}>+ ADD CURRENCY</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {candidateCurrencies.map(ccy => (
              <button key={ccy} onClick={() => addCurrency(ccy)} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '4px 10px', border: '1px solid ' + A.rule2, color: A.ink,
              }}>{ccy}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '10px 0' }}>
        <button onClick={() => {
          if (!confirmReset) {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 3000);
          } else {
            resetRates();
            setConfirmReset(false);
          }
        }} style={{
          all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
          padding: '5px 12px', border: '1px solid ' + (confirmReset ? A.neg : A.rule2),
          color: confirmReset ? A.bg : A.ink,
          background: confirmReset ? A.neg : 'transparent',
        }}>
          {confirmReset ? 'CLICK AGAIN TO CONFIRM ↩' : 'RESET DEFAULTS'}
        </button>
      </div>
    </div>
  );
}
