import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { BUDGETS, CATEGORIES, fmtMoney } from '../../data';

export default function Budgets({ t }) {
  const totalSpent = BUDGETS.reduce((s, b) => s + b.spent, 0);
  const totalLimit = BUDGETS.reduce((s, b) => s + b.limit, 0);

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>BUDGETS</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0 8px' }}>
        <ALabel>MAY · {Math.round(totalSpent)} / {totalLimit}</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>
          {fmtMoney(totalSpent, 'USD', t.decimals)}
        </div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 2 }}>
          of {fmtMoney(totalLimit, 'USD', false)} · day 11 / 31
        </div>
      </div>
      <ARule />
      {BUDGETS.map(b => {
        const pct = Math.min(b.spent / b.limit, 1.2);
        const over = b.spent > b.limit;
        return (
          <div key={b.cat} style={{ padding: '12px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, letterSpacing: 1, fontWeight: 500 }}>
                {CATEGORIES[b.cat].glyph} {CATEGORIES[b.cat].label}
              </div>
              <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: over ? A.neg : A.ink }}>
                {fmtMoney(b.spent, 'USD', t.decimals)} / {fmtMoney(b.limit, 'USD', false)}
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
                OVER BY {fmtMoney(b.spent - b.limit, 'USD', false)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
