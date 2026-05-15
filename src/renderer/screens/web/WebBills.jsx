import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import WebShell from './WebShell';
import { useStore } from '../../store';
import { CATEGORIES, fmtMoney } from '../../data';

const STATUS_LABELS = { paid: 'PAID', due: 'DUE TODAY', overdue: 'OVERDUE', upcoming: 'UPCOMING' };
const FREQ_SHORT = { monthly: 'MONTHLY', weekly: 'WEEKLY', biweekly: 'BI-WK', annual: 'ANNUAL', custom: 'CUSTOM' };
const FREQ_VALUES = ['monthly', 'weekly', 'biweekly', 'annual', 'custom'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function statusColor(status, accent) {
  if (status === 'paid') return accent;
  if (status === 'due' || status === 'overdue') return A.neg;
  return A.muted;
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', padding: '4px 8px',
      border: '1px solid ' + (active ? A.ink : A.rule2),
      background: active ? A.ink : 'transparent',
      color: active ? A.bg : A.ink,
      fontSize: 9, letterSpacing: 1.1,
    }}>{label}</button>
  );
}

function RecurringPanel({ t, editRule, onClose, onSave, onDelete, accountsWithBalance }) {
  const [name, setName]           = React.useState(editRule?.name || '');
  const [type, setType]           = React.useState(editRule?.type || 'expense');
  const [amt, setAmt]             = React.useState(editRule ? String(editRule.amt) : '');
  const [freq, setFreq]           = React.useState(editRule?.freq || 'monthly');
  const [day, setDay]             = React.useState(editRule?.day ?? 1);
  const [month, setMonth]         = React.useState(editRule?.month ?? 1);
  const [startDate, setStartDate] = React.useState(editRule?.startDate || new Date().toISOString().slice(0, 10));
  const [intervalDays, setIntervalDays] = React.useState(editRule?.interval ?? 14);
  const [acct, setAcct]           = React.useState(editRule?.acct || accountsWithBalance[0]?.id || '');
  const [cat, setCat]             = React.useState(editRule?.cat || 'bills');
  const [active, setActive]       = React.useState(editRule?.active !== false);

  const canSave = name.trim() && parseFloat(amt) > 0 && acct;

  const buildRule = () => ({
    name: name.trim(), type, amt: parseFloat(amt), freq,
    day: ['monthly', 'weekly', 'annual'].includes(freq) ? Number(day) : undefined,
    month: freq === 'annual' ? Number(month) : undefined,
    startDate: ['biweekly', 'custom'].includes(freq) ? startDate : undefined,
    interval: freq === 'custom' ? Number(intervalDays) : undefined,
    acct, cat, path: [cat], ccy: 'USD', active,
  });

  return (
    <div style={{ border: '1px solid ' + A.ink, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <ALabel>{editRule ? 'EDIT · RECURRING' : 'NEW · RECURRING'}</ALabel>
        <div style={{ display: 'flex', gap: 16 }}>
          {editRule && <button onClick={onDelete} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.2, color: A.neg }}>DELETE</button>}
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 16, color: A.muted }}>×</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
        <div>
          <ALabel>NAME</ALabel>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. RENT"
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '5px 0', color: A.ink, boxSizing: 'border-box' }} />
        </div>
        <div>
          <ALabel>TYPE</ALabel>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Pill label="EXPENSE" active={type === 'expense'} onClick={() => setType('expense')} />
            <Pill label="INCOME" active={type === 'income'} onClick={() => setType('income')} />
          </div>
        </div>
        <div>
          <ALabel>AMOUNT</ALabel>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)}
            style={{ all: 'unset', display: 'block', width: '100%', marginTop: 6, fontFamily: A.font, fontSize: 20, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: type === 'income' ? t.accent : A.neg, boxSizing: 'border-box' }} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <ALabel>FREQUENCY</ALabel>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {FREQ_VALUES.map((f, i) => (
            <Pill key={f} label={['MONTHLY','WEEKLY','BI-WEEKLY','ANNUAL','CUSTOM'][i]} active={freq === f} onClick={() => setFreq(f)} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        {freq === 'monthly' && (
          <div>
            <ALabel>DAY OF MONTH</ALabel>
            <input type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
              style={{ all: 'unset', display: 'block', width: 60, marginTop: 6, fontFamily: A.font, fontSize: 14, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }} />
          </div>
        )}
        {freq === 'weekly' && (
          <div>
            <ALabel>DAY OF WEEK</ALabel>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {DOW.map((d, i) => <Pill key={d} label={d} active={day === i} onClick={() => setDay(i)} />)}
            </div>
          </div>
        )}
        {(freq === 'biweekly' || freq === 'custom') && (
          <div>
            <ALabel>START DATE</ALabel>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ all: 'unset', display: 'block', marginTop: 6, fontFamily: A.font, fontSize: 13, borderBottom: '1px solid ' + A.rule2, padding: '5px 0', color: A.ink }} />
          </div>
        )}
        {freq === 'annual' && (
          <>
            <div>
              <ALabel>MONTH</ALabel>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {MONTHS_SHORT.map((m, i) => <Pill key={m} label={m} active={month === i + 1} onClick={() => setMonth(i + 1)} />)}
              </div>
            </div>
            <div>
              <ALabel>DAY</ALabel>
              <input type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)}
                style={{ all: 'unset', display: 'block', width: 60, marginTop: 6, fontFamily: A.font, fontSize: 14, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }} />
            </div>
          </>
        )}
        {freq === 'custom' && (
          <div>
            <ALabel>EVERY N DAYS</ALabel>
            <input type="number" min="1" value={intervalDays} onChange={e => setIntervalDays(e.target.value)}
              style={{ all: 'unset', display: 'block', width: 60, marginTop: 6, fontFamily: A.font, fontSize: 14, borderBottom: '1px solid ' + A.rule2, padding: '4px 0', color: A.ink }} />
          </div>
        )}
        <div>
          <ALabel>ACCOUNT</ALabel>
          <select value={acct} onChange={e => setAcct(e.target.value)}
            style={{ marginTop: 6, fontFamily: A.font, fontSize: 12, padding: '4px 6px', border: '1px solid ' + A.ink, background: A.bg, color: A.ink }}>
            {accountsWithBalance.filter(a => !a.archived).map(a => (
              <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
            ))}
          </select>
        </div>
        <div>
          <ALabel>CATEGORY</ALabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <Pill key={k} label={c.glyph + ' ' + c.label} active={cat === k} onClick={() => setCat(k)} />
            ))}
          </div>
        </div>
        {editRule && (
          <div>
            <ALabel>STATUS</ALabel>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <Pill label="ACTIVE" active={active} onClick={() => setActive(true)} />
              <Pill label="PAUSED" active={!active} onClick={() => setActive(false)} />
            </div>
          </div>
        )}
      </div>

      <ARule />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={() => canSave && onSave(buildRule())} style={{
          all: 'unset', cursor: canSave ? 'pointer' : 'default', padding: '10px 24px',
          background: canSave ? t.accent : A.rule2, color: A.bg,
          fontSize: 10, letterSpacing: 2, fontWeight: 700,
        }}>SAVE ↵</button>
      </div>
    </div>
  );
}

export default function WebBills({ t, onNavigate, onAdd }) {
  const { accountsWithBalance, billRows, markRecurringPaid, addRecurring, updateRecurring, deleteRecurring, bills, periodLabel } = useStore();

  const [showPanel, setShowPanel] = React.useState(false);
  const [editRule, setEditRule]   = React.useState(null);

  const totalMonthly = billRows.filter(b => b.type !== 'income').reduce((s, b) => s + b.amt, 0);
  const paidTotal    = billRows.filter(b => b.status === 'paid' && b.type !== 'income').reduce((s, b) => s + b.amt, 0);
  const openRows     = billRows.filter(b => b.status !== 'paid');
  const upcoming     = openRows.filter(b => ['due', 'overdue', 'upcoming'].includes(b.status)).slice(0, 3);

  const openAdd = () => { setEditRule(null); setShowPanel(true); };
  const openEdit = ruleId => {
    const rule = bills.find(b => b.id === ruleId);
    setEditRule(rule || null);
    setShowPanel(true);
  };
  const closePanel = () => { setShowPanel(false); setEditRule(null); };

  const handleSave = rule => {
    if (editRule) updateRecurring(editRule.id, rule);
    else addRecurring(rule);
    closePanel();
  };

  const handleDelete = () => {
    if (editRule) deleteRecurring(editRule.id);
    closePanel();
  };

  return (
    <WebShell active="bills" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <ALabel>[01] RECURRING · {periodLabel}</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(paidTotal, t.currency, t.decimals)}
            <span style={{ color: A.muted, fontSize: 24 }}> · {fmtMoney(totalMonthly, t.currency, false)}</span>
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
            PAID · TOTAL · {openRows.length} OPEN
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {upcoming.length > 0 && (
            <div style={{ border: '1px solid ' + A.ink, padding: '12px 16px', minWidth: 220 }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.4, marginBottom: 8 }}>NEXT ACTIONS</div>
              {upcoming.map((b, i) => (
                <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: i < upcoming.length - 1 ? '1px solid ' + A.rule2 : 'none', gap: 14 }}>
                  <span><span style={{ color: statusColor(b.status, t.accent), marginRight: 8 }}>{STATUS_LABELS[b.status]}</span>{b.name}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(b.amt, t.currency, t.decimals)}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={openAdd} style={{ all: 'unset', cursor: 'pointer', padding: '8px 16px', border: '1px solid ' + A.ink, fontSize: 10, letterSpacing: 1.4 }}>+ ADD</button>
        </div>
      </div>

      {showPanel && (
        <RecurringPanel
          t={t}
          editRule={editRule}
          onClose={closePanel}
          onSave={handleSave}
          onDelete={handleDelete}
          accountsWithBalance={accountsWithBalance}
        />
      )}

      <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
        <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr 70px 80px 90px 90px 86px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
          <div>STATUS</div><div>NAME</div><div>ACCT</div><div>FREQ</div><div>CATEGORY</div><div style={{ textAlign: 'right' }}>AMOUNT</div><div style={{ textAlign: 'right' }}>ACTION</div>
        </div>
        {billRows.map(b => {
          const acct = accountsWithBalance.find(a => a.id === b.acct);
          const cat = CATEGORIES[b.cat];
          const isIncome = b.type === 'income';
          return (
            <div key={b.key} style={{
              display: 'grid', gridTemplateColumns: '86px 1fr 70px 80px 90px 90px 86px',
              padding: t.density === 'compact' ? '8px 0' : '11px 0',
              borderBottom: '1px solid ' + A.rule2, alignItems: 'center',
              opacity: b.status === 'paid' ? 0.58 : 1,
            }}>
              <div style={{ fontSize: 9, letterSpacing: 1, color: statusColor(b.status, t.accent) }}>
                {STATUS_LABELS[b.status]}<br /><span style={{ color: A.muted }}>{b.dueDate.slice(5)}</span>
              </div>
              <div style={{ fontSize: 12 }}>{b.name}</div>
              <div style={{ fontSize: 9, color: A.muted }}>{acct?.code || b.acct}</div>
              <div style={{ fontSize: 9, color: A.muted }}>{FREQ_SHORT[b.freq] || 'MONTHLY'}</div>
              <div style={{ fontSize: 10, color: A.ink2 }}>{cat?.glyph} {cat?.label || b.cat}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: isIncome ? t.accent : A.ink }}>
                {isIncome ? '↑ ' : ''}{fmtMoney(b.amt, t.currency, t.decimals)}
              </div>
              <div style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                {b.status === 'paid' ? (
                  <span style={{ fontSize: 9, color: t.accent, letterSpacing: 1 }}>TX LINKED</span>
                ) : (
                  <button onClick={() => markRecurringPaid(b, b.dueDate)} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1, padding: '4px 7px', background: A.ink, color: A.bg }}>
                    PAY
                  </button>
                )}
                <button onClick={() => openEdit(b.id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: A.muted }}>✎</button>
              </div>
            </div>
          );
        })}
      </div>
    </WebShell>
  );
}
