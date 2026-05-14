// Direction A — additional screens
// AReports · ACCDetail · AGoalDetail · ABillsHub · ASettings · ACategoriesEditor · AOnboarding
// All re-use the A theme + brutalist mono primitives from direction-a.jsx.

// ─── Reports & Insights · variant 1 (overview, dense) ───────────────────
function AReports({ t }) {
  const [period, setPeriod] = React.useState('30D');
  const total = TRANSACTIONS.filter(x => x.amt < 0).reduce((s,x)=>s+Math.abs(x.ccy==='USD'?x.amt:x.amt*1.08), 0);

  // group spend by top-level category
  const byCat = {};
  TRANSACTIONS.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    const v = Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08);
    byCat[k] = (byCat[k] || 0) + v;
  });
  const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0, 6);
  const maxCat = cats[0] ? cats[0][1] : 1;

  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>REPORTS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>MAY · 2026</div>
      </div>
      <ARule thick />
      {/* hero spend */}
      <div style={{ padding: '14px 0' }}>
        <ALabel>[01] TOTAL · SPEND · {period}</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric:'tabular-nums', letterSpacing:-1, marginTop: 6 }}>{fmtMoney(total, 'USD', t.decimals)}</div>
        <div style={{ fontSize: 11, marginTop: 2 }}>
          <span style={{ color: A.neg }}>{fmtSigned(total - 6713, 'USD', t.decimals)}</span>
          <span style={{ color: A.muted, marginLeft: 8 }}>VS · APR</span>
        </div>
      </div>
      <div style={{ display:'flex', gap: 6, marginBottom: 12 }}>
        {['7D','30D','90D','1Y'].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{ all:'unset', cursor:'pointer', padding:'4px 10px', border:'1px solid ' + (period===p?A.ink:A.rule2), background:period===p?A.ink:'transparent', color:period===p?A.bg:A.ink, fontSize: 10, letterSpacing: 1.2 }}>{p}</button>
        ))}
      </div>
      {/* month-over-month bars */}
      <ARule />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[02] MONTH · OVER · MONTH</ALabel>
        <div style={{ display:'flex', alignItems:'flex-end', gap: 4, height: 110, marginTop: 14 }}>
          {MOM_SPEND.map((v, i) => {
            const max = Math.max(...MOM_SPEND);
            const h = (v / max) * 100;
            const isCurrent = i === MOM_SPEND.length - 1;
            return (
              <div key={i} style={{ flex: 1, display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
                <div style={{ width:'100%', height: h, background: isCurrent ? t.accent : A.ink, opacity: isCurrent ? 1 : 0.85 }} />
                <div style={{ fontSize: 8, color: A.muted, letterSpacing: 0.4 }}>
                  {['JN','JL','AU','SE','OC','NO','DE','JA','FE','MR','AP','MY'][i]}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 8, letterSpacing: 1 }}>AVG · {fmtMoney(MOM_SPEND.reduce((s,v)=>s+v,0)/MOM_SPEND.length, 'USD', false)} / MO</div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      {/* top categories */}
      <div style={{ padding: '14px 0 4px' }}>
        <ALabel>[03] TOP · CATEGORIES</ALabel>
      </div>
      {cats.map(([k, v]) => {
        const c = CATEGORY_TREE[k] || { label: k, glyph: '·' };
        const pct = (v / maxCat) * 100;
        return (
          <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div style={{ fontSize: 12 }}>{c.glyph} {c.label}</div>
              <div style={{ fontSize: 12, fontVariantNumeric:'tabular-nums' }}>{fmtMoney(v, 'USD', t.decimals)} <span style={{ color: A.muted }}>· {Math.round(v/total*100)}%</span></div>
            </div>
            <div style={{ marginTop: 6, height: 4, background: A.rule2 }}>
              <div style={{ width: pct + '%', height:'100%', background: t.accent }} />
            </div>
          </div>
        );
      })}
      <ARule style={{ marginTop: 14 }} />
      {/* top merchants */}
      <div style={{ padding: '14px 0 4px' }}>
        <ALabel>[04] TOP · MERCHANTS</ALabel>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 30px 90px', borderTop: '1px solid ' + A.rule2 }}>
        {MERCHANTS.slice(0, 8).map((m, i) => (
          <React.Fragment key={i}>
            <div style={{ padding: '9px 0', fontSize: 12, borderBottom: '1px solid ' + A.rule2 }}>{m.name}</div>
            <div style={{ padding: '9px 0', fontSize: 10, color: A.muted, borderBottom: '1px solid ' + A.rule2, textAlign: 'center' }}>{m.n}×</div>
            <div style={{ padding: '9px 0', fontSize: 12, fontVariantNumeric:'tabular-nums', textAlign:'right', borderBottom: '1px solid ' + A.rule2 }}>{fmtMoney(m.amt, 'USD', t.decimals)}</div>
          </React.Fragment>
        ))}
      </div>
      <ARule style={{ marginTop: 14 }} />
      {/* insights */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[05] DETECTED · INSIGHTS</ALabel>
        {[
          ['DINING', '↑ 18% VS APR · MOSTLY CAFÉS'],
          ['SUBS', '5 ACTIVE · $69.48 / MO'],
          ['UNUSED', 'NYTIMES · NOT OPENED 30D'],
          ['SAVINGS', '12.4% RATE · ▲ FROM 9.8%'],
        ].map(([k, v], i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid '+A.rule2, fontSize: 11 }}>
            <span style={{ letterSpacing: 1.2 }}>{k}</span>
            <span style={{ color: A.muted, letterSpacing: 0.6 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reports · variant 2 (calendar heatmap focus) ────────────────────────
function AReportsCalendar({ t }) {
  // build a 5x7 grid of last 30 days of spend
  const cells = Array.from({ length: 30 }, (_, i) => {
    const txs = TRANSACTIONS.filter(x => x.d === i && x.amt < 0);
    return txs.reduce((s,x)=>s+Math.abs(x.amt), 0);
  });
  const max = Math.max(...cells, 1);
  const total = cells.reduce((a,b)=>a+b, 0);

  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>REPORTS · CAL</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>30D</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0' }}>
        <ALabel>SPEND · CALENDAR · 30D</ALabel>
        <div style={{ fontSize: 30, fontVariantNumeric:'tabular-nums', letterSpacing:-1, marginTop: 6 }}>{fmtMoney(total, 'USD', t.decimals)}</div>
        <div style={{ fontSize: 10, color: A.muted, letterSpacing: 1, marginTop: 2 }}>{fmtMoney(total/30, 'USD', false)} / DAY · AVG</div>
      </div>
      {/* heatmap */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap: 4 }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ fontSize: 9, color: A.muted, letterSpacing: 1, textAlign:'center', paddingBottom: 4 }}>{d}</div>
          ))}
          {cells.map((v, i) => {
            const intensity = v / max;
            const isToday = i === 0;
            return (
              <div key={i} style={{
                aspectRatio: '1',
                background: v === 0 ? A.rule2 : `color-mix(in oklch, ${t.accent} ${Math.max(15, intensity * 100)}%, ${A.bg})`,
                border: isToday ? '2px solid ' + A.ink : 'none',
                position: 'relative', display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <span style={{ fontSize: 9, color: intensity > 0.5 ? A.bg : A.ink, fontVariantNumeric:'tabular-nums' }}>{29-i}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop: 14, fontSize: 9, letterSpacing: 1.2, color: A.muted }}>
          <span>LOW</span>
          <div style={{ display:'flex', gap: 3 }}>
            {[0.15, 0.35, 0.55, 0.75, 1].map((v, i) => (
              <div key={i} style={{ width: 16, height: 10, background: `color-mix(in oklch, ${t.accent} ${v*100}%, ${A.bg})` }} />
            ))}
          </div>
          <span>HIGH · {fmtMoney(max, 'USD', false)}</span>
        </div>
      </div>
      <ARule style={{ marginTop: 18 }} />
      {/* day stats */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>BY · WEEKDAY</ALabel>
        {[
          ['MON', 612.20], ['TUE', 484.30], ['WED', 612.10], ['THU', 348.20],
          ['FRI', 892.40], ['SAT', 1142.80], ['SUN', 842.18],
        ].map(([day, v]) => {
          const m = 1142.80;
          return (
            <div key={day} style={{ display:'flex', alignItems:'center', gap: 12, padding:'8px 0', borderBottom:'1px solid '+A.rule2 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.4, width: 30 }}>{day}</div>
              <div style={{ flex: 1, height: 4, background: A.rule2 }}>
                <div style={{ width: (v/m*100)+'%', height:'100%', background: t.accent }} />
              </div>
              <div style={{ fontSize: 11, fontVariantNumeric:'tabular-nums', width: 80, textAlign:'right' }}>{fmtMoney(v, 'USD', t.decimals)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Credit Card detail (deep) ───────────────────────────────────────────
function ACCDetail({ t, onBack }) {
  const a = ACCOUNTS.find(x => x.id === 'amex');
  const limit = 10000;
  const used = Math.abs(a.bal);
  const util = used / limit;
  const stmtBal = used;
  const minDue = 35;
  const dueDay = 28;
  const apr = 22.74;
  const txns = TRANSACTIONS.filter(x => x.acct === 'amex').slice(0, 8);
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <button onClick={onBack} style={{ all:'unset', cursor:'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>AMEX · ··1009</div>
      </div>
      <ARule thick />
      <div style={{ padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1.4, color: A.muted, textTransform:'uppercase' }}>{a.name}</div>
        <div style={{ fontSize: 32, fontVariantNumeric:'tabular-nums', letterSpacing: -1, marginTop: 4, color: A.neg }}>{fmtMoney(a.bal, 'USD', t.decimals)}</div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>STATEMENT DUE · MAY {dueDay}</div>
      </div>
      {/* utilization meter */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <ALabel>UTILIZATION</ALabel>
          <div style={{ fontSize: 11, fontVariantNumeric:'tabular-nums' }}>{(util*100).toFixed(1)}%</div>
        </div>
        <div style={{ marginTop: 8, position:'relative', height: 14, background: A.rule2, border: '1px solid ' + A.rule2 }}>
          {/* recommended threshold at 30% */}
          <div style={{ position:'absolute', top: 0, bottom: 0, width: '30%', background: t.accent, opacity: 0.18 }} />
          <div style={{ position:'absolute', top: 0, bottom: 0, width: (Math.min(util, 1)*100) + '%', background: util > 0.3 ? A.neg : t.accent }} />
          <div style={{ position:'absolute', top: -2, bottom: -2, left: '30%', width: 1, background: A.ink }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize: 9, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
          <span>$0</span><span>30% · RECOMMENDED</span><span>${limit.toLocaleString()}</span>
        </div>
      </div>
      <ARule style={{ marginTop: 16 }} />
      {/* statement card */}
      <div style={{ marginTop: 14 }}>
        <ALabel>STATEMENT · MAY {dueDay}</ALabel>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 1, marginTop: 8, border: '1px solid ' + A.rule2, background: A.rule2 }}>
          <ADetailCell label="STATEMENT BAL" val={fmtMoney(stmtBal, 'USD', t.decimals)} />
          <ADetailCell label="MIN DUE" val={fmtMoney(minDue, 'USD', t.decimals)} c={A.neg} />
          <ADetailCell label="APR" val={apr.toFixed(2) + '%'} />
          <ADetailCell label="DUE IN" val={(dueDay - 11) + ' DAYS'} />
        </div>
        <div style={{ display:'flex', gap: 8, marginTop: 12 }}>
          <button style={{ all:'unset', cursor:'pointer', flex: 1, textAlign:'center', padding:'12px', background: A.ink, color: A.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>PAY · MIN</button>
          <button style={{ all:'unset', cursor:'pointer', flex: 1, textAlign:'center', padding:'12px', background: t.accent, color: A.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>PAY · FULL</button>
        </div>
      </div>
      <ARule style={{ marginTop: 16 }} />
      {/* payoff projection */}
      <div style={{ padding: '14px 0' }}>
        <ALabel>PAYOFF · PROJECTION</ALabel>
        <div style={{ marginTop: 10 }}>
          {[
            { l: 'MIN ONLY',  mo: 84, paid: stmtBal + 982, color: A.neg },
            { l: '$100/MO',   mo: 14, paid: stmtBal + 142, color: A.ink },
            { l: 'FULL · MAY 28', mo: 0,  paid: stmtBal,        color: t.accent },
          ].map((r, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 60px 90px', padding:'9px 0', borderBottom:'1px solid '+A.rule2, alignItems:'baseline' }}>
              <div style={{ fontSize: 11, color: r.color, letterSpacing: 0.4 }}>{r.l}</div>
              <div style={{ fontSize: 10, color: A.muted, textAlign:'center', letterSpacing: 1 }}>{r.mo ? r.mo + ' MO' : 'NOW'}</div>
              <div style={{ fontSize: 11, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{fmtMoney(r.paid, 'USD', false)}</div>
            </div>
          ))}
        </div>
      </div>
      <ARule />
      <div style={{ padding: '14px 0 4px' }}>
        <ALabel>RECENT · CHARGES</ALabel>
      </div>
      {txns.map(tx => (
        <div key={tx.id} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid '+A.rule2 }}>
          <div style={{ minWidth:0, flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 2 }}>{dayLabel(tx.d)} · {catBreadcrumb(tx.path || [tx.cat])}</div>
          </div>
          <div style={{ fontSize: 12, fontVariantNumeric:'tabular-nums', color: A.ink }}>{fmtSigned(tx.amt, tx.ccy, t.decimals)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Goal detail ─────────────────────────────────────────────────────────
function AGoalDetail({ t, goalId = 'g1', onBack }) {
  const g = GOALS.find(x => x.id === goalId) || GOALS[0];
  const pct = g.current / g.target;
  const monthly = 800;
  const remaining = g.target - g.current;
  const monthsLeft = Math.ceil(remaining / monthly);
  // project current + monthly forward
  const projection = Array.from({ length: 12 }, (_, i) => Math.min(g.current + monthly * i, g.target));
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <button onClick={onBack} style={{ all:'unset', cursor:'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>GOAL · {goalId.toUpperCase()}</div>
      </div>
      <ARule thick />
      <div style={{ padding: '16px 0 8px' }}>
        <ALabel>{g.name}</ALabel>
        <div style={{ display:'flex', alignItems:'baseline', gap: 8, marginTop: 6 }}>
          <div style={{ fontSize: 32, fontVariantNumeric:'tabular-nums', letterSpacing: -1 }}>{fmtMoney(g.current, 'USD', t.decimals)}</div>
          <div style={{ fontSize: 14, color: A.muted, fontVariantNumeric:'tabular-nums' }}>/ {fmtMoney(g.target, 'USD', false)}</div>
        </div>
        <div style={{ fontSize: 11, color: t.accent, marginTop: 4 }}>{Math.round(pct*100)}% COMPLETE · {fmtMoney(remaining, 'USD', false)} REMAINING</div>
      </div>
      {/* progress bar with markers */}
      <div style={{ position:'relative', height: 28, background: A.rule2, border: '1px solid ' + A.rule2, marginTop: 8 }}>
        <div style={{ position:'absolute', inset: 0, width: (pct*100)+'%', background: t.accent }} />
        {[0.25, 0.5, 0.75].map(m => (
          <div key={m} style={{ position:'absolute', top: 0, bottom: 0, left: (m*100)+'%', width: 1, background: A.bg, opacity: 0.6 }} />
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize: 9, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
        <span>0%</span><span>25</span><span>50</span><span>75</span><span>100%</span>
      </div>
      <ARule style={{ marginTop: 16 }} />
      {/* stats grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 1, marginTop: 12, border:'1px solid '+A.rule2, background: A.rule2 }}>
        <ADetailCell label="MONTHLY" val={fmtMoney(monthly, 'USD', false)} />
        <ADetailCell label="ETA" val={monthsLeft + ' MO'} c={t.accent} />
        <ADetailCell label="OPENED" val="JAN 2024" />
        <ADetailCell label="ON TRACK" val="YES" c={t.accent} />
      </div>
      <ARule style={{ marginTop: 16 }} />
      {/* projection chart */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>PROJECTION · 12 MO</ALabel>
        <div style={{ marginTop: 12, position:'relative', height: 100 }}>
          <AsciiSpark data={projection} width={354} height={100} stroke={t.accent} />
          {/* target line */}
          <div style={{ position:'absolute', left: 0, right: 0, top: 4, height: 1, background: A.ink, opacity: 0.5 }} />
          <div style={{ position:'absolute', right: 0, top: -10, fontSize: 9, color: A.muted, letterSpacing: 1 }}>TARGET · {fmtMoney(g.target, 'USD', false)}</div>
        </div>
      </div>
      <ARule style={{ marginTop: 8 }} />
      <div style={{ padding: '14px 0 4px' }}>
        <ALabel>CONTRIBUTIONS · RECENT</ALabel>
      </div>
      {[
        ['MAY 01', 800, 'AUTO'],
        ['APR 01', 800, 'AUTO'],
        ['MAR 14', 500, 'MANUAL'],
        ['MAR 01', 800, 'AUTO'],
        ['FEB 01', 800, 'AUTO'],
      ].map(([d, v, k], i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid '+A.rule2, fontSize: 12 }}>
          <div style={{ display:'flex', gap: 14 }}>
            <span style={{ color: A.muted, width: 50, letterSpacing: 1 }}>{d}</span>
            <span style={{ fontSize: 9, color: A.muted, letterSpacing: 1, alignSelf:'center' }}>{k}</span>
          </div>
          <div style={{ fontVariantNumeric:'tabular-nums', color: t.accent }}>+{fmtMoney(v, 'USD', t.decimals)}</div>
        </div>
      ))}
      <button style={{ all:'unset', cursor:'pointer', display:'block', textAlign:'center', width:'100%', padding:'14px', background: A.ink, color: A.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700, marginTop: 16 }}>+ CONTRIBUTE</button>
    </div>
  );
}

// ─── Bills & Subscriptions hub ───────────────────────────────────────────
function ABillsHub({ t }) {
  // Build a 30-day timeline of upcoming bills
  const timeline = Array.from({ length: 30 }, (_, i) => {
    return BILLS.filter(b => b.day === ((11 + i - 1) % 31) + 1);
  });
  const monthly = BILLS.reduce((s, b) => s + b.amt, 0);
  const subsOnly = BILLS.filter(b => b.cat === 'subs');
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>RECURRING</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink }}>+ ADD</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0 8px' }}>
        <ALabel>[01] MONTHLY · TOTAL</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric:'tabular-nums', letterSpacing: -1, marginTop: 4 }}>{fmtMoney(monthly, 'USD', t.decimals)}</div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>{BILLS.length} ACTIVE · {subsOnly.length} SUBSCRIPTIONS</div>
      </div>
      <ARule />
      {/* timeline strip */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[02] NEXT · 30 · DAYS</ALabel>
        <div style={{ marginTop: 10, display:'grid', gridTemplateColumns:'repeat(30, 1fr)', gap: 2 }}>
          {timeline.map((day, i) => {
            const total = day.reduce((s,b)=>s+b.amt, 0);
            const has = day.length > 0;
            return (
              <div key={i} style={{
                height: 36, background: has ? t.accent : A.rule2,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end',
                paddingBottom: 2, position:'relative',
                opacity: has ? Math.min(1, 0.4 + (total/2500)) : 1,
              }}>
                {has && <div style={{ fontSize: 8, color: A.bg, fontWeight: 700 }}>{day.length}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize: 9, color: A.muted, marginTop: 6, letterSpacing: 1 }}>
          <span>MAY 11</span><span>MAY 25</span><span>JUN 10</span>
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      {/* bills list */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[03] BILLS · {BILLS.filter(b => b.cat !== 'subs').length}</ALabel>
        {BILLS.filter(b => b.cat !== 'subs').map((b, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: t.density==='compact'?'9px 0':'12px 0', borderBottom:'1px solid '+A.rule2 }}>
            <div style={{ display:'flex', gap: 14, alignItems:'center' }}>
              <div style={{ fontSize: 16, fontVariantNumeric:'tabular-nums', width: 30, color: A.ink, letterSpacing:-0.5 }}>{String(b.day).padStart(2,'0')}</div>
              <div>
                <div style={{ fontSize: 13 }}>{b.name}</div>
                <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 2 }}>{ACCOUNTS.find(a=>a.id===b.acct).code} · MONTHLY</div>
              </div>
            </div>
            <div style={{ fontSize: 13, fontVariantNumeric:'tabular-nums' }}>{fmtMoney(b.amt, 'USD', t.decimals)}</div>
          </div>
        ))}
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[04] SUBSCRIPTIONS · {subsOnly.length}</ALabel>
        {subsOnly.map((b, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: t.density==='compact'?'9px 0':'12px 0', borderBottom:'1px solid '+A.rule2 }}>
            <div style={{ display:'flex', gap: 14, alignItems:'center' }}>
              <div style={{ fontSize: 14, width: 16, textAlign:'center', color: t.accent }}>∞</div>
              <div>
                <div style={{ fontSize: 13 }}>{b.name}</div>
                <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 2 }}>RENEWS · {String(b.day).padStart(2,'0')} EACH MONTH</div>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize: 13, fontVariantNumeric:'tabular-nums' }}>{fmtMoney(b.amt, 'USD', t.decimals)}</div>
              <div style={{ fontSize: 9, color: A.muted, marginTop: 2, letterSpacing: 1 }}>{fmtMoney(b.amt * 12, 'USD', false)} / YR</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, padding: '12px', border: '1.5px solid ' + A.ink, fontSize: 11, lineHeight: 1.6 }}>
        <div style={{ fontSize: 9, letterSpacing: 1.4, color: A.muted, marginBottom: 6 }}>DETECTED · UNUSED</div>
        NYTIMES · NOT OPENED IN 30 DAYS<br/>
        <span style={{ color: A.muted }}>SAVES {fmtMoney(204, 'USD', false)} / YR</span><br/>
        <span style={{ display:'inline-block', marginTop: 6, color: A.neg, letterSpacing: 1.2 }}>CANCEL ▸</span>
      </div>
    </div>
  );
}

// ─── Categories tree editor (the big "make-your-own-tree" screen) ───────
function ACategoriesEditor({ t, onBack }) {
  const [expanded, setExpanded] = React.useState({ edu: true, 'edu.school': true, 'edu.school.supplies': true });
  const [adding, setAdding] = React.useState(null);
  const [newName, setNewName] = React.useState('');
  const [extras, setExtras] = React.useState({}); // parentPath -> [{name}]

  const toggle = (k) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  // recursive render
  const renderNode = (key, node, path, depth) => {
    const id = path.join('.');
    const children = node.children || {};
    const extraKids = extras[id] || [];
    const hasKids = Object.keys(children).length + extraKids.length > 0;
    const isOpen = expanded[id];
    const isLeaf = !hasKids;
    return (
      <div key={id}>
        <div style={{
          display:'flex', alignItems:'center', padding: '9px 0',
          paddingLeft: depth * 16, borderBottom: '1px solid ' + A.rule2,
        }}>
          <button onClick={() => hasKids ? toggle(id) : null} style={{ all:'unset', cursor: hasKids ? 'pointer' : 'default', width: 18, color: A.ink2, fontSize: 12 }}>
            {hasKids ? (isOpen ? '−' : '+') : '·'}
          </button>
          <span style={{ fontSize: 12, letterSpacing: depth === 0 ? 1.2 : 0.4, fontWeight: depth === 0 ? 600 : 400, color: A.ink, flex: 1 }}>
            {node.glyph ? node.glyph + ' ' : ''}{node.label || key}
          </span>
          {depth > 0 && <span style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{path.slice(0, -1).map(p => p.toUpperCase()).join('›')}</span>}
          <button onClick={() => setAdding(id)} title="Add sub-category" style={{ all:'unset', cursor:'pointer', width: 24, height: 20, textAlign:'center', fontSize: 11, color: A.muted, marginLeft: 6 }}>+</button>
        </div>
        {/* inline add row */}
        {adding === id && (
          <div style={{ display:'flex', gap: 8, padding: '8px 0', paddingLeft: (depth + 1) * 16, borderBottom: '1px solid ' + A.rule2, background: A.bg }}>
            <span style={{ fontSize: 11, color: A.muted, alignSelf:'center', letterSpacing: 1 }}>›</span>
            <input
              autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="NEW · SUB · CATEGORY"
              onKeyDown={e => {
                if (e.key === 'Enter' && newName.trim()) {
                  setExtras(x => ({ ...x, [id]: [...(x[id] || []), { name: newName.trim().toUpperCase() }] }));
                  setExpanded(e => ({ ...e, [id]: true }));
                  setNewName(''); setAdding(null);
                }
                if (e.key === 'Escape') { setNewName(''); setAdding(null); }
              }}
              style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '2px 0', color: A.ink, letterSpacing: 0.8 }}
            />
            <button onClick={() => { setNewName(''); setAdding(null); }} style={{ all:'unset', cursor:'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>×</button>
          </div>
        )}
        {/* children */}
        {isOpen && (
          <>
            {Object.entries(children).map(([k, n]) => renderNode(k, n, [...path, k], depth + 1))}
            {extraKids.map((c, i) => renderNode('x' + i, { label: c.name }, [...path, 'x' + i], depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <button onClick={onBack} style={{ all:'unset', cursor:'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>SETTINGS</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0 8px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>CATEGORIES</div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 4, lineHeight: 1.6 }}>
          NEST AS DEEP AS YOU NEED. TAP <span style={{ color: A.ink }}>+</span> ON ANY ROW TO ADD A SUB-CATEGORY. EXAMPLE: EDUCATION › SCHOOL › SUPPLIES › PENCILS.
        </div>
      </div>
      <ARule />
      <div style={{ marginTop: 4 }}>
        {Object.entries(CATEGORY_TREE).map(([k, n]) => renderNode(k, n, [k], 0))}
      </div>
      <div style={{ marginTop: 16, padding: '12px', border: '1.5px dashed ' + A.ink, fontSize: 10, color: A.muted, letterSpacing: 1, textAlign:'center', cursor:'pointer' }}>
        + ADD · TOP · LEVEL · CATEGORY
      </div>
    </div>
  );
}

// ─── Settings tree (entry to categories, rules, export, etc.) ──────────
function ASettings({ t, onOpenCategories, onLink }) {
  const groups = [
    { title: 'PROFILE', rows: [
      ['ACCOUNT',          'm@example.com'],
      ['CURRENCY',         'USD · €, £ ALSO'],
      ['NOTIFICATIONS',    'ON · 4'],
    ]},
    { title: 'DATA', rows: [
      ['LINKED · INSTITUTIONS',    ACCOUNTS.length + '', '_link'],
      ['CATEGORIES',               Object.keys(CATEGORY_TREE).length + ' · NESTED', '_cat'],
      ['AUTOMATIC · RULES',        '12 ACTIVE'],
      ['MERCHANTS',                MERCHANTS.length + ''],
    ]},
    { title: 'BUDGETS', rows: [
      ['BUDGET · PERIOD',  'MONTHLY · 1 → 31'],
      ['ROLLOVER',         'OFF'],
      ['ALERTS',           '80% · LIMIT'],
    ]},
    { title: 'SECURITY', rows: [
      ['FACE · ID',        'ON'],
      ['PASSCODE',         'SET'],
      ['SESSIONS',         '2 DEVICES'],
    ]},
    { title: 'EXPORT', rows: [
      ['CSV · TRANSACTIONS',  '↓'],
      ['OFX · 30 DAYS',       '↓'],
      ['PDF · STATEMENT',     '↓'],
    ]},
    { title: 'ABOUT', rows: [
      ['VERSION',          'v1.0 · 11 MAY 26'],
      ['HELP',             '▸'],
      ['LICENSE',          'GPL · 3.0'],
    ]},
  ];
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>SETTINGS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>v1.0</div>
      </div>
      <ARule thick />
      {groups.map(g => (
        <div key={g.title} style={{ marginTop: 14 }}>
          <ALabel>{g.title}</ALabel>
          <div style={{ marginTop: 6 }}>
            {g.rows.map(([k, v, action], i) => (
              <button key={i} onClick={() => action === '_cat' ? onOpenCategories() : action === '_link' ? onLink() : null} style={{ all:'unset', cursor:'pointer', display:'block', width:'100%' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: t.density==='compact'?'9px 0':'11px 0', borderBottom:'1px solid '+A.rule2 }}>
                  <span style={{ fontSize: 12 }}>{k}</span>
                  <span style={{ fontSize: 11, color: A.muted }}>{v} {action ? ' ▸' : ''}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Onboarding · 3-step flow inside one frame ──────────────────────────
function AOnboarding({ t }) {
  const [step, setStep] = React.useState(0);
  const totalSteps = 3;

  const institutions = [
    { code: 'CHK', name: 'CHASE',    type: 'BANK', linked: true },
    { code: 'SAV', name: 'ALLY',     type: 'BANK', linked: true },
    { code: 'CC',  name: 'AMEX',     type: 'CARD', linked: true },
    { code: 'CC',  name: 'CHASE SAPPHIRE', type: 'CARD', linked: true },
    { code: 'INV', name: 'VANGUARD', type: 'BROKER', linked: false },
    { code: 'INV', name: 'FIDELITY', type: 'BROKER', linked: true },
    { code: 'CRY', name: 'COINBASE', type: 'WALLET', linked: true },
    { code: 'FX',  name: 'WISE',     type: 'FX', linked: true },
  ];

  return (
    <div style={{ padding: '24px 0 0', height:'100%', display:'flex', flexDirection:'column' }}>
      {/* progress strip */}
      <div style={{ padding: '0 18px', display:'flex', gap: 4 }}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 2, background: i <= step ? A.ink : A.rule2 }} />
        ))}
      </div>
      <div style={{ padding: '14px 18px 8px', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize: 10, letterSpacing: 1.4, color: A.muted }}>STEP {step + 1} / {totalSteps}</div>
        {step > 0 && step < totalSteps - 1 && (
          <button onClick={() => setStep(totalSteps - 1)} style={{ all:'unset', cursor:'pointer', fontSize: 10, letterSpacing: 1.4, color: A.muted }}>SKIP ▸</button>
        )}
      </div>

      <div style={{ flex: 1, overflow:'auto', padding: '0 18px' }}>
        {step === 0 && (
          <div style={{ padding: '40px 0 0' }}>
            <ARule thick />
            <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1, marginTop: 18 }}>
              LEDGER<span style={{ color: t.accent }}>.</span>
            </div>
            <div style={{ fontSize: 18, marginTop: 18, lineHeight: 1.4, letterSpacing: -0.2 }}>
              YOUR MONEY,<br/>
              ON ONE PAGE.
            </div>
            <div style={{ fontSize: 12, color: A.muted, marginTop: 18, lineHeight: 1.7, letterSpacing: 0.4 }}>
              ACCOUNTS, CARDS, INVESTMENTS, CRYPTO &amp; CASH — TRACKED IN A SINGLE LIVE LEDGER. MULTI-CURRENCY. NO ADS. NO SELLING DATA.
            </div>
            <div style={{ marginTop: 24, padding: '14px 0', borderTop: '2px solid ' + A.ink, borderBottom: '1px solid ' + A.rule2 }}>
              {[
                ['8',  'INSTITUTIONS · CAN LINK'],
                ['∞',  'CUSTOM · NESTED CATEGORIES'],
                ['256','BIT · ENCRYPTION · READ-ONLY'],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', gap: 14, padding:'8px 0', borderBottom: '1px solid '+A.rule2, fontSize: 11 }}>
                  <span style={{ width: 36, color: t.accent, fontWeight: 700 }}>{k}</span>
                  <span style={{ color: A.ink2, letterSpacing: 0.6 }}>{v}</span>
                </div>
              )).slice(0, 3)}
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ padding: '20px 0 0' }}>
            <ARule thick />
            <div style={{ padding: '16px 0' }}>
              <ALabel>STEP · 02</ALabel>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, marginTop: 6, lineHeight: 1.2 }}>
                LINK YOUR<br/>ACCOUNTS.
              </div>
              <div style={{ fontSize: 11, color: A.muted, marginTop: 8, lineHeight: 1.6 }}>
                READ-ONLY ACCESS VIA YOUR BANK'S OWN PORTAL. WE NEVER STORE PASSWORDS.
              </div>
            </div>
            <ARule />
            <div style={{ padding: '12px 0' }}>
              {institutions.map(inst => (
                <div key={inst.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid '+A.rule2 }}>
                  <div style={{ display:'flex', gap: 14, alignItems:'center' }}>
                    <span style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8, width: 28 }}>{inst.code}</span>
                    <div>
                      <div style={{ fontSize: 13 }}>{inst.name}</div>
                      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginTop: 2 }}>{inst.type}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, letterSpacing: 1.4, color: inst.linked ? t.accent : A.muted }}>
                    {inst.linked ? '● LINKED' : '+ LINK'}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 0', textAlign:'center' }}>
              <span style={{ fontSize: 10, letterSpacing: 1.6, color: A.ink2 }}>+ ADD · ANOTHER · INSTITUTION</span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ padding: '20px 0 0' }}>
            <ARule thick />
            <div style={{ padding: '20px 0' }}>
              <ALabel>STEP · 03</ALabel>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, marginTop: 6, lineHeight: 1.2 }}>
                CHOOSE YOUR<br/>VIEW.
              </div>
              <div style={{ fontSize: 11, color: A.muted, marginTop: 8, lineHeight: 1.6 }}>
                PICK A HEADLINE NUMBER FOR YOUR HOME SCREEN. YOU CAN CHANGE THIS ANY TIME.
              </div>
            </div>
            {HERO_METRICS.map((h, i) => (
              <button key={h.key} onClick={() => null} style={{ all:'unset', cursor:'pointer', display:'block', width:'100%' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 0', borderBottom:'1px solid '+A.rule2 }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 1.4, color: A.muted }}>OPTION · {String(i+1).padStart(2,'0')}</div>
                    <div style={{ fontSize: 14, marginTop: 4 }}>{h.label}</div>
                  </div>
                  <div style={{ fontSize: 18, fontVariantNumeric:'tabular-nums', letterSpacing: -0.4 }}>{fmtMoney(h.value, 'USD', false)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* nav */}
      <div style={{ padding: '18px 18px 28px', display:'flex', gap: 10, borderTop: '1px solid ' + A.rule2 }}>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{ all:'unset', cursor:'pointer', flex: 1, textAlign:'center', padding:'14px', border: '1.5px solid ' + A.ink, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◂ BACK</button>
        )}
        <button onClick={() => setStep(s => Math.min(totalSteps - 1, s + 1))} style={{ all:'unset', cursor:'pointer', flex: 2, textAlign:'center', padding:'14px', background: step === totalSteps - 1 ? t.accent : A.ink, color: A.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          {step === 0 ? 'GET STARTED ▸' : step === 1 ? 'CONTINUE ▸' : 'OPEN LEDGER ↵'}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { AReports, AReportsCalendar, ACCDetail, AGoalDetail, ABillsHub, ACategoriesEditor, ASettings, AOnboarding });
