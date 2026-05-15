import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { fmtMoney, fmtSigned, dayLabel, catGlyph, catBreadcrumb } from '../../data';
import { useStore } from '../../store';
import AddSheet from './AddSheet';

export default function Transactions({ t }) {
  const { transactions, deleteTx, accountsWithBalance } = useStore();
  const [filter, setFilter] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [editTx, setEditTx] = React.useState(null);

  const visible = transactions.filter(x => {
    if (filter !== 'ALL') {
      if (filter === 'EXP' && x.amt >= 0) return false;
      if (filter === 'INC' && x.amt < 0) return false;
      if (!['EXP','INC'].includes(filter) && x.cat !== filter.toLowerCase()) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return x.name.toLowerCase().includes(q) || (x.cat || '').includes(q);
    }
    return true;
  });

  const byDate = {};
  visible.forEach(tx => { (byDate[tx.date] = byDate[tx.date] || []).push(tx); });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>TRANSACTIONS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2 }}>
          {visible.length} · {fmtMoney(visible.reduce((s, x) => s + Math.abs(x.amt), 0), 'USD', false)}
        </div>
      </div>
      <ARule thick />

      <div style={{ padding: '10px 0 4px' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH…"
          style={{
            all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
            fontFamily: A.font, fontSize: 11, letterSpacing: 1,
            border: '1px solid ' + A.rule2, padding: '7px 10px', color: A.ink,
            background: A.bg,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 0', overflowX: 'auto', flexWrap: 'nowrap' }}>
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

      {dates.map(date => (
        <div key={date}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '1px solid ' + A.rule2 }}>
            <ALabel>{dayLabel(date)}</ALabel>
            <ALabel>{fmtSigned(byDate[date].reduce((s, x) => s + x.amt, 0), 'USD', t.decimals)}</ALabel>
          </div>
          {byDate[date].map(tx => (
            <SwipeRow
              key={tx.id}
              t={t}
              tx={tx}
              onDelete={() => deleteTx(tx.id)}
              onTap={() => setEditTx(tx)}
              accountsWithBalance={accountsWithBalance}
            />
          ))}
        </div>
      ))}

      {editTx && (
        <AddSheet t={t} editTx={editTx} onClose={() => setEditTx(null)} />
      )}
    </div>
  );
}

function SwipeRow({ t, tx, onDelete, onTap, accountsWithBalance }) {
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
    const wasDrag = Math.abs(dx) > 10;
    if (dx < -80) { onDelete(); setDx(0); }
    else if (!wasDrag) { onTap(); setDx(0); }
    else setDx(0);
  };

  return (
    <div style={{ position: 'relative', borderBottom: '1px solid ' + A.rule2, background: A.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 14px', fontSize: 10, letterSpacing: 1.4 }}>
        <span style={{ color: A.neg }}>DELETE ▸</span>
      </div>
      <div ref={ref}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{
          background: A.bg, padding: t.density === 'compact' ? '8px 0' : '11px 0',
          transform: `translateX(${dx}px)`,
          transition: dragging ? 'none' : 'transform .2s',
          touchAction: 'pan-y', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }}>
            {catGlyph(tx.path || [tx.cat])}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {catBreadcrumb(tx.path || [tx.cat])} · {accountsWithBalance.find(a => a.id === tx.acct)?.code}
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
