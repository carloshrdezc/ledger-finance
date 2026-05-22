import { test, expect } from 'vitest';
import {
  deleteTxsFromArray,
  hideIdsToArray,
  updateTxsInArray,
} from './bulkOps.mjs';

test('deleteTxsFromArray removes only specified ids', () => {
  const prev = [
    { id: 'a', amt: 10 },
    { id: 'b', amt: 20 },
    { id: 'c', amt: 30 },
  ];
  const next = deleteTxsFromArray(prev, ['a', 'c']);
  expect(next).toEqual([{ id: 'b', amt: 20 }]);
});

test('deleteTxsFromArray returns prev unchanged when ids is empty', () => {
  const prev = [{ id: 'a' }];
  expect(deleteTxsFromArray(prev, [])).toBe(prev);
});

test('deleteTxsFromArray returns prev unchanged when no ids match', () => {
  const prev = [{ id: 'a' }, { id: 'b' }];
  const next = deleteTxsFromArray(prev, ['x', 'y']);
  expect(next).toBe(prev);
});

test('hideIdsToArray adds new ids preserving existing', () => {
  const prev = ['a', 'b'];
  const next = hideIdsToArray(prev, ['c', 'd']);
  expect(next).toEqual(['a', 'b', 'c', 'd']);
});

test('hideIdsToArray dedupes already-hidden ids', () => {
  const prev = ['a', 'b'];
  const next = hideIdsToArray(prev, ['b', 'c']);
  expect(next).toEqual(['a', 'b', 'c']);
});

test('hideIdsToArray returns prev unchanged when nothing new', () => {
  const prev = ['a', 'b'];
  expect(hideIdsToArray(prev, ['a', 'b'])).toBe(prev);
});

test('hideIdsToArray dedupes duplicates within ids itself', () => {
  const prev = ['a'];
  const next = hideIdsToArray(prev, ['b', 'b', 'c']);
  expect(next).toEqual(['a', 'b', 'c']);
});

test('updateTxsInArray patches only specified ids; other fields untouched', () => {
  const prev = [
    { id: 'a', cat: 'food', name: 'COFFEE' },
    { id: 'b', cat: 'shop', name: 'SHIRT' },
    { id: 'c', cat: 'food', name: 'LUNCH' },
  ];
  const next = updateTxsInArray(prev, ['a', 'c'], { cat: 'dining' });
  expect(next).toEqual([
    { id: 'a', cat: 'dining', name: 'COFFEE' },
    { id: 'b', cat: 'shop', name: 'SHIRT' },
    { id: 'c', cat: 'dining', name: 'LUNCH' },
  ]);
});

test('updateTxsInArray with empty ids returns prev unchanged', () => {
  const prev = [{ id: 'a', cat: 'food' }];
  expect(updateTxsInArray(prev, [], { cat: 'shop' })).toBe(prev);
});

test('updateTxsInArray with empty patch returns prev unchanged', () => {
  const prev = [{ id: 'a', cat: 'food' }];
  expect(updateTxsInArray(prev, ['a'], {})).toBe(prev);
});

test('updateTxsInArray returns prev unchanged when no ids match', () => {
  const prev = [{ id: 'a', cat: 'food' }];
  expect(updateTxsInArray(prev, ['x'], { cat: 'shop' })).toBe(prev);
});
