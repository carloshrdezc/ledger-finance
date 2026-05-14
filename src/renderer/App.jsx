import React from 'react';
import { A } from './theme';
import { ALabel } from './components/Shared';
import { StoreProvider } from './store';
import ImportExport from './components/ImportExport';

// Mobile screens
import Home from './screens/mobile/Home';
import { Accounts, AccountDetail } from './screens/mobile/Accounts';
import Transactions from './screens/mobile/Transactions';
import Budgets from './screens/mobile/Budgets';
import More from './screens/mobile/More';
import AddSheet from './screens/mobile/AddSheet';
import {
  Reports, ReportsCalendar, CCDetail, GoalDetail,
  BillsHub, Settings, CategoriesEditor,
} from './screens/mobile/DetailScreens';

// Web screens
import Dashboard from './screens/web/Dashboard';
import WebTransactions from './screens/web/WebTransactions';
import WebAccounts from './screens/web/WebAccounts';
import WebBudgets from './screens/web/WebBudgets';
import WebGoals from './screens/web/WebGoals';
import WebBills from './screens/web/WebBills';
import WebReports from './screens/web/WebReports';
import WebInvestments from './screens/web/WebInvestments';
import WebSettings from './screens/web/WebSettings';
import WebAddModal from './screens/web/WebAddModal';

// ─── Tweaks ────────────────────────────────────────────────────────────────

const ACCENTS = [
  { label: 'GREEN',  val: '#1f6b3a' },
  { label: 'BLUE',   val: '#1a4f8a' },
  { label: 'AMBER',  val: '#b06000' },
  { label: 'VIOLET', val: '#5b2d8e' },
  { label: 'SLATE',  val: '#2f4858' },
];

function useLS(key, def) {
  const [v, setV] = React.useState(() => {
    try { const s = localStorage.getItem(key); return s !== null ? JSON.parse(s) : def; }
    catch { return def; }
  });
  const set = React.useCallback(u => setV(prev => {
    const next = typeof u === 'function' ? u(prev) : u;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    return next;
  }), [key]);
  return [v, set];
}

function useTweaks() {
  const [accent, setAccent]   = useLS('ledger:accent',   ACCENTS[0].val);
  const [density, setDensity] = useLS('ledger:density',  'comfortable');
  const [decimals, setDecimals] = useLS('ledger:decimals', true);
  return { accent, setAccent, density, setDensity, decimals, setDecimals };
}

function TweaksPanel({ t, setAccent, setDensity, setDecimals, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 280,
      background: A.bg, borderLeft: '2px solid ' + A.ink,
      zIndex: 1000, padding: 24, overflowY: 'auto', fontFamily: A.font,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <ALabel>TWEAKS</ALabel>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 18, color: A.muted }}>×</button>
      </div>

      <ALabel>ACCENT</ALabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, marginBottom: 20 }}>
        {ACCENTS.map(a => (
          <button key={a.val} onClick={() => setAccent(a.val)} style={{
            all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 0', borderBottom: '1px solid ' + A.rule2,
          }}>
            <div style={{ width: 14, height: 14, background: a.val, border: t.accent === a.val ? '2px solid ' + A.ink : '1px solid ' + A.rule2 }} />
            <span style={{ fontSize: 11, letterSpacing: 1, color: t.accent === a.val ? A.ink : A.muted }}>{a.label}</span>
          </button>
        ))}
      </div>

      <ALabel>DENSITY</ALabel>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 20 }}>
        {['comfortable', 'compact'].map(d => (
          <button key={d} onClick={() => setDensity(d)} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
            padding: '5px 10px', border: '1px solid ' + (t.density === d ? A.ink : A.rule2),
            background: t.density === d ? A.ink : 'transparent',
            color: t.density === d ? A.bg : A.ink,
          }}>{d.toUpperCase()}</button>
        ))}
      </div>

      <ALabel>DECIMALS</ALabel>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {[['ON', true], ['OFF', false]].map(([label, val]) => (
          <button key={label} onClick={() => setDecimals(val)} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
            padding: '5px 10px', border: '1px solid ' + (t.decimals === val ? A.ink : A.rule2),
            background: t.decimals === val ? A.ink : 'transparent',
            color: t.decimals === val ? A.bg : A.ink,
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Mobile ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'home',     label: 'HOME'  },
  { key: 'accounts', label: 'ACCTS' },
  { key: 'tx',       label: 'TXS'   },
  { key: 'budgets',  label: 'BUDGT' },
  { key: 'more',     label: 'MORE'  },
];

function ATabs({ active, onTab }) {
  return (
    <div style={{
      display: 'flex', borderTop: '2px solid ' + A.ink,
      background: A.bg, flexShrink: 0,
    }}>
      {TABS.map(tab => (
        <button key={tab.key} onClick={() => onTab(tab.key)} style={{
          all: 'unset', flex: 1, textAlign: 'center',
          padding: '10px 0 8px',
          fontSize: 9, letterSpacing: 1.2,
          color: active === tab.key ? A.ink : A.muted,
          fontWeight: active === tab.key ? 600 : 400,
          borderRight: '1px solid ' + A.rule2,
          fontFamily: A.font,
          cursor: 'pointer',
        }}>
          {tab.label}
          {active === tab.key && (
            <div style={{ width: 4, height: 4, background: A.ink, borderRadius: '50%', margin: '3px auto 0' }} />
          )}
        </button>
      ))}
    </div>
  );
}

function MobileApp({ t, setAccent, setDensity, setDecimals }) {
  const [tab, setTab] = React.useState('home');
  const [navStack, setNavStack] = React.useState([]);
  const [showAdd, setShowAdd] = React.useState(false);
  const [showTweaks, setShowTweaks] = React.useState(false);

  const push = (screen, params = {}) => setNavStack(s => [...s, { screen, params }]);
  const pop = () => setNavStack(s => s.slice(0, -1));

  const current = navStack.length > 0 ? navStack[navStack.length - 1] : null;

  const renderOverlay = () => {
    if (!current) return null;
    const { screen, params } = current;
    const props = { t, onBack: pop, onNavigate: push };
    switch (screen) {
      case 'acct':       return <AccountDetail {...props} acct={params.acct} />;
      case 'reports':    return <Reports {...props} />;
      case 'reports-cal':return <ReportsCalendar {...props} />;
      case 'goal':       return <GoalDetail {...props} goal={params.goal} />;
      case 'cc':         return <CCDetail {...props} acct={params.acct} />;
      case 'bills':      return <BillsHub {...props} />;
      case 'settings':   return <Settings {...props} />;
      case 'categories': return <CategoriesEditor {...props} />;
      default: return null;
    }
  };

  const overlay = renderOverlay();

  const renderTab = () => {
    const props = { t, onNavigate: push };
    switch (tab) {
      case 'home':     return <Home {...props} onAcct={acct => push('acct', { acct })} onAdd={() => setShowAdd(true)} onViewAll={() => setTab('accounts')} />;
      case 'accounts': return <Accounts {...props} onAcct={acct => push('acct', { acct })} />;
      case 'tx':       return <Transactions {...props} />;
      case 'budgets':  return <Budgets {...props} />;
      case 'more':     return <More {...props} />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: A.bg, fontFamily: A.font, position: 'relative' }}>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {renderTab()}
      </div>
      <ATabs active={tab} onTab={k => { setNavStack([]); setTab(k); }} />

      {overlay && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: A.bg }}>
          {overlay}
        </div>
      )}

      {showAdd && <AddSheet t={t} onClose={() => setShowAdd(false)} />}

      {showTweaks && (
        <TweaksPanel t={t} setAccent={setAccent} setDensity={setDensity} setDecimals={setDecimals} onClose={() => setShowTweaks(false)} />
      )}
    </div>
  );
}

// ─── Desktop ───────────────────────────────────────────────────────────────

function DesktopApp({ t, setAccent, setDensity, setDecimals }) {
  const [page, setPage] = React.useState('dashboard');
  const [showTweaks, setShowTweaks] = React.useState(false);
  const [showIO, setShowIO] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);

  const props = { t, onNavigate: setPage, onAdd: () => setShowAdd(true) };

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard {...props} />;
      case 'tx':           return <WebTransactions {...props} />;
      case 'accounts':     return <WebAccounts {...props} />;
      case 'budgets':      return <WebBudgets {...props} />;
      case 'goals':        return <WebGoals {...props} />;
      case 'bills':        return <WebBills {...props} />;
      case 'reports':      return <WebReports {...props} />;
      case 'investments':  return <WebInvestments {...props} />;
      case 'settings':     return <WebSettings {...props} />;
      default:             return <Dashboard {...props} />;
    }
  };

  return (
    <div style={{ height: '100%', background: A.bg, fontFamily: A.font, position: 'relative' }}>
      {renderPage()}

      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500, display: 'flex', gap: 8 }}>
        <button onClick={() => setShowIO(v => !v)} style={{ all: 'unset', cursor: 'pointer', width: 36, height: 36, border: '1.5px solid ' + A.ink, background: A.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: A.ink }}>⇅</button>
        <button onClick={() => setShowTweaks(v => !v)} style={{ all: 'unset', cursor: 'pointer', width: 36, height: 36, border: '1.5px solid ' + A.ink, background: A.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: A.ink }}>⚙</button>
      </div>

      {showIO && <ImportExport onClose={() => setShowIO(false)} />}
      {showAdd && <WebAddModal t={t} onClose={() => setShowAdd(false)} />}
      {showTweaks && (
        <TweaksPanel t={t} setAccent={setAccent} setDensity={setDensity} setDecimals={setDecimals} onClose={() => setShowTweaks(false)} />
      )}
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────

export default function App() {
  const { accent, setAccent, density, setDensity, decimals, setDecimals } = useTweaks();
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 1024);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const t = { accent, density, decimals };
  const tweakProps = { setAccent, setDensity, setDecimals };

  return (
    <StoreProvider>
      {isMobile
        ? <MobileApp t={t} {...tweakProps} />
        : <DesktopApp t={t} {...tweakProps} />}
    </StoreProvider>
  );
}
