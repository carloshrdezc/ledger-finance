// CAR-241: Key wrappers — AEAD-encrypt the master key (MK) under a wrapping
// key (WK). Each enabled unlock method holds its own wrapper; spec §"Key
// derivation per method".
//
// Wrapper schema (matches spec §"On-disk format"):
//   { kdf, kdfParams, salt, iv, wrappedMK, tag, aad }
//
// We keep the wrapper isomorphic to the AEAD wire blob (`iv`, `wrappedMK` aka
// `ct`, `tag`, `aad`), with `kdf`/`kdfParams`/`salt` tacked on so unwrap is
// fully self-describing — the security-metadata file alone tells you how to
// re-derive WK.

import {
  aeadEncrypt,
  aeadDecrypt,
  bytesToBase64,
  base64ToBytes,
  AEAD_AAD_WRAPPER,
} from './aead.mjs';
import { deriveArgon2id, deriveRecoveryKey, ARGON2ID_DEFAULTS, PBKDF2_DEFAULTS } from './kdf.mjs';

/**
 * Wrap MK under a derivation-method-and-secret pair, returning a
 * spec-shaped wrapper object.
 *
 * `kdf` ∈ {'argon2id', 'pbkdf2-sha256', 'raw'} — `'raw'` is for callers that
 * already have a 32-byte WK in hand (e.g. WebAuthn-PRF / OS-escrow paths
 * landing in later slices).
 */
export function wrapMasterKey({ kdf, secret, salt, mk, kdfParams, aeadOpts = {} }) {
  if (!(mk instanceof Uint8Array) || mk.length !== 32) {
    throw new Error('mk must be a 32-byte Uint8Array');
  }
  let wk;
  let recordedParams;
  if (kdf === 'argon2id') {
    const params = { ...ARGON2ID_DEFAULTS, ...(kdfParams || {}) };
    wk = deriveArgon2id(secret, salt, params);
    recordedParams = params;
  } else if (kdf === 'pbkdf2-sha256') {
    const params = { ...PBKDF2_DEFAULTS, ...(kdfParams || {}) };
    wk = deriveRecoveryKey(secret, salt, params);
    recordedParams = params;
  } else if (kdf === 'raw') {
    if (!(secret instanceof Uint8Array) || secret.length !== 32) {
      throw new Error('raw kdf requires a 32-byte Uint8Array secret (the WK)');
    }
    wk = secret;
    recordedParams = null;
  } else {
    throw new Error(`unsupported kdf: ${kdf}`);
  }

  const blob = aeadEncrypt(mk, wk, AEAD_AAD_WRAPPER, aeadOpts.ivProvider);
  return {
    kdf,
    kdfParams: recordedParams,
    salt: salt instanceof Uint8Array ? bytesToBase64(salt) : null,
    iv: blob.iv,
    wrappedMK: blob.ct,
    tag: blob.tag,
    aad: blob.aad,
  };
}

/**
 * Unwrap a wrapper to recover MK. Throws on bad secret (GCM tag mismatch),
 * bad params, or unknown KDF — every failure mode the rate-limiter cares
 * about lands here.
 */
export function unwrapMasterKey(wrapper, secret) {
  if (!wrapper || typeof wrapper !== 'object') throw new Error('wrapper missing');
  let wk;
  if (wrapper.kdf === 'argon2id') {
    const salt = base64ToBytes(wrapper.salt);
    wk = deriveArgon2id(secret, salt, { ...ARGON2ID_DEFAULTS, ...(wrapper.kdfParams || {}) });
  } else if (wrapper.kdf === 'pbkdf2-sha256') {
    const salt = base64ToBytes(wrapper.salt);
    wk = deriveRecoveryKey(secret, salt, { ...PBKDF2_DEFAULTS, ...(wrapper.kdfParams || {}) });
  } else if (wrapper.kdf === 'raw') {
    if (!(secret instanceof Uint8Array) || secret.length !== 32) {
      throw new Error('raw kdf requires a 32-byte Uint8Array secret');
    }
    wk = secret;
  } else {
    throw new Error(`unsupported kdf: ${wrapper.kdf}`);
  }

  const blob = {
    v: 1,
    alg: 'AES-256-GCM',
    iv: wrapper.iv,
    ct: wrapper.wrappedMK,
    tag: wrapper.tag,
    aad: wrapper.aad || AEAD_AAD_WRAPPER,
  };
  return aeadDecrypt(blob, wk, blob.aad);
}
