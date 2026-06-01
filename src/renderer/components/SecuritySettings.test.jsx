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
import { SecuritySettings, SecurityNudge } from './SecuritySettings';

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
      disable: vi.fn(async () => ({ ok: true })),
      addMethod: vi.fn(async () => ({ ok: true })),
      removeMethod: vi.fn(async (name) => {
        if (state.methods.length <= 1) return { ok: false, error: 'LAST_METHOD' };
        emit({ methods: state.methods.filter(m => m !== name) });
        return { ok: true };
      }),
      revealRecovery: vi.fn(async () => ({ ok: true, phrase: 'twelve word phrase here etcetera one two three four five' })),
      rotateRecovery: vi.fn(async () => ({ ok: true, phrase: 'rotated phrase one two three four five six seven eight nine ten' })),
      // CAR-243 round-3: bridge key matches preload (`setOsEscrow`), not the
      // earlier-round drift `setOsEscrowEnabled`. Optional chaining used to
      // mask the mismatch, so the OS-escrow toggle was never actually exercised.
      setOsEscrow: vi.fn(async () => ({ ok: true })),
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

  // CAR-243 round-3: regression-locks the bridge contract for OS escrow.
  // Earlier rounds had a test mock keyed `setOsEscrowEnabled` while the
  // production preload exposed `setOsEscrow`. Optional chaining swallowed
  // the mismatch and the toggle silently no-op'd in tests. This asserts
  // the call lands on the real key with the user's chosen value.
  it('toggles OS escrow through the bridge (I9 contract lock)', async () => {
    const { bridge } = makeBridge({
      enabled: true, locked: false, methods: ['pin'],
      methodsDetail: [{ name: 'pin' }], hasRecovery: true, osEscrow: false,
    });
    render(
      <MKProvider bridge={bridge}>
        <SecuritySettings isElectron={true} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getByLabelText(/os-escrow/i)).toBeTruthy());
    expect(bridge.setOsEscrow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/os-escrow/i));
    await waitFor(() => expect(bridge.setOsEscrow).toHaveBeenCalledWith(true));
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

// CAR-243 round-3 (I7): SecurityNudge parity tests. Earlier rounds tested
// the Nudge inside the screen-shell tests (Settings.test, WebSettings.test)
// but never exercised it sitting inside the MKProvider that
// SecuritySettings itself uses. These cover both the dismiss path
// (localStorage write + hide) and the SET UP path firing the host's
// scrollIntoView callback.
describe('SecurityNudge — within MKProvider', () => {
  beforeEach(() => {
    try { window.localStorage.removeItem('ledger.security.nudgeDismissedAt'); } catch { /* jsdom */ }
  });

  it('renders the SET UP / DISMISS controls when security is disabled', async () => {
    const { bridge } = makeBridge({ enabled: false, locked: false, methods: [], hasRecovery: false });
    render(
      <MKProvider bridge={bridge}>
        <SecurityNudge onSetup={() => {}} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getByText(/SECURE YOUR DATA/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'SET UP' })).toBeTruthy();
    expect(screen.getByText(/DISMISS/)).toBeTruthy();
  });

  it('hides itself + persists dismissal to localStorage on DISMISS', async () => {
    const { bridge } = makeBridge({ enabled: false, locked: false, methods: [], hasRecovery: false });
    render(
      <MKProvider bridge={bridge}>
        <SecurityNudge onSetup={() => {}} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getByText(/DISMISS/)).toBeTruthy());
    fireEvent.click(screen.getByText(/DISMISS/));
    await waitFor(() => expect(screen.queryByText(/SECURE YOUR DATA/)).toBeNull());
    expect(window.localStorage.getItem('ledger.security.nudgeDismissedAt')).toBeTruthy();
  });

  it('fires onSetup when SET UP is pressed (host wires scrollIntoView)', async () => {
    const { bridge } = makeBridge({ enabled: false, locked: false, methods: [], hasRecovery: false });
    const onSetup = vi.fn();
    render(
      <MKProvider bridge={bridge}>
        <SecurityNudge onSetup={onSetup} />
      </MKProvider>
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'SET UP' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'SET UP' }));
    expect(onSetup).toHaveBeenCalled();
  });

  it('does not render when security is already enabled', async () => {
    const { bridge } = makeBridge({
      enabled: true, locked: false, methods: ['pin'],
      methodsDetail: [{ name: 'pin' }], hasRecovery: true,
    });
    render(
      <MKProvider bridge={bridge}>
        <SecurityNudge onSetup={() => {}} />
      </MKProvider>
    );
    // Wait one tick for the bridge state to land, then assert nothing rendered.
    await new Promise(r => setTimeout(r, 30));
    expect(screen.queryByText(/SECURE YOUR DATA/)).toBeNull();
  });
});
