import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import PeriodSwitcher from '../../components/PeriodSwitcher';
import { fmtMoney } from '../../data';
import { useStore } from '../../store';
import { useFx } from '../../useFx';
import { getDaysInPeriod } from '../../period.mjs';

export default function ReportsCalendar({ t, onBack, onGoToRoute }) {
  const { periodTransactions, selectedPeriod, periodLabel, setTxFilter } = useStore();
  const { toReporting } = useFx(t.currency || 'USD');
  const drillTo = (filter) => {
    if (!onGoToRoute) return;
    setTxFilter(filter || null);
    onGoToRoute('tx');
  };
  const dayCount = getDaysInPeriod(selectedPeriod);
  const cells = Array.from({ length: dayCount }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    return periodTransactions
      .filter(x => x.date === `${selectedPeriod}-${day}` && x.amt < 0)
      .reduce((s, x) => s + Math.abs(toReporting(x.amt, x.ccy)), 0);
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
    weekdayTotals[dow] += Math.abs(toReporting(tx.amt, tx.ccy));
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
            const day = String(i + 1).padStart(2, '0');
            const dateIso = `${selectedPeriod}-${day}`;
            return (
              <button key={i}
                onClick={() => drillTo({ date: dateIso })}
                title={`${dateIso} · ${fmtMoney(v, t.currency, false)}`}
                style={{
                  all: 'unset', cursor: 'pointer',
                  aspectRatio: '1',
                  background: v === 0 ? A.rule2 : `color-mix(in oklch, ${t.accent} ${Math.max(15, intensity * 100)}%, ${A.bg})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <span style={{ fontSize: 9, color: intensity > 0.5 ? A.bg : A.ink, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              </button>
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
            <button key={day}
              onClick={() => drillTo({ weekday: i, type: 'expense' })}
              style={{
                all: 'unset', cursor: 'pointer', display: 'flex', width: '100%',
                boxSizing: 'border-box', alignItems: 'center', gap: 12,
                padding: '8px 0', borderBottom: '1px solid ' + A.rule2,
              }}>
              <div style={{ fontSize: 10, letterSpacing: 1.4, width: 30 }}>{day}</div>
              <div style={{ flex: 1, height: 4, background: A.rule2 }}>
                <div style={{ width: (v / maxWeekday * 100) + '%', height: '100%', background: t.accent }} />
              </div>
              <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', width: 80, textAlign: 'right' }}>{fmtMoney(v, t.currency, t.decimals)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
