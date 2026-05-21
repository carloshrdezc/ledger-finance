import React from 'react';
import { A } from './theme';
import { StoreProvider, useStore } from './store';
import { UndoProvider, useUndo } from './UndoContext';
import UndoToast from './components/UndoToast';
import ImportExport from './components/ImportExport';
import Welcome from './screens/Welcome';
import EmptyApp from './screens/EmptyApp';
import AccountFormSheet from './components/AccountFormSheet';
import AccountFormModal from './components/AccountFormModal';
import CommandPalette from './components/CommandPalette';
import ShortcutsOverlay from './components/Shortcuts';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { buildCommands } from './commands.mjs';

// Mobile screens
import Home from './screens/mobile/Home';
import { Accounts, AccountDetail } from './screens/mobile/Accounts';
import Transactions from './screens/mobile/Transactions';
import Budgets from './screens/mobile/Budgets';
import More from './screens/mobile/More';
import Investments from './screens/mobile/Investments';
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

  const push = (screen, params = {}) => setNavStack(s => [...s, { screen, params }]);
  const pop = () => setNavStack(s => s.slice(0, -1));

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
  }, []);

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
      case 'alerts':     return <AlertsHub {...props} onNavigate={goToRoute} />;
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

function AccountFromEmpty({ onClose, t, isMobile }) {
  return isMobile
    ? <AccountFormSheet onClose={onClose} t={t} account={null} />
    : <AccountFormModal onClose={onClose} t={t} account={null} />;
}

function AppShell() {
  const {
    welcomeSeen, isAppEmpty,
    accent, setAccent,
    density, setDensity,
    decimals, setDecimals,
    currency, setCurrency,
    theme, setTheme,
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

  React.useEffect(() => {
    const onKey = (e) => {
      // Bail when an overlay is open — match the existing Ctrl+K policy.
      if (showImport || pendingAddAccount) return;

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

  const t = { accent, density, decimals, currency, theme };
  const tweakProps = { setAccent, setDensity, setDecimals, setCurrency, setTheme };

  // Render priority:
  // 1. Welcome modal overlays everything when welcomeSeen === false.
  // 2. EmptyApp replaces the normal layout when isAppEmpty.
  // 3. Otherwise the existing MobileApp / DesktopApp.

  return (
    <>
      {isAppEmpty
        ? <EmptyApp
            onAddAccount={() => setPendingAddAccount(true)}
            onImport={() => setShowImport(true)}
          />
        : (isMobile
            ? <MobileApp t={t} {...tweakProps} />
            : <DesktopApp t={t} {...tweakProps} />)
      }
      {!welcomeSeen && (
        <Welcome onImport={() => setShowImport(true)} />
      )}
      {showImport && <ImportExport onClose={() => setShowImport(false)} />}
      {pendingAddAccount && (
        <AccountFromEmpty
          onClose={() => setPendingAddAccount(false)}
          t={t}
          isMobile={isMobile}
        />
      )}
      <UndoToast />
    </>
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
