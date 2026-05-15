import React from 'react';
import { A } from '../../theme';
import { AsciiSpark, ARule, ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import {
  CATEGORIES,
  SPARK_NW,
  fmtMoney, fmtSigned, fmtPct, dayLabel, catGlyph,
} from '../../data';
import { useStore } from '../../store';

const PERIOD_DAYS  = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };
const PERIOD_LABEL = { '1D': '1D', '1W': '7D', '1M': '30D', '3M': '90D', '1Y': '1Y', 'MAX': 'ALL' };

function windowStart(period) {
  if (period === 'MAX') return null;
  const d = new Date();
  d.setDate(d.getDate() - PERIOD_DAYS[period]);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard({ t, onNavigate, onAdd }) {
  const { transactions, budgetRows, accountsWithBalance, periodLabel, billRows, goals } = useStore();
  const [scrub, setScrub] = React.useState(null);
  const [period, setPeriod] = React.useState('1M');

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const NET_WORTH  = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.balance : a.balance * 1.08), 0);
  const NW_DELTA   = accountsWithBalance.reduce((s, a) => s + (a.ccy === 'USD' ? a.delta  : a.delta  * 1.08), 0);
  const NW_PCT     = NET_WORTH ? (NW_DELTA / Math.abs(NET_WORTH - NW_DELTA)) * 100 : 0;
  const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();

  const { inflow, outflow, net, deltaByAcct } = React.useMemo(() => {
    const cutoff = windowStart(period);
    const filtered = cutoff ? transactions.filter(tx => tx.date >= cutoff) : transactions;
    let inflow = 0, outflow = 0;
    const deltaByAcct = new Map();
    for (const tx of filtered) {
      const usd = tx.ccy === 'USD' ? tx.amt : tx.amt * 1.08;
      if (usd > 0) inflow += usd;
      else outflow += usd;
      deltaByAcct.set(tx.acct, (deltaByAcct.get(tx.acct) ?? 0) + usd);
    }
    return { inflow, outflow, net: inflow + outflow, deltaByAcct };
  }, [period, transactions]);

  const heroVal = scrub != null ? SPARK_NW[scrub] : NET_WORTH;

  return (
    <WebShell active="dashboard" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      {/* Hero */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] NET WORTH · {todayLabel}</ALabel>
          <div style={{ fontSize: 64, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 8 }}>
            {fmtMoney(heroVal, t.currency, t.decimals)}
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <span style={{ color: t.accent }}>{fmtSigned(NW_DELTA, t.currency, t.decimals)} · {fmtPct(NW_PCT)}</span>
            <span style={{ color: A.muted, marginLeft: 12 }}>{PERIOD_LABEL[period]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['1D','1W','1M','3M','1Y','MAX'].map(p => (
            <span key={p} onClick={() => setPeriod(p)} style={{
              fontSize: 10, letterSpacing: 1.2, padding: '5px 10px',
              border: '1px solid ' + (period === p ? A.ink : A.rule2),
              background: period === p ? A.ink : 'transparent',
              color: period === p ? A.bg : A.ink, cursor: 'pointer',
            }}>{p}</span>
          ))}
        </div>
      </div>

      {/* Sparkline */}
      <div style={{ marginTop: 18, borderTop: '2px solid ' + A.ink, borderBottom: '1px solid ' + A.rule2, paddingTop: 18 }}>
        <AsciiSpark data={SPARK_NW} width={780} height={160} stroke={t.accent} hover={scrub} onScrub={setScrub} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
          <span>APR 11</span><span>APR 18</span><span>APR 25</span><span>MAY 2</span><span>MAY 11</span>
        </div>
      </div>

      {/* Cash flow */}
      <div style={{ marginTop: 20, marginBottom: 8 }}>
        <ALabel>[03] {PERIOD_LABEL[period]} · CASH FLOW</ALabel>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2 }}>
          {[
            { l: 'IN',  v: inflow,  c: t.accent },
            { l: 'OUT', v: outflow, c: A.neg    },
            { l: 'NET', v: net,     c: A.ink    },
          ].map(x => (
            <div key={x.l} style={{ background: A.bg, padding: '14px 16px' }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{x.l}</div>
              <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: x.c, marginTop: 6 }}>
                {fmtSigned(x.v, t.currency, t.decimals)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two columns */}
      <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28 }}>
        {/* Accounts table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <ALabel>[02] ACCOUNTS</ALabel>
            <ALabel>{fmtMoney(NET_WORTH, t.currency, false)}</ALabel>
          </div>
          <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
            <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 80px 110px 80px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
              <div /><div>NAME</div><div>CODE</div><div style={{ textAlign: 'right' }}>BALANCE</div><div style={{ textAlign: 'right' }}>{PERIOD_LABEL[period]}</div>
            </div>
            {accountsWithBalance.map(a => {
              const acctDelta = deltaByAcct.get(a.id) ?? a.delta;
              return (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 80px 110px 80px', padding: t.density === 'compact' ? '7px 0' : '10px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8 }}>{a.type}</div>
                  <div>{a.name}</div>
                  <div style={{ color: A.muted, fontSize: 10 }}>{a.code}</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? A.neg : A.ink }}>{fmtMoney(a.balance, a.ccy, t.decimals)}</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: acctDelta < 0 ? A.neg : t.accent, fontSize: 10 }}>{fmtSigned(acctDelta, a.ccy, t.decimals)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Budgets + Upcoming */}
        <div>
          <ALabel>[04] {periodLabel} · BUDGETS</ALabel>
          <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
            {budgetRows.slice(0, 5).map(b => {
              const pct = Math.min(b.spent / Math.max(b.available, 1), 1.2);
              const over = b.left < 0;
              return (
                <div key={b.cat} style={{ padding: '9px 0', borderBottom: '1px solid ' + A.rule2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: 1 }}>
                    <span>{CATEGORIES[b.cat].label}</span>
                    <span style={{ color: over ? A.neg : A.ink, fontVariantNumeric: 'tabular-nums' }}>{Math.round(b.spent)} / {Math.round(b.available)}</span>
                  </div>
                  <div style={{ marginTop: 5, height: 4, background: A.rule2, position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, width: (Math.min(pct, 1) * 100) + '%', background: over ? A.neg : t.accent }} />
                  </div>
                </div>
              );
            })}
          </div>
          <ALabel style={{ marginTop: 24 }}>[05] UPCOMING · 7D</ALabel>
          <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
            {billRows.filter(b => b.status !== 'paid').slice(0, 4).map(b => (
              <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: b.status === 'upcoming' ? A.muted : A.neg, width: 24 }}>{b.dueDate.slice(8)}</span>
                  <span>{b.name}</span>
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(b.amt, t.currency, t.decimals)}</div>
              </div>
            ))}
          </div>
          <ALabel style={{ marginTop: 24 }}>[06] GOALS</ALabel>
          <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
            {goals.map(g => (
              <div key={g.id} style={{ padding: '9px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: 1 }}>
                  <span>{g.name}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMoney(g.current, t.currency, false)} / {fmtMoney(g.target, t.currency, false)}
                  </span>
                </div>
                <div style={{ marginTop: 5, height: 4, background: A.rule2, position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, width: Math.min(g.current / g.target * 100, 100) + '%', background: t.accent }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div style={{ marginTop: 28 }}>
        <ALabel>[07] RECENT · TRANSACTIONS</ALabel>
        <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
          {transactions.slice(0, 8).map(tx => (
            <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '80px 16px 1fr 100px 100px', padding: t.density === 'compact' ? '7px 0' : '9px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.date)}</div>
              <div>{catGlyph(tx.path || [tx.cat])}</div>
              <div>{tx.name}<span style={{ color: A.muted, marginLeft: 8, fontSize: 10 }}>{CATEGORIES[tx.cat]?.label}</span></div>
              <div style={{ color: A.muted, fontSize: 10 }}>{accountsWithBalance.find(a => a.id === tx.acct)?.code}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tx.amt >= 0 ? t.accent : A.ink }}>{fmtSigned(tx.amt, tx.ccy, t.decimals)}</div>
            </div>
          ))}
        </div>
      </div>
    </WebShell>
  );
}
