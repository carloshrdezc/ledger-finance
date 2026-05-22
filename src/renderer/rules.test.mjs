import { test, expect } from 'vitest';
import {
  patternToRegExp,
  normalizeMerchant,
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

test('normalizeMerchant trims and uppercases', () => {
  expect(normalizeMerchant('  starbucks  ')).toBe('STARBUCKS');
  expect(normalizeMerchant('Whole Foods')).toBe('WHOLE FOODS');
  expect(normalizeMerchant('')).toBe('');
});
