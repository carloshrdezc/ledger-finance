import { describe, test, expect } from 'vitest';
import {
  extractRecategorizationEvents,
  applyRecategorizeEvent,
  applyDismiss,
  applyEvict,
  findEvictionForNewRule,
  merchantStem,
  statKey,
  SUGGEST_THRESHOLD,
  DISMISS_LIMIT,
} from './recategorizeStats.mjs';

describe('extractRecategorizationEvents', () => {
  test('skips first-categorization (tx had no prior cat/path)', () => {
    const before = [{ id: 't1', cat: null, path: null }];
    const idToTx = new Map([['t1', { id: 't1', name: 'Starbucks' }]]);
    const events = extractRecategorizationEvents(before, idToTx, { cat: 'food', path: ['food', 'coffee'] });
    expect(events).toEqual([]);
  });

  test('skips no-op (same path)', () => {
    const before = [{ id: 't1', cat: 'food', path: ['food', 'coffee'] }];
    const idToTx = new Map([['t1', { id: 't1', name: 'Starbucks' }]]);
    const events = extractRecategorizationEvents(before, idToTx, { path: ['food', 'coffee'] });
    expect(events).toEqual([]);
  });

  test('emits event when path changes (had prior cat)', () => {
    const before = [{ id: 't1', cat: 'food', path: ['food'] }];
    const idToTx = new Map([['t1', { id: 't1', name: 'Starbucks #4521' }]]);
    const events = extractRecategorizationEvents(before, idToTx, { path: ['food', 'coffee'] });
    expect(events).toHaveLength(1);
    expect(events[0].txId).toBe('t1');
    expect(events[0].newPath).toEqual(['food', 'coffee']);
    expect(events[0].merchantKey).toBe('STARBUCKS');
  });

  test('uses cat as single-element path when path absent', () => {
    const before = [{ id: 't1', cat: 'food', path: null }];
    const idToTx = new Map([['t1', { id: 't1', name: 'Starbucks' }]]);
    const events = extractRecategorizationEvents(before, idToTx, { cat: 'coffee' });
    expect(events).toHaveLength(1);
    expect(events[0].newPath).toEqual(['coffee']);
  });

  test('handles per-tx patches array shape', () => {
    const before = [
      { id: 't1', cat: 'food', path: ['food'] },
      { id: 't2', cat: 'food', path: ['food'] },
    ];
    const idToTx = new Map([
      ['t1', { id: 't1', name: 'Starbucks' }],
      ['t2', { id: 't2', name: 'Costco' }],
    ]);
    const patches = [
      { id: 't1', patch: { path: ['food', 'coffee'] } },
      { id: 't2', patch: { path: ['groceries'] } },
    ];
    const events = extractRecategorizationEvents(before, idToTx, patches);
    expect(events).toHaveLength(2);
    expect(events.find(e => e.txId === 't1').newPath).toEqual(['food', 'coffee']);
    expect(events.find(e => e.txId === 't2').newPath).toEqual(['groceries']);
  });

  test('skips tx without a name (no merchant key derivable)', () => {
    const before = [{ id: 't1', cat: 'food', path: ['food'] }];
    const idToTx = new Map([['t1', { id: 't1', name: '' }]]);
    const events = extractRecategorizationEvents(before, idToTx, { path: ['food', 'coffee'] });
    expect(events).toEqual([]);
  });
});

describe('applyRecategorizeEvent', () => {
  test('does not fire below threshold', () => {
    let stats = {};
    const r1 = applyRecategorizeEvent(stats, 'STARBUCKS', ['food', 'coffee'], 't1');
    expect(r1.fired).toBe(null);
    expect(r1.next.SUGG_OK).toBe(undefined);
    const k = statKey('STARBUCKS', ['food', 'coffee']);
    expect(r1.next[k].count).toBe(1);
    expect(r1.next[k].lastTxIds).toEqual(['t1']);

    const r2 = applyRecategorizeEvent(r1.next, 'STARBUCKS', ['food', 'coffee'], 't2');
    expect(r2.fired).toBe(null);
    expect(r2.next[k].count).toBe(2);
  });

  test('fires exactly at threshold (3rd distinct tx)', () => {
    let stats = {};
    stats = applyRecategorizeEvent(stats, 'STARBUCKS', ['food', 'coffee'], 't1').next;
    stats = applyRecategorizeEvent(stats, 'STARBUCKS', ['food', 'coffee'], 't2').next;
    const r3 = applyRecategorizeEvent(stats, 'STARBUCKS', ['food', 'coffee'], 't3');
    expect(r3.fired).toEqual({ merchantKey: 'STARBUCKS', targetPath: ['food', 'coffee'] });
    const k = statKey('STARBUCKS', ['food', 'coffee']);
    expect(r3.next[k].count).toBe(SUGGEST_THRESHOLD);
  });

  test('does not re-fire after threshold (4th tx)', () => {
    let stats = {};
    stats = applyRecategorizeEvent(stats, 'X', ['a'], 't1').next;
    stats = applyRecategorizeEvent(stats, 'X', ['a'], 't2').next;
    stats = applyRecategorizeEvent(stats, 'X', ['a'], 't3').next;
    const r4 = applyRecategorizeEvent(stats, 'X', ['a'], 't4');
    expect(r4.fired).toBe(null);
  });

  test('deduplicates same tx id', () => {
    let stats = applyRecategorizeEvent({}, 'X', ['a'], 't1').next;
    const r = applyRecategorizeEvent(stats, 'X', ['a'], 't1');
    expect(r.next).toBe(stats);
    expect(r.fired).toBe(null);
  });

  test('different target paths track independently', () => {
    let stats = {};
    stats = applyRecategorizeEvent(stats, 'X', ['a'], 't1').next;
    stats = applyRecategorizeEvent(stats, 'X', ['b'], 't2').next;
    const k1 = statKey('X', ['a']);
    const k2 = statKey('X', ['b']);
    expect(stats[k1].count).toBe(1);
    expect(stats[k2].count).toBe(1);
  });

  test('respects DISMISS_LIMIT silence', () => {
    let stats = {};
    const k = statKey('X', ['a']);
    stats = { [k]: { count: 0, lastAt: null, lastTxIds: [], dismissed: DISMISS_LIMIT } };
    const r = applyRecategorizeEvent(stats, 'X', ['a'], 't1');
    expect(r.next).toBe(stats);
    expect(r.fired).toBe(null);
  });

  test('rejects empty/invalid input', () => {
    expect(applyRecategorizeEvent({}, '', ['a'], 't1').fired).toBe(null);
    expect(applyRecategorizeEvent({}, 'X', [], 't1').fired).toBe(null);
    expect(applyRecategorizeEvent({}, 'X', ['a'], '').fired).toBe(null);
  });
});

describe('applyDismiss', () => {
  test('increments dismissed for every (merchant_key, *) entry', () => {
    let stats = {};
    stats = applyRecategorizeEvent(stats, 'X', ['a'], 't1').next;
    stats = applyRecategorizeEvent(stats, 'X', ['b'], 't2').next;
    stats = applyRecategorizeEvent(stats, 'Y', ['a'], 't3').next;
    const next = applyDismiss(stats, 'X');
    expect(next[statKey('X', ['a'])].dismissed).toBe(1);
    expect(next[statKey('X', ['b'])].dismissed).toBe(1);
    expect(next[statKey('Y', ['a'])].dismissed || 0).toBe(0);
  });

  test('returns same ref when no matching entries', () => {
    const stats = applyRecategorizeEvent({}, 'X', ['a'], 't1').next;
    const next = applyDismiss(stats, 'NOPE');
    expect(next).toBe(stats);
  });

  test('does nothing on empty merchantKey', () => {
    const stats = { foo: { dismissed: 0 } };
    expect(applyDismiss(stats, '')).toBe(stats);
  });
});

describe('applyEvict', () => {
  test('drops the matching (merchant, target) entry only', () => {
    let stats = {};
    stats = applyRecategorizeEvent(stats, 'X', ['a'], 't1').next;
    stats = applyRecategorizeEvent(stats, 'X', ['b'], 't2').next;
    const next = applyEvict(stats, 'X', ['a']);
    expect(next[statKey('X', ['a'])]).toBe(undefined);
    expect(next[statKey('X', ['b'])]).toBeDefined();
  });

  test('returns same ref when key absent', () => {
    const stats = applyRecategorizeEvent({}, 'X', ['a'], 't1').next;
    const next = applyEvict(stats, 'X', ['nope']);
    expect(next).toBe(stats);
  });
});

describe('findEvictionForNewRule', () => {
  test('returns merchantKey + targetPath for a clean literal rule', () => {
    const r = findEvictionForNewRule({
      match: { merchantPattern: 'Starbucks' },
      set: { path: ['food', 'coffee'] },
    });
    expect(r).toEqual({ merchantKey: 'STARBUCKS', targetPath: ['food', 'coffee'] });
  });

  test('strips leading/trailing wildcards but rejects internal ones', () => {
    expect(findEvictionForNewRule({
      match: { merchantPattern: '*Starbucks*' },
      set: { path: ['food'] },
    })).toEqual({ merchantKey: 'STARBUCKS', targetPath: ['food'] });
    expect(findEvictionForNewRule({
      match: { merchantPattern: 'Star*bucks' },
      set: { path: ['food'] },
    })).toBe(null);
  });

  test('rejects empty / missing fields', () => {
    expect(findEvictionForNewRule(null)).toBe(null);
    expect(findEvictionForNewRule({ match: {}, set: { path: ['x'] } })).toBe(null);
    expect(findEvictionForNewRule({ match: { merchantPattern: 'x' }, set: { path: [] } })).toBe(null);
  });
});

describe('merchantStem', () => {
  test('strips trailing transaction IDs from realistic bank names', () => {
    expect(merchantStem('STARBUCKS COFFEE #1234')).toBe('STARBUCKS');
    expect(merchantStem('STARBUCKS COFFEE #5678')).toBe('STARBUCKS');
    expect(merchantStem('Starbucks #999')).toBe('STARBUCKS');
    // Realistic case: same merchant variants all collapse to the same stem.
    expect(merchantStem('STARBUCKS COFFEE #1234'))
      .toBe(merchantStem('STARBUCKS COFFEE #5678'));
  });

  test('preserves dotted domains (Amazon.com style)', () => {
    expect(merchantStem('Amazon.com')).toBe('AMAZON.COM');
    expect(merchantStem('AMAZON.COM*M91X23GH3')).toBe('AMAZON.COM');
    expect(merchantStem('AMAZON.COM*A1B2C3')).toBe('AMAZON.COM');
  });

  test('handles edge cases', () => {
    expect(merchantStem('')).toBe('');
    expect(merchantStem(null)).toBe('');
    expect(merchantStem(undefined)).toBe('');
    expect(merchantStem('   ')).toBe('');
    expect(merchantStem('#1234')).toBe('');
    expect(merchantStem('  TARGET  ')).toBe('TARGET');
  });

  test('preserves accented Latin characters', () => {
    expect(merchantStem('CAFÉ DELUXE #99')).toBe('CAFÉ');
    expect(merchantStem('Niños Market')).toBe('NIÑOS');
  });

  test('lowercase input is uppercased', () => {
    expect(merchantStem('starbucks')).toBe('STARBUCKS');
    expect(merchantStem('starbucks #777')).toBe('STARBUCKS');
  });
});

describe('integration: realistic re-categorization flow', () => {
  // The bug that motivated CAR-182 round 2: three real-world Starbucks charges
  // each have a unique transaction ID suffix. Before the fix, three different
  // merchantKeys → threshold never trips → toast never appears.
  // After the fix, all three collapse to merchantStem='STARBUCKS' → 3rd hit
  // fires the suggestion.
  test('three same-merchant-different-suffix txs trip the threshold', () => {
    const txs = [
      { id: 't1', name: 'STARBUCKS COFFEE #1234', cat: 'misc', path: ['misc'] },
      { id: 't2', name: 'STARBUCKS COFFEE #5678', cat: 'misc', path: ['misc'] },
      { id: 't3', name: 'STARBUCKS LAUNDRY #999', cat: 'misc', path: ['misc'] },
    ];
    const idToTx = new Map(txs.map(t => [t.id, t]));
    let stats = {};
    let lastFired = null;

    for (const tx of txs) {
      const before = [{ id: tx.id, cat: tx.cat, path: tx.path }];
      const events = extractRecategorizationEvents(before, idToTx, { path: ['food', 'coffee'] });
      expect(events).toHaveLength(1);
      // All three txs produce the SAME merchantKey now.
      expect(events[0].merchantKey).toBe('STARBUCKS');
      const result = applyRecategorizeEvent(stats, events[0].merchantKey, events[0].newPath, events[0].txId);
      stats = result.next;
      if (result.fired) lastFired = result.fired;
    }

    expect(lastFired).toEqual({
      merchantKey: 'STARBUCKS',
      targetPath: ['food', 'coffee'],
    });
    expect(stats[statKey('STARBUCKS', ['food', 'coffee'])].count).toBe(3);
  });

  test('rule with STEM* pattern auto-evicts the matching stat', () => {
    // Simulates: user accepts the suggestion, RuleForm saves a rule with
    // pattern "STARBUCKS*" (the new prefilled shape). store.addRule calls
    // findEvictionForNewRule which should return the matching stat key.
    const eviction = findEvictionForNewRule({
      match: { merchantPattern: 'STARBUCKS*' },
      set: { path: ['food', 'coffee'] },
    });
    expect(eviction).toEqual({
      merchantKey: 'STARBUCKS',
      targetPath: ['food', 'coffee'],
    });

    // And it actually evicts the stat keyed under 'STARBUCKS'.
    const stats = {
      [statKey('STARBUCKS', ['food', 'coffee'])]: {
        count: 3, lastAt: '2026-01-01T00:00:00Z', lastTxIds: ['t1','t2','t3'], dismissed: 0,
      },
    };
    const evicted = applyEvict(stats, eviction.merchantKey, eviction.targetPath);
    expect(evicted).toEqual({});
  });
});
