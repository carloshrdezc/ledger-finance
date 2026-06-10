import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { useStore } from '../store';
import { projectBalances, isLiquidAccount } from '../forecast.mjs';
import { buildCashFlowCalendar } from '../cashFlowCalendar.mjs';
import { fmtMoney } from '../data';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * CAR-349: bill / cash-flow calendar.
 *
 * Renders the current month as a 7-column calendar. Each day cell shows the
 * day number, a marker when bills/scheduled items land that day, and a tint
 * keyed to the projected end-of-day liquid balance (red when the projection
 * goes negative). Selecting a day reveals the bills due that day plus the
 * projected balance. Reads recurring rules + liquid accounts from the store,
 * so editing a bill re-renders live.
 */
export default function CashFlowCalendar({ t }) {
  const { accountsWithBalance, transactions, bills, rates, selectedPeriod, periodLabel } = useStore();
  const [selectedDay, setSelectedDay] = React.useState(null);

  const reportingCcy = t.currency || 'USD';
  const liquidAccounts = React.useMemo(
    () => (accountsWithBalance || []).filter(isLiquidAccount),
    [accountsWithBalance],
  );

  // Project from the first of the selected month through the end of that month.
  const validPeriod = /^\d{4}-\d{2}$/.test(selectedPeriod || '');
  const [year, month] = (validPeriod ? selectedPeriod : '1970-01').split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstIso = `${selectedPeriod}-01`;

  const rows = React.useMemo(
    () => projectBalances(liquidAccounts, transactions, bills, firstIso, daysInMonth, { rates, reportingCcy }),
    [liquidAccounts, transactions, bills, firstIso, daysInMonth, rates, reportingCcy],
  );
  const calendar = React.useMemo(
    () => buildCashFlowCalendar(rows, selectedPeriod),
    [rows, selectedPeriod],
  );

  // Reset the selection whenever the month changes.
  React.useEffect(() => { setSelectedDay(null); }, [selectedPeriod]);

  const byDay = React.useMemo(() => {
    const map = new Map();
    for (const d of calendar.days) map.set(d.day, d);
    return map;
  }, [calendar.days]);

  if (liquidAccounts.length === 0) {
    return (
      <div style={{ marginTop: 28 }}>
        <ALabel>[CAL] CASH FLOW · CALENDAR · {periodLabel}</ALabel>
        <div style={{ marginTop: 8, padding: '24px 0', borderTop: '2px solid ' + A.ink, fontSize: 11, color: A.muted, letterSpacing: 1, textAlign: 'center' }}>
          ADD A LIQUID ACCOUNT (CHK / SAV) TO SEE A CALENDAR
        </div>
      </div>
    );
  }

  const balances = calendar.days.map(d => d.balance);
  const maxBal = balances.length ? Math.max(...balances, 0) : 0;
  const leadingBlanks = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const selected = selectedDay != null ? byDay.get(selectedDay) : null;

  const cellTint = (entry) => {
    if (!entry) return A.bg;
    if (entry.isRisk) return `color-mix(in oklch, ${A.neg} 40%, ${A.bg})`;
    if (maxBal <= 0) return A.bg;
    const intensity = Math.max(0, Math.min(1, entry.balance / maxBal));
    return `color-mix(in oklch, ${t.accent} ${Math.round(intensity * 55)}%, ${A.bg})`;
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <ALabel>[CAL] CASH FLOW · CALENDAR · {periodLabel}</ALabel>
        <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>
          LOW · {fmtMoney(calendar.minBalance, t.currency, false)} · {calendar.billCount} BILL {calendar.billCount === 1 ? 'DAY' : 'DAYS'}
        </div>
      </div>

      <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink, paddingTop: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {DOW.map((d, i) => (
            <div key={i} style={{ fontSize: 9, color: A.muted, letterSpacing: 1, textAlign: 'center', paddingBottom: 4 }}>{d}</div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const dayNum = i + 1;
            const entry = byDay.get(dayNum);
            const hasBills = entry && entry.events.length > 0;
            const isSelected = selectedDay === dayNum;
            return (
              <button key={dayNum}
                onClick={() => setSelectedDay(isSelected ? null : dayNum)}
                title={entry ? `${selectedPeriod}-${String(dayNum).padStart(2, '0')} · ${fmtMoney(entry.balance, t.currency, false)}` : undefined}
                style={{
                  all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                  aspectRatio: '1', padding: 4, position: 'relative',
                  background: cellTint(entry),
                  border: '1px solid ' + (isSelected ? A.ink : A.rule2),
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}>
                <span style={{ fontSize: 10, color: entry && entry.isRisk ? A.bg : A.ink2, fontVariantNumeric: 'tabular-nums' }}>{dayNum}</span>
                {hasBills && (
                  <span style={{
                    alignSelf: 'flex-end', width: 6, height: 6, borderRadius: '50%',
                    background: entry.outflow > entry.inflow ? A.neg : t.accent,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div style={{ marginTop: 12, borderTop: '1px solid ' + A.rule2, paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 11, letterSpacing: 1 }}>
              {periodLabel} {selected.day}
              {selected.isRisk && <span style={{ color: A.neg, marginLeft: 8 }}>· RISK</span>}
            </div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: selected.isRisk ? A.neg : A.ink }}>
              {fmtMoney(selected.balance, t.currency, t.decimals)} <span style={{ fontSize: 9, color: A.muted }}>PROJECTED</span>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            {selected.events.length === 0 ? (
              <div style={{ fontSize: 10, color: A.muted, letterSpacing: 1, padding: '6px 0' }}>NO BILLS THIS DAY</div>
            ) : selected.events.map((ev, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '6px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <span>{ev.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: ev.kind === 'income' ? t.accent : A.neg }}>
                  {ev.kind === 'income' ? '↑ ' : ''}{fmtMoney(Math.abs(ev.amount), t.currency, t.decimals)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 9, color: A.muted, letterSpacing: 1 }}>
          SELECT A DAY TO SEE BILLS · DOT = SCHEDULED ITEM · RED = PROJECTED OVERDRAW
        </div>
      )}
    </div>
  );
}
