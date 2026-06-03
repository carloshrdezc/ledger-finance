// @vitest-environment jsdom
// CAR-243: LockScreen multi-method tests — password tab, passkey origin
// filter, recovery tab.

import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MKProvider } from '../security/useMK';
import LockScreen from './LockScreen';
// Spy getPasskeyWk (the WebAuthn ceremony) but keep the real
// passkeyMatchesOrigin so the origin-filter test still exercises real logic.
import { getPasskeyWk } from '../security/webauthn';

vi.mock('../security/webauthn', async importActual => {
  const actual = await importActual();
  return { ...actual, getPasskeyWk: vi.fn() };
});

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
    // CAR-243 round-3 (I4): the tabpanel is now aria-labelledby its active
    // tab, so the accessible name "PASSWORD" applies to BOTH the input
    // (aria-label) and the tabpanel <div>. Scope to <input> to disambiguate.
    await waitFor(() => expect(getByLabelText('PASSWORD', { selector: 'input' })).toBeTruthy());
    fireEvent.change(getByLabelText('PASSWORD', { selector: 'input' }), { target: { value: 'fishfish' } });
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

  // C1 end-to-end: a passkey on a matching origin must unlock by feeding the
  // metadata getState() surfaces (credentialId/salt/prfPath/userHandle)
  // straight into getPasskeyWk, then unlockPasskey. This is the test that was
  // missing — no prior test clicked UNLOCK on a passkey tab, so the broken
  // getState shape went unnoticed.
  it('unlocks a passkey using the metadata from getState (no hand-injection)', async () => {
    getPasskeyWk.mockResolvedValue(new Uint8Array(32).fill(5));
    const detail = {
      name: 'passkey',
      rpId: 'localhost', // matches jsdom origin so the tab survives the filter
      credentialId: [10, 11, 12],
      salt: [20, 21, 22],
      prfPath: 'prf',
      userHandle: [30, 31],
    };
    const bridge = makeBridge({
      getState: vi.fn().mockResolvedValue({
        enabled: true, locked: true,
        methods: ['passkey'],
        methodsDetail: [detail],
        lockedUntil: null,
      }),
    });
    const { getByRole, findByText } = render(
      <MKProvider bridge={bridge}><LockScreen /></MKProvider>
    );
    // Wait for the async getState to resolve and the passkey panel to become
    // active (the initial render is the default `pin` panel). Clicking before
    // this would dispatch unlockPin, not the passkey ceremony.
    await findByText(/APPROVE ON YOUR AUTHENTICATOR/i);
    fireEvent.click(getByRole('button', { name: /UNLOCK/ }));

    await waitFor(() => expect(getPasskeyWk).toHaveBeenCalledTimes(1));
    // The ceremony must receive the real metadata getState produced.
    expect(getPasskeyWk).toHaveBeenCalledWith({
      credentialId: [10, 11, 12],
      rpId: 'localhost',
      salt: [20, 21, 22],
      prfPath: 'prf',
      userHandle: [30, 31],
    });
    await waitFor(() => expect(bridge.unlockPasskey).toHaveBeenCalledTimes(1));
    expect(bridge.unlockPasskey.mock.calls[0][0]).toHaveLength(32);
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
