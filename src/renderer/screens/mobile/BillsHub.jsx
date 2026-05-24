import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import { fmtMoney } from '../../data';
import { useStore } from '../../store';
import RecurringFormSheet from '../../components/RecurringFormSheet';

const FREQ_SHORT = { monthly: 'MONTHLY', weekly: 'WEEKLY', biweekly: 'BI-WEEKLY', annual: 'ANNUAL', custom: 'CUSTOM' };

export default function BillsHub({ t, onBack }) {
  const { accountsWithBalance: accts, billRows, markRecurringPaid, bills } = useStore();
  const [showForm, setShowForm] = React.useState(false);
  const [editRule, setEditRule] = React.useState(null);

  const expenseRows = billRows.filter(b => b.type !== 'income');
  const monthly = expenseRows.reduce((s, b) => s + b.amt, 0);
  const paid    = expenseRows.filter(b => b.status === 'paid').reduce((s, b) => s + b.amt, 0);

  const timeline = Array.from({ length: 30 }, (_, i) =>
    billRows.filter(b => Number(b.dueDate.slice(8, 10)) === i + 1)
  );

  const openEditForm = ruleId => {
    const rule = bills.find(b => b.id === ruleId);
    setEditRule(rule || null);
    setShowForm(true);
  };

  return (
    <>
      {showForm && (
        <RecurringFormSheet
          t={t}
          onClose={() => { setShowForm(false); setEditRule(null); }}
          editRule={editRule}
        />
      )}

      <div style={{ padding: '0 18px 20px' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
          <button onClick={() => { setEditRule(null); setShowForm(true); }} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>+ ADD</button>
        </div>
        <ARule thick />

        <div style={{ padding: '14px 0 8px' }}>
          <ALabel>[01] MONTHLY · EXPENSES</ALabel>
          <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>{fmtMoney(paid, t.currency, t.decimals)}</div>
          <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>{fmtMoney(monthly, t.currency, false)} TOTAL · {expenseRows.length} THIS PERIOD</div>
        </div>

        <ARule />

        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[02] NEXT · 30 · DAYS</ALabel>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: 2 }}>
            {timeline.map((day, i) => {
              const total = day.reduce((s, b) => s + b.amt, 0);
              const has = day.length > 0;
              return (
                <div key={i} style={{
                  height: 36, background: has ? t.accent : A.rule2,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                  paddingBottom: 2, opacity: has ? Math.min(1, 0.4 + (total / 2500)) : 1,
                }}>
                  {has && <div style={{ fontSize: 8, color: A.bg, fontWeight: 700 }}>{day.length}</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6, letterSpacing: 1 }}>
            <span>1</span><span>10</span><span>20</span><span>30</span>
          </div>
        </div>

        <ARule style={{ marginTop: 14 }} />

        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[03] RECURRING · {billRows.length} THIS PERIOD</ALabel>
          {billRows.map(b => {
            const isIncome = b.type === 'income';
            const amtColor = isIncome ? t.accent : (b.status === 'paid' ? A.muted : A.neg);
            return (
              <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid ' + A.rule2, opacity: b.status === 'paid' ? 0.58 : 1 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', width: 30, color: b.status === 'paid' ? t.accent : b.status === 'upcoming' ? A.ink : A.neg, letterSpacing: -0.5, flexShrink: 0 }}>
                    {b.dueDate.slice(8)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                    <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 2 }}>
                      {accts.find(a => a.id === b.acct)?.code} · {FREQ_SHORT[b.freq] || 'MONTHLY'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: amtColor }}>
                      {isIncome ? '↑' : ''}{fmtMoney(b.amt, t.currency, t.decimals)}
                    </div>
                  </div>
                  {b.status === 'paid'
                    ? <div style={{ fontSize: 10, color: t.accent, letterSpacing: 1, minWidth: 36, textAlign: 'right' }}>PAID</div>
                    : (
                      <button onClick={() => markRecurringPaid(b, b.dueDate)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1, padding: '5px 8px', background: A.ink, color: A.bg }}>
                        PAY
                      </button>
                    )
                  }
                  <button onClick={() => openEditForm(b.id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: A.muted }}>✎</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
