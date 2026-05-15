import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { useStore } from '../../store';
import { BILLS, CATEGORIES, fmtMoney } from '../../data';

export default function WebBills({ t, onNavigate, onAdd }) {
  const { accountsWithBalance } = useStore();
  const sorted = [...BILLS].sort((a, b) => a.day - b.day);
  const totalMonthly = BILLS.reduce((s, b) => s + b.amt, 0);

  const today = new Date().getDate();
  const upcoming = sorted.filter(b => b.day >= today).slice(0, 3);

  const byCategory = BILLS.reduce((acc, b) => {
    const cat = b.cat || 'other';
    if (!acc[cat]) acc[cat] = { bills: [], total: 0 };
    acc[cat].bills.push(b);
    acc[cat].total += b.amt;
    return acc;
  }, {});

  return (
    <WebShell active="bills" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] BILLS & SUBSCRIPTIONS</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(totalMonthly, 'USD', t.decimals)}
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
            {BILLS.length} ACTIVE · PER MONTH
          </div>
        </div>

        {upcoming.length > 0 && (
          <div style={{ border: '1px solid ' + A.ink, padding: '12px 16px', minWidth: 200 }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 8 }}>UPCOMING · 7 DAYS</div>
            {upcoming.map((b, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: i < upcoming.length - 1 ? '1px solid ' + A.rule2 : 'none' }}>
                <span><span style={{ color: A.muted, marginRight: 8 }}>{String(b.day).padStart(2, '0')}</span>{b.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', marginLeft: 16 }}>{fmtMoney(b.amt, 'USD', t.decimals)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ borderTop: '2px solid ' + A.ink }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 100px 90px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
              <div>DAY</div><div>NAME</div><div>ACCT</div><div>CATEGORY</div><div style={{ textAlign: 'right' }}>AMOUNT</div>
            </div>
            {sorted.map((b, i) => {
              const acct = accountsWithBalance.find(a => a.id === b.acct);
              const cat  = CATEGORIES[b.cat];
              const isDue = b.day === today;
              const isPast = b.day < today;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 60px 100px 90px',
                  padding: t.density === 'compact' ? '8px 0' : '11px 0',
                  borderBottom: '1px solid ' + A.rule2, alignItems: 'center',
                  opacity: isPast ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: isDue ? t.accent : A.muted }}>
                    {String(b.day).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 12 }}>{b.name}</div>
                  <div style={{ fontSize: 9, color: A.muted }}>{acct?.code || b.acct}</div>
                  <div style={{ fontSize: 10, color: A.ink2 }}>{cat?.glyph} {cat?.label || b.cat}</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {fmtMoney(b.amt, 'USD', t.decimals)}
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
                      <div style={{ fontSize: 9, color: A.muted, marginTop: 2 }}>{data.bills.length} ITEM{data.bills.length !== 1 ? 'S' : ''}</div>
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
              {fmtMoney(totalMonthly, 'USD', t.decimals)}/mo × 12 months
            </div>
          </div>
        </div>
      </div>
    </WebShell>
  );
}
