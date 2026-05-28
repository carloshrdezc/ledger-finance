import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT_VERSION, buildBackup, parseBackup } from './backup.mjs';

describe('backup saved views', () => {
  it('includes saved views in the backup payload and parses them back', () => {
    const payload = buildBackup({
      txs: [],
      accounts: [],
      catTree: {},
      budgets: [],
      hidden: [],
      bills: [],
      goals: [],
      goalContributions: [],
      rules: [],
      savedViews: [{
        id: 'sv-1',
        scope: 'tx',
        name: 'Coffee run',
        period: '2026-05',
        search: 'coffee',
        txFilter: { category: 'food', type: 'expense' },
      }],
      investments: [],
      trades: [],
      rates: {},
      ratesUpdated: {},
      selectedPeriod: '2026-05',
      budgetStartDay: 1,
      settings: {},
    });

    expect(payload.version).toBe(BACKUP_FORMAT_VERSION);
    expect(payload.savedViews).toHaveLength(1);
    expect(payload.savedViews[0]).toMatchObject({ name: 'Coffee run', scope: 'tx' });

    const parsed = parseBackup(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.savedViews).toEqual(payload.savedViews);
    expect(parsed.summary.savedViews).toBe(1);
  });
});
