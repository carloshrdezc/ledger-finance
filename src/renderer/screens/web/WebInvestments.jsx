import React from 'react';
import { A } from '../../theme';
import { AsciiSpark, ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { fmtMoney, fmtSigned, fmtPct } from '../../data';
import { useStore } from '../../store';

const PERIOD_DAYS = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '5Y': 1825 };

function windowBounds(period) {
  const end = new Date();
  const start = new Date();
  if (period !== 'MAX') start.setDate(start.getDate() - PERIOD_DAYS[period]);
  else start.setFullYear(start.getFullYear() - 10);
  return { start, end };
}

function portfolioCurve(investments, trades, period, points = 30) {
  const { start, end } = windowBounds(period);
  const step = (end - start) / (points - 1);
  return Array.from({ length: points }, (_, i) => {
    const t = new Date(start.getTime() + i * step);
    const iso = t.toISOString().slice(0, 10);
    const sharesAtT = {};
    for (const trade of trades) {
      if (trade.date <= iso) {
        sharesAtT[trade.ticker] = (sharesAtT[trade.ticker] || 0) +
          (trade.type === 'buy' ? trade.shares : -trade.shares);
      }
    }
    return investments.reduce((sum, h) => sum + (sharesAtT[h.ticker] || 0) * h.price, 0);
  });
}

function chartDateLabels(period) {
  const { start, end } = windowBounds(period);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
  const q1  = new Date(start.getTime() + (end.getTime() - start.getTime()) * 0.25);
  const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) * 0.5);
  const q3  = new Date(start.getTime() + (end.getTime() - start.getTime()) * 0.75);
  return [fmt(start), fmt(q1), fmt(mid), fmt(q3), fmt(end)];
}

export default function WebInvestments({ t, onNavigate, onAdd }) {
  const { investments, trades, addTrade, updateHolding, removeHolding, setInvestments } = useStore();
  const [period, setPeriod] = React.useState('3M');
  const [sheet, setSheet] = React.useState(null);

  const totalPort  = investments.reduce((s, i) => s + i.shares * i.price, 0);
  const dayChg     = investments.reduce((s, i) => s + i.shares * i.price * i.chg / 100, 0);
  const alloc      = investments.map(i => ({ ...i, val: i.shares * i.price, pct: totalPort ? (i.shares * i.price) / totalPort : 0 }));
  const shades     = [t.accent, A.ink, '#8c8678', '#bdb6a3', '#4a463e'];

  const spark      = React.useMemo(() => portfolioCurve(investments, trades, period), [investments, trades, period]);
  const dateLabels = React.useMemo(() => chartDateLabels(period), [period]);

  return (
    <WebShell active="investments" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] PORTFOLIO · {new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</ALabel>
          <div style={{ fontSize: 56, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 8 }}>
            {fmtMoney(totalPort, t.currency, t.decimals)}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <span style={{ color: dayChg >= 0 ? t.accent : A.neg }}>{fmtSigned(dayChg, t.currency, t.decimals)}</span>
            <span style={{ color: A.muted, marginLeft: 10, fontSize: 11, letterSpacing: 1 }}>TODAY · {fmtPct(totalPort ? dayChg / totalPort * 100 : 0)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['1D','1W','1M','3M','1Y','5Y','MAX'].map(p => (
            <span key={p} onClick={() => setPeriod(p)} style={{
              fontSize: 10, letterSpacing: 1.2, padding: '5px 10px',
              border: '1px solid ' + (period === p ? A.ink : A.rule2),
              background: period === p ? A.ink : 'transparent',
              color: period === p ? A.bg : A.ink, cursor: 'pointer',
            }}>{p}</span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
        <AsciiSpark data={spark} width={840} height={160} stroke={t.accent} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
          {dateLabels.map(l => <span key={l}>{l}</span>)}
        </div>
      </div>

      <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 32 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <ALabel>[02] HOLDINGS</ALabel>
            <span onClick={() => setSheet({ mode: 'holding', holding: null })} style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2, cursor: 'pointer' }}>+ ADD</span>
          </div>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 100px 90px 28px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
              <div>TICKER</div><div>NAME</div>
              <div style={{ textAlign: 'right' }}>SHARES</div>
              <div style={{ textAlign: 'right' }}>PRICE</div>
              <div style={{ textAlign: 'right' }}>VALUE</div>
              <div style={{ textAlign: 'right' }}>DAY</div>
              <div />
            </div>
            {investments.map(i => (
              <div key={i.ticker}
                onClick={() => setSheet({ mode: 'holding', holding: i })}
                style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 100px 90px 28px', padding: t.density === 'compact' ? '8px 0' : '12px 0', fontSize: 12, borderBottom: '1px solid ' + A.rule2, alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ fontWeight: 700, letterSpacing: 0.6 }}>{i.ticker}</div>
                <div style={{ color: A.muted, fontSize: 10, letterSpacing: 0.6 }}>{i.name}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: A.muted }}>{i.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: A.muted }}>{fmtMoney(i.price, t.currency, t.decimals)}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(i.shares * i.price, t.currency, t.decimals)}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: i.chg >= 0 ? t.accent : A.neg, fontSize: 11 }}>{fmtPct(i.chg)}</div>
                <div onClick={e => { e.stopPropagation(); removeHolding(i.ticker); }} style={{ textAlign: 'right', color: A.muted, fontSize: 10, cursor: 'pointer' }}>✕</div>
              </div>
            ))}
          </div>

          <ALabel style={{ marginTop: 28 }}>[04] PERFORMANCE</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2 }}>
            {[['1M','+2.40%'],['3M','+8.12%'],['YTD','+12.4%'],['1Y','+18.4%']].map(([k, v]) => (
              <div key={k} style={{ background: A.bg, padding: '14px 16px' }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{k}</div>
                <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: t.accent, marginTop: 6 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <ALabel>[03] ALLOCATION</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
            <div style={{ display: 'flex', height: 36, border: '1px solid ' + A.ink }}>
              {alloc.map((a, i) => (
                <div key={a.ticker} style={{ width: (a.pct * 100) + '%', background: shades[i % shades.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a.pct > 0.08 && <span style={{ fontSize: 9, color: A.bg, letterSpacing: 1 }}>{a.ticker}</span>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              {[...alloc].sort((a, b) => b.val - a.val).map((a, i) => (
                <div key={a.ticker} style={{ display: 'grid', gridTemplateColumns: '14px 60px 1fr 80px', padding: '9px 0', fontSize: 11, alignItems: 'center', borderBottom: '1px solid ' + A.rule2 }}>
                  <div style={{ width: 10, height: 10, background: shades[i % shades.length] }} />
                  <div style={{ fontWeight: 700 }}>{a.ticker}</div>
                  <div style={{ color: A.muted, fontSize: 10 }}>{(a.pct * 100).toFixed(1)}%</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(a.val, t.currency, false)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {sheet && (
        <WebInvestmentSheet
          mode={sheet.mode}
          holding={sheet.holding}
          onClose={() => setSheet(null)}
          onSaveHolding={h => {
            if (sheet.holding) {
              updateHolding(h.ticker, h);
            } else {
              setInvestments(prev =>
                prev.some(x => x.ticker === h.ticker)
                  ? prev.map(x => x.ticker === h.ticker ? { ...x, ...h } : x)
                  : [...prev, h]
              );
            }
          }}
          onSaveTrade={addTrade}
          onRemove={removeHolding}
        />
      )}
    </WebShell>
  );
}

// Inline sheet to avoid a separate import cycle issue — matches plan's WebInvestmentSheet spec
function WebInvestmentSheet({ mode: initMode = 'holding', holding = null, onClose, onSaveHolding, onSaveTrade, onRemove }) {
  const [mode, setMode] = React.useState(initMode);

  const [ticker,     setTicker]     = React.useState(holding?.ticker ?? '');
  const [name,       setName]       = React.useState(holding?.name   ?? '');
  const [shares,     setShares]     = React.useState(holding?.shares != null ? String(holding.shares) : '');
  const [price,      setPrice]      = React.useState(holding?.price  != null ? String(holding.price)  : '');
  const [chg,        setChg]        = React.useState(holding?.chg    != null ? String(holding.chg)    : '');

  const [tradeType,   setTradeType]   = React.useState('buy');
  const [tradeShares, setTradeShares] = React.useState('');
  const [tradePrice,  setTradePrice]  = React.useState('');
  const [tradeDate,   setTradeDate]   = React.useState(new Date().toISOString().slice(0, 10));

  const isEdit = !!holding;

  function submitHolding(e) {
    e.preventDefault();
    onSaveHolding({
      ticker: ticker.toUpperCase().trim(),
      name:   name.trim() || ticker.toUpperCase().trim(),
      shares: parseFloat(shares) || 0,
      price:  parseFloat(price)  || 0,
      chg:    parseFloat(chg)    || 0,
    });
    onClose();
  }

  function submitTrade(e) {
    e.preventDefault();
    onSaveTrade({
      ticker: ticker.toUpperCase().trim(),
      type:   tradeType,
      shares: parseFloat(tradeShares) || 0,
      price:  parseFloat(tradePrice)  || 0,
      date:   tradeDate,
    });
    onClose();
  }

  const fieldStyle = {
    width: '100%', background: A.bg2, border: '1px solid ' + A.rule2,
    color: A.ink, fontFamily: 'inherit', fontSize: 12,
    padding: '8px 10px', boxSizing: 'border-box', marginTop: 4, outline: 'none',
  };
  const labelStyle = { fontSize: 9, color: A.muted, letterSpacing: 1.2, display: 'block', marginTop: 14 };

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
      background: A.bg, borderLeft: '2px solid ' + A.ink,
      padding: 28, zIndex: 100, overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <ALabel>{isEdit ? 'EDIT HOLDING' : 'ADD'}</ALabel>
        <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 11, color: A.muted, letterSpacing: 1 }}>CLOSE ✕</span>
      </div>

      <div style={{ display: 'flex', gap: 1, marginBottom: 20 }}>
        {['holding', 'trade'].map(m => (
          <span key={m} onClick={() => setMode(m)} style={{
            flex: 1, textAlign: 'center', padding: '6px 0', fontSize: 10,
            letterSpacing: 1.2, cursor: 'pointer',
            border: '1px solid ' + (mode === m ? A.ink : A.rule2),
            background: mode === m ? A.ink : 'transparent',
            color: mode === m ? A.bg : A.ink,
          }}>{m.toUpperCase()}</span>
        ))}
      </div>

      {mode === 'holding' ? (
        <form onSubmit={submitHolding} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <label style={labelStyle}>TICKER</label>
          <input value={ticker} onChange={e => setTicker(e.target.value)} style={fieldStyle} placeholder="VTI" required disabled={isEdit} />
          <label style={labelStyle}>NAME</label>
          <input value={name} onChange={e => setName(e.target.value)} style={fieldStyle} placeholder="VANGUARD TOTAL MKT" />
          <label style={labelStyle}>SHARES</label>
          <input type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>PRICE</label>
          <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>DAY CHG %</label>
          <input type="number" step="any" value={chg} onChange={e => setChg(e.target.value)} style={fieldStyle} placeholder="0.00" />
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 24 }}>
            <button type="submit" style={{ flex: 1, background: A.ink, color: A.bg, border: 'none', padding: '10px 0', fontSize: 11, letterSpacing: 1.2, cursor: 'pointer' }}>
              {isEdit ? 'SAVE' : 'ADD HOLDING'}
            </button>
            {isEdit && (
              <button type="button" onClick={() => { onRemove(holding.ticker); onClose(); }} style={{ padding: '10px 14px', background: 'transparent', border: '1px solid ' + A.neg, color: A.neg, fontSize: 11, letterSpacing: 1.2, cursor: 'pointer' }}>
                REMOVE
              </button>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={submitTrade} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <label style={labelStyle}>TICKER</label>
          <input value={ticker} onChange={e => setTicker(e.target.value)} style={fieldStyle} placeholder="VTI" required />
          <label style={labelStyle}>TYPE</label>
          <div style={{ display: 'flex', gap: 1, marginTop: 4 }}>
            {['buy', 'sell'].map(tp => (
              <span key={tp} onClick={() => setTradeType(tp)} style={{
                flex: 1, textAlign: 'center', padding: '6px 0', fontSize: 10,
                letterSpacing: 1.2, cursor: 'pointer',
                border: '1px solid ' + (tradeType === tp ? A.ink : A.rule2),
                background: tradeType === tp ? A.ink : 'transparent',
                color: tradeType === tp ? A.bg : A.ink,
              }}>{tp.toUpperCase()}</span>
            ))}
          </div>
          <label style={labelStyle}>SHARES</label>
          <input type="number" step="any" value={tradeShares} onChange={e => setTradeShares(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>PRICE</label>
          <input type="number" step="any" value={tradePrice} onChange={e => setTradePrice(e.target.value)} style={fieldStyle} placeholder="0.00" required />
          <label style={labelStyle}>DATE</label>
          <input value={tradeDate} onChange={e => setTradeDate(e.target.value)} style={fieldStyle} placeholder="YYYY-MM-DD" required />
          <button type="submit" style={{ marginTop: 'auto', paddingTop: 24, background: A.ink, color: A.bg, border: 'none', padding: '10px 0', fontSize: 11, letterSpacing: 1.2, cursor: 'pointer' }}>
            RECORD TRADE
          </button>
        </form>
      )}
    </div>
  );
}
