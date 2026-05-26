import React from 'react';
import { A } from '../../theme';
import { ALabel, ARule, CategoryTrendChart, IncomeExpenseChart, LineChart } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import { fmtMoney, fmtSigned } from '../../data';
import { useStore } from '../../store';
import { useFx } from '../../useFx';
import { exportReportCSV } from '../../importExport';
import RangeSelector from '../../components/RangeSelector';
import { addMonths, filterTransactionsForPeriod, filterTransactionsForRange, formatShortPeriodLabel, resolveRangePreset } from '../../period.mjs';
import { buildCategoryTrend, buildIncomeExpenseSeries, buildNetWorthTrend, getRecentPeriods } from '../../charts.mjs';

export default function Reports({ t, onBack, onGoToRoute }) {
  const { transactions, periodTransactions, categoryTree, selectedPeriod, setSelectedPeriod, periodLabel, accounts, bills, rates, txFilter, setTxFilter, savedViews, addView, updateView, deleteView } = useStore();
  const { toReporting } = useFx(t.currency || 'USD');
  const drillTo = (filter) => {
    if (!onGoToRoute) return;
    setTxFilter(filter || null);
    onGoToRoute('tx');
  };
  const [range, setRange] = React.useState({ kind: 'preset', preset: 'thisMonth' });
  const [selectedViewId, setSelectedViewId] = React.useState('');
  const isMonthRange = range.kind === 'preset' && (range.preset === 'thisMonth' || range.preset === 'lastMonth');
  const useRange = range.kind === 'custom' || (range.preset !== 'thisMonth' && range.preset !== 'lastMonth');
  const resolved = range.kind === 'custom' ? { start: range.start, end: range.end, label: `${range.start} → ${range.end}` } : resolveRangePreset(range.preset);
  const rangeTxs = React.useMemo(() => useRange ? filterTransactionsForRange(transactions, resolved?.start, resolved?.end) : null, [useRange, transactions, resolved?.start, resolved?.end]);
  const reportTxs = useRange ? rangeTxs : periodTransactions;
  const heroLabel = useRange ? (resolved?.label || 'CUSTOM') : periodLabel;

  const txViews = React.useMemo(() => (savedViews || []).filter(view => view.scope === 'reports'), [savedViews]);
  const selectedView = React.useMemo(() => txViews.find(view => view.id === selectedViewId) || null, [txViews, selectedViewId]);
  const applySavedView = React.useCallback((view) => {
    if (!view) return;
    if (view.period) setSelectedPeriod(view.period);
    if (view.range) setRange(view.range);
    setTxFilter(view.txFilter || null);
  }, [setSelectedPeriod, setTxFilter]);
  const onSavedViewChange = React.useCallback((e) => {
    const id = e.target.value;
    setSelectedViewId(id);
    applySavedView(txViews.find(view => view.id === id));
  }, [applySavedView, txViews]);
  const saveCurrentView = React.useCallback(() => {
    const raw = window.prompt('Save current view as');
    if (!raw) return;
    const name = raw.trim();
    if (!name) return;
    addView({ scope: 'reports', name, period: selectedPeriod, range, txFilter });
  }, [addView, selectedPeriod, range, txFilter]);
  const renameSelectedView = React.useCallback(() => {
    if (!selectedView) return;
    const raw = window.prompt('Rename view', selectedView.name);
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;
    try {
      updateView(selectedView.id, { name });
    } catch (err) {
      if (err && err.message === 'LEDGER_DUPLICATE_VIEW_NAME') {
        window.alert(`A view named "${name}" already exists.`);
        return;
      }
      throw err;
    }
  }, [selectedView, updateView]);
  const updateSelectedView = React.useCallback(() => {
    if (!selectedView) return;
    updateView(selectedView.id, { period: selectedPeriod, range, txFilter });
  }, [selectedView, selectedPeriod, range, txFilter, updateView]);
  const deleteSelectedView = React.useCallback(() => {
    if (!selectedView) return;
    if (!window.confirm(`Delete view "${selectedView.name}"?`)) return;
    deleteView(selectedView.id);
    setSelectedViewId('');
  }, [deleteView, selectedView]);

  const handleExport = () => {
    const csv = exportReportCSV({
      rangeLabel: heroLabel,
      transactions: reportTxs,
      byCategory: cats,
      topMerchants: topMerchants,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `ledger-report-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const previousPeriod = addMonths(selectedPeriod, -1);
  const previousPeriodTxs = filterTransactionsForPeriod(transactions, previousPeriod);
  const previousTotal = previousPeriodTxs.filter(x => x.amt < 0)
    .reduce((s, x) => s + Math.abs(toReporting(x.amt, x.ccy)), 0);
  const total = reportTxs.filter(x => x.amt < 0)
    .reduce((s, x) => s + Math.abs(toReporting(x.amt, x.ccy)), 0);
  const byCat = {};
  reportTxs.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    byCat[k] = (byCat[k] || 0) + Math.abs(toReporting(x.amt, x.ccy));
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = cats[0] ? cats[0][1] : 1;

  // Top merchants computed from reportTxs (matches WebReports).
  const merchantMap = {};
  reportTxs.filter(x => x.amt < 0).forEach(tx => {
    const key = (tx.name || '').split(' · ')[0];
    if (!key) return;
    const curr = merchantMap[key] || { name: key, amt: 0, n: 0 };
    curr.amt += Math.abs(toReporting(tx.amt, tx.ccy));
    curr.n += 1;
    merchantMap[key] = curr;
  });
  const topMerchants = Object.values(merchantMap)
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 8);
  const trendPeriods = getRecentPeriods(selectedPeriod, 6);
  const incomeExpense = buildIncomeExpenseSeries(transactions, trendPeriods, rates);
  const categoryTrend = buildCategoryTrend(transactions, trendPeriods, 4, rates);
  const netWorthTrend = buildNetWorthTrend(accounts, transactions, trendPeriods, rates);

  // Rolling 12-month spend (absolute expense totals, USD-normalized).
  const momPeriods = getRecentPeriods(selectedPeriod, 12);
  const momSpend = momPeriods.map(p => filterTransactionsForPeriod(transactions, p)
    .filter(x => x.amt < 0)
    .reduce((s, x) => s + Math.abs(toReporting(x.amt, x.ccy)), 0));
  const momMax = Math.max(...momSpend, 1);
  const momAvg = momSpend.reduce((s, v) => s + v, 0) / momSpend.length;

  // ── Detected Insights ────────────────────────────────────────────────────
  // 1. Top-growing category vs previous period (largest absolute increase).
  const prevByCat = {};
  previousPeriodTxs.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    prevByCat[k] = (prevByCat[k] || 0) + Math.abs(toReporting(x.amt, x.ccy));
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
  const periodIncome = reportTxs.filter(x => x.amt > 0 && x.cat !== 'transfer')
    .reduce((s, x) => s + toReporting(x.amt, x.ccy), 0);
  const periodExpense = total;
  const savingsRate = periodIncome > 0 ? ((periodIncome - periodExpense) / periodIncome) * 100 : null;
  // Compare to prior period.
  const prevIncome = previousPeriodTxs.filter(x => x.amt > 0 && x.cat !== 'transfer')
    .reduce((s, x) => s + toReporting(x.amt, x.ccy), 0);
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
        {isMonthRange && range.preset === 'thisMonth' && <PeriodSwitcher compact />}
        <div style={{ marginTop: 8 }}>
          <RangeSelector range={range} onChange={setRange} t={t} />
        </div>
      </div>
      <div style={{ padding: '10px 0 2px' }}>
        <div style={{ marginBottom: 6 }}><ALabel>[00] SAVED · VIEWS</ALabel></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select aria-label="Views" value={selectedViewId} onChange={onSavedViewChange} style={{
            fontFamily: A.font, fontSize: 11, padding: '6px 10px', border: '1px solid ' + A.rule2,
            background: A.bg, color: A.ink, letterSpacing: 1, minWidth: 132,
          }}>
            <option value="">Views…</option>
            {txViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select>
          <button onClick={saveCurrentView} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
            padding: '6px 12px', border: '1px solid ' + A.ink, background: A.ink, color: A.bg,
          }}>SAVE CURRENT VIEW</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <button onClick={renameSelectedView} disabled={!selectedView} style={{
            all: 'unset', cursor: selectedView ? 'pointer' : 'not-allowed', fontSize: 10, letterSpacing: 1.2,
            padding: '6px 12px', border: '1px solid ' + (selectedView ? A.rule2 : A.rule3),
            color: selectedView ? A.ink : A.muted,
          }}>RENAME VIEW</button>
          <button onClick={updateSelectedView} disabled={!selectedView} style={{
            all: 'unset', cursor: selectedView ? 'pointer' : 'not-allowed', fontSize: 10, letterSpacing: 1.2,
            padding: '6px 12px', border: '1px solid ' + (selectedView ? A.rule2 : A.rule3),
            color: selectedView ? A.ink : A.muted,
          }}>UPDATE FROM CURRENT FILTERS</button>
          <button onClick={deleteSelectedView} disabled={!selectedView} style={{
            all: 'unset', cursor: selectedView ? 'pointer' : 'not-allowed', fontSize: 10, letterSpacing: 1.2,
            padding: '6px 12px', border: '1px solid ' + (selectedView ? A.neg : A.rule3),
            color: selectedView ? A.neg : A.muted,
          }}>DELETE VIEW</button>
        </div>
      </div>
      <div style={{ padding: '14px 0' }}>
        <ALabel>[01] TOTAL · SPEND · {heroLabel}</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 6 }}>
          {fmtMoney(total, t.currency, t.decimals)}
        </div>
        {!useRange && (
          <div style={{ fontSize: 11, marginTop: 2 }}>
            <span style={{ color: total - previousTotal > 0 ? A.neg : t.accent }}>{fmtSigned(total - previousTotal, t.currency, t.decimals)}</span>
            <span style={{ color: A.muted, marginLeft: 8 }}>VS · {formatShortPeriodLabel(previousPeriod)}</span>
          </div>
        )}
        {useRange && (
          <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>
            {reportTxs.length} TXS IN RANGE
          </div>
        )}
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
          <CategoryTrendChart rows={categoryTrend} periods={trendPeriods} height={120} accent={t.accent} categoryTree={categoryTree} />
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
        <ALabel>[05] MONTH · OVER · MONTH</ALabel>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110, marginTop: 14 }}>
          {momSpend.map((v, i) => {
            const h = (v / momMax) * 100;
            const isCurrent = i === momSpend.length - 1;
            const period = momPeriods[i]; // 'YYYY-MM'
            const monthIdx = parseInt(period.slice(5, 7), 10) - 1;
            const monthShort = ['JA','FE','MR','AP','MY','JN','JL','AU','SE','OC','NO','DE'][monthIdx] || '';
            return (
              <div key={period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: h, background: isCurrent ? t.accent : A.ink, opacity: isCurrent ? 1 : 0.85 }} />
                <div style={{ fontSize: 8, color: A.muted, letterSpacing: 0.4 }}>{monthShort}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 8, letterSpacing: 1 }}>
          AVG · {fmtMoney(momAvg, t.currency, false)} / MO
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 4px' }}><ALabel>[06] TOP · CATEGORIES</ALabel></div>
      {cats.map(([k, v]) => {
        const c = categoryTree[k] || { label: k, glyph: '·' };
        return (
          <button key={k}
            onClick={() => drillTo({ category: k, type: 'expense' })}
            style={{
              all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
              cursor: 'pointer', padding: '10px 0', borderBottom: '1px solid ' + A.rule2,
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12 }}>{c.glyph} {c.label}</div>
              <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoney(v, t.currency, t.decimals)} <span style={{ color: A.muted }}>· {total ? Math.round(v / total * 100) : 0}%</span>
              </div>
            </div>
            <div style={{ marginTop: 6, height: 4, background: A.rule2 }}>
              <div style={{ width: (v / maxCat * 100) + '%', height: '100%', background: t.accent }} />
            </div>
          </button>
        );
      })}
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 4px' }}><ALabel>[07] TOP · MERCHANTS</ALabel></div>
      {topMerchants.length === 0 ? (
        <div style={{ padding: '12px 0', fontSize: 11, color: A.muted, letterSpacing: 1, borderBottom: '1px solid ' + A.rule2 }}>
          NO MERCHANTS THIS PERIOD
        </div>
      ) : (
        <div style={{ borderTop: '1px solid ' + A.rule2 }}>
          {topMerchants.map((m, i) => (
            <button key={i}
              onClick={() => drillTo({ merchant: m.name })}
              style={{
                all: 'unset', cursor: 'pointer', display: 'grid',
                gridTemplateColumns: '1fr 30px 90px',
                width: '100%', boxSizing: 'border-box',
                padding: '9px 0', borderBottom: '1px solid ' + A.rule2,
                alignItems: 'center',
              }}>
              <div style={{ fontSize: 12 }}>{m.name}</div>
              <div style={{ fontSize: 10, color: A.muted, textAlign: 'center' }}>{m.n}×</div>
              <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                {fmtMoney(m.amt, t.currency, t.decimals)}
              </div>
            </button>
          ))}
        </div>
      )}
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[08] DETECTED · INSIGHTS</ALabel>
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
