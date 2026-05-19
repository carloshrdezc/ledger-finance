import { describe, it, expect } from 'vitest';
import { isAppEmptyFor, isDefaultCatTreeFor } from './sampleData.mjs';
import { DEFAULT_CAT_TREE, CATEGORY_TREE } from './data.js';

describe('isAppEmptyFor', () => {
  const empty = {
    txs: [],
    accounts: [],
    bills: [],
    goals: [],
    budgets: [],
    investments: [],
    trades: [],
  };

  it('returns true when every major slice is empty', () => {
    expect(isAppEmptyFor(empty)).toBe(true);
  });

  it('returns false when accounts has any entry', () => {
    expect(isAppEmptyFor({ ...empty, accounts: [{ id: 'chk' }] })).toBe(false);
  });

  it('returns false when transactions has any entry', () => {
    expect(isAppEmptyFor({ ...empty, txs: [{ id: 't1', amt: 0 }] })).toBe(false);
  });

  it('returns false for any single non-empty slice', () => {
    expect(isAppEmptyFor({ ...empty, bills: [{ id: 'b1' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, goals: [{ id: 'g1' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, budgets: [{ cat: 'food' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, investments: [{ ticker: 'VTI' }] })).toBe(false);
    expect(isAppEmptyFor({ ...empty, trades: [{ id: 'tr1' }] })).toBe(false);
  });

  it('handles undefined/null slices gracefully', () => {
    expect(isAppEmptyFor({})).toBe(true);
    expect(isAppEmptyFor({ txs: null })).toBe(true);
  });
});

describe('isDefaultCatTreeFor', () => {
  it('returns true for DEFAULT_CAT_TREE', () => {
    expect(isDefaultCatTreeFor(DEFAULT_CAT_TREE)).toBe(true);
  });

  it('returns false for the full CATEGORY_TREE (has children)', () => {
    expect(isDefaultCatTreeFor(CATEGORY_TREE)).toBe(false);
  });

  it('returns false for an empty tree', () => {
    expect(isDefaultCatTreeFor({})).toBe(false);
  });

  it('returns false when the user has added a custom top-level category', () => {
    expect(isDefaultCatTreeFor({
      ...DEFAULT_CAT_TREE,
      custom: { label: 'CUSTOM' },
    })).toBe(false);
  });

  it('returns false when the user has added children to a default node', () => {
    const modified = JSON.parse(JSON.stringify(DEFAULT_CAT_TREE));
    modified.food.children = { produce: { label: 'PRODUCE' } };
    expect(isDefaultCatTreeFor(modified)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isDefaultCatTreeFor(null)).toBe(false);
    expect(isDefaultCatTreeFor(undefined)).toBe(false);
  });
});
