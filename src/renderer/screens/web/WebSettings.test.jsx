// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WebSettings from './WebSettings';
import { StoreCtx } from '../../store';
import { UndoProvider } from '../../UndoContext';

vi.mock('../../components/ImportExport', () => ({ default: () => <div data-testid="import-export" /> }));
vi.mock('../../components/FxRatesSection', () => ({ default: () => <div data-testid="fx-rates" /> }));
vi.mock('../../components/BackupSection', () => ({ default: () => <div data-testid="backup" /> }));
vi.mock('../../components/RulesEditor', () => ({ default: () => <div data-testid="rules-editor" /> }));
vi.mock('./WebShell', () => ({ default: ({ children }) => <div>{children}</div> }));

afterEach(() => cleanup());

const THEME = { currency: 'USD', decimals: 2, accent: '#0f0', density: 'comfortable', theme: 'light' };

function makeStore(overrides = {}) {
  return {
    categoryTree: {},
    addCategory: vi.fn(),
    renameCategory: vi.fn(),
    removeCategory: vi.fn(),
    budgetStartDay: 1,
    setBudgetStartDay: vi.fn(),
    reset: vi.fn(),
    loadSampleData: vi.fn(),
    resetAndLoadSampleData: vi.fn(),
    rules: [],
    addRule: vi.fn(),
    updateRule: vi.fn(),
    deleteRule: vi.fn(),
    reorderRules: vi.fn(),
    updateTxsIndividually: vi.fn(),
    transactions: [],
    accountsWithBalance: [
      { id: 'chk', name: 'Checking', type: 'CHK', ccy: 'USD' },
      { id: 'sav', name: 'Savings', type: 'SAV', ccy: 'USD' },
    ],
    forecastLiquidAccountIds: [],
    setForecastLiquidAccountIds: vi.fn(),
    forecastThreshold: 0,
    setForecastThreshold: vi.fn(),
    setOnboarded: vi.fn(),
    ...overrides,
  };
}

function renderWithStore(storeOverrides = {}) {
  const store = makeStore(storeOverrides);
  const utils = render(
    <StoreCtx.Provider value={store}>
      <UndoProvider>
        <WebSettings
          t={THEME}
          onNavigate={() => {}}
          onAdd={() => {}}
          setAccent={() => {}}
          setDensity={() => {}}
          setDecimals={() => {}}
          setCurrency={() => {}}
          setTheme={() => {}}
        />
      </UndoProvider>
    </StoreCtx.Provider>,
  );
  return { ...utils, store };
}

describe('CAR-218 · WebSettings liquid account toggles', () => {
  it('treats auto mode as all-selected and excludes one account when clicked', () => {
    const { store } = renderWithStore();

    expect(screen.getByRole('button', { name: 'CHECKING' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'SAVINGS' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'CHECKING' }));
    expect(store.setForecastLiquidAccountIds).toHaveBeenCalledWith(['sav']);
  });

  it('can replay onboarding without clearing data', () => {
    const { store } = renderWithStore();

    fireEvent.click(screen.getByRole('button', { name: /replay onboarding/i }));

    expect(store.setOnboarded).toHaveBeenCalledWith(false);
  });
});
