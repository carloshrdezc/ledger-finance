// @vitest-environment jsdom
// CAR-243: LockScreen multi-method tests — password tab, passkey origin
// filter, recovery tab.

import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MKProvider } from '../security/useMK';
import LockScreen from './LockScreen';

function makeBridge(overrides = {}) {
  return {
    getState: vi.fn().mockResolvedValue({
      enabled: true,
      locked: true,
      methods: ['pin', 'password'],
      methodsDetail: [{ name: 'pin' }, { name: 'password' }],
      lockedUntil: null,
    }),
    unlockPin: vi.fn().mockResolvedValue({ success: true }),
    unlockPassword: vi.fn().mockResolvedValue({ success: true }),
    unlockRecovery: vi.fn().mockResolvedValue({ success: true }),
    unlockPasskey: vi.fn().mockResolvedValue({ success: true }),
    lockNow: vi.fn().mockResolvedValue({ ok: true }),
    onStateChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

afterEach(() => { cleanup(); });

describe('LockScreen — multi-method (CAR-243)', () => {
  it('renders tabs for each enabled method', async () => {
    const bridge = makeBridge();
    const { getByRole } = render(
      <MKProvider bridge={bridge}><LockScreen /></MKProvider>
    );
    await waitFor(() => expect(getByRole('tab', { name: /PIN/ })).toBeTruthy());
    expect(getByRole('tab', { name: /PASSWORD/ })).toBeTruthy();
  });

  it('switches to the password tab and dispatches unlockPassword', async () => {
    const bridge = makeBridge();
    const { getByRole, getByLabelText } = render(
      <MKProvider bridge={bridge}><LockScreen /></MKProvider>
    );
    await waitFor(() => expect(getByRole('tab', { name: /PASSWORD/ })).toBeTruthy());
    fireEvent.click(getByRole('tab', { name: /PASSWORD/ }));
    await waitFor(() => expect(getByLabelText('PASSWORD')).toBeTruthy());
    fireEvent.change(getByLabelText('PASSWORD'), { target: { value: 'fishfish' } });
    fireEvent.click(getByRole('button', { name: /UNLOCK/ }));
    await waitFor(() => expect(bridge.unlockPassword).toHaveBeenCalledWith('fishfish'));
  });

  it('hides passkeys whose RP ID does not match the current origin (I9 / row 4)', async () => {
    // jsdom defaults window.location.hostname to 'localhost'.
    const bridge = makeBridge({
      getState: vi.fn().mockResolvedValue({
        enabled: true, locked: true,
        methods: ['pin', 'password', 'passkey'],
        methodsDetail: [
          { name: 'pin' },
          { name: 'password' },
          { name: 'passkey', rpId: 'example.com', credentialId: [1], salt: [2], prfPath: 'prf' },
        ],
        lockedUntil: null,
      }),
    });
    const { queryByRole, getByRole } = render(
      <MKProvider bridge={bridge}><LockScreen /></MKProvider>
    );
    await waitFor(() => expect(getByRole('tab', { name: /PIN/ })).toBeTruthy());
    // PIN + PASSWORD survive the origin filter; PASSKEY is dropped.
    expect(getByRole('tab', { name: /PASSWORD/ })).toBeTruthy();
    expect(queryByRole('tab', { name: /PASSKEY/ })).toBeNull();
  });

  it('shows the recovery tab when methods includes recovery', async () => {
    const bridge = makeBridge({
      getState: vi.fn().mockResolvedValue({
        enabled: true, locked: true,
        methods: ['pin', 'recovery'],
        methodsDetail: [{ name: 'pin' }, { name: 'recovery' }],
        lockedUntil: null,
      }),
    });
    const { getByRole } = render(
      <MKProvider bridge={bridge}><LockScreen /></MKProvider>
    );
    await waitFor(() => expect(getByRole('tab', { name: /RECOVERY/ })).toBeTruthy());
  });
});
