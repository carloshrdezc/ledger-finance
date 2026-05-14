// Direction A — Web · expanded
// WebShell (sidebar + content slot) + page components for Transactions,
// Reports, Investments, Settings (with categories tree). 1180×820 artboards.

const ALabel2 = ({ children, style }) => (
  <div style={{ fontSize: 10, letterSpacing: 1.4, color: '#4a463e', textTransform: 'uppercase', ...style }}>{children}</div>
);

function WebShell({ active = 'dashboard', t, children }) {
  const items = [
    ['DASHBOARD','dashboard'], ['ACCOUNTS','accounts'], ['TRANSACTIONS','tx'],
    ['BUDGETS','budgets'], ['INVESTMENTS','investments'], ['GOALS','goals'],
    ['BILLS','bills'], ['REPORTS','reports'], ['SETTINGS','settings'],
  ];
  return (
    <div style={{ background: A.bg, color: A.ink, fontFamily: A.font, height:'100%', overflow:'auto' }}>
      <div style={{ padding: '28px 40px', display:'grid', gridTemplateColumns:'200px 1fr', gap: 40, minHeight: '100%', boxSizing:'border-box' }}>
        <div>
          <div style={{ fontSize: 14, letterSpacing: 3, fontWeight: 700, marginBottom: 24 }}>LEDGER<span style={{ color: t.accent }}>.</span></div>
          {items.map(([s, k], i) => (
            <div key={k} style={{ padding:'7px 0', borderBottom:'1px solid '+A.rule2, fontSize: 11, letterSpacing: 1.4, fontWeight: active===k?700:400, color: active===k?A.ink:A.ink2, cursor:'pointer' }}>
              [{String(i+1).padStart(2,'0')}] {s}
            </div>
          ))}
          <ALabel2 style={{ marginTop: 28 }}>LINKED · 8</ALabel2>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 8, lineHeight: 1.7 }}>
            CHASE · AMEX · ALLY<br/>VANGUARD · FIDELITY<br/>COINBASE · WISE<br/><span style={{ color: t.accent }}>● SYNCED 09:41 PT</span>
          </div>
          <ALabel2 style={{ marginTop: 28 }}>QUICK · ADD</ALabel2>
          <div style={{ marginTop: 8, padding: '10px 12px', border:'1.5px solid '+A.ink, fontSize: 11, letterSpacing: 1.2, cursor:'pointer', display:'flex', justifyContent:'space-between' }}>
            <span>+ TRANSACTION</span><span style={{ color: A.muted }}>⌘N</span>
          </div>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

// ─── Web · Transactions ──────────────────────────────────────────────────
function AWebTx({ t }) {
  const [filter, setFilter] = React.useState('ALL');
  const [search, setSearch] = React.useState('');
  const visible = TRANSACTIONS.filter(x => {
    if (filter !== 'ALL') {
      if (filter === 'EXP' && x.amt >= 0) return false;
      if (filter === 'INC' && x.amt < 0) return false;
      if (!['EXP','INC','ALL'].includes(filter) && x.cat !== filter.toLowerCase()) return false;
    }
    if (search && !x.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const total = visible.reduce((s,x)=>s+Math.abs(x.amt), 0);
  return (
    <WebShell active="tx" t={t}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div>
          <ALabel2>[01] TRANSACTIONS · MAY 2026</ALabel2>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric:'tabular-nums', lineHeight: 1, marginTop: 6 }}>{visible.length} <span style={{ color: A.muted, fontSize: 24 }}>· {fmtMoney(total, 'USD', false)}</span></div>
        </div>
        <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SEARCH…" style={{ fontFamily: A.font, fontSize: 11, padding:'6px 10px', border:'1px solid '+A.rule2, background: A.bg, color: A.ink, letterSpacing: 1, width: 160, outline:'none' }} />
          <button style={{ all:'unset', cursor:'pointer', fontSize: 10, letterSpacing: 1.2, padding:'6px 12px', border:'1px solid '+A.ink, background: A.ink, color: A.bg }}>EXPORT · CSV</button>
        </div>
      </div>
      {/* filter row */}
      <div style={{ display:'flex', gap: 6, marginTop: 16, flexWrap:'wrap' }}>
        {['ALL', 'EXP', 'INC', 'FOOD', 'DINING', 'TRANS', 'SUBS', 'SHOP', 'HEALTH', 'EDU', 'TRAVEL'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ all:'unset', cursor:'pointer', padding:'4px 10px', border: '1px solid ' + (filter === f ? A.ink : A.rule2), background: filter === f ? A.ink : 'transparent', color: filter === f ? A.bg : A.ink, fontSize: 10, letterSpacing: 1.2 }}>{f}</button>
        ))}
      </div>
      {/* table */}
      <div style={{ marginTop: 18, borderTop:'2px solid '+A.ink }}>
        <div style={{ display:'grid', gridTemplateColumns:'90px 24px 1fr 280px 90px 120px 30px', padding:'8px 0', fontSize:9, color:A.muted, letterSpacing:1.2, borderBottom:'1px solid '+A.rule2 }}>
          <div>DATE</div><div></div><div>MERCHANT</div><div>CATEGORY</div><div>ACCT</div><div style={{textAlign:'right'}}>AMOUNT</div><div></div>
        </div>
        {visible.map(tx => (
          <div key={tx.id} style={{ display:'grid', gridTemplateColumns:'90px 24px 1fr 280px 90px 120px 30px', padding: t.density==='compact'?'7px 0':'10px 0', fontSize: 11, borderBottom:'1px solid '+A.rule2, alignItems:'center' }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.d)}</div>
            <div>{catGlyph(tx.path || [tx.cat])}</div>
            <div style={{ fontSize: 12 }}>{tx.name}</div>
            <div style={{ color: A.ink2, fontSize: 10, letterSpacing: 0.6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{catBreadcrumb(tx.path || [tx.cat])}</div>
            <div style={{ color: A.muted, fontSize: 10 }}>{ACCOUNTS.find(a=>a.id===tx.acct).code}</div>
            <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color: tx.amt>=0?t.accent:A.ink }}>{fmtSigned(tx.amt, tx.ccy, t.decimals)}</div>
            <div style={{ textAlign:'right', color: A.muted, fontSize: 11, cursor:'pointer' }}>⋯</div>
          </div>
        ))}
      </div>
    </WebShell>
  );
}

// ─── Web · Reports ──────────────────────────────────────────────────────
function AWebReports({ t }) {
  const total = TRANSACTIONS.filter(x => x.amt < 0).reduce((s,x)=>s+Math.abs(x.ccy==='USD'?x.amt:x.amt*1.08), 0);
  const byCat = {};
  TRANSACTIONS.filter(x => x.amt < 0).forEach(x => {
    const k = (x.path || [x.cat])[0];
    const v = Math.abs(x.ccy === 'USD' ? x.amt : x.amt * 1.08);
    byCat[k] = (byCat[k] || 0) + v;
  });
  const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const max = cats[0] ? cats[0][1] : 1;

  // calendar 30 cells
  const cells = Array.from({ length: 30 }, (_, i) => {
    return TRANSACTIONS.filter(x => x.d === i && x.amt < 0).reduce((s,x)=>s+Math.abs(x.amt), 0);
  });
  const cellMax = Math.max(...cells, 1);

  return (
    <WebShell active="reports" t={t}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div>
          <ALabel2>[01] REPORTS · MAY 2026</ALabel2>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric:'tabular-nums', lineHeight: 1, marginTop: 6 }}>{fmtMoney(total, 'USD', t.decimals)} <span style={{ fontSize: 18, color: A.neg }}>{fmtSigned(total - 6713, 'USD', false)}</span></div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 6, letterSpacing: 1 }}>SPENT · VS · APR · {fmtMoney(6713, 'USD', false)}</div>
        </div>
        <div style={{ display:'flex', gap: 6 }}>
          {['7D','30D','90D','1Y','MAX'].map((p,i)=>(
            <span key={p} style={{ fontSize: 10, letterSpacing: 1.2, padding:'5px 10px', border:'1px solid ' + (i===1?A.ink:A.rule2), background: i===1?A.ink:'transparent', color: i===1?A.bg:A.ink, cursor:'pointer' }}>{p}</span>
          ))}
        </div>
      </div>

      {/* MoM big bars */}
      <div style={{ marginTop: 24, borderTop:'2px solid '+A.ink, paddingTop: 18 }}>
        <ALabel2>[02] MONTH · OVER · MONTH</ALabel2>
        <div style={{ display:'flex', alignItems:'flex-end', gap: 6, height: 180, marginTop: 18 }}>
          {MOM_SPEND.map((v, i) => {
            const mxx = Math.max(...MOM_SPEND);
            const h = (v / mxx) * 100;
            const isCurrent = i === MOM_SPEND.length - 1;
            return (
              <div key={i} style={{ flex: 1, display:'flex', flexDirection:'column', alignItems:'center', gap: 6 }}>
                <div style={{ fontSize: 9, color: A.muted, fontVariantNumeric:'tabular-nums' }}>{Math.round(v/100)*100}</div>
                <div style={{ width:'100%', height: h+'%', background: isCurrent ? t.accent : A.ink, opacity: isCurrent ? 1 : 0.82 }} />
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8 }}>
                  {['JUN','JUL','AUG','SEP','OCT','NOV','DEC','JAN','FEB','MAR','APR','MAY'][i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* two-column: categories + calendar */}
      <div style={{ marginTop: 28, display:'grid', gridTemplateColumns:'1.2fr 1fr', gap: 32 }}>
        <div>
          <ALabel2>[03] SPEND · BY · CATEGORY</ALabel2>
          <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink }}>
            {cats.map(([k, v]) => {
              const c = CATEGORY_TREE[k] || { label: k, glyph: '·' };
              const pct = (v / max) * 100;
              return (
                <div key={k} style={{ padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'20px 1fr 80px 60px', alignItems:'center', gap: 8 }}>
                    <div style={{ color: t.accent }}>{c.glyph}</div>
                    <div style={{ fontSize: 12 }}>{c.label}</div>
                    <div style={{ fontSize: 11, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{fmtMoney(v, 'USD', t.decimals)}</div>
                    <div style={{ fontSize: 10, color: A.muted, textAlign:'right' }}>{Math.round(v/total*100)}%</div>
                  </div>
                  <div style={{ marginTop: 6, marginLeft: 28, height: 4, background: A.rule2 }}>
                    <div style={{ width: pct + '%', height:'100%', background: t.accent }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <ALabel2>[04] CALENDAR · 30D</ALabel2>
          <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink, paddingTop: 16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap: 4 }}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={i} style={{ fontSize: 9, color: A.muted, letterSpacing: 1, textAlign:'center', paddingBottom: 4 }}>{d}</div>
              ))}
              {cells.map((v, i) => {
                const intensity = v / cellMax;
                const isToday = i === 0;
                return (
                  <div key={i} style={{
                    aspectRatio: '1.2',
                    background: v === 0 ? A.rule2 : `color-mix(in oklch, ${t.accent} ${Math.max(15, intensity * 100)}%, ${A.bg})`,
                    border: isToday ? '2px solid ' + A.ink : 'none',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <span style={{ fontSize: 10, color: intensity > 0.5 ? A.bg : A.ink2, fontVariantNumeric:'tabular-nums' }}>{29-i}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop: 14, fontSize: 9, letterSpacing: 1.2, color: A.muted }}>
              <span>LOW</span>
              <div style={{ display:'flex', gap: 3 }}>
                {[0.15, 0.35, 0.55, 0.75, 1].map((v, i) => (
                  <div key={i} style={{ width: 18, height: 10, background: `color-mix(in oklch, ${t.accent} ${v*100}%, ${A.bg})` }} />
                ))}
              </div>
              <span>HIGH · {fmtMoney(cellMax, 'USD', false)}</span>
            </div>
          </div>
          <ALabel2 style={{ marginTop: 28 }}>[05] DETECTED · INSIGHTS</ALabel2>
          <div style={{ marginTop: 8, borderTop:'2px solid '+A.ink }}>
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
      </div>

      {/* merchants */}
      <div style={{ marginTop: 28 }}>
        <ALabel2>[06] TOP · MERCHANTS</ALabel2>
        <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 120px', padding:'8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom:'1px solid '+A.rule2 }}>
            <div>MERCHANT</div><div>VISITS</div><div>AVG</div><div style={{ textAlign:'right' }}>TOTAL</div>
          </div>
          {MERCHANTS.map((m, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 120px', padding: t.density==='compact'?'7px 0':'10px 0', fontSize: 11, borderBottom:'1px solid '+A.rule2 }}>
              <div>{m.name}</div>
              <div style={{ color: A.muted }}>{m.n}×</div>
              <div style={{ fontVariantNumeric:'tabular-nums', color: A.muted }}>{fmtMoney(m.amt / m.n, 'USD', false)}</div>
              <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtMoney(m.amt, 'USD', t.decimals)}</div>
            </div>
          ))}
        </div>
      </div>
    </WebShell>
  );
}

// ─── Web · Investments ──────────────────────────────────────────────────
function AWebInvestments({ t }) {
  const totalPort = INVESTMENTS.reduce((s, i) => s + i.shares * i.price, 0);
  const dayChg = INVESTMENTS.reduce((s, i) => s + i.shares * i.price * i.chg / 100, 0);
  // allocation
  const alloc = INVESTMENTS.map(i => ({ ...i, val: i.shares * i.price, pct: (i.shares * i.price) / totalPort }));

  return (
    <WebShell active="investments" t={t}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div>
          <ALabel2>[01] PORTFOLIO · 11 MAY 2026</ALabel2>
          <div style={{ fontSize: 56, letterSpacing: -2, fontVariantNumeric:'tabular-nums', lineHeight: 1, marginTop: 8 }}>{fmtMoney(totalPort, 'USD', t.decimals)}</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>
            <span style={{ color: dayChg >= 0 ? t.accent : A.neg }}>{fmtSigned(dayChg, 'USD', t.decimals)}</span>
            <span style={{ color: A.muted, marginLeft: 10, fontSize: 11, letterSpacing: 1 }}>TODAY · {fmtPct(dayChg/totalPort*100)}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap: 6 }}>
          {['1D','1W','1M','3M','1Y','5Y','MAX'].map((p,i)=>(
            <span key={p} style={{ fontSize: 10, letterSpacing: 1.2, padding:'5px 10px', border:'1px solid '+(i===3?A.ink:A.rule2), background: i===3?A.ink:'transparent', color: i===3?A.bg:A.ink, cursor:'pointer' }}>{p}</span>
          ))}
        </div>
      </div>
      {/* sparkline (synthetic) */}
      <div style={{ marginTop: 16, borderTop:'2px solid '+A.ink, paddingTop: 18 }}>
        <AsciiSpark data={SPARK_NW.map(v => v * (totalPort / NET_WORTH))} width={840} height={160} stroke={t.accent} />
        <div style={{ display:'flex', justifyContent:'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
          <span>FEB 11</span><span>MAR 02</span><span>MAR 24</span><span>APR 15</span><span>MAY 11</span>
        </div>
      </div>

      {/* two columns */}
      <div style={{ marginTop: 28, display:'grid', gridTemplateColumns:'1.6fr 1fr', gap: 32 }}>
        {/* holdings */}
        <div>
          <ALabel2>[02] HOLDINGS</ALabel2>
          <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink }}>
            <div style={{ display:'grid', gridTemplateColumns:'70px 1fr 90px 90px 100px 90px', padding:'8px 0', fontSize: 9, color: A.muted, letterSpacing: 1.2, borderBottom:'1px solid '+A.rule2 }}>
              <div>TICKER</div><div>NAME</div><div style={{ textAlign:'right' }}>SHARES</div><div style={{ textAlign:'right' }}>PRICE</div><div style={{ textAlign:'right' }}>VALUE</div><div style={{ textAlign:'right' }}>DAY</div>
            </div>
            {INVESTMENTS.map(i => (
              <div key={i.ticker} style={{ display:'grid', gridTemplateColumns:'70px 1fr 90px 90px 100px 90px', padding: t.density==='compact'?'8px 0':'12px 0', fontSize: 12, borderBottom:'1px solid '+A.rule2, alignItems:'center' }}>
                <div style={{ fontWeight: 700, letterSpacing: 0.6 }}>{i.ticker}</div>
                <div style={{ color: A.muted, fontSize: 10, letterSpacing: 0.6 }}>{i.name}</div>
                <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color: A.muted }}>{i.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div>
                <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color: A.muted }}>{fmtMoney(i.price, 'USD', t.decimals)}</div>
                <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtMoney(i.shares * i.price, 'USD', t.decimals)}</div>
                <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color: i.chg >= 0 ? t.accent : A.neg, fontSize: 11 }}>{fmtPct(i.chg)}</div>
              </div>
            ))}
          </div>
          <ALabel2 style={{ marginTop: 28 }}>[04] PERFORMANCE</ALabel2>
          <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 1, background: A.rule2, border: '1px solid '+A.rule2 }}>
            {[['1M','+2.40%',t.accent],['3M','+8.12%',t.accent],['YTD','+12.4%',t.accent],['1Y','+18.4%',t.accent]].map(([k, v, c]) => (
              <div key={k} style={{ background: A.bg, padding:'14px 16px' }}>
                <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{k}</div>
                <div style={{ fontSize: 18, fontVariantNumeric:'tabular-nums', color: c, marginTop: 6 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {/* allocation */}
        <div>
          <ALabel2>[03] ALLOCATION</ALabel2>
          <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink, paddingTop: 18 }}>
            {/* horizontal stacked bar */}
            <div style={{ display:'flex', height: 36, border:'1px solid '+A.ink }}>
              {alloc.map((a, i) => {
                const shades = [t.accent, A.ink, '#8c8678', '#bdb6a3', '#4a463e'];
                return <div key={a.ticker} style={{ width: (a.pct*100)+'%', background: shades[i % shades.length], display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {a.pct > 0.08 && <span style={{ fontSize: 9, color: i === 0 || i === 2 ? A.bg : A.bg, letterSpacing: 1 }}>{a.ticker}</span>}
                </div>;
              })}
            </div>
            <div style={{ marginTop: 16 }}>
              {alloc.sort((a,b)=>b.val-a.val).map((a, i) => {
                const shades = [t.accent, A.ink, '#8c8678', '#bdb6a3', '#4a463e'];
                return (
                  <div key={a.ticker} style={{ display:'grid', gridTemplateColumns:'14px 60px 1fr 80px', padding:'9px 0', fontSize: 11, alignItems:'center', borderBottom:'1px solid '+A.rule2 }}>
                    <div style={{ width: 10, height: 10, background: shades[i % shades.length] }} />
                    <div style={{ fontWeight: 700 }}>{a.ticker}</div>
                    <div style={{ color: A.muted, fontSize: 10 }}>{(a.pct*100).toFixed(1)}%</div>
                    <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmtMoney(a.val, 'USD', false)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </WebShell>
  );
}

// ─── Web · Settings (with nested category editor inline) ────────────────
function AWebSettings({ t }) {
  const [expanded, setExpanded] = React.useState({ edu: true, 'edu.school': true, 'edu.school.supplies': true, food: true });
  const [adding, setAdding] = React.useState(null);
  const [newName, setNewName] = React.useState('');
  const [extras, setExtras] = React.useState({});

  const toggle = (k) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const renderNode = (key, node, path, depth) => {
    const id = path.join('.');
    const children = node.children || {};
    const extraKids = extras[id] || [];
    const hasKids = Object.keys(children).length + extraKids.length > 0;
    const isOpen = expanded[id];
    return (
      <div key={id}>
        <div style={{
          display:'flex', alignItems:'center', padding: '6px 0',
          paddingLeft: depth * 20, borderBottom: '1px solid ' + A.rule2,
        }}>
          <button onClick={() => hasKids ? toggle(id) : null} style={{ all:'unset', cursor: hasKids ? 'pointer' : 'default', width: 22, color: A.ink2, fontSize: 12 }}>
            {hasKids ? (isOpen ? '−' : '+') : '·'}
          </button>
          <span style={{ fontSize: 11, letterSpacing: depth === 0 ? 1.2 : 0.4, fontWeight: depth === 0 ? 600 : 400, color: A.ink, flex: 1 }}>
            {node.glyph ? node.glyph + ' ' : ''}{node.label || key}
          </span>
          <span style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginRight: 12 }}>
            {depth > 0 ? path.slice(0, -1).map(p => p.toUpperCase()).join(' › ') : 'TOP · LEVEL'}
          </span>
          <button onClick={() => setAdding(id)} style={{ all:'unset', cursor:'pointer', width: 22, textAlign:'center', fontSize: 12, color: A.muted }}>+</button>
        </div>
        {adding === id && (
          <div style={{ display:'flex', gap: 8, padding: '6px 0', paddingLeft: (depth + 1) * 20 + 22, borderBottom: '1px solid ' + A.rule2 }}>
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
              style={{ flex: 1, fontFamily: A.font, fontSize: 11, background: 'transparent', border: 'none', borderBottom: '1px solid ' + A.ink, outline: 'none', padding: '4px 0', color: A.ink, letterSpacing: 0.8 }}
            />
            <button onClick={() => { setNewName(''); setAdding(null); }} style={{ all:'unset', cursor:'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>× CANCEL</button>
          </div>
        )}
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
    <WebShell active="settings" t={t}>
      <ALabel2>[01] SETTINGS</ALabel2>
      <div style={{ fontSize: 36, letterSpacing: -1, marginTop: 8, fontWeight: 600 }}>Categories &amp; preferences</div>
      <div style={{ marginTop: 24, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap: 40 }}>
        {/* nested categories editor */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
            <ALabel2>[02] CATEGORY · TREE</ALabel2>
            <span style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>NEST AS DEEP AS YOU NEED · + ON ANY ROW</span>
          </div>
          <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink }}>
            {Object.entries(CATEGORY_TREE).map(([k, n]) => renderNode(k, n, [k], 0))}
          </div>
          <div style={{ marginTop: 16, padding: '10px 14px', border: '1.5px dashed ' + A.ink, fontSize: 10, color: A.ink2, letterSpacing: 1.2, textAlign:'center', cursor:'pointer' }}>
            + ADD · TOP · LEVEL · CATEGORY
          </div>
        </div>
        {/* preferences */}
        <div>
          <ALabel2>[03] PREFERENCES</ALabel2>
          <div style={{ marginTop: 12, borderTop:'2px solid '+A.ink }}>
            {[
              ['PROFILE', [['ACCOUNT', 'm@example.com'], ['CURRENCY', 'USD · EUR · GBP'], ['TIMEZONE', 'AMERICA / NEW_YORK']]],
              ['DATA', [['LINKED', '8 INSTITUTIONS'], ['RULES', '12 ACTIVE'], ['MERCHANTS', '47 KNOWN']]],
              ['BUDGETS', [['PERIOD', 'MONTHLY · 1→31'], ['ROLLOVER', 'OFF'], ['ALERTS', '80%']]],
              ['SECURITY', [['2FA', 'ON · APP'], ['BIOMETRICS', 'ENABLED'], ['SESSIONS', '2 DEVICES']]],
              ['EXPORT', [['CSV · 30D', '↓ DOWNLOAD'], ['OFX · 90D', '↓ DOWNLOAD'], ['PDF · STATEMENT', '↓ DOWNLOAD']]],
            ].map(([title, rows]) => (
              <div key={title} style={{ paddingTop: 16, paddingBottom: 4 }}>
                <ALabel2>{title}</ALabel2>
                <div style={{ marginTop: 4 }}>
                  {rows.map(([k, v], i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding: '8px 0', fontSize: 11, borderBottom:'1px solid '+A.rule2 }}>
                      <span style={{ letterSpacing: 0.4 }}>{k}</span>
                      <span style={{ color: A.muted }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WebShell>
  );
}

Object.assign(window, { WebShell, AWebTx, AWebReports, AWebInvestments, AWebSettings });
