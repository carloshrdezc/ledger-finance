import { test, expect } from 'vitest';
import {
  deleteTxsFromArray,
  hideIdsToArray,
  updateTxsInArray,
  convertToTransferInArray,
  detectTransferPair,
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

test('convertToTransferInArray removes the two source rows', () => {
  const prev = [
    { id: 'a', amt: -100, acct: 'chk', ccy: 'USD' },
    { id: 'b', amt: 100, acct: 'sav', ccy: 'USD' },
    { id: 'other', amt: -50, acct: 'chk', ccy: 'USD' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 100, amtTo: 100, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
  }, 'xfer_test_1');
  expect(next.find(t => t.id === 'a')).toBeUndefined();
  expect(next.find(t => t.id === 'b')).toBeUndefined();
  expect(next.find(t => t.id === 'other')).toBeDefined();
});

test('convertToTransferInArray adds two legs with correct shape', () => {
  const prev = [
    { id: 'a', amt: -100, acct: 'chk', ccy: 'USD' },
    { id: 'b', amt: 100, acct: 'sav', ccy: 'USD' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 100, amtTo: 100, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
    note: 'RENT TRANSFER',
  }, 'xfer_test_2');
  const transferId = 'xfer_test_2';
  const out = next.find(t => t.id === `${transferId}_out`);
  const inn = next.find(t => t.id === `${transferId}_in`);
  expect(out).toBeDefined();
  expect(inn).toBeDefined();
  expect(out.amt).toBe(-100);
  expect(out.acct).toBe('chk');
  expect(out.transferId).toBe(transferId);
  expect(out.transferPeer).toBe(`${transferId}_in`);
  expect(out.cat).toBe('transfer');
  expect(out.path).toEqual([]);
  expect(out.note).toBe('RENT TRANSFER');
  expect(inn.amt).toBe(100);
  expect(inn.acct).toBe('sav');
  expect(inn.transferId).toBe(transferId);
  expect(inn.transferPeer).toBe(`${transferId}_out`);
});

test('convertToTransferInArray omits note field when not provided', () => {
  const prev = [
    { id: 'a', amt: -50, acct: 'chk' },
    { id: 'b', amt: 50, acct: 'sav' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 50, amtTo: 50, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
  }, 'xfer_test_3');
  const out = next.find(t => t.id === 'xfer_test_3_out');
  expect(out).toBeDefined();
  expect('note' in out).toBe(false);
});

test('convertToTransferInArray preserves untouched txs', () => {
  const prev = [
    { id: 'a', amt: -10, acct: 'chk' },
    { id: 'b', amt: 10, acct: 'sav' },
    { id: 'x', amt: -5, acct: 'chk' },
    { id: 'y', amt: -7, acct: 'chk' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    amtFrom: 10, amtTo: 10, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
  }, 'xfer_test_4');
  expect(next.find(t => t.id === 'x')).toEqual({ id: 'x', amt: -5, acct: 'chk' });
  expect(next.find(t => t.id === 'y')).toEqual({ id: 'y', amt: -7, acct: 'chk' });
});

test('detectTransferPair returns null when size != 2', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'sav' },
    { id: 'c', amt: -50, acct: 'chk' },
  ];
  expect(detectTransferPair(visible, new Set(['a']))).toBeNull();
  expect(detectTransferPair(visible, new Set(['a', 'b', 'c']))).toBeNull();
});

test('detectTransferPair returns null when amounts differ', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 90, acct: 'sav' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns null when same sign', () => {
  const visible = [
    { id: 'a', amt: 100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'sav' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns null when same account', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'chk' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns null when either is already a transfer', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk', transferId: 'xfer_old' },
    { id: 'b', amt: 100, acct: 'sav' },
  ];
  expect(detectTransferPair(visible, new Set(['a', 'b']))).toBeNull();
});

test('detectTransferPair returns ordered pair when valid', () => {
  const visible = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'sav' },
  ];
  const result = detectTransferPair(visible, new Set(['a', 'b']));
  expect(result).not.toBeNull();
  expect(result.out).toEqual({ id: 'a', amt: -100, acct: 'chk' });
  expect(result.inn).toEqual({ id: 'b', amt: 100, acct: 'sav' });
});

test('detectTransferPair returns ordered pair regardless of input order', () => {
  // Positive row first in visible, but `out` should still be the negative one.
  const visible = [
    { id: 'b', amt: 100, acct: 'sav' },
    { id: 'a', amt: -100, acct: 'chk' },
  ];
  const result = detectTransferPair(visible, new Set(['a', 'b']));
  expect(result).not.toBeNull();
  expect(result.out.id).toBe('a');
  expect(result.inn.id).toBe('b');
});

test('convertToTransferInArray uses fromAcctName/toAcctName for display when provided', () => {
  const prev = [
    { id: 'a', amt: -100, acct: 'chk' },
    { id: 'b', amt: 100, acct: 'sav' },
  ];
  const next = convertToTransferInArray(prev, 'a', 'b', {
    fromAcct: 'chk', toAcct: 'sav',
    fromAcctName: 'Checking', toAcctName: 'Savings',
    amtFrom: 100, amtTo: 100, date: '2026-05-15',
    fromCcy: 'USD', toCcy: 'USD',
  }, 'xfer_test_named');
  const out = next.find(t => t.id === 'xfer_test_named_out');
  const inn = next.find(t => t.id === 'xfer_test_named_in');
  expect(out.name).toBe('TRANSFER → Savings');
  expect(inn.name).toBe('TRANSFER ← Checking');
  // acct fields keep the ids
  expect(out.acct).toBe('chk');
  expect(inn.acct).toBe('sav');
});
