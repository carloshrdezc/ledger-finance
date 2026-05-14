import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import WebShell from './WebShell';
import { fmtMoney, fmtSigned, dayLabel, catGlyph } from '../../data';
import { useStore } from '../../store';

const TYPE_LABELS = { CHK: 'CHECKING', SAV: 'SAVINGS', CC: 'CREDIT CARD', INV: 'INVESTMENT', CRY: 'CRYPTO', FX: 'FOREIGN' };
const TYPE_ORDER  = ['CHK', 'SAV', 'CC', 'INV', 'CRY', 'FX'];

export default function WebAccounts({ t, onNavigate, onAdd }) {
  const { transactions, accountsWithBalance } = useStore();
  const [selected, setSelected] = React.useState(null);

  const NET_WORTH = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0);

  const acctTxs = selected
    ? transactions.filter(tx => tx.acct === selected)
    : [];

  const grouped = TYPE_ORDER
    .map(type => ({ type, accounts: accountsWithBalance.filter(a => a.type === type) }))
    .filter(g => g.accounts.length > 0);

  return (
    <WebShell active="accounts" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] ACCOUNTS · {accountsWithBalance.length} LINKED</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(NET_WORTH, 'USD', t.decimals)}
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>NET WORTH</div>
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 28 }}>
        <div>
          {grouped.map(({ type, accounts }) => (
            <div key={type} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 6 }}>{TYPE_LABELS[type] || type}</div>
              <div style={{ borderTop: '2px solid ' + A.ink }}>
                {accounts.map(a => (
                  <button key={a.id} onClick={() => setSelected(selected === a.id ? null : a.id)}
                    style={{
                      all: 'unset', cursor: 'pointer', display: 'grid',
                      gridTemplateColumns: '24px 1fr 80px 120px 90px',
                      width: '100%', padding: t.density === 'compact' ? '8px 0' : '11px 0',
                      borderBottom: '1px solid ' + A.rule2, alignItems: 'center',
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
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected && (
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
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.d)}</div>
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
