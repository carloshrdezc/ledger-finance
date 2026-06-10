// CAR-244 (slice 4): renderer idle auto-lock guard.
//
// Mounts the pure-logic idle controller (idleLock.mjs) and binds it to the
// real DOM. While security is enabled and unlocked, it arms a timer for
// `idleLockMs` and calls the security bridge's `lockNow()` when the user
// goes idle (spec R5 / Example F). On lock, main clears the MK and emits a
// state change; the store's lock-gate then routes `useLS` through the
// sentinel and renders <LockScreen>. We do NOT wipe React state here — the
// lock is UI-level (spec R4).
//
// Triggers, per spec:
//   - inactivity timer (keydown/mousemove/touchstart/pointerdown/focus reset it)
//   - browser: document.visibilitychange — tab hidden > idleLockMs locks
//   - Electron + browser: window blur — re-checked against idleLockMs on return
//
// `idleLockMs === 0` ⇒ never auto-lock (I10): the controller stays disarmed,
// but we still bind visibility/blur so a *future* config change re-arms it.

import React from 'react';

import { useMK } from './useMK';
import { createIdleController, IDLE_ACTIVITY_EVENTS } from './idleLock.mjs';

export function IdleLockGuard() {
  const { enabled, locked, idleLockMs, lockNow } = useMK();

  // Keep the latest lockNow in a ref so the controller's onIdle always calls
  // through to the current bridge action without re-creating the controller.
  const lockNowRef = React.useRef(lockNow);
  React.useEffect(() => { lockNowRef.current = lockNow; }, [lockNow]);

  // The controller is created once; we feed it config changes via setIdleLockMs.
  const controllerRef = React.useRef(null);

  // Only run while security is enabled and currently unlocked. When locked,
  // the lock screen owns the surface and there's nothing to auto-lock.
  const active = !!enabled && !locked;

  React.useEffect(() => {
    if (!active) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const controller = createIdleController({
      onIdle: () => {
        const fn = lockNowRef.current;
        if (typeof fn === 'function') void fn();
      },
      idleLockMs: idleLockMs || 0,
    });
    controllerRef.current = controller;
    controller.start();

    const onActivity = () => controller.noteActivity();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') controller.noteHidden();
      else controller.noteVisible();
    };
    const onBlur = () => controller.noteHidden();
    const onFocus = () => controller.noteVisible();

    for (const ev of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      for (const ev of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      controller.stop();
      controllerRef.current = null;
    };
    // Re-create only when activation flips; timeout changes are pushed below.
  }, [active]);

  // Push live idleLockMs changes (Settings preset) into the running controller
  // without tearing down its listeners.
  React.useEffect(() => {
    const c = controllerRef.current;
    if (c) c.setIdleLockMs(idleLockMs || 0);
  }, [idleLockMs]);

  return null;
}
