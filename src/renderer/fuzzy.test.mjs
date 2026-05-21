import { describe, it, expect } from 'vitest';
import { score, matchAndRank } from './fuzzy.mjs';

describe('score', () => {
  it('returns a positive value for an empty query', () => {
    expect(score('', 'foo')).toBeGreaterThan(0);
  });

  it('ranks a prefix match higher than an embedded match', () => {
    expect(score('go', 'Go to Transactions')).toBeGreaterThan(score('go', 'Investments'));
  });

  it('matches a contiguous substring', () => {
    expect(score('trans', 'Go to Transactions')).toBeGreaterThan(0);
  });

  it('returns 0 when chars are missing', () => {
    expect(score('zzzz', 'Go to Transactions')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(score('GT', 'go to transactions')).toBeGreaterThan(0);
  });

  it('matches non-contiguous chars in order', () => {
    expect(score('rasn', 'Go to Transactions')).toBeGreaterThan(0);
  });

  it('returns 0 when chars are out of order', () => {
    expect(score('srt', 'Go to Transactions')).toBe(0);
  });
});

describe('matchAndRank', () => {
  it('filters non-matches and sorts by score descending', () => {
    const items = [
      { label: 'Go to Investments' },
      { label: 'Go to Transactions' },
      { label: 'Backup now' },
      { label: 'Go to Goals' },
    ];
    const result = matchAndRank('go', items, x => x.label);
    expect(result).not.toContainEqual({ label: 'Backup now' });
    expect(result.length).toBe(3);
    const scores = result.map(x => score('go', x.label));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
