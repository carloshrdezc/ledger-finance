import React from 'react';
import { A } from '../theme';
import { fmtMoney } from '../data';
import { useStore } from '../store';
import { summarizeDue } from '../autoFunding.mjs';

const FREQ_OPTIONS = [
  { key: 'monthly', label: 'MONTHLY' },
  { key: 'weekly', label: 'WEEKLY' },
  { key: 'biweekly', label: 'BI-WK' },
];

/**
 * CAR-347: per-goal auto-funding control. Shows the goal's auto-funding rule
 * (amount + cadence + how much is currently DUE) with a RUN DUE action that
 * applies the owed contributions, or an inline form to create a rule. Ledger
 * has no backend scheduler, so funding is always an explicit user action —
 * the same model as paying a bill.
 */
export default function AutoFundPanel({ t, goal, rule, accounts }) {
  const { addAutoFundRule, updateAutoFundRule, deleteAutoFundRule, runAutoFundRule } = useStore();
  const [editing, setEditing] = React.useState(false);
  const [amount, setAmount] = React.useState(rule ? String(rule.amount) : '');
  const [freq, setFreq] = React.useState(rule?.freq || 'monthly');
  const fundAccounts = (accounts || []).filter(a => !['INV', 'CRY'].includes(a.type));
  const [source, setSource] = React.useState(
    rule?.source || fundAccounts.find(a => a.type === 'SAV')?.id || fundAccounts[0]?.id || 'chk',
  );

  const due = rule ? summarizeDue(rule) : null;
  const todayIso = new Date().toISOString().slice(0, 10);

  const startEdit = () => {
    setAmount(rule ? String(rule.amount) : '');
    setFreq(rule?.freq || 'monthly');
    setSource(rule?.source || fundAccounts.find(a => a.type === 'SAV')?.id || fundAccounts[0]?.id || 'chk');
    setEditing(true);
  };

  const save = () => {
    const amt = parseFloat(amount);
    if (!(amt > 0) || !source) return;
    // Anchor monthly rules to the 1st; biweekly/weekly anchor at today so the
    // first occurrence is on/after creation, and seed lastFundedDate to "yesterday"
    // so we don't retroactively fund before the rule existed.
    const base = { goalId: goal.id, amount: amt, source, freq, lastFundedDate: todayIso };
    const payload = freq === 'monthly'
      ? { ...base, day: 1 }
      : { ...base, startDate: todayIso };
    if (rule) updateAutoFundRule(rule.id, payload);
    else addAutoFundRule(payload);
    setEditing(false);
  };

  const remove = () => {
    if (rule) deleteAutoFundRule(rule.id);
    setEditing(false);
  };

  const freqLabel = (FREQ_OPTIONS.find(f => f.key === (rule?.freq || 'monthly')) || {}).label;

  const pill = (active) => ({
    all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1, padding: '4px 8px',
    border: '1px solid ' + (active ? A.ink : A.rule2),
    background: active ? A.ink : 'transparent', color: active ? A.bg : A.ink,
  });

  if (editing) {
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + A.rule2 }}>
        <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 6 }}>
          {rule ? 'EDIT · AUTO-FUND' : 'NEW · AUTO-FUND'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, alignItems: 'center' }}>
          <input
            autoFocus type="number" min="0" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="AMOUNT"
            style={{ fontFamily: A.font, fontSize: 11, padding: '5px 8px', border: '1px solid ' + A.ink, background: A.bg, color: A.ink, outline: 'none', minWidth: 0 }}
          />
          <select value={source} onChange={e => setSource(e.target.value)} style={{ fontFamily: A.font, fontSize: 10, border: '1px solid ' + A.rule2, background: A.bg, color: A.ink }}>
            {fundAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {FREQ_OPTIONS.map(f => (
            <button key={f.key} onClick={() => setFreq(f.key)} style={pill(freq === f.key)}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <button onClick={save} disabled={!(parseFloat(amount) > 0)} style={{
            all: 'unset', cursor: parseFloat(amount) > 0 ? 'pointer' : 'default', fontSize: 10, letterSpacing: 1,
            padding: '5px 12px', background: parseFloat(amount) > 0 ? t.accent : A.rule2, color: A.bg,
          }}>SAVE</button>
          <button onClick={() => setEditing(false)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>CANCEL</button>
          {rule && <button onClick={remove} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.neg, letterSpacing: 1, marginLeft: 'auto' }}>REMOVE</button>}
        </div>
      </div>
    );
  }

  if (!rule) {
    return (
      <div style={{ marginTop: 10 }}>
        <button onClick={startEdit} style={{
          all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.4,
          padding: '5px 10px', border: '1px dashed ' + A.rule2, color: A.muted,
        }}>+ AUTO-FUND</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + A.rule2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 9, letterSpacing: 1.2, color: A.ink2 }}>
          AUTO · {fmtMoney(rule.amount, t.currency, false)} · {freqLabel}
          {rule.active === false && <span style={{ color: A.muted }}> · PAUSED</span>}
        </div>
        <button onClick={startEdit} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, color: A.muted, letterSpacing: 1 }}>EDIT</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ fontSize: 10, color: due.count > 0 ? A.ink : A.muted, letterSpacing: 0.8 }}>
          {due.count > 0
            ? `${due.count} DUE · ${fmtMoney(due.total, t.currency, false)}`
            : `NEXT · ${rule.lastFundedDate ? 'AFTER ' + rule.lastFundedDate : 'PENDING'}`}
        </div>
        {due.count > 0 && (
          <button onClick={() => runAutoFundRule(rule.id)} style={{
            all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.2,
            padding: '5px 12px', background: t.accent, color: A.bg,
          }}>RUN DUE</button>
        )}
      </div>
    </div>
  );
}
