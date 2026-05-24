import React from 'react';
import { A } from '../../theme';
import { ADetailCell, ALabel, ARule, AsciiSpark } from '../../components/Shared';
import { dayLabel, fmtMoney } from '../../data';
import { useStore } from '../../store';
import GoalFormSheet from '../../components/GoalFormSheet';
import { getDaysInPeriod } from '../../period.mjs';

export default function GoalDetail({ t, goalId = 'g1', goal, onBack }) {
  const { goals, goalContributions, contributeToGoal, accountsWithBalance, selectedPeriod } = useStore();
  const actualGoalId = goal || goalId;
  const g = goals.find(x => x.id === actualGoalId) || goals[0];
  const [contribAmt, setContribAmt] = React.useState('');
  const [acct, setAcct] = React.useState(accountsWithBalance.find(a => a.type === 'SAV')?.id || accountsWithBalance[0]?.id || 'chk');
  const [showEdit, setShowEdit] = React.useState(false);
  if (!g) {
    return (
      <div style={{ padding: '0 18px 20px' }}>
        <div style={{ padding: '10px 0 6px' }}>
          <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        </div>
        <div style={{ padding: 24, fontSize: 12, color: A.muted, letterSpacing: 0.6, textAlign: 'center' }}>
          NO GOAL SELECTED
        </div>
      </div>
    );
  }
  const defaultDay = Math.min(new Date().getDate(), getDaysInPeriod(selectedPeriod));
  const defaultDate = `${selectedPeriod}-${String(defaultDay).padStart(2, '0')}`;
  const pct = g.current / g.target;
  const remaining = g.target - g.current;

  const contributions = goalContributions
    .filter(c => c.goalId === g.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Compute average monthly contribution from history. If we have at least
  // one contribution, divide total by months elapsed (min 1). Otherwise
  // fall back to a reasonable default proportional to target.
  const monthly = (() => {
    if (contributions.length > 0) {
      const dates = contributions.map(c => new Date(c.date)).sort((a, b) => a - b);
      const first = dates[0];
      const now = new Date();
      const monthsSpan = Math.max(1,
        (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1
      );
      const total = contributions.reduce((s, c) => s + (c.amount || 0), 0);
      return Math.max(50, Math.round(total / monthsSpan));
    }
    return Math.max(50, Math.round(g.target * 0.05));
  })();

  const monthsLeft = monthly > 0 ? Math.ceil(remaining / monthly) : null;
  const projection = Array.from({ length: 12 }, (_, i) => Math.min(g.current + monthly * i, g.target));

  // Opened date: earliest contribution; otherwise goal.createdAt; otherwise unknown.
  const openedLabel = (() => {
    if (contributions.length > 0) {
      const earliest = contributions[contributions.length - 1].date;
      const d = new Date(earliest);
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
    }
    if (g.createdAt) {
      const d = new Date(g.createdAt);
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
    }
    return '—';
  })();

  // On-track: if goal has a targetDate, compare projected completion to it.
  // Otherwise call it "on track" when avg monthly clears at least 5% of target.
  const onTrack = (() => {
    if (g.targetDate && monthsLeft != null) {
      const target = new Date(g.targetDate);
      const now = new Date();
      const monthsToTarget = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
      return monthsLeft <= monthsToTarget;
    }
    return monthly >= g.target * 0.05 && pct < 1;
  })();
  const completed = pct >= 1;

  const contribute = () => {
    const amount = parseFloat(contribAmt);
    if (!isNaN(amount) && amount > 0) {
      contributeToGoal(g.id, { amount, date: defaultDate, acct });
      setContribAmt('');
    }
  };

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          <button onClick={() => setShowEdit(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>EDIT</button>
          <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>GOAL · {g.id.toUpperCase()}</div>
        </div>
      </div>
      <ARule thick />
      <div style={{ padding: '16px 0 8px' }}>
        <ALabel>{g.name}</ALabel>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>{fmtMoney(g.current, t.currency, t.decimals)}</div>
          <div style={{ fontSize: 14, color: A.muted, fontVariantNumeric: 'tabular-nums' }}>/ {fmtMoney(g.target, t.currency, false)}</div>
        </div>
        <div style={{ fontSize: 11, color: t.accent, marginTop: 4 }}>
          {Math.round(pct * 100)}% COMPLETE · {fmtMoney(remaining, t.currency, false)} REMAINING
        </div>
      </div>
      <div style={{ position: 'relative', height: 28, background: A.rule2, border: '1px solid ' + A.rule2, marginTop: 8 }}>
        <div style={{ position: 'absolute', inset: 0, width: (pct * 100) + '%', background: t.accent }} />
        {[0.25, 0.5, 0.75].map(m => (
          <div key={m} style={{ position: 'absolute', top: 0, bottom: 0, left: (m * 100) + '%', width: 1, background: A.bg, opacity: 0.6 }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
        <span>0%</span><span>25</span><span>50</span><span>75</span><span>100%</span>
      </div>
      <ARule style={{ marginTop: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, marginTop: 12, border: '1px solid ' + A.rule2, background: A.rule2 }}>
        <ADetailCell label="MONTHLY" val={fmtMoney(monthly, t.currency, false)} />
        <ADetailCell label="ETA" val={completed ? 'DONE' : (monthsLeft != null ? monthsLeft + ' MO' : '—')} c={completed ? t.accent : (onTrack ? t.accent : A.neg)} />
        <ADetailCell label="OPENED" val={openedLabel} />
        <ADetailCell label="ON TRACK" val={completed ? 'DONE' : (onTrack ? 'YES' : 'NO')} c={completed || onTrack ? t.accent : A.neg} />
      </div>
      <ARule style={{ marginTop: 16 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>PROJECTION · 12 MO</ALabel>
        <div style={{ marginTop: 12, position: 'relative', height: 100 }}>
          <AsciiSpark data={projection} width={354} height={100} stroke={t.accent} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 1, background: A.ink, opacity: 0.5 }} />
          <div style={{ position: 'absolute', right: 0, top: -10, fontSize: 9, color: A.muted, letterSpacing: 1 }}>
            TARGET · {fmtMoney(g.target, t.currency, false)}
          </div>
        </div>
      </div>
      <ARule style={{ marginTop: 8 }} />
      <div style={{ padding: '14px 0 4px' }}><ALabel>CONTRIBUTIONS · RECENT</ALabel></div>
      {contributions.slice(0, 5).map(c => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <span style={{ color: A.muted, width: 58, letterSpacing: 1 }}>{dayLabel(c.date)}</span>
            <span style={{ fontSize: 9, color: A.muted, letterSpacing: 1, alignSelf: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>TX · {c.txId}</span>
          </div>
          <div style={{ fontVariantNumeric: 'tabular-nums', color: t.accent }}>+{fmtMoney(c.amount, t.currency, t.decimals)}</div>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, marginTop: 16 }}>
        <input
          value={contribAmt}
          onChange={e => setContribAmt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && contribute()}
          placeholder="AMOUNT"
          style={{ fontFamily: A.font, fontSize: 12, padding: '10px', border: '1px solid ' + A.ink, background: A.bg, color: A.ink, outline: 'none' }}
        />
        <select value={acct} onChange={e => setAcct(e.target.value)} style={{ fontFamily: A.font, fontSize: 10, border: '1px solid ' + A.rule2, background: A.bg, color: A.ink }}>
          {accountsWithBalance.filter(a => !['INV','CRY'].includes(a.type)).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <button onClick={contribute} style={{ all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', padding: '14px', background: A.ink, color: A.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700, marginTop: 8 }}>
        + CONTRIBUTE
      </button>
      {showEdit && (
        <GoalFormSheet
          t={t}
          editGoal={g}
          onClose={() => setShowEdit(false)}
          onAfterDelete={() => { setShowEdit(false); onBack(); }}
        />
      )}
    </div>
  );
}
