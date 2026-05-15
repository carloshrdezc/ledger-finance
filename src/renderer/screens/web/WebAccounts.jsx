import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import WebShell from './WebShell';
import AccountFormModal from '../../components/AccountFormModal';
import { fmtMoney, fmtSigned, dayLabel, catGlyph } from '../../data';
import { useStore } from '../../store';

const TYPE_LABELS = {
  CHK: 'CHECKING', SAV: 'SAVINGS', CC: 'CREDIT CARD',
  INV: 'INVESTMENT', CRY: 'CRYPTO', FX: 'FOREIGN',
  LOAN: 'LOAN', CASH: 'CASH',
};
const TYPE_ORDER = ['CHK', 'SAV', 'CC', 'INV', 'CRY', 'FX', 'LOAN', 'CASH'];

export default function WebAccounts({ t, onNavigate, onAdd }) {
  const { transactions, accountsWithBalance, allAccountsWithBalance, reorderAccounts } = useStore();
  const [selected, setSelected]       = React.useState(null);
  const [modalAccount, setModalAccount] = React.useState(undefined); // undefined=closed, null=new, obj=edit
  const [reorderMode, setReorderMode] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [dragIdx, setDragIdx]         = React.useState(null);
  const [overIdx, setOverIdx]         = React.useState(null);

  React.useEffect(() => {
    if (selected && !accountsWithBalance.some(a => a.id === selected)) {
      setSelected(null);
    }
  }, [accountsWithBalance, selected]);

  const archivedAccounts = (allAccountsWithBalance || []).filter(a => a.archived);
  const archivedCount    = archivedAccounts.length;

  const NET_WORTH = accountsWithBalance.reduce(
    (s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0
  );

  const acctTxs = selected ? transactions.filter(tx => tx.acct === selected) : [];

  // Flat sorted active accounts (used for reorder mode and drag logic)
  const flatSorted = React.useMemo(
    () => [...accountsWithBalance].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [accountsWithBalance],
  );

  const handleDragStart = idx => setDragIdx(idx);
  const handleDragOver  = (e, idx) => { e.preventDefault(); setOverIdx(idx); };
  const handleDrop      = () => {
    if (dragIdx === null || dragIdx === overIdx) { setDragIdx(null); setOverIdx(null); return; }
    const ids = flatSorted.map(a => a.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(overIdx, 0, moved);
    reorderAccounts(ids);
    setDragIdx(null);
    setOverIdx(null);
  };

  // Grouped by type for normal view
  const grouped = TYPE_ORDER
    .map(type => ({ type, accounts: flatSorted.filter(a => a.type === type) }))
    .filter(g => g.accounts.length > 0);

  return (
    <WebShell active="accounts" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      {modalAccount !== undefined && (
        <AccountFormModal
          t={t}
          onClose={() => setModalAccount(undefined)}
          editAccount={modalAccount}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] ACCOUNTS · {accountsWithBalance.length} LINKED</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(NET_WORTH, 'USD', t.decimals)}
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>NET WORTH</div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {reorderMode ? (
            <button onClick={() => setReorderMode(false)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.4, color: t.accent }}>DONE</button>
          ) : (
            <>
              <button onClick={() => setReorderMode(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.4, color: A.muted }}>REORDER</button>
              <button onClick={() => setModalAccount(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.4, color: A.ink }}>+ ADD ACCOUNT</button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: selected && !reorderMode ? '1fr 1fr' : '1fr', gap: 28 }}>
        <div>
          {reorderMode ? (
            /* ── Reorder mode: flat draggable list ── */
            <div>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 8 }}>DRAG TO REORDER</div>
              <div style={{ borderTop: '2px solid ' + A.ink }}>
                {flatSorted.map((a, idx) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={handleDrop}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    style={{
                      display: 'grid', gridTemplateColumns: '24px 1fr 80px',
                      padding: '10px 0', borderBottom: '1px solid ' + A.rule2,
                      alignItems: 'center', cursor: 'grab',
                      background: overIdx === idx ? A.ink + '18' : 'transparent',
                      opacity: dragIdx === idx ? 0.4 : 1,
                    }}
                  >
                    <div style={{ fontSize: 12, color: A.muted, userSelect: 'none' }}>⠿</div>
                    <div style={{ fontSize: 12 }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: A.muted }}>{a.type}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── Normal grouped view ── */
            <>
              {grouped.map(({ type, accounts }) => (
                <div key={type} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 6 }}>
                    {TYPE_LABELS[type] || type}
                  </div>
                  <div style={{ borderTop: '2px solid ' + A.ink }}>
                    {accounts.map(a => (
                      <div key={a.id} style={{ display: 'flex', borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
                        <button
                          onClick={() => setSelected(selected === a.id ? null : a.id)}
                          style={{
                            all: 'unset', cursor: 'pointer', flex: 1,
                            display: 'grid', gridTemplateColumns: '24px 1fr 80px 120px 90px',
                            padding: t.density === 'compact' ? '8px 0' : '11px 0',
                            alignItems: 'center',
                            background: selected === a.id ? A.ink + '10' : 'transparent',
                          }}>
                          <div style={{ fontSize: 9, color: A.muted }}>{a.type}</div>
                          <div style={{ fontSize: 12, fontWeight: selected === a.id ? 600 : 400 }}>{a.name}</div>
                          <div style={{ fontSize: 10, color: A.muted }}>{a.code}</div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: a.balance < 0 ? A.neg : A.ink }}>
                            {fmtMoney(a.balance, a.ccy, t.decimals)}
                          </div>
                          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 10, color: a.delta < 0 ? A.neg : t.accent }}>
                            {fmtSigned(a.delta, a.ccy, t.decimals)}
                          </div>
                        </button>
                        <button
                          onClick={() => setModalAccount(a)}
                          style={{ all: 'unset', cursor: 'pointer', padding: '0 10px', fontSize: 13, color: A.muted }}>
                          ✎
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Archived rows (muted) */}
              {showArchived && archivedAccounts.map(a => (
                <div key={a.id} style={{ display: 'flex', borderBottom: '1px solid ' + A.rule2, alignItems: 'center', opacity: 0.45 }}>
                  <div style={{
                    flex: 1, display: 'grid', gridTemplateColumns: '24px 1fr 80px 120px 90px',
                    padding: '8px 0', alignItems: 'center',
                  }}>
                    <div style={{ fontSize: 9, color: A.muted }}>{a.type}</div>
                    <div style={{ fontSize: 12, fontStyle: 'italic' }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: A.muted }}>{a.code}</div>
                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: A.muted }}>
                      {fmtMoney(a.balance, a.ccy, t.decimals)}
                    </div>
                    <div />
                  </div>
                  <button onClick={() => setModalAccount(a)} style={{ all: 'unset', cursor: 'pointer', padding: '0 10px', fontSize: 13, color: A.muted }}>✎</button>
                </div>
              ))}

              {archivedCount > 0 && (
                <button onClick={() => setShowArchived(s => !s)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1, marginTop: 8, display: 'block' }}>
                  {showArchived ? 'HIDE ARCHIVED' : `SHOW ARCHIVED (${archivedCount})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* Transaction detail panel */}
        {selected && !reorderMode && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <ALabel>{accountsWithBalance.find(a => a.id === selected)?.name}</ALabel>
              <button onClick={() => setSelected(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>CLOSE ×</button>
            </div>
            <div style={{ borderTop: '2px solid ' + A.ink }}>
              <div style={{ display: 'grid', gridTemplateColumns: '70px 18px 1fr 90px', padding: '6px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
                <div>DATE</div><div /><div>MERCHANT</div><div style={{ textAlign: 'right' }}>AMOUNT</div>
              </div>
              {acctTxs.length === 0 && (
                <div style={{ fontSize: 11, color: A.muted, padding: '16px 0', letterSpacing: 1 }}>NO TRANSACTIONS</div>
              )}
              {acctTxs.map(tx => (
                <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '70px 18px 1fr 90px', padding: t.density === 'compact' ? '7px 0' : '9px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.date)}</div>
                  <div style={{ fontSize: 11 }}>{catGlyph(tx.path || [tx.cat])}</div>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tx.amt >= 0 ? t.accent : A.ink }}>
                    {fmtSigned(tx.amt, tx.ccy, t.decimals)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </WebShell>
  );
}
