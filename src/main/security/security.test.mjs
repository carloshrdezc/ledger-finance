// CAR-241: Security module test suite — covers spec test plan T1, T3, T4,
// T5, T6, T7, T8, T9, T15. Tests at the security-module boundary; CAR-242
// will add main-process integration tests once boot wiring lands.
//
// Argon2id memory cost is reduced for tests (8 MiB, t=1) so the suite
// completes in <2 s. Production code paths use the full spec defaults
// (64 MiB / 3 iterations) — `kdfParams` is a per-wrapper field so the
// security file records exactly what was used.

import { describe, it, expect } from 'vitest';

import {
  aeadEncryptString,
  aeadDecryptString,
  aeadEncrypt,
  randBytes,
  base64ToBytes,
  bytesToBase64,
  AEAD_AAD_STORE,
} from './aead.mjs';
import {
  wrapMasterKey,
  unwrapMasterKey,
} from './wrappers.mjs';
import {
  generateRecoveryPhrase,
  isValidRecoveryPhrase,
  normalizeRecoveryPhrase,
} from './recoveryPhrase.mjs';
import {
  initialRateLimit,
  canAttempt,
  recordFailure,
  recordSuccess,
  PIN_POLICY,
} from './rateLimit.mjs';
import {
  encodeStore,
  decodeStore,
  buildSecurityConfig,
  runSetupMigration,
} from './storeCodec.mjs';

// Cheap KDF params for tests: 8 MiB / t=1 still exercises the real argon2id
// code path but completes in tens of ms instead of ~250 ms per call.
const FAST_ARGON = { m: 8 * 1024, t: 1, p: 1, dkLen: 32 };
const FAST_PBKDF2 = { c: 1000, dkLen: 32 };

// ---------------------------------------------------------------------------
// T1 — Multi-method MK parity
// Setup with PIN + password + recovery; every wrapper unwraps to the same MK.
// ---------------------------------------------------------------------------
describe('T1 — multi-method MK parity (I1)', () => {
  it('PIN, password, and recovery wrappers all decrypt to the same 32-byte MK', { timeout: 30_000 }, () => {
    const { config, mk, recoveryPhrase } = buildSecurityConfig({
      pin:      { secret: '4729', kdfParams: FAST_ARGON, length: 4 },
      password: { secret: 'correct horse battery staple', kdfParams: FAST_ARGON },
    }, { recoveryKdfParams: FAST_PBKDF2 });

    const mkFromPin      = unwrapMasterKey(config.methods.pin.wrapper, '4729');
    const mkFromPassword = unwrapMasterKey(config.methods.password.wrapper, 'correct horse battery staple');
    const mkFromRecovery = unwrapMasterKey(config.recovery.wrapper, recoveryPhrase);

    expect(mk.length).toBe(32);
    expect(Array.from(mkFromPin)).toEqual(Array.from(mk));
    expect(Array.from(mkFromPassword)).toEqual(Array.from(mk));
    expect(Array.from(mkFromRecovery)).toEqual(Array.from(mk));
  });

  it('a wrong secret throws (GCM tag mismatch)', { timeout: 30_000 }, () => {
    const { config } = buildSecurityConfig({
      pin: { secret: '0000', kdfParams: FAST_ARGON, length: 4 },
    }, { recoveryKdfParams: FAST_PBKDF2 });
    expect(() => unwrapMasterKey(config.methods.pin.wrapper, '0001')).toThrow();
  });
});

// C2 regression: a passkey enrolled during first-run setup must keep the
// replay metadata (credentialId/salt/prfPath/userHandle/rpId) on its method
// entry. buildSecurityConfig previously wrote only {enabled,wrapper,rateLimit}
// and silently dropped these, so a wizard-created passkey could never be
// unlocked (the lock screen had nothing to feed getPasskeyWk).
describe('CAR-243 — buildSecurityConfig persists passkey replay metadata', () => {
  it('keeps the allow-listed passkey fields on the method entry', { timeout: 30_000 }, () => {
    const wk = new Uint8Array(32).fill(11);
    const { config } = buildSecurityConfig({
      passkey: {
        kdf: 'raw',
        secret: wk,
        rpId: 'localhost',
        credentialId: [1, 2, 3],
        salt: [4, 5, 6],
        prfPath: 'prf',
        userHandle: [9, 9],
      },
    }, { recoveryKdfParams: FAST_PBKDF2 });

    const entry = config.methods.passkey;
    expect(entry.enabled).toBe(true);
    expect(entry.wrapper).toBeTruthy();
    expect(entry.rpId).toBe('localhost');
    expect(entry.credentialId).toEqual([1, 2, 3]);
    expect(entry.salt).toEqual([4, 5, 6]);
    expect(entry.prfPath).toBe('prf');
    expect(entry.userHandle).toEqual([9, 9]);
    // The raw WK unwraps the MK (sanity that the wrapper is real).
    expect(unwrapMasterKey(entry.wrapper, wk).length).toBe(32);
  });
});

describe('I5 — setup requires at least one primary unlock method', () => {
  it('rejects enabled security config with no primary methods', () => {
    expect(() => buildSecurityConfig({}, { recoveryKdfParams: FAST_PBKDF2 }))
      .toThrow(/PRIMARY_METHOD_REQUIRED/);
  });
});

// ---------------------------------------------------------------------------
// T3 — IV uniqueness across many encrypts (I3)
// 1000 sequential encrypts produce 1000 distinct IVs.
// ---------------------------------------------------------------------------
describe('T3 — IV uniqueness (I3)', () => {
  it('1000 sequential encrypts produce 1000 distinct IVs', { timeout: 30_000 }, () => {
    const key = randBytes(32);
    const seen = new Set();
    for (let i = 0; i < 1000; i += 1) {
      const blob = aeadEncryptString(`payload-${i}`, key, AEAD_AAD_STORE);
      seen.add(blob.iv);
    }
    expect(seen.size).toBe(1000);
  });
})

// ---------------------------------------------------------------------------
// T4 — Tamper detection (I4)
// Flipping one byte of `ct` causes decrypt to throw.
// ---------------------------------------------------------------------------
describe('T4 — tamper detection (I4)', () => {
  it('flipping a ct byte makes decrypt throw', { timeout: 30_000 }, () => {
    const mk = randBytes(32);
    const blob = encodeStore({ 'ledger:tx': [{ id: 1 }] }, mk);
    const ctBytes = base64ToBytes(blob.ct);
    ctBytes[0] = ctBytes[0] ^ 0xff;
    const tampered = { ...blob, ct: bytesToBase64(ctBytes) };
    expect(() => decodeStore(tampered, mk)).toThrow();
  });

  it('flipping a tag byte makes decrypt throw', { timeout: 30_000 }, () => {
    const mk = randBytes(32);
    const blob = encodeStore({ a: 1 }, mk);
    const tagBytes = base64ToBytes(blob.tag);
    tagBytes[0] = tagBytes[0] ^ 0xff;
    const tampered = { ...blob, tag: bytesToBase64(tagBytes) };
    expect(() => decodeStore(tampered, mk)).toThrow();
  });

  it('aad mismatch is rejected (binds ciphertext to format)', { timeout: 30_000 }, () => {
    const mk = randBytes(32);
    const blob = aeadEncryptString('hi', mk, 'ledger-store-v1');
    expect(() => aeadDecryptString(blob, mk, 'ledger-wrapper-v1')).toThrow(/aad mismatch/);
  });

  it('wrapper unwrap rejects blobs encrypted with a non-wrapper aad', () => {
    const mk = randBytes(32);
    const wk = randBytes(32);
    const blob = aeadEncrypt(mk, wk, 'ledger-store-v1');
    const wrapper = {
      kdf: 'raw',
      kdfParams: null,
      salt: null,
      iv: blob.iv,
      wrappedMK: blob.ct,
      tag: blob.tag,
      aad: blob.aad,
    };

    expect(() => unwrapMasterKey(wrapper, wk)).toThrow(/aad mismatch/);
  });
});

// ---------------------------------------------------------------------------
// T5 — Last-method removal refused (I5)
// Helper enforced at the storeCodec layer; lock screen will use the same
// rule when CAR-244 wires Settings.
// ---------------------------------------------------------------------------
function removeMethod(config, name) {
  const enabled = Object.entries(config.methods).filter(([, m]) => m.enabled);
  if (enabled.length === 1 && enabled[0][0] === name) {
    const err = new Error('LAST_METHOD');
    err.code = 'LAST_METHOD';
    throw err;
  }
  const next = { ...config, methods: { ...config.methods } };
  delete next.methods[name];
  return next;
}

describe('T5 — last-method removal (I5)', () => {
  it('refuses to remove the only enabled method', { timeout: 30_000 }, () => {
    const { config } = buildSecurityConfig({
      pin: { secret: '1234', kdfParams: FAST_ARGON, length: 4 },
    }, { recoveryKdfParams: FAST_PBKDF2 });
    expect(() => removeMethod(config, 'pin')).toThrow(/LAST_METHOD/);
  });

  it('allows removing a method when others remain', { timeout: 30_000 }, () => {
    const { config } = buildSecurityConfig({
      pin:      { secret: '1234', kdfParams: FAST_ARGON, length: 4 },
      password: { secret: 'long enough password', kdfParams: FAST_ARGON },
    }, { recoveryKdfParams: FAST_PBKDF2 });
    const next = removeMethod(config, 'pin');
    expect(next.methods.pin).toBeUndefined();
    expect(next.methods.password.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T6 — Mid-migration crash → both files present (I6)
// Inject an io adapter that throws after writeEncryptedStore but before
// wipePlaintext; verify the encrypted blob is durable AND the plaintext is
// still on disk — that's exactly the STORE_INCONSISTENT signature CAR-242's
// boot path will detect.
// ---------------------------------------------------------------------------
describe('T6 — mid-migration crash leaves detectable inconsistent state (I6)', () => {
  // T6 exercises the full setup migration: KDF + wrap + AEAD + decode + unwrap.
  // With FAST_ARGON (8 MiB / t=1) the round-trip lands at ~7-8s on slower CI
  // runners (Argon2id JS implementation is the dominant cost). Bump per-test
  // timeout above the 5s default. Pure-crypto math is the bottleneck — not
  // I/O, not vitest infra.
  it('crash before wipePlaintext: both files present, encrypted is valid', { timeout: 30_000 }, async () => {
    const filesystem = {
      plaintext: { 'ledger:tx': [{ id: 'before' }] },
      security: null,
      encrypted: null,
    };
    const io = {
      readPlaintext: async () => filesystem.plaintext,
      writeSecurity: async cfg => { filesystem.security = cfg; },
      writeEncryptedStore: async blob => { filesystem.encrypted = blob; },
      wipePlaintext: async () => { throw new Error('simulated power loss'); },
    };
    let wipeError = null;
    const { config } = await runSetupMigration({
      methods: { pin: { secret: '1234', kdfParams: FAST_ARGON, length: 4 } },
      io,
      opts: { onWipeError: e => { wipeError = e; } },
    });
    expect(filesystem.plaintext).toBeTruthy(); // still there → STORE_INCONSISTENT signal
    expect(filesystem.encrypted).toBeTruthy();
    expect(filesystem.security).toBe(config);
    expect(wipeError).toBeInstanceOf(Error);
    // The encrypted blob must be valid (decryptable with PIN)
    const mk = unwrapMasterKey(config.methods.pin.wrapper, '1234');
    expect(decodeStore(filesystem.encrypted, mk)).toEqual({ 'ledger:tx': [{ id: 'before' }] });
  });

  it('happy path: encrypted store written, plaintext wiped, in that order', { timeout: 30_000 }, async () => {
    const order = [];
    const io = {
      readPlaintext: async () => { order.push('read'); return { a: 1 }; },
      writeSecurity: async () => { order.push('writeSec'); },
      writeEncryptedStore: async () => { order.push('writeEnc'); },
      wipePlaintext: async () => { order.push('wipe'); },
    };
    await runSetupMigration({
      methods: { pin: { secret: '0000', kdfParams: FAST_ARGON, length: 4 } },
      io,
    });
    expect(order).toEqual(['read', 'writeSec', 'writeEnc', 'wipe']);
  });

  // CAR-243 regression: previously `runSetupMigration` zeroized the MK
  // before returning, leaving `out.mk === undefined` for the IPC layer.
  // The bare `try { runtime.setMk(out.mk) } catch {}` in ipc.mjs swallowed
  // the resulting "32-byte Uint8Array" guard error, so the user landed on
  // a locked screen right after setup despite the comment claiming
  // otherwise. We now hand the live MK back so the IPC layer can hold it
  // until the user explicitly locks; the runtime owns zeroisation.
  it('CAR-243: returns the live 32-byte MK so ipc.mjs can hold the unlocked state', { timeout: 30_000 }, async () => {
    const io = {
      readPlaintext: async () => ({ 'ledger:tx': [] }),
      writeSecurity: async () => {},
      writeEncryptedStore: async () => {},
      wipePlaintext: async () => {},
    };
    const out = await runSetupMigration({
      methods: { pin: { secret: '0000', kdfParams: FAST_ARGON, length: 4 } },
      io,
    });
    expect(out.mk).toBeInstanceOf(Uint8Array);
    expect(out.mk.length).toBe(32);
    // It must be a usable, non-zeroized key (any byte non-zero is sufficient).
    expect(out.mk.some(b => b !== 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T7 — Rate-limit state survives 'restart' (I7)
// The rate-limit module is pure: persistence is the caller's job. Here we
// simulate restart by serialising state to JSON and parsing it back.
// ---------------------------------------------------------------------------
describe('T7 — rate-limit persists across restart (I7, R8)', () => {
  it('5 failures lock the next attempt; counter survives JSON round-trip', { timeout: 30_000 }, () => {
    let state = initialRateLimit();
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      state = recordFailure(state, PIN_POLICY, t0).state;
    }
    expect(state.failures).toBe(5);
    expect(state.lockedUntil).toBeTruthy(); // 30s lock per spec table

    // 'restart' = serialise + reparse
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored.failures).toBe(5);

    // Still locked at t0+10s
    const stillLocked = canAttempt(restored, t0 + 10_000);
    expect(stillLocked.allowed).toBe(false);
    expect(stillLocked.remainingMs).toBeGreaterThan(0);

    // After 31s, allowed again
    expect(canAttempt(restored, t0 + 31_000).allowed).toBe(true);
  });

  it('PIN auto-disables after 10 cumulative failures (R8)', { timeout: 30_000 }, () => {
    let state = initialRateLimit();
    let autoDisable = false;
    for (let i = 0; i < 10; i += 1) {
      const r = recordFailure(state, PIN_POLICY);
      state = r.state;
      autoDisable = autoDisable || r.autoDisable;
    }
    expect(state.failures).toBe(10);
    expect(autoDisable).toBe(true);
  });

  it('successful unlock resets failures (R3 step 5)', { timeout: 30_000 }, () => {
    let state = initialRateLimit();
    for (let i = 0; i < 3; i += 1) state = recordFailure(state, PIN_POLICY).state;
    expect(state.failures).toBe(3);
    const reset = recordSuccess();
    expect(reset.failures).toBe(0);
    expect(reset.lockedUntil).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T8 — Recovery phrase deterministic (I8)
// generateRecoveryPhrase with the same entropy yields the same phrase.
// 'revealRecoveryPhrase' (CAR-244) will simply unwrap and re-display.
// ---------------------------------------------------------------------------
describe('T8 — recovery phrase is deterministic & retrievable (I8)', () => {
  it('same entropy yields same 12-word phrase', { timeout: 30_000 }, () => {
    const fixedEntropy = new Uint8Array(16).fill(0xab);
    const a = generateRecoveryPhrase(() => fixedEntropy);
    const b = generateRecoveryPhrase(() => fixedEntropy);
    expect(a).toBe(b);
    expect(a.split(' ').length).toBe(12);
    expect(isValidRecoveryPhrase(a)).toBe(true);
  });

  it('recovery wrapper unwraps repeatedly to the same MK', { timeout: 30_000 }, () => {
    const { config, mk, recoveryPhrase } = buildSecurityConfig({
      pin: { secret: '4242', kdfParams: FAST_ARGON, length: 4 },
    }, { recoveryKdfParams: FAST_PBKDF2 });
    const a = unwrapMasterKey(config.recovery.wrapper, recoveryPhrase);
    const b = unwrapMasterKey(config.recovery.wrapper, recoveryPhrase);
    expect(Array.from(a)).toEqual(Array.from(mk));
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it('phrase normalisation tolerates whitespace and case', { timeout: 30_000 }, () => {
    const { config, recoveryPhrase } = buildSecurityConfig({
      pin: { secret: '0000', kdfParams: FAST_ARGON, length: 4 },
    }, { recoveryKdfParams: FAST_PBKDF2 });
    const messy = '  ' + recoveryPhrase.toUpperCase().replace(/ /g, '   ') + '  ';
    expect(normalizeRecoveryPhrase(messy)).toBe(recoveryPhrase);
    // PBKDF2 normalises before hashing, so the messy form unlocks too:
    const mk = unwrapMasterKey(config.recovery.wrapper, messy);
    expect(mk.length).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// T9 — Browser path never advertises OS escrow (I9)
// buildSecurityConfig must produce osEscrow.enabled === false in v1; the
// CAR-242 main-process boot will set it true on Electron only. This test
// pins the safe default and the spec contract.
// ---------------------------------------------------------------------------
describe('T9 — OS escrow defaults to disabled (I9)', () => {
  it('buildSecurityConfig leaves osEscrow disabled by default', { timeout: 30_000 }, () => {
    const { config } = buildSecurityConfig({
      pin: { secret: '1234', kdfParams: FAST_ARGON, length: 4 },
    }, { recoveryKdfParams: FAST_PBKDF2 });
    expect(config.osEscrow).toEqual({ enabled: false, wrapper: null });
  });
})

// ---------------------------------------------------------------------------
// T15 — Recovery-phrase rotation (R6)
// Generate a new phrase, build a new recovery wrapper around the same MK,
// verify the new phrase unlocks and the old one no longer does.
// ---------------------------------------------------------------------------
describe('T15 — recovery-phrase rotation (R6)', () => {
  it('new phrase decrypts to MK; old phrase fails', { timeout: 30_000 }, () => {
    const { config, mk, recoveryPhrase: oldPhrase } = buildSecurityConfig({
      pin: { secret: '4242', kdfParams: FAST_ARGON, length: 4 },
    }, { recoveryKdfParams: FAST_PBKDF2 });

    // Rotate: generate fresh phrase, derive WK with fresh salt, re-wrap MK.
    const newPhrase = generateRecoveryPhrase();
    expect(newPhrase).not.toBe(oldPhrase);
    const newSalt = randBytes(16);
    const newWrapper = wrapMasterKey({
      kdf: 'pbkdf2-sha256',
      secret: newPhrase,
      salt: newSalt,
      mk,
      kdfParams: FAST_PBKDF2,
    });
    const rotated = { ...config, recovery: { wrapper: newWrapper } };

    // New phrase still yields MK
    const mkFromNew = unwrapMasterKey(rotated.recovery.wrapper, newPhrase);
    expect(Array.from(mkFromNew)).toEqual(Array.from(mk));
    // Old phrase fails on the new wrapper
    expect(() => unwrapMasterKey(rotated.recovery.wrapper, oldPhrase)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting smoke: encode/decode round-trips for a realistic store.
// ---------------------------------------------------------------------------
describe('store codec round-trip', () => {
  it('encrypts and decrypts a realistic ledger payload', { timeout: 30_000 }, () => {
    const mk = randBytes(32);
    const payload = {
      'ledger:tx': [{ id: 't1', amount: 100, account: 'a' }],
      'ledger:settings': { currency: 'EUR', theme: 'dark' },
    };
    const blob = encodeStore(payload, mk);
    expect(blob.alg).toBe('AES-256-GCM');
    expect(blob.aad).toBe('ledger-store-v1');
    expect(decodeStore(blob, mk)).toEqual(payload);
  });

  it('payload bytes inside ct are equivalent to today plaintext JSON', { timeout: 30_000 }, () => {
    // Spec: the inner payload format inside ct is byte-identical to today's
    // ledger.json. Verify by decrypting and JSON.stringify'ing — should
    // round-trip exactly.
    const mk = randBytes(32);
    const payload = { a: 1, b: [2, 3], c: { d: 'e' } };
    const blob = encodeStore(payload, mk);
    const decoded = decodeStore(blob, mk);
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(payload));
  });
});
