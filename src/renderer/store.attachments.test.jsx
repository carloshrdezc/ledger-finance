// @vitest-environment jsdom
// CAR-346: store actions for receipt/photo + note attachments on transactions.
import React from 'react';
import { render, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function clearGlobals() {
  localStorage.clear();
  delete window.ledgerDB;
  vi.resetModules();
}

afterEach(() => {
  clearGlobals();
});

async function mountStore() {
  const { StoreProvider, useStore } = await import('./store.jsx');
  let store;
  function Probe() {
    store = useStore();
    return null;
  }
  render(
    <StoreProvider>
      <Probe />
    </StoreProvider>,
  );
  return { get: () => store };
}

const SAMPLE_ATT = {
  id: 'att_1',
  dataUrl: 'data:image/jpeg;base64,AAAA',
  name: 'receipt.jpg',
  mime: 'image/jpeg',
  w: 800,
  h: 600,
  bytes: 3,
  addedAt: '2026-06-01T00:00:00.000Z',
};

describe('tx note + attachments store actions', () => {
  it('setTxNote sets, updates, and clears a note on a regular tx', async () => {
    const { get } = await mountStore();
    act(() => {
      get().setTransactions([
        { id: 't1', name: 'STORE', amt: -10, date: '2026-06-01', acct: 'chk', ccy: 'USD' },
      ]);
    });

    act(() => get().setTxNote('t1', '  paid in cash  '));
    expect(get().allTransactions[0].note).toBe('paid in cash'); // trimmed

    act(() => get().setTxNote('t1', 'updated'));
    expect(get().allTransactions[0].note).toBe('updated');

    act(() => get().setTxNote('t1', '   '));
    expect('note' in get().allTransactions[0]).toBe(false); // cleared, field dropped
  });

  it('addTxAttachment / removeTxAttachment add and remove attachments', async () => {
    const { get } = await mountStore();
    act(() => {
      get().setTransactions([
        { id: 't1', name: 'STORE', amt: -10, date: '2026-06-01', acct: 'chk', ccy: 'USD' },
      ]);
    });

    act(() => get().addTxAttachment('t1', SAMPLE_ATT));
    expect(get().allTransactions[0].attachments).toHaveLength(1);
    expect(get().allTransactions[0].attachments[0]).toEqual(SAMPLE_ATT);

    const second = { ...SAMPLE_ATT, id: 'att_2' };
    act(() => get().addTxAttachment('t1', second));
    expect(get().allTransactions[0].attachments).toHaveLength(2);

    act(() => get().removeTxAttachment('t1', 'att_1'));
    expect(get().allTransactions[0].attachments).toHaveLength(1);
    expect(get().allTransactions[0].attachments[0].id).toBe('att_2');

    act(() => get().removeTxAttachment('t1', 'att_2'));
    expect('attachments' in get().allTransactions[0]).toBe(false); // field dropped when empty
  });

  it('does not touch other transactions', async () => {
    const { get } = await mountStore();
    act(() => {
      get().setTransactions([
        { id: 't1', name: 'A', amt: -1, date: '2026-06-01', acct: 'chk', ccy: 'USD' },
        { id: 't2', name: 'B', amt: -2, date: '2026-06-01', acct: 'chk', ccy: 'USD' },
      ]);
    });
    act(() => {
      get().setTxNote('t1', 'note one');
      get().addTxAttachment('t1', SAMPLE_ATT);
    });
    const t2 = get().allTransactions.find(t => t.id === 't2');
    expect('note' in t2).toBe(false);
    expect('attachments' in t2).toBe(false);
  });

  it('preserves the existing transfer-note path (createTransfer + updateTransfer)', async () => {
    const { get } = await mountStore();
    act(() => {
      get().setTransactions([]);
    });
    // Seed two accounts so the transfer legs resolve account ccy/names.
    act(() => {
      get().setAccounts?.([
        { id: 'chk', name: 'CHECKING', code: 'CHK', ccy: 'USD', openingBal: 0 },
        { id: 'sav', name: 'SAVINGS', code: 'SAV', ccy: 'USD', openingBal: 0 },
      ]);
    });

    act(() => {
      get().createTransfer({
        fromAcct: 'chk', toAcct: 'sav', amtFrom: 100, amtTo: 100,
        date: '2026-06-02', note: 'RENT SAVINGS',
      });
    });

    const legs = get().allTransactions.filter(t => t.cat === 'transfer');
    expect(legs).toHaveLength(2);
    expect(legs.every(l => l.note === 'RENT SAVINGS')).toBe(true);

    const transferId = legs[0].transferId;
    act(() => {
      get().updateTransfer(transferId, {
        fromAcct: 'chk', toAcct: 'sav', amtFrom: 120, amtTo: 120,
        date: '2026-06-02', note: 'RENT SAVINGS V2',
      });
    });
    const updated = get().allTransactions.filter(t => t.transferId === transferId);
    expect(updated.every(l => l.note === 'RENT SAVINGS V2')).toBe(true);
  });
});
