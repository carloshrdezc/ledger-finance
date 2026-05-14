import React from 'react';
import { A } from '../../theme';
import { AsciiSpark, ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { INVESTMENTS, NET_WORTH, SPARK_NW, fmtMoney, fmtSigned, fmtPct } from '../../data';

export default function WebInvestments({ t, onNavigate }) {
  const totalPort = INVESTMENTS.reduce((s, i) => s + i.shares * i.price, 0);
  const dayChg = INVESTMENTS.reduce((s, i) => s + i.shares * i.price * i.chg / 100, 0);
  const alloc = INVESTMENTS.map(i => ({ ...i, val: i.shares * i.price, pct: (i.shares * i.price) / totalPort }));
  const shades = [t.accent, A.ink, '#8c8678', '#bdb6a3', '#4a463e'];

  return (
    <WebShell active="investments" t={t} onNavigate={onNavigate}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] PORTFOLIO · 11 MAY 2026</ALabel>
          <div style={{ fontSize: 56, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 8 }}>
            {fmtMoney(totalPort, 'USD', t.decimals)}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <span style={{ color: dayChg >= 0 ? t.accent : A.neg }}>{fmtSigned(dayChg, 'USD', t.decimals)}</span>
            <span style={{ color: A.muted, marginLeft: 10, fontSize: 11, letterSpacing: 1 }}>TODAY · {fmtPct(dayChg / totalPort * 100)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['1D','1W','1M','3M','1Y','5Y','MAX'].map((p, i) => (
            <span key={p} style={{ fontSize: 10, letterSpacing: 1.2, padding: '5px 10px', border: '1px solid ' + (i === 3 ? A.ink : A.rule2), background: i === 3 ? A.ink : 'transparent', color: i === 3 ? A.bg : A.ink, cursor: 'pointer' }}>{p}</span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
        <AsciiSpark data={SPARK_NW.map(v => v * (totalPort / NET_WORTH))} width={840} height={160} stroke={t.accent} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
          <span>FEB 11</span><span>MAR 02</span><span>MAR 24</span><span>APR 15</span><span>MAY 11</span>
        </div>
      </div>

      <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 32 }}>
        <div>
          <ALabel>[02] HOLDINGS</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 100px 90px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
              <div>TICKER</div><div>NAME</div>
              <div style={{ textAlign: 'right' }}>SHARES</div>
              <div style={{ textAlign: 'right' }}>PRICE</div>
              <div style={{ textAlign: 'right' }}>VALUE</div>
              <div style={{ textAlign: 'right' }}>DAY</div>
            </div>
            {INVESTMENTS.map(i => (
              <div key={i.ticker} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 100px 90px', padding: t.density === 'compact' ? '8px 0' : '12px 0', fontSize: 12, borderBottom: '1px solid ' + A.rule2, alignItems: 'center' }}>
                <div style={{ fontWeight: 700, letterSpacing: 0.6 }}>{i.ticker}</div>
                <div style={{ color: A.muted, fontSize: 10, letterSpacing: 0.6 }}>{i.name}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: A.muted }}>{i.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: A.muted }}>{fmtMoney(i.price, 'USD', t.decimals)}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(i.shares * i.price, 'USD', t.decimals)}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: i.chg >= 0 ? t.accent : A.neg, fontSize: 11 }}>{fmtPct(i.chg)}</div>
              </div>
            ))}
          </div>

          <ALabel style={{ marginTop: 28 }}>[04] PERFORMANCE</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2 }}>
            {[['1M','+2.40%'],['3M','+8.12%'],['YTD','+12.4%'],['1Y','+18.4%']].map(([k, v]) => (
              <div key={k} style={{ background: A.bg, padding: '14px 16px' }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{k}</div>
                <div style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', color: t.accent, marginTop: 6 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <ALabel>[03] ALLOCATION</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
            <div style={{ display: 'flex', height: 36, border: '1px solid ' + A.ink }}>
              {alloc.map((a, i) => (
                <div key={a.ticker} style={{ width: (a.pct * 100) + '%', background: shades[i % shades.length], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a.pct > 0.08 && <span style={{ fontSize: 9, color: A.bg, letterSpacing: 1 }}>{a.ticker}</span>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              {[...alloc].sort((a, b) => b.val - a.val).map((a, i) => (
                <div key={a.ticker} style={{ display: 'grid', gridTemplateColumns: '14px 60px 1fr 80px', padding: '9px 0', fontSize: 11, alignItems: 'center', borderBottom: '1px solid ' + A.rule2 }}>
                  <div style={{ width: 10, height: 10, background: shades[i % shades.length] }} />
                  <div style={{ fontWeight: 700 }}>{a.ticker}</div>
                  <div style={{ color: A.muted, fontSize: 10 }}>{(a.pct * 100).toFixed(1)}%</div>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(a.val, 'USD', false)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WebShell>
  );
}
