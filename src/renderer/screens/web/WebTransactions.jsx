import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { ACCOUNTS, fmtMoney, fmtSigned, dayLabel, catGlyph, catBreadcrumb } from '../../data';
import { useStore } from '../../store';
import { exportCSV } from '../../importExport';

function download(name, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function WebTransactions({ t, onNavigate, onAdd }) {
  const { transactions } = useStore();
  const [filter, setFilter] = React.useState('ALL');
  const [search, setSearch] = React.useState('');

  const visible = transactions.filter(x => {
    if (filter !== 'ALL') {
      if (filter === 'EXP' && x.amt >= 0) return false;
      if (filter === 'INC' && x.amt < 0) return false;
      if (!['EXP','INC','ALL'].includes(filter) && x.cat !== filter.toLowerCase()) return false;
    }
    if (search && !x.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const total = visible.reduce((s, x) => s + Math.abs(x.amt), 0);

  return (
    <WebShell active="tx" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] TRANSACTIONS · MAY 2026</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {visible.length} <span style={{ color: A.muted, fontSize: 24 }}>· {fmtMoney(total, 'USD', false)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
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
      </div>

      <div style={{ marginTop: 18, borderTop: '2px solid ' + A.ink }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 24px 1fr 280px 90px 120px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
          <div>DATE</div><div /><div>MERCHANT</div><div>CATEGORY</div><div>ACCT</div><div style={{ textAlign: 'right' }}>AMOUNT</div>
        </div>
        {visible.map(tx => (
          <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '90px 24px 1fr 280px 90px 120px', padding: t.density === 'compact' ? '7px 0' : '10px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.d)}</div>
            <div>{catGlyph(tx.path || [tx.cat])}</div>
            <div style={{ fontSize: 12 }}>{tx.name}</div>
            <div style={{ color: A.ink2, fontSize: 10, letterSpacing: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {catBreadcrumb(tx.path || [tx.cat])}
            </div>
            <div style={{ color: A.muted, fontSize: 10 }}>{ACCOUNTS.find(a => a.id === tx.acct)?.code}</div>
            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tx.amt >= 0 ? t.accent : A.ink }}>
              {fmtSigned(tx.amt, tx.ccy, t.decimals)}
            </div>
          </div>
        ))}
      </div>
    </WebShell>
  );
}
