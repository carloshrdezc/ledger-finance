// CAR-243: SecuritySettings parity + behaviour tests.
//
// Renders against a mock MK bridge (no main process) and asserts:
//   - section header present
//   - "set up security" CTA when enabled:false
//   - per-method ADD/REMOVE buttons when enabled
//   - REMOVE refused on last method shows error
//   - OS escrow toggle hidden when isElectron=false (browser path, I9)
//   - reveal asks for re-auth (R6)
//
// We mount SecuritySettings inside a real MKProvider wired to a
// Promise-based fake bridge — no IPC, no Argon2id.

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MKProvider } from '../security/useMK';
import { SecuritySettings } from './SecuritySettings';

function makeBridge(initialState) {
  const listeners = new Set();
  let state = { ...initialState };
  function emit(next) {
    state = { ...state, ...next };
    for (const l of listeners) l(state);
  }
  return {
    bridge: {
      getState: () => Promise.resolve(state),
      onStateChanged: cb => { listeners.add(cb); return () => listeners.delete(cb); },
      unlockPin: vi.fn(async () => ({ success: true })),
      unlockPassword: vi.fn(async () => ({ success: true })),
      unlockPasskey: vi.fn(async () => ({ success: true })),
      unlockRecovery: vi.fn(async () => ({ success: true })),
      lockNow: vi.fn(async () => ({ ok: true })),
      setup: vi.fn(async () => ({ ok: true, recoveryPhrase: 'a b c d e f g h i j k l' })),
      enable: vi.fn(async () => ({ ok: true })),
      disable: vi.fn(async () => ({ ok: true })),
      addMethod: vi.fn(async () => ({ ok: true })),
      removeMethod: vi.fn(async (name) => {
        if (state.methods.length <= 1) return { ok: false, error: 'LAST_METHOD' };
        emit({ methods: state.methods.filter(m => m !== name) });
        return { ok: true };
      }),
      changeSecret: vi.fn(async () => ({ ok: true })),
      revealRecovery: vi.fn(async () => ({ ok: true, phrase: 'twelve word phrase here etcetera one two three four five' })),
      rotateRecovery: vi.fn(async () => ({ ok: true, phrase: 'rotated phrase one two three four five six seven eight nine ten' })),
      setOsEscrowEnabled: vi.fn(async () => ({ ok: true })),
    },
    emit,
  };
}

afterEach(() => { cleanup(); });

describe('SecuritySettings — disabled state', () => {
  it('renders SET UP SECURITY CTA when enabled:false', async () => {
    const { bridge } = makeBridge({ enabled: false, locked: false, methods: [], hasRecovery: false });
    render(
      <MKProvider bridge={bridge}>
        <SecuritySettings isElectron={true} />
      </MKProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/SET UP SECURITY/i)).toBeTruthy();
    });
    expect(screen.getByTestId('security-settings')).toBeTruthy();
  });
});

describe('SecuritySettings — enabled, multiple methods', () => {
  it('shows REMOVE on enabled methods + ADD on disabled ones', async () => {
    const { bridge } = makeBridge({
      enabled: true, locked: false,
      methods: ['pin', 'password'], methodsDetail: [
        { name: 'pin' }, { name: 'password' },
      ],
      hasRecovery: true, osEscrow: true,
    });
    render(
      <MKProvider bridge={bridge}>
        <SecuritySettings isElectron={true} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getAllByText(/REMOVE/).length).toBeGreaterThanOrEqual(2));
    expect(screen.getAllByText(/ADD/).length).toBeGreaterThanOrEqual(1); // passkey is OFF
    expect(screen.getByText(/REVEAL/)).toBeTruthy();
    expect(screen.getByText(/ROTATE/)).toBeTruthy();
    expect(screen.getByText(/LOCK NOW/)).toBeTruthy();
    expect(screen.getByText(/DISABLE SECURITY/)).toBeTruthy();
  });

  it('refuses to remove the only enabled method (I5)', async () => {
    const { bridge } = makeBridge({
      enabled: true, locked: false,
      methods: ['pin'], methodsDetail: [{ name: 'pin' }],
      hasRecovery: true,
    });
    render(
      <MKProvider bridge={bridge}>
        <SecuritySettings isElectron={true} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getByText(/REMOVE/)).toBeTruthy());
    const btn = screen.getByText(/REMOVE/).closest('button');
    expect(btn?.disabled).toBe(true);
  });

  it('hides OS escrow toggle on browser (I9)', async () => {
    const { bridge } = makeBridge({
      enabled: true, locked: false, methods: ['pin'],
      methodsDetail: [{ name: 'pin' }], hasRecovery: true, osEscrow: false,
    });
    render(
      <MKProvider bridge={bridge}>
        <SecuritySettings isElectron={false} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getByText(/PIN/)).toBeTruthy());
    expect(screen.queryByText(/OS ESCROW/i)).toBeNull();
  });

  it('reveal phrase requires re-auth (R6)', async () => {
    const { bridge } = makeBridge({
      enabled: true, locked: false, methods: ['pin'],
      methodsDetail: [{ name: 'pin' }], hasRecovery: true,
    });
    render(
      <MKProvider bridge={bridge}>
        <SecuritySettings isElectron={true} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getByText(/REVEAL/)).toBeTruthy());
    fireEvent.click(screen.getByText(/REVEAL/));
    await waitFor(() => expect(screen.getByLabelText(/reauth-secret/)).toBeTruthy());
    expect(bridge.revealRecovery).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/reauth-secret/), { target: { value: '4729' } });
    // The "REVEAL" button inside the reauth form is the second occurrence.
    const buttons = screen.getAllByText(/REVEAL/);
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(bridge.revealRecovery).toHaveBeenCalledWith({ method: 'pin', secret: '4729' }));
  });
});
