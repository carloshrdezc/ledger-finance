import { describe, it, expect } from 'vitest';
import {
  queryTransactions,
  queryAccountBalances,
  querySpendingByCategory,
  queryBudgetStatus,
  queryGoals,
  queryNetWorth,
  queryPortfolio,
  getCurrency,
  QUERY_DESCRIPTORS,
} from './queryEngine.mjs';

const STATE = {
  'ledger:currency': 'USD',
  'ledger:accounts': [
    { id: 'chk', name: 'Chase Checking', type: 'CHK', balance: 1000 },
    { id: 'sav', name: 'Ally Savings', type: 'SAV', balance: 5000 },
  ],
  'ledger:tx': [
    { id: 't1', name: 'Rent · Greenpoint', amt: -2400, date: '2026-06-01', cat: 'housing', path: ['housing'], acct: 'chk' },
    { id: 't2', name: 'Whole Foods', amt: -120, date: '2026-06-03', cat: 'food', path: ['food'], acct: 'chk' },
    { id: 't3', name: 'Salary', amt: 6840, date: '2026-06-05', cat: 'income', path: ['income'], acct: 'chk' },
    { id: 't4', name: 'Whole Foods', amt: -80, date: '2026-05-20', cat: 'food', path: ['food'], acct: 'chk' },
    { id: 't5', name: 'To Savings', amt: -500, date: '2026-06-06', cat: 'transfer', path: [], acct: 'chk' },
  ],
  'ledger:budgets': [
    { cat: 'food', limit: 150 },
    { cat: 'housing', limit: 2000 },
  ],
  'ledger:goals': [
    { id: 'g1', name: 'EMERGENCY', target: 10000, current: 7500 },
    { id: 'g2', name: 'VACATION', target: 3000, current: 3000 },
  ],
  'ledger:investments': [
    { ticker: 'VTI', name: 'VANGUARD', shares: 10, price: 300, assetClass: 'US Stocks' },
    { ticker: 'BND', name: 'BOND', shares: 20, price: 75, assetClass: 'Bonds' },
  ],
  'ledger:trades': [
    { ticker: 'VTI', type: 'buy', shares: 10, price: 250, date: '2026-01-01' },
    { ticker: 'BND', type: 'buy', shares: 20, price: 74, date: '2026-01-01' },
  ],
};

describe('getCurrency', () => {
  it('reads configured currency, defaults to USD', () => {
    expect(getCurrency(STATE)).toBe('USD');
    expect(getCurrency({})).toBe('USD');
  });
});

describe('queryTransactions', () => {
  it('returns all with count and total', () => {
    const r = queryTransactions(STATE);
    expect(r.count).toBe(5);
    expect(r.total).toBe(-2400 - 120 + 6840 - 80 - 500);
    // newest first
    expect(r.transactions[0].id).toBe('t5');
  });

  it('filters by date range', () => {
    const r = queryTransactions(STATE, { from: '2026-06-01', to: '2026-06-30' });
    expect(r.count).toBe(4); // excludes t4 (May)
  });

  it('filters by category and type', () => {
    expect(queryTransactions(STATE, { category: 'food' }).count).toBe(2);
    expect(queryTransactions(STATE, { type: 'income' }).count).toBe(1);
    expect(queryTransactions(STATE, { type: 'expense' }).count).toBe(4);
  });

  it('filters by merchant (first segment, case-insensitive)', () => {
    expect(queryTransactions(STATE, { merchant: 'whole foods' }).count).toBe(2);
  });

  it('respects limit but reports full count', () => {
    const r = queryTransactions(STATE, { limit: 2 });
    expect(r.transactions).toHaveLength(2);
    expect(r.count).toBe(5);
  });
});

describe('queryAccountBalances', () => {
  it('adds transactions to base balance per account', () => {
    const r = queryAccountBalances(STATE);
    const chk = r.accounts.find(a => a.id === 'chk');
    // 1000 + (-2400-120+6840-80-500) = 1000 + 3740 = 4740
    expect(chk.balance).toBe(4740);
    const sav = r.accounts.find(a => a.id === 'sav');
    expect(sav.balance).toBe(5000); // no txs
    expect(r.total).toBe(9740);
  });
});

describe('querySpendingByCategory', () => {
  it('groups expenses by category, excludes income + transfers', () => {
    const r = querySpendingByCategory(STATE, { from: '2026-06-01', to: '2026-06-30' });
    const food = r.categories.find(c => c.category === 'food');
    const housing = r.categories.find(c => c.category === 'housing');
    expect(food.spent).toBe(120);
    expect(housing.spent).toBe(2400);
    expect(r.categories.some(c => c.category === 'transfer')).toBe(false);
    expect(r.categories.some(c => c.category === 'income')).toBe(false);
    expect(r.total).toBe(2520);
  });
});

describe('queryBudgetStatus', () => {
  it('flags over-budget categories', () => {
    const r = queryBudgetStatus(STATE, { from: '2026-06-01', to: '2026-06-30' });
    const food = r.budgets.find(b => b.category === 'food');
    expect(food.spent).toBe(120);
    expect(food.over).toBe(false);     // 120 <= 150
    expect(food.remaining).toBe(30);
    const housing = r.budgets.find(b => b.category === 'housing');
    expect(housing.spent).toBe(2400);
    expect(housing.over).toBe(true);   // 2400 > 2000
  });
});

describe('queryGoals', () => {
  it('reports progress and completion', () => {
    const { goals } = queryGoals(STATE);
    const em = goals.find(g => g.name === 'EMERGENCY');
    expect(em.pct).toBe(75);
    expect(em.remaining).toBe(2500);
    expect(em.complete).toBe(false);
    const vac = goals.find(g => g.name === 'VACATION');
    expect(vac.complete).toBe(true);
    expect(vac.pct).toBe(100);
  });
});

describe('queryNetWorth', () => {
  it('sums account balances and investment value', () => {
    const r = queryNetWorth(STATE);
    expect(r.accountsTotal).toBe(9740);
    expect(r.investmentsValue).toBe(10 * 300 + 20 * 75); // 3000 + 1500 = 4500
    expect(r.netWorth).toBe(14240);
  });
});

describe('queryPortfolio', () => {
  it('returns holdings, allocation, and returns', () => {
    const r = queryPortfolio(STATE);
    expect(r.holdings).toHaveLength(2);
    const vti = r.holdings.find(h => h.ticker === 'VTI');
    expect(vti.unrealizedGain).toBe(500); // (300-250)*10
    expect(r.allocation[0].assetClass).toBe('US Stocks'); // 3000 > 1500
    expect(r.returns.value).toBe(4500);
    expect(r.returns.unrealizedGain).toBe(520); // VTI 500 + BND 20
  });
});

describe('QUERY_DESCRIPTORS', () => {
  it('exposes one descriptor per query with name/fn/description', () => {
    expect(QUERY_DESCRIPTORS.length).toBeGreaterThanOrEqual(7);
    for (const d of QUERY_DESCRIPTORS) {
      expect(typeof d.name).toBe('string');
      expect(typeof d.fn).toBe('function');
      expect(typeof d.description).toBe('string');
    }
  });

  it('every descriptor fn runs against the sample state without throwing', () => {
    for (const d of QUERY_DESCRIPTORS) {
      expect(() => d.fn(STATE, {})).not.toThrow();
    }
  });
});
