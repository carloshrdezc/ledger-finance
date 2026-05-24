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
import {
  applyRecategorizeEvent,
  applyDismiss,
  applyEvict,
  findEvictionForNewRule,
} from './recategorizeStats.mjs';
import { buildAlertRows } from './alerts.mjs';
import { buildInsightRows } from './insights.mjs';
import { DEFAULT_RATES } from './fx.mjs';
import { buildBackup } from './backup.mjs';
import { ACCENTS } from './theme';
import {
  deleteTxsFromArray,
  hideIdsToArray,
  updateTxsInArray,
  convertToTransferInArray,
  updateTxsIndividuallyInArray,
} from './bulkOps.mjs';

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
                    'ledger:budgets', 'ledger:investments', 'ledger:trades'];
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
  const [goalContributions, setGoalContributions] = useLS('ledger:goalContributions', []);
  const [rules, setRules] = useLS('ledger:rules', []);
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
  const [welcomeSeen, setWelcomeSeen] = useLS('ledger:welcomeSeen', false);
  const [rates, setRates] = useLS('ledger:fxRates', DEFAULT_RATES);
  const [ratesUpdated, setRatesUpdated] = useLS('ledger:fxRatesUpdated', {});
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
    () => buildBudgetRows(Array.isArray(budgets) ? budgets : [], transactions, selectedPeriod, rates),
    [budgets, transactions, selectedPeriod, rates],
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

  const setRate = React.useCallback((ccy, rate) => {
    if (ccy === 'USD') return; // USD is always 1.0; not editable
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    setRates(prev => ({ ...prev, [ccy]: numeric }));
    setRatesUpdated(prev => ({ ...prev, [ccy]: new Date().toISOString().slice(0, 10) }));
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
    setRates(DEFAULT_RATES);
    setRatesUpdated({});
  }, [setRates, setRatesUpdated]);

  // Auto-seed a placeholder rate (1.0) when an account in a new currency
  // shows up. The missing-rate alert (added in CAR-140) will then surface.
  const ensureRateForCurrency = React.useCallback(ccy => {
    if (!ccy || ccy === 'USD') return;
    setRates(prev => prev[ccy] != null ? prev : { ...prev, [ccy]: 1.0 });
    setRatesUpdated(prev => prev[ccy] !== undefined ? prev : { ...prev, [ccy]: null });
  }, [setRates, setRatesUpdated]);

  const addAccount = React.useCallback(acct => {
    ensureRateForCurrency(acct.ccy);
    setAccounts(prev => {
      if (prev.some(a => a.id === acct.id)) return prev;
      return [...prev, { archived: false, includeInTotals: true, order: prev.filter(a => !a.archived).length, ...acct }];
    });
  }, [ensureRateForCurrency, setAccounts]);

  const updateAccount = React.useCallback((id, patch) => setAccounts(prev =>
    prev.map(a => a.id === id ? { ...a, ...patch } : a)
  ), [setAccounts]);

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
  }, [setGoals, setGoalContributions]);

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
    setTxs([]);
    setCatTree(DEFAULT_CAT_TREE);
    setBudgets([]);
    setAccounts([]);
    setBills([]);
    setGoals([]);
    setGoalContributions([]);
    setRules([]);
    setRecategorizeStats({});
    setSelectedPeriod(monthKey(new Date()));
    setHidden([]);
    setBudgetStartDay(1);
    setInvestments([]);
    setTrades([]);
    setDismissedAlertIds([]);
    setDismissedInsightIds([]);
    setTxFilterRaw(null);
    setRates(DEFAULT_RATES);
    setRatesUpdated({});
    setFxMigrationToastSeen(false);
    setWelcomeSeen(true); // already past the welcome — don't re-show it
    setLastBackupAt(null);
    setBackupReminderSnoozedUntil(null);
    setBackupReminderIntervalRaw(30);
    _seedSampleData();
  }, [_seedSampleData, setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setRules, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades, setDismissedAlertIds, setDismissedInsightIds, setTxFilterRaw, setRates, setRatesUpdated, setFxMigrationToastSeen, setWelcomeSeen, setLastBackupAt, setBackupReminderSnoozedUntil, setBackupReminderIntervalRaw]);

  // CAR-77: returns the JSON string the user will download. Reads the
  // current state synchronously via the captured useLS values; if React
  // hasn't yet committed a recent setter, the reader still sees the
  // committed copy in localStorage on next render — but for export-now,
  // these closure values are the live ones. Pure builder lives in
  // backup.mjs.
  const exportBackup = React.useCallback(() => {
    const obj = buildBackup({
      txs, accounts, catTree, budgets, hidden, bills, goals, goalContributions,
      investments, trades, rates, ratesUpdated,
      selectedPeriod, budgetStartDay,
      settings: { accent, density, decimals, currency, theme },
    });
    return JSON.stringify(obj, null, 2);
  }, [txs, accounts, catTree, budgets, hidden, bills, goals, goalContributions, investments, trades, rates, ratesUpdated, selectedPeriod, budgetStartDay, accent, density, decimals, currency, theme]);

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
    // CAR-182: backups don't carry recategorize stats — clear them on restore
    // so the new dataset starts fresh (counters keyed on old tx ids would be stale).
    setRecategorizeStats({});
    setInvestments(Array.isArray(data.investments) ? data.investments : []);
    setTrades(Array.isArray(data.trades) ? data.trades : []);
    setRates(data.fxRates && typeof data.fxRates === 'object' ? data.fxRates : DEFAULT_RATES);
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

    // Session ephemera reset.
    setTxFilterRaw(null);
    setDismissedAlertIds([]);
    setDismissedInsightIds([]);
    setWelcomeSeen(true);          // user is past the welcome by definition.
    setFxMigrationToastSeen(true); // restored data already has whatever rates it has.
    setBackupReminderSnoozedUntil(null);
    // Note: NOT touching lastBackupAt — restoring is not the same as backing up.
  }, [
    setTxs, setAccounts, setCatTree, setBudgets, setHidden, setBills, setGoals,
    setGoalContributions, setRules, setInvestments, setTrades, setRates, setRatesUpdated,
    setSelectedPeriod, setBudgetStartDay,
    setAccent, setDensity, setDecimals, setCurrency, setTheme,
    setTxFilterRaw, setDismissedAlertIds, setDismissedInsightIds, setWelcomeSeen, setFxMigrationToastSeen,
    setBackupReminderSnoozedUntil,
  ]);

  const reset = React.useCallback(() => {
    setTxs([]);
    setCatTree(DEFAULT_CAT_TREE);
    setBudgets([]);
    setAccounts([]);
    setBills([]);
    setGoals([]);
    setGoalContributions([]);
    setRules([]);
    setRecategorizeStats({});
    setSelectedPeriod(monthKey(new Date()));
    setHidden([]);
    setBudgetStartDay(1);
    setInvestments([]);
    setTrades([]);
    setDismissedAlertIds([]);
    setDismissedInsightIds([]);
    setTxFilterRaw(null);
    setRates(DEFAULT_RATES);
    setRatesUpdated({});
    setFxMigrationToastSeen(false);
    setWelcomeSeen(false);
    setLastBackupAt(null);
    setBackupReminderSnoozedUntil(null);
    setBackupReminderIntervalRaw(30);
  }, [setTxs, setCatTree, setBudgets, setAccounts, setBills, setGoals, setGoalContributions, setRules, setSelectedPeriod, setHidden, setBudgetStartDay, setInvestments, setTrades, setDismissedAlertIds, setDismissedInsightIds, setTxFilterRaw, setRates, setRatesUpdated, setFxMigrationToastSeen, setWelcomeSeen, setLastBackupAt, setBackupReminderSnoozedUntil, setBackupReminderIntervalRaw]);

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
      // CAR-182 rule-suggestion stats
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
      dismissedInsightIds,
      dismissInsight,
      restoreInsights,
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
      setRate,
      removeRate,
      resetRates,
      fxMigrationToastSeen,
      setFxMigrationToastSeen,
      accent, setAccent,
      density, setDensity,
      decimals, setDecimals,
      currency, setCurrency,
      theme, setTheme,
      welcomeSeen,
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
