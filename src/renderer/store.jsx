import React from 'react';
import { TRANSACTIONS, CATEGORY_TREE, DEFAULT_CAT_TREE, BUDGETS, ACCOUNTS, BILLS, GOALS, INVESTMENTS, TRADES } from './data';
import { isAppEmptyFor, isDefaultCatTreeFor } from './sampleData.mjs';
import {
  addMonths,
  buildBudgetRows,
  filterTransactionsForPeriod,
  formatPeriodLabel,
  monthKey,
} from './period.mjs';
import { buildBillRows, markRecurringPaid as createRecurringPayment, getBillDueDate, slug, createGoalContribution } from './planning.mjs';
import { computeSafeToSpend } from './safeToSpend.mjs';
import {
  applyRecategorizeEvent,
  applyDismiss,
  applyEvict,
  findEvictionForNewRule,
} from './recategorizeStats.mjs';
import { buildAlertRows } from './alerts.mjs';
import { buildInsightRows } from './insights.mjs';
import { buildAnomalyRows } from './anomalies.mjs';
import { DEFAULT_RATES, buildDefaultRatesHistory, latestRateEntry, normalizeRatesHistory, toReportingCurrency } from './fx.mjs';
import { fetchRatesFromFrankfurter } from './fxFetch.mjs';
import { buildBackup } from './backup.mjs';
import { computeDueContributions, planAutoFundContributions } from './autoFunding.mjs';
import { ACCENTS } from './theme';
import {
  deleteTxsFromArray,
  hideIdsToArray,
  updateTxsInArray,
  convertToTransferInArray,
  updateTxsIndividuallyInArray,
} from './bulkOps.mjs';
import { MKProvider } from './security/useMK';
import { IdleLockGuard } from './security/IdleLockGuard';
import LockScreen from './screens/LockScreen';

const MIGRATED_TO_DISK_KEY = 'ledger:_migratedToDisk';
const ONBOARDED_KEY = 'ledger:onboarded';
const FIRST_RUN_SLICES = ['ledger:tx', 'ledger:accounts', 'ledger:bills', 'ledger:goals',
                          'ledger:budgets', 'ledger:investments', 'ledger:trades',
                          'ledger:catTree', 'ledger:rules', 'ledger:savedViews', 'ledger:debts'];
const LEDGER_PREFIX = 'ledger:';
const PERSIST_DEBOUNCE_MS = 250;
const PersistenceCtx = React.createContext(null);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function migrateFxRatesSnapshot(snapshot, todayIso = new Date().toISOString().slice(0, 10)) {
  if (!isPlainObject(snapshot) || !Object.prototype.hasOwnProperty.call(snapshot, 'ledger:fxRates')) {
    return snapshot;
  }
  const current = snapshot['ledger:fxRates'];
  const normalized = normalizeRatesHistory(current, todayIso);
  const currentJson = JSON.stringify(current);
  const nextJson = JSON.stringify(normalized);
  if (currentJson === nextJson) return snapshot;
  const next = { ...snapshot, 'ledger:fxRates': normalized };
  writeLedgerStorageKey('ledger:fxRates', normalized);
  return next;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function rateSourcePriority(source) {
  if (source === 'manual') return 2;
  if (source === 'fetched') return 1;
  return 0;
}

function upsertRateHistory(history, ccy, rate, effectiveFrom = todayIso(), source = 'manual') {
  if (!ccy) return history;
  const current = isPlainObject(history) ? history : {};
  const nextEntry = { rate, effectiveFrom, source };
  const previous = Array.isArray(current[ccy]) ? current[ccy] : [];
  const filtered = previous.filter(entry => entry?.effectiveFrom !== effectiveFrom);
  const sameDay = previous.filter(entry => entry?.effectiveFrom === effectiveFrom);
  let winner = nextEntry;
  for (const entry of sameDay) {
    if (!entry) continue;
    if (rateSourcePriority(entry.source) > rateSourcePriority(winner.source)) {
      winner = entry;
    }
  }
  const nextHistory = [...filtered, winner].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return { ...current, [ccy]: nextHistory };
}

function readLedgerStorageSnapshot() {
  const snapshot = {};
  try {
    if (typeof localStorage === 'undefined') return snapshot;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEDGER_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        snapshot[key] = JSON.parse(raw);
      } catch {
        // Skip malformed legacy entries; the hook falls back to defaults.
      }
    }
  } catch {
    // localStorage unavailable (private browsing, denied permissions, etc.).
  }
  return migrateFxRatesSnapshot(snapshot);
}

function writeLedgerStorageKey(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory snapshot authoritative.
  }
}

function writeLedgerStorageSnapshot(snapshot) {
  try {
    if (typeof localStorage === 'undefined') return;
    const next = isPlainObject(snapshot) ? snapshot : {};
    // Remove ledger:* keys that are no longer in the snapshot so a stale
    // value can't resurface if a future disk read fails and the code falls
    // back to the localStorage mirror.
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEDGER_PREFIX)) continue;
      if (!Object.prototype.hasOwnProperty.call(next, key)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(next)) {
      if (!key.startsWith(LEDGER_PREFIX)) continue;
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Best-effort mirror only.
  }
}

function getSnapshotValue(snapshot, key, def) {
  return Object.prototype.hasOwnProperty.call(snapshot || {}, key) ? snapshot[key] : def;
}

function hasExistingUserData(snapshot) {
  // All keys in FIRST_RUN_SLICES are arrays or plain objects in practice
  // (catTree/rules added in PR #62 round-2). The `welcomeSeen === true` clause
  // covers returning users who dismissed the legacy Welcome screen but never
  // imported any data — they shouldn't see the new onboarding wizard either.
  return FIRST_RUN_SLICES.some(key => {
    const value = snapshot[key];
    if (Array.isArray(value)) return value.length > 0;
    if (isPlainObject(value)) return Object.keys(value).length > 0;
    return false;
  }) || snapshot['ledger:welcomeSeen'] === true;
}

function seedOnboardingFlag(snapshot) {
  if (Object.prototype.hasOwnProperty.call(snapshot, ONBOARDED_KEY)) return snapshot;
  if (!hasExistingUserData(snapshot)) return snapshot;
  return { ...snapshot, [ONBOARDED_KEY]: true };
}

function resolveBootSnapshot(diskState) {
  const disk = isPlainObject(diskState) ? diskState : {};
  if (disk[MIGRATED_TO_DISK_KEY] === true) {
    const snapshot = migrateFxRatesSnapshot(seedOnboardingFlag(disk));
    return { snapshot, needsWrite: snapshot !== disk };
  }
  if (Object.keys(disk).length > 0) {
    const snapshot = migrateFxRatesSnapshot(seedOnboardingFlag({ ...disk, [MIGRATED_TO_DISK_KEY]: true }));
    return { snapshot, needsWrite: true };
  }
  const snapshot = migrateFxRatesSnapshot(seedOnboardingFlag({ ...readLedgerStorageSnapshot(), [MIGRATED_TO_DISK_KEY]: true }));
  return { snapshot, needsWrite: true };
}

function useLS(key, def) {
  // StoreProvider always wraps its children in PersistenceCtx.Provider, so
  // `ctx` is never null here. The browser-preview path (no Electron `ledgerDB`)
  // is handled inside StoreProvider by skipping the disk write; the
  // synchronous `localStorage` mirror still keeps state durable.
  //
  // CAR-242: when `ctx.locked` is true the disk store has been replaced by
  // the encrypted variant in main and is returning the LOCKED sentinel —
  // every `useLS` falls back to its caller's `def` until unlock fires the
  // hydration event. This is per spec R5: locked state shouldn't throw or
  // surface stale data; it should just look like an empty install.
  const ctx = React.useContext(PersistenceCtx);
  const value = ctx.locked
    ? def
    : getSnapshotValue(ctx.snapshot, key, def);
  const set = React.useCallback(u => ctx.setKey(key, u, def), [ctx, key, def]);
  return [value, set];
}

function migrateTransactions(txs) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return txs.map(tx => {
    if (tx.date) return tx;
    const { d, ...rest } = tx;
    return { ...rest, date: `${yyyy}-${mm}-${String(d || 1).padStart(2, '0')}` };
  });
}

function migrateBills(bills) {
  return bills.map(b => b.id ? b : {
    ...b,
    id: slug(b.name) + '_' + (b.day || 1) + '_' + (b.acct || ''),
    type: 'expense',
    freq: 'monthly',
    path: b.path || [b.cat || 'bills'],
    ccy: b.ccy || 'USD',
    active: true,
  });
}

export const StoreCtx = React.createContext(null);

// CAR-76: synchronous pre-render migration. Existing users upgrading from a
// pre-CAR-76 build have non-empty slices in localStorage but no
// `ledger:welcomeSeen` key — they should NOT see the welcome modal flicker
// on first post-upgrade boot. By writing `ledger:welcomeSeen=true` here
// (before any React render), `useLS` picks up the right initial value and
// the welcome modal never mounts for them.
//
// Brand-new users (everything empty) still get welcomeSeen=false and see
// the welcome modal.
//
// Runs once per page load. Safe across hot reloads (idempotent).
(function migrateWelcomeSeenForExistingUsers() {
  try {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem('ledger:welcomeSeen') !== null) return;

    const slices = ['ledger:tx', 'ledger:accounts', 'ledger:bills', 'ledger:goals',
                    'ledger:budgets', 'ledger:investments', 'ledger:trades', 'ledger:debts'];
    for (const key of slices) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localStorage.setItem('ledger:welcomeSeen', JSON.stringify(true));
          return;
        }
      } catch {
        // Malformed JSON in a slice — skip; useLS will fall back to default.
      }
    }
  } catch {
    // localStorage unavailable (private browsing, denied permissions, etc.)
    // — leave welcomeSeen unset; user will see the welcome modal once.
  }
})();

export function StoreProvider({ children }) {
  const [snapshot, setSnapshot] = React.useState(() => readLedgerStorageSnapshot());
  const snapshotRef = React.useRef(snapshot);
  const writeTimerRef = React.useRef(null);
  const ledgerDB = typeof window !== 'undefined' ? window.ledgerDB : undefined;
  const ledgerSecurity = typeof window !== 'undefined' ? window.ledgerSecurity : undefined;

  // CAR-242: lock-state mirror. `locked` is the renderer's view of the
  // main-process MK lifecycle. While true, `useLS` returns `def` and
  // ledgerDB.write IPC calls are no-ops on our side (main also refuses with
  // `LOCKED`). The provider eagerly fetches state on mount and subscribes
  // to `security:state-changed` so lockNow / unlock both re-render
  // automatically without unmounting React state above (spec R4 / Example F).
  const [securityState, setSecurityState] = React.useState({
    enabled: false,
    locked: false,
  });

  React.useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  // CAR-91: write the latest snapshot to disk *now*, cancelling the pending
  // debounce timer if any. Called from `pagehide` so edits made within
  // 250 ms of quitting can't be lost. No-ops when no write is pending.
  const flushPendingWrite = React.useCallback(() => {
    if (!ledgerDB) return Promise.resolve();
    if (!writeTimerRef.current) return Promise.resolve();
    clearTimeout(writeTimerRef.current);
    writeTimerRef.current = null;
    return ledgerDB.write(snapshotRef.current).catch(() => {});
  }, [ledgerDB]);

  const setKey = React.useCallback((key, updater, def) => {
    setSnapshot(prev => {
      const prevValue = getSnapshotValue(prev, key, def);
      const nextValue = typeof updater === 'function' ? updater(prevValue) : updater;
      const nextSnapshot = { ...prev, [key]: nextValue };
      snapshotRef.current = nextSnapshot;
      writeLedgerStorageKey(key, nextValue);
      if (ledgerDB) {
        if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
        writeTimerRef.current = setTimeout(() => {
          writeTimerRef.current = null;
          void ledgerDB.write(snapshotRef.current).catch(() => {});
        }, PERSIST_DEBOUNCE_MS);
      }
      return nextSnapshot;
    });
  }, [ledgerDB]);

  React.useEffect(() => {
    if (!ledgerDB) return;
    let cancelled = false;
    const initialSnapshot = snapshotRef.current;
    void (async () => {
      try {
        const diskState = await ledgerDB.read();
        if (cancelled) return;
        // CAR-242: when security is enabled but the app is locked, main
        // returns a sentinel instead of the plaintext snapshot. Don't run
        // the migration path on that — keep the existing in-memory
        // snapshot (which is empty / fallback defaults via useLS) until
        // an unlock event re-fires this hydration.
        if (diskState && diskState.__locked === true) {
          setSecurityState(s => ({ ...s, enabled: true, locked: true }));
          return;
        }
        const { snapshot: bootSnapshot, needsWrite } = resolveBootSnapshot(diskState);
        const currentSnapshot = snapshotRef.current;
        const userChanges = {};
        for (const [key, value] of Object.entries(currentSnapshot)) {
          if (initialSnapshot[key] !== value) userChanges[key] = value;
        }
        const hydratedSnapshot = Object.keys(userChanges).length > 0
          ? { ...bootSnapshot, ...userChanges }
          : bootSnapshot;
        if (needsWrite || Object.keys(userChanges).length > 0) {
          await ledgerDB.write(hydratedSnapshot);
        }
        if (!cancelled) {
          snapshotRef.current = hydratedSnapshot;
          writeLedgerStorageSnapshot(hydratedSnapshot);
          setSnapshot(hydratedSnapshot);
        }
      } catch {
        // Keep the browser/localStorage snapshot if disk hydration fails.
      }
    })();
    return () => {
      cancelled = true;
      // Note: we do NOT cancel the pending write here without flushing —
      // see the pagehide effect below for the quit-time durability handler.
      // Unmount during normal use (route change, etc.) is rare; if it does
      // happen the next setKey will reschedule a write of the same data.
    };
  }, [ledgerDB, securityState.locked]);

  // CAR-91: durability on quit. Two coordinated paths:
  //
  //   1. `window.__ledgerFlush` (main → renderer round-trip). Main's
  //      `before-quit` handler calls this via `executeJavaScript` and awaits
  //      the returned promise BEFORE draining its own queue. This closes the
  //      ordering race where a debounced renderer write hadn't yet reached
  //      main's queue when `ledgerStore.flush()` was called — without the
  //      round-trip, `pagehide` fired *after* `before-quit` already returned
  //      and the write would race process exit.
  //
  //   2. `pagehide` (renderer-only). On macOS, closing the window does not
  //      quit the app (`window-all-closed` is a no-op there) — the page is
  //      torn down but main keeps running, so `before-quit` never fires.
  //      `pagehide` covers that path. It's also belt-and-suspenders for any
  //      other shutdown ordering quirk.
  //
  // The function returns a single promise that resolves only after both
  // (a) the renderer's pending debounced write has been forwarded to main
  // and (b) main has acknowledged it via the `ledgerDB.write` IPC.
  React.useEffect(() => {
    if (!ledgerDB) return;
    if (typeof window === 'undefined') return;

    const doFlush = async () => {
      const pending = flushPendingWrite();
      try { await pending; } catch { /* swallow — best-effort */ }
      try { await ledgerDB.flush(); } catch { /* swallow */ }
    };

    // (1) main → renderer round-trip handle.
    window.__ledgerFlush = doFlush;

    // (2) renderer-side pagehide.
    const handler = () => { void doFlush(); };
    window.addEventListener('pagehide', handler);

    return () => {
      window.removeEventListener('pagehide', handler);
      if (window.__ledgerFlush === doFlush) {
        delete window.__ledgerFlush;
      }
    };
  }, [ledgerDB, flushPendingWrite]);

  // CAR-242: subscribe to main's `security:state-changed` events. Whenever
  // `locked` flips from true → false (successful unlock) we re-fire the
  // hydration effect by toggling our local `securityState.locked` flag —
  // its presence in the dep array of the hydration effect causes it to
  // re-run, this time getting real plaintext from main.
  // Whenever it flips false → true (lockNow), the hydration effect re-runs
  // and stops at the LOCKED sentinel branch above; we set securityState
  // accordingly and the render gate below switches to <LockScreen>.
  React.useEffect(() => {
    if (!ledgerSecurity || typeof ledgerSecurity.onStateChanged !== 'function') {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const initial = await ledgerSecurity.getState();
        if (!cancelled && initial) {
          setSecurityState({ enabled: !!initial.enabled, locked: !!initial.locked });
        }
      } catch {
        // Bridge call failed — leave defaults; ledgerDB.read will surface
        // the LOCKED sentinel separately if applicable.
      }
    })();
    const unsubscribe = ledgerSecurity.onStateChanged(next => {
      if (!next) return;
      setSecurityState({ enabled: !!next.enabled, locked: !!next.locked });
    });
    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [ledgerSecurity]);

  const persistenceValue = React.useMemo(
    () => ({ snapshot, setKey, locked: securityState.locked }),
    [snapshot, setKey, securityState.locked],
  );

  return (
    <MKProvider>
      <IdleLockGuard />
      <PersistenceCtx.Provider value={persistenceValue}>
        {securityState.enabled && securityState.locked
          ? <LockScreen />
          : <StoreProviderImpl>{children}</StoreProviderImpl>}
      </PersistenceCtx.Provider>
    </MKProvider>
  );
}

function StoreProviderImpl({ children }) {
  const [txs, setTxs]         = useLS('ledger:tx',      []);
  const [catTree, setCatTree]  = useLS('ledger:cats',    DEFAULT_CAT_TREE);
  const [budgets, setBudgets]  = useLS('ledger:budgets', []);
  const [hidden, setHidden]    = useLS('ledger:hidden',  []);
  const [accounts, setAccounts] = useLS('ledger:accounts', []);
  const [selectedPeriod, setSelectedPeriod] = useLS('ledger:period', monthKey(new Date()));
  const [bills, setBills] = useLS('ledger:bills', []);
  React.useEffect(() => {
    setBills(prev => migrateBills(prev));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [goals, setGoals] = useLS('ledger:goals', []);
  // CAR-345: debt payoff planner. Each debt: { id, name, balance, apr, minPayment }.
  // `debtExtraPayment` is the single shared "extra monthly budget" the planner
  // funnels into the focus debt on top of every debt's minimum.
  const [debts, setDebts] = useLS('ledger:debts', []);
  const [debtExtraPayment, setDebtExtraPayment] = useLS('ledger:debtExtraPayment', 0);
  const [goalContributions, setGoalContributions] = useLS('ledger:goalContributions', []);
  // CAR-347: per-goal auto-funding rules. Each: { id, goalId, amount, source,
  // freq, day/interval/startDate, active, lastFundedDate }. Ledger has no
  // backend scheduler, so rules are applied on demand (runAutoFundRule) the
  // same way bills are paid — never silently.
  const [goalAutoFundRules, setGoalAutoFundRules] = useLS('ledger:goalAutoFundRules', []);
  const [rules, setRules] = useLS('ledger:rules', []);
  // CAR-83: one persisted slice for both Transactions and Reports saved views.
  // Simpler than split slices because the only difference is `scope`.
  const [savedViews, setSavedViews] = useLS('ledger:savedViews', []);
  // CAR-182: per-(merchant,target) re-categorization counter. Used to
  // surface a "Suggest rule" toast after the 3rd identical re-cat.
  // Shape: { '<merchantKeyUC>|<path.joined>': { count, lastAt, lastTxIds[], dismissed } }
  // Persisted across sessions but excluded from backups (ephemeral coaching state).
  const [recategorizeStats, setRecategorizeStats] = useLS('ledger:recategorizeStats', {});
  // Transient signal from the interceptor → toast → modal. Not persisted.
  const [pendingRuleSuggestion, setPendingRuleSuggestion] = React.useState(null);
  const [budgetStartDay, setBudgetStartDay] = useLS('ledger:budgetStartDay', 1);
  const [investments, setInvestments] = useLS('ledger:investments', []);
  const [trades, setTrades]           = useLS('ledger:trades', []);
  const [dismissedAlertIds, setDismissedAlertIds] = useLS('ledger:dismissedAlerts', []);
  // CAR-217: weekly insight dismissal. Same pattern as alerts — store the
  // insight ids the user has dismissed; insightRows filters them out.
  const [dismissedInsightIds, setDismissedInsightIds] = useLS('ledger:dismissedInsights', []);
  // CAR-351: transaction-level anomaly flags. Same dismissal pattern as insights.
  const [dismissedAnomalyIds, setDismissedAnomalyIds] = useLS('ledger:dismissedAnomalies', []);
  const [welcomeSeen, setWelcomeSeen] = useLS('ledger:welcomeSeen', false);
  const [onboarded, setOnboarded] = useLS('ledger:onboarded', false);
  const [rates, setRates] = useLS('ledger:fxRates', buildDefaultRatesHistory());
  const [ratesUpdated, setRatesUpdated] = useLS('ledger:fxRatesUpdated', {});
  const [fxAutoFetch, setFxAutoFetch] = useLS('ledger:fxAutoFetch', 'off');
  const [fxLastFetchedAt, setFxLastFetchedAt] = useLS('ledger:fxLastFetchedAt', null);
  const [fxLastFetchError, setFxLastFetchError] = useLS('ledger:fxLastFetchError', null);
  const [fxMigrationToastSeen, setFxMigrationToastSeen] = useLS('ledger:fxMigrationToastSeen', false);

  // CAR-77: settings keys moved from App.jsx's useTweaks. Same keys, same
  // defaults — zero migration. App.jsx no longer maintains its own useLS;
  // <AppShell> reads these via useStore() so backup/restore can see and
  // write them through the same surface as everything else.
  const [accent, setAccent]       = useLS('ledger:accent',   ACCENTS[0].val);
  const [density, setDensity]     = useLS('ledger:density',  'comfortable');
  const [decimals, setDecimals]   = useLS('ledger:decimals', true);
  const [currency, setCurrency]   = useLS('ledger:currency', 'USD');
  const [theme, setTheme]         = useLS('ledger:theme',    'light');

  // CAR-218: cash-flow forecast settings.
  // - forecastLiquidAccountIds: explicit account-id allowlist for the
  //   forecast widget. Empty array = "auto" (use every liquid account from
  //   the data layer's default filter).
  // - forecastThreshold: total-balance floor below which a day is flagged
  //   as a risk event. Default 0 (overdraft).
  const [forecastLiquidAccountIds, setForecastLiquidAccountIds] = useLS('ledger:forecastLiquidAccountIds', []);
  const [forecastThreshold, setForecastThreshold] = useLS('ledger:forecastThreshold', 0);

  const fxFetchAbortRef = React.useRef(null);
  const [fxFetchInFlight, setFxFetchInFlight] = React.useState(false);
  const abortFxFetch = React.useCallback(() => {
    if (fxFetchAbortRef.current) {
      fxFetchAbortRef.current.abort();
      fxFetchAbortRef.current = null;
    }
    setFxFetchInFlight(false);
  }, []);

  // Move the data-theme effect from useTweaks to here.
  React.useEffect(() => {
    const valid = ['light', 'dark', 'auto'].includes(theme) ? theme : 'light';
    document.documentElement.setAttribute('data-theme', valid);
  }, [theme]);

  // CAR-77: backup metadata.
  // - lastBackupAt: ISO date string (YYYY-MM-DD) of the most recent successful
  //   exportBackup call, or null if the user has never backed up.
  // - backupReminderInterval: 0=Off, 7, 30, 90.
  // - backupReminderSnoozedUntil: ISO date until which the reminder is
  //   suppressed. Set when the user dismisses the reminder.
  const [lastBackupAt, setLastBackupAt] = useLS('ledger:lastBackupAt', null);
  const [backupReminderInterval, setBackupReminderIntervalRaw] = useLS('ledger:backupReminderInterval', 30);
  const [backupReminderSnoozedUntil, setBackupReminderSnoozedUntil] = useLS('ledger:backupReminderSnoozedUntil', null);

  const setBackupReminderInterval = React.useCallback(value => {
    const allowed = [0, 7, 30, 90];
    const next = allowed.includes(Number(value)) ? Number(value) : 30;
    setBackupReminderIntervalRaw(next);
  }, [setBackupReminderIntervalRaw]);

  React.useEffect(() => {
    // Intentional: txs is read from the initial synchronous localStorage load.
    // Empty deps ensures this runs only once on mount.
    if (txs.some(tx => !tx.date)) {
      setTxs(prev => migrateTransactions(prev));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // (CAR-76 migration is handled by the module-scope IIFE above, before any
  // StoreProvider render — that avoids the welcome-modal flicker for existing
  // users.)

  const hiddenSet = React.useMemo(() => new Set(hidden), [hidden]);
  const transactions = React.useMemo(() => txs.filter(t => !hiddenSet.has(t.id)), [txs, hiddenSet]);
  const periodTransactions = React.useMemo(
    () => filterTransactionsForPeriod(transactions, selectedPeriod, budgetStartDay),
    [transactions, selectedPeriod, budgetStartDay],
  );
  const periodLabel = React.useMemo(() => formatPeriodLabel(selectedPeriod, budgetStartDay), [selectedPeriod, budgetStartDay]);
  const budgetRows = React.useMemo(
    () => buildBudgetRows(Array.isArray(budgets) ? budgets : [], transactions, selectedPeriod, rates, currency),
    [budgets, transactions, selectedPeriod, rates, currency],
  );
  const billRows = React.useMemo(
    () => buildBillRows(bills, transactions, selectedPeriod),
    [bills, transactions, selectedPeriod],
  );
  const allAccountsWithBalance = React.useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return accounts
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(acct => {
        const acctTxs = transactions.filter(tx => tx.acct === acct.id);
        const balance = acct.openingBal + acctTxs.reduce((s, tx) => s + tx.amt, 0);
        const delta = acctTxs
          .filter(tx => tx.date?.startsWith(thisMonth))
          .reduce((s, tx) => s + tx.amt, 0);
        return { ...acct, balance, delta };
      });
  }, [accounts, transactions]);

  const accountsWithBalance = React.useMemo(
    () => allAccountsWithBalance.filter(a => !a.archived),
    [allAccountsWithBalance],
  );

  const accountsIncludedInTotals = React.useMemo(
    () => accountsWithBalance.filter(a => a.includeInTotals !== false),
    [accountsWithBalance],
  );

  // CAR-344: "safe to spend" hero metric. Derived entirely from the same
  // rows the Accounts / Bills / Budgets / Goals surfaces already compute, so
  // it stays provably consistent with them and re-renders whenever any of
  // those inputs change (transactions edit balances, bills, and budgets).
  // CAR-348: computed directly in the user's PRIMARY (reporting) currency.
  // `convert` maps each account/bill amount from its own ccy straight to the
  // primary ccy in ONE call; `budgetRows.left` is already in the primary ccy
  // (buildBudgetRows now threads `currency`); goals are bare primary-ccy
  // numbers. The consuming hero card therefore renders these values directly
  // WITHOUT a second conversion (doing so would double-convert).
  const safeToSpend = React.useMemo(
    () => computeSafeToSpend({
      accounts: accountsIncludedInTotals,
      billRows,
      budgetRows,
      goals,
      convert: (amt, ccy) => toReportingCurrency(amt, ccy, rates, currency),
    }),
    [accountsIncludedInTotals, billRows, budgetRows, goals, rates, currency],
  );

  const isAppEmpty = React.useMemo(
    () => isAppEmptyFor({ txs, accounts, bills, goals, budgets, investments, trades }),
    [txs, accounts, bills, goals, budgets, investments, trades],
  );

  const alertRowsWithAccounts = React.useMemo(
    () => buildAlertRows({
      billRows,
      budgetRows,
      goals,
      accountsWithBalance,
      investments,
      dismissedAlertIds,
      rates,
      ratesUpdated,
      transactions,
      fxMigrationToastSeen,
      isAppEmpty,
      lastBackupAt,
      backupReminderInterval,
      backupReminderSnoozedUntil,
    }),
    [billRows, budgetRows, goals, accountsWithBalance, investments, dismissedAlertIds, rates, ratesUpdated, transactions, fxMigrationToastSeen, isAppEmpty, lastBackupAt, backupReminderInterval, backupReminderSnoozedUntil],
  );

  // CAR-217: weekly insights — purely derived. `bills` is the recurring-rules
  // surface (see addRecurring/updateRecurring above), so it feeds
  // detectInactiveSubscriptions. Suppressed entirely on an empty store so a
  // brand-new user isn't shown stale-looking detectors.
  const insightRows = React.useMemo(
    () => isAppEmpty ? [] : buildInsightRows({
      transactions,
      recurringRules: bills,
      budgetRows,
      dismissedInsightIds,
    }),
    [isAppEmpty, transactions, bills, budgetRows, dismissedInsightIds],
  );

  // CAR-351: per-transaction anomaly flags — also purely derived, suppressed on
  // an empty store. Complements the weekly insights with transaction-level
  // outlier / duplicate / new-merchant detection.
  const anomalyRows = React.useMemo(
    () => isAppEmpty ? [] : buildAnomalyRows({ transactions, dismissedAnomalyIds }),
    [isAppEmpty, transactions, dismissedAnomalyIds],
  );

  const addTransactions = React.useCallback(incoming => setTxs(prev => {
    const keys = new Set(prev.map(t => `${t.name}|${t.amt}|${t.date}`));
    return [...prev, ...incoming.filter(t => !keys.has(`${t.name}|${t.amt}|${t.date}`))];
  }), [setTxs]);

  const hideTx = React.useCallback(id => setHidden(h => [...h, id]), [setHidden]);

  const deleteTx = React.useCallback(id => setTxs(prev => prev.filter(tx => tx.id !== id)), [setTxs]);

  const createTransfer = React.useCallback(({ fromAcct, toAcct, amtFrom, amtTo, date, note }) => {
    const id = 'xfer_' + Date.now();
    const fromAcctObj = accounts.find(a => a.id === fromAcct);
    const toAcctObj   = accounts.find(a => a.id === toAcct);
    const outName = note || ('TRANSFER → ' + (toAcctObj?.name   || toAcct));
    const inName  = note || ('TRANSFER ← ' + (fromAcctObj?.name || fromAcct));
    const outLeg = {
      id: id + '_out', name: outName,
      amt: -Math.abs(amtFrom), date, acct: fromAcct,
      ccy: fromAcctObj?.ccy || 'USD',
      cat: 'transfer', path: [],
      transferId: id, transferPeer: id + '_in',
      ...(note ? { note } : {}),
    };
    const inLeg = {
      id: id + '_in', name: inName,
      amt: Math.abs(amtTo), date, acct: toAcct,
      ccy: toAcctObj?.ccy || 'USD',
      cat: 'transfer', path: [],
      transferId: id, transferPeer: id + '_out',
      ...(note ? { note } : {}),
    };
    setTxs(prev => [...prev, outLeg, inLeg]);
  }, [accounts, setTxs]);

  const deleteTransfer = React.useCallback(transferId => {
    setTxs(prev => prev.filter(tx => tx.transferId !== transferId));
  }, [setTxs]);

  const updateTransfer = React.useCallback((transferId, { fromAcct, toAcct, amtFrom, amtTo, date, note }) => {
    setTxs(prev => {
      const legs = prev.filter(tx => tx.transferId === transferId);
      if (legs.length !== 2) return prev;
      const fromLegId = legs.find(l => l.amt < 0)?.id;
      const toLegId   = legs.find(l => l.amt > 0)?.id;
      const fromAcctObj = accounts.find(a => a.id === fromAcct);
      const toAcctObj   = accounts.find(a => a.id === toAcct);
      const outName = note || ('TRANSFER → ' + (toAcctObj?.name   || toAcct));
      const inName  = note || ('TRANSFER ← ' + (fromAcctObj?.name || fromAcct));
      return prev.map(tx => {
        if (tx.id === fromLegId) {
          return {
            ...tx,
            name: outName,
            amt: -Math.abs(amtFrom),
            date,
            acct: fromAcct,
            ccy: fromAcctObj?.ccy || tx.ccy,
            ...(note ? { note } : {}),
          };
        }
        if (tx.id === toLegId) {
          return {
            ...tx,
            name: inName,
            amt: Math.abs(amtTo),
            date,
            acct: toAcct,
            ccy: toAcctObj?.ccy || tx.ccy,
            ...(note ? { note } : {}),
          };
        }
        return tx;
      });
    });
  }, [accounts, setTxs]);

  const updateTx = React.useCallback((id, changes) => setTxs(prev =>
    prev.map(tx => tx.id === id ? { ...tx, ...changes } : tx)
  ), [setTxs]);

  // CAR-346: receipt/photo + note attachments on transactions. `note` reuses
  // the SAME field/convention already used by transfer legs (createTransfer /
  // updateTransfer). `attachments` is an optional array of downscaled,
  // size-capped base64 data-URL images stored on the tx object so they ride
  // the existing encrypted persistence + backup `transactions` slice. All
  // fields are optional and backward-compatible (txs without them are
  // unchanged). Built on the same setTxs map primitive as updateTx.
  const setTxNote = React.useCallback((id, note) => setTxs(prev =>
    prev.map(tx => {
      if (tx.id !== id) return tx;
      const trimmed = (note || '').trim();
      if (trimmed) return { ...tx, note: trimmed };
      // Empty note clears the field rather than storing an empty string.
      const { note: _drop, ...rest } = tx;
      return rest;
    })
  ), [setTxs]);

  const addTxAttachment = React.useCallback((id, attachment) => setTxs(prev =>
    prev.map(tx => tx.id === id
      ? { ...tx, attachments: [...(tx.attachments || []), attachment] }
      : tx)
  ), [setTxs]);

  const removeTxAttachment = React.useCallback((id, attachmentId) => setTxs(prev =>
    prev.map(tx => {
      if (tx.id !== id) return tx;
      const next = (tx.attachments || []).filter(a => a.id !== attachmentId);
      if (next.length > 0) return { ...tx, attachments: next };
      // Drop the field entirely when the last attachment is removed.
      const { attachments: _drop, ...rest } = tx;
      return rest;
    })
  ), [setTxs]);

  const addCategory = React.useCallback((pathParts, label) => {
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      if (pathParts.length === 0) {
        tree['c_' + Date.now()] = { label };
        return tree;
      }
      let node = tree;
      for (let i = 0; i < pathParts.length; i++) {
        node = i === 0 ? node[pathParts[i]] : (node.children || {})[pathParts[i]];
        if (!node) return prev;
      }
      if (!node.children) node.children = {};
      node.children['c_' + Date.now()] = { label };
      return tree;
    });
  }, [setCatTree]);

  // Walk a path of keys into the tree and apply a mutator function to the
  // leaf parent (so it can rename/remove the leaf key). pathParts[0] is a
  // top-level key; subsequent parts are children keys.
  const renameCategory = React.useCallback((pathParts, newLabel) => {
    if (!pathParts || pathParts.length === 0) return;
    const trimmed = (newLabel || '').trim();
    if (!trimmed) return;
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      let parent = tree;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const next = i === 0 ? parent[pathParts[i]] : (parent.children || {})[pathParts[i]];
        if (!next) return prev;
        parent = next;
      }
      const leafKey = pathParts[pathParts.length - 1];
      const container = pathParts.length === 1 ? parent : (parent.children || {});
      if (!container[leafKey]) return prev;
      container[leafKey] = { ...container[leafKey], label: trimmed };
      return tree;
    });
  }, [setCatTree]);

  const removeCategory = React.useCallback(pathParts => {
    if (!pathParts || pathParts.length === 0) return;
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      let parent = tree;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const next = i === 0 ? parent[pathParts[i]] : (parent.children || {})[pathParts[i]];
        if (!next) return prev;
        parent = next;
      }
      const leafKey = pathParts[pathParts.length - 1];
      const container = pathParts.length === 1 ? parent : (parent.children || {});
      if (!container[leafKey]) return prev;
      delete container[leafKey];
      return tree;
    });
  }, [setCatTree]);

  const restoreCategory = React.useCallback((pathParts, leaf) => {
    if (!pathParts || pathParts.length === 0 || !leaf) return;
    setCatTree(prev => {
      const tree = JSON.parse(JSON.stringify(prev));
      let parent = tree;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const next = i === 0 ? parent[pathParts[i]] : (parent.children || {})[pathParts[i]];
        if (!next) return prev; // path missing — abort
        parent = next;
      }
      const leafKey = pathParts[pathParts.length - 1];
      const container = pathParts.length === 1 ? parent : (parent.children = parent.children || {});
      if (container[leafKey]) return prev; // already exists
      container[leafKey] = leaf;
      return tree;
    });
  }, [setCatTree]);

  const setRate = React.useCallback((ccy, rate, options = {}) => {
    if (!ccy || ccy === 'USD') return; // USD is always 1.0; not editable
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    const effectiveFrom = options.effectiveFrom ? String(options.effectiveFrom).slice(0, 10) : todayIso();
    const source = options.source || 'manual';
    setRates(prev => upsertRateHistory(prev, ccy, numeric, effectiveFrom, source));
    setRatesUpdated(prev => ({ ...prev, [ccy]: source === 'seed' ? null : effectiveFrom }));
  }, [setRates, setRatesUpdated]);

  const removeRate = React.useCallback(ccy => {
    if (ccy === 'USD') return;
    setRates(prev => {
      const next = { ...prev };
      delete next[ccy];
      return next;
    });
    setRatesUpdated(prev => {
      const next = { ...prev };
      delete next[ccy];
      return next;
    });
  }, [setRates, setRatesUpdated]);

  const resetRates = React.useCallback(() => {
    abortFxFetch();
    setRates(buildDefaultRatesHistory());
    setRatesUpdated({});
  }, [abortFxFetch, setRates, setRatesUpdated]);

  // Auto-seed a placeholder rate (1.0) when an account in a new currency
  // shows up. The missing-rate alert (added in CAR-140) will then surface.
  const ensureRateForCurrency = React.useCallback(ccy => {
    if (!ccy || ccy === 'USD') return;
    setRates(prev => (prev[ccy] != null ? prev : upsertRateHistory(prev, ccy, 1.0, todayIso(), 'seed')));
    setRatesUpdated(prev => (prev[ccy] !== undefined ? prev : { ...prev, [ccy]: null }));
  }, [setRates, setRatesUpdated]);

  const addAccount = React.useCallback(acct => {
    ensureRateForCurrency(acct.ccy);
    setAccounts(prev => {
      if (prev.some(a => a.id === acct.id)) return prev;
      return [...prev, { archived: false, includeInTotals: true, order: prev.filter(a => !a.archived).length, ...acct }];
    });
  }, [ensureRateForCurrency, setAccounts]);

  const updateAccount = React.useCallback((id, patch) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'ccy')) {
      ensureRateForCurrency(patch.ccy);
    }
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }, [ensureRateForCurrency, setAccounts]);

  const archiveAccount = React.useCallback(id => setAccounts(prev =>
    prev.map(a => a.id === id ? { ...a, archived: true } : a)
  ), [setAccounts]);

  const deleteAccount = React.useCallback(id => setAccounts(prev => {
    const next = prev.filter(a => a.id !== id);
    let i = 0;
    return next.map(a => a.archived ? a : { ...a, order: i++ });
  }), [setAccounts]);

  const restoreAccount = React.useCallback((account, originalIndex) => {
    if (!account) return;
    setAccounts(prev => {
      if (prev.some(a => a.id === account.id)) return prev;
      const next = [...prev];
      const insertAt = Math.max(0, Math.min(originalIndex ?? next.length, next.length));
      next.splice(insertAt, 0, account);
      // Re-derive `order` for non-archived accounts to keep contiguous numbering.
      let i = 0;
      return next.map(a => a.archived ? a : { ...a, order: i++ });
    });
  }, [setAccounts]);

  const reorderAccounts = React.useCallback(orderedIds => setAccounts(prev => {
    const byId = Object.fromEntries(prev.map(a => [a.id, a]));
    const reordered = orderedIds.filter(id => byId[id]).map((id, i) => ({ ...byId[id], order: i }));
    const untouched = prev.filter(a => !orderedIds.includes(a.id));
    return [...reordered, ...untouched];
  }), [setAccounts]);

  const addRecurring = React.useCallback(rule => {
    const id = slug(rule.name) + '_' + Date.now();
    setBills(prev => [...prev, { ...rule, id, active: rule.active !== false }]);
  }, [setBills]);

  const updateRecurring = React.useCallback((id, patch) => {
    setBills(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }, [setBills]);

  const deleteRecurring = React.useCallback(id => {
    setBills(prev => prev.filter(b => b.id !== id));
  }, [setBills]);

  const markRecurringPaid = React.useCallback((rule, occurrenceDate) => {
    const tx = createRecurringPayment(rule, occurrenceDate);
    setTxs(prev => {
      if (prev.some(ex => ex.billKey === tx.billKey)) return prev;
      return [...prev, tx];
    });
  }, [setTxs]);

  const markBillPaid = React.useCallback(bill => {
    const occDate = getBillDueDate(bill, selectedPeriod);
    markRecurringPaid(bill, occDate);
  }, [markRecurringPaid, selectedPeriod]);

  const contributeToGoal = React.useCallback((goalId, details) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const result = createGoalContribution(goal, details);
    setGoals(prev => prev.map(g => g.id === goalId ? result.goal : g));
    setGoalContributions(prev => prev.some(c => c.id === result.contribution.id) ? prev : [...prev, result.contribution]);
    setTxs(prev => prev.some(tx => tx.id === result.transaction.id) ? prev : [...prev, result.transaction]);
  }, [goals, setGoals, setGoalContributions, setTxs]);

  const addGoal = React.useCallback(({ name, target, targetDate }) => {
    const id = 'g_' + Date.now();
    const goal = {
      id,
      name: (name || '').trim().toUpperCase(),
      target: Math.max(0, Number(target) || 0),
      current: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      ...(targetDate ? { targetDate } : {}),
    };
    setGoals(prev => [...prev, goal]);
    return goal;
  }, [setGoals]);

  const updateGoal = React.useCallback((id, patch) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  }, [setGoals]);

  const deleteGoal = React.useCallback(id => {
    setGoals(prev => prev.filter(g => g.id !== id));
    setGoalContributions(prev => prev.filter(c => c.goalId !== id));
    setGoalAutoFundRules(prev => prev.filter(r => r.goalId !== id));
  }, [setGoals, setGoalContributions, setGoalAutoFundRules]);

  const restoreGoal = React.useCallback((goal, contributions = []) => {
    if (!goal) return;
    setGoals(prev => prev.some(g => g.id === goal.id) ? prev : [...prev, goal]);
    if (contributions.length > 0) {
      setGoalContributions(prev => {
        const seen = new Set(prev.map(c => c.id));
        const additions = contributions.filter(c => !seen.has(c.id));
        return additions.length === 0 ? prev : [...prev, ...additions];
      });
    }
  }, [setGoals, setGoalContributions]);

  // CAR-347: auto-funding rule CRUD. Rules schedule recurring contributions to
  // a goal; they're applied on demand via runAutoFundRule (no silent execution).
  const addAutoFundRule = React.useCallback((rule) => {
    const created = {
      id: 'af_' + Date.now(),
      goalId: rule.goalId,
      amount: Math.max(0, Number(rule.amount) || 0),
      source: rule.source || 'chk',
      freq: rule.freq || 'monthly',
      ...(rule.day != null ? { day: Number(rule.day) } : {}),
      ...(rule.interval != null ? { interval: Number(rule.interval) } : {}),
      ...(rule.startDate ? { startDate: rule.startDate } : {}),
      active: rule.active !== false,
      lastFundedDate: rule.lastFundedDate || null,
    };
    setGoalAutoFundRules(prev => [...prev, created]);
    return created;
  }, [setGoalAutoFundRules]);

  const updateAutoFundRule = React.useCallback((id, patch) => {
    setGoalAutoFundRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, [setGoalAutoFundRules]);

  const deleteAutoFundRule = React.useCallback((id) => {
    setGoalAutoFundRules(prev => prev.filter(r => r.id !== id));
  }, [setGoalAutoFundRules]);

  // Apply every contribution a rule currently owes (occurrences since its last
  // funded date, up to today, clipped to the goal's headroom), then stamp
  // lastFundedDate. planAutoFundContributions produces stable-keyed dated
  // contributions + transactions, so the goal balance, contribution history,
  // and ledger all stay consistent and re-runs are idempotent.
  const runAutoFundRule = React.useCallback((ruleId, todayIso = new Date().toISOString().slice(0, 10)) => {
    const rule = goalAutoFundRules.find(r => r.id === ruleId);
    if (!rule) return { applied: 0 };
    const goal = goals.find(g => g.id === rule.goalId);
    if (!goal) return { applied: 0 };
    const dueDates = computeDueContributions(rule, todayIso);
    if (dueDates.length === 0) return { applied: 0 };

    // Pure planner: clips to the goal's remaining headroom (never over-funds
    // past target) and assigns STABLE ids keyed on rule+date so a double-click
    // or interrupted re-run is idempotent — the seen-set dedupe below catches
    // already-applied dates instead of creating timestamped duplicates.
    const plan = planAutoFundContributions(goal, rule, dueDates);
    if (plan.contributions.length === 0) return { applied: 0 };

    setGoals(prev => prev.map(g => g.id === plan.goalNext.id ? plan.goalNext : g));
    setGoalContributions(prev => {
      const seen = new Set(prev.map(c => c.id));
      const additions = plan.contributions.filter(c => !seen.has(c.id));
      return additions.length === 0 ? prev : [...prev, ...additions];
    });
    setTxs(prev => {
      const seen = new Set(prev.map(tx => tx.id));
      const additions = plan.transactions.filter(tx => !seen.has(tx.id));
      return additions.length === 0 ? prev : [...prev, ...additions];
    });
    setGoalAutoFundRules(prev => prev.map(r => r.id === ruleId
      ? { ...r, lastFundedDate: plan.lastFundedDate || r.lastFundedDate }
      : r));

    return { applied: plan.contributions.length, total: plan.total };
  }, [goalAutoFundRules, goals, setGoals, setGoalContributions, setTxs, setGoalAutoFundRules]);

  // CAR-345: debt payoff planner CRUD. Mirrors the goals slice shape.
  const addDebt = React.useCallback(({ name, balance, apr, minPayment }) => {
    const debt = {
      id: 'd_' + Date.now(),
      name: (name || '').trim().toUpperCase(),
      balance: Math.max(0, Number(balance) || 0),
      apr: Math.max(0, Number(apr) || 0),
      minPayment: Math.max(0, Number(minPayment) || 0),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setDebts(prev => [...prev, debt]);
    return debt;
  }, [setDebts]);

  const updateDebt = React.useCallback((id, patch) => {
    setDebts(prev => prev.map(d => {
      if (d.id !== id) return d;
      const next = { ...d, ...patch };
      if (patch.name !== undefined) next.name = String(patch.name).trim().toUpperCase();
      if (patch.balance !== undefined) next.balance = Math.max(0, Number(patch.balance) || 0);
      if (patch.apr !== undefined) next.apr = Math.max(0, Number(patch.apr) || 0);
      if (patch.minPayment !== undefined) next.minPayment = Math.max(0, Number(patch.minPayment) || 0);
      return next;
    }));
  }, [setDebts]);

  const deleteDebt = React.useCallback(id => {
    setDebts(prev => prev.filter(d => d.id !== id));
  }, [setDebts]);

  const restoreDebt = React.useCallback(debt => {
    if (!debt) return;
    setDebts(prev => prev.some(d => d.id === debt.id) ? prev : [...prev, debt]);
  }, [setDebts]);

  const setExtraPayment = React.useCallback(v => {
    setDebtExtraPayment(Math.max(0, Number(v) || 0));
  }, [setDebtExtraPayment]);

  const addBudget = React.useCallback(({ cat, limit, rollover }) => {
    const entry = {
      cat,
      limit: Math.max(0, Number(limit) || 0),
      spent: 0,
      ...(rollover != null ? { rollover: Number(rollover) || 0 } : {}),
    };
    setBudgets(prev => prev.some(b => b.cat === cat) ? prev : [...prev, entry]);
    return entry;
  }, [setBudgets]);

  const updateBudget = React.useCallback((cat, patch) => {
    setBudgets(prev => prev.map(b => b.cat === cat ? { ...b, ...patch } : b));
  }, [setBudgets]);

  const removeBudget = React.useCallback(cat => {
    setBudgets(prev => prev.filter(b => b.cat !== cat));
  }, [setBudgets]);

  // ─── CAR-82 bulk transaction operations ──────────────────────────────────
  // Single-render variants. Each is registered as ONE undo entry by the
  // useUndoableStore wrappers (see useUndoableStore.js). Atomicity matters:
  // 50 sequential setTxs calls would run the reducer 50 times even with
  // React's render batching.

  const deleteTxs = React.useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    setTxs(prev => deleteTxsFromArray(prev, ids));
  }, [setTxs]);

  const hideTxs = React.useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    setHidden(prev => hideIdsToArray(prev, ids));
  }, [setHidden]);

  const updateTxs = React.useCallback((ids, patch) => {
    if (!ids || ids.length === 0 || !patch) return;
    setTxs(prev => updateTxsInArray(prev, ids, patch));
  }, [setTxs]);

  const convertToTransfer = React.useCallback((aId, bId, params, transferId) => {
    if (!aId || !bId || !transferId) return;
    // Resolve account ids to display names so the auto-generated leg names
    // read "TRANSFER → Checking" instead of "TRANSFER → chk".
    const fromAcctObj = accounts.find(a => a.id === params.fromAcct);
    const toAcctObj   = accounts.find(a => a.id === params.toAcct);
    setTxs(prev => convertToTransferInArray(prev, aId, bId, {
      ...params,
      fromCcy: fromAcctObj?.ccy || 'USD',
      toCcy:   toAcctObj?.ccy || 'USD',
      fromAcctName: fromAcctObj?.name || params.fromAcct,
      toAcctName:   toAcctObj?.name || params.toAcct,
    }, transferId));
  }, [accounts, setTxs]);

  // ─── CAR-80 rules CRUD ──────────────────────────────────────────────
  // Array index in the rules slice IS the priority (first match wins).
  // No `priority` field on rule objects.

  const addRule = React.useCallback((rule) => {
    if (!rule || !rule.match || !rule.match.merchantPattern) return;
    const id = 'rule_' + Date.now();
    const newRule = {
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
      ...rule,
      id,  // generated id wins over any caller-provided id
    };
    setRules(prev => [...prev, newRule]);
    // CAR-182: if this rule covers a tracked (merchant, target) pair, drop
    // the stat so we don't suggest the same rule again.
    const eviction = findEvictionForNewRule(rule);
    if (eviction) {
      setRecategorizeStats(prev => applyEvict(prev, eviction.merchantKey, eviction.targetPath));
    }
    return newRule;
  }, [setRules, setRecategorizeStats]);

  const updateRule = React.useCallback((id, patch) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, [setRules]);

  const deleteRule = React.useCallback((id) => {
    setRules(prev => prev.filter(r => r.id !== id));
  }, [setRules]);

  const reorderRules = React.useCallback((orderedIds) => {
    setRules(prev => {
      const byId = Object.fromEntries(prev.map(r => [r.id, r]));
      const reordered = orderedIds.filter(id => byId[id]).map(id => byId[id]);
      const untouched = prev.filter(r => !orderedIds.includes(r.id));
      return [...reordered, ...untouched];
    });
  }, [setRules]);

  // ─── CAR-182: re-categorization stats & rule suggestions ─────────────
  // Pure logic lives in recategorizeStats.mjs; this section wires it to React
  // state and exposes the actions on the store context.

  const recordRecategorize = React.useCallback((merchantKey, targetPath, txId) => {
    let firedSuggestion = null;
    setRecategorizeStats(prev => {
      const { next, fired } = applyRecategorizeEvent(prev, merchantKey, targetPath, txId);
      firedSuggestion = fired;
      return next;
    });
    if (firedSuggestion) {
      setPendingRuleSuggestion(firedSuggestion);
    }
    return firedSuggestion;
  }, [setRecategorizeStats]);

  const dismissRuleSuggestion = React.useCallback((merchantKey) => {
    setPendingRuleSuggestion(null);
    if (!merchantKey) return;
    setRecategorizeStats(prev => applyDismiss(prev, merchantKey));
  }, [setRecategorizeStats]);

  const evictRecategorizeStat = React.useCallback((merchantKey, targetPath) => {
    setRecategorizeStats(prev => applyEvict(prev, merchantKey, targetPath));
  }, [setRecategorizeStats]);

  const acceptRuleSuggestion = React.useCallback(() => {
    // Caller (toast) handles opening the modal; this just clears the pending
    // signal so the toast hides while the modal is open. Note: if the user
    // then cancels the modal without saving, count stays at threshold and
    // the suggestion won't re-fire for this exact (merchant, target) pair —
    // by design ("user considered + declined, don't keep nagging"). They'll
    // still get suggestions for the same merchant on different targets.
    setPendingRuleSuggestion(null);
  }, []);

  const updateTxsIndividually = React.useCallback((perTxPatches) => {
    if (!perTxPatches || perTxPatches.length === 0) return;
    setTxs(prev => updateTxsIndividuallyInArray(prev, perTxPatches));
  }, [setTxs]);

  // Transient filter applied on top of the current period in the Transactions
  // screens. Set by Reports drill-down clicks; cleared when the user closes
  // the filter chip or navigates away. Persisted to localStorage so a refresh
  // mid-drill-down doesn't lose state, but cleared on reset.
  const [txFilter, setTxFilterRaw] = useLS('ledger:txFilter', null);

  const setTxFilter = React.useCallback(filter => {
    setTxFilterRaw(filter && Object.keys(filter).length > 0 ? filter : null);
  }, [setTxFilterRaw]);

  const clearTxFilter = React.useCallback(() => setTxFilterRaw(null), [setTxFilterRaw]);

  const addView = React.useCallback((view) => {
    if (!view || !view.name) return;
    const name = String(view.name).trim();
    if (!name) return;
    const scope = view.scope === 'reports' ? 'reports' : 'tx';
    const entry = {
      id: view.id || `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      scope,
      name,
      period: view.period,
      range: view.range,
      search: view.search,
      txFilter: view.txFilter ?? null,
      sortBy: view.sortBy,
      sortOrder: view.sortOrder,
    };
    setSavedViews(prev => {
      const matchIdx = prev.findIndex(existing =>
        existing.scope === scope && String(existing.name || '').trim().toLowerCase() === name.toLowerCase(),
      );
      if (matchIdx === -1) return [...prev, entry];
      const next = prev.slice();
      // Upsert: refresh the filter snapshot but PRESERVE the existing
      // entry's id and the original display-case of its name. Otherwise
      // saving "foo" then "FOO" silently rewrites the user's label.
      next[matchIdx] = { ...prev[matchIdx], ...entry, id: prev[matchIdx].id, name: prev[matchIdx].name };
      return next;
    });
  }, [setSavedViews]);

  const updateView = React.useCallback((id, patch) => {
    if (!id) return;
    setSavedViews(prev => {
      const target = prev.find(view => view.id === id);
      if (!target) return prev;

      // Validate name patches BEFORE mutating: whitespace-only is a
      // developer error (callers must trim at the boundary), and
      // renaming into an existing (scope, name) collision would
      // leave the dropdown showing two rows with the same label —
      // mirror addView's silent-upsert protection by rejecting it
      // here too. UI callers MUST try/catch LEDGER_DUPLICATE_VIEW_NAME
      // because users can type a duplicate; the LEDGER_INVALID_VIEW_NAME
      // throw is a developer-error guardrail (callers trim first, so it
      // should be unreachable from the UI).
      if (patch && patch.name !== undefined) {
        const nextName = String(patch.name).trim();
        if (!nextName) throw new Error('LEDGER_INVALID_VIEW_NAME');
        const nextScope = (patch.scope === 'reports' || patch.scope === 'tx') ? patch.scope : target.scope;
        const collision = prev.some(view =>
          view.id !== id
          && view.scope === nextScope
          && String(view.name || '').trim().toLowerCase() === nextName.toLowerCase(),
        );
        if (collision) throw new Error('LEDGER_DUPLICATE_VIEW_NAME');
      }

      return prev.map(view => {
        if (view.id !== id) return view;
        const next = { ...view, ...patch };
        if (next.name !== undefined) {
          next.name = String(next.name).trim();
        }
        if (next.scope !== 'reports' && next.scope !== 'tx') next.scope = view.scope;
        if (next.txFilter === undefined) next.txFilter = view.txFilter ?? null;
        return next;
      });
    });
  }, [setSavedViews]);

  const deleteView = React.useCallback((id) => {
    if (!id) return;
    setSavedViews(prev => prev.filter(view => view.id !== id));
  }, [setSavedViews]);

  const goToPreviousPeriod = React.useCallback(() => {
    setSelectedPeriod(period => addMonths(period, -1));
  }, [setSelectedPeriod]);

  const goToNextPeriod = React.useCallback(() => {
    setSelectedPeriod(period => addMonths(period, 1));
  }, [setSelectedPeriod]);

  const addTrade = React.useCallback(trade => {
    const newTrade = { ...trade, id: 'tr_' + Date.now() };
    setTrades(prev => [...prev, newTrade]);
    setInvestments(prev => {
      const shareDelta = trade.type === 'buy' ? trade.shares : -trade.shares;
      const existing = prev.find(h => h.ticker === trade.ticker);
      if (existing) {
        return prev.map(h => h.ticker === trade.ticker ? { ...h, shares: h.shares + shareDelta } : h);
      }
      return [...prev, { ticker: trade.ticker, name: trade.ticker, shares: shareDelta, price: trade.price, chg: 0 }];
    });
  }, [setTrades, setInvestments]);

  const updateHolding = React.useCallback((ticker, fields) => {
    setInvestments(prev => prev.map(h => h.ticker === ticker ? { ...h, ...fields } : h));
  }, [setInvestments]);

  const removeHolding = React.useCallback(ticker => {
    setInvestments(prev => prev.filter(h => h.ticker !== ticker));
    setTrades(prev => prev.filter(t => t.ticker !== ticker));
  }, [setInvestments, setTrades]);

  const restoreHolding = React.useCallback((holding, trades = []) => {
    if (!holding) return;
    setInvestments(prev => prev.some(h => h.ticker === holding.ticker) ? prev : [...prev, holding]);
    if (trades.length > 0) {
      setTrades(prev => {
        const seen = new Set(prev.map(t => t.id));
        const additions = trades.filter(t => !seen.has(t.id));
        return additions.length === 0 ? prev : [...prev, ...additions];
      });
    }
  }, [setInvestments, setTrades]);

  const dismissAlert = React.useCallback(id => {
    if (id === 'fx:migration-notice') {
      setFxMigrationToastSeen(true);
      return;
    }
    if (id === 'backup:reminder') {
      // Snooze for one full interval. Anchored to the dismiss-time interval,
      // not whatever the user changes it to afterwards.
      const days = Number(backupReminderInterval) || 30;
      const next = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      setBackupReminderSnoozedUntil(next);
      return;
    }
    setDismissedAlertIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, [setDismissedAlertIds, setFxMigrationToastSeen, backupReminderInterval, setBackupReminderSnoozedUntil]);

  const restoreAlerts = React.useCallback(() => {
    setDismissedAlertIds([]);
  }, [setDismissedAlertIds]);

  // CAR-217: insights dismissal mirrors alerts. Insights have no special-case
  // ids (no FX migration / backup reminder), so the body is straightforward.
  const dismissInsight = React.useCallback(id => {
    setDismissedInsightIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, [setDismissedInsightIds]);

  const restoreInsights = React.useCallback(() => {
    setDismissedInsightIds([]);
  }, [setDismissedInsightIds]);

  // CAR-351: anomaly dismissal mirrors insights.
  const dismissAnomaly = React.useCallback(id => {
    setDismissedAnomalyIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, [setDismissedAnomalyIds]);

  const restoreAnomalies = React.useCallback(() => {
    setDismissedAnomalyIds([]);
  }, [setDismissedAnomalyIds]);

  const dismissWelcome = React.useCallback(() => {
    setWelcomeSeen(true);
  }, [setWelcomeSeen]);

  // Internal: actually seed the store with demo data. No precondition check.
  // Used by both `loadSampleData` (with check) and `resetAndLoadSampleData`
  // (which has just wiped the store, so the check would be a tautology AND
  // would observe stale closure state from before the reset — see CAR-76
  // code review notes).
  const _seedSampleData = React.useCallback(() => {
    setTxs(TRANSACTIONS);
    setAccounts(ACCOUNTS);
    setBudgets(BUDGETS);
    setBills(BILLS);
    setGoals(GOALS);
    setInvestments(INVESTMENTS);
    setTrades(TRADES);
    setCatTree(prev => isDefaultCatTreeFor(prev) ? CATEGORY_TREE : prev);
  }, [setTxs, setAccounts, setBudgets, setBills, setGoals, setInvestments, setTrades, setCatTree]);

  const loadSampleData = React.useCallback(() => {
    if (!isAppEmptyFor({ txs, accounts, bills, goals, budgets, investments, trades })) {
      throw new Error('LEDGER_NOT_EMPTY');
    }
    _seedSampleData();
  }, [txs, accounts, bills, goals, budgets, investments, trades, _seedSampleData]);

  // Atomic "reset then load samples" — performs both updates in the same React
  // batch, so the user goes from non-empty → empty → seeded in a single render.
  // Bypasses loadSampleData's precondition because we just wiped the store; the
  // closure-captured `txs`/`accounts`/etc. would still be non-empty here.
  const resetAndLoadSampleData = React.useCallback(() => {
    abortFxFetch();
    setTxs([]);
    setCatTree(DEFAULT_CAT_TREE);
    setBudgets([]);
    setAccounts([]);
    setBills([]);
    setGoals([]);
    setGoalContributions([]);
    setGoalAutoFundRules([]);
    setRules([]);
    setSavedViews([]);
    setRecategorizeStats({});
    setSelectedPeriod(monthKey(new Date()));
    setHidden([]);
    setBudgetStartDay(1);
    setInvestments([]);
    setTrades([]);
    setDismissedAlertIds([]);
    setDismissedInsightIds([]);
    setDismissedAnomalyIds([]);
    setTxFilterRaw(null);
    setRates(DEFAULT_RATES);
    setRatesUpdated({});
    setFxAutoFetch('off');
    setFxLastFetchedAt(null);
    setFxLastFetchError(null);
    setFxMigrationToastSeen(false);
    setWelcomeSeen(true); // already past the welcome — don't re-show it
    setOnboarded(true);
    setLastBackupAt(null);
    setBackupReminderSnoozedUntil(null);
    setBackupReminderIntervalRaw(30);
    setDebts([]); // CAR-345
    setDebtExtraPayment(0); // CAR-345
    _seedSampleData();
  }, [_seedSampleData, abortFxFetch, setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setRules, setSavedViews, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades, setDismissedAlertIds, setDismissedInsightIds, setTxFilterRaw, setRates, setRatesUpdated, setFxAutoFetch, setFxLastFetchedAt, setFxLastFetchError, setFxMigrationToastSeen, setWelcomeSeen, setOnboarded, setLastBackupAt, setBackupReminderSnoozedUntil, setBackupReminderIntervalRaw, setDebts, setDebtExtraPayment, setGoalAutoFundRules]);

  React.useEffect(() => () => {
    if (fxFetchAbortRef.current) fxFetchAbortRef.current.abort();
  }, []);

  const refreshRatesNow = React.useCallback(async () => {
    const requested = Object.keys(rates).filter(ccy => ccy !== 'USD');
    // Guard: with no non-USD currencies configured, an unfiltered request
    // would return all ~33 Frankfurter currencies and silently inject them
    // into the user's rates table (review: PR #61).
    if (requested.length === 0) {
      setFxLastFetchError(null);
      return { ok: true };
    }
    abortFxFetch();

    const controller = new AbortController();
    fxFetchAbortRef.current = controller;
    setFxFetchInFlight(true);
    setFxLastFetchError(null);

    try {
      const result = await fetchRatesFromFrankfurter(requested, controller.signal);
      if (fxFetchAbortRef.current !== controller) {
        return { ok: false, error: 'Aborted' };
      }

      for (const [ccy, rate] of Object.entries(result.rates)) {
        if (ccy === 'USD') continue;
        setRate(ccy, rate, { source: 'fetched', effectiveFrom: result.fetchedAt });
      }

      setFxLastFetchedAt(result.fetchedAt);
      setFxLastFetchError(null);
      return { ok: true };
    } catch (error) {
      if (fxFetchAbortRef.current !== controller || controller.signal.aborted || error?.name === 'AbortError') {
        return { ok: false, error: 'Aborted' };
      }

      const message = error instanceof Error ? error.message : String(error || 'Failed to fetch FX rates.');
      setFxLastFetchError(message);
      return { ok: false, error: message };
    } finally {
      if (fxFetchAbortRef.current === controller) {
        fxFetchAbortRef.current = null;
        setFxFetchInFlight(false);
      }
    }
  }, [abortFxFetch, rates, setRate, setFxLastFetchedAt, setFxLastFetchError]);

  // CAR-77: returns the JSON string the user will download. Reads the
  // current state synchronously via the captured useLS values; if React
  // hasn't yet committed a recent setter, the reader still sees the
  // committed copy in localStorage on next render — but for export-now,
  // these closure values are the live ones. Pure builder lives in
  // backup.mjs.
  const exportBackup = React.useCallback(() => {
    const obj = buildBackup({
      txs, accounts, catTree, budgets, hidden, bills, goals, goalContributions,
      savedViews, investments, trades, rates, ratesUpdated, fxAutoFetch, fxLastFetchedAt, fxLastFetchError,
      selectedPeriod, budgetStartDay, debts, debtExtraPayment,
      goalAutoFundRules, // CAR-360: persist per-goal auto-fund rules (CAR-347)
      settings: { accent, density, decimals, currency, theme, forecastLiquidAccountIds, forecastThreshold },
    });
    return JSON.stringify(obj, null, 2);
  }, [txs, accounts, catTree, budgets, hidden, bills, goals, goalContributions, savedViews, investments, trades, rates, ratesUpdated, fxAutoFetch, fxLastFetchedAt, fxLastFetchError, selectedPeriod, budgetStartDay, debts, debtExtraPayment, goalAutoFundRules, accent, density, decimals, currency, theme, forecastLiquidAccountIds, forecastThreshold]);

  const recordBackupTaken = React.useCallback(() => {
    setLastBackupAt(new Date().toISOString().slice(0, 10));
    setBackupReminderSnoozedUntil(null); // a real backup clears any snooze.
  }, [setLastBackupAt, setBackupReminderSnoozedUntil]);

  // CAR-77: replaces the entire user-data state with the contents of a
  // validated backup. Single React batch — every setter fires before the
  // next render. Session ephemera (txFilter, dismissedAlerts, welcomeSeen,
  // fxMigrationToastSeen) is reset explicitly: post-restore they should
  // not carry over. lastBackupAt is NOT updated — restore is not a backup.
  const restoreBackup = React.useCallback(data => {
    abortFxFetch();
    // CAR-77 review hardening: defense-in-depth. Callers should always pass
    // validated data (parseBackup result), but a future regression that
    // forgets the .ok gate shouldn't crash the entire app.
    if (!data || typeof data !== 'object') return;
    setTxs(Array.isArray(data.transactions) ? data.transactions : []);
    setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    setCatTree(data.categoryTree && typeof data.categoryTree === 'object' ? data.categoryTree : DEFAULT_CAT_TREE);
    setBudgets(Array.isArray(data.budgets) ? data.budgets : []);
    setHidden(Array.isArray(data.hidden) ? data.hidden : []);
    setBills(Array.isArray(data.bills) ? data.bills : []);
    setGoals(Array.isArray(data.goals) ? data.goals : []);
    setGoalContributions(Array.isArray(data.goalContributions) ? data.goalContributions : []);
    setRules(Array.isArray(data.rules) ? data.rules : []);
    setSavedViews(Array.isArray(data.savedViews) ? data.savedViews : []);
    // CAR-345: debts default to [] when restoring an older backup without them.
    setDebts(Array.isArray(data.debts) ? data.debts : []);
    // CAR-360: per-goal auto-fund rules (CAR-347) default to [] when restoring
    // an older backup that predates the slice (backward-compatible).
    setGoalAutoFundRules(Array.isArray(data.goalAutoFundRules) ? data.goalAutoFundRules : []);
    setDebtExtraPayment(Math.max(0, Number(data.debtExtraPayment) || 0));
    // CAR-182: backups don't carry recategorize stats — clear them on restore
    // so the new dataset starts fresh (counters keyed on old tx ids would be stale).
    setRecategorizeStats({});
    setInvestments(Array.isArray(data.investments) ? data.investments : []);
    setTrades(Array.isArray(data.trades) ? data.trades : []);
    setRates(normalizeRatesHistory(data.fxRates, todayIso()));
    setRatesUpdated(data.fxRatesUpdated && typeof data.fxRatesUpdated === 'object' ? data.fxRatesUpdated : {});
    if (data.selectedPeriod) setSelectedPeriod(data.selectedPeriod);
    // CAR-77 review hardening: clamp budgetStartDay to [1, 28] to mirror the
    // UI invariant in commitDay. Backup files are human-readable JSON by
    // design — a hand-edited "99" or "banana" would otherwise corrupt period
    // calculations until the user opens settings.
    if (data.budgetStartDay != null) {
      const n = parseInt(data.budgetStartDay, 10);
      setBudgetStartDay(Number.isFinite(n) ? Math.max(1, Math.min(28, n)) : 1);
    }

    // Settings: only apply keys the backup actually contains; missing keys
    // preserve the user's current setting.
    const s = data.settings || {};
    if (s.accent   !== undefined) setAccent(s.accent);
    if (s.density  !== undefined) setDensity(s.density);
    if (s.decimals !== undefined) setDecimals(s.decimals);
    if (s.currency !== undefined) setCurrency(s.currency);
    if (s.theme    !== undefined) setTheme(s.theme);
    // CAR-218: forecast settings ride along on the same `settings` object.
    if (Array.isArray(s.forecastLiquidAccountIds)) {
      setForecastLiquidAccountIds(s.forecastLiquidAccountIds);
    }
    if (s.forecastThreshold !== undefined) {
      const n = Number(s.forecastThreshold);
      setForecastThreshold(Number.isFinite(n) ? n : 0);
    }

    // Session ephemera reset.
    setTxFilterRaw(null);
    setDismissedAlertIds([]);
    setDismissedInsightIds([]);
    setDismissedAnomalyIds([]);
    setFxAutoFetch('off');
    setFxLastFetchedAt(null);
    setFxLastFetchError(null);
    setWelcomeSeen(true);          // user is past the welcome by definition.
    setFxMigrationToastSeen(true); // restored data already has whatever rates it has.
    setBackupReminderSnoozedUntil(null);
    // Note: NOT touching lastBackupAt — restoring is not the same as backing up.
  }, [
    abortFxFetch,
    setTxs, setAccounts, setCatTree, setBudgets, setHidden, setBills, setGoals,
    setGoalContributions, setRules, setRecategorizeStats, setInvestments, setTrades, setRates, setRatesUpdated,
    setSelectedPeriod, setBudgetStartDay,
    setAccent, setDensity, setDecimals, setCurrency, setTheme,
    setForecastLiquidAccountIds, setForecastThreshold,
    setTxFilterRaw, setDismissedAlertIds, setDismissedInsightIds,
    setFxAutoFetch, setFxLastFetchedAt, setFxLastFetchError,
    setWelcomeSeen, setFxMigrationToastSeen,
    setBackupReminderSnoozedUntil,
    setDebts, setDebtExtraPayment,
    setGoalAutoFundRules, // CAR-360
  ]);

  const reset = React.useCallback(() => {
    abortFxFetch();
    setTxs([]);
    setCatTree(DEFAULT_CAT_TREE);
    setBudgets([]);
    setAccounts([]);
    setBills([]);
    setGoals([]);
    setGoalContributions([]);
    setGoalAutoFundRules([]);
    setRules([]);
    setSavedViews([]);
    setRecategorizeStats({});
    setSelectedPeriod(monthKey(new Date()));
    setHidden([]);
    setBudgetStartDay(1);
    setInvestments([]);
    setTrades([]);
    setDismissedAlertIds([]);
    setDismissedInsightIds([]);
    setDismissedAnomalyIds([]);
    setTxFilterRaw(null);
    setRates(DEFAULT_RATES);
    setRatesUpdated({});
    setFxAutoFetch('off');
    setFxLastFetchedAt(null);
    setFxLastFetchError(null);
    setFxMigrationToastSeen(false);
    setWelcomeSeen(false);
    setOnboarded(false);
    setLastBackupAt(null);
    setBackupReminderSnoozedUntil(null);
    setBackupReminderIntervalRaw(30);
    // CAR-218: clear forecast settings to defaults too.
    setForecastLiquidAccountIds([]);
    setForecastThreshold(0);
    setDebts([]); // CAR-345
    setDebtExtraPayment(0); // CAR-345
  }, [abortFxFetch, setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setRules, setSavedViews, setRecategorizeStats, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades, setDismissedAlertIds, setDismissedInsightIds, setTxFilterRaw, setRates, setRatesUpdated, setFxAutoFetch, setFxLastFetchedAt, setFxLastFetchError, setFxMigrationToastSeen, setWelcomeSeen, setOnboarded, setLastBackupAt, setBackupReminderSnoozedUntil, setBackupReminderIntervalRaw, setForecastLiquidAccountIds, setForecastThreshold, setDebts, setDebtExtraPayment, setGoalAutoFundRules]);

  return (
    <StoreCtx.Provider value={{
      transactions,
      periodTransactions,
      allTransactions: txs,
      setTransactions: setTxs,
      addTransactions,
      hideTx,
      setHidden,
      hidden,
      deleteTx,
      createTransfer,
      updateTransfer,
      deleteTransfer,
      updateTx,
      // CAR-346 receipt/photo + note attachments
      setTxNote,
      addTxAttachment,
      removeTxAttachment,
      // CAR-82 bulk methods
      deleteTxs,
      hideTxs,
      updateTxs,
      convertToTransfer,
      // CAR-80 rules
      rules,
      addRule,
      updateRule,
      deleteRule,
      reorderRules,
      savedViews,
      addView,
      updateView,
      deleteView,

      recategorizeStats,
      pendingRuleSuggestion,
      recordRecategorize,
      dismissRuleSuggestion,
      acceptRuleSuggestion,
      evictRecategorizeStat,
      // CAR-80 per-tx bulk update (used by re-apply preview)
      updateTxsIndividually,
      categoryTree: catTree,
      setCategoryTree: setCatTree,
      addCategory,
      renameCategory,
      removeCategory,
      restoreCategory,
      budgets,
      setBudgets,
      addBudget,
      updateBudget,
      removeBudget,
      budgetRows,
      bills,
      setBills,
      billRows,
      alertRows: alertRowsWithAccounts,
      dismissedAlertIds,
      dismissAlert,
      restoreAlerts,
      // CAR-217
      insightRows,
      dismissInsight,
      restoreInsights,
      // CAR-351
      anomalyRows,
      dismissAnomaly,
      restoreAnomalies,
      lastBackupAt,
      backupReminderInterval,
      setBackupReminderInterval,
      backupReminderSnoozedUntil,
      exportBackup,
      restoreBackup,
      recordBackupTaken,
      markBillPaid,
      addRecurring,
      updateRecurring,
      deleteRecurring,
      markRecurringPaid,
      goals,
      setGoals,
      goalContributions,
      setGoalContributions,
      contributeToGoal,
      addGoal,
      updateGoal,
      deleteGoal,
      restoreGoal,
      goalAutoFundRules,
      setGoalAutoFundRules,
      addAutoFundRule,
      updateAutoFundRule,
      deleteAutoFundRule,
      runAutoFundRule,
      // CAR-345: debt payoff planner
      debts,
      setDebts,
      addDebt,
      updateDebt,
      deleteDebt,
      restoreDebt,
      debtExtraPayment,
      setDebtExtraPayment: setExtraPayment,
      selectedPeriod,
      setSelectedPeriod,
      txFilter,
      setTxFilter,
      clearTxFilter,
      periodLabel,
      goToPreviousPeriod,
      goToNextPeriod,
      accounts,
      accountsWithBalance,
      accountsIncludedInTotals,
      safeToSpend,
      allAccountsWithBalance,
      setAccounts,
      addAccount,
      updateAccount,
      archiveAccount,
      deleteAccount,
      restoreAccount,
      reorderAccounts,
      reset,
      budgetStartDay,
      setBudgetStartDay,
      investments,
      setInvestments,
      trades,
      addTrade,
      updateHolding,
      removeHolding,
      restoreHolding,
      rates,
      ratesUpdated,
      fxAutoFetch,
      fxLastFetchedAt,
      fxLastFetchError,
      setRate,
      removeRate,
      resetRates,
      refreshRatesNow,
      fxFetchInFlight,
      setFxAutoFetch,
      fxMigrationToastSeen,
      setFxMigrationToastSeen,
      accent, setAccent,
      density, setDensity,
      decimals, setDecimals,
      currency, setCurrency,
      theme, setTheme,
      // CAR-218
      forecastLiquidAccountIds, setForecastLiquidAccountIds,
      forecastThreshold, setForecastThreshold,
      welcomeSeen,
      onboarded,
      setOnboarded,
      dismissWelcome,
      loadSampleData,
      resetAndLoadSampleData,
      isAppEmpty,
    }}>
      {children}
    </StoreCtx.Provider>
  );
}

export const useStore = () => React.useContext(StoreCtx);
