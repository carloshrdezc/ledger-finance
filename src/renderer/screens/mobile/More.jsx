import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { GOALS, BILLS, fmtMoney } from '../../data';

export default function More({ t, onNavigate }) {
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
      rows: GOALS.map(g => ({
        label: g.name,
        sub: Math.round(g.current / g.target * 100) + '% COMPLETE',
        screen: 'goal-detail',
        params: { goalId: g.id },
      })),
    },
    {
      title: 'CREDIT CARDS',
      rows: [
        { label: 'AMEX PLATINUM · ··1009', sub: 'UTILIZATION · PAYOFF', screen: 'cc-detail' },
      ],
    },
    {
      title: 'RECURRING',
      rows: [
        { label: 'BILLS & SUBSCRIPTIONS', sub: BILLS.length + ' ACTIVE · ' + fmtMoney(BILLS.reduce((s, b) => s + b.amt, 0), 'USD', false) + '/MO', screen: 'bills' },
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
          <ALabel>{sec.title}</ALabel>
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
    </div>
  );
}
