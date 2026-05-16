import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { fmtMoney, dayLabel } from '../../data';
import { useStore } from '../../store';
import { getDaysInPeriod } from '../../period.mjs';

export default function WebGoals({ t, onNavigate, onAdd }) {
  const { goals, goalContributions, contributeToGoal, accountsWithBalance, selectedPeriod } = useStore();
  const [contributing, setContributing] = React.useState(null);
  const [contribAmt, setContribAmt] = React.useState('');
  const [acct, setAcct] = React.useState(accountsWithBalance.find(a => a.type === 'SAV')?.id || accountsWithBalance[0]?.id || 'chk');
  const defaultDay = Math.min(new Date().getDate(), getDaysInPeriod(selectedPeriod));
  const defaultDate = `${selectedPeriod}-${String(defaultDay).padStart(2, '0')}`;

  const contribute = (id) => {
    const val = parseFloat(contribAmt);
    if (!isNaN(val) && val > 0) {
      contributeToGoal(id, { amount: val, date: defaultDate, acct });
    }
    setContributing(null);
    setContribAmt('');
  };

  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.current, 0);

  return (
    <WebShell active="goals" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div>
        <ALabel>[01] GOALS · {goals.length} ACTIVE</ALabel>
        <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
          {fmtMoney(totalCurrent, t.currency, t.decimals)}
          <span style={{ color: A.muted, fontSize: 24 }}> · {fmtMoney(totalTarget, t.currency, false)}</span>
        </div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>SAVED · TARGET · {goalContributions.length} CONTRIBUTIONS</div>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {goals.map(g => {
          const pct = Math.min(g.current / g.target, 1);
          const done = g.current >= g.target;
          const history = goalContributions
            .filter(c => c.goalId === g.id)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 3);
          return (
            <div key={g.id} style={{ border: '1px solid ' + (done ? t.accent : A.rule2), padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8 }}>{g.name}</div>
                {done && <div style={{ fontSize: 9, color: t.accent, letterSpacing: 1.4 }}>COMPLETE</div>}
              </div>

              <div style={{ marginTop: 12, fontSize: 28, fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>
                {fmtMoney(g.current, t.currency, t.decimals)}
              </div>
              <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 0.8 }}>
                of {fmtMoney(g.target, t.currency, t.decimals)} target
              </div>

              <div style={{ marginTop: 12, height: 6, background: A.rule2 }}>
                <div style={{ height: '100%', width: (pct * 100) + '%', background: done ? t.accent : A.ink, transition: 'width .3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: A.muted, letterSpacing: 1 }}>
                <span>{Math.round(pct * 100)}% COMPLETE</span>
                <span>{fmtMoney(g.target - g.current, t.currency, false)} TO GO</span>
              </div>

              {!done && (
                <div style={{ marginTop: 14 }}>
                  {contributing === g.id ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 128px auto auto', gap: 6 }}>
                      <input
                        autoFocus
                        value={contribAmt}
                        onChange={e => setContribAmt(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') contribute(g.id); if (e.key === 'Escape') setContributing(null); }}
                        placeholder="AMOUNT"
                        style={{ fontFamily: A.font, fontSize: 11, padding: '5px 8px', border: '1px solid ' + A.ink, background: A.bg, color: A.ink, outline: 'none', minWidth: 0 }}
                      />
                      <select value={acct} onChange={e => setAcct(e.target.value)} style={{ fontFamily: A.font, fontSize: 10, border: '1px solid ' + A.rule2, background: A.bg, color: A.ink }}>
                        {accountsWithBalance.filter(a => !['INV','CRY'].includes(a.type)).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <button onClick={() => contribute(g.id)} style={{ all: 'unset', cursor: 'pointer', padding: '5px 10px', background: A.ink, color: A.bg, fontSize: 10, letterSpacing: 1 }}>ADD</button>
                      <button onClick={() => setContributing(null)} style={{ all: 'unset', cursor: 'pointer', padding: '5px 8px', border: '1px solid ' + A.rule2, fontSize: 10, color: A.muted }}>x</button>
                    </div>
                  ) : (
                    <button onClick={() => { setContributing(g.id); setContribAmt(''); }} style={{
                      all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.4,
                      padding: '5px 10px', border: '1px solid ' + A.rule2, color: A.ink,
                    }}>+ ADD FUNDS</button>
                  )}
                </div>
              )}

              {history.length > 0 && (
                <div style={{ marginTop: 14, borderTop: '1px solid ' + A.rule2 }}>
                  {history.map(c => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', padding: '7px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 10, alignItems: 'baseline' }}>
                      <span style={{ color: A.muted }}>{dayLabel(c.date)}</span>
                      <span style={{ color: A.muted }}>TX · {c.txId.slice(0, 16)}</span>
                      <span style={{ textAlign: 'right', color: t.accent, fontVariantNumeric: 'tabular-nums' }}>+{fmtMoney(c.amount, t.currency, t.decimals)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </WebShell>
  );
}
