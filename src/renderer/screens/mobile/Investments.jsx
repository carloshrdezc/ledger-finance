import React from 'react';
import { A } from '../../theme';
import { AsciiSpark, ARule, ALabel } from '../../components/Shared';
import { fmtMoney, fmtSigned, fmtPct } from '../../data';
import { useStore } from '../../store';

const PERIOD_DAYS = { '1M': 30, '3M': 90, '1Y': 365 };

function windowBounds(period) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - PERIOD_DAYS[period]);
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

export default function Investments({ t, onBack }) {
  const { investments, trades, addTrade, updateHolding, removeHolding, setInvestments } = useStore();
  const [period, setPeriod] = React.useState('3M');
  const [sheet, setSheet] = React.useState(null);

  const totalPort = investments.reduce((s, i) => s + i.shares * i.price, 0);
  const dayChg    = investments.reduce((s, i) => s + i.shares * i.price * i.chg / 100, 0);
  const alloc     = investments.map(i => ({ ...i, val: i.shares * i.price, pct: totalPort ? (i.shares * i.price) / totalPort : 0 }));
  const shades    = [t.accent, A.ink, '#8c8678', '#bdb6a3', '#4a463e'];

  const spark = React.useMemo(() => portfolioCurve(investments, trades, period), [investments, trades, period]);

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>INVESTMENTS</div>
      </div>
      <ARule thick />

      {/* Hero */}
      <div style={{ padding: '14px 0 10px' }}>
        <ALabel>[01] PORTFOLIO</ALabel>
        <div style={{ fontSize: 36, fontVariantNumeric: 'tabular-nums', letterSpacing: -1.2, lineHeight: 1, marginTop: 8 }}>
          {fmtMoney(totalPort, t.currency, t.decimals)}
        </div>
        <div style={{ fontSize: 11, marginTop: 5, display: 'flex', gap: 10 }}>
          <span style={{ color: dayChg >= 0 ? t.accent : A.neg }}>{fmtSigned(dayChg, t.currency, t.decimals)}</span>
          <span style={{ color: A.muted, letterSpacing: 1 }}>TODAY · {fmtPct(totalPort ? dayChg / totalPort * 100 : 0)}</span>
        </div>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {['1M', '3M', '1Y'].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
            padding: '6px 0', fontSize: 10, letterSpacing: 1.4,
            border: '1px solid ' + (period === p ? A.ink : A.rule2),
            background: period === p ? A.ink : 'transparent',
            color: period === p ? A.bg : A.ink,
          }}>{p}</button>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <AsciiSpark data={spark} width={354} height={80} stroke={t.accent} />
      </div>

      <ARule style={{ marginTop: 14 }} />

      {/* Allocation */}
      {investments.length > 0 && (
        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[02] ALLOCATION</ALabel>
          <div style={{ display: 'flex', height: 28, border: '1px solid ' + A.ink, marginTop: 10 }}>
            {alloc.map((a, i) => (
              <div key={a.ticker} style={{ width: (a.pct * 100) + '%', background: shades[i % shades.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {a.pct > 0.10 && <span style={{ fontSize: 8, color: A.bg, letterSpacing: 1 }}>{a.ticker}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings */}
      <div style={{ padding: '18px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <ALabel>[03] HOLDINGS · {investments.length}</ALabel>
        <button onClick={() => setSheet({ mode: 'holding', holding: null })}
          style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>
          + ADD
        </button>
      </div>
      {investments.length === 0 ? (
        <div style={{ padding: '12px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 11, color: A.muted, letterSpacing: 1 }}>
          NO HOLDINGS YET · TAP + ADD
        </div>
      ) : investments.map((i, idx) => (
        <button key={i.ticker} onClick={() => setSheet({ mode: 'holding', holding: i })} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', width: '100%',
          padding: t.density === 'compact' ? '9px 0' : '12px 0',
          borderBottom: '1px solid ' + A.rule2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{ width: 10, height: 10, background: shades[idx % shades.length], flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, width: 56 }}>{i.ticker}</span>
            <span style={{ fontSize: 10, color: A.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(i.shares * i.price, t.currency, t.decimals)}</div>
            <div style={{ fontSize: 10, color: i.chg >= 0 ? t.accent : A.neg, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(i.chg)}</div>
          </div>
        </button>
      ))}

      <button onClick={() => setSheet({ mode: 'trade', holding: null })}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', boxSizing: 'border-box', marginTop: 16, padding: '12px', border: '1.5px dashed ' + A.ink, fontSize: 11, color: A.ink, letterSpacing: 1.2 }}>
        + RECORD · TRADE
      </button>

      {sheet && (
        <InvestmentSheet
          t={t}
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
    </div>
  );
}

function InvestmentSheet({ t, mode: initMode = 'holding', holding = null, onClose, onSaveHolding, onSaveTrade, onRemove }) {
  const [mode, setMode] = React.useState(initMode);

  const [ticker, setTicker]   = React.useState(holding?.ticker ?? '');
  const [name,   setName]     = React.useState(holding?.name   ?? '');
  const [shares, setShares]   = React.useState(holding?.shares != null ? String(holding.shares) : '');
  const [price,  setPrice]    = React.useState(holding?.price  != null ? String(holding.price)  : '');
  const [chg,    setChg]      = React.useState(holding?.chg    != null ? String(holding.chg)    : '');

  const [tradeType,   setTradeType]   = React.useState('buy');
  const [tradeShares, setTradeShares] = React.useState('');
  const [tradePrice,  setTradePrice]  = React.useState('');
  const [tradeDate,   setTradeDate]   = React.useState(new Date().toISOString().slice(0, 10));

  const isEdit = !!holding;

  const handleHolding = () => {
    onSaveHolding({
      ticker: ticker.toUpperCase().trim(),
      name:   name.trim() || ticker.toUpperCase().trim(),
      shares: parseFloat(shares) || 0,
      price:  parseFloat(price)  || 0,
      chg:    parseFloat(chg)    || 0,
    });
    onClose();
  };

  const handleTrade = () => {
    onSaveTrade({
      ticker: ticker.toUpperCase().trim(),
      type:   tradeType,
      shares: parseFloat(tradeShares) || 0,
      price:  parseFloat(tradePrice)  || 0,
      date:   tradeDate,
    });
    onClose();
  };

  const canSaveHolding = ticker.trim() && parseFloat(shares) > 0 && parseFloat(price) > 0;
  const canSaveTrade   = ticker.trim() && parseFloat(tradeShares) > 0 && parseFloat(tradePrice) > 0 && tradeDate;

  const input = {
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: '1px solid ' + A.ink, color: A.ink,
    fontFamily: A.font, fontSize: 14, padding: '8px 0', outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0,
      background: 'rgba(20,18,15,0.4)', zIndex: 40,
      animation: 'fadeIn .15s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: A.bg, padding: 18,
        borderTop: '2px solid ' + A.ink,
        animation: 'slideUp .2s ease-out',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
            {isEdit ? 'EDIT · HOLDING' : (mode === 'trade' ? 'NEW · TRADE' : 'NEW · HOLDING')}
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>CANCEL</button>
        </div>
        <ARule thick />

        {!isEdit && (
          <div style={{ display: 'flex', gap: 1, marginTop: 14, marginBottom: 4 }}>
            {['holding', 'trade'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                padding: '6px 0', fontSize: 10, letterSpacing: 1.2,
                border: '1px solid ' + (mode === m ? A.ink : A.rule2),
                background: mode === m ? A.ink : 'transparent',
                color: mode === m ? A.bg : A.ink,
              }}>{m.toUpperCase()}</button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>TICKER</div>
            <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="VTI" style={input} disabled={isEdit} autoFocus />
          </div>

          {mode === 'holding' ? (
            <>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>NAME</div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="VANGUARD TOTAL MKT" style={input} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>SHARES</div>
                <input type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder="0.00" style={input} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>PRICE</div>
                <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" style={input} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>DAY CHG (%)</div>
                <input type="number" step="any" value={chg} onChange={e => setChg(e.target.value)} placeholder="0.00" style={input} />
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>TYPE</div>
                <div style={{ display: 'flex', gap: 1 }}>
                  {['buy', 'sell'].map(tp => (
                    <button key={tp} onClick={() => setTradeType(tp)} style={{
                      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                      padding: '6px 0', fontSize: 10, letterSpacing: 1.2,
                      border: '1px solid ' + (tradeType === tp ? A.ink : A.rule2),
                      background: tradeType === tp ? A.ink : 'transparent',
                      color: tradeType === tp ? A.bg : A.ink,
                    }}>{tp.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>SHARES</div>
                <input type="number" step="any" value={tradeShares} onChange={e => setTradeShares(e.target.value)} placeholder="0.00" style={input} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>PRICE</div>
                <input type="number" step="any" value={tradePrice} onChange={e => setTradePrice(e.target.value)} placeholder="0.00" style={input} />
              </div>
              <div>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 }}>DATE</div>
                <input type="date" value={tradeDate} onChange={e => setTradeDate(e.target.value)} style={input} />
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 8, alignItems: 'center' }}>
          {isEdit && (
            <button onClick={() => { onRemove(holding.ticker); onClose(); }}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1 }}>
              REMOVE
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={mode === 'holding' ? handleHolding : handleTrade}
            disabled={mode === 'holding' ? !canSaveHolding : !canSaveTrade}
            style={{
              all: 'unset',
              cursor: (mode === 'holding' ? canSaveHolding : canSaveTrade) ? 'pointer' : 'default',
              fontSize: 11, letterSpacing: 1.5, padding: '10px 24px',
              background: (mode === 'holding' ? canSaveHolding : canSaveTrade) ? t.accent : A.rule2,
              color: (mode === 'holding' ? canSaveHolding : canSaveTrade) ? A.bg : A.muted,
            }}>
            {isEdit ? 'SAVE' : (mode === 'trade' ? 'RECORD' : 'ADD')}
          </button>
        </div>
      </div>
    </div>
  );
}
