import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel, ADetailCell } from '../../components/Shared';
import { fmtMoney, fmtSigned, dayLabel, catBreadcrumb } from '../../data';
import { useStore } from '../../store';
import AccountFormSheet from '../../components/AccountFormSheet';

export function Accounts({ t, onAcct }) {
  const { accountsWithBalance, allAccountsWithBalance, reorderAccounts } = useStore();
  const [sheetAccount, setSheetAccount] = React.useState(undefined); // undefined=closed, null=new, obj=edit
  const [reorderMode, setReorderMode]   = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);

  const NET_WORTH = accountsWithBalance.reduce(
    (s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0
  );

  const flatSorted = React.useMemo(
    () => [...accountsWithBalance].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [accountsWithBalance],
  );
  const archivedAccounts = React.useMemo(
    () => (allAccountsWithBalance || []).filter(a => a.archived),
    [allAccountsWithBalance],
  );
  const archivedCount = archivedAccounts.length;

  React.useEffect(() => {
    if (sheetAccount && sheetAccount.id && !accountsWithBalance.some(a => a.id === sheetAccount.id)) {
      setSheetAccount(undefined);
    }
  }, [accountsWithBalance, sheetAccount]);

  const moveAccount = (idx, dir) => {
    const ids = flatSorted.map(a => a.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= ids.length) return;
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    reorderAccounts(ids);
  };

  const groups = [
    ['CASH',        flatSorted.filter(a => ['CHK', 'SAV', 'FX', 'CASH'].includes(a.type))],
    ['CREDIT',      flatSorted.filter(a => a.type === 'CC')],
    ['INVESTMENTS', flatSorted.filter(a => a.type === 'INV')],
    ['CRYPTO',      flatSorted.filter(a => a.type === 'CRY')],
    ['LOANS',       flatSorted.filter(a => a.type === 'LOAN')],
  ].filter(([, rows]) => rows.length > 0);

  return (
    <div style={{ padding: '0 18px 20px', position: 'relative' }}>
      {sheetAccount !== undefined && (
        <AccountFormSheet t={t} onClose={() => setSheetAccount(undefined)} editAccount={sheetAccount} />
      )}

      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>ACCOUNTS</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {reorderMode ? (
            <button onClick={() => setReorderMode(false)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>DONE</button>
          ) : (
            <>
              <button onClick={() => setReorderMode(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.muted }}>REORDER</button>
              <button onClick={() => setSheetAccount(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.ink }}>+ ADD</button>
            </>
          )}
        </div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0' }}>
        <ALabel>TOTAL</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>
          {fmtMoney(NET_WORTH, 'USD', t.decimals)}
        </div>
      </div>
      <ARule />

      {reorderMode ? (
        /* ── Reorder mode: up/down arrows ── */
        <div>
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, padding: '10px 0 6px' }}>TAP ▲▼ TO REORDER</div>
          {flatSorted.map((a, idx) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button onClick={() => moveAccount(idx, -1)} disabled={idx === 0} style={{ all: 'unset', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 11, color: idx === 0 ? A.rule2 : A.muted, lineHeight: 1 }}>▲</button>
                <button onClick={() => moveAccount(idx, 1)} disabled={idx === flatSorted.length - 1} style={{ all: 'unset', cursor: idx === flatSorted.length - 1 ? 'default' : 'pointer', fontSize: 11, color: idx === flatSorted.length - 1 ? A.rule2 : A.muted, lineHeight: 1 }}>▼</button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>{a.type}</div>
              </div>
              <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoney(a.balance, a.ccy, t.decimals)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Normal grouped view ── */
        <>
          {groups.map(([title, rows]) => (
            <div key={title}>
              <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'space-between' }}>
                <ALabel>{title}</ALabel>
                <ALabel>{fmtMoney(rows.reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0), 'USD', t.decimals)}</ALabel>
              </div>
              {rows.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid ' + A.rule2 }}>
                  <button onClick={() => onAcct(a.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: t.density === 'compact' ? '8px 0' : '12px 0' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>{a.type} · {a.code}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? A.neg : A.ink }}>
                          {fmtMoney(a.balance, a.ccy, t.decimals)}
                        </div>
                        <div style={{ fontSize: 10, color: a.delta < 0 ? A.neg : t.accent, marginTop: 2 }}>
                          {fmtSigned(a.delta, a.ccy, t.decimals)}
                        </div>
                      </div>
                    </div>
                  </button>
                  <button onClick={() => setSheetAccount(a)} style={{ all: 'unset', cursor: 'pointer', padding: '12px 0 12px 14px', fontSize: 15, color: A.muted }}>✎</button>
                </div>
              ))}
            </div>
          ))}

          {/* Archived rows */}
          {showArchived && archivedAccounts.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid ' + A.rule2, opacity: 0.45 }}>
              <div style={{ flex: 1, padding: '10px 0' }}>
                <div style={{ fontSize: 13, fontStyle: 'italic' }}>{a.name}</div>
                <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>ARCHIVED · {a.type}</div>
              </div>
              <button onClick={() => setSheetAccount(a)} style={{ all: 'unset', cursor: 'pointer', padding: '12px 0 12px 14px', fontSize: 15, color: A.muted }}>✎</button>
            </div>
          ))}

          {archivedCount > 0 && (
            <button onClick={() => setShowArchived(s => !s)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1, padding: '12px 0', display: 'block' }}>
              {showArchived ? 'HIDE ARCHIVED' : `SHOW ARCHIVED (${archivedCount})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function AccountDetail({ t, accountId, onBack }) {
  const { accountsWithBalance, transactions } = useStore();
  const a = accountsWithBalance.find(x => x.id === accountId) || accountsWithBalance[0];
  const txns = transactions.filter(x => x.acct === a?.id).slice(0, 10);

  if (!a) return null;

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>{a.type} · {a.code}</div>
      </div>
      <ARule thick />
      <div style={{ padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1.4, color: A.muted, textTransform: 'uppercase' }}>{a.name}</div>
        <div style={{ fontSize: 34, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4, color: a.balance < 0 ? A.neg : A.ink }}>
          {fmtMoney(a.balance, a.ccy, t.decimals)}
        </div>
        <div style={{ fontSize: 11, color: a.delta < 0 ? A.neg : t.accent, marginTop: 2 }}>
          {fmtSigned(a.delta, a.ccy, t.decimals)} · 30D
        </div>
      </div>
      <div style={{ display: 'flex', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2, marginTop: 6 }}>
        {a.type === 'CC' ? (
          <>
            <ADetailCell label="CREDIT LIMIT" val={fmtMoney(10000, 'USD', t.decimals)} />
            <ADetailCell label="AVAILABLE" val={fmtMoney(10000 + a.balance, 'USD', t.decimals)} />
            <ADetailCell label="APR" val="22.74%" />
          </>
        ) : a.type === 'INV' ? (
          <>
            <ADetailCell label="COST BASIS" val={fmtMoney(a.balance * 0.78, 'USD', t.decimals)} />
            <ADetailCell label="GAIN" val={fmtSigned(a.balance * 0.22, 'USD', t.decimals)} c={t.accent} />
            <ADetailCell label="YIELD" val="1.42%" />
          </>
        ) : (
          <>
            <ADetailCell label="AVAILABLE" val={fmtMoney(a.balance, a.ccy, t.decimals)} />
            <ADetailCell label="APY" val={a.type === 'SAV' ? '4.20%' : '0.00%'} />
            <ADetailCell label="STATEMENT" val="MAY 28" />
          </>
        )}
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 6px' }}><ALabel>RECENT · ACTIVITY</ALabel></div>
      {txns.map(tx => (
        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: t.density === 'compact' ? '7px 0' : '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {dayLabel(tx.date)} · {catBreadcrumb(tx.path || [tx.cat])}
            </div>
          </div>
          <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: tx.amt < 0 ? A.ink : t.accent, flexShrink: 0 }}>
            {fmtSigned(tx.amt, tx.ccy, t.decimals)}
          </div>
        </div>
      ))}
    </div>
  );
}
