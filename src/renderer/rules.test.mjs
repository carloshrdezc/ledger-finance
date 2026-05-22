import { test, expect } from 'vitest';
import {
  patternToRegExp,
  normalizeMerchant,
  compileRule,
  applyRules,
  applyRulesToBatch,
  previewRulesAgainst,
} from './rules.mjs';

test('patternToRegExp plain string matches as substring (case-insensitive)', () => {
  const re = patternToRegExp('STARBUCKS');
  expect(re.test('SQ *STARBUCKS')).toBe(true);
  expect(re.test('starbucks downtown')).toBe(true);
  expect(re.test('PEETS')).toBe(false);
});

test('patternToRegExp trailing * = starts-with', () => {
  const re = patternToRegExp('STARBUCKS*');
  expect(re.test('STARBUCKS #4521')).toBe(true);
  expect(re.test('SQ *STARBUCKS')).toBe(false);
});

test('patternToRegExp leading * = ends-with', () => {
  const re = patternToRegExp('*COFFEE');
  expect(re.test('BLUE BOTTLE COFFEE')).toBe(true);
  expect(re.test('COFFEE BEAN CO')).toBe(false);
});

test('patternToRegExp escapes regex metachars (literal . dot)', () => {
  const re = patternToRegExp('AT.T');
  expect(re.test('AT.T')).toBe(true);
  expect(re.test('ATXT')).toBe(false);
});

test('patternToRegExp leading + trailing * = plain substring (no anchors)', () => {
  const re = patternToRegExp('*STAR*');
  // Should match anywhere — like the unanchored 'STAR' case.
  expect(re.test('SQ STARBUCKS')).toBe(true);
  expect(re.test('STAR')).toBe(true);
  expect(re.test('PRESTAR FOO')).toBe(true);
  expect(re.test('PEETS')).toBe(false);
});

test('normalizeMerchant trims and uppercases; null/undefined safe', () => {
  expect(normalizeMerchant('  starbucks  ')).toBe('STARBUCKS');
  expect(normalizeMerchant('Whole Foods')).toBe('WHOLE FOODS');
  expect(normalizeMerchant('')).toBe('');
  expect(normalizeMerchant(null)).toBe('');
  expect(normalizeMerchant(undefined)).toBe('');
});

test('compileRule returns null for disabled rule', () => {
  const matcher = compileRule({
    enabled: false,
    match: { merchantPattern: 'STARBUCKS' },
    set: { path: ['dining'] },
  });
  expect(matcher).toBeNull();
});

test('compileRule returns null when merchantPattern is empty or whitespace', () => {
  expect(compileRule({
    enabled: true,
    match: { merchantPattern: '' },
    set: { path: ['dining'] },
  })).toBeNull();
  expect(compileRule({
    enabled: true,
    match: { merchantPattern: '   ' },
    set: { path: ['dining'] },
  })).toBeNull();
});

test('compileRule matches all conditions (merchant + amount range + account)', () => {
  const matcher = compileRule({
    enabled: true,
    match: {
      merchantPattern: 'RENT',
      amountRange: { min: 1000, max: 2000 },
      accountId: 'chk',
    },
    set: { path: ['housing', 'rent'] },
  });
  expect(matcher({ name: 'RENT', amt: -1500, acct: 'chk' })).toBe(true);
});

test('compileRule AND semantics: any failing condition rejects', () => {
  const matcher = compileRule({
    enabled: true,
    match: {
      merchantPattern: 'RENT',
      amountRange: { min: 1000 },
      accountId: 'chk',
    },
    set: { path: ['housing', 'rent'] },
  });
  // Wrong merchant
  expect(matcher({ name: 'GROCERIES', amt: -1500, acct: 'chk' })).toBe(false);
  // Below amount range
  expect(matcher({ name: 'RENT', amt: -500, acct: 'chk' })).toBe(false);
  // Wrong account
  expect(matcher({ name: 'RENT', amt: -1500, acct: 'sav' })).toBe(false);
});

test('applyRules returns input identity when no rules', () => {
  const tx = { id: 't1', name: 'STARBUCKS', amt: -5, cat: 'other', path: ['other'] };
  expect(applyRules(tx, [])).toBe(tx);
  expect(applyRules(tx, null)).toBe(tx);
});

test('applyRules returns input identity when no rule matches', () => {
  const tx = { id: 't1', name: 'STARBUCKS', amt: -5, cat: 'other', path: ['other'] };
  const rules = [{
    id: 'r1', enabled: true,
    match: { merchantPattern: 'AMAZON' },
    set: { path: ['shopping'] },
  }];
  expect(applyRules(tx, rules)).toBe(tx);
});

test('applyRules first matching rule wins (priority via array order)', () => {
  const tx = { id: 't1', name: 'STARBUCKS', amt: -5, cat: 'other', path: ['other'] };
  const rules = [
    { id: 'r1', enabled: true, match: { merchantPattern: 'STARBUCKS' }, set: { path: ['dining', 'cafe'] } },
    { id: 'r2', enabled: true, match: { merchantPattern: 'STAR' },      set: { path: ['shopping'] } },
  ];
  const after = applyRules(tx, rules);
  expect(after).not.toBe(tx);
  expect(after.cat).toBe('dining');
  expect(after.path).toEqual(['dining', 'cafe']);
});

test('applyRules returns shallow-merged tx on match', () => {
  const tx = { id: 't1', name: 'STARBUCKS', amt: -5, date: '2026-05-15', cat: 'other', path: ['other'] };
  const rules = [{ id: 'r1', enabled: true, match: { merchantPattern: 'STARBUCKS' }, set: { path: ['dining'] } }];
  const after = applyRules(tx, rules);
  expect(after.id).toBe('t1');
  expect(after.amt).toBe(-5);
  expect(after.date).toBe('2026-05-15');
  expect(after.cat).toBe('dining');
  expect(after.path).toEqual(['dining']);
});

test('applyRules skips disabled rules even when they would match', () => {
  const tx = { id: 't1', name: 'STARBUCKS', amt: -5, cat: 'other' };
  const rules = [
    { id: 'r1', enabled: false, match: { merchantPattern: 'STARBUCKS' }, set: { path: ['dining', 'cafe'] } },
    { id: 'r2', enabled: true,  match: { merchantPattern: 'STARBUCKS' }, set: { path: ['shopping'] } },
  ];
  const after = applyRules(tx, rules);
  expect(after.cat).toBe('shopping');
});

test('applyRulesToBatch returns input identity when no rules', () => {
  const txs = [{ id: 't1', name: 'STARBUCKS', amt: -5 }];
  expect(applyRulesToBatch(txs, [])).toBe(txs);
  expect(applyRulesToBatch(txs, null)).toBe(txs);
});

test('applyRulesToBatch returns input identity when no tx matches any rule', () => {
  const txs = [
    { id: 't1', name: 'AMAZON', amt: -5 },
    { id: 't2', name: 'WALMART', amt: -10 },
  ];
  const rules = [{ id: 'r1', enabled: true, match: { merchantPattern: 'STARBUCKS' }, set: { path: ['dining'] } }];
  expect(applyRulesToBatch(txs, rules)).toBe(txs);
});

test('applyRulesToBatch maps each tx through applyRules', () => {
  const txs = [
    { id: 't1', name: 'STARBUCKS', amt: -5, cat: 'other' },
    { id: 't2', name: 'WALMART',   amt: -10, cat: 'other' },
    { id: 't3', name: 'starbucks downtown', amt: -7, cat: 'other' },
  ];
  const rules = [{ id: 'r1', enabled: true, match: { merchantPattern: 'STARBUCKS' }, set: { path: ['dining', 'cafe'] } }];
  const after = applyRulesToBatch(txs, rules);
  expect(after).not.toBe(txs);
  expect(after[0].cat).toBe('dining');
  expect(after[1].cat).toBe('other');
  expect(after[2].cat).toBe('dining');
});

test('previewRulesAgainst returns empty array when no changes', () => {
  const txs = [{ id: 't1', name: 'STARBUCKS', amt: -5, cat: 'dining', path: ['dining'] }];
  const rules = [{ id: 'r1', enabled: true, match: { merchantPattern: 'STARBUCKS' }, set: { path: ['dining'] } }];
  // Tx already has cat='dining' and path=['dining']; no diff.
  expect(previewRulesAgainst(txs, rules)).toEqual([]);
});

test('previewRulesAgainst returns one entry per changed tx', () => {
  const txs = [
    { id: 't1', name: 'STARBUCKS', amt: -5, cat: 'other', path: ['other'] },
    { id: 't2', name: 'WALMART',   amt: -10, cat: 'shopping', path: ['shopping'] },
    { id: 't3', name: 'AMAZON',    amt: -20, cat: 'other', path: ['other'] },
  ];
  const rules = [
    { id: 'r1', enabled: true, match: { merchantPattern: 'STARBUCKS' }, set: { path: ['dining', 'cafe'] } },
    { id: 'r2', enabled: true, match: { merchantPattern: 'AMAZON' },    set: { path: ['shopping'] } },
  ];
  const changes = previewRulesAgainst(txs, rules);
  expect(changes).toHaveLength(2);
  // STARBUCKS: cat changes from 'other' to 'dining', path differs
  expect(changes[0]).toEqual({
    txId: 't1',
    before: { cat: 'other', path: ['other'] },
    after:  { cat: 'dining', path: ['dining', 'cafe'] },
  });
  // AMAZON: cat changes from 'other' to 'shopping'
  expect(changes[1].txId).toBe('t3');
  expect(changes[1].before).toEqual({ cat: 'other', path: ['other'] });
  expect(changes[1].after).toEqual({ cat: 'shopping', path: ['shopping'] });
  // WALMART (t2) is unchanged because no rule matches WALMART.
});
