import { describe, it, expect } from 'vitest';
import { detectTransactionAnomalies, buildAnomalyRows } from './anomalies.mjs';

const TODAY = '2026-06-15';

// Helper: build a category baseline of N small priors so an outlier stands out.
function priors(cat, amount, count, startIso = '2026-02-01') {
  const start = new Date(`${startIso}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    id: `${cat}-prior-${i}`,
    name: `${cat.toUpperCase()} STORE`,
    amt: -amount,
    date: new Date(start.getTime() + i * 7 * 86400000).toISOString().slice(0, 10),
    cat,
    path: [cat],
  }));
}

describe('detectTransactionAnomalies', () => {
  it('returns nothing for no transactions', () => {
    expect(detectTransactionAnomalies([], TODAY)).toEqual([]);
  });

  it('flags an amount outlier far above the category median', () => {
    const txs = [
      ...priors('food', 20, 6),                                              // median ~20
      { id: 'big', name: 'FANCY DINNER', amt: -160, date: '2026-06-10', cat: 'food', path: ['food'] },
    ];
    const rows = detectTransactionAnomalies(txs, TODAY);
    const flag = rows.find(r => r.txId === 'big');
    expect(flag).toBeTruthy();
    expect(flag.reason).toBe('amount-outlier');
    expect(flag.severity).toBe('high');         // 160/20 = 8× >= 5
    expect(flag.metric).toBe(160);
    expect(flag.detail).toMatch(/TYPICAL FOOD CHARGE/);
  });

  it('does not flag an outlier without enough baseline history', () => {
    const txs = [
      ...priors('food', 20, 2),                                              // only 2 priors < MIN_BASELINE_COUNT
      { id: 'big', name: 'DINNER', amt: -160, date: '2026-06-10', cat: 'food', path: ['food'] },
    ];
    expect(detectTransactionAnomalies(txs, TODAY).some(r => r.txId === 'big')).toBe(false);
  });

  it('flags a possible duplicate charge (same merchant + amount within days)', () => {
    const txs = [
      { id: 'a', name: 'ACME · STORE', amt: -75, date: '2026-06-10', cat: 'shopping', path: ['shopping'] },
      { id: 'b', name: 'ACME · STORE', amt: -75, date: '2026-06-11', cat: 'shopping', path: ['shopping'] },
    ];
    const rows = detectTransactionAnomalies(txs, TODAY);
    const dup = rows.find(r => r.reason === 'possible-duplicate');
    expect(dup).toBeTruthy();
    expect(dup.severity).toBe('high');
    expect(dup.detail).toMatch(/DUPLICATE/);
  });

  it('flags a large first charge from a new merchant', () => {
    const txs = [
      ...priors('food', 20, 6),
      { id: 'new', name: 'NEW GADGETS INC', amt: -350, date: '2026-06-12', cat: 'shopping', path: ['shopping'] },
    ];
    const rows = detectTransactionAnomalies(txs, TODAY);
    const flag = rows.find(r => r.txId === 'new');
    expect(flag).toBeTruthy();
    expect(flag.reason).toBe('large-new-merchant');
    expect(flag.metric).toBe(350);
  });

  it('does not flag a known merchant as new', () => {
    const txs = [
      { id: 'old', name: 'NETFLIX', amt: -250, date: '2026-03-01', cat: 'subs', path: ['subs'] },
      { id: 'recent', name: 'NETFLIX', amt: -250, date: '2026-06-01', cat: 'subs', path: ['subs'] },
    ];
    expect(detectTransactionAnomalies(txs, TODAY).some(r => r.reason === 'large-new-merchant')).toBe(false);
  });

  it('ignores income and transfers', () => {
    const txs = [
      { id: 'inc', name: 'SALARY', amt: 5000, date: '2026-06-10', cat: 'income', path: ['income'] },
      { id: 'xfer', name: 'TO SAVINGS', amt: -3000, date: '2026-06-10', cat: 'transfer', path: [] },
    ];
    expect(detectTransactionAnomalies(txs, TODAY)).toEqual([]);
  });

  it('does not flag transactions older than the recent window', () => {
    const txs = [
      ...priors('food', 20, 6),
      { id: 'oldbig', name: 'DINNER', amt: -200, date: '2026-04-01', cat: 'food', path: ['food'] }, // >30d ago
    ];
    expect(detectTransactionAnomalies(txs, TODAY).some(r => r.txId === 'oldbig')).toBe(false);
  });

  it('emits at most one flag per transaction (highest-severity reason wins)', () => {
    // A large new-merchant charge that is ALSO a duplicate should appear once,
    // tagged as the higher-severity duplicate.
    const txs = [
      { id: 'd1', name: 'BIGCO · X', amt: -300, date: '2026-06-10', cat: 'shopping', path: ['shopping'] },
      { id: 'd2', name: 'BIGCO · X', amt: -300, date: '2026-06-11', cat: 'shopping', path: ['shopping'] },
    ];
    const rows = detectTransactionAnomalies(txs, TODAY);
    const perTx = rows.filter(r => r.txId === 'd2');
    expect(perTx).toHaveLength(1);
    expect(perTx[0].reason).toBe('possible-duplicate');
  });

  it('sorts by severity then recency', () => {
    const txs = [
      ...priors('food', 20, 6),
      { id: 'med', name: 'NEW STORE', amt: -250, date: '2026-06-05', cat: 'shopping', path: ['shopping'] }, // medium
      { id: 'a', name: 'DUPME · A', amt: -90, date: '2026-06-12', cat: 'shopping', path: ['shopping'] },
      { id: 'b', name: 'DUPME · A', amt: -90, date: '2026-06-13', cat: 'shopping', path: ['shopping'] },   // high (dup)
    ];
    const rows = detectTransactionAnomalies(txs, TODAY);
    expect(rows[0].severity).toBe('high'); // duplicate ranks above the medium new-merchant
  });
});

describe('buildAnomalyRows', () => {
  it('drops dismissed ids', () => {
    const txs = [
      { id: 'a', name: 'ACME · STORE', amt: -75, date: '2026-06-10', cat: 'shopping', path: ['shopping'] },
      { id: 'b', name: 'ACME · STORE', amt: -75, date: '2026-06-11', cat: 'shopping', path: ['shopping'] },
    ];
    const all = buildAnomalyRows({ transactions: txs }, TODAY);
    expect(all.length).toBeGreaterThan(0);
    const dismissedId = all[0].id;
    const after = buildAnomalyRows({ transactions: txs, dismissedAnomalyIds: [dismissedId] }, TODAY);
    expect(after.some(r => r.id === dismissedId)).toBe(false);
  });
});
