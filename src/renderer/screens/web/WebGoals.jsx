import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { GOALS, fmtMoney } from '../../data';

export default function WebGoals({ t, onNavigate, onAdd }) {
  const [goals, setGoals] = React.useState(GOALS);
  const [contributing, setContributing] = React.useState(null);
  const [contribAmt, setContribAmt] = React.useState('');

  const contribute = (id) => {
    const val = parseFloat(contribAmt);
    if (!isNaN(val) && val > 0) {
      setGoals(prev => prev.map(g => g.id === id
        ? { ...g, current: Math.min(g.current + val, g.target) }
        : g
      ));
    }
    setContributing(null);
    setContribAmt('');
  };

  const totalTarget  = goals.reduce((s, g) => s + g.target, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.current, 0);

  return (
    <WebShell active="goals" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div>
        <ALabel>[01] GOALS · {goals.length} ACTIVE</ALabel>
        <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
          {fmtMoney(totalCurrent, 'USD', t.decimals)}
          <span style={{ color: A.muted, fontSize: 24 }}> · {fmtMoney(totalTarget, 'USD', false)}</span>
        </div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>SAVED · TARGET</div>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {goals.map(g => {
          const pct = Math.min(g.current / g.target, 1);
          const done = g.current >= g.target;
          return (
            <div key={g.id} style={{ border: '1px solid ' + (done ? t.accent : A.rule2), padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8 }}>{g.name}</div>
                {done && <div style={{ fontSize: 9, color: t.accent, letterSpacing: 1.4 }}>✓ COMPLETE</div>}
              </div>

              <div style={{ marginTop: 12, fontSize: 28, fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>
                {fmtMoney(g.current, 'USD', t.decimals)}
              </div>
              <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 0.8 }}>
                of {fmtMoney(g.target, 'USD', t.decimals)} target
              </div>

              <div style={{ marginTop: 12, height: 6, background: A.rule2 }}>
                <div style={{ height: '100%', width: (pct * 100) + '%', background: done ? t.accent : A.ink, transition: 'width .3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: A.muted, letterSpacing: 1 }}>
                <span>{Math.round(pct * 100)}% COMPLETE</span>
                <span>{fmtMoney(g.target - g.current, 'USD', false)} TO GO</span>
              </div>

              {!done && (
                <div style={{ marginTop: 14 }}>
                  {contributing === g.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        autoFocus
                        value={contribAmt}
                        onChange={e => setContribAmt(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') contribute(g.id); if (e.key === 'Escape') setContributing(null); }}
                        placeholder="AMOUNT"
                        style={{ fontFamily: A.font, fontSize: 11, flex: 1, padding: '5px 8px', border: '1px solid ' + A.ink, background: A.bg, color: A.ink, outline: 'none' }}
                      />
                      <button onClick={() => contribute(g.id)} style={{ all: 'unset', cursor: 'pointer', padding: '5px 10px', background: A.ink, color: A.bg, fontSize: 10, letterSpacing: 1 }}>ADD</button>
                      <button onClick={() => setContributing(null)} style={{ all: 'unset', cursor: 'pointer', padding: '5px 8px', border: '1px solid ' + A.rule2, fontSize: 10, color: A.muted }}>×</button>
                    </div>
                  ) : (
                    <button onClick={() => { setContributing(g.id); setContribAmt(''); }} style={{
                      all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.4,
                      padding: '5px 10px', border: '1px solid ' + A.rule2, color: A.ink,
                    }}>+ ADD FUNDS</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </WebShell>
  );
}
