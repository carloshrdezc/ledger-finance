import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { CATEGORIES } from '../data';
import { useStore } from '../store';

const FREQ_LABELS = ['MONTHLY', 'WEEKLY', 'BI-WEEKLY', 'ANNUAL', 'CUSTOM'];
const FREQ_VALUES = ['monthly', 'weekly', 'biweekly', 'annual', 'custom'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default function RecurringFormSheet({ t, onClose, editRule = null }) {
  const { addRecurring, updateRecurring, deleteRecurring, accountsWithBalance } = useStore();

  const [name, setName]           = React.useState(editRule?.name || '');
  const [type, setType]           = React.useState(editRule?.type || 'expense');
  const [amt, setAmt]             = React.useState(editRule ? String(editRule.amt) : '');
  const [freq, setFreq]           = React.useState(editRule?.freq || 'monthly');
  const [day, setDay]             = React.useState(editRule?.day ?? 1);
  const [month, setMonth]         = React.useState(editRule?.month ?? 1);
  const [startDate, setStartDate] = React.useState(editRule?.startDate || new Date().toISOString().slice(0, 10));
  const [interval, setInterval]   = React.useState(editRule?.interval ?? 14);
  const [acct, setAcct]           = React.useState(editRule?.acct || accountsWithBalance[0]?.id || '');
  const [cat, setCat]             = React.useState(editRule?.cat || 'bills');
  const [active, setActive]       = React.useState(editRule?.active !== false);

  const canSave = name.trim() && parseFloat(amt) > 0 && acct;

  const buildRule = () => ({
    name: name.trim(),
    type,
    amt: parseFloat(amt),
    freq,
    day: ['monthly', 'weekly', 'annual'].includes(freq) ? Number(day) : undefined,
    month: freq === 'annual' ? Number(month) : undefined,
    startDate: ['biweekly', 'custom'].includes(freq) ? startDate : undefined,
    interval: freq === 'custom' ? Number(interval) : undefined,
    acct,
    cat,
    path: [cat],
    ccy: 'USD',
    active,
  });

  const handleSave = () => {
    if (!canSave) return;
    if (editRule) {
      updateRecurring(editRule.id, buildRule());
    } else {
      addRecurring(buildRule());
    }
    onClose();
  };

  const handleDelete = () => {
    if (editRule) deleteRecurring(editRule.id);
    onClose();
  };

  const pill = (label, isActive, onClick) => (
    <button key={label} onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', padding: '5px 10px',
      border: '1px solid ' + (isActive ? A.ink : A.rule2),
      background: isActive ? A.ink : 'transparent',
      color: isActive ? A.bg : A.ink,
      fontSize: 10, letterSpacing: 1.2,
    }}>{label}</button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: A.bg, zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: A.font }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid ' + A.rule2 }}>
        <ALabel>{editRule ? 'EDIT · RECURRING' : 'NEW · RECURRING'}</ALabel>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {editRule && (
            <button onClick={handleDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: A.neg }}>DELETE</button>
          )}
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 20, color: A.muted }}>×</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

        {/* NAME */}
        <div style={{ marginBottom: 16 }}>
          <ALabel>NAME</ALabel>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RENT"
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 14, letterSpacing: 0.6, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink, boxSizing: 'border-box' }}
          />
        </div>

        {/* TYPE */}
        <div style={{ marginBottom: 16 }}>
          <ALabel>TYPE</ALabel>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {pill('EXPENSE', type === 'expense', () => setType('expense'))}
            {pill('INCOME', type === 'income', () => setType('income'))}
          </div>
        </div>

        {/* AMOUNT */}
        <div style={{ marginBottom: 16 }}>
          <ALabel>AMOUNT</ALabel>
          <input
            type="number" min="0" step="0.01" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)}
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 8, fontFamily: A.font, fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: type === 'income' ? t.accent : A.neg, boxSizing: 'border-box' }}
          />
        </div>

        <ARule />

        {/* FREQUENCY */}
        <div style={{ margin: '12px 0' }}>
          <ALabel>FREQUENCY</ALabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {FREQ_VALUES.map((f, i) => pill(FREQ_LABELS[i], freq === f, () => setFreq(f)))}
          </div>
        </div>

        {/* Frequency-specific sub-fields */}
        {freq === 'monthly' && (
          <div style={{ marginBottom: 12 }}>
            <ALabel>DAY OF MONTH</ALabel>
            <input
              type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
              style={{ all: 'unset', display: 'block', width: 80, marginTop: 8, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }}
            />
          </div>
        )}

        {freq === 'weekly' && (
          <div style={{ marginBottom: 12 }}>
            <ALabel>DAY OF WEEK</ALabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {DOW.map((d, i) => pill(d, day === i, () => setDay(i)))}
            </div>
          </div>
        )}

        {freq === 'biweekly' && (
          <div style={{ marginBottom: 12 }}>
            <ALabel>START DATE</ALabel>
            <input
              type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ all: 'unset', display: 'block', marginTop: 8, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink }}
            />
          </div>
        )}

        {freq === 'annual' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <ALabel>MONTH</ALabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {MONTHS.map((m, i) => pill(m, month === i + 1, () => setMonth(i + 1)))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <ALabel>DAY OF MONTH</ALabel>
              <input
                type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
                style={{ all: 'unset', display: 'block', width: 80, marginTop: 8, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }}
              />
            </div>
          </>
        )}

        {freq === 'custom' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <ALabel>START DATE</ALabel>
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ all: 'unset', display: 'block', marginTop: 8, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '6px 0', color: A.ink }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <ALabel>EVERY N DAYS</ALabel>
              <input
                type="number" min="1" value={interval} onChange={e => setInterval(e.target.value)}
                style={{ all: 'unset', display: 'block', width: 80, marginTop: 8, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }}
              />
            </div>
          </>
        )}

        <ARule />

        {/* ACCOUNT */}
        <div style={{ margin: '12px 0' }}>
          <ALabel>ACCOUNT</ALabel>
          <select value={acct} onChange={e => setAcct(e.target.value)} style={{ marginTop: 8, width: '100%', fontFamily: A.font, fontSize: 13, padding: 8, border: '1px solid ' + A.ink, background: A.bg, color: A.ink }}>
            {accountsWithBalance.filter(a => !a.archived).map(a => (
              <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
            ))}
          </select>
        </div>

        {/* CATEGORY */}
        <div style={{ margin: '12px 0' }}>
          <ALabel>CATEGORY</ALabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} onClick={() => setCat(k)} style={{
                all: 'unset', cursor: 'pointer', padding: '5px 9px',
                border: '1px solid ' + (cat === k ? A.ink : A.rule2),
                background: cat === k ? A.ink : 'transparent',
                color: cat === k ? A.bg : A.ink,
                fontSize: 10, letterSpacing: 1.2,
              }}>{c.glyph} {c.label}</button>
            ))}
          </div>
        </div>

        {/* ACTIVE (edit mode only) */}
        {editRule && (
          <div style={{ margin: '12px 0 4px' }}>
            <ALabel>STATUS</ALabel>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {pill('ACTIVE', active, () => setActive(true))}
              {pill('PAUSED', !active, () => setActive(false))}
            </div>
          </div>
        )}
      </div>

      {/* Footer SAVE */}
      <div style={{ padding: '12px 18px', borderTop: '1px solid ' + A.rule2 }}>
        <button onClick={handleSave} style={{
          all: 'unset', cursor: canSave ? 'pointer' : 'default', display: 'block',
          textAlign: 'center', width: '100%', padding: '14px',
          background: canSave ? t.accent : A.rule2,
          color: A.bg, fontSize: 12, letterSpacing: 2, fontWeight: 700,
          boxSizing: 'border-box',
        }}>SAVE</button>
      </div>
    </div>
  );
}
