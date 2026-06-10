import React from 'react';
import { A } from '../theme';
import { ALabel, ARule, AsciiSpark } from './Shared';
import { useStore } from '../store';
import { fmtMoney } from '../data';
import { comparePayoff } from '../payoff.mjs';

const STRATEGIES = [
  { key: 'snowball',  label: 'SNOWBALL',  sub: 'SMALLEST BALANCE FIRST' },
  { key: 'avalanche', label: 'AVALANCHE', sub: 'HIGHEST APR FIRST' },
];

function monthsLabel(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 MO';
  const years = Math.floor(n / 12);
  const months = n % 12;
  if (years === 0) return `${months} MO`;
  if (months === 0) return `${years} YR`;
  return `${years} YR ${months} MO`;
}

function fmtPayoffDate(iso) {
  if (!iso) return '—';
  const [y, m] = iso.split('-');
  const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const mi = parseInt(m, 10) - 1;
  return `${names[mi] || '?'} ${y}`;
}

/**
 * CAR-345: shared payoff-planner surface used by both the web view and the
 * mobile overlay. Renders a strategy toggle, a side-by-side snowball vs
 * avalanche comparison (payoff date + total interest for each), highlights
 * the selected strategy, and draws a remaining-balance timeline for it via
 * the in-repo AsciiSpark chart.
 *
 * `width` lets callers size the chart for desktop (wide) vs mobile (narrow).
 */
export default function PayoffPlanner({ t, onEditDebt, onAddDebt, width = 520, chartHeight = 120 }) {
  const { debts, debtExtraPayment, setDebtExtraPayment } = useStore();
  const [strategy, setStrategy] = React.useState('avalanche');
  const [extraDraft, setExtraDraft] = React.useState(String(debtExtraPayment || 0));

  React.useEffect(() => { setExtraDraft(String(debtExtraPayment || 0)); }, [debtExtraPayment]);

  const startDate = React.useMemo(() => new Date().toISOString().slice(0, 7), []);

  const cmp = React.useMemo(
    () => comparePayoff(debts, debtExtraPayment, { startDate }),
    [debts, debtExtraPayment, startDate],
  );

  const selected = cmp[strategy];
  const totalBalance = debts.reduce((s, d) => s + (Number(d.balance) || 0), 0);
  const totalMin = debts.reduce((s, d) => s + (Number(d.minPayment) || 0), 0);

  const commitExtra = () => {
    const n = parseFloat(extraDraft);
    setDebtExtraPayment(Number.isFinite(n) && n > 0 ? n : 0);
  };

  if (debts.length === 0) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <ALabel>DEBT PAYOFF · 0 DEBTS</ALabel>
          {onAddDebt && (
            <button onClick={onAddDebt} style={{
              all: 'unset', cursor: 'pointer', fontSize: 11, letterSpacing: 1.5,
              padding: '8px 16px', background: A.ink, color: A.bg,
            }}>+ ADD DEBT</button>
          )}
        </div>
        <div style={{ marginTop: 20, padding: 32, border: '1.5px dashed ' + A.rule2, textAlign: 'center', color: A.muted, fontSize: 12, letterSpacing: 0.8 }}>
          NO DEBTS YET. ADD A DEBT TO MODEL SNOWBALL VS AVALANCHE PAYOFF.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <ALabel>DEBT PAYOFF · {debts.length} DEBT{debts.length === 1 ? '' : 'S'}</ALabel>
          <div style={{ fontSize: 32, letterSpacing: -1, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(totalBalance, t.currency, t.decimals)}
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
            TOTAL OWED · {fmtMoney(totalMin, t.currency, false)}/MO MINIMUMS
          </div>
        </div>
        {onAddDebt && (
          <button onClick={onAddDebt} style={{
            all: 'unset', cursor: 'pointer', fontSize: 11, letterSpacing: 1.5,
            padding: '8px 16px', background: A.ink, color: A.bg,
          }}>+ ADD DEBT</button>
        )}
      </div>

      <ARule style={{ marginTop: 16 }} />

      {/* Debts list */}
      <div style={{ marginTop: 14 }}>
        {debts.map(d => (
          <button key={d.id}
            onClick={() => onEditDebt && onEditDebt(d)}
            aria-label={'EDIT DEBT ' + d.name}
            style={{ all: 'unset', cursor: onEditDebt ? 'pointer' : 'default', display: 'block', width: '100%' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto',
              gap: 12, alignItems: 'baseline',
              padding: '9px 0', borderBottom: '1px solid ' + A.rule2,
            }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{d.name}</span>
              <span style={{ fontSize: 11, color: A.muted, fontVariantNumeric: 'tabular-nums' }}>{(Number(d.apr) || 0).toFixed(2)}% APR</span>
              <span style={{ fontSize: 11, color: A.muted, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(d.minPayment, t.currency, false)}/MO</span>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 80 }}>{fmtMoney(d.balance, t.currency, t.decimals)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Extra monthly payment */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.6 }}>EXTRA / MONTH</div>
        <input
          type="number" min="0" step="1"
          value={extraDraft}
          aria-label="EXTRA MONTHLY PAYMENT"
          onChange={e => setExtraDraft(e.target.value)}
          onBlur={commitExtra}
          onKeyDown={e => { if (e.key === 'Enter') commitExtra(); }}
          style={{
            width: 120, background: 'transparent', border: 'none',
            borderBottom: '1px solid ' + A.ink, color: A.ink,
            fontFamily: A.font, fontSize: 13, padding: '4px 0', outline: 'none',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>
          ON TOP OF {fmtMoney(totalMin, t.currency, false)}/MO MINIMUMS
        </div>
      </div>

      {/* Strategy toggle */}
      <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
        {STRATEGIES.map(s => {
          const active = strategy === s.key;
          const isRecommended = cmp.recommended === s.key;
          return (
            <button key={s.key}
              onClick={() => setStrategy(s.key)}
              aria-pressed={active}
              aria-label={'STRATEGY ' + s.label}
              style={{
                all: 'unset', cursor: 'pointer', flex: 1,
                padding: '10px 12px',
                border: '1.5px solid ' + (active ? t.accent : A.rule2),
                background: active ? t.accent : 'transparent',
                color: active ? A.bg : A.ink,
              }}>
              <div style={{ fontSize: 11, letterSpacing: 1.4, fontWeight: 700 }}>
                {s.label}{isRecommended ? ' ★' : ''}
              </div>
              <div style={{ fontSize: 8, letterSpacing: 1, marginTop: 2, color: active ? A.bg : A.muted }}>{s.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Side-by-side comparison */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {STRATEGIES.map(s => {
          const res = cmp[s.key];
          const active = strategy === s.key;
          return (
            <div key={s.key}
              aria-label={'SUMMARY ' + s.label}
              style={{
                border: '1px solid ' + (active ? t.accent : A.rule2),
                background: active ? A.bg2 : 'transparent',
                padding: 14,
              }}>
              <div style={{ fontSize: 10, letterSpacing: 1.4, color: active ? t.accent : A.muted, fontWeight: active ? 700 : 400 }}>
                {s.label}{cmp.recommended === s.key ? ' · RECOMMENDED' : ''}
              </div>
              <div style={{ marginTop: 10, fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>DEBT-FREE</div>
              <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4, marginTop: 2 }}>
                {res.neverPaysOff ? 'NEVER' : fmtPayoffDate(res.payoffDate)}
              </div>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginTop: 2 }}>
                {res.neverPaysOff ? 'MIN < INTEREST' : monthsLabel(res.totalMonths)}
              </div>
              <div style={{ marginTop: 10, fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>TOTAL INTEREST</div>
              <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.4, marginTop: 2, color: A.neg }}>
                {fmtMoney(res.totalInterest, t.currency, t.decimals)}
              </div>
            </div>
          );
        })}
      </div>

      {cmp.interestSaved !== 0 && !cmp.snowball.neverPaysOff && !cmp.avalanche.neverPaysOff && (
        <div style={{ marginTop: 10, fontSize: 10, color: A.muted, letterSpacing: 1 }}>
          AVALANCHE SAVES {fmtMoney(Math.abs(cmp.interestSaved), t.currency, t.decimals)} IN INTEREST VS SNOWBALL
        </div>
      )}

      {/* Timeline */}
      <div style={{ marginTop: 20 }}>
        <ALabel>TIMELINE · {STRATEGIES.find(s => s.key === strategy).label} · REMAINING BALANCE</ALabel>
        <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink, paddingTop: 12 }}>
          {selected.series.length > 1 ? (
            <AsciiSpark data={selected.series} width={width} height={chartHeight} stroke={t.accent} />
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: A.muted, letterSpacing: 1 }}>
              NOTHING TO PAY OFF
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
            <span>{fmtPayoffDate(startDate)}</span>
            <span>{selected.neverPaysOff ? 'CAPPED · NEVER PAYS OFF' : fmtPayoffDate(selected.payoffDate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
