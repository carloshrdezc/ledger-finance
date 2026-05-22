import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import WebShell from './WebShell';
import WebAddModal from './WebAddModal';
import EmptySectionHint from '../../components/EmptySectionHint';
import TransactionRow from '../../components/TransactionRow';
import { fmtMoney, fmtSigned, dayLabel, catGlyph, catBreadcrumb } from '../../data';
import { useUndoableStore } from '../../useUndoableStore';
import { exportCSV } from '../../importExport';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

function download(name, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function WebTransactions({ t, onNavigate, onAdd }) {
  const { transactions, periodTransactions, deleteTx, deleteTransfer, accountsWithBalance, periodLabel, txFilter, clearTxFilter } = useUndoableStore();
  const [filter, setFilter] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [editTx, setEditTx] = React.useState(null);
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const searchRef = React.useRef(null);
  const rowRefs = React.useRef({});

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

  // When a date filter is active, search across ALL transactions (not just
  // the current period) so the user sees their click target.
  const sourceTxs = txFilter && txFilter.date ? transactions : periodTransactions;

  const visible = sourceTxs.filter(x => {
    if (!matchesTxFilter(x)) return false;
    if (filter !== 'ALL') {
      if (filter === 'EXP' && x.amt >= 0) return false;
      if (filter === 'INC' && x.amt < 0) return false;
      if (!['EXP','INC','ALL'].includes(filter) && x.cat !== filter.toLowerCase()) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return x.name.toLowerCase().includes(q) || (x.cat || '').includes(q);
    }
    return true;
  });
  const total = visible.reduce((s, x) => s + Math.abs(x.amt), 0);

  React.useEffect(() => {
    setSelectedIdx(0);
  }, [visible.length, visible[0]?.id]);

  React.useEffect(() => {
    const tx = visible[selectedIdx];
    if (!tx) return;
    const el = rowRefs.current[tx.id];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx, visible]);

  const txBindings = React.useMemo(() => [
    { keys: 'j', handler: () => setSelectedIdx(i => Math.min(i + 1, Math.max(0, visible.length - 1))) },
    { keys: 'k', handler: () => setSelectedIdx(i => Math.max(0, i - 1)) },
    { keys: 'e', handler: () => {
        const tx = visible[selectedIdx];
        if (tx) setEditTx(tx);
      } },
    { keys: '/', handler: () => searchRef.current?.focus() },
  ], [visible, selectedIdx]);

  useKeyboardShortcuts({ bindings: txBindings });

  // Build a human label for the active txFilter chip.
  const filterChipLabel = React.useMemo(() => {
    if (!txFilter) return null;
    const parts = [];
    if (txFilter.category) parts.push('CAT · ' + txFilter.category.toUpperCase());
    if (txFilter.merchant) parts.push('MERCHANT · ' + txFilter.merchant);
    if (txFilter.date) parts.push('DATE · ' + txFilter.date);
    if (txFilter.weekday != null) parts.push('DAY · ' + ['MON','TUE','WED','THU','FRI','SAT','SUN'][txFilter.weekday]);
    if (txFilter.type) parts.push(txFilter.type.toUpperCase());
    if (txFilter.account) parts.push('ACCT · ' + txFilter.account);
    return parts.join(' · ');
  }, [txFilter]);

  return (
    <WebShell active="tx" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] TRANSACTIONS · {periodLabel}</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {visible.length} <span style={{ color: A.muted, fontSize: 24 }}>· {fmtMoney(total, t.currency, false)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <PeriodSwitcher />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="SEARCH…"
            style={{ fontFamily: A.font, fontSize: 11, padding: '6px 10px', border: '1px solid ' + A.rule2, background: A.bg, color: A.ink, letterSpacing: 1, width: 160, outline: 'none' }} />
          <button onClick={() => download(`ledger-${new Date().toISOString().slice(0,10)}.csv`, exportCSV(transactions))} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, padding: '6px 12px', border: '1px solid ' + A.ink, background: A.ink, color: A.bg }}>
            EXPORT · CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
        {['ALL','EXP','INC','FOOD','DINING','TRANS','SUBS','SHOP','HEALTH','EDU','TRAVEL'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            all: 'unset', cursor: 'pointer', padding: '4px 10px',
            border: '1px solid ' + (filter === f ? A.ink : A.rule2),
            background: filter === f ? A.ink : 'transparent',
            color: filter === f ? A.bg : A.ink,
            fontSize: 10, letterSpacing: 1.2,
          }}>{f}</button>
        ))}
        {filterChipLabel && (
          <button onClick={clearTxFilter} title="Clear report filter" style={{
            all: 'unset', cursor: 'pointer', padding: '4px 10px',
            border: '1px solid ' + t.accent, background: t.accent, color: A.bg,
            fontSize: 10, letterSpacing: 1.2,
          }}>FROM REPORT · {filterChipLabel} · ✕</button>
        )}
      </div>

      <div style={{ marginTop: 18, borderTop: '2px solid ' + A.ink }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 90px 24px 1fr 280px 90px 120px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
          <div /><div>DATE</div><div /><div>MERCHANT</div><div>CATEGORY</div><div>ACCT</div><div style={{ textAlign: 'right' }}>AMOUNT</div>
        </div>
        {visible.length === 0 ? (
          <EmptySectionHint
            message={transactions.length === 0
              ? "No transactions yet. Add one with the + button or import a bank file."
              : "No transactions match the current filter."}
            ctaLabel={transactions.length === 0 ? "ADD TRANSACTION" : null}
            onCta={transactions.length === 0 ? onAdd : null}
          />
        ) : null}
        {visible.map((tx, i) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            t={t}
            isFocused={i === selectedIdx}
            isSelected={false /* wired in Task 12 */}
            accountsWithBalance={accountsWithBalance}
            onRowClick={() => setEditTx(tx)}
            onCheckboxToggle={undefined /* wired in Task 12 */}
            innerRef={el => { if (el) rowRefs.current[tx.id] = el; else delete rowRefs.current[tx.id]; }}
          />
        ))}
      </div>

      {editTx && (
        <WebAddModal t={t} editTx={editTx} onClose={() => setEditTx(null)} />
      )}
    </WebShell>
  );
}
