import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { TRANSACTIONS, ACCOUNTS, fmtMoney, fmtSigned, dayLabel, catGlyph, catBreadcrumb } from '../../data';

export default function Transactions({ t, hidden, onSwipeHide, filter, setFilter }) {
  const visible = TRANSACTIONS.filter(x => {
    if (hidden.includes(x.id)) return false;
    if (filter === 'ALL') return true;
    if (filter === 'EXP') return x.amt < 0;
    if (filter === 'INC') return x.amt >= 0;
    return x.cat === filter.toLowerCase();
  });

  const byDay = {};
  visible.forEach(tx => { (byDay[tx.d] = byDay[tx.d] || []).push(tx); });
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>TRANSACTIONS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2 }}>
          {visible.length} · {fmtMoney(visible.reduce((s, x) => s + Math.abs(x.amt), 0), 'USD', false)}
        </div>
      </div>
      <ARule thick />
      <div style={{ display: 'flex', gap: 6, padding: '12px 0', overflowX: 'auto', flexWrap: 'nowrap' }}>
        {['ALL','EXP','INC','FOOD','DINING','TRANS','SUBS','SHOP'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            all: 'unset', cursor: 'pointer', padding: '4px 9px',
            border: '1px solid ' + (filter === f ? A.ink : A.rule2),
            background: filter === f ? A.ink : 'transparent',
            color: filter === f ? A.bg : A.ink,
            fontSize: 10, letterSpacing: 1.2, flexShrink: 0,
          }}>{f}</button>
        ))}
      </div>
      {days.map(d => (
        <div key={d}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '1px solid ' + A.rule2 }}>
            <ALabel>{dayLabel(d)}</ALabel>
            <ALabel>{fmtSigned(byDay[d].reduce((s, x) => s + x.amt, 0), 'USD', t.decimals)}</ALabel>
          </div>
          {byDay[d].map(tx => (
            <SwipeRow key={tx.id} t={t} tx={tx} onHide={() => onSwipeHide(tx.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SwipeRow({ t, tx, onHide }) {
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const ref = React.useRef();
  const startX = React.useRef(0);

  const onDown = (e) => {
    setDragging(true);
    startX.current = e.clientX - dx;
    ref.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    setDx(Math.max(-120, Math.min(120, e.clientX - startX.current)));
  };
  const onUp = () => {
    setDragging(false);
    if (dx < -80) { onHide(); setDx(0); }
    else setDx(0);
  };

  return (
    <div style={{ position: 'relative', borderBottom: '1px solid ' + A.rule2, background: A.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 14px', fontSize: 10, letterSpacing: 1.4 }}>
        <span style={{ color: A.neg }}>HIDE ▸</span>
      </div>
      <div ref={ref}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{
          background: A.bg, padding: t.density === 'compact' ? '8px 0' : '11px 0',
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform .2s',
          touchAction: 'pan-y', cursor: 'grab',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }}>
            {catGlyph(tx.path || [tx.cat])}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {catBreadcrumb(tx.path || [tx.cat])} · {ACCOUNTS.find(a => a.id === tx.acct)?.code}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: tx.amt >= 0 ? t.accent : A.ink }}>
          {fmtSigned(tx.amt, tx.ccy, t.decimals)}
        </div>
      </div>
    </div>
  );
}
