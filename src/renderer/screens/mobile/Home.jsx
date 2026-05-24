import React from 'react';
import { A } from '../../theme';
import { AsciiSpark, ARule, ALabel } from '../../components/Shared';
import { fmtMoney, fmtSigned, fmtPct } from '../../data';
import { buildNetWorthDailyTrend } from '../../charts.mjs';
import { useStore } from '../../store';
import { useFx } from '../../useFx';
import EmptySectionHint from '../../components/EmptySectionHint';

export default function Home({ t, onAcct, onAdd, onViewAll, onInsight }) {
  const { accounts, accountsWithBalance, accountsIncludedInTotals, transactions, billRows, alertRows, insightRows, rates } = useStore();
  const { toReporting } = useFx(t.currency || 'USD');
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayIso = now.toISOString().slice(0, 10);
  const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();

  const NET_WORTH   = accountsIncludedInTotals.reduce((s, a) => s + toReporting(a.balance, a.ccy), 0);
  const monthTxs    = transactions.filter(tx => tx.date?.startsWith(thisMonth));
  const MONTH_IN    = monthTxs.filter(tx => tx.amt > 0 && tx.cat !== 'transfer').reduce((s, tx) => s + toReporting(tx.amt, tx.ccy), 0);
  const MONTH_OUT   = monthTxs.filter(tx => tx.amt < 0 && tx.cat !== 'transfer').reduce((s, tx) => s + toReporting(tx.amt, tx.ccy), 0);
  const MONTH_NET   = MONTH_IN + MONTH_OUT;
  const MONTH_SPEND = Math.abs(MONTH_OUT);
  const CASH        = accountsWithBalance
    .filter(a => ['CHK', 'SAV', 'FX'].includes(a.type))
    .reduce((s, a) => s + toReporting(a.balance, a.ccy), 0);
  const NW_DELTA    = accountsIncludedInTotals.reduce((s, a) => s + toReporting(a.delta, a.ccy), 0);

  const monthLabel  = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

  // 30-day net worth daily trend, derived from real transaction history.
  const nwTrend = React.useMemo(
    () => buildNetWorthDailyTrend(accounts, transactions, todayIso, 30, rates).map(p => p.value),
    [accounts, transactions, todayIso, rates],
  );
  // Daily spend trend (rolling 30 days, absolute value of expenses per day).
  const spendTrend = React.useMemo(() => {
    const days = 30;
    const out = new Array(days).fill(0);
    const end = new Date(`${todayIso}T00:00:00`);
    for (const tx of transactions) {
      if (!tx.date || tx.amt >= 0 || tx.cat === 'transfer') continue;
      const d = new Date(`${tx.date}T00:00:00`);
      const diff = Math.round((end - d) / 86400000);
      if (diff >= 0 && diff < days) {
        const idx = days - 1 - diff;
        out[idx] += Math.abs(toReporting(tx.amt, tx.ccy));
      }
    }
    return out;
  }, [transactions, todayIso, toReporting]);
  const cashTrend = React.useMemo(() => nwTrend.map(v => v * 0.12), [nwTrend]);
  const safeTrend = React.useMemo(() => nwTrend.map(v => v * 0.0006), [nwTrend]);

  const HERO_METRICS = [
    { key: 'nw',    label: 'NET WORTH',      value: NET_WORTH,   delta: NW_DELTA, deltaPct: NET_WORTH ? (NW_DELTA / Math.abs(NET_WORTH - NW_DELTA)) * 100 : 0, spark: nwTrend,                         ccy: t.currency },
    { key: 'spend', label: 'MONTH SPENDING', value: MONTH_SPEND, delta: 0,        deltaPct: 0,                                                                   spark: spendTrend, ccy: t.currency, invert: true },
    { key: 'cash',  label: 'CASH ON HAND',   value: CASH,        delta: 0,        deltaPct: 0,                                                                   spark: cashTrend,  ccy: t.currency },
    { key: 'safe',  label: 'SAFE TO SPEND',  value: CASH / 30,   delta: 0,        deltaPct: 0,                                                                   spark: safeTrend,  ccy: t.currency, unit: '/ DAY' },
  ];

  const [heroIdx, setHeroIdx] = React.useState(0);
  const [scrub, setScrub] = React.useState(null);
  const hero = HERO_METRICS[heroIdx];
  const accent = hero.invert ? (scrub != null ? A.neg : A.ink) : t.accent;
  const displayVal = scrub != null ? hero.spark[scrub] : hero.value;
  const dateLbl = scrub != null
    ? (() => { const d = new Date(); d.setDate(d.getDate() - (29 - scrub)); return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase(); })()
    : todayLabel;

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>LEDGER</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink2 }}>{todayLabel}</div>
      </div>
      <ARule thick />

      {/* Hero */}
      <div style={{ padding: '14px 0 10px' }}>
        {accountsIncludedInTotals.length === 0 ? (
          <div>
            <ALabel>[01] NET WORTH</ALabel>
            <EmptySectionHint
              message="Add your first account to see your net worth."
              ctaLabel="ADD ACCOUNT"
              onCta={onAdd}
            />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <ALabel>[01] {hero.label}</ALabel>
              <div style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>{dateLbl}</div>
            </div>
            <div
              onClick={() => setHeroIdx((heroIdx + 1) % HERO_METRICS.length)}
              style={{ cursor: 'pointer', marginTop: 6, marginBottom: 8, fontSize: 38, fontWeight: 500, letterSpacing: -1.2, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {fmtMoney(displayVal, hero.ccy, t.decimals)}
              {hero.unit && <span style={{ fontSize: 14, color: A.muted, marginLeft: 6 }}>{hero.unit}</span>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, letterSpacing: 0.4 }}>
              <span style={{ color: hero.delta >= 0 ? (hero.invert ? A.neg : t.accent) : (hero.invert ? t.accent : A.neg) }}>
                {fmtSigned(hero.delta, hero.ccy, t.decimals)} · {fmtPct(hero.deltaPct)}
              </span>
              <span style={{ color: A.muted }}>30D</span>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {HERO_METRICS.map((_, i) => (
                  <span key={i} style={{ width: 6, height: 6, background: i === heroIdx ? A.ink : A.rule2, display: 'block' }} />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <AsciiSpark data={hero.spark} width={354} height={64} stroke={accent} hover={scrub} onScrub={setScrub} />
            </div>
          </>
        )}
      </div>
      <ARule />

      {/* Alerts */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[02] ALERTS · {alertRows.length}</ALabel>
        {alertRows.slice(0, 2).map(alert => (
          <div key={alert.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 12, gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: alert.severity === 'critical' ? A.neg : alert.severity === 'medium' ? t.accent : A.ink, fontSize: 9, letterSpacing: 1 }}>{alert.severity.toUpperCase()}</div>
              <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.title}</div>
            </div>
            <div style={{ fontSize: 10, color: A.muted, letterSpacing: 1, alignSelf: 'center' }}>{alert.action}</div>
          </div>
        ))}
        {alertRows.length === 0 && (
          <div style={{ padding: '9px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 11, color: A.muted, letterSpacing: 1 }}>NO ACTIVE ALERTS</div>
        )}
      </div>

      {/* CAR-217: Weekly insights — top 2 on Home, tap to drill in. The full
          list lives in AlertsHub; this is a teaser. Hidden when empty. */}
      {insightRows.length > 0 && (
        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[02B] INSIGHTS · {insightRows.length}</ALabel>
          {insightRows.slice(0, 2).map(insight => (
            <button key={insight.id} onClick={() => onInsight && onInsight(insight)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 12, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: insight.severity === 'high' ? A.neg : insight.severity === 'medium' ? t.accent : A.muted, fontSize: 9, letterSpacing: 1 }}>{insight.severity.toUpperCase()}</div>
                <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{insight.title}</div>
              </div>
              <div style={{ fontSize: 10, color: t.accent, letterSpacing: 1, alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>{insight.metric}</div>
            </button>
          ))}
        </div>
      )}
      <ARule style={{ marginTop: 14 }} />

      {/* Accounts mini-list */}
      {accountsWithBalance.length > 0 && (
        <>
          <div style={{ padding: '14px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
            <ALabel>[03] ACCOUNTS · {accountsWithBalance.length}</ALabel>
            <div onClick={onViewAll} style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink, cursor: 'pointer' }}>VIEW ALL ▸</div>
          </div>
          {accountsWithBalance.slice(0, 5).map(a => (
            <button key={a.id} onClick={() => onAcct(a.id)} style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', width: '100%',
              padding: t.density === 'compact' ? '8px 0' : '11px 0',
              borderBottom: '1px solid ' + A.rule2,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: A.muted, width: 28, letterSpacing: 0.8 }}>{a.type}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                <span style={{ fontSize: 10, color: A.muted }}>{a.code}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: a.balance < 0 ? A.neg : A.ink }}>
                  {fmtMoney(a.balance, a.ccy, t.decimals)}
                </div>
                <div style={{ fontSize: 9, color: a.delta < 0 ? A.neg : t.accent }}>
                  {fmtSigned(a.delta, a.ccy, t.decimals)}
                </div>
              </div>
            </button>
          ))}
          <ARule />
        </>
      )}

      {/* Cash flow */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[04] {monthLabel} · CASH FLOW</ALabel>
        {transactions.length === 0 ? (
          <EmptySectionHint
            message="Cash flow appears once you have transactions."
            ctaLabel="ADD TRANSACTION"
            onCta={onAdd}
          />
        ) : (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2 }}>
            {[
              { l: 'IN',  v: MONTH_IN,  c: t.accent },
              { l: 'OUT', v: MONTH_OUT, c: A.neg },
              { l: 'NET', v: MONTH_NET, c: MONTH_NET >= 0 ? A.ink : A.neg },
            ].map(x => (
              <div key={x.l} style={{ background: A.bg, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{x.l}</div>
                <div style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: x.c, marginTop: 4 }}>
                  {fmtSigned(x.v, t.currency, t.decimals)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ARule style={{ marginTop: 14 }} />

      {/* Upcoming */}
      {billRows.length > 0 && (
        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[05] UPCOMING · 7 DAYS</ALabel>
          {billRows.filter(b => b.status !== 'paid').slice(0, 3).map(b => (
            <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: b.status === 'upcoming' ? A.muted : A.neg, width: 24 }}>{b.dueDate.slice(8)}</span>
                <span style={{ fontWeight: 500 }}>{b.name}</span>
              </div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(b.amt, t.currency, t.decimals)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
