import React from 'react';
import { A } from './theme';
import { StoreProvider, useStore } from './store';
import { UndoProvider, useUndo } from './UndoContext';
import UndoToast from './components/UndoToast';
import SuggestRuleToast from './components/SuggestRuleToast';
import ImportExport from './components/ImportExport';
import Onboarding from './screens/Onboarding';
import OnboardingMobile from './screens/mobile/OnboardingMobile';
import EmptyApp from './screens/EmptyApp';
import AccountFormSheet from './components/AccountFormSheet';
import AccountFormModal from './components/AccountFormModal';
import CommandPalette from './components/CommandPalette';
import ShortcutsOverlay from './components/Shortcuts';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { buildCommands } from './commands.mjs';
import { applyInsightDrillDown } from './insightNav';

// Mobile screens
import Home from './screens/mobile/Home';
import { Accounts, AccountDetail } from './screens/mobile/Accounts';
import Transactions from './screens/mobile/Transactions';
import Budgets from './screens/mobile/Budgets';
import More from './screens/mobile/More';
import Investments from './screens/mobile/Investments';
import AddSheet from './screens/mobile/AddSheet';
import Reports from './screens/mobile/Reports';
import ReportsCalendar from './screens/mobile/ReportsCalendar';
import CCDetail from './screens/mobile/CCDetail';
import GoalDetail from './screens/mobile/GoalDetail';
import BillsHub from './screens/mobile/BillsHub';
import AlertsHub from './screens/mobile/AlertsHub';
import Settings from './screens/mobile/Settings';
import CategoriesEditor from './screens/mobile/CategoriesEditor';

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

function MobileApp({ t, setAccent, setDensity, setDecimals, setCurrency, setTheme }) {
  const [tab, setTab] = React.useState('home');
  const [navStack, setNavStack] = React.useState([]);
  const [showAdd, setShowAdd] = React.useState(false);

  const push = React.useCallback((screen, params = {}) => setNavStack(s => [...s, { screen, params }]), []);
  const pop = React.useCallback(() => setNavStack(s => s.slice(0, -1)), []);

  // Resolve an alert route (string from alerts.mjs) to either a tab switch or
  // overlay push. Tab targets clear the overlay stack.
  const goToRoute = React.useCallback((route, params = {}) => {
    if (!route) return;
    // Tab-level destinations
    if (route === 'accounts' || route === 'budgets' || route === 'tx' || route === 'home' || route === 'more') {
      setNavStack([]);
      setTab(route);
      return;
    }
    // Goals live behind MORE on mobile - jump to MORE tab
    if (route === 'goals') {
      setNavStack([]);
      setTab('more');
      return;
    }
    // Investments: now a real overlay screen.
    if (route === 'investments') {
      push('investments', params);
      return;
    }
    // Otherwise treat as an overlay screen key
    push(route, params);
  }, [push]);

  // CAR-217: insight drill-down. Lives here because Home + AlertsHub both
  // need it. The actual route resolution is in insightNav.js (single source
  // of truth across web Dashboard, WebAlerts, and this surface).
  const { setTxFilter } = useStore();
  const goToInsight = React.useCallback((insight) => {
    applyInsightDrillDown(insight, {
      setTxFilter,
      navigate: (route, routeParams) => {
        if (route === 'tx') {
          setNavStack([]);
          setTab('tx');
          return;
        }
        goToRoute(route, routeParams);
      },
    });
  }, [setTxFilter, goToRoute]);

  const current = navStack.length > 0 ? navStack[navStack.length - 1] : null;

  const renderOverlay = () => {
    if (!current) return null;
    const { screen, params } = current;
    const props = { t, onBack: pop, onNavigate: push };
    switch (screen) {
      case 'acct':       return <AccountDetail {...props} acct={params.acct} />;
      case 'reports':    return <Reports {...props} onGoToRoute={goToRoute} />;
      case 'reports-cal':return <ReportsCalendar {...props} onGoToRoute={goToRoute} />;
      case 'goal':       return <GoalDetail {...props} goal={params.goalId} />;
      case 'cc':         return <CCDetail {...props} acct={params.acct} />;
      case 'bills':      return <BillsHub {...props} />;
      case 'alerts':     return <AlertsHub {...props} onNavigate={goToRoute} onInsight={goToInsight} />;
      case 'investments':return <Investments {...props} />;
      case 'settings':   return <Settings {...props} setAccent={setAccent} setDensity={setDensity} setDecimals={setDecimals} setCurrency={setCurrency} setTheme={setTheme} />;
      case 'categories': return <CategoriesEditor {...props} />;
      default: return null;
    }
  };

  const overlay = renderOverlay();

  const renderTab = () => {
    const props = { t, onNavigate: push };
    switch (tab) {
      case 'home':     return <Home {...props} onAcct={acct => push('acct', { acct })} onAdd={() => setShowAdd(true)} onViewAll={() => setTab('accounts')} onInsight={goToInsight} />;
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

function DesktopApp({ t, setAccent, setDensity, setDecimals, setCurrency, setTheme }) {
  const [page, setPage] = React.useState('dashboard');
  const [showIO, setShowIO] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = React.useState(false);
  const {
    exportBackup, recordBackupTaken,
    goToPreviousPeriod, goToNextPeriod,
  } = useStore();

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const tgt = e.target;
        const tag = tgt?.tagName;
        const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tgt?.isContentEditable;
        if (isEditable) return;
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeTopOverlay = React.useCallback(() => {
    if (cheatsheetOpen) { setCheatsheetOpen(false); return; }
    if (paletteOpen)    { setPaletteOpen(false);    return; }
    if (showAdd)        { setShowAdd(false);        return; }
    if (showIO)         { setShowIO(false);         return; }
  }, [cheatsheetOpen, paletteOpen, showAdd, showIO]);

  const anyOverlayOpen = cheatsheetOpen || paletteOpen || showAdd || showIO;

  const escBindings = React.useMemo(() => [
    { keys: 'Escape', handler: closeTopOverlay, allowInInput: true },
  ], [closeTopOverlay]);

  useKeyboardShortcuts({ bindings: escBindings });

  const globalBindings = React.useMemo(() => [
    { keys: '?',      handler: () => setCheatsheetOpen(v => !v) },
    { keys: 'n',      handler: () => setShowAdd(true) },
    { keys: '[',      handler: goToPreviousPeriod },
    { keys: ']',      handler: goToNextPeriod },
    { keys: 'g d',    handler: () => setPage('dashboard') },
    { keys: 'g t',    handler: () => setPage('tx') },
    { keys: 'g a',    handler: () => setPage('accounts') },
    { keys: 'g b',    handler: () => setPage('budgets') },
    { keys: 'g r',    handler: () => setPage('reports') },
    { keys: 'g i',    handler: () => setPage('investments') },
  ], [goToPreviousPeriod, goToNextPeriod]);

  useKeyboardShortcuts({ enabled: !anyOverlayOpen, bindings: globalBindings });

  const commands = React.useMemo(
    () => buildCommands({
      store: { exportBackup, recordBackupTaken, theme: t.theme, setTheme },
      navigate: setPage,
      openAddTx: () => setShowAdd(true),
    }),
    [exportBackup, recordBackupTaken, t.theme, setTheme],
  );

  const settingsProps = { setAccent, setDensity, setDecimals, setCurrency, setTheme };
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
      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}
      {cheatsheetOpen && (
        <ShortcutsOverlay onClose={() => setCheatsheetOpen(false)} />
      )}
    </div>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────

const FX_AUTO_FETCH_STALE_MS = 24 * 60 * 60 * 1000;

function isFxAutoFetchStale(iso) {
  if (!iso) return true;
  const ts = Date.parse(iso);
  return !Number.isFinite(ts) || (Date.now() - ts) >= FX_AUTO_FETCH_STALE_MS;
}

function AccountFromEmpty({ onClose, t, isMobile }) {
  return isMobile
    ? <AccountFormSheet onClose={onClose} t={t} account={null} />
    : <AccountFormModal onClose={onClose} t={t} account={null} />;
}

function AppShell() {
  const {
    onboarded, isAppEmpty,
    accent, setAccent,
    density, setDensity,
    decimals, setDecimals,
    currency, setCurrency,
    theme, setTheme,
    fxAutoFetch, fxLastFetchedAt, refreshRatesNow,
  } = useStore();

  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 1024);
  const [showImport, setShowImport] = React.useState(false);
  const [pendingAddAccount, setPendingAddAccount] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const undoStack = useUndo();
  const fxAutoFetchBootRef = React.useRef(false);

  React.useEffect(() => {
    if (fxAutoFetchBootRef.current) return;
    fxAutoFetchBootRef.current = true;
    if (fxAutoFetch !== 'off' && (fxAutoFetch === 'boot' || isFxAutoFetchStale(fxLastFetchedAt))) {
      void refreshRatesNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      // Bail when an overlay is open — match the existing Ctrl+K policy.
      if (showImport || pendingAddAccount) return;
      // Bail when any modal-style overlay is open (cheatsheet, command palette,
      // any future component using aria-modal). Belt-and-suspenders alongside
      // the input-target check below.
      if (typeof document !== 'undefined' &&
          document.querySelector('[aria-modal="true"]')) return;

      const tgt = e.target;
      const tag = tgt?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tgt?.isContentEditable;
      if (isEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = (e.key || '').toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoStack.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        undoStack.redo();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoStack, showImport, pendingAddAccount]);

  const [updateReadyVersion, setUpdateReadyVersion] = React.useState(null);

  React.useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAutoUpdateDownloaded) return undefined;
    return api.onAutoUpdateDownloaded(({ version } = {}) => {
      setUpdateReadyVersion(version ?? 'latest');
    });
  }, []);

  const t = { accent, density, decimals, currency, theme };
  const tweakProps = { setAccent, setDensity, setDecimals, setCurrency, setTheme };

  // Render priority:
  // 1. Onboarding blocks the app on first run or when replayed from Settings.
  // 2. EmptyApp replaces the normal layout when the store is empty.
  // 3. Otherwise the existing MobileApp / DesktopApp.

  // CAR-215 review nit: macOS uses `titleBarStyle: 'hiddenInset'` (see
  // src/main/index.js), which inlays the traffic-light controls at the
  // top-left ~78px. Pad the banner left on darwin so DISMISS/RESTART don't
  // collide with close/minimize/zoom.
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');
  const bannerPaddingLeft = isMac ? 88 : 14;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {updateReadyVersion && (
        <div style={{ flexShrink: 0, zIndex: 1000, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: `10px 14px 10px ${bannerPaddingLeft}px`, borderBottom: '1px solid ' + A.ink, background: A.bg, WebkitAppRegion: 'drag' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.1 }}>UPDATE READY — RESTART TO APPLY</div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>Version {updateReadyVersion}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, WebkitAppRegion: 'no-drag' }}>
            <button onClick={() => setUpdateReadyVersion(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.1, color: A.muted }}>DISMISS</button>
            <button onClick={() => window.electronAPI?.installUpdate?.()} style={{ all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: 1.1, color: A.ink }}>RESTART NOW</button>
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {!onboarded
          ? (isMobile
              ? <OnboardingMobile />
              : <Onboarding />)
          : (isAppEmpty
              ? <EmptyApp
                  onAddAccount={() => setPendingAddAccount(true)}
                  onImport={() => setShowImport(true)}
                />
              : (isMobile
                  ? <MobileApp t={t} {...tweakProps} />
                  : <DesktopApp t={t} {...tweakProps} />)
            )
        }
      </div>
      {showImport && <ImportExport onClose={() => setShowImport(false)} />}
      {pendingAddAccount && (
        <AccountFromEmpty
          onClose={() => setPendingAddAccount(false)}
          t={t}
          isMobile={isMobile}
        />
      )}
      <UndoToast />
      <SuggestRuleToast />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UndoProvider>
        <AppShell />
      </UndoProvider>
    </StoreProvider>
  );
}
