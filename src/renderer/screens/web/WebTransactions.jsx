import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import WebShell from './WebShell';
import WebAddModal from './WebAddModal';
import EmptySectionHint from '../../components/EmptySectionHint';
import TransactionRow from '../../components/TransactionRow';
import { fmtMoney } from '../../data';
import { useUndoableStore } from '../../useUndoableStore';
import { exportCSV } from '../../importExport';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useBulkSelection from '../../hooks/useBulkSelection';
import BulkActionBar from '../../components/BulkActionBar';
import { detectTransferPair } from '../../bulkOps.mjs';

function download(name, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function WebTransactions({ t, onNavigate, onAdd }) {
  const {
    transactions, periodTransactions, deleteTx, deleteTransfer,
    accountsWithBalance, periodLabel, selectedPeriod, txFilter, clearTxFilter,
    savedViews, addView, updateView, deleteView, setSelectedPeriod, setTxFilter,
    // CAR-82
    deleteTxs, hideTxs, updateTxs,
    // CAR-80 — for CategoryPicker in BulkActionBar
    categoryTree,
  } = useUndoableStore();
  const [filter, setFilter] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const [selectedViewId, setSelectedViewId] = React.useState('');
  const [editTx, setEditTx] = React.useState(null);
  const [convertFromTxs, setConvertFromTxs] = React.useState(null);
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const searchRef = React.useRef(null);
  const rowRefs = React.useRef({});
  const accountTypeById = React.useMemo(() => new Map((accountsWithBalance || []).map(a => [a.id, a.type])), [accountsWithBalance]);

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
    if (txFilter.excludeTransfers && tx.cat === 'transfer') return false;
    if (txFilter.account && tx.acct !== txFilter.account) return false;
    if (txFilter.accountType) {
      const wanted = Array.isArray(txFilter.accountType) ? txFilter.accountType : [txFilter.accountType];
      if (!wanted.includes(accountTypeById.get(tx.acct))) return false;
    }
    return true;
  }, [txFilter, accountTypeById]);

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

  const bulk = useBulkSelection(visible);
  const transferPair = React.useMemo(
    () => detectTransferPair(visible, bulk.selectedIds),
    [visible, bulk.selectedIds]
  );
  const canMarkAsTransfer = transferPair !== null;

  React.useEffect(() => {
    setSelectedIdx(0);
  }, [visible.length, visible[0]?.id]);

  // CAR-82: clear bulk selection on context change.
  // `selectedPeriod` isn't directly destructured here, but `periodLabel`
  // updates whenever it does (it's a derived display string from the store).
  React.useEffect(() => {
    bulk.clear();
  }, [filter, search, txFilter, periodLabel, bulk.clear]);

  React.useEffect(() => {
    const tx = visible[selectedIdx];
    if (!tx) return;
    const el = rowRefs.current[tx.id];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx, visible]);

  const txBindings = React.useMemo(() => [
    { keys: 'j', handler: () => {
        const next = Math.min(selectedIdx + 1, Math.max(0, visible.length - 1));
        setSelectedIdx(next);
        bulk.setAnchor(next);
      } },
    { keys: 'k', handler: () => {
        const next = Math.max(0, selectedIdx - 1);
        setSelectedIdx(next);
        bulk.setAnchor(next);
      } },
    { keys: 'J', handler: () => {
        const next = Math.min(selectedIdx + 1, Math.max(0, visible.length - 1));
        if (visible[next]) bulk.toggle(visible[next].id);
        setSelectedIdx(next);
        bulk.setAnchor(next);
      } },
    { keys: 'K', handler: () => {
        const next = Math.max(0, selectedIdx - 1);
        if (visible[next]) bulk.toggle(visible[next].id);
        setSelectedIdx(next);
        bulk.setAnchor(next);
      } },
    { keys: 'e', handler: () => {
        if (bulk.selectedCount > 0) return;
        const tx = visible[selectedIdx];
        if (tx) setEditTx(tx);
      } },
    { keys: '/', handler: () => searchRef.current?.focus() },
    { keys: 'x', handler: () => {
        const tx = visible[selectedIdx];
        if (tx) {
          bulk.toggle(tx.id);
          bulk.setAnchor(selectedIdx);
        }
      } },
    { keys: 'A', handler: () => {
        bulk.selectAll();
      } },
    { keys: 'Escape', handler: () => {
        if (bulk.selectedCount > 0) {
          bulk.clear();
        }
      } },
  ], [visible, selectedIdx, bulk]);

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
    if (txFilter.accountType) {
      const wanted = Array.isArray(txFilter.accountType) ? txFilter.accountType : [txFilter.accountType];
      parts.push('TYPE · ' + wanted.join('+'));
    }
    if (txFilter.excludeTransfers) parts.push('NO XFERS');
    return parts.join(' · ');
  }, [txFilter]);

  const txViews = React.useMemo(() => savedViews.filter(view => view.scope === 'tx'), [savedViews]);
  const selectedView = React.useMemo(() => txViews.find(view => view.id === selectedViewId) || null, [txViews, selectedViewId]);
  const applySavedView = React.useCallback((view) => {
    if (!view) return;
    if (view.period) setSelectedPeriod(view.period);
    setTxFilter(view.txFilter || null);
    if (view.search !== undefined) setSearch(view.search || '');
    setFilter('ALL');
  }, [setSelectedPeriod, setTxFilter]);
  const onSavedViewChange = React.useCallback((e) => {
    const id = e.target.value;
    setSelectedViewId(id);
    applySavedView(txViews.find(view => view.id === id));
  }, [applySavedView, txViews]);
  const saveCurrentView = React.useCallback(() => {
    const name = window.prompt('Save current view as');
    if (!name) return;
    addView({ scope: 'tx', name, period: selectedPeriod, search, txFilter });
  }, [addView, selectedPeriod, search, txFilter]);
  const renameSelectedView = React.useCallback(() => {
    if (!selectedView) return;
    const name = window.prompt('Rename view', selectedView.name);
    if (!name) return;
    updateView(selectedView.id, { name });
  }, [selectedView, updateView]);
  const updateSelectedView = React.useCallback(() => {
    if (!selectedView) return;
    updateView(selectedView.id, { period: selectedPeriod, search, txFilter });
  }, [selectedView, selectedPeriod, search, txFilter, updateView]);
  const deleteSelectedView = React.useCallback(() => {
    if (!selectedView) return;
    if (!window.confirm(`Delete view "${selectedView.name}"?`)) return;
    deleteView(selectedView.id);
    setSelectedViewId('');
  }, [deleteView, selectedView]);

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
            aria-label="Search"
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

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <select aria-label="Views" value={selectedViewId} onChange={onSavedViewChange} style={{ fontFamily: A.font, fontSize: 11, padding: '6px 10px', border: '1px solid ' + A.rule2, background: A.bg, color: A.ink, letterSpacing: 1, minWidth: 160 }}>
          <option value="">Views…</option>
          {txViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select>
        <button onClick={saveCurrentView} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, padding: '6px 12px', border: '1px solid ' + A.ink, background: A.ink, color: A.bg }}>SAVE CURRENT VIEW</button>
        <button onClick={renameSelectedView} disabled={!selectedView} style={{ all: 'unset', cursor: selectedView ? 'pointer' : 'not-allowed', fontSize: 10, letterSpacing: 1.2, padding: '6px 12px', border: '1px solid ' + (selectedView ? A.rule2 : A.rule3), color: selectedView ? A.ink : A.muted }}>RENAME VIEW</button>
        <button onClick={updateSelectedView} disabled={!selectedView} style={{ all: 'unset', cursor: selectedView ? 'pointer' : 'not-allowed', fontSize: 10, letterSpacing: 1.2, padding: '6px 12px', border: '1px solid ' + (selectedView ? A.rule2 : A.rule3), color: selectedView ? A.ink : A.muted }}>UPDATE FROM CURRENT FILTERS</button>
        <button onClick={deleteSelectedView} disabled={!selectedView} style={{ all: 'unset', cursor: selectedView ? 'pointer' : 'not-allowed', fontSize: 10, letterSpacing: 1.2, padding: '6px 12px', border: '1px solid ' + (selectedView ? A.neg : A.rule3), color: selectedView ? A.neg : A.muted }}>DELETE VIEW</button>
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
            isSelected={bulk.isSelected(tx.id)}
            accountsWithBalance={accountsWithBalance}
            onRowClick={(e) => {
              // Suppress edit-modal open while in bulk-select mode.
              if (bulk.selectedCount > 0) return;
              // Shift+click on row body extends selection (alternative to checkbox).
              if (e.shiftKey) {
                if (bulk.anchorIdx != null) bulk.range(bulk.anchorIdx, i);
                else { bulk.toggle(tx.id); bulk.setAnchor(i); }
                return;
              }
              // Cmd/Ctrl+click toggles a single row.
              if (e.metaKey || e.ctrlKey) {
                bulk.toggle(tx.id);
                bulk.setAnchor(i);
                return;
              }
              // Plain click: open edit modal (existing behaviour).
              setEditTx(tx);
            }}
            onCheckboxToggle={(e) => {
              // Shift-click on checkbox extends selection.
              if (e.shiftKey && bulk.anchorIdx != null) {
                bulk.range(bulk.anchorIdx, i);
              } else {
                bulk.toggle(tx.id);
                bulk.setAnchor(i);
              }
            }}
            innerRef={el => { if (el) rowRefs.current[tx.id] = el; else delete rowRefs.current[tx.id]; }}
          />
        ))}
      </div>

      {editTx && !convertFromTxs && (
        <WebAddModal t={t} editTx={editTx} onClose={() => setEditTx(null)} />
      )}

      {bulk.selectedCount > 0 && (
        <BulkActionBar
          count={bulk.selectedCount}
          canMarkAsTransfer={canMarkAsTransfer}
          categoryTree={categoryTree}
          accountsWithBalance={accountsWithBalance}
          onCategorize={(path) => {
            if (!path || path.length === 0) return;
            updateTxs([...bulk.selectedIds], { cat: path[0], path });
            bulk.clear();
          }}
          onSetAccount={(acctId) => {
            updateTxs([...bulk.selectedIds], { acct: acctId });
            bulk.clear();
          }}
          onMarkAsTransfer={() => {
            if (transferPair) setConvertFromTxs([transferPair.out, transferPair.inn]);
          }}
          onHide={() => {
            hideTxs([...bulk.selectedIds]);
            bulk.clear();
          }}
          onDelete={() => {
            deleteTxs([...bulk.selectedIds]);
            bulk.clear();
          }}
          onClear={() => bulk.clear()}
        />
      )}

      {convertFromTxs && (
        <WebAddModal
          t={t}
          convertFromTxs={convertFromTxs}
          onClose={() => {
            setConvertFromTxs(null);
            bulk.clear();
          }}
        />
      )}
    </WebShell>
  );
}
