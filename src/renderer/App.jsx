import React from 'react';
import { A, ACCENTS } from './theme';
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
  BillsHub, AlertsHub, Settings, CategoriesEditor,
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
import WebAlerts from './screens/web/WebAlerts';

// ─── Tweaks ────────────────────────────────────────────────────────────────

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
  const [accent, setAccent]     = useLS('ledger:accent',   ACCENTS[0].val);
  const [density, setDensity]   = useLS('ledger:density',  'comfortable');
  const [decimals, setDecimals] = useLS('ledger:decimals', true);
  const [currency, setCurrency] = useLS('ledger:currency', 'USD');
  return { accent, setAccent, density, setDensity, decimals, setDecimals, currency, setCurrency };
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

function MobileApp({ t, setAccent, setDensity, setDecimals, setCurrency }) {
  const [tab, setTab] = React.useState('home');
  const [navStack, setNavStack] = React.useState([]);
  const [showAdd, setShowAdd] = React.useState(false);

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
      case 'alerts':     return <AlertsHub {...props} />;
      case 'settings':   return <Settings {...props} setAccent={setAccent} setDensity={setDensity} setDecimals={setDecimals} setCurrency={setCurrency} />;
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
    </div>
  );
}

// ─── Desktop ───────────────────────────────────────────────────────────────

function DesktopApp({ t, setAccent, setDensity, setDecimals, setCurrency }) {
  const [page, setPage] = React.useState('dashboard');
  const [showIO, setShowIO] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);

  const settingsProps = { setAccent, setDensity, setDecimals, setCurrency };
  const props = { t, onNavigate: setPage, onAdd: () => setShowAdd(true) };

  const renderPage = () => {
    switch (page) {
      case 'dashboard':    return <Dashboard {...props} />;
      case 'alerts':       return <WebAlerts {...props} />;
      case 'tx':           return <WebTransactions {...props} />;
      case 'accounts':     return <WebAccounts {...props} />;
      case 'budgets':      return <WebBudgets {...props} />;
      case 'goals':        return <WebGoals {...props} />;
      case 'bills':        return <WebBills {...props} />;
      case 'reports':      return <WebReports {...props} />;
      case 'investments':  return <WebInvestments {...props} />;
      case 'settings':     return <WebSettings {...props} {...settingsProps} />;
      default:             return <Dashboard {...props} />;
    }
  };

  return (
    <div style={{ height: '100%', background: A.bg, fontFamily: A.font, position: 'relative' }}>
      {renderPage()}

      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 500, display: 'flex', gap: 8 }}>
        <button onClick={() => setShowIO(v => !v)} style={{ all: 'unset', cursor: 'pointer', width: 36, height: 36, border: '1.5px solid ' + A.ink, background: A.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: A.ink }}>⇅</button>
      </div>

      {showIO && <ImportExport onClose={() => setShowIO(false)} />}
      {showAdd && <WebAddModal t={t} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────

export default function App() {
  const { accent, setAccent, density, setDensity, decimals, setDecimals, currency, setCurrency } = useTweaks();
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 1024);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const t = { accent, density, decimals, currency };
  const tweakProps = { setAccent, setDensity, setDecimals, setCurrency };

  return (
    <StoreProvider>
      {isMobile
        ? <MobileApp t={t} {...tweakProps} />
        : <DesktopApp t={t} {...tweakProps} />}
    </StoreProvider>
  );
}
