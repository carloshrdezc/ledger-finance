import React from 'react';
import { A } from '../../theme';
import { ALabel } from '../../components/Shared';
import WebShell from './WebShell';
import { MERCHANTS, MOM_SPEND, fmtMoney, fmtSigned } from '../../data';
import { useStore } from '../../store';

export default function WebReports({ t, onNavigate }) {
  const { transactions, categoryTree } = useStore();
  const total = transactions.filter(x => x.amt < 0)
    .reduce((s, x) => s + Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08), 0);

  const byCat = {};
  transactions.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    byCat[k] = (byCat[k] || 0) + Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08);
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0] ? cats[0][1] : 1;

  const cells = Array.from({ length: 30 }, (_, i) =>
    transactions.filter(x => x.d === i && x.amt < 0).reduce((s, x) => s + Math.abs(x.amt), 0)
  );
  const cellMax = Math.max(...cells, 1);

  return (
    <WebShell active="reports" t={t} onNavigate={onNavigate}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <ALabel>[01] REPORTS · MAY 2026</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {fmtMoney(total, 'USD', t.decimals)}{' '}
            <span style={{ fontSize: 18, color: A.neg }}>{fmtSigned(total - 6713, 'USD', false)}</span>
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 6, letterSpacing: 1 }}>SPENT · VS · APR · {fmtMoney(6713, 'USD', false)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['7D','30D','90D','1Y','MAX'].map((p, i) => (
            <span key={p} style={{ fontSize: 10, letterSpacing: 1.2, padding: '5px 10px', border: '1px solid ' + (i === 1 ? A.ink : A.rule2), background: i === 1 ? A.ink : 'transparent', color: i === 1 ? A.bg : A.ink, cursor: 'pointer' }}>{p}</span>
          ))}
        </div>
      </div>

      {/* MoM bars */}
      <div style={{ marginTop: 24, borderTop: '2px solid ' + A.ink, paddingTop: 18 }}>
        <ALabel>[02] MONTH · OVER · MONTH</ALabel>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, marginTop: 18 }}>
          {MOM_SPEND.map((v, i) => {
            const mxx = Math.max(...MOM_SPEND);
            const h = (v / mxx) * 100;
            const isCurrent = i === MOM_SPEND.length - 1;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 9, color: A.muted, fontVariantNumeric: 'tabular-nums' }}>{Math.round(v / 100) * 100}</div>
                <div style={{ width: '100%', height: h + '%', background: isCurrent ? t.accent : A.ink, opacity: isCurrent ? 1 : 0.82 }} />
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8 }}>
                  {['JUN','JUL','AUG','SEP','OCT','NOV','DEC','JAN','FEB','MAR','APR','MAY'][i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two columns */}
      <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32 }}>
        <div>
          <ALabel>[03] SPEND · BY · CATEGORY</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
            {cats.map(([k, v]) => {
              const c = categoryTree[k] || { label: k, glyph: '·' };
              return (
                <div key={k} style={{ padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 80px 60px', alignItems: 'center', gap: 8 }}>
                    <div style={{ color: t.accent }}>{c.glyph}</div>
                    <div style={{ fontSize: 12 }}>{c.label}</div>
                    <div style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{fmtMoney(v, 'USD', t.decimals)}</div>
                    <div style={{ fontSize: 10, color: A.muted, textAlign: 'right' }}>{Math.round(v / total * 100)}%</div>
                  </div>
                  <div style={{ marginTop: 6, marginLeft: 28, height: 4, background: A.rule2 }}>
                    <div style={{ width: (v / maxCat * 100) + '%', height: '100%', background: t.accent }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <ALabel>[04] CALENDAR · 30D</ALabel>
          <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink, paddingTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={i} style={{ fontSize: 9, color: A.muted, letterSpacing: 1, textAlign: 'center', paddingBottom: 4 }}>{d}</div>
              ))}
              {cells.map((v, i) => {
                const intensity = v / cellMax;
                return (
                  <div key={i} style={{ aspectRatio: '1.2', background: v === 0 ? A.rule2 : `color-mix(in oklch, ${t.accent} ${Math.max(15, intensity * 100)}%, ${A.bg})`, border: i === 0 ? '2px solid ' + A.ink : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 10, color: intensity > 0.5 ? A.bg : A.ink2, fontVariantNumeric: 'tabular-nums' }}>{29 - i}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <ALabel style={{ marginTop: 28 }}>[05] DETECTED · INSIGHTS</ALabel>
          <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
            {[['DINING','↑ 18% VS APR · MOSTLY CAFÉS'],['SUBS','5 ACTIVE · $69.48 / MO'],['UNUSED','NYTIMES · NOT OPENED 30D'],['SAVINGS','12.4% RATE · ▲ FROM 9.8%']].map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid ' + A.rule2, fontSize: 11 }}>
                <span style={{ letterSpacing: 1.2 }}>{k}</span>
                <span style={{ color: A.muted, letterSpacing: 0.6 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Merchants */}
      <div style={{ marginTop: 28 }}>
        <ALabel>[06] TOP · MERCHANTS</ALabel>
        <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 120px', padding: '8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom: '1px solid ' + A.rule2 }}>
            <div>MERCHANT</div><div>VISITS</div><div>AVG</div><div style={{ textAlign: 'right' }}>TOTAL</div>
          </div>
          {MERCHANTS.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 120px', padding: t.density === 'compact' ? '7px 0' : '10px 0', fontSize: 11, borderBottom: '1px solid ' + A.rule2 }}>
              <div>{m.name}</div>
              <div style={{ color: A.muted }}>{m.n}×</div>
              <div style={{ fontVariantNumeric: 'tabular-nums', color: A.muted }}>{fmtMoney(m.amt / m.n, 'USD', false)}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(m.amt, 'USD', t.decimals)}</div>
            </div>
          ))}
        </div>
      </div>
    </WebShell>
  );
}
