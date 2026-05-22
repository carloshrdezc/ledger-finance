import { test, expect } from 'vitest';
import {
  patternToRegExp,
  normalizeMerchant,
  compileRule,
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
