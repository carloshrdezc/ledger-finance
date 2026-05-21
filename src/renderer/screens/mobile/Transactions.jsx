import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import { fmtMoney, fmtSigned, dayLabel, catGlyph, catBreadcrumb } from '../../data';
import { useUndoableStore } from '../../useUndoableStore';
import AddSheet from './AddSheet';
import EmptySectionHint from '../../components/EmptySectionHint';

export default function Transactions({ t }) {
  const { transactions, periodTransactions, deleteTx, deleteTransfer, accountsWithBalance, periodLabel, txFilter, clearTxFilter } = useUndoableStore();
  const [filter, setFilter] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [editTx, setEditTx] = React.useState(null);

  const matchesTxFilter = React.useCallback((tx) => {
    if (!txFilter) return true;
    if (txFilter.category && tx.cat !== txFilter.category && (tx.path || [])[0] !== txFilter.category) return false;
    if (txFilter.merchant) {
      const key = (tx.name || '').split(' · ')[0];
      if (key !== txFilter.merchant) return false;
    }
    if (txFilter.date && tx.date !== txFilter.date) return false;
    if (txFilter.weekday != null) {
      const d = new Date(`${tx.date}T00:00:00`);
      const dow = (d.getDay() + 6) % 7;
      if (dow !== txFilter.weekday) return false;
    }
    if (txFilter.type === 'expense' && tx.amt >= 0) return false;
    if (txFilter.type === 'income' && tx.amt < 0) return false;
    if (txFilter.account && tx.acct !== txFilter.account) return false;
    return true;
  }, [txFilter]);

  const sourceTxs = txFilter && txFilter.date ? transactions : periodTransactions;

  const visible = sourceTxs.filter(x => {
    if (!matchesTxFilter(x)) return false;
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

  const filterChipLabel = React.useMemo(() => {
    if (!txFilter) return null;
    const parts = [];
    if (txFilter.category) parts.push(txFilter.category.toUpperCase());
    if (txFilter.merchant) parts.push(txFilter.merchant);
    if (txFilter.date) parts.push(txFilter.date);
    if (txFilter.weekday != null) parts.push(['MON','TUE','WED','THU','FRI','SAT','SUN'][txFilter.weekday]);
    if (txFilter.type) parts.push(txFilter.type.toUpperCase());
    return parts.join(' · ');
  }, [txFilter]);

  const byDate = {};
  visible.forEach(tx => { (byDate[tx.date] = byDate[tx.date] || []).push(tx); });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>TRANSACTIONS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2 }}>
          {periodLabel} · {visible.length} · {fmtMoney(visible.reduce((s, x) => s + Math.abs(x.amt), 0), t.currency, false)}
        </div>
      </div>
      <ARule thick />
      <div style={{ padding: '10px 0 2px' }}>
        <PeriodSwitcher compact />
      </div>

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
        {filterChipLabel && (
          <button onClick={clearTxFilter} style={{
            all: 'unset', cursor: 'pointer', padding: '4px 9px',
            border: '1px solid ' + t.accent, background: t.accent, color: A.bg,
            fontSize: 10, letterSpacing: 1.2, flexShrink: 0,
          }}>{filterChipLabel} · ✕</button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptySectionHint
          message={transactions.length === 0
            ? "No transactions yet. Add one with the + button."
            : "No transactions match the current filter."}
        />
      ) : null}

      {dates.map(date => (
        <div key={date}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '1px solid ' + A.rule2 }}>
            <ALabel>{dayLabel(date)}</ALabel>
            <ALabel>{fmtSigned(byDate[date].reduce((s, x) => s + x.amt, 0), t.currency, t.decimals)}</ALabel>
          </div>
          {byDate[date].map(tx => (
            <SwipeRow
              key={tx.id}
              t={t}
              tx={tx}
              onDelete={() => tx.transferId ? deleteTransfer(tx.transferId) : deleteTx(tx.id)}
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
            {tx.cat === 'transfer' ? '⇄' : catGlyph(tx.path || [tx.cat])}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {catBreadcrumb(tx.path || [tx.cat])} · {accountsWithBalance.find(a => a.id === tx.acct)?.code}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: tx.cat === 'transfer' ? A.ink2 : (tx.amt >= 0 ? t.accent : A.ink) }}>
          {fmtSigned(tx.amt, tx.ccy, t.decimals)}
        </div>
      </div>
    </div>
  );
}
