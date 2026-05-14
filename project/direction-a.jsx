// Direction A — "LEDGER" — light brutalist mono, heavy 2px rules, muted accent.
// Renders a full interactive mobile prototype + a web companion dashboard.

const A = {
  bg:      '#f4f1ea',
  bg2:     '#ecе7dd',
  ink:     '#15130f',
  ink2:    '#4a463e',
  muted:   '#8c8678',
  rule:    '#15130f',
  rule2:   '#bdb6a3',
  pos:     'oklch(54% 0.13 145)',
  neg:     'oklch(52% 0.17 25)',
  font:    '"IBM Plex Mono", "JetBrains Mono", ui-monospace, Menlo, monospace',
};

// utility — read tweaks
function useT() { return (window.useTweaks_AB && window.useTweaks_AB()) || { dark:false, accent:A.pos, density:'comfortable', decimals:true }; }

// ─── ascii sparkline ─────────────────────────────────────────────────────
function AsciiSpark({ data, width = 280, height = 56, stroke = A.ink, hover = null, onScrub }) {
  const ref = React.useRef();
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [i * (width / (data.length - 1)), height - ((v - min) / range) * height]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const hi = hover != null ? Math.max(0, Math.min(data.length - 1, hover)) : null;
  return (
    <svg ref={ref} width={width} height={height} style={{ display:'block', cursor:'crosshair' }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1));
        onScrub && onScrub(i);
      }}
      onPointerLeave={() => onScrub && onScrub(null)}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" />
      {hi != null && (
        <>
          <line x1={pts[hi][0]} y1={0} x2={pts[hi][0]} y2={height} stroke={stroke} strokeWidth="0.6" strokeDasharray="2 2" />
          <circle cx={pts[hi][0]} cy={pts[hi][1]} r="3" fill={A.bg} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

// ─── shared cells ────────────────────────────────────────────────────────
const ARule = ({ thick, c = A.rule, style }) => (
  <div style={{ height: thick ? 2 : 1, background: c, ...style }} />
);
const ALabel = ({ children, style }) => (
  <div style={{ fontSize: 10, letterSpacing: 1.4, color: A.ink2, textTransform: 'uppercase', ...style }}>{children}</div>
);

// ─── Mobile screens ──────────────────────────────────────────────────────
function AHome({ t, onAcct, onAddTx, onHero }) {
  const [heroIdx, setHeroIdx] = React.useState(0);
  const [scrub, setScrub] = React.useState(null);
  const hero = HERO_METRICS[heroIdx];
  const accent = (hero.invert ? (scrub != null ? A.neg : A.ink) : t.accent);
  const displayVal = scrub != null ? hero.spark[scrub] : hero.value;
  const dateLbl = scrub != null ? dayLabel(29 - scrub) : 'MAY 11 · 2026';
  return (
    <div style={{ padding: '0 18px 100px' }}>
      {/* Brand strip */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>LEDGER</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink2 }}>11 MAY · {dateLbl.split('·')[0].trim()}</div>
      </div>
      <ARule thick />
      {/* Hero */}
      <div style={{ padding: '14px 0 10px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <ALabel>[01] {hero.label}</ALabel>
          <div style={{ fontSize: 10, color: A.muted, letterSpacing: 1 }}>{dateLbl}</div>
        </div>
        <div onClick={() => { setHeroIdx((heroIdx + 1) % HERO_METRICS.length); onHero && onHero(); }}
          style={{ cursor:'pointer', marginTop: 6, marginBottom: 8, fontSize: 38, fontWeight: 500, letterSpacing: -1.2, fontVariantNumeric:'tabular-nums', lineHeight: 1 }}>
          {fmtMoney(displayVal, hero.ccy, t.decimals)}
          {hero.unit && <span style={{ fontSize: 14, color: A.muted, marginLeft: 6 }}>{hero.unit}</span>}
        </div>
        <div style={{ display:'flex', gap: 10, alignItems:'center', fontSize: 11, letterSpacing: 0.4 }}>
          <span style={{ color: hero.delta >= 0 ? (hero.invert ? A.neg : t.accent) : (hero.invert ? t.accent : A.neg) }}>
            {fmtSigned(hero.delta, hero.ccy, t.decimals)} · {fmtPct(hero.deltaPct)}
          </span>
          <span style={{ color: A.muted }}>30D</span>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', gap: 4 }}>
            {HERO_METRICS.map((_, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 0, background: i === heroIdx ? A.ink : A.rule2 }} />
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, position:'relative' }}>
          <AsciiSpark data={hero.spark} width={354} height={64} stroke={accent} hover={scrub} onScrub={setScrub} />
        </div>
      </div>
      <ARule />
      {/* Accounts mini-list */}
      <div style={{ padding: '14px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <ALabel>[02] ACCOUNTS · 8</ALabel>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink }}>VIEW ALL ▸</div>
      </div>
      <div>
        {ACCOUNTS.slice(0, 5).map((a, i) => (
          <button key={a.id} onClick={() => onAcct(a.id)} style={{ all:'unset', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding: t.density === 'compact' ? '8px 0' : '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: A.muted, width: 28, letterSpacing: 0.8 }}>{a.type}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</span>
              <span style={{ fontSize: 10, color: A.muted }}>{a.code}</span>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize: 13, fontVariantNumeric:'tabular-nums', color: a.bal < 0 ? A.neg : A.ink }}>{fmtMoney(a.bal, a.ccy, t.decimals)}</div>
              <div style={{ fontSize: 9, color: a.delta < 0 ? A.neg : t.accent }}>{fmtSigned(a.delta, a.ccy, t.decimals)}</div>
            </div>
          </button>
        ))}
      </div>
      <ARule />
      {/* This month at a glance */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[03] MAY · CASH FLOW</ALabel>
        <div style={{ marginTop: 8, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 1, background: A.rule2, border: '1px solid ' + A.rule2 }}>
          {[
            { l: 'IN',  v: 13680.00, c: t.accent },
            { l: 'OUT', v: -5234.18, c: A.neg },
            { l: 'NET', v: 8445.82,  c: A.ink },
          ].map((x) => (
            <div key={x.l} style={{ background: A.bg, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>{x.l}</div>
              <div style={{ fontSize: 16, fontVariantNumeric:'tabular-nums', color: x.c, marginTop: 4 }}>{fmtSigned(x.v, 'USD', t.decimals)}</div>
            </div>
          ))}
        </div>
      </div>
      <ARule style={{ marginTop: 14 }} />
      {/* Upcoming */}
      <div style={{ padding: '14px 0 0' }}>
        <ALabel>[04] UPCOMING · 7 DAYS</ALabel>
        {BILLS.slice(0, 3).map((b, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding: '9px 0', borderBottom:'1px solid ' + A.rule2, fontSize: 12 }}>
            <div style={{ display:'flex', gap: 10 }}>
              <span style={{ color: A.muted, width: 24 }}>{String(b.day).padStart(2, '0')}</span>
              <span style={{ fontWeight: 500 }}>{b.name}</span>
            </div>
            <div style={{ fontVariantNumeric:'tabular-nums' }}>{fmtMoney(b.amt, 'USD', t.decimals)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AAccounts({ t, onAcct }) {
  const groups = [
    ['CASH',        ACCOUNTS.filter(a => ['CHK','SAV','FX'].includes(a.type))],
    ['CREDIT',      ACCOUNTS.filter(a => a.type === 'CC')],
    ['INVESTMENTS', ACCOUNTS.filter(a => a.type === 'INV')],
    ['CRYPTO',      ACCOUNTS.filter(a => a.type === 'CRY')],
  ];
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>ACCOUNTS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.ink }}>+ LINK</div>
      </div>
      <ARule thick />
      <div style={{ padding: '14px 0' }}>
        <ALabel>TOTAL</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric:'tabular-nums', letterSpacing: -1, marginTop: 4 }}>{fmtMoney(NET_WORTH, 'USD', t.decimals)}</div>
      </div>
      <ARule />
      {groups.map(([title, rows]) => (
        <div key={title}>
          <div style={{ padding: '12px 0 8px', display:'flex', justifyContent:'space-between' }}>
            <ALabel>{title}</ALabel>
            <ALabel>{fmtMoney(rows.reduce((s,a)=>s+(a.ccy==='USD'?a.bal:a.bal*1.08),0), 'USD', t.decimals)}</ALabel>
          </div>
          {rows.map((a) => (
            <button key={a.id} onClick={() => onAcct(a.id)} style={{ all:'unset', cursor:'pointer', display:'block', width:'100%' }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding: t.density==='compact'?'8px 0':'12px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: A.muted, marginTop: 2 }}>{a.type} · {a.code}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize: 14, fontVariantNumeric:'tabular-nums', color: a.bal < 0 ? A.neg : A.ink }}>{fmtMoney(a.bal, a.ccy, t.decimals)}</div>
                  <div style={{ fontSize: 10, color: a.delta < 0 ? A.neg : t.accent, marginTop: 2 }}>{fmtSigned(a.delta, a.ccy, t.decimals)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function AAccountDetail({ t, accountId, onBack }) {
  const a = ACCOUNTS.find(x => x.id === accountId) || ACCOUNTS[0];
  const txns = TRANSACTIONS.filter(x => x.acct === a.id).slice(0, 10);
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <button onClick={onBack} style={{ all:'unset', cursor:'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <div style={{ fontSize: 10, letterSpacing: 1.2, color: A.muted }}>{a.type} · {a.code}</div>
      </div>
      <ARule thick />
      <div style={{ padding: '16px 0 8px' }}>
        <div style={{ fontSize: 11, letterSpacing: 1.4, color: A.muted, textTransform:'uppercase' }}>{a.name}</div>
        <div style={{ fontSize: 34, fontVariantNumeric:'tabular-nums', letterSpacing: -1, marginTop: 4, color: a.bal < 0 ? A.neg : A.ink }}>{fmtMoney(a.bal, a.ccy, t.decimals)}</div>
        <div style={{ fontSize: 11, color: a.delta < 0 ? A.neg : t.accent, marginTop: 2 }}>{fmtSigned(a.delta, a.ccy, t.decimals)} · 30D</div>
      </div>
      <div style={{ display:'flex', gap: 1, background: A.rule2, border:'1px solid ' + A.rule2, marginTop: 6 }}>
        {a.type === 'CC' ? (
          <>
            <ADetailCell label="CREDIT LIMIT" val={fmtMoney(10000, 'USD', t.decimals)} />
            <ADetailCell label="AVAILABLE" val={fmtMoney(10000 + a.bal, 'USD', t.decimals)} />
            <ADetailCell label="APR" val="22.74%" />
          </>
        ) : a.type === 'INV' ? (
          <>
            <ADetailCell label="COST BASIS" val={fmtMoney(a.bal * 0.78, 'USD', t.decimals)} />
            <ADetailCell label="GAIN" val={fmtSigned(a.bal * 0.22, 'USD', t.decimals)} c={t.accent} />
            <ADetailCell label="YIELD" val="1.42%" />
          </>
        ) : (
          <>
            <ADetailCell label="AVAILABLE" val={fmtMoney(a.bal, a.ccy, t.decimals)} />
            <ADetailCell label="APY" val={a.type==='SAV'?'4.20%':'0.00%'} />
            <ADetailCell label="STATEMENT" val="MAY 28" />
          </>
        )}
      </div>
      <ARule style={{ marginTop: 14 }} />
      <div style={{ padding: '14px 0 6px' }}><ALabel>RECENT · ACTIVITY</ALabel></div>
      {txns.map((tx) => (
        <div key={tx.id} style={{ display:'flex', justifyContent:'space-between', padding: t.density==='compact'?'7px 0':'10px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 0.6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dayLabel(tx.d)} · {catBreadcrumb(tx.path || [tx.cat])}</div>
          </div>
          <div style={{ fontSize: 13, fontVariantNumeric:'tabular-nums', color: tx.amt < 0 ? A.ink : t.accent, flexShrink: 0 }}>{fmtSigned(tx.amt, tx.ccy, t.decimals)}</div>
        </div>
      ))}
    </div>
  );
}
function ADetailCell({ label, val, c = A.ink }) {
  return (
    <div style={{ background: A.bg, padding: '10px 10px', flex: 1 }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 13, color: c, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{val}</div>
    </div>
  );
}

function ATransactions({ t, hidden, onSwipeHide, onCategorize, filter, setFilter }) {
  const visible = TRANSACTIONS.filter(x => !hidden.includes(x.id) && (filter === 'ALL' || (filter === 'EXP' ? x.amt < 0 : filter === 'INC' ? x.amt >= 0 : x.cat === filter.toLowerCase())));
  // group by day
  const byDay = {};
  visible.forEach(tx => { (byDay[tx.d] = byDay[tx.d] || []).push(tx); });
  const days = Object.keys(byDay).map(Number).sort((a,b)=>a-b);

  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>TRANSACTIONS</div>
        <div style={{ fontSize: 10, letterSpacing: 1.2 }}>{visible.length} · {fmtMoney(visible.reduce((s,x)=>s+Math.abs(x.amt),0), 'USD', false)}</div>
      </div>
      <ARule thick />
      {/* filter chips */}
      <div style={{ display:'flex', gap: 6, padding: '12px 0', overflowX:'auto', flexWrap:'nowrap' }}>
        {['ALL', 'EXP', 'INC', 'FOOD', 'DINING', 'TRANS', 'SUBS', 'SHOP'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            all:'unset', cursor:'pointer', padding:'4px 9px',
            border: '1px solid ' + (filter === f ? A.ink : A.rule2),
            background: filter === f ? A.ink : 'transparent',
            color: filter === f ? A.bg : A.ink,
            fontSize: 10, letterSpacing: 1.2,
          }}>{f}</button>
        ))}
      </div>
      {days.map(d => (
        <div key={d}>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 4px', borderTop: '1px solid ' + A.rule2 }}>
            <ALabel>{dayLabel(d)}</ALabel>
            <ALabel>{fmtSigned(byDay[d].reduce((s,x)=>s+x.amt,0), 'USD', t.decimals)}</ALabel>
          </div>
          {byDay[d].map(tx => (
            <SwipeRow key={tx.id} t={t} tx={tx} onHide={() => onSwipeHide(tx.id)} onCat={() => onCategorize(tx.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SwipeRow({ t, tx, onHide, onCat }) {
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const ref = React.useRef();
  const start = React.useRef(0);
  const onDown = (e) => { setDragging(true); start.current = e.clientX - dx; ref.current.setPointerCapture(e.pointerId); };
  const onMove = (e) => { if (!dragging) return; setDx(Math.max(-120, Math.min(120, e.clientX - start.current))); };
  const onUp = () => {
    setDragging(false);
    if (dx < -80) { onHide(); setDx(0); }
    else if (dx > 80) { onCat(); setDx(0); }
    else setDx(0);
  };
  return (
    <div style={{ position:'relative', borderBottom: '1px solid ' + A.rule2, background: A.bg, overflow:'hidden' }}>
      {/* underlay */}
      <div style={{ position:'absolute', inset: 0, display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 14px', fontSize: 10, letterSpacing: 1.4 }}>
        <span style={{ color: t.accent }}>◂ CATEGORIZE</span>
        <span style={{ color: A.neg }}>HIDE ▸</span>
      </div>
      <div ref={ref}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{
          background: A.bg, padding: t.density === 'compact' ? '8px 0' : '11px 0',
          transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform .2s', touchAction:'pan-y', cursor:'grab',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
        <div style={{ display:'flex', gap: 10, alignItems:'center', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, width: 16, textAlign:'center', flexShrink: 0 }}>{catGlyph(tx.path || [tx.cat])}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.name}</div>
            <div style={{ fontSize: 10, color: A.muted, marginTop: 2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {catBreadcrumb(tx.path || [tx.cat])} · {ACCOUNTS.find(a=>a.id===tx.acct).code}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, fontVariantNumeric:'tabular-nums', color: tx.amt >= 0 ? t.accent : A.ink }}>{fmtSigned(tx.amt, tx.ccy, t.decimals)}</div>
      </div>
    </div>
  );
}

function ABudgets({ t }) {
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>BUDGETS</div>
      </div>
      <ARule thick />
      <div style={{ padding:'14px 0 8px' }}>
        <ALabel>MAY · {Math.round(BUDGETS.reduce((s,b)=>s+b.spent,0))} / {BUDGETS.reduce((s,b)=>s+b.limit,0)}</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric:'tabular-nums', letterSpacing:-1, marginTop: 4 }}>{fmtMoney(BUDGETS.reduce((s,b)=>s+b.spent,0), 'USD', t.decimals)}</div>
        <div style={{ fontSize: 11, color: A.muted, marginTop: 2 }}>of {fmtMoney(BUDGETS.reduce((s,b)=>s+b.limit,0), 'USD', false)} · day 11 / 31</div>
      </div>
      <ARule />
      {BUDGETS.map(b => {
        const pct = Math.min(b.spent / b.limit, 1.2);
        const over = b.spent > b.limit;
        return (
          <div key={b.cat} style={{ padding: '12px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div style={{ fontSize: 12, letterSpacing: 1, fontWeight: 500 }}>{CATEGORIES[b.cat].glyph} {CATEGORIES[b.cat].label}</div>
              <div style={{ fontSize: 12, fontVariantNumeric:'tabular-nums', color: over ? A.neg : A.ink }}>{fmtMoney(b.spent, 'USD', t.decimals)} / {fmtMoney(b.limit, 'USD', false)}</div>
            </div>
            <div style={{ marginTop: 8, position:'relative', height: 8, background: A.rule2 }}>
              <div style={{ position:'absolute', inset: 0, width: (Math.min(pct, 1) * 100) + '%', background: over ? A.neg : t.accent }} />
              {over && <div style={{ position:'absolute', left:'100%', top:0, bottom: 0, width: ((pct - 1) * 100) + '%', background: A.neg, opacity: 0.4 }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AMore({ t }) {
  const sections = [
    ['REPORTS',     [['NET WORTH', '▲ 12.4%'], ['SPENDING', '▼ 22%'], ['CATEGORIES', '8'], ['MERCHANTS', '·']]],
    ['INVESTMENTS', [['HOLDINGS', '5'], ['PORTFOLIO', fmtMoney(279341, 'USD', false)], ['PERFORMANCE', '+18.4%']]],
    ['GOALS',       GOALS.map(g => [g.name, Math.round(g.current/g.target*100)+'%'])],
    ['RECURRING',   [['BILLS', BILLS.length+''], ['SUBSCRIPTIONS', '5'], ['NEXT 7D', '$2,532']]],
    ['SETTINGS',    [['LINKED ACCOUNTS', '8'], ['CATEGORIES', 'EDIT'], ['EXPORT', 'CSV / OFX'], ['THEME', t.dark ? 'DARK':'LIGHT']]],
  ];
  return (
    <div style={{ padding: '0 18px 100px' }}>
      <div style={{ padding: '10px 0 6px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>MORE</div>
      </div>
      <ARule thick />
      {sections.map(([title, rows]) => (
        <div key={title} style={{ marginTop: 12 }}>
          <ALabel>{title}</ALabel>
          <div style={{ marginTop: 6 }}>
            {rows.map(([k, v], i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding: t.density==='compact'?'8px 0':'10px 0', borderBottom: '1px solid ' + A.rule2 }}>
                <span style={{ fontSize: 12 }}>{k}</span>
                <span style={{ fontSize: 12, color: A.muted }}>{v} ▸</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Add-transaction bottom sheet ────────────────────────────────────────
function AAddSheet({ t, open, onClose }) {
  const [step, setStep] = React.useState(0);
  const [amt, setAmt] = React.useState('42.50');
  const [cat, setCat] = React.useState('dining');
  const [acct, setAcct] = React.useState('csp');
  React.useEffect(() => { if (open) setStep(0); }, [open]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:'absolute', inset: 0, background:'rgba(20,18,15,0.4)', zIndex: 30 }}>
      <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', left:0, right:0, bottom: 0, background: A.bg, padding: 18, borderTop: '2px solid ' + A.ink, animation:'aslide .2s ease-out' }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>NEW · TRANSACTION</div>
          <button onClick={onClose} style={{ all:'unset', cursor:'pointer', fontSize: 10, letterSpacing: 1.2 }}>CLOSE ×</button>
        </div>
        <ARule thick style={{ marginTop: 8 }} />
        <div style={{ padding: '16px 0' }}>
          <ALabel>AMOUNT · USD</ALabel>
          <div style={{ fontSize: 44, fontVariantNumeric:'tabular-nums', letterSpacing: -1, marginTop: 4 }}>$ {amt}</div>
        </div>
        <ARule />
        <div style={{ padding: '14px 0' }}>
          <ALabel>CATEGORY</ALabel>
          <div style={{ display:'flex', flexWrap:'wrap', gap: 6, marginTop: 8 }}>
            {Object.entries(CATEGORIES).slice(0, 8).map(([k, c]) => (
              <button key={k} onClick={() => setCat(k)} style={{ all:'unset', cursor:'pointer', padding:'5px 9px', border:'1px solid ' + (cat===k?A.ink:A.rule2), background: cat===k?A.ink:'transparent', color: cat===k?A.bg:A.ink, fontSize: 10, letterSpacing: 1.2 }}>{c.glyph} {c.label}</button>
            ))}
          </div>
        </div>
        <ARule />
        <div style={{ padding: '14px 0' }}>
          <ALabel>ACCOUNT</ALabel>
          <select value={acct} onChange={e=>setAcct(e.target.value)} style={{ marginTop: 8, width:'100%', fontFamily: A.font, fontSize: 13, padding: 8, border:'1px solid '+A.ink, background: A.bg }}>
            {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name} · {a.code}</option>)}
          </select>
        </div>
        <button onClick={onClose} style={{ all:'unset', cursor:'pointer', display:'block', textAlign:'center', width:'100%', padding: '14px', background: t.accent, color: A.bg, fontSize: 12, letterSpacing: 2, fontWeight: 700, marginTop: 6 }}>SAVE ↵</button>
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────
function ATabs({ tab, setTab, onAdd }) {
  const tabs = [
    { k: 'home',   l: 'HOME' },
    { k: 'acct',   l: 'ACCTS' },
    { k: 'add',    l: '+', center: true },
    { k: 'tx',     l: 'TX' },
    { k: 'more',   l: 'MORE' },
  ];
  return (
    <div style={{
      position:'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 24,
      background: A.bg, borderTop: '2px solid ' + A.ink, zIndex: 25,
    }}>
      <div style={{ display:'flex', justifyContent:'space-around', padding: '10px 0 6px' }}>
        {tabs.map(x => (
          <button key={x.k} onClick={() => x.k === 'add' ? onAdd() : setTab(x.k)} style={{
            all:'unset', cursor:'pointer',
            fontSize: x.center ? 18 : 10, letterSpacing: 1.4,
            color: tab === x.k ? A.ink : A.muted, fontWeight: tab===x.k?700:400,
            padding: '6px 10px',
            border: x.center ? '1.5px solid ' + A.ink : 'none',
            width: x.center ? 38 : 'auto', textAlign:'center',
          }}>{x.l}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Phone Frame ─────────────────────────────────────────────────────────
function APhone({ t }) {
  const [tab, setTab] = React.useState('home');
  const [acctId, setAcctId] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [hidden, setHidden] = React.useState([]);
  const [filter, setFilter] = React.useState('ALL');
  return (
    <div style={{ width: '100%', height: '100%', background: A.bg, color: A.ink, fontFamily: A.font, position:'relative', overflow:'hidden' }}>
      {/* status bar */}
      <div style={{ display:'flex', justifyContent:'space-between', padding: '12px 22px 4px', fontSize: 11, fontWeight: 600 }}>
        <div>09:41</div>
        <div style={{ letterSpacing: 1 }}>● ● ● ●</div>
      </div>
      <div style={{ height: 'calc(100% - 36px)', overflow:'auto' }}>
        {acctId
          ? <AAccountDetail t={t} accountId={acctId} onBack={() => setAcctId(null)} />
          : tab === 'home' ? <AHome t={t} onAcct={(id)=>setAcctId(id)} onAddTx={()=>setAdding(true)} />
          : tab === 'acct' ? <AAccounts t={t} onAcct={(id)=>setAcctId(id)} />
          : tab === 'tx'   ? <ATransactions t={t} hidden={hidden} onSwipeHide={(id)=>setHidden(h=>[...h,id])} onCategorize={()=>{}} filter={filter} setFilter={setFilter} />
          : tab === 'more' ? <AMore t={t} />
          : <AHome t={t} onAcct={(id)=>setAcctId(id)} onAddTx={()=>setAdding(true)} />}
      </div>
      <ATabs tab={tab} setTab={(k) => { setAcctId(null); setTab(k); }} onAdd={() => setAdding(true)} />
      <AAddSheet t={t} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

// ─── Web companion ───────────────────────────────────────────────────────
function AWeb({ t }) {
  const [scrub, setScrub] = React.useState(null);
  const heroVal = scrub != null ? SPARK_NW[scrub] : NET_WORTH;
  return (
    <div style={{ background: A.bg, color: A.ink, fontFamily: A.font, height: '100%', overflow:'auto' }}>
      <div style={{ padding: '28px 40px', display:'grid', gridTemplateColumns:'200px 1fr', gap: 40 }}>
        {/* sidebar */}
        <div>
          <div style={{ fontSize: 14, letterSpacing: 3, fontWeight: 700, marginBottom: 24 }}>LEDGER<span style={{ color: t.accent }}>.</span></div>
          {['DASHBOARD','ACCOUNTS','TRANSACTIONS','BUDGETS','INVESTMENTS','GOALS','BILLS','REPORTS','SETTINGS'].map((s,i)=>(
            <div key={s} style={{ padding:'7px 0', borderBottom:'1px solid '+A.rule2, fontSize: 11, letterSpacing: 1.4, fontWeight: i===0?700:400, color: i===0?A.ink:A.ink2 }}>
              [{String(i+1).padStart(2,'0')}] {s}
            </div>
          ))}
          <ALabel style={{ marginTop: 28 }}>LINKED · 8</ALabel>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 8, lineHeight: 1.7 }}>
            CHASE · AMEX · ALLY<br/>VANGUARD · FIDELITY<br/>COINBASE · WISE<br/><span style={{ color: t.accent }}>● SYNCED 09:41 PT</span>
          </div>
        </div>
        {/* main */}
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
            <div>
              <ALabel>[01] NET WORTH · MAY 11 2026</ALabel>
              <div style={{ fontSize: 64, letterSpacing: -2, fontVariantNumeric:'tabular-nums', lineHeight: 1, marginTop: 8 }}>{fmtMoney(heroVal, 'USD', t.decimals)}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                <span style={{ color: t.accent }}>{fmtSigned(3412.40, 'USD', t.decimals)} · {fmtPct(1.21)}</span>
                <span style={{ color: A.muted, marginLeft: 12 }}>30D</span>
              </div>
            </div>
            <div style={{ display:'flex', gap: 6 }}>
              {['1D','1W','1M','3M','1Y','MAX'].map((p,i)=>(
                <span key={p} style={{ fontSize: 10, letterSpacing: 1.2, padding:'5px 10px', border:'1px solid ' + (i===2?A.ink:A.rule2), background: i===2?A.ink:'transparent', color: i===2?A.bg:A.ink }}>{p}</span>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 18, borderTop:'2px solid '+A.ink, borderBottom:'1px solid '+A.rule2, paddingTop: 18 }}>
            <AsciiSpark data={SPARK_NW} width={780} height={160} stroke={t.accent} hover={scrub} onScrub={setScrub} />
            <div style={{ display:'flex', justifyContent:'space-between', fontSize: 9, color: A.muted, marginTop: 6 }}>
              <span>APR 11</span><span>APR 18</span><span>APR 25</span><span>MAY 2</span><span>MAY 11</span>
            </div>
          </div>

          <div style={{ marginTop: 28, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap: 28 }}>
            {/* accounts table */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <ALabel>[02] ACCOUNTS</ALabel>
                <ALabel>{fmtMoney(NET_WORTH, 'USD', false)}</ALabel>
              </div>
              <div style={{ marginTop: 8, borderTop:'2px solid '+A.ink }}>
                <div style={{ display:'grid', gridTemplateColumns:'30px 1fr 80px 110px 80px', padding:'8px 0', fontSize:9, color:A.muted, letterSpacing:1.2, borderBottom:'1px solid '+A.rule2 }}>
                  <div></div><div>NAME</div><div>CODE</div><div style={{textAlign:'right'}}>BALANCE</div><div style={{textAlign:'right'}}>30D</div>
                </div>
                {ACCOUNTS.map(a => (
                  <div key={a.id} style={{ display:'grid', gridTemplateColumns:'30px 1fr 80px 110px 80px', padding: t.density==='compact'?'7px 0':'10px 0', fontSize: 11, borderBottom:'1px solid '+A.rule2, alignItems:'center' }}>
                    <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8 }}>{a.type}</div>
                    <div>{a.name}</div>
                    <div style={{ color: A.muted, fontSize: 10 }}>{a.code}</div>
                    <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color: a.bal<0?A.neg:A.ink }}>{fmtMoney(a.bal, a.ccy, t.decimals)}</div>
                    <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color: a.delta<0?A.neg:t.accent, fontSize: 10 }}>{fmtSigned(a.delta, a.ccy, t.decimals)}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* right column */}
            <div>
              <ALabel>[03] MAY · BUDGETS</ALabel>
              <div style={{ marginTop: 8, borderTop:'2px solid '+A.ink }}>
                {BUDGETS.slice(0, 5).map(b => {
                  const pct = Math.min(b.spent/b.limit, 1.2);
                  const over = b.spent > b.limit;
                  return (
                    <div key={b.cat} style={{ padding:'9px 0', borderBottom:'1px solid '+A.rule2 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize: 10, letterSpacing: 1 }}>
                        <span>{CATEGORIES[b.cat].label}</span>
                        <span style={{ color: over?A.neg:A.ink, fontVariantNumeric:'tabular-nums' }}>{Math.round(b.spent)} / {b.limit}</span>
                      </div>
                      <div style={{ marginTop: 5, height: 4, background: A.rule2, position:'relative' }}>
                        <div style={{ position:'absolute', inset:0, width:(Math.min(pct,1)*100)+'%', background: over?A.neg:t.accent }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <ALabel style={{ marginTop: 24 }}>[04] UPCOMING · 7D</ALabel>
              <div style={{ marginTop: 8, borderTop:'2px solid '+A.ink }}>
                {BILLS.slice(0, 4).map((b,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', fontSize: 11, borderBottom:'1px solid '+A.rule2 }}>
                    <div style={{ display:'flex', gap: 10 }}><span style={{ color: A.muted, width: 24 }}>{String(b.day).padStart(2,'0')}</span><span>{b.name}</span></div>
                    <div style={{ fontVariantNumeric:'tabular-nums' }}>{fmtMoney(b.amt, 'USD', t.decimals)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <ALabel>[05] RECENT · TRANSACTIONS</ALabel>
            <div style={{ marginTop: 8, borderTop:'2px solid '+A.ink }}>
              {TRANSACTIONS.slice(0, 8).map(tx => (
                <div key={tx.id} style={{ display:'grid', gridTemplateColumns:'80px 16px 1fr 100px 100px', padding: t.density==='compact'?'7px 0':'9px 0', fontSize: 11, borderBottom:'1px solid '+A.rule2, alignItems:'center' }}>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{dayLabel(tx.d)}</div>
                  <div>{CATEGORIES[tx.cat].glyph}</div>
                  <div>{tx.name}<span style={{ color: A.muted, marginLeft: 8, fontSize: 10 }}>{CATEGORIES[tx.cat].label}</span></div>
                  <div style={{ color: A.muted, fontSize: 10 }}>{ACCOUNTS.find(a=>a.id===tx.acct).code}</div>
                  <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color: tx.amt>=0?t.accent:A.ink }}>{fmtSigned(tx.amt, tx.ccy, t.decimals)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { APhone, AWeb, A });
