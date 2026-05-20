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
