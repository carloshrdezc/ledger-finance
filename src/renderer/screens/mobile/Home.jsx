import React from 'react';
import { A } from '../../theme';
import { AsciiSpark, ARule, ALabel } from '../../components/Shared';
import { ACCOUNTS, BILLS, HERO_METRICS, fmtMoney, fmtSigned, fmtPct, dayLabel } from '../../data';

export default function Home({ t, onAcct, onAddTx, onViewAll }) {
  const [heroIdx, setHeroIdx] = React.useState(0);
  const [scrub, setScrub] = React.useState(null);
  const hero = HERO_METRICS[heroIdx];
  const accent = hero.invert ? (scrub != null ? A.neg : A.ink) : t.accent;
  const displayVal = scrub != null ? hero.spark[scrub] : hero.value;
  const dateLbl = scrub != null ? dayLabel(29 - scrub) : 'MAY 11 · 2026';

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>LEDGER</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink2 }}>11 MAY · 2026</div>
      </div>
      <ARule thick />

      {/* Hero */}
      <div style={{ padding: '14px 0 10px' }}>
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
      </div>
      <ARule />

      {/* Accounts mini-list */}
      <div style={{ padding: '14px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <ALabel>[02] ACCOUNTS · 8</ALabel>
        <div onClick={onViewAll} style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink, cursor: 'pointer' }}>VIEW ALL ▸</div>
      </div>
      {ACCOUNTS.slice(0, 5).map(a => (
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
            <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: a.bal < 0 ? A.neg : A.ink }}>
              {fmtMoney(a.bal, a.ccy, t.decimals)}
            </div>
            <div style={{ fontSize: 9, color: a.delta < 0 ? A.neg : t.accent }}>
              {fmtSigned(a.delta, a.ccy, t.decimals)}
            </div>
          </div>
        </button>
      ))}
      <ARule />

      {/* Cash flow */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[03] MAY · CASH FLOW</ALabel>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2 }}>
          {[
            { l: 'IN',  v:  13680.00, c: t.accent },
            { l: 'OUT', v:  -5234.18, c: A.neg },
            { l: 'NET', v:   8445.82, c: A.ink },
          ].map(x => (
            <div key={x.l} style={{ background: A.bg, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{x.l}</div>
              <div style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums', color: x.c, marginTop: 4 }}>
                {fmtSigned(x.v, 'USD', t.decimals)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />

      {/* Upcoming */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[04] UPCOMING · 7 DAYS</ALabel>
        {BILLS.slice(0, 3).map((b, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: A.muted, width: 24 }}>{String(b.day).padStart(2, '0')}</span>
              <span style={{ fontWeight: 500 }}>{b.name}</span>
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(b.amt, 'USD', t.decimals)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
