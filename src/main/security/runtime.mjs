// CAR-242: Main-process runtime for the security feature.
//
// Owns the in-memory MK lifecycle (single source of truth — never crosses
// contextBridge to the renderer) and the persisted security-config file
// (`ledger-security.json` in <userData> on Electron, or a localStorage-backed
// shim in browser-preview tests).
//
// All persistence flows through the injected `io` object so this module is
// trivially testable and runtime-agnostic. The Electron boot wiring
// (`src/main/index.js`) supplies a real fs-backed `io`; tests pass an
// in-memory stub.

import { unwrapMasterKey } from './wrappers.mjs';
import {
  initialRateLimit,
  recordFailure as rlRecordFailure,
  recordSuccess as rlRecordSuccess,
  policyForMethod,
  canAttempt,
} from './rateLimit.mjs';

/**
 * @typedef {Object} SecurityIO
 * @property {() => Promise<object|null>} readSecurity
 * @property {(cfg: object) => Promise<void>} writeSecurity
 */

/**
 * Build a fresh runtime instance. The runtime is stateful (holds MK in a
 * closure) so callers should construct one per app instance.
 */
export function createRuntime({ io, now = () => Date.now() }) {
  if (!io || typeof io.readSecurity !== 'function' || typeof io.writeSecurity !== 'function') {
    throw new Error('createRuntime requires io.{readSecurity, writeSecurity}');
  }

  // MK lives only here. Never returned, never logged. `clearMk()` zeroes it.
  let mk = null;
  let cachedConfig = null;

  /** Load (and cache) the security config from disk. */
  async function loadConfig() {
    cachedConfig = await io.readSecurity();
    return cachedConfig;
  }

  function getConfig() {
    return cachedConfig;
  }

  function isEnabled() {
    return !!(cachedConfig && cachedConfig.enabled === true);
  }

  function isLocked() {
    if (!isEnabled()) return false;
    return mk === null;
  }

  function getMk() {
    return mk;
  }

  function setMk(next) {
    if (!(next instanceof Uint8Array) || next.length !== 32) {
      throw new Error('setMk requires a 32-byte Uint8Array');
    }
    mk = next;
  }

  function clearMk() {
    if (mk) {
      try { mk.fill(0); } catch { /* immutable views — ignore */ }
    }
    mk = null;
  }

  /** Look up the current `lockedUntil` ISO timestamp for a method, if any. */
  function getLockedUntil(methodName = 'pin') {
    if (!cachedConfig || !cachedConfig.methods || !cachedConfig.methods[methodName]) return null;
    const rl = cachedConfig.methods[methodName].rateLimit;
    return rl ? rl.lockedUntil : null;
  }

  /**
   * Persist a failure for the given method. Returns the new rate-limit state
   * so callers can surface `lockedUntil` to the renderer in one shot.
   */
  async function recordFailure(methodName) {
    if (!cachedConfig || !cachedConfig.methods || !cachedConfig.methods[methodName]) {
      throw new Error(`unknown method: ${methodName}`);
    }
    const policy = policyForMethod(methodName);
    const prev = cachedConfig.methods[methodName].rateLimit || initialRateLimit();
    const { state: nextRl, autoDisable } = rlRecordFailure(prev, policy, now());
    const nextMethods = {
      ...cachedConfig.methods,
      [methodName]: {
        ...cachedConfig.methods[methodName],
        rateLimit: nextRl,
        // R8 / I7: persist auto-disable so the method is gone on next boot.
        ...(autoDisable ? { enabled: false } : {}),
      },
    };
    cachedConfig = { ...cachedConfig, methods: nextMethods };
    await io.writeSecurity(cachedConfig);
    return { rateLimit: nextRl, autoDisabled: autoDisable };
  }

  /** Reset failures + clear lockedUntil for the given method (R3 step 5). */
  async function recordSuccess(methodName) {
    if (!cachedConfig || !cachedConfig.methods || !cachedConfig.methods[methodName]) {
      throw new Error(`unknown method: ${methodName}`);
    }
    const nextMethods = {
      ...cachedConfig.methods,
      [methodName]: {
        ...cachedConfig.methods[methodName],
        rateLimit: rlRecordSuccess(),
      },
    };
    cachedConfig = {
      ...cachedConfig,
      methods: nextMethods,
      lastUnlockAt: new Date(now()).toISOString(),
    };
    await io.writeSecurity(cachedConfig);
    return cachedConfig.methods[methodName].rateLimit;
  }

  /**
   * Attempt a PIN unlock. Slice 1's `unwrapMasterKey` THROWS on bad secret
   * (GCM tag mismatch) — the dispatch prompt's "returns null" note is
   * incorrect; we catch and treat any throw as a failure. Returns
   *   { success: true } on a good PIN
   *   { success: false, error, lockedUntil? } on a bad PIN
   *   { success: false, error: 'LOCKED_OUT', lockedUntil } when in backoff
   *   { success: false, error: 'METHOD_DISABLED' } when method is disabled
   */
  async function unlockPin(pin) {
    if (!isEnabled()) return { success: false, error: 'NOT_ENABLED' };
    const cfg = cachedConfig;
    const method = cfg.methods && cfg.methods.pin;
    if (!method || method.enabled === false) {
      return { success: false, error: 'METHOD_DISABLED' };
    }

    const gate = canAttempt(method.rateLimit, now());
    if (!gate.allowed) {
      return {
        success: false,
        error: 'LOCKED_OUT',
        lockedUntil: method.rateLimit?.lockedUntil || null,
        remainingMs: gate.remainingMs,
      };
    }

    let unwrapped = null;
    try {
      unwrapped = unwrapMasterKey(method.wrapper, pin);
    } catch {
      unwrapped = null;
    }
    if (!unwrapped || !(unwrapped instanceof Uint8Array) || unwrapped.length !== 32) {
      const { rateLimit, autoDisabled } = await recordFailure('pin');
      return {
        success: false,
        error: autoDisabled ? 'METHOD_AUTO_DISABLED' : 'BAD_SECRET',
        lockedUntil: rateLimit.lockedUntil,
      };
    }

    setMk(unwrapped);
    await recordSuccess('pin');
    return { success: true };
  }

  /** Build the renderer-visible state snapshot (no MK, no wrappers). */
  function getState() {
    const cfg = cachedConfig;
    if (!cfg || cfg.enabled !== true) {
      return { enabled: false, locked: false, methods: [], lockedUntil: null };
    }
    const methods = Object.entries(cfg.methods || {})
      .filter(([, m]) => m && m.enabled !== false)
      .map(([name]) => name);
    return {
      enabled: true,
      locked: mk === null,
      methods,
      lockedUntil: getLockedUntil('pin'),
    };
  }

  return {
    loadConfig,
    getConfig,
    isEnabled,
    isLocked,
    getMk,
    setMk,
    clearMk,
    getLockedUntil,
    recordFailure,
    recordSuccess,
    unlockPin,
    getState,
  };
}
