// @vitest-environment jsdom
// CAR-242: LockScreen UI tests — render, accept input, dispatch unlock,
// surface error / countdown states.

import React from 'react';
import { render, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MKProvider } from '../security/useMK';
import LockScreen from './LockScreen';

function makeBridge(overrides = {}) {
  return {
    getState: vi.fn().mockResolvedValue({
      enabled: true,
      locked: true,
      methods: ['pin'],
      lockedUntil: null,
    }),
    unlockPin: vi.fn().mockResolvedValue({ success: true }),
    lockNow: vi.fn().mockResolvedValue({ ok: true }),
    onStateChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('LockScreen', () => {
  it('renders the PIN input and unlock button', async () => {
    const bridge = makeBridge();
    const { getByLabelText, getByRole } = render(
      <MKProvider bridge={bridge}>
        <LockScreen />
      </MKProvider>,
    );
    await waitFor(() => expect(bridge.getState).toHaveBeenCalled());
    expect(getByLabelText('PIN')).toBeTruthy();
    expect(getByRole('button').textContent).toContain('UNLOCK');
  });

  it('calls unlockPin with the typed PIN on submit', async () => {
    const bridge = makeBridge();
    const { getByLabelText, getByRole } = render(
      <MKProvider bridge={bridge}>
        <LockScreen />
      </MKProvider>,
    );
    await waitFor(() => expect(bridge.getState).toHaveBeenCalled());
    const input = getByLabelText('PIN');
    fireEvent.change(input, { target: { value: '4729' } });
    await act(async () => {
      fireEvent.click(getByRole('button'));
    });
    expect(bridge.unlockPin).toHaveBeenCalledWith('4729');
  });

  it('shows INCORRECT PIN on a bad-secret response', async () => {
    const bridge = makeBridge({
      unlockPin: vi.fn().mockResolvedValue({ success: false, error: 'BAD_SECRET' }),
    });
    const { getByLabelText, getByRole, findByRole } = render(
      <MKProvider bridge={bridge}>
        <LockScreen />
      </MKProvider>,
    );
    await waitFor(() => expect(bridge.getState).toHaveBeenCalled());
    fireEvent.change(getByLabelText('PIN'), { target: { value: '0000' } });
    await act(async () => {
      fireEvent.click(getByRole('button'));
    });
    const alert = await findByRole('alert');
    expect(alert.textContent).toContain('INCORRECT');
  });

  it('shows the lockout countdown when getState reports lockedUntil', async () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    const bridge = makeBridge({
      getState: vi.fn().mockResolvedValue({
        enabled: true,
        locked: true,
        methods: ['pin'],
        lockedUntil: future,
      }),
    });
    const { findByRole } = render(
      <MKProvider bridge={bridge}>
        <LockScreen />
      </MKProvider>,
    );
    const status = await findByRole('status');
    expect(status.textContent).toContain('LOCKED');
    expect(status.textContent).toMatch(/\d+S|\d+M|\d+H/);
  });

  it('disables the unlock button while a request is in flight', async () => {
    let resolveUnlock;
    const bridge = makeBridge({
      unlockPin: vi.fn().mockImplementation(
        () => new Promise(r => { resolveUnlock = r; }),
      ),
    });
    const { getByLabelText, getByRole } = render(
      <MKProvider bridge={bridge}>
        <LockScreen />
      </MKProvider>,
    );
    await waitFor(() => expect(bridge.getState).toHaveBeenCalled());
    fireEvent.change(getByLabelText('PIN'), { target: { value: '4729' } });
    act(() => {
      fireEvent.click(getByRole('button'));
    });
    expect(getByRole('button').disabled).toBe(true);
    await act(async () => {
      resolveUnlock({ success: true });
    });
  });
});
