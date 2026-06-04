// CAR-242 + CAR-243: React context exposing the security state to the
// renderer.
//
// MK never lives here — every method ships its secret to main over the
// preload bridge, main runs the KDF + unwrap, and only `{ success, ... }`
// (plus optional error codes / lockedUntil) come back. The lone exception
// is passkey: WebAuthn lives in the renderer, so we derive a 32-byte raw
// WK here from the PRF result and ship those raw bytes (not the MK) to
// main where they unwrap a `kdf:'raw'` wrapper.
//
// `useMK()` returns a snapshot + the full action surface the Settings UI
// + lock screen + setup wizard need.

import React from 'react';

const noop = async () => ({ success: false, error: 'NO_BRIDGE' });
const noopOk = async () => ({ ok: false, error: 'NO_BRIDGE' });

const MKContext = React.createContext({
  enabled: false,
  locked: false,
  lockedUntil: null,
  methods: [],
  methodsDetail: [],
  hasRecovery: false,
  osEscrow: false,
  idleLockMs: 300_000,
  working: false,
  // unlock methods
  unlockPin: noop,
  unlockPassword: noop,
  unlockPasskey: noop,
  unlockRecovery: noop,
  // lifecycle
  lockNow: noopOk,
  setup: noopOk,
  addMethod: noopOk,
  removeMethod: noopOk,
  revealRecovery: noopOk,
  rotateRecovery: noopOk,
  disable: noopOk,
  setOsEscrow: noopOk,
  setIdleLockMs: noopOk,
});

const DEFAULT_STATE = Object.freeze({
  enabled: false,
  locked: false,
  lockedUntil: null,
  methods: [],
  methodsDetail: [],
  hasRecovery: false,
  osEscrow: false,
  idleLockMs: 300_000,
});

export function MKProvider({ children, bridge }) {
  // `bridge` defaults to window.ledgerSecurity but is injectable for tests.
  const securityBridge = bridge ?? (typeof window !== 'undefined' ? window.ledgerSecurity : undefined);
  const [state, setState] = React.useState(DEFAULT_STATE);
  const [working, setWorking] = React.useState(false);

  React.useEffect(() => {
    if (!securityBridge) return undefined;
    let cancelled = false;

    void (async () => {
      try {
        const next = await securityBridge.getState();
        if (!cancelled && next) setState({ ...DEFAULT_STATE, ...next });
      } catch {
        // Bridge call failed (e.g. main not ready yet); leave default.
      }
    })();

    const unsubscribe = securityBridge.onStateChanged?.(next => {
      if (!cancelled && next) setState({ ...DEFAULT_STATE, ...next });
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [securityBridge]);

  // Generic worker — wraps a bridge call in setWorking(true/false). Don't
  // set state here; main emits security:state-changed which our listener
  // picks up. Keeps the source of truth in main.
  const work = React.useCallback(async (fn, fallback) => {
    if (!securityBridge) return fallback;
    setWorking(true);
    try {
      return await fn(securityBridge);
    } finally {
      setWorking(false);
    }
  }, [securityBridge]);

  const unlockPin = React.useCallback(pin =>
    work(b => b.unlockPin(pin), { success: false, error: 'NO_BRIDGE' }),
  [work]);

  const unlockPassword = React.useCallback(password =>
    work(b => b.unlockPassword?.(password) ?? Promise.resolve({ success: false, error: 'NOT_SUPPORTED' }),
      { success: false, error: 'NO_BRIDGE' }),
  [work]);

  const unlockPasskey = React.useCallback(wk =>
    work(b => b.unlockPasskey?.(wk) ?? Promise.resolve({ success: false, error: 'NOT_SUPPORTED' }),
      { success: false, error: 'NO_BRIDGE' }),
  [work]);

  const unlockRecovery = React.useCallback(phrase =>
    work(b => b.unlockRecovery?.(phrase) ?? Promise.resolve({ success: false, error: 'NOT_SUPPORTED' }),
      { success: false, error: 'NO_BRIDGE' }),
  [work]);

  const lockNow = React.useCallback(() =>
    work(b => b.lockNow(), { ok: false }),
  [work]);

  const setup = React.useCallback(payload =>
    work(b => b.setup?.(payload) ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const addMethod = React.useCallback(payload =>
    work(b => b.addMethod?.(payload) ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const removeMethod = React.useCallback(name =>
    work(b => b.removeMethod?.(name) ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const revealRecovery = React.useCallback(payload =>
    work(b => b.revealRecovery?.(payload) ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const rotateRecovery = React.useCallback(() =>
    work(b => b.rotateRecovery?.() ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const disable = React.useCallback(() =>
    work(b => b.disable?.() ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const setOsEscrow = React.useCallback(enabled =>
    work(b => b.setOsEscrow?.(enabled) ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const setIdleLockMs = React.useCallback(ms =>
    work(b => b.setIdleLockMs?.(ms) ?? Promise.resolve({ ok: false, error: 'NOT_SUPPORTED' }),
      { ok: false, error: 'NO_BRIDGE' }),
  [work]);

  const value = React.useMemo(() => ({
    enabled: state.enabled,
    locked: state.locked,
    lockedUntil: state.lockedUntil,
    methods: state.methods,
    methodsDetail: state.methodsDetail || [],
    hasRecovery: state.hasRecovery,
    osEscrow: state.osEscrow,
    idleLockMs: state.idleLockMs,
    working,
    unlockPin, unlockPassword, unlockPasskey, unlockRecovery,
    lockNow, setup, addMethod, removeMethod,
    revealRecovery, rotateRecovery, disable, setOsEscrow, setIdleLockMs,
  }), [state, working, unlockPin, unlockPassword, unlockPasskey, unlockRecovery,
       lockNow, setup, addMethod, removeMethod, revealRecovery, rotateRecovery,
       disable, setOsEscrow, setIdleLockMs]);

  return <MKContext.Provider value={value}>{children}</MKContext.Provider>;
}

export function useMK() {
  return React.useContext(MKContext);
}

// Test helper — exposes the raw context so tests can assert default behaviour.
export const __MKContext = MKContext;
