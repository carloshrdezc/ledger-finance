// @vitest-environment jsdom
// CAR-346: TransactionRow surfaces a note/attachment indicator.
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TransactionRow from './TransactionRow';

const T = { currency: 'USD', decimals: 2, accent: '#1f6b3a', density: 'comfortable' };
const ACCTS = [{ id: 'chk', code: 'CHK', name: 'CHECKING' }];

afterEach(cleanup);

function renderRow(tx) {
  return render(
    <TransactionRow tx={tx} t={T} accountsWithBalance={ACCTS} />,
  );
}

const BASE = { id: 't1', name: 'WHOLE FOODS', amt: -10, date: '2026-06-01', acct: 'chk', ccy: 'USD', cat: 'food', path: ['food'] };

describe('TransactionRow note/attachment indicator', () => {
  it('shows no indicator for a plain tx', () => {
    renderRow(BASE);
    expect(screen.queryByLabelText('has note')).toBeNull();
    expect(screen.queryByLabelText(/attachment/i)).toBeNull();
  });

  it('shows a note indicator when the tx has a note', () => {
    renderRow({ ...BASE, note: 'reimbursable' });
    expect(screen.getByLabelText('has note')).toBeTruthy();
  });

  it('shows an attachment indicator with count when the tx has attachments', () => {
    renderRow({
      ...BASE,
      attachments: [
        { id: 'a1', dataUrl: 'data:image/jpeg;base64,AAAA' },
        { id: 'a2', dataUrl: 'data:image/jpeg;base64,AAAA' },
      ],
    });
    const el = screen.getByLabelText('2 attachments');
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('2');
  });

  it('singular label for a single attachment', () => {
    renderRow({ ...BASE, attachments: [{ id: 'a1', dataUrl: 'data:image/jpeg;base64,AAAA' }] });
    expect(screen.getByLabelText('1 attachment')).toBeTruthy();
  });
});
