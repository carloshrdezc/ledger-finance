import React from 'react';
import { A } from '../theme';
import { ALabel, AsciiSpark, scaleSparkPoints } from './Shared';
import { useStore } from '../store';
import { projectBalances, isLiquidAccount } from '../forecast.mjs';
import { compactForecastSeries } from '../forecastSeries.mjs';
import { fmtMoney, fmtSigned, dayLabel } from '../data';

const HORIZON_OPTIONS = [
  { key: '30D', days: 30 },
  { key: '60D', days: 60 },
  { key: '90D', days: 90 },
];

/**
 * CAR-218: cash-flow forecast dashboard widget.
 *
 * Renders a per-day total liquid balance line over a 30 / 60 / 90 day
 * horizon. Days where the projected total dips below the configured
 * threshold (or any liquid account is overdrawn) are highlighted with red
 * markers. Hovering scrubs to a specific day and shows the projected
 * total + delta for that day.
 *
 * Reads forecast settings from the store, so editing settings or
 * recurring rules causes a live re-render.
 */
export default function CashFlowForecastWidget({ t, width = 780, height = 160 }) {
  const {
    accountsWithBalance,
    transactions,
    bills,
    forecastLiquidAccountIds,
    forecastThreshold,
  } = useStore();

  const [horizonKey, setHorizonKey] = React.useState('30D');
  const [scrub, setScrub] = React.useState(null);

  const horizon = HORIZON_OPTIONS.find(h => h.key === horizonKey) || HORIZON_OPTIONS[0];

  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  // CAR-84 data layer: per-day-per-account rows for the full horizon. The
  // helper already filters to liquid accounts (CHK / SAV) and skips
  // non-USD until FX rules are wired up. forecastLiquidAccountIds, when
  // non-empty, narrows further via compactForecastSeries.
  const liquidAccounts = React.useMemo(
    () => (accountsWithBalance || []).filter(isLiquidAccount),
    [accountsWithBalance],
  );
  const rows = React.useMemo(
    () => projectBalances(liquidAccounts, transactions, bills, todayIso, horizon.days),
    [liquidAccounts, transactions, bills, todayIso, horizon.days],
  );

  const { dates, totals, riskIndices, minTotal, minDate } = React.useMemo(
    () => compactForecastSeries(rows, {
      threshold: Number.isFinite(forecastThreshold) ? forecastThreshold : 0,
      accountIds: forecastLiquidAccountIds && forecastLiquidAccountIds.length > 0
        ? forecastLiquidAccountIds
        : null,
    }),
    [rows, forecastThreshold, forecastLiquidAccountIds],
  );

  const hasData = totals.length > 0;
  const scrubIdx = scrub != null && hasData ? Math.max(0, Math.min(totals.length - 1, scrub)) : null;
  const heroIdx = scrubIdx != null ? scrubIdx : (hasData ? totals.length - 1 : 0);
  const heroTotal = hasData ? totals[heroIdx] : 0;
  const heroDate = hasData ? dates[heroIdx] : todayIso;
  const startTotal = hasData ? totals[0] : 0;
  const heroDelta = heroTotal - startTotal;
  const heroIsRisk = riskIndices.includes(heroIdx);

  const ticks = React.useMemo(() => {
    if (!hasData) return [];
    if (dates.length <= 5) return dates.map((d, i) => ({ date: d, idx: i }));
    return [0, 0.25, 0.5, 0.75, 1].map(x => {
      const i = Math.round(x * (dates.length - 1));
      return { date: dates[i], idx: i };
    });
  }, [dates, hasData]);

  const riskMarkers = React.useMemo(() => {
    if (!hasData) return [];
    const markerPts = scaleSparkPoints(totals, width, height);
    return riskIndices.map(i => markerPts[i]);
  }, [riskIndices, totals, dates.length, hasData, width, height]);

  if (!hasData) {
    return (
      <div style={{ marginTop: 28 }}>
        <ALabel>[CF] CASH FLOW · FORECAST</ALabel>
        <div style={{
          marginTop: 8, padding: '24px 0', borderTop: '2px solid ' + A.ink,
          fontSize: 11, color: A.muted, letterSpacing: 1, textAlign: 'center',
        }}>
          ADD A LIQUID ACCOUNT (CHK / SAV) TO SEE A FORECAST
        </div>
      </div>
    );
  }

  const riskColor = A.neg;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <ALabel>[CF] CASH FLOW · FORECAST</ALabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {HORIZON_OPTIONS.map(h => (
            <button key={h.key} onClick={() => { setHorizonKey(h.key); setScrub(null); }} aria-pressed={horizonKey === h.key} style={{
              all: 'unset', cursor: 'pointer',
              fontSize: 10, letterSpacing: 1.2, padding: '5px 10px',
              border: '1px solid ' + (horizonKey === h.key ? A.ink : A.rule2),
              background: horizonKey === h.key ? A.ink : 'transparent',
              color: horizonKey === h.key ? A.bg : A.ink,
            }}>{h.key}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink, paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>
              PROJECTED · {dayLabel(heroDate)}
              {heroIsRisk && <span style={{ color: riskColor, marginLeft: 8 }}>· RISK</span>}
            </div>
            <div style={{
              fontSize: 30, letterSpacing: -0.8, fontVariantNumeric: 'tabular-nums',
              marginTop: 4, color: heroIsRisk ? riskColor : A.ink,
            }}>
              {fmtMoney(heroTotal, t.currency, t.decimals)}
            </div>
            <div style={{ fontSize: 11, color: heroDelta < 0 ? A.neg : t.accent, marginTop: 4 }}>
              {fmtSigned(heroDelta, t.currency, t.decimals)} <span style={{ color: A.muted, marginLeft: 6 }}>{horizonKey} TO HERE</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>LOW POINT</div>
            <div style={{
              fontSize: 14, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums',
              marginTop: 4, color: minTotal < (forecastThreshold || 0) ? riskColor : A.ink,
            }}>
              {fmtMoney(minTotal, t.currency, t.decimals)}
            </div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2, marginTop: 4 }}>
              {minDate ? dayLabel(minDate) : ''}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, position: 'relative' }}>
          <AsciiSpark
            data={totals}
            width={width}
            height={height}
            stroke={t.accent}
            hover={scrubIdx}
            onScrub={setScrub}
          />
          {riskMarkers.length > 0 && (
            <svg
              width={width}
              height={height}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {riskMarkers.map((m, i) => (
                <circle key={i} cx={m.x} cy={m.y} r="3" fill={riskColor} />
              ))}
            </svg>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
          {ticks.map(tick => (
            <span key={tick.date}>{dayLabel(tick.date)}</span>
          ))}
        </div>

        <div style={{ marginTop: 10, fontSize: 9, color: A.muted, letterSpacing: 1 }}>
          {riskIndices.length > 0
            ? `${riskIndices.length} RISK ${riskIndices.length === 1 ? 'DAY' : 'DAYS'} · THRESHOLD ${fmtMoney(forecastThreshold || 0, t.currency, t.decimals)}`
            : `NO RISK DAYS · THRESHOLD ${fmtMoney(forecastThreshold || 0, t.currency, t.decimals)}`}
        </div>
      </div>
    </div>
  );
}
