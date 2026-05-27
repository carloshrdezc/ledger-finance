// CAR-241: KDFs — Argon2id (PIN/password) and PBKDF2-SHA-256 (recovery phrase).
//
// Both via @noble/hashes (audited, pure JS, runs identically on Electron main
// and browser). Spec parameters (§"Key derivation per method"):
//   - Argon2id: m=64 MiB, t=3, p=1, hashLength=32, salt=16 random bytes
//   - PBKDF2-SHA-256: 600 000 iterations, hashLength=32, fixed per-install salt
//
// Spec open-question 7: "ship one path on both runtimes for simplicity" —
// done. Same noble API, same numbers, same output bytes everywhere.

import { argon2id } from '@noble/hashes/argon2';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

const TEXT_ENCODER = new TextEncoder();

// Spec defaults — exposed so tests can override (lower memory) and so the
// security file can record them per-wrapper for forward compatibility.
export const ARGON2ID_DEFAULTS = Object.freeze({
  m: 64 * 1024, // 64 MiB in KiB
  t: 3,
  p: 1,
  dkLen: 32,
});

export const PBKDF2_DEFAULTS = Object.freeze({
  c: 600_000,
  dkLen: 32,
});

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') return TEXT_ENCODER.encode(input);
  throw new Error('secret must be a string or Uint8Array');
}

/**
 * Derive a 32-byte wrapping key from a PIN or password using Argon2id.
 *
 * `secret` is a string (PIN digits or password) or Uint8Array.
 * `salt` must be a 16-byte Uint8Array.
 * `params` overrides the spec defaults (use sparingly — only tests).
 */
export function deriveArgon2id(secret, salt, params = ARGON2ID_DEFAULTS) {
  if (!(salt instanceof Uint8Array) || salt.length !== 16) {
    throw new Error('Argon2id salt must be 16 bytes');
  }
  return argon2id(toBytes(secret), salt, {
    m: params.m,
    t: params.t,
    p: params.p,
    dkLen: params.dkLen,
  });
}

/**
 * Derive a 32-byte wrapping key from a recovery phrase using PBKDF2-SHA-256.
 *
 * The recovery phrase is normalized (NFKD + lowercase + collapse whitespace)
 * before hashing so trivial typing differences don't break unlock.
 */
export function deriveRecoveryKey(phrase, salt, params = PBKDF2_DEFAULTS) {
  if (!(salt instanceof Uint8Array) || salt.length === 0) {
    throw new Error('recovery salt must be a non-empty Uint8Array');
  }
  const normalized = normalizeRecoveryPhrase(phrase);
  return pbkdf2(sha256, TEXT_ENCODER.encode(normalized), salt, {
    c: params.c,
    dkLen: params.dkLen,
  });
}

/**
 * Canonicalise a recovery phrase so equivalent inputs derive the same key:
 *   - NFKD normalisation (defends against composed/decomposed Unicode)
 *   - lowercase
 *   - collapse runs of whitespace to a single space
 *   - strip leading/trailing whitespace
 */
export function normalizeRecoveryPhrase(phrase) {
  if (typeof phrase !== 'string') throw new Error('recovery phrase must be a string');
  return phrase.normalize('NFKD').toLowerCase().replace(/\s+/g, ' ').trim();
}
