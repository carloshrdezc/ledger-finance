// CAR-241: Encrypted store codec + setup migration.
//
// Two responsibilities:
//   1. Encode/decode the encrypted store blob (AEAD over JSON.stringify of
//      the existing plaintext payload — byte-identical inner shape, just
//      wrapped). Spec §"On-disk format".
//   2. The one-time setup migration: read existing plaintext, generate MK,
//      build wrappers, write encrypted blob + security file, best-effort
//      wipe the plaintext. Spec §"Worked examples → A" + Invariant I6.
//
// I/O shape: this module is *injected* with read/write/wipe primitives so
// the same code runs on Electron (real fs) and browser (localStorage adapter
// in a later slice) and tests can stub the boundary cleanly. The caller —
// CAR-242's main-process boot logic — supplies the adapters.

import {
  aeadEncryptString,
  aeadDecryptString,
  bytesToBase64,
  base64ToBytes,
  randBytes,
  AEAD_AAD_STORE,
} from './aead.mjs';
import { wrapMasterKey } from './wrappers.mjs';
import { generateRecoveryPhrase } from './recoveryPhrase.mjs';
import { initialRateLimit } from './rateLimit.mjs';

export const SECURITY_FILE_VERSION = 1;
const RECOVERY_SALT_BYTES = 16;

/**
 * Encode a plaintext payload object into the spec-format encrypted blob.
 * The MK is the only secret; the inner JSON is byte-identical to today's
 * `ledger.json` so the renderer hydration path needs no schema change.
 */
export function encodeStore(payload, mk, ivProvider) {
  const json = JSON.stringify(payload);
  return aeadEncryptString(json, mk, AEAD_AAD_STORE, ivProvider);
}

/**
 * Decode a spec-format encrypted blob into the plaintext payload object.
 * Throws on tag mismatch (I4) or malformed inner JSON (`STORE_PAYLOAD_MALFORMED`
 * edge case in the spec).
 */
export function decodeStore(blob, mk) {
  const json = aeadDecryptString(blob, mk, AEAD_AAD_STORE);
  try {
    return JSON.parse(json);
  } catch (e) {
    const err = new Error('STORE_PAYLOAD_MALFORMED');
    err.cause = e;
    throw err;
  }
}

/**
 * Build a fresh, valid security-metadata object for a setup with the given
 * primary methods. Each `methods[name]` entry is `{ secret, kdfParams? }`;
 * `secret` is a string (PIN/password) or Uint8Array (raw 32-byte WK for
 * future passkey/escrow). The recovery wrapper is always created.
 *
 * Returns `{ config, mk, recoveryPhrase }`. The caller is responsible for
 * persisting `config` and showing `recoveryPhrase` to the user (R2 step 4).
 *
 * `opts` lets tests inject deterministic randomness:
 *   - `mkProvider` → 32-byte Uint8Array
 *   - `recoveryEntropyProvider` → 16-byte Uint8Array
 *   - `saltProvider(name)` → 16-byte Uint8Array
 *   - `ivProvider()` → 16-byte Uint8Array
 *   - `now()` → ISO timestamp
 */
export function buildSecurityConfig(methods, opts = {}) {
  if (!methods || typeof methods !== 'object' || Array.isArray(methods) || Object.keys(methods).length === 0) {
    const err = new Error('PRIMARY_METHOD_REQUIRED');
    err.code = 'PRIMARY_METHOD_REQUIRED';
    throw err;
  }

  const mk = (opts.mkProvider || (() => randBytes(32)))();
  if (!(mk instanceof Uint8Array) || mk.length !== 32) {
    throw new Error('mk provider must yield a 32-byte Uint8Array');
  }

  const recoveryPhrase = generateRecoveryPhrase(opts.recoveryEntropyProvider);
  const recoverySalt = (opts.saltProvider ? opts.saltProvider('recovery') : randBytes(RECOVERY_SALT_BYTES));
  const recoveryWrapper = wrapMasterKey({
    kdf: 'pbkdf2-sha256',
    secret: recoveryPhrase,
    salt: recoverySalt,
    mk,
    kdfParams: opts.recoveryKdfParams,
    aeadOpts: { ivProvider: opts.ivProvider },
  });

  const methodEntries = {};
  for (const [name, spec] of Object.entries(methods)) {
    if (!spec || typeof spec !== 'object') {
      throw new Error(`method ${name} requires { secret } config`);
    }
    const kdf = spec.kdf || (name === 'pin' || name === 'password' ? 'argon2id' : 'raw');
    const salt = kdf === 'raw'
      ? null
      : (opts.saltProvider ? opts.saltProvider(name) : randBytes(16));
    const wrapper = wrapMasterKey({
      kdf,
      secret: spec.secret,
      salt,
      mk,
      kdfParams: spec.kdfParams,
      aeadOpts: { ivProvider: opts.ivProvider },
    });
    const entry = {
      enabled: true,
      wrapper,
      rateLimit: initialRateLimit(),
    };
    if (name === 'pin' && typeof spec.length === 'number') {
      entry.length = spec.length; // public per spec PIN section
    }
    methodEntries[name] = entry;
  }

  const nowIso = (opts.now || (() => new Date().toISOString()))();
  // CAR-243 / I8: store the cleartext phrase encrypted under MK so Settings
  // can later display it without re-deriving (PBKDF2 is one-way).
  const phraseCipher = aeadEncryptString(recoveryPhrase, mk, AEAD_AAD_STORE, opts.ivProvider);
  const config = {
    v: SECURITY_FILE_VERSION,
    enabled: true,
    methods: methodEntries,
    recovery: { wrapper: recoveryWrapper, phraseCipher, rateLimit: initialRateLimit() },
    osEscrow: { enabled: false, wrapper: null }, // CAR-242 will hydrate on Electron
    idleLockMs: typeof opts.idleLockMs === 'number' ? opts.idleLockMs : 300_000,
    createdAt: nowIso,
    lastUnlockAt: nowIso,
  };
  return { config, mk, recoveryPhrase };
}

/**
 * Run the one-time setup migration through caller-supplied I/O.
 *
 * `io` shape:
 *   readPlaintext()        → Promise<object>          existing ledger.json
 *   writeSecurity(cfg)     → Promise<void>            atomic write
 *   writeEncryptedStore(b) → Promise<void>            atomic write
 *   wipePlaintext()        → Promise<void>            best-effort overwrite
 *                                                     + delete (I6)
 *
 * Order (Invariant I6: "writes the encrypted blob, then deletes the
 * plaintext"): readPlaintext → encrypt under MK → writeSecurity →
 * writeEncryptedStore → wipePlaintext. A crash before `writeEncryptedStore`
 * leaves the plaintext untouched (R2 idempotent restart). A crash after
 * `writeEncryptedStore` but before `wipePlaintext` leaves both files
 * present, which the boot path handles via `STORE_INCONSISTENT` repair UI.
 */
export async function runSetupMigration({ methods, io, opts = {} }) {
  if (!io || typeof io.readPlaintext !== 'function') {
    throw new Error('io.readPlaintext required');
  }
  const existing = await io.readPlaintext();
  const { config, mk, recoveryPhrase } = buildSecurityConfig(methods, opts);
  const blob = encodeStore(existing, mk, opts.ivProvider);

  await io.writeSecurity(config);
  await io.writeEncryptedStore(blob);
  if (typeof io.wipePlaintext === 'function') {
    try {
      await io.wipePlaintext();
    } catch (e) {
      // Best-effort per spec — surface as a warning flag for the caller.
      // Don't abort migration; encrypted store is already durable.
      if (typeof opts.onWipeError === 'function') opts.onWipeError(e);
    }
  }

  // CAR-243: hand the MK back to the caller (ipc.mjs) so the user is
  // unlocked on the next render and can copy the recovery phrase / add
  // methods without re-typing the secret they just chose. The runtime is
  // responsible for zeroising on lock; we hold no copy here.
  return { config, mk, recoveryPhrase };
}

/**
 * Tiny helper exported for tests: serialise/parse 16-byte salts for fixture
 * construction.
 */
export const __testHelpers = { bytesToBase64, base64ToBytes };
