// CAR-242: React context exposing the security state to the renderer.
//
// `useMK()` returns a `{ enabled, locked, lockedUntil, methods, unlockPin,
// lockNow, working }` snapshot. The provider listens for
// `security:state-changed` events from main and re-fetches getState() on
// boot.
//
// MK never lives in the renderer — `unlockPin(pin)` ships the PIN to main,
// main runs the KDF + unwrap, and only `{ success }` (plus optional error
// codes / lockedUntil) come back.

import React from 'react';

const MKContext = React.createContext({
  enabled: false,
  locked: false,
  lockedUntil: null,
  methods: [],
  working: false,
  // No-op fallbacks for callers that mount outside a provider (browser
  // preview without ledgerSecurity, tests, etc.).
  unlockPin: async () => ({ success: false, error: 'NO_BRIDGE' }),
  lockNow: async () => ({ ok: false }),
});

const DEFAULT_STATE = Object.freeze({
  enabled: false,
  locked: false,
  lockedUntil: null,
  methods: [],
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
        if (!cancelled && next) setState(next);
      } catch {
        // Bridge call failed (e.g. main not ready yet); leave default.
      }
    })();

    const unsubscribe = securityBridge.onStateChanged?.(next => {
      if (!cancelled && next) setState(next);
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [securityBridge]);

  const unlockPin = React.useCallback(async pin => {
    if (!securityBridge) return { success: false, error: 'NO_BRIDGE' };
    setWorking(true);
    try {
      const result = await securityBridge.unlockPin(pin);
      // Don't set state here — main emits `security:state-changed` which
      // our listener picks up. That keeps the source of truth in main.
      return result;
    } finally {
      setWorking(false);
    }
  }, [securityBridge]);

  const lockNow = React.useCallback(async () => {
    if (!securityBridge) return { ok: false };
    return securityBridge.lockNow();
  }, [securityBridge]);

  const value = React.useMemo(() => ({
    enabled: state.enabled,
    locked: state.locked,
    lockedUntil: state.lockedUntil,
    methods: state.methods,
    working,
    unlockPin,
    lockNow,
  }), [state, working, unlockPin, lockNow]);

  return <MKContext.Provider value={value}>{children}</MKContext.Provider>;
}

export function useMK() {
  return React.useContext(MKContext);
}

// Test helper — exposes the raw context so tests can assert default behaviour.
export const __MKContext = MKContext;
