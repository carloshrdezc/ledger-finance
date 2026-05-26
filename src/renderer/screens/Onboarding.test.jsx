// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StoreProvider, useStore } from '../store';
import Onboarding from './Onboarding';

function setViewport(width) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

vi.mock('../components/ImportExport', () => ({
  default: ({ onClose }) => <div data-testid="import-export"><button onClick={onClose}>CLOSE IMPORT</button></div>,
}));

vi.mock('../components/AccountFormModal', () => ({
  default: ({ onClose }) => {
    const { addAccount } = useStore();
    return (
      <div data-testid="account-modal">
        <button onClick={() => {
          addAccount({
            id: 'acct-web',
            name: 'CHECKING',
            type: 'CHK',
            openingBal: 100,
            openingDate: '2026-05-01',
            ccy: 'USD',
            includeInTotals: true,
          });
          onClose();
        }}>
          SAVE ACCOUNT
        </button>
      </div>
    );
  },
}));

vi.mock('../components/AccountFormSheet', () => ({
  default: ({ onClose }) => {
    const { addAccount } = useStore();
    return (
      <div data-testid="account-sheet">
        <button onClick={() => {
          addAccount({
            id: 'acct-mobile',
            name: 'CHECKING',
            type: 'CHK',
            openingBal: 100,
            openingDate: '2026-05-01',
            ccy: 'USD',
            includeInTotals: true,
          });
          onClose();
        }}>
          SAVE ACCOUNT SHEET
        </button>
      </div>
    );
  },
}));

vi.mock('../components/BudgetFormModal', () => ({
  default: ({ onClose }) => {
    const { addBudget } = useStore();
    return (
      <div data-testid="budget-modal">
        <button onClick={() => {
          addBudget({ cat: 'rent', limit: 1200 });
          onClose();
        }}>
          SAVE BUDGET
        </button>
      </div>
    );
  },
}));

vi.mock('../components/BudgetFormSheet', () => ({
  default: ({ onClose }) => {
    const { addBudget } = useStore();
    return (
      <div data-testid="budget-sheet">
        <button onClick={() => {
          addBudget({ cat: 'rent', limit: 1200 });
          onClose();
        }}>
          SAVE BUDGET SHEET
        </button>
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  setViewport(1400);
  vi.restoreAllMocks();
});

beforeEach(() => {
  setViewport(1400);
});

function renderOnboarding() {
  return render(
    <StoreProvider>
      <Onboarding />
    </StoreProvider>,
  );
}

describe('Onboarding flow', () => {
  it('walks through welcome → account → import → budget and marks onboarded', () => {
    renderOnboarding();

    expect(screen.getByText(/personal finance ledger that runs on your machine, owns no data/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText(/add an account/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add account/i }));
    fireEvent.click(screen.getByRole('button', { name: /save account/i }));

    expect(screen.getByText(/import a bank file/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /import a bank file/i }));
    expect(screen.getByTestId('import-export')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));

    expect(screen.getByText(/set one budget/i)).toBeTruthy();
    expect(screen.getByText(/rent/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
    fireEvent.click(screen.getByRole('button', { name: /finish onboarding/i }));

    expect(localStorage.getItem('ledger:onboarded')).toBe(JSON.stringify(true));
  });

  it('uses the mobile sheet forms when the viewport is narrow', () => {
    setViewport(390);
    renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /add account/i }));

    expect(screen.getByTestId('account-sheet')).toBeTruthy();
    expect(screen.queryByTestId('account-modal')).toBeNull();
  });
});
