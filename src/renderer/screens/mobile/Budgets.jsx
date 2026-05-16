import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import { CATEGORIES, fmtMoney } from '../../data';
import { useStore } from '../../store';
import { getDaysInPeriod } from '../../period.mjs';

export default function Budgets({ t }) {
  const { budgetRows, periodLabel, selectedPeriod } = useStore();
  const totalSpent = budgetRows.reduce((s, b) => s + b.spent, 0);
  const totalLimit = budgetRows.reduce((s, b) => s + b.limit, 0);
  const totalAvailable = budgetRows.reduce((s, b) => s + b.available, 0);
  const dayCount = getDaysInPeriod(selectedPeriod);

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>BUDGETS</div>
      </div>
      <ARule thick />
      <div style={{ padding: '12px 0 2px' }}>
        <PeriodSwitcher compact />
      </div>
      <div style={{ padding: '12px 0 8px' }}>
        <ALabel>{periodLabel} · {Math.round(totalSpent)} / {Math.round(totalAvailable)}</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>
          {fmtMoney(totalSpent, t.currency, t.decimals)}
        </div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 2 }}>
          of {fmtMoney(totalLimit, t.currency, false)} base · {fmtMoney(totalAvailable, t.currency, false)} available · {dayCount} days
        </div>
      </div>
      <ARule />
      {budgetRows.map(b => {
        const pct = Math.min(b.spent / Math.max(b.available, 1), 1.2);
        const over = b.left < 0;
        return (
          <div key={b.cat} style={{ padding: '12px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, letterSpacing: 1, fontWeight: 500 }}>
                {CATEGORIES[b.cat].glyph} {CATEGORIES[b.cat].label}
              </div>
              <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: over ? A.neg : A.ink }}>
                {fmtMoney(b.spent, t.currency, t.decimals)} / {fmtMoney(b.available, t.currency, false)}
              </div>
            </div>
            <div style={{ marginTop: 8, position: 'relative', height: 8, background: A.rule2 }}>
              <div style={{
                position: 'absolute', inset: 0,
                width: (Math.min(pct, 1) * 100) + '%',
                background: over ? A.neg : t.accent,
              }} />
            </div>
            {over && (
              <div style={{ fontSize: 9, color: A.neg, marginTop: 3, letterSpacing: 1 }}>
                OVER BY {fmtMoney(Math.abs(b.left), t.currency, false)}
              </div>
            )}
            {b.rollover !== 0 && (
              <div style={{ fontSize: 9, color: A.muted, marginTop: 3, letterSpacing: 1 }}>
                ROLLOVER {b.rollover > 0 ? '+' : '-'}{fmtMoney(Math.abs(b.rollover), t.currency, false)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
