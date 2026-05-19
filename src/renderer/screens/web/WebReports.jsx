import React from 'react';
import { A } from '../../theme';
import { ALabel, CategoryTrendChart, IncomeExpenseChart, LineChart } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import RangeSelector from '../../components/RangeSelector';
import WebShell from './WebShell';
import { fmtMoney, fmtSigned } from '../../data';
import { useStore } from '../../store';
import { addMonths, filterTransactionsForPeriod, filterTransactionsForRange, formatShortPeriodLabel, getDaysInPeriod, resolveRangePreset } from '../../period.mjs';
import {
  buildCategoryTrend,
  buildIncomeExpenseSeries,
  buildNetWorthTrend,
  getRecentPeriods,
} from '../../charts.mjs';
import { exportReportCSV } from '../../importExport';

function spendAmount(tx) {
  return Math.abs(tx.ccy === 'USD' ? tx.amt : tx.amt * 1.08);
}

function spendTotal(transactions) {
  return transactions.filter(x => x.amt < 0).reduce((s, x) => s + spendAmount(x), 0);
}

function downloadFile(name, content, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function WebReports({ t, onNavigate, onAdd }) {
  const { transactions, periodTransactions, categoryTree, selectedPeriod, periodLabel, accounts, setTxFilter } = useStore();

  const [range, setRange] = React.useState({ kind: 'preset', preset: 'thisMonth' });
  const isMonthRange = range.kind === 'preset' && (range.preset === 'thisMonth' || range.preset === 'lastMonth');
  const resolved = range.kind === 'custom' ? { start: range.start, end: range.end, label: `${range.start} → ${range.end}` } : resolveRangePreset(range.preset);
  const useRange = range.kind === 'custom' || (range.preset !== 'thisMonth' && range.preset !== 'lastMonth');

  // Source transactions for the report. When a range overrides the period,
  // periodTransactions is bypassed.
  const rangeTxs = React.useMemo(() => {
    if (!useRange) return null;
    return filterTransactionsForRange(transactions, resolved?.start, resolved?.end);
  }, [useRange, transactions, resolved?.start, resolved?.end]);
  const reportTxs = useRange ? rangeTxs : periodTransactions;
  const heroLabel = useRange ? (resolved?.label || 'CUSTOM') : periodLabel;

  const total = spendTotal(reportTxs);
  const previousPeriod = addMonths(selectedPeriod, -1);
  const previousTotal = spendTotal(filterTransactionsForPeriod(transactions, previousPeriod));
  const trendPeriods = getRecentPeriods(selectedPeriod, 6);
  const incomeExpense = buildIncomeExpenseSeries(transactions, trendPeriods);
  const netWorthTrend = buildNetWorthTrend(accounts, transactions, trendPeriods);
  const categoryTrend = buildCategoryTrend(transactions, trendPeriods, 5);

  const drillTo = React.useCallback((filter) => {
    setTxFilter(filter || null);
    onNavigate('tx');
  }, [setTxFilter, onNavigate]);

  const handleExport = React.useCallback(() => {
    const csv = exportReportCSV({
      rangeLabel: heroLabel,
      transactions: reportTxs,
      byCategory: cats,
      topMerchants: merchants,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`ledger-report-${stamp}.csv`, csv);
  }, [heroLabel, reportTxs, cats, merchants]);

  const byCat = {};
  reportTxs.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    byCat[k] = (byCat[k] || 0) + spendAmount(x);
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0] ? cats[0][1] : 1;

  const dayCount = getDaysInPeriod(selectedPeriod);
  const cells = Array.from({ length: dayCount }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return periodTransactions
      .filter(x => x.date === `${selectedPeriod}-${day}` && x.amt < 0)
      .reduce((s, x) => s + spendAmount(x), 0);
  });
  const cellMax = Math.max(...cells, 1);

  const merchantMap = {};
  reportTxs.filter(x => x.amt < 0).forEach(tx => {
    const key = tx.name.split(' · ')[0];
    const curr = merchantMap[key] || { name: key, amt: 0, n: 0 };
    curr.amt += spendAmount(tx);
    curr.n += 1;
    merchantMap[key] = curr;
  });
  const merchants = Object.values(merchantMap).sort((a, b) => b.amt - a.amt).slice(0, 8);

  return (
    <WebShell active="reports" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <ALabel>[01] REPORTS · {heroLabel}</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(total, t.currency, t.decimals)}
            {!useRange && (
              <span style={{ fontSize: 18, color: total - previousTotal > 0 ? A.neg : t.accent }}>
                {' '}{fmtSigned(total - previousTotal, t.currency, false)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 6, letterSpacing: 1 }}>
            {useRange
              ? `${reportTxs.length} TXS IN RANGE`
              : `SPENT · VS · ${formatShortPeriodLabel(previousPeriod)} · ${fmtMoney(previousTotal, t.currency, false)}`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 6 }} data-print-hide>
            <button onClick={handleExport} style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
              padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
            }}>EXPORT · CSV</button>
            <button onClick={() => window.print()} style={{
              all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
              padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
            }}>PRINT</button>
          </div>
          <RangeSelector range={range} onChange={setRange} t={t} />
          {isMonthRange && range.preset === 'thisMonth' && <PeriodSwitcher />}
        </div>
      </div>

      <div style={{ marginTop: 24, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
        <ALabel>[02] INCOME · EXPENSES · NET</ALabel>
        <div style={{ marginTop: 14 }}>
          <IncomeExpenseChart data={incomeExpense} accent={t.accent} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, letterSpacing: 1, marginTop: 6 }}>
          {trendPeriods.map(p => <span key={p}>{formatShortPeriodLabel(p)}</span>)}
        </div>
      </div>

      <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32 }}>
        <div>
          <ALabel>[03] SPEND · BY · CATEGORY · TREND</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, paddingTop: 14 }}>
            <CategoryTrendChart rows={categoryTrend} periods={trendPeriods} accent={t.accent} />
          </div>
          <div style={{ marginTop: 12, borderTop: '1px solid ' + A.rule2 }}>
            {cats.map(([k, v]) => {
              const c = categoryTree[k] || { label: k, glyph: '·' };
              return (
                <button key={k}
                  onClick={() => drillTo({ category: k, type: 'expense' })}
                  title={`Show ${c.label} transactions`}
                  style={{
                    all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
                    cursor: 'pointer', padding: '11px 0', borderBottom: '1px solid ' + A.rule2,
                  }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 80px 60px', alignItems: 'center', gap: 8 }}>
                    <div style={{ color: t.accent }}>{c.glyph}</div>
                    <div style={{ fontSize: 12 }}>{c.label}</div>
                    <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{fmtMoney(v, t.currency, t.decimals)}</div>
                    <div style={{ fontSize: 10, color: A.muted, textAlign: 'right' }}>{total ? Math.round(v / total * 100) : 0}%</div>
                  </div>
                  <div style={{ marginTop: 6, marginLeft: 28, height: 4, background: A.rule2 }}>
                    <div style={{ width: (v / maxCat * 100) + '%', height: '100%', background: t.accent }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <ALabel>[04] NET WORTH · TREND</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, paddingTop: 16 }}>
            <LineChart data={netWorthTrend} stroke={t.accent} fill={t.accent} height={140} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, letterSpacing: 1, marginTop: 6 }}>
              <span>{fmtMoney(netWorthTrend[0]?.value || 0, t.currency, false)}</span>
              <span>{fmtMoney(netWorthTrend[netWorthTrend.length - 1]?.value || 0, t.currency, false)}</span>
            </div>
          </div>

          <ALabel style={{ marginTop: 28 }}>[05] CALENDAR · {periodLabel}</ALabel>
          {useRange ? (
            <div style={{ marginTop: 12, padding: '14px 0', fontSize: 10, color: A.muted, letterSpacing: 1, borderTop: '2px solid ' + A.ink }}>
              CALENDAR HEATMAP IS PER-MONTH · SWITCH TO 'THIS MONTH' OR 'LAST MONTH' TO VIEW
            </div>
          ) : (
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, paddingTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={i} style={{ fontSize: 9, color: A.muted, letterSpacing: 1, textAlign: 'center', paddingBottom: 4 }}>{d}</div>
              ))}
              {cells.map((v, i) => {
                const intensity = v / cellMax;
                const day = String(i + 1).padStart(2, '0');
                const dateIso = `${selectedPeriod}-${day}`;
                return (
                  <button key={i}
                    onClick={() => drillTo({ date: dateIso })}
                    title={`${dateIso} · ${fmtMoney(v, t.currency, false)}`}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      aspectRatio: '1.2',
                      background: v === 0 ? A.rule2 : `color-mix(in oklch, ${t.accent} ${Math.max(15, intensity * 100)}%, ${A.bg})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <span style={{ fontSize: 10, color: intensity > 0.5 ? A.bg : A.ink2, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          <ALabel style={{ marginTop: 28 }}>[06] DETECTED · INSIGHTS</ALabel>
          <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
            {[['SPEND', `${periodTransactions.length} TXS · ${fmtMoney(total, t.currency, false)}`],['BUDGET', 'ROLLOVER ACTIVE'],['PERIOD', periodLabel],['COMPARE', `${formatShortPeriodLabel(previousPeriod)} · ${fmtMoney(previousTotal, t.currency, false)}`]].map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 11 }}>
                <span style={{ letterSpacing: 1.2 }}>{k}</span>
                <span style={{ color: A.muted, letterSpacing: 0.6 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <ALabel>[07] TOP · MERCHANTS</ALabel>
        <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 120px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
            <div>MERCHANT</div><div>VISITS</div><div>AVG</div><div style={{ textAlign: 'right' }}>TOTAL</div>
          </div>
          {merchants.map((m, i) => (
            <button key={i}
              onClick={() => drillTo({ merchant: m.name })}
              title={`Show transactions for ${m.name}`}
              style={{
                all: 'unset', display: 'grid', width: '100%', boxSizing: 'border-box',
                gridTemplateColumns: '1fr 80px 80px 120px',
                padding: t.density === 'compact' ? '7px 0' : '10px 0',
                fontSize: 11, borderBottom: '1px solid ' + A.rule2, cursor: 'pointer',
              }}>
              <div>{m.name}</div>
              <div style={{ color: A.muted }}>{m.n}x</div>
              <div style={{ fontVariantNumeric: 'tabular-nums', color: A.muted }}>{fmtMoney(m.amt / m.n, t.currency, false)}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(m.amt, t.currency, t.decimals)}</div>
            </button>
          ))}
        </div>
      </div>
    </WebShell>
  );
}
