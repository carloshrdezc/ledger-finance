import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { useStore } from '../store';
import { ALL_CURRENCIES, DEFAULT_RATES, formatRate, latestRateEntry } from '../fx.mjs';

function formatRelativeTime(iso) {
  if (!iso) return 'never';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
    ['second', 1000],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (abs >= size || unit === 'second') {
      return rtf.format(Math.round(diff / size), unit);
    }
  }
  return iso;
}

export default function FxRatesSection() {
  const {
    rates,
    ratesUpdated,
    fxAutoFetch,
    fxLastFetchedAt,
    fxLastFetchError,
    fxFetchInFlight,
    setRate,
    removeRate,
    resetRates,
    refreshRatesNow,
    setFxAutoFetch,
    accounts,
    allTransactions,
  } = useStore();
  const [editing, setEditing] = React.useState(null);
  const [editVal, setEditVal] = React.useState('');
  const [confirmReset, setConfirmReset] = React.useState(false);
  const resetTimerRef = React.useRef(null);

  // Clean up the confirm-reset timeout on unmount so we never call setState
  // on an unmounted component (matches the pattern in mobile Settings).
  React.useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

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
    setEditVal(String(latestRateEntry(rates, ccy)?.rate ?? 1));
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
    if (latestRateEntry(rates, ccy)) return;
    setRate(ccy, DEFAULT_RATES[ccy] ?? 1.0);
  };

  const handleResetClick = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimerRef.current = setTimeout(() => {
        setConfirmReset(false);
        resetTimerRef.current = null;
      }, 3000);
    } else {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      resetRates();
      setConfirmReset(false);
    }
  };

  const handleFetchLatest = () => {
    void refreshRatesNow();
  };

  const candidateCurrencies = ALL_CURRENCIES.filter(c => !latestRateEntry(rates, c));

  return (
    <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
      {ordered.map(ccy => {
        const rate = latestRateEntry(rates, ccy)?.rate;
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
                <span>{formatRate(ccy, Number(rate))}</span>
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

      <div style={{ padding: '12px 0 8px', borderBottom: '1px solid ' + A.rule2 }}>
        <div style={{ fontFamily: A.font, fontSize: 10, color: A.muted, letterSpacing: 1.2 }}>
          Last fetched: {fxLastFetchedAt ? `${formatRelativeTime(fxLastFetchedAt)} via frankfurter.app` : 'never'}
        </div>
        {fxLastFetchError && (
          <div style={{
            marginTop: 6,
            fontFamily: A.font,
            fontSize: 10,
            color: A.neg,
            letterSpacing: 0.4,
            whiteSpace: 'pre-wrap',
          }}>
            {fxLastFetchError}
          </div>
        )}
      </div>

      <div style={{ padding: '10px 0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
        <button onClick={handleFetchLatest} disabled={fxFetchInFlight} style={{
          all: 'unset', cursor: fxFetchInFlight ? 'default' : 'pointer', fontSize: 10, letterSpacing: 1.2,
          padding: '5px 12px', border: '1px solid ' + A.rule2,
          color: fxFetchInFlight ? A.muted : A.ink,
          opacity: fxFetchInFlight ? 0.6 : 1,
          fontFamily: A.font,
        }}>
          FETCH LATEST
        </button>
        <button onClick={handleResetClick} style={{
          all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
          padding: '5px 12px', border: '1px solid ' + (confirmReset ? A.neg : A.rule2),
          color: confirmReset ? A.bg : A.ink,
          background: confirmReset ? A.neg : 'transparent',
          fontFamily: A.font,
        }}>
          {confirmReset ? 'CLICK AGAIN TO CONFIRM' : 'RESET DEFAULTS'}
        </button>
        <div style={{ marginLeft: 'auto', minWidth: 170 }}>
          <ALabel style={{ marginBottom: 4 }}>AUTO-FETCH</ALabel>
          <select
            value={fxAutoFetch}
            onChange={e => setFxAutoFetch(e.target.value)}
            style={{
              width: '100%',
              fontFamily: A.font,
              fontSize: 10,
              letterSpacing: 0.8,
              color: A.ink,
              background: A.bg,
              border: '1px solid ' + A.rule2,
              padding: '5px 8px',
              outline: 'none',
            }}
          >
            <option value="off">Off</option>
            <option value="boot">On boot</option>
            <option value="daily">Daily</option>
          </select>
        </div>
      </div>
    </div>
  );
}
