import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { useStore } from '../../store';
import { CATEGORIES, fmtMoney } from '../../data';

const STATUS_LABELS = {
  paid: 'PAID',
  due: 'DUE TODAY',
  overdue: 'OVERDUE',
  upcoming: 'UPCOMING',
};

function statusColor(status, accent) {
  if (status === 'paid') return accent;
  if (status === 'due' || status === 'overdue') return A.neg;
  return A.muted;
}

export default function WebBills({ t, onNavigate, onAdd }) {
  const { accountsWithBalance, billRows, markBillPaid, periodLabel } = useStore();
  const totalMonthly = billRows.reduce((s, b) => s + b.amt, 0);
  const paidTotal = billRows.filter(b => b.status === 'paid').reduce((s, b) => s + b.amt, 0);
  const openRows = billRows.filter(b => b.status !== 'paid');
  const upcoming = openRows.filter(b => ['due', 'overdue', 'upcoming'].includes(b.status)).slice(0, 3);

  const byCategory = billRows.reduce((acc, b) => {
    const cat = b.cat || 'other';
    if (!acc[cat]) acc[cat] = { bills: [], total: 0, paid: 0 };
    acc[cat].bills.push(b);
    acc[cat].total += b.amt;
    if (b.status === 'paid') acc[cat].paid += b.amt;
    return acc;
  }, {});

  return (
    <WebShell active="bills" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] BILLS & SUBSCRIPTIONS · {periodLabel}</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(paidTotal, 'USD', t.decimals)}
            <span style={{ color: A.muted, fontSize: 24 }}> · {fmtMoney(totalMonthly, 'USD', false)}</span>
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
            PAID · TOTAL · {openRows.length} OPEN
          </div>
        </div>

        {upcoming.length > 0 && (
          <div style={{ border: '1px solid ' + A.ink, padding: '12px 16px', minWidth: 240 }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 8 }}>NEXT ACTIONS</div>
            {upcoming.map((b, i) => (
              <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: i < upcoming.length - 1 ? '1px solid ' + A.rule2 : 'none', gap: 14 }}>
                <span><span style={{ color: statusColor(b.status, t.accent), marginRight: 8 }}>{STATUS_LABELS[b.status]}</span>{b.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(b.amt, 'USD', t.decimals)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ borderTop: '2px solid ' + A.ink }}>
            <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr 70px 100px 90px 86px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
              <div>STATUS</div><div>NAME</div><div>ACCT</div><div>CATEGORY</div><div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>ACTION</div>
            </div>
            {billRows.map(b => {
              const acct = accountsWithBalance.find(a => a.id === b.acct);
              const cat = CATEGORIES[b.cat];
              return (
                <div key={b.key} style={{
                  display: 'grid', gridTemplateColumns: '86px 1fr 70px 100px 90px 86px',
                  padding: t.density === 'compact' ? '8px 0' : '11px 0',
                  borderBottom: '1px solid ' + A.rule2, alignItems: 'center',
                  opacity: b.status === 'paid' ? 0.58 : 1,
                }}>
                  <div style={{ fontSize: 9, letterSpacing: 1, color: statusColor(b.status, t.accent) }}>
                    {STATUS_LABELS[b.status]}<br /><span style={{ color: A.muted }}>{b.dueDate.slice(5)}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>{b.name}</div>
                  <div style={{ fontSize: 9, color: A.muted }}>{acct?.code || b.acct}</div>
                  <div style={{ fontSize: 10, color: A.ink2 }}>{cat?.glyph} {cat?.label || b.cat}</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {fmtMoney(b.amt, 'USD', t.decimals)}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {b.status === 'paid' ? (
                      <span style={{ fontSize: 9, color: t.accent, letterSpacing: 1 }}>TX LINKED</span>
                    ) : (
                      <button onClick={() => markBillPaid(b)} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1, padding: '4px 7px', background: A.ink, color: A.bg }}>
                        PAY
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 10 }}>BY CATEGORY</div>
            {Object.entries(byCategory).map(([cat, data]) => {
              const catInfo = CATEGORIES[cat];
              return (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid ' + A.rule2 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>{catInfo?.glyph || '·'}</span>
                    <div>
                      <div style={{ fontSize: 11 }}>{catInfo?.label || cat.toUpperCase()}</div>
                      <div style={{ fontSize: 9, color: A.muted, marginTop: 2 }}>{fmtMoney(data.paid, 'USD', false)} PAID · {data.bills.length} ITEMS</div>
                    </div>
                  </div>
                  <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {fmtMoney(data.total, 'USD', t.decimals)}<span style={{ fontSize: 9, color: A.muted }}>/MO</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 20, padding: 16, border: '1px solid ' + A.rule2 }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 12 }}>ANNUAL PROJECTION</div>
            <div style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
              {fmtMoney(totalMonthly * 12, 'USD', false)}
            </div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 4, letterSpacing: 0.8 }}>
              {fmtMoney(totalMonthly, 'USD', t.decimals)}/mo x 12 months
            </div>
          </div>
        </div>
      </div>
    </WebShell>
  );
}
