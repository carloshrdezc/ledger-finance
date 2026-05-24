import React from 'react';
import { A } from '../../theme';
import { ADetailCell, ALabel, ARule } from '../../components/Shared';
import { catBreadcrumb, dayLabel, fmtMoney, fmtSigned } from '../../data';
import { useStore } from '../../store';

const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function nextStatementDate(statementDay) {
  if (!statementDay) return null;
  const today = new Date();
  let year = today.getFullYear(), month = today.getMonth();
  if (today.getDate() > statementDay) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return new Date(year, month, statementDay);
}

function formatStatementLabel(statementDay) {
  const d = nextStatementDate(statementDay);
  if (!d) return '—';
  return MONTH_ABBR[d.getMonth()] + ' ' + d.getDate();
}

function daysUntil(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = date.getTime() - today.getTime();
  return Math.max(0, Math.round(ms / 86400000));
}

export default function CCDetail({ t, acct, onBack }) {
  const { transactions, accountsWithBalance } = useStore();
  const ccAccounts = accountsWithBalance.filter(x => x.type === 'CC');
  const a = accountsWithBalance.find(x => x.id === acct) || ccAccounts[0] || {};
  const limit = a.creditLimit ?? 10000;
  const apr = a.apr ?? null;
  const statementDay = a.statementDay ?? null;
  const used = Math.abs(a.balance || 0);
  const util = limit > 0 ? used / limit : 0;
  const minDue = Math.max(35, Math.round(used * 0.02));
  const stmtLabel = statementDay ? formatStatementLabel(statementDay) : '—';
  const due = statementDay ? daysUntil(nextStatementDate(statementDay)) : null;
  const txns = transactions.filter(x => x.acct === a.id).slice(0, 8);

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
      </div>
      <ARule thick />
      <div style={{ padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1.4, color: A.muted, textTransform: 'uppercase' }}>{a.name}</div>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4, color: A.neg }}>{fmtMoney(a.balance, t.currency, t.decimals)}</div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>STATEMENT DUE · {stmtLabel}</div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <ALabel>UTILIZATION</ALabel>
          <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{(util * 100).toFixed(1)}%</div>
        </div>
        <div style={{ marginTop: 8, position: 'relative', height: 14, background: A.rule2, border: '1px solid ' + A.rule2 }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: '30%', background: t.accent, opacity: 0.18 }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: (Math.min(util, 1) * 100) + '%', background: util > 0.3 ? A.neg : t.accent }} />
          <div style={{ position: 'absolute', top: -2, bottom: -2, left: '30%', width: 1, background: A.ink }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
          <span>$0</span><span>30% · RECOMMENDED</span><span>{fmtMoney(limit, t.currency, false)}</span>
        </div>
      </div>
      <ARule style={{ marginTop: 16 }} />
      <div style={{ marginTop: 14 }}>
        <ALabel>STATEMENT · {stmtLabel}</ALabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, marginTop: 8, border: '1px solid ' + A.rule2, background: A.rule2 }}>
          <ADetailCell label="STATEMENT BAL" val={fmtMoney(used, t.currency, t.decimals)} />
          <ADetailCell label="MIN DUE" val={fmtMoney(minDue, t.currency, t.decimals)} c={A.neg} />
          <ADetailCell label="APR" val={apr != null ? apr.toFixed(2) + '%' : '—'} />
          <ADetailCell label="DUE IN" val={due != null ? due + ' DAYS' : '—'} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '12px', background: A.ink, color: A.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>PAY · MIN</button>
          <button style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '12px', background: t.accent, color: A.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>PAY · FULL</button>
        </div>
      </div>
      <ARule style={{ marginTop: 16 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>PAYOFF · PROJECTION</ALabel>
        <div style={{ marginTop: 10 }}>
          {[
            { l: 'MIN ONLY',      mo: 84, paid: used + 982,  color: A.neg },
            { l: '$100/MO',       mo: 14, paid: used + 142,  color: A.ink },
            { l: 'FULL · ' + stmtLabel, mo: 0,  paid: used,  color: t.accent },
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px', padding: '9px 0', borderBottom: '1px solid ' + A.rule2, alignItems: 'baseline' }}>
              <div style={{ fontSize: 11, color: r.color, letterSpacing: 0.4 }}>{r.l}</div>
              <div style={{ fontSize: 10, color: A.muted, textAlign: 'center', letterSpacing: 1 }}>{r.mo ? r.mo + ' MO' : 'NOW'}</div>
              <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{fmtMoney(r.paid, t.currency, false)}</div>
            </div>
          ))}
        </div>
      </div>
      <ARule />
      <div style={{ padding: '14px 0 4px' }}><ALabel>RECENT · CHARGES</ALabel></div>
      {txns.map(tx => (
        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 2 }}>{dayLabel(tx.date)} · {catBreadcrumb(tx.path || [tx.cat])}</div>
          </div>
          <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: A.ink }}>{fmtSigned(tx.amt, tx.ccy, t.decimals)}</div>
        </div>
      ))}
    </div>
  );
}
