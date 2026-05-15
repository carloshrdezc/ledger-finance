import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { fmtMoney } from '../../data';
import { useStore } from '../../store';
import RecurringFormSheet from '../../components/RecurringFormSheet';

export default function More({ t, onNavigate }) {
  const { goals, billRows, bills } = useStore();
  const activeRules = bills.filter(b => b.active !== false).length;
  const billTotal = billRows.filter(b => b.type !== 'income').reduce((s, b) => s + b.amt, 0);
  const [showAddRecurring, setShowAddRecurring] = React.useState(false);
  const sections = [
    {
      title: 'REPORTS',
      rows: [
        { label: 'SPENDING BREAKDOWN', sub: 'CATEGORIES & TRENDS', screen: 'reports' },
        { label: 'CALENDAR VIEW', sub: '30-DAY HEATMAP', screen: 'reports-cal' },
      ],
    },
    {
      title: 'GOALS',
      rows: goals.map(g => ({
        label: g.name,
        sub: Math.round(g.current / g.target * 100) + '% COMPLETE',
        screen: 'goal',
        params: { goalId: g.id },
      })),
    },
    {
      title: 'CREDIT CARDS',
      rows: [
        { label: 'AMEX PLATINUM · ··1009', sub: 'UTILIZATION · PAYOFF', screen: 'cc' },
      ],
    },
    {
      title: 'RECURRING',
      rows: [
        { label: 'BILLS & SUBSCRIPTIONS', sub: activeRules + ' RULES · ' + fmtMoney(billTotal, t.currency, false) + '/MO', screen: 'bills' },
      ],
    },
    {
      title: 'SETTINGS',
      rows: [
        { label: 'CATEGORIES', sub: 'NESTED TREE EDITOR', screen: 'categories' },
        { label: 'PREFERENCES', sub: 'THEME · EXPORT · SECURITY', screen: 'settings' },
      ],
    },
  ];

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>MORE</div>
      </div>
      <ARule thick />
      {sections.map(sec => (
        <div key={sec.title} style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <ALabel>{sec.title}</ALabel>
            {sec.title === 'RECURRING' && (
              <button onClick={() => setShowAddRecurring(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>+ ADD</button>
            )}
          </div>
          <div style={{ marginTop: 6 }}>
            {sec.rows.map((row, i) => (
              <button key={i}
                onClick={() => onNavigate(row.screen, row.params || {})}
                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: t.density === 'compact' ? '9px 0' : '11px 0',
                  borderBottom: '1px solid ' + A.rule2,
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{row.label}</div>
                    <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 0.6 }}>{row.sub}</div>
                  </div>
                  <span style={{ fontSize: 11, color: A.muted }}>▸</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {showAddRecurring && (
        <RecurringFormSheet
          t={t}
          onClose={() => setShowAddRecurring(false)}
        />
      )}
    </div>
  );
}
