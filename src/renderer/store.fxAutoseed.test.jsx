// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

function setLedgerSnapshot(snapshot) {
  localStorage.clear();
  for (const [key, value] of Object.entries(snapshot)) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

async function bootStore(snapshot = {}) {
  setLedgerSnapshot(snapshot);
  delete window.ledgerDB;
  vi.resetModules();

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

  return store;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.ledgerDB;
  vi.resetModules();
});

it('auto-seeds a placeholder FX rate when adding an account in a new currency', async () => {
  const store = await bootStore({
    'ledger:fxRates': {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      CAD: 1.35,
      AUD: 1.51,
      CHF: 0.885,
      MXN: 17.2,
    },
    'ledger:fxRatesUpdated': {},
  });

  act(() => {
    store.addAccount({
      id: 'acct-zar',
      name: 'ZAR CASH',
      type: 'FX',
      ccy: 'ZAR',
    });
  });

  const fxRates = JSON.parse(localStorage.getItem('ledger:fxRates'));
  const fxRatesUpdated = JSON.parse(localStorage.getItem('ledger:fxRatesUpdated'));
  expect(fxRates.ZAR).toEqual([
    expect.objectContaining({ rate: 1.0, source: 'seed' }),
  ]);
  expect(fxRatesUpdated.ZAR).toBeNull();
});

it('auto-seeds a placeholder FX rate when updateAccount changes currency to a new one', async () => {
  const store = await bootStore({
    'ledger:accounts': [
      { id: 'eur', name: 'WISE EUR', type: 'FX', ccy: 'EUR', archived: false, includeInTotals: true, order: 0, openingBal: 0 },
    ],
    'ledger:fxRates': {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      CAD: 1.35,
      AUD: 1.51,
      CHF: 0.885,
      MXN: 17.2,
    },
    'ledger:fxRatesUpdated': {},
  });

  act(() => {
    store.updateAccount('eur', { ccy: 'ZAR' });
  });

  const fxRates = JSON.parse(localStorage.getItem('ledger:fxRates'));
  const fxRatesUpdated = JSON.parse(localStorage.getItem('ledger:fxRatesUpdated'));
  const accounts = JSON.parse(localStorage.getItem('ledger:accounts'));
  expect(fxRates.ZAR).toEqual([
    expect.objectContaining({ rate: 1.0, source: 'seed' }),
  ]);
  expect(fxRatesUpdated.ZAR).toBeNull();
  expect(accounts.find(a => a.id === 'eur').ccy).toBe('ZAR');
});

it('does not overwrite an existing FX rate when updateAccount changes currency to one already seeded', async () => {
  const store = await bootStore({
      'ledger:accounts': [
      { id: 'eur', name: 'WISE EUR', type: 'FX', ccy: 'EUR', archived: false, includeInTotals: true, order: 0, openingBal: 0 },
    ],
    'ledger:fxRates': {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      CAD: 1.35,
      AUD: 1.51,
      CHF: 0.885,
      MXN: 17.2,
      ZAR: [{ rate: 7.1, effectiveFrom: '2026-05-10', source: 'seed' }],
    },
    'ledger:fxRatesUpdated': {
      ZAR: '2026-05-10',
    },
  });

  act(() => {
    store.updateAccount('eur', { ccy: 'ZAR' });
  });

  const fxRates = JSON.parse(localStorage.getItem('ledger:fxRates'));
  const fxRatesUpdated = JSON.parse(localStorage.getItem('ledger:fxRatesUpdated'));
  const accounts = JSON.parse(localStorage.getItem('ledger:accounts'));
  expect(fxRates.ZAR).toEqual([
    expect.objectContaining({ rate: 7.1, source: 'seed' }),
  ]);
  expect(fxRatesUpdated.ZAR).toBe('2026-05-10');
  expect(accounts.find(a => a.id === 'eur').ccy).toBe('ZAR');
});

it('does not touch FX rates when updateAccount patch omits ccy', async () => {
  const store = await bootStore({
    'ledger:accounts': [
      { id: 'eur', name: 'WISE EUR', type: 'FX', ccy: 'EUR', archived: false, includeInTotals: true, order: 0, openingBal: 0 },
    ],
    'ledger:fxRates': {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      CAD: 1.35,
      AUD: 1.51,
      CHF: 0.885,
      MXN: 17.2,
    },
    'ledger:fxRatesUpdated': {
      EUR: '2026-05-10',
    },
  });

  const ratesBefore = { ...store.rates };
  const ratesUpdatedBefore = { ...store.ratesUpdated };

  act(() => {
    store.updateAccount('eur', { name: 'Renamed' });
  });

  expect(JSON.parse(localStorage.getItem('ledger:fxRates'))).toEqual(ratesBefore);
  expect(JSON.parse(localStorage.getItem('ledger:fxRatesUpdated'))).toEqual(ratesUpdatedBefore);
  expect(JSON.parse(localStorage.getItem('ledger:accounts')).find(a => a.id === 'eur').name).toBe('Renamed');
});
