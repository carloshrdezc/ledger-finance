// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Settings from './Settings';
import { StoreCtx } from '../../store';

vi.mock('../../components/ImportExport', () => ({ default: () => <div data-testid="import-export" /> }));
vi.mock('../../components/FxRatesSection', () => ({ default: () => <div data-testid="fx-rates" /> }));
vi.mock('../../components/BackupSection', () => ({ default: () => <div data-testid="backup" /> }));

afterEach(() => cleanup());

const THEME = { currency: 'USD', decimals: 2, accent: '#0f0', density: 'comfortable', theme: 'light' };

function makeStore(overrides = {}) {
  return {
    budgetStartDay: 1,
    setBudgetStartDay: vi.fn(),
    reset: vi.fn(),
    loadSampleData: vi.fn(),
    resetAndLoadSampleData: vi.fn(),
    setOnboarded: vi.fn(),
    ...overrides,
  };
}

function renderWithStore(storeOverrides = {}) {
  const store = makeStore(storeOverrides);
  const utils = render(
    <StoreCtx.Provider value={store}>
      <Settings
        t={THEME}
        onBack={() => {}}
        onNavigate={() => {}}
        setAccent={() => {}}
        setDensity={() => {}}
        setDecimals={() => {}}
        setCurrency={() => {}}
        setTheme={() => {}}
      />
    </StoreCtx.Provider>,
  );
  return { ...utils, store };
}

// PR #62 round-2: mobile Settings replay-onboarding contract. WebSettings has
// the equivalent test; this locks the mobile path so a future refactor can't
// silently break the replay flow on one platform.
describe('mobile Settings · replay onboarding', () => {
  it('clears the onboarded flag without clearing user data', () => {
    const { store } = renderWithStore();

    fireEvent.click(screen.getByRole('button', { name: /replay onboarding/i }));

    expect(store.setOnboarded).toHaveBeenCalledWith(false);
    // Data-clearing actions must NOT have been called — replay is non-destructive.
    expect(store.reset).not.toHaveBeenCalled();
    expect(store.resetAndLoadSampleData).not.toHaveBeenCalled();
  });
});

describe('CAR-243 · mobile Settings security section parity', () => {
  it('renders the Security section', () => {
    renderWithStore();
    expect(screen.getByTestId('security-settings')).toBeTruthy();
  });

  it('renders the legacy plaintext nudge when security is disabled', () => {
    try { window.localStorage.removeItem('ledger.security.nudgeDismissedAt'); } catch { /* jsdom */ }
    renderWithStore();
    expect(screen.getByText('SECURE YOUR DATA')).toBeTruthy();
  });
});
