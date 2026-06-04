// CAR-243: Main-process runtime for the security feature.
//
// Owns the in-memory MK lifecycle (single source of truth - never crosses
// contextBridge to the renderer) and the persisted security-config file.
//
// Slice 2 (CAR-242) shipped PIN-only unlock via this module. Slice 3
// (CAR-243) generalises it: any method (pin, password, recovery, passkey)
// uses the same unwrap-and-rate-limit flow, and we add the
// management ops (add, remove, reveal-recovery, rotate, disable) the
// Settings UI needs.

import { unwrapMasterKey, wrapMasterKey } from './wrappers.mjs';
import { aeadEncryptString, randBytes, AEAD_AAD_STORE } from './aead.mjs';
import { generateRecoveryPhrase } from './recoveryPhrase.mjs';
import {
  initialRateLimit,
  recordFailure as rlRecordFailure,
  recordSuccess as rlRecordSuccess,
  policyForMethod,
  canAttempt,
} from './rateLimit.mjs';

// Methods we know how to derive a WK for. 'passkey' uses kdf:'raw' because
// the WK is derived in the renderer (WebAuthn PRF lives there); main only
// sees the 32 raw bytes the authenticator returned.
const KNOWN_METHODS = ['pin', 'password', 'passkey'];

function kdfForMethod(name) {
  if (name === 'pin' || name === 'password') return 'argon2id';
  if (name === 'passkey') return 'raw';
  if (name === 'recovery') return 'pbkdf2-sha256';
  throw new Error(`unknown method: ${name}`);
}


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

  function getMk() { return mk; }

  function setMk(next) {
    if (!(next instanceof Uint8Array) || next.length !== 32) {
      throw new Error('setMk requires a 32-byte Uint8Array');
    }
    mk = next;
  }

  // CAR-243 (M2): the ONLY sanctioned way to inject an MK from outside an
  // unlock is the post-setup hand-off. `setMk` stays internal (used by
  // unlockMethod) and is no longer on the public runtime surface, so a future
  // IPC handler can't call runtime.setMk(arbitraryBytes). This wrapper takes
  // the runSetupMigration output and validates its shape/provenance; returns
  // true when adopted so the caller can decide whether to warn.
  function adoptSetupMk(setupOut) {
    const candidate = setupOut && setupOut.mk;
    if (candidate instanceof Uint8Array && candidate.length === 32) {
      setMk(candidate);
      return true;
    }
    return false;
  }

  function clearMk() {
    if (mk) {
      try { mk.fill(0); } catch { /* immutable views - ignore */ }
    }
    mk = null;
  }

  function getLockedUntil(methodName = 'pin') {
    if (!cachedConfig || !cachedConfig.methods || !cachedConfig.methods[methodName]) return null;
    const rl = cachedConfig.methods[methodName].rateLimit;
    return rl ? rl.lockedUntil : null;
  }

  // Returns the soonest lockedUntil across any enabled method, in ISO format,
  // or null. Used by R8 edge-case-row-7 ("LOCKED_OUT" blocks rotate).
  function anyMethodLockedUntil() {
    if (!cachedConfig || !cachedConfig.methods) return null;
    let soonest = null;
    for (const [, m] of Object.entries(cachedConfig.methods)) {
      if (!m || m.enabled === false) continue;
      const lu = m.rateLimit && m.rateLimit.lockedUntil;
      if (!lu) continue;
      const t = Date.parse(lu);
      if (Number.isNaN(t)) continue;
      if (t > now() && (soonest === null || t < soonest)) soonest = t;
    }
    return soonest === null ? null : new Date(soonest).toISOString();
  }


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

  // CAR-243: One unlock-with-method that subsumes slice 2's `unlockPin`.
  // `secret` is a string for PIN/password/recovery; for passkey it's the raw
  // 32-byte WK the renderer derived from the WebAuthn PRF result.
  async function unlockMethod(methodName, secret) {
    if (!isEnabled()) return { success: false, error: 'NOT_ENABLED' };
    const cfg = cachedConfig;
    const isRecovery = methodName === 'recovery';
    const wrapper = isRecovery
      ? (cfg.recovery && cfg.recovery.wrapper)
      : (cfg.methods && cfg.methods[methodName] && cfg.methods[methodName].wrapper);
    const enabled = isRecovery
      ? !!wrapper
      : !!(cfg.methods && cfg.methods[methodName] && cfg.methods[methodName].enabled !== false);

    if (!wrapper || !enabled) {
      return { success: false, error: 'METHOD_DISABLED' };
    }

    // Recovery uses its own pseudo rate-limit slot in cfg.recovery.rateLimit
    // (lazy-initialised). Primary methods use cfg.methods[name].rateLimit.
    const slot = isRecovery
      ? (cfg.recovery.rateLimit || initialRateLimit())
      : (cfg.methods[methodName].rateLimit || initialRateLimit());
    const gate = canAttempt(slot, now());
    if (!gate.allowed) {
      return {
        success: false,
        error: 'LOCKED_OUT',
        lockedUntil: slot.lockedUntil || null,
        remainingMs: gate.remainingMs,
      };
    }

    let unwrapped = null;
    try {
      unwrapped = unwrapMasterKey(wrapper, secret);
    } catch {
      unwrapped = null;
    }
    if (!unwrapped || !(unwrapped instanceof Uint8Array) || unwrapped.length !== 32) {
      const failResult = await recordFailureFor(isRecovery ? 'recovery' : methodName);
      return {
        success: false,
        error: failResult.autoDisabled ? 'METHOD_AUTO_DISABLED' : 'BAD_SECRET',
        lockedUntil: failResult.rateLimit.lockedUntil,
      };
    }

    setMk(unwrapped);
    await recordSuccessFor(isRecovery ? 'recovery' : methodName);
    return { success: true };
  }

  // Recovery's rate-limit lives at cfg.recovery.rateLimit; primary methods'
  // at cfg.methods[name].rateLimit. recordFailure/recordSuccess only know
  // the latter, so route here.
  async function recordFailureFor(name) {
    if (name !== 'recovery') return recordFailure(name);
    const policy = policyForMethod('recovery');
    const prev = (cachedConfig.recovery && cachedConfig.recovery.rateLimit) || initialRateLimit();
    const { state: nextRl } = rlRecordFailure(prev, policy, now());
    cachedConfig = {
      ...cachedConfig,
      recovery: { ...cachedConfig.recovery, rateLimit: nextRl },
    };
    await io.writeSecurity(cachedConfig);
    return { rateLimit: nextRl, autoDisabled: false };
  }

  async function recordSuccessFor(name) {
    if (name !== 'recovery') return recordSuccess(name);
    cachedConfig = {
      ...cachedConfig,
      recovery: { ...cachedConfig.recovery, rateLimit: rlRecordSuccess() },
      lastUnlockAt: new Date(now()).toISOString(),
    };
    await io.writeSecurity(cachedConfig);
    return cachedConfig.recovery.rateLimit;
  }

  // Slice-2 callers passed `unlockPin(pin)` directly. Keep that name working.
  async function unlockPin(pin) { return unlockMethod('pin', pin); }
  async function unlockPassword(pw) { return unlockMethod('password', pw); }
  async function unlockPasskey(wk) { return unlockMethod('passkey', wk); }
  async function unlockRecovery(phrase) { return unlockMethod('recovery', phrase); }


  // CAR-243 / R7: add a method using the in-memory MK. Caller must already
  // be unlocked (we throw NOT_UNLOCKED otherwise). `secret` is the
  // user-typed string (PIN/password) or, for passkey, the raw 32-byte WK
  // the renderer derived from PRF.
  async function addMethod({ method, secret, kdfParams, extra }) {
    if (mk === null) {
      const err = new Error('NOT_UNLOCKED');
      err.code = 'NOT_UNLOCKED';
      throw err;
    }
    if (!KNOWN_METHODS.includes(method)) {
      const err = new Error(`unknown method: ${method}`);
      err.code = 'UNKNOWN_METHOD';
      throw err;
    }
    const kdf = kdfForMethod(method);
    const salt = kdf === 'raw' ? null : randBytes(16);
    // CAR-243: the raw passkey WK crosses contextBridge as a Uint8Array, but a
    // structured clone (or a renderer that pre-serialises) can deliver a plain
    // number[]. The IPC validator accepts number[]; coerce here so wrapMasterKey
    // (which hard-requires a 32-byte Uint8Array for kdf:'raw') and the runtime
    // stay in agreement. String secrets (argon2id) pass through untouched.
    const wkSecret = kdf === 'raw' && Array.isArray(secret)
      ? Uint8Array.from(secret)
      : secret;
    const wrapper = wrapMasterKey({
      kdf,
      secret: wkSecret,
      salt,
      mk,
      kdfParams: kdfParams || null,
    });
    const baseMethods = (cachedConfig && cachedConfig.methods) || {};
    const existing = baseMethods[method] || {};
    // CAR-243 round-2 hardening: allow-list the renderer-supplied `extra`
    // fields rather than spreading whatever shape arrives. Critical fields
    // (`enabled`, `wrapper`, `rateLimit`) are written below and would
    // override anything malicious in `extra`, but a wider allow-list keeps
    // forward-introduced config keys from leaking through this surface.
    const PASSKEY_EXTRA_KEYS = ['rpId', 'credentialId', 'salt', 'prfPath', 'userHandle'];
    const safeExtra = {};
    if (method === 'passkey' && extra && typeof extra === 'object') {
      for (const k of PASSKEY_EXTRA_KEYS) {
        if (k in extra) safeExtra[k] = extra[k];
      }
    }
    const nextMethod = {
      ...existing,
      ...safeExtra,
      enabled: true,
      wrapper,
      rateLimit: initialRateLimit(),
    };
    cachedConfig = {
      ...cachedConfig,
      methods: { ...baseMethods, [method]: nextMethod },
    };
    await io.writeSecurity(cachedConfig);
    return { ok: true };
  }

  // CAR-243 / R7 / I5: remove a method. The codec already enforces
  // last-method refusal at setup; we replicate the same rule here for
  // mid-session removals.
  async function removeMethod(method) {
    const cfg = cachedConfig;
    if (!cfg || !cfg.methods || !cfg.methods[method]) {
      return { ok: false, error: 'NOT_FOUND' };
    }
    const enabledNames = Object.entries(cfg.methods)
      .filter(([, m]) => m && m.enabled !== false)
      .map(([n]) => n);
    if (enabledNames.length === 1 && enabledNames[0] === method) {
      return { ok: false, error: 'LAST_METHOD' };
    }
    const nextMethods = { ...cfg.methods };
    delete nextMethods[method];
    cachedConfig = { ...cfg, methods: nextMethods };
    await io.writeSecurity(cachedConfig);
    return { ok: true };
  }

  // CAR-243 / R6 + I8: reveal the recovery phrase. The user re-types their
  // currently-active unlock method (NOT the cached MK from app start) -
  // we pipe through unlockMethod to validate, then decrypt the cleartext
  // phrase that was stashed under MK at setup. Returns { phrase } on
  // success.
  async function revealRecoveryPhrase({ method, secret }) {
    if (!isEnabled()) return { ok: false, error: 'NOT_ENABLED' };
    if (!cachedConfig.recovery || !cachedConfig.recovery.wrapper) {
      return { ok: false, error: 'NO_RECOVERY' };
    }
    if (!cachedConfig.recovery.phraseCipher) {
      // Legacy slice-1/2 configs didn't store phraseCipher. Surface a
      // graceful error - user can rotate to seed it.
      return { ok: false, error: 'PHRASE_NOT_STORED' };
    }
    // Re-validate the secret. unlockMethod sets `mk` if successful (which
    // is fine - the user is already unlocked, this is the re-prompt that
    // R6 mandates).
    const result = await unlockMethod(method, secret);
    if (!result.success) {
      return { ok: false, error: result.error, lockedUntil: result.lockedUntil };
    }
    try {
      // Inline import to avoid a top-level cycle with aead.mjs in older
      // bundlers; harmless under modern ESM.
      const { aeadDecryptString } = await import('./aead.mjs');
      const phrase = aeadDecryptString(cachedConfig.recovery.phraseCipher, mk, AEAD_AAD_STORE);
      return { ok: true, phrase };
    } catch {
      return { ok: false, error: 'PHRASE_DECRYPT_FAILED' };
    }
  }

  // CAR-243 / R6 + edge-case row 7: rotate the recovery phrase. Refuses
  // if any active method is mid-rate-limit (`LOCKED_OUT`).
  async function rotateRecoveryPhrase() {
    if (mk === null) {
      return { ok: false, error: 'NOT_UNLOCKED' };
    }
    const lockedUntil = anyMethodLockedUntil();
    if (lockedUntil) {
      return { ok: false, error: 'LOCKED_OUT', lockedUntil };
    }
    // Spec: phrase + fixed salt. Slice 1's recoveryPhrase module emits a
    // BIP39 12-word string; storeCodec.buildSecurityConfig used a per-call
    // salt via wrappers. We keep the same flow.
    const phrase = generateRecoveryPhrase();
    const salt = randBytes(16);
    const newWrapper = wrapMasterKey({
      kdf: 'pbkdf2-sha256',
      secret: phrase,
      salt,
      mk,
      kdfParams: null,
    });
    // I8: stash cleartext phrase encrypted under MK so the user can re-reveal
    // it from Settings later (the wrapper itself is one-way through PBKDF2).
    const phraseCipher = aeadEncryptString(phrase, mk, AEAD_AAD_STORE);
    cachedConfig = {
      ...cachedConfig,
      recovery: {
        wrapper: newWrapper,
        phraseCipher,
        rateLimit: initialRateLimit(),
      },
    };
    await io.writeSecurity(cachedConfig);
    return { ok: true, phrase };
  }


  // CAR-243 / R7 final paragraph: turn security off entirely. Caller must
  // already be unlocked. Decrypts the encrypted store back to plaintext via
  // the injected `disableIo` (slice 2's diskStoreEncrypted owns that path
  // on Electron; in tests we stub it). Wrappers are dropped, the security
  // file is wiped, and we transition to today's plaintext behaviour.
  //
  // CAR-243 round-3 hardening (C2): the disable path is split into two
  // phases so a partial failure can never leave plaintext on disk *next
  // to* a still-present encrypted store / security config. Phase 1
  // (`stagePlaintext`) writes plaintext to a `.tmp` sibling without
  // touching the live `ledger-state.json`. Phase 2 (`wipeSecurity`)
  // unlinks the encrypted store and the security config. Phase 3
  // (`commitPlaintext`) renames the staged file into place. If phase 2
  // throws, we DO NOT commit the plaintext — the user retains an
  // encrypted store and we surface the error. If phase 3 throws after
  // phase 2 succeeded, the user has neither plaintext nor encrypted
  // data; the `.tmp` is left in place so the next boot can repair via
  // STORE_INCONSISTENT. clearMk() always runs in finally.
  async function disableSecurity({ disableIo }) {
    if (mk === null) return { ok: false, error: 'NOT_UNLOCKED' };
    try {
      // Phase 1: stage plaintext to .tmp (no rename yet).
      let staged = false;
      if (disableIo && typeof disableIo.stagePlaintext === 'function') {
        await disableIo.stagePlaintext(mk);
        staged = true;
      } else if (disableIo && typeof disableIo.decryptToPlaintext === 'function') {
        // Backward-compat path for callers (mostly tests) that haven't been
        // migrated to the staged shape. Tests mock decryptToPlaintext as a
        // no-op spy; production wires both stagePlaintext + commitPlaintext.
        await disableIo.decryptToPlaintext(mk);
      }
      // Phase 2: drop wrappers + remove encrypted store + security file.
      // If this throws, we explicitly discard the staged plaintext via
      // disableIo.discardStagedPlaintext (CAR-243 round-4) so the `.tmp`
      // doesn't linger as plaintext-on-disk. The user retains their
      // encrypted store and is asked to retry. The worst outcome is
      // "disable failed, security still on" — never "disabled with
      // plaintext leaked alongside ciphertext" and never "leftover .tmp".
      if (disableIo && typeof disableIo.wipeSecurity === 'function') {
        try {
          await disableIo.wipeSecurity();
        } catch (wipeErr) {
          if (staged && disableIo && typeof disableIo.discardStagedPlaintext === 'function') {
            try { await disableIo.discardStagedPlaintext(); } catch { /* best effort */ }
          }
          throw wipeErr;
        }
      }
      // Phase 3: atomically rename the staged plaintext into place.
      if (staged && disableIo && typeof disableIo.commitPlaintext === 'function') {
        await disableIo.commitPlaintext();
      }
      cachedConfig = { enabled: false };
      if (io && typeof io.writeSecurity === 'function') {
        try { await io.writeSecurity(cachedConfig); } catch { /* file already gone is fine */ }
      }
      return { ok: true };
    } finally {
      clearMk();
    }
  }

  // CAR-243 / I9: advanced-toggle for OS escrow. Browser path forces this
  // false at boot; the renderer hides the toggle entirely there.
  async function setOsEscrowEnabled(enabled) {
    if (!cachedConfig) return { ok: false, error: 'NOT_ENABLED' };
    cachedConfig = {
      ...cachedConfig,
      osEscrow: {
        ...(cachedConfig.osEscrow || { wrapper: null }),
        enabled: !!enabled,
      },
    };
    await io.writeSecurity(cachedConfig);
    return { ok: true };
  }

  // CAR-244 / I10: persist the idle auto-lock timeout. `0` means "never".
  // Non-numeric / negative values collapse to 0 so a corrupt input can never
  // produce a runaway or instant lock. The renderer idle controller reads
  // this back via getState().idleLockMs.
  async function setIdleLockMs(value) {
    if (!cachedConfig) return { ok: false, error: 'NOT_ENABLED' };
    const ms = (typeof value === 'number' && Number.isFinite(value) && value > 0)
      ? Math.floor(value)
      : 0;
    cachedConfig = { ...cachedConfig, idleLockMs: ms };
    await io.writeSecurity(cachedConfig);
    return { ok: true, idleLockMs: ms };
  }

  // R3 step 2 + edge-case row 4: list methods the *current origin* can
  // actually use. Browser path filters out passkey if the stored RP ID
  // doesn't match the served origin (METHOD_UNAVAILABLE_ON_ORIGIN). Main
  // process always reports all enabled methods - the renderer applies the
  // origin filter where it has access to `window.location`.
  function getState() {
    const cfg = cachedConfig;
    if (!cfg || cfg.enabled !== true) {
      return { enabled: false, locked: false, methods: [], lockedUntil: null };
    }
    const methods = Object.entries(cfg.methods || {})
      .filter(([, m]) => m && m.enabled !== false)
      .map(([name, m]) => ({
        name,
        // Surface whatever a renderer-side origin filter needs to decide
        // whether the method is usable in this context. Public fields
        // only - never wrappers.
        rpId: m.rpId || null,
        lockedUntil: (m.rateLimit && m.rateLimit.lockedUntil) || null,
        failures: (m.rateLimit && m.rateLimit.failures) || 0,
        // CAR-243: passkey replay metadata. These are public, non-secret
        // identifiers (NOT key material — the wrapper stays in the config and
        // never leaves main) that the lock screen needs to reconstruct the
        // WebAuthn PRF ceremony via getPasskeyWk. Without them, passkey
        // unlock from the lock screen can't derive the WK. Only emitted for
        // passkey so other methods keep their lean shape.
        ...(name === 'passkey'
          ? {
            credentialId: m.credentialId ?? null,
            salt: m.salt ?? null,
            prfPath: m.prfPath ?? null,
            userHandle: m.userHandle ?? null,
          }
          : {}),
      }));
    const hasRecovery = !!(cfg.recovery && cfg.recovery.wrapper);
    return {
      enabled: true,
      locked: mk === null,
      // Backward-compat: slice-2 callers expected `methods` as a string
      // array. Keep that shape; new richer info goes on `methodsDetail`.
      methods: methods.map(m => m.name),
      methodsDetail: methods,
      hasRecovery,
      // Soonest lockedUntil across enabled methods (so the lock screen
      // can render a single countdown without picking a method first).
      lockedUntil: anyMethodLockedUntil(),
      osEscrow: !!(cfg.osEscrow && cfg.osEscrow.enabled),
      idleLockMs: typeof cfg.idleLockMs === 'number' ? cfg.idleLockMs : 300_000,
    };
  }

  return {
    loadConfig,
    getConfig,
    isEnabled,
    isLocked,
    getMk,
    adoptSetupMk,
    clearMk,
    getLockedUntil,
    recordFailure,
    recordSuccess,
    unlockPin,
    unlockPassword,
    unlockPasskey,
    unlockRecovery,
    unlockMethod,
    addMethod,
    removeMethod,
    revealRecoveryPhrase,
    rotateRecoveryPhrase,
    disableSecurity,
    setOsEscrowEnabled,
    setIdleLockMs,
    getState,
  };
}
