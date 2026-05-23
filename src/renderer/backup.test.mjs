import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TYPE,
  buildBackup,
  validateBackup,
  parseBackup,
} from './backup.mjs';

const sampleState = {
  txs: [{ id: 't1', name: 'COFFEE', amt: -3.5, date: '2026-05-01', acct: 'chk', ccy: 'USD' }],
  accounts: [{ id: 'chk', name: 'CHECKING', openingBal: 100, ccy: 'USD' }],
  catTree: { food: { label: 'FOOD' } },
  budgets: [{ cat: 'food', limit: 200, spent: 3.5 }],
  hidden: [],
  bills: [],
  goals: [],
  goalContributions: [],
  investments: [],
  trades: [],
  rates: { USD: 1, EUR: 1.08 },
  ratesUpdated: { EUR: '2026-05-10' },
  selectedPeriod: '2026-05',
  budgetStartDay: 1,
  settings: {
    accent: '#fb6c2e',
    density: 'comfortable',
    decimals: true,
    currency: 'USD',
    theme: 'auto',
  },
};

describe('buildBackup', () => {
  it('returns object with correct envelope', () => {
    const b = buildBackup(sampleState);
    expect(b._type).toBe(BACKUP_TYPE);
    expect(b.version).toBe(BACKUP_FORMAT_VERSION);
    expect(typeof b.exportedAt).toBe('string');
    expect(b.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes all 14 data slices and the settings block', () => {
    const b = buildBackup(sampleState);
    expect(b.transactions).toEqual(sampleState.txs);
    expect(b.accounts).toEqual(sampleState.accounts);
    expect(b.categoryTree).toEqual(sampleState.catTree);
    expect(b.budgets).toEqual(sampleState.budgets);
    expect(b.hidden).toEqual([]);
    expect(b.bills).toEqual([]);
    expect(b.goals).toEqual([]);
    expect(b.goalContributions).toEqual([]);
    expect(b.investments).toEqual([]);
    expect(b.trades).toEqual([]);
    expect(b.fxRates).toEqual(sampleState.rates);
    expect(b.fxRatesUpdated).toEqual(sampleState.ratesUpdated);
    expect(b.selectedPeriod).toBe('2026-05');
    expect(b.budgetStartDay).toBe(1);
    expect(b.settings).toEqual(sampleState.settings);
  });

  it('handles missing/undefined slices by emitting empty defaults', () => {
    const b = buildBackup({});
    expect(b.transactions).toEqual([]);
    expect(b.accounts).toEqual([]);
    expect(b.categoryTree).toEqual({});
    expect(b.budgets).toEqual([]);
    expect(b.hidden).toEqual([]);
    expect(b.bills).toEqual([]);
    expect(b.goals).toEqual([]);
    expect(b.goalContributions).toEqual([]);
    expect(b.investments).toEqual([]);
    expect(b.trades).toEqual([]);
    expect(b.fxRates).toEqual({});
    expect(b.fxRatesUpdated).toEqual({});
    expect(b.settings).toEqual({});
  });

  it('accepts an explicit appVersion', () => {
    const b = buildBackup({}, '1.2.3');
    expect(b.appVersion).toBe('1.2.3');
  });
});

describe('parseBackup', () => {
  it('accepts a valid backup string', () => {
    const json = JSON.stringify(buildBackup(sampleState));
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    expect(result.data.transactions).toEqual(sampleState.txs);
    expect(result.summary.transactions).toBe(1);
    expect(result.summary.accounts).toBe(1);
    expect(result.summary.budgets).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('rejects non-JSON input', () => {
    const result = parseBackup('this is not json {');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid JSON/i);
  });

  it('rejects wrong _type', () => {
    const json = JSON.stringify({ _type: 'something-else', version: 1 });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Ledger backup/i);
  });

  it('rejects missing _type', () => {
    const json = JSON.stringify({ version: 1, transactions: [] });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Ledger backup/i);
  });

  it('rejects missing version', () => {
    const json = JSON.stringify({ _type: BACKUP_TYPE, transactions: [] });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/version/i);
  });

  it('rejects non-integer version', () => {
    const json = JSON.stringify({ _type: BACKUP_TYPE, version: '1' });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/version/i);
  });

  it('rejects future version', () => {
    const json = JSON.stringify({ _type: BACKUP_TYPE, version: BACKUP_FORMAT_VERSION + 1 });
    const result = parseBackup(json);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/newer version/i);
  });

  it('accepts an older version (will support future migrations)', () => {
    // Even at v1 today, the codepath that accepts v < CURRENT must exist.
    const json = JSON.stringify({ _type: BACKUP_TYPE, version: 1 });
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
  });

  it('handles a backup missing the settings block', () => {
    const obj = buildBackup(sampleState);
    delete obj.settings;
    const result = parseBackup(JSON.stringify(obj));
    expect(result.ok).toBe(true);
    expect(result.data.settings).toEqual({});
  });
});

describe('validateBackup', () => {
  it('skips a wrong-typed slice and emits a warning', () => {
    const obj = buildBackup(sampleState);
    obj.accounts = 'not an array';
    const result = validateBackup(obj);
    expect(result.ok).toBe(true);
    expect(result.data.accounts).toEqual([]);
    expect(result.warnings.some(w => /accounts/i.test(w))).toBe(true);
    expect(result.summary.accounts).toBe(0);
  });

  it('builds correct summary counts', () => {
    const obj = buildBackup(sampleState);
    const result = validateBackup(obj);
    expect(result.summary.transactions).toBe(1);
    expect(result.summary.accounts).toBe(1);
    expect(result.summary.budgets).toBe(1);
    expect(result.summary.bills).toBe(0);
    expect(result.summary.goals).toBe(0);
  });
});

describe('round-trip', () => {
  it('build → JSON.stringify → parseBackup → equivalent data', () => {
    const original = buildBackup(sampleState);
    const result = parseBackup(JSON.stringify(original));
    expect(result.ok).toBe(true);
    expect(result.data.transactions).toEqual(original.transactions);
    expect(result.data.accounts).toEqual(original.accounts);
    expect(result.data.settings).toEqual(original.settings);
    expect(result.data.fxRates).toEqual(original.fxRates);
  });
});

// CAR-188: the .mmbak full-restore path in ImportExport.jsx now delegates
// to parseBackup → store.restoreBackup, ensuring it stays in sync with the
// JSON BackupSection restore. These tests pin the contract that a fully-
// populated v2 backup round-trips every slice — especially the ones the
// old hand-written setter list silently dropped (rules, investments,
// trades, fxRates/fxRatesUpdated, hidden, scalars, settings).
describe('CAR-188: mmbak full-restore parity', () => {
  const fullV2State = {
    txs: [{ id: 't1', name: 'COFFEE', amt: -3.5, date: '2026-05-01', acct: 'chk', ccy: 'USD' }],
    accounts: [{ id: 'chk', name: 'CHECKING', openingBal: 100, ccy: 'USD' }],
    catTree: { food: { label: 'FOOD' } },
    budgets: [{ cat: 'food', limit: 200, spent: 3.5 }],
    hidden: ['t-hidden-1', 't-hidden-2'],
    bills: [{ id: 'b1', merchant: 'NETFLIX', amt: -15, schedule: 'monthly' }],
    goals: [{ id: 'g1', name: 'EMERGENCY FUND', target: 10000 }],
    goalContributions: [{ goalId: 'g1', amt: 500, date: '2026-04-01' }],
    rules: [{
      id: 'r1', enabled: true,
      match: { merchantPattern: 'STARBUCKS' },
      set: { path: ['food', 'cafe'] },
    }],
    investments: [{ id: 'i1', symbol: 'AAPL', name: 'Apple Inc.' }],
    trades: [{ id: 'tr1', symbol: 'AAPL', qty: 5, price: 180, date: '2026-04-15' }],
    rates: { USD: 1, EUR: 1.08, MXN: 17.5 },
    ratesUpdated: { EUR: '2026-05-10', MXN: '2026-05-10' },
    selectedPeriod: '2026-05',
    budgetStartDay: 5,
    settings: {
      accent: '#fb6c2e',
      density: 'compact',
      decimals: false,
      currency: 'MXN',
      theme: 'dark',
    },
  };

  it('parseBackup restores every v2 slice from a fully-populated mmbak JSON', () => {
    const json = JSON.stringify(buildBackup(fullV2State));
    const result = parseBackup(json);
    expect(result.ok).toBe(true);

    // Slices the OLD hand-written mmbak path correctly restored:
    expect(result.data.transactions).toEqual(fullV2State.txs);
    expect(result.data.accounts).toEqual(fullV2State.accounts);
    expect(result.data.categoryTree).toEqual(fullV2State.catTree);
    expect(result.data.budgets).toEqual(fullV2State.budgets);
    expect(result.data.bills).toEqual(fullV2State.bills);
    expect(result.data.goals).toEqual(fullV2State.goals);
    expect(result.data.goalContributions).toEqual(fullV2State.goalContributions);

    // Slices the OLD hand-written mmbak path SILENTLY DROPPED — the bug:
    expect(result.data.rules).toEqual(fullV2State.rules);
    expect(result.data.investments).toEqual(fullV2State.investments);
    expect(result.data.trades).toEqual(fullV2State.trades);
    expect(result.data.fxRates).toEqual(fullV2State.rates);
    expect(result.data.fxRatesUpdated).toEqual(fullV2State.ratesUpdated);
    expect(result.data.hidden).toEqual(fullV2State.hidden);
    expect(result.data.selectedPeriod).toBe(fullV2State.selectedPeriod);
    expect(result.data.budgetStartDay).toBe(fullV2State.budgetStartDay);
    expect(result.data.settings).toEqual(fullV2State.settings);
  });

  it('summary counts match for every list-shaped slice', () => {
    const json = JSON.stringify(buildBackup(fullV2State));
    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    expect(result.summary.transactions).toBe(1);
    expect(result.summary.accounts).toBe(1);
    expect(result.summary.budgets).toBe(1);
    expect(result.summary.bills).toBe(1);
    expect(result.summary.goals).toBe(1);
    expect(result.summary.goalContributions).toBe(1);
    expect(result.summary.rules).toBe(1);
    expect(result.summary.investments).toBe(1);
    expect(result.summary.trades).toBe(1);
    expect(result.summary.hidden).toBe(2);
  });
});
