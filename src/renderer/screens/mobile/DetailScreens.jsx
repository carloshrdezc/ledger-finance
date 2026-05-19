import React from 'react';
import { A, ACCENTS } from '../../theme';
import { AsciiSpark, ARule, ALabel, ADetailCell, CategoryTrendChart, IncomeExpenseChart, LineChart } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import { MERCHANTS, MOM_SPEND, fmtMoney, fmtSigned, fmtPct, dayLabel, catBreadcrumb } from '../../data';
import { useStore } from '../../store';
import ImportExport from '../../components/ImportExport';
import RecurringFormSheet from '../../components/RecurringFormSheet';
import { addMonths, filterTransactionsForPeriod, formatShortPeriodLabel, getDaysInPeriod } from '../../period.mjs';
import {
  buildCategoryTrend,
  buildIncomeExpenseSeries,
  buildNetWorthTrend,
  getRecentPeriods,
} from '../../charts.mjs';

// ── Reports ──────────────────────────────────────────────────────────────────
export function Reports({ t, onBack }) {
  const { transactions, periodTransactions, categoryTree, selectedPeriod, periodLabel, accounts, bills } = useStore();
  const previousPeriod = addMonths(selectedPeriod, -1);
  const previousPeriodTxs = filterTransactionsForPeriod(transactions, previousPeriod);
  const previousTotal = previousPeriodTxs.filter(x => x.amt < 0)
    .reduce((s, x) => s + Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08), 0);
  const total = periodTransactions.filter(x => x.amt < 0)
    .reduce((s, x) => s + Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08), 0);
  const byCat = {};
  periodTransactions.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    byCat[k] = (byCat[k] || 0) + Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08);
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = cats[0] ? cats[0][1] : 1;
  const trendPeriods = getRecentPeriods(selectedPeriod, 6);
  const incomeExpense = buildIncomeExpenseSeries(transactions, trendPeriods);
  const categoryTrend = buildCategoryTrend(transactions, trendPeriods, 4);
  const netWorthTrend = buildNetWorthTrend(accounts, transactions, trendPeriods);

  // ── Detected Insights ────────────────────────────────────────────────────
  // 1. Top-growing category vs previous period (largest absolute increase).
  const prevByCat = {};
  previousPeriodTxs.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    prevByCat[k] = (prevByCat[k] || 0) + Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08);
  });
  const allCatKeys = new Set([...Object.keys(byCat), ...Object.keys(prevByCat)]);
  let topGrowth = null;
  for (const k of allCatKeys) {
    const cur = byCat[k] || 0;
    const prev = prevByCat[k] || 0;
    const diff = cur - prev;
    if (diff <= 0 || prev <= 0) continue;
    const pct = (diff / prev) * 100;
    if (!topGrowth || pct > topGrowth.pct) topGrowth = { key: k, pct, diff };
  }
  const growthLabel = topGrowth ? (categoryTree[topGrowth.key]?.label || topGrowth.key.toUpperCase()) : null;

  // 2. Active subscriptions count + monthly total.
  const subBills = bills.filter(b => b.active !== false && b.cat === 'subs' && b.type !== 'income');
  const subTotal = subBills.reduce((s, b) => {
    const amt = Math.abs(b.amt || 0);
    if (b.freq === 'weekly')   return s + amt * 4.33;
    if (b.freq === 'biweekly') return s + amt * 2.17;
    if (b.freq === 'annual')   return s + amt / 12;
    return s + amt;
  }, 0);

  // 3. Unused subscription: an active sub bill whose name has no matching tx
  // in the past 60 days.
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const recentNames = new Set(
    transactions.filter(tx => tx.date >= cutoffIso).map(tx => (tx.name || '').toUpperCase())
  );
  const unusedSub = subBills.find(b => !recentNames.has((b.name || '').toUpperCase()));

  // 4. Savings rate for current period: (income - expenses) / income.
  const periodIncome = periodTransactions.filter(x => x.amt > 0 && x.cat !== 'transfer')
    .reduce((s, x) => s + (x.ccy === 'USD' ? x.amt : x.amt * 1.08), 0);
  const periodExpense = total;
  const savingsRate = periodIncome > 0 ? ((periodIncome - periodExpense) / periodIncome) * 100 : null;
  // Compare to prior period.
  const prevIncome = previousPeriodTxs.filter(x => x.amt > 0 && x.cat !== 'transfer')
    .reduce((s, x) => s + (x.ccy === 'USD' ? x.amt : x.amt * 1.08), 0);
  const prevSavingsRate = prevIncome > 0 ? ((prevIncome - previousTotal) / prevIncome) * 100 : null;
  const savingsDelta = (savingsRate != null && prevSavingsRate != null) ? savingsRate - prevSavingsRate : null;

  const insights = [];
  if (topGrowth) {
    insights.push([growthLabel.toUpperCase(), '↑ ' + Math.round(topGrowth.pct) + '% VS ' + formatShortPeriodLabel(previousPeriod).slice(0, 3)]);
  }
  if (subBills.length > 0) {
    insights.push(['SUBS', subBills.length + ' ACTIVE · ' + fmtMoney(subTotal, t.currency, false) + ' / MO']);
  }
  if (unusedSub) {
    insights.push(['UNUSED', (unusedSub.name || '').toUpperCase() + ' · NOT SEEN 60D']);
  }
  if (savingsRate != null) {
    const arrow = savingsDelta == null ? '' : ' · ' + (savingsDelta >= 0 ? '▲ ' : '▼ ') + Math.abs(savingsDelta).toFixed(1) + 'PT';
    insights.push(['SAVINGS', savingsRate.toFixed(1) + '% RATE' + arrow]);
  }

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>{periodLabel}</div>
      </div>
      <ARule thick />
      <div style={{ padding: '12px 0 0' }}>
        <PeriodSwitcher compact />
      </div>
      <div style={{ padding: '14px 0' }}>
        <ALabel>[01] TOTAL · SPEND · {periodLabel}</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 6 }}>
          {fmtMoney(total, t.currency, t.decimals)}
        </div>
        <div style={{ fontSize: 11, marginTop: 2 }}>
          <span style={{ color: total - previousTotal > 0 ? A.neg : t.accent }}>{fmtSigned(total - previousTotal, t.currency, t.decimals)}</span>
          <span style={{ color: A.muted, marginLeft: 8 }}>VS · {formatShortPeriodLabel(previousPeriod)}</span>
        </div>
      </div>
      <ARule />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[02] INCOME · EXPENSES</ALabel>
        <div style={{ marginTop: 12 }}>
          <IncomeExpenseChart data={incomeExpense} height={120} accent={t.accent} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: A.muted, letterSpacing: 0.5, marginTop: 4 }}>
          {trendPeriods.map(p => <span key={p}>{formatShortPeriodLabel(p).slice(0, 3)}</span>)}
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[03] CATEGORY · TREND</ALabel>
        <div style={{ marginTop: 12 }}>
          <CategoryTrendChart rows={categoryTrend} periods={trendPeriods} height={120} accent={t.accent} />
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[04] NET WORTH · TREND</ALabel>
        <div style={{ marginTop: 12 }}>
          <LineChart data={netWorthTrend} height={110} stroke={t.accent} fill={t.accent} />
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[02] MONTH · OVER · MONTH</ALabel>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110, marginTop: 14 }}>
          {MOM_SPEND.map((v, i) => {
            const max = Math.max(...MOM_SPEND);
            const h = (v / max) * 100;
            const isCurrent = i === MOM_SPEND.length - 1;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: h, background: isCurrent ? t.accent : A.ink, opacity: isCurrent ? 1 : 0.85 }} />
                <div style={{ fontSize: 8, color: A.muted, letterSpacing: 0.4 }}>
                  {['JN','JL','AU','SE','OC','NO','DE','JA','FE','MR','AP','MY'][i]}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 8, letterSpacing: 1 }}>
          AVG · {fmtMoney(MOM_SPEND.reduce((s, v) => s + v, 0) / MOM_SPEND.length, t.currency, false)} / MO
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 4px' }}><ALabel>[03] TOP · CATEGORIES</ALabel></div>
      {cats.map(([k, v]) => {
        const c = categoryTree[k] || { label: k, glyph: '·' };
        return (
          <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12 }}>{c.glyph} {c.label}</div>
              <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoney(v, t.currency, t.decimals)} <span style={{ color: A.muted }}>· {total ? Math.round(v / total * 100) : 0}%</span>
              </div>
            </div>
            <div style={{ marginTop: 6, height: 4, background: A.rule2 }}>
              <div style={{ width: (v / maxCat * 100) + '%', height: '100%', background: t.accent }} />
            </div>
          </div>
        );
      })}
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 4px' }}><ALabel>[04] TOP · MERCHANTS</ALabel></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 30px 90px', borderTop: '1px solid ' + A.rule2 }}>
        {MERCHANTS.slice(0, 8).map((m, i) => (
          <React.Fragment key={i}>
            <div style={{ padding: '9px 0', fontSize: 12, borderBottom: '1px solid ' + A.rule2 }}>{m.name}</div>
            <div style={{ padding: '9px 0', fontSize: 10, color: A.muted, borderBottom: '1px solid ' + A.rule2, textAlign: 'center' }}>{m.n}×</div>
            <div style={{ padding: '9px 0', fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', borderBottom: '1px solid ' + A.rule2 }}>
              {fmtMoney(m.amt, t.currency, t.decimals)}
            </div>
          </React.Fragment>
        ))}
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[05] DETECTED · INSIGHTS</ALabel>
        {insights.length === 0 ? (
          <div style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 11, color: A.muted, letterSpacing: 1 }}>
            NOT ENOUGH DATA YET
          </div>
        ) : insights.map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 11 }}>
            <span style={{ letterSpacing: 1.2 }}>{k}</span>
            <span style={{ color: A.muted, letterSpacing: 0.6 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Reports Calendar ──────────────────────────────────────────────────────────
export function ReportsCalendar({ t, onBack }) {
  const { periodTransactions, selectedPeriod, periodLabel } = useStore();
  const dayCount = getDaysInPeriod(selectedPeriod);
  const cells = Array.from({ length: dayCount }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return periodTransactions
      .filter(x => x.date === `${selectedPeriod}-${day}` && x.amt < 0)
      .reduce((s, x) => s + Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08), 0);
  });
  const max = Math.max(...cells, 1);
  const total = cells.reduce((a, b) => a + b, 0);

  // Weekday breakdown: spend per day-of-week (MON..SUN), absolute values.
  const weekdayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  for (const tx of periodTransactions) {
    if (tx.amt >= 0 || !tx.date) continue;
    const d = new Date(`${tx.date}T00:00:00`);
    // Date.getDay(): 0 = Sunday. Re-map so Mon = 0 ... Sun = 6.
    const dow = (d.getDay() + 6) % 7;
    weekdayTotals[dow] += Math.abs(tx.ccy === 'USD' ? tx.amt : tx.amt * 1.08);
  }
  const maxWeekday = Math.max(...weekdayTotals, 1);

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>{periodLabel}</div>
      </div>
      <ARule thick />
      <div style={{ padding: '12px 0 0' }}>
        <PeriodSwitcher compact />
      </div>
      <div style={{ padding: '14px 0' }}>
        <ALabel>SPEND · CALENDAR · {periodLabel}</ALabel>
        <div style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 6 }}>{fmtMoney(total, t.currency, t.decimals)}</div>
        <div style={{ fontSize: 10, color: A.muted, letterSpacing: 1, marginTop: 2 }}>{fmtMoney(total / dayCount, t.currency, false)} / DAY · AVG</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ fontSize: 9, color: A.muted, letterSpacing: 1, textAlign: 'center', paddingBottom: 4 }}>{d}</div>
          ))}
          {cells.map((v, i) => {
            const intensity = v / max;
            return (
              <div key={i} style={{
                aspectRatio: '1',
                background: v === 0 ? A.rule2 : `color-mix(in oklch, ${t.accent} ${Math.max(15, intensity * 100)}%, ${A.bg})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 9, color: intensity > 0.5 ? A.bg : A.ink, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
      <ARule style={{ marginTop: 18 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>BY · WEEKDAY</ALabel>
        {weekdayLabels.map((day, i) => {
          const v = weekdayTotals[i];
          return (
            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.4, width: 30 }}>{day}</div>
              <div style={{ flex: 1, height: 4, background: A.rule2 }}>
                <div style={{ width: (v / maxWeekday * 100) + '%', height: '100%', background: t.accent }} />
              </div>
              <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', width: 80, textAlign: 'right' }}>{fmtMoney(v, t.currency, t.decimals)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Credit Card Detail ────────────────────────────────────────────────────────
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

export function CCDetail({ t, acct, onBack }) {
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
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>{a.name || 'CC'}{a.code ? ' · ' + a.code : ''}</div>
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

// ── Goal Detail ───────────────────────────────────────────────────────────────
export function GoalDetail({ t, goalId = 'g1', goal, onBack }) {
  const { goals, goalContributions, contributeToGoal, accountsWithBalance, selectedPeriod } = useStore();
  const actualGoalId = goal || goalId;
  const g = goals.find(x => x.id === actualGoalId) || goals[0];
  const [contribAmt, setContribAmt] = React.useState('');
  const [acct, setAcct] = React.useState(accountsWithBalance.find(a => a.type === 'SAV')?.id || accountsWithBalance[0]?.id || 'chk');
  const defaultDay = Math.min(new Date().getDate(), getDaysInPeriod(selectedPeriod));
  const defaultDate = `${selectedPeriod}-${String(defaultDay).padStart(2, '0')}`;
  const pct = g.current / g.target;
  const monthly = 800;
  const remaining = g.target - g.current;
  const monthsLeft = Math.ceil(remaining / monthly);
  const projection = Array.from({ length: 12 }, (_, i) => Math.min(g.current + monthly * i, g.target));
  const contributions = goalContributions
    .filter(c => c.goalId === g.id)
    .sort((a, b) => b.date.localeCompare(a.date));
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
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>GOAL · {g.id.toUpperCase()}</div>
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
        <ADetailCell label="ETA" val={monthsLeft + ' MO'} c={t.accent} />
        <ADetailCell label="OPENED" val="JAN 2024" />
        <ADetailCell label="ON TRACK" val="YES" c={t.accent} />
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
    </div>
  );
}

// ── Bills Hub ─────────────────────────────────────────────────────────────────
const FREQ_SHORT = { monthly: 'MONTHLY', weekly: 'WEEKLY', biweekly: 'BI-WEEKLY', annual: 'ANNUAL', custom: 'CUSTOM' };

export function BillsHub({ t, onBack }) {
  const { accountsWithBalance: accts, billRows, markRecurringPaid, bills } = useStore();
  const [showForm, setShowForm] = React.useState(false);
  const [editRule, setEditRule] = React.useState(null);

  const expenseRows = billRows.filter(b => b.type !== 'income');
  const monthly = expenseRows.reduce((s, b) => s + b.amt, 0);
  const paid    = expenseRows.filter(b => b.status === 'paid').reduce((s, b) => s + b.amt, 0);

  const timeline = Array.from({ length: 30 }, (_, i) =>
    billRows.filter(b => Number(b.dueDate.slice(8, 10)) === i + 1)
  );

  const openEditForm = ruleId => {
    const rule = bills.find(b => b.id === ruleId);
    setEditRule(rule || null);
    setShowForm(true);
  };

  return (
    <>
      {showForm && (
        <RecurringFormSheet
          t={t}
          onClose={() => { setShowForm(false); setEditRule(null); }}
          editRule={editRule}
        />
      )}

      <div style={{ padding: '0 18px 20px' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
          <button onClick={() => { setEditRule(null); setShowForm(true); }} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>+ ADD</button>
        </div>
        <ARule thick />

        <div style={{ padding: '14px 0 8px' }}>
          <ALabel>[01] MONTHLY · EXPENSES</ALabel>
          <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>{fmtMoney(paid, t.currency, t.decimals)}</div>
          <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>{fmtMoney(monthly, t.currency, false)} TOTAL · {expenseRows.length} THIS PERIOD</div>
        </div>

        <ARule />

        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[02] NEXT · 30 · DAYS</ALabel>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: 2 }}>
            {timeline.map((day, i) => {
              const total = day.reduce((s, b) => s + b.amt, 0);
              const has = day.length > 0;
              return (
                <div key={i} style={{
                  height: 36, background: has ? t.accent : A.rule2,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                  paddingBottom: 2, opacity: has ? Math.min(1, 0.4 + (total / 2500)) : 1,
                }}>
                  {has && <div style={{ fontSize: 8, color: A.bg, fontWeight: 700 }}>{day.length}</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6, letterSpacing: 1 }}>
            <span>1</span><span>10</span><span>20</span><span>30</span>
          </div>
        </div>

        <ARule style={{ marginTop: 14 }} />

        <div style={{ padding: '14px 0 0' }}>
          <ALabel>[03] RECURRING · {billRows.length} THIS PERIOD</ALabel>
          {billRows.map(b => {
            const isIncome = b.type === 'income';
            const amtColor = isIncome ? t.accent : (b.status === 'paid' ? A.muted : A.neg);
            return (
              <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid ' + A.rule2, opacity: b.status === 'paid' ? 0.58 : 1 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', width: 30, color: b.status === 'paid' ? t.accent : b.status === 'upcoming' ? A.ink : A.neg, letterSpacing: -0.5, flexShrink: 0 }}>
                    {b.dueDate.slice(8)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                    <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 2 }}>
                      {accts.find(a => a.id === b.acct)?.code} · {FREQ_SHORT[b.freq] || 'MONTHLY'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: amtColor }}>
                      {isIncome ? '↑' : ''}{fmtMoney(b.amt, t.currency, t.decimals)}
                    </div>
                  </div>
                  {b.status === 'paid'
                    ? <div style={{ fontSize: 10, color: t.accent, letterSpacing: 1, minWidth: 36, textAlign: 'right' }}>PAID</div>
                    : (
                      <button onClick={() => markRecurringPaid(b, b.dueDate)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1, padding: '5px 8px', background: A.ink, color: A.bg }}>
                        PAY
                      </button>
                    )
                  }
                  <button onClick={() => openEditForm(b.id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: A.muted }}>✎</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// -- Alerts -----------------------------------------------------------------
const ALERT_SEVERITY_LABEL = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'WATCH',
  low: 'INFO',
};

function alertSeverityColor(severity, accent) {
  if (severity === 'critical') return A.neg;
  if (severity === 'high') return A.ink;
  if (severity === 'medium') return accent;
  return A.muted;
}

export function AlertsHub({ t, onBack, onNavigate }) {
  const { alertRows, dismissAlert, restoreAlerts } = useStore();

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <button onClick={restoreAlerts} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>RESTORE</button>
      </div>
      <ARule thick />

      <div style={{ padding: '14px 0 8px' }}>
        <ALabel>[01] ALERTS</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>{alertRows.length}</div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>ACTIVE NOTIFICATIONS</div>
      </div>

      <ARule />

      <div style={{ padding: '10px 0 0' }}>
        {alertRows.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: 11, color: A.muted, letterSpacing: 1 }}>NO ACTIVE ALERTS</div>
        ) : alertRows.map(alert => (
          <div key={alert.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <button onClick={() => onNavigate(alert.route)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: alertSeverityColor(alert.severity, t.accent), letterSpacing: 1.2 }}>
                    {ALERT_SEVERITY_LABEL[alert.severity] || alert.severity.toUpperCase()} · {alert.kind.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.title}</div>
                  <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 3 }}>{alert.detail}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {typeof alert.metric === 'number' ? fmtMoney(alert.metric, t.currency, t.decimals) : alert.metric}
                  </div>
                  <div style={{ fontSize: 9, color: t.accent, letterSpacing: 1, marginTop: 5 }}>{alert.action}</div>
                </div>
              </div>
            </button>
            <button onClick={() => dismissAlert(alert.id)} style={{ all: 'unset', cursor: 'pointer', marginTop: 8, fontSize: 10, letterSpacing: 1, color: A.muted }}>
              DISMISS
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
const SETTINGS_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];

export function Settings({ t, onBack, onNavigate, setAccent, setDensity, setDecimals, setCurrency }) {
  const { budgetStartDay, setBudgetStartDay, reset } = useStore();
  const [showIO, setShowIO] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [editingDay, setEditingDay] = React.useState(false);
  const [dayInput, setDayInput] = React.useState(String(budgetStartDay));
  const resetTimerRef = React.useRef(null);

  React.useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const cycleCurrency = () => {
    const idx = SETTINGS_CURRENCIES.indexOf(t.currency);
    setCurrency(SETTINGS_CURRENCIES[(idx + 1) % SETTINGS_CURRENCIES.length]);
  };

  const commitDay = () => {
    const v = Math.max(1, Math.min(28, parseInt(dayInput, 10) || 1));
    setDayInput(String(v));
    setBudgetStartDay(v);
    setEditingDay(false);
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      resetTimerRef.current = setTimeout(() => setConfirmReset(false), 3000);
    } else {
      clearTimeout(resetTimerRef.current);
      reset();
      onBack();
    }
  };

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>v1.0</div>
      </div>
      <ARule thick />

      {/* DISPLAY */}
      <div style={{ marginTop: 14 }}>
        <ALabel>DISPLAY</ALabel>
        <div style={{ marginTop: 6 }}>
          <div style={{ padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ fontSize: 10, color: A.muted, marginBottom: 8, letterSpacing: 0.6 }}>ACCENT COLOR</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {ACCENTS.map(a => (
                <button key={a.val} onClick={() => setAccent(a.val)} style={{
                  all: 'unset', cursor: 'pointer',
                  width: 18, height: 18, background: a.val,
                  border: t.accent === a.val ? '2px solid ' + A.ink : '1px solid ' + A.rule2,
                }} />
              ))}
            </div>
          </div>
          <button onClick={() => setDensity(t.density === 'comfortable' ? 'compact' : 'comfortable')}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>DENSITY</span>
              <span style={{ fontSize: 11, color: A.muted }}>{t.density.toUpperCase()}</span>
            </div>
          </button>
          <button onClick={() => setDecimals(!t.decimals)}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>DECIMALS</span>
              <span style={{ fontSize: 11, color: A.muted }}>{t.decimals ? 'SHOW' : 'HIDE'}</span>
            </div>
          </button>
          <button onClick={cycleCurrency}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>CURRENCY</span>
              <span style={{ fontSize: 11, color: A.muted }}>{t.currency}</span>
            </div>
          </button>
        </div>
      </div>

      {/* BUDGETS */}
      <div style={{ marginTop: 14 }}>
        <ALabel>BUDGETS</ALabel>
        <div style={{ marginTop: 6 }}>
          {editingDay ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>BUDGET · START DAY</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  autoFocus
                  type="number" min="1" max="28"
                  value={dayInput}
                  onChange={e => setDayInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitDay(); if (e.key === 'Escape') setEditingDay(false); }}
                  style={{ all: 'unset', width: 32, fontSize: 11, textAlign: 'right', borderBottom: '1px solid ' + A.ink, color: A.ink }}
                />
                <button onClick={commitDay} style={{ all: 'unset', cursor: 'pointer', fontSize: 14, color: t.accent }}>✓</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setDayInput(String(budgetStartDay)); setEditingDay(true); }}
              style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <span style={{ fontSize: 12 }}>BUDGET · START DAY</span>
                <span style={{ fontSize: 11, color: A.muted }}>DAY {budgetStartDay}</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* DATA */}
      <div style={{ marginTop: 14 }}>
        <ALabel>DATA</ALabel>
        <div style={{ marginTop: 6 }}>
          <button onClick={() => onNavigate('categories')}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>CATEGORIES</span>
              <span style={{ fontSize: 11, color: A.muted }}>EDIT ▸</span>
            </div>
          </button>
          <button onClick={() => setShowIO(true)}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>IMPORT · EXPORT</span>
              <span style={{ fontSize: 11, color: A.muted }}>⇅</span>
            </div>
          </button>
          <button onClick={handleReset}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: t.density === 'compact' ? '9px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
              <span style={{ fontSize: 12 }}>RESET ALL DATA</span>
              <span style={{ fontSize: 11, color: confirmReset ? A.neg : A.muted }}>
                {confirmReset ? 'TAP AGAIN ↩' : 'RESET ▸'}
              </span>
            </div>
          </button>
        </div>
      </div>

      {showIO && <ImportExport onClose={() => setShowIO(false)} />}
    </div>
  );
}

// ── Categories Editor ─────────────────────────────────────────────────────────
export function CategoriesEditor({ t, onBack }) {
  const { categoryTree, addCategory } = useStore();
  const [expanded, setExpanded] = React.useState({ edu: true, 'edu.school': true, 'edu.school.supplies': true });
  const [adding, setAdding] = React.useState(null);
  const [newName, setNewName] = React.useState('');

  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const renderNode = (key, node, path, depth) => {
    const id = path.join('.');
    const children = node.children || {};
    const hasKids = Object.keys(children).length > 0;
    const isOpen = expanded[id];
    return (
      <div key={id}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 0', paddingLeft: depth * 16, borderBottom: '1px solid ' + A.rule2 }}>
          <button onClick={() => hasKids ? toggle(id) : null}
            style={{ all: 'unset', cursor: hasKids ? 'pointer' : 'default', width: 18, color: A.ink2, fontSize: 12 }}>
            {hasKids ? (isOpen ? '−' : '+') : '·'}
          </button>
          <span style={{ fontSize: 12, letterSpacing: depth === 0 ? 1.2 : 0.4, fontWeight: depth === 0 ? 600 : 400, color: A.ink, flex: 1 }}>
            {node.glyph ? node.glyph + ' ' : ''}{node.label || key}
          </span>
          <button onClick={() => setAdding(id)}
            style={{ all: 'unset', cursor: 'pointer', width: 24, height: 20, textAlign: 'center', fontSize: 14, color: A.muted, marginLeft: 6 }}>+</button>
        </div>
        {adding === id && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 0', paddingLeft: (depth + 1) * 16, borderBottom: '1px solid ' + A.rule2, background: A.bg }}>
            <span style={{ fontSize: 11, color: A.muted, alignSelf: 'center', letterSpacing: 1 }}>›</span>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="NEW · CATEGORY"
              onKeyDown={e => {
                if (e.key === 'Enter' && newName.trim()) {
                  addCategory(path, newName.trim().toUpperCase());
                  setExpanded(e => ({ ...e, [id]: true }));
                  setNewName(''); setAdding(null);
                }
                if (e.key === 'Escape') { setNewName(''); setAdding(null); }
              }}
              style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '2px 0', color: A.ink, letterSpacing: 0.8 }}
            />
            <button onClick={() => { setNewName(''); setAdding(null); }}
              style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted }}>×</button>
          </div>
        )}
        {isOpen && Object.entries(children).map(([k, n]) => renderNode(k, n, [...path, k], depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>SETTINGS</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0 8px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>CATEGORIES</div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 4, lineHeight: 1.6 }}>
          NEST AS DEEP AS YOU NEED. TAP <span style={{ color: A.ink }}>+</span> ON ANY ROW TO ADD A SUB-CATEGORY.
        </div>
      </div>
      <ARule />
      <div style={{ marginTop: 4 }}>
        {Object.entries(categoryTree).map(([k, n]) => renderNode(k, n, [k], 0))}
      </div>
      {adding === '__root__' ? (
        <div style={{ display: 'flex', gap: 8, padding: '12px', marginTop: 16, border: '1.5px dashed ' + A.ink, background: A.bg }}>
          <span style={{ fontSize: 11, color: A.muted, alignSelf: 'center', letterSpacing: 1 }}>›</span>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="NEW · TOP · LEVEL · CATEGORY"
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) {
                addCategory([], newName.trim().toUpperCase());
                setNewName(''); setAdding(null);
              }
              if (e.key === 'Escape') { setNewName(''); setAdding(null); }
            }}
            style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '2px 0', color: A.ink, letterSpacing: 0.8 }}
          />
          <button onClick={() => { setNewName(''); setAdding(null); }}
            style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted }}>×</button>
        </div>
      ) : (
        <button onClick={() => setAdding('__root__')}
          style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 16, padding: '12px', border: '1.5px dashed ' + A.ink, fontSize: 10, color: A.muted, letterSpacing: 1, textAlign: 'center' }}>
          + ADD · TOP · LEVEL · CATEGORY
        </button>
      )}
    </div>
  );
}
