import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import WebShell from './WebShell';
import { CATEGORIES, fmtMoney } from '../../data';
import { useStore } from '../../store';

export default function WebBudgets({ t, onNavigate, onAdd }) {
  const { budgetRows, setBudgets, periodLabel } = useStore();
  const [editing, setEditing] = React.useState(null);
  const [editVal, setEditVal] = React.useState('');

  const totalBudget = budgetRows.reduce((s, b) => s + b.limit, 0);
  const totalSpent = budgetRows.reduce((s, b) => s + b.spent, 0);
  const totalAvailable = budgetRows.reduce((s, b) => s + b.available, 0);

  const saveEdit = (cat) => {
    const val = parseFloat(editVal);
    if (!isNaN(val) && val > 0) {
      setBudgets(prev => prev.map(b => b.cat === cat ? { ...b, limit: val } : b));
    }
    setEditing(null);
  };

  return (
    <WebShell active="budgets" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <div>
          <ALabel>[01] BUDGETS · {periodLabel}</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(totalSpent, 'USD', t.decimals)}
            <span style={{ color: A.muted, fontSize: 24 }}> · {fmtMoney(totalAvailable, 'USD', false)}</span>
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
            TOTAL SPENT · AVAILABLE · BASE {fmtMoney(totalBudget, 'USD', false)}
          </div>
        </div>
        <PeriodSwitcher />
      </div>

      <div style={{ marginTop: 24, borderTop: '2px solid ' + A.ink }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 120px 80px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
          <div>CATEGORY</div>
          <div>PROGRESS</div>
          <div style={{ textAlign: 'right' }}>SPENT</div>
          <div style={{ textAlign: 'right' }}>AVAILABLE</div>
          <div style={{ textAlign: 'right' }}>LEFT</div>
        </div>

        {budgetRows.map(b => {
          const pct = Math.min(b.spent / Math.max(b.available, 1), 1.2);
          const over = b.left < 0;
          const cat = CATEGORIES[b.cat];

          return (
            <div key={b.cat} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 120px 80px', padding: t.density === 'compact' ? '10px 0' : '14px 0', borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>{cat?.glyph}</span>
                <span style={{ fontSize: 11, fontWeight: 500 }}>{cat?.label || b.cat.toUpperCase()}</span>
                {b.rollover !== 0 && (
                  <span style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>
                    R {b.rollover > 0 ? '+' : '-'}{fmtMoney(Math.abs(b.rollover), 'USD', false)}
                  </span>
                )}
              </div>
              <div style={{ paddingRight: 16 }}>
                <div style={{ height: 6, background: A.rule2, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: (Math.min(pct, 1) * 100) + '%', background: over ? A.neg : t.accent }} />
                </div>
                <div style={{ fontSize: 8, color: A.muted, marginTop: 3, letterSpacing: 1 }}>{Math.round(pct * 100)}%</div>
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: over ? A.neg : A.ink }}>
                {fmtMoney(b.spent, 'USD', t.decimals)}
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                {editing === b.cat ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={() => saveEdit(b.cat)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(b.cat); if (e.key === 'Escape') setEditing(null); }}
                    style={{ fontFamily: A.font, fontSize: 12, width: 80, textAlign: 'right', border: 'none', borderBottom: '1px solid ' + A.ink, background: 'transparent', outline: 'none', color: A.ink }}
                  />
                ) : (
                  <span onClick={() => { setEditing(b.cat); setEditVal(String(b.limit)); }} style={{ cursor: 'pointer', borderBottom: '1px dotted ' + A.rule2 }}>
                    {fmtMoney(b.available, 'USD', t.decimals)}
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: b.left < 0 ? A.neg : t.accent }}>
                {b.left < 0 ? '-' : '+'}{fmtMoney(Math.abs(b.left), 'USD', t.decimals)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 9, color: A.muted, letterSpacing: 1 }}>
        CLICK AVAILABLE AMOUNT TO EDIT BASE LIMIT
      </div>
    </WebShell>
  );
}
