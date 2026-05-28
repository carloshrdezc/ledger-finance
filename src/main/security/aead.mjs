// CAR-241: AEAD (Authenticated Encryption with Associated Data) primitives.
//
// AES-256-GCM with a 16-byte random IV and a 16-byte authentication tag.
// Same wire format on Electron (Node `crypto`) and browser (`SubtleCrypto`)
// per the CAR-239 spec — encrypted blobs round-trip across runtimes.
//
// We use `@noble/ciphers` (pure JS, audited) on both sides rather than two
// implementations; the spec calls for parity, this delivers it without the
// runtime branching surface.
//
// Wire format (matches spec §"On-disk format"):
//   { v:1, alg:"AES-256-GCM", iv:b64, ct:b64, tag:b64, aad:"<aad-string>" }
//
// `tag` is split out from the ciphertext for spec compatibility; on the wire
// it's purely informational — `@noble/ciphers/aes` returns ciphertext||tag
// concatenated, and we slice the trailing 16 bytes back out for tampering
// tests that need to mutate `ct` independently of `tag` (T4).

import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';

const IV_BYTES = 16; // 128-bit nonce; spec calls out 16 bytes for AES-GCM
const TAG_BYTES = 16;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/**
 * Generate a CSPRNG random byte array. Wrapped so tests can inject a
 * deterministic RNG via `aeadEncryptWith`.
 */
export function randBytes(n) {
  return randomBytes(n);
}

export function bytesToBase64(bytes) {
  // Works in both Node and browser: Buffer in Node, btoa fallback in browser.
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(bin);
}

export function base64ToBytes(str) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
  // eslint-disable-next-line no-undef
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function assertKey(key) {
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw new Error('AEAD key must be a 32-byte Uint8Array');
  }
}

/**
 * AEAD-encrypt `plaintext` (Uint8Array) under a 32-byte `key` with the given
 * `aad` string. Returns the spec wire-format object.
 *
 * `ivProvider` is for testing only — supply `() => fixedBytes` to make IVs
 * deterministic in unit tests.
 */
export function aeadEncrypt(plaintext, key, aad, ivProvider = () => randBytes(IV_BYTES)) {
  assertKey(key);
  if (!(plaintext instanceof Uint8Array)) {
    throw new Error('plaintext must be a Uint8Array');
  }
  const iv = ivProvider();
  if (!(iv instanceof Uint8Array) || iv.length !== IV_BYTES) {
    throw new Error(`IV must be a ${IV_BYTES}-byte Uint8Array`);
  }
  const aadBytes = TEXT_ENCODER.encode(aad);
  const cipher = gcm(key, iv, aadBytes);
  const sealed = cipher.encrypt(plaintext); // ciphertext || tag (last 16 bytes)
  const ct = sealed.slice(0, sealed.length - TAG_BYTES);
  const tag = sealed.slice(sealed.length - TAG_BYTES);
  return {
    v: 1,
    alg: 'AES-256-GCM',
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ct),
    tag: bytesToBase64(tag),
    aad,
  };
}

/**
 * AEAD-decrypt a spec-format blob under `key`. The blob's `aad` must match
 * `expectedAad` (binding to format/purpose). Throws on any failure.
 *
 * GCM tag verification is the integrity check enforcing spec invariant I4.
 */
export function aeadDecrypt(blob, key, expectedAad) {
  assertKey(key);
  if (!blob || typeof blob !== 'object') throw new Error('blob must be an object');
  if (blob.v !== 1) throw new Error(`unsupported blob version: ${blob.v}`);
  if (blob.alg !== 'AES-256-GCM') throw new Error(`unsupported alg: ${blob.alg}`);
  if (typeof expectedAad === 'string' && blob.aad !== expectedAad) {
    throw new Error(`aad mismatch: got "${blob.aad}", expected "${expectedAad}"`);
  }
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ct);
  const tag = base64ToBytes(blob.tag);
  if (iv.length !== IV_BYTES) throw new Error('invalid iv length');
  if (tag.length !== TAG_BYTES) throw new Error('invalid tag length');
  const sealed = new Uint8Array(ct.length + tag.length);
  sealed.set(ct, 0);
  sealed.set(tag, ct.length);
  const aadBytes = TEXT_ENCODER.encode(blob.aad);
  const cipher = gcm(key, iv, aadBytes);
  return cipher.decrypt(sealed); // throws on tag mismatch — I4
}

/** Convenience: encrypt a UTF-8 string and return the wire blob. */
export function aeadEncryptString(text, key, aad, ivProvider) {
  return aeadEncrypt(TEXT_ENCODER.encode(text), key, aad, ivProvider);
}

/** Convenience: decrypt a wire blob into a UTF-8 string. */
export function aeadDecryptString(blob, key, expectedAad) {
  return TEXT_DECODER.decode(aeadDecrypt(blob, key, expectedAad));
}

export const AEAD_AAD_STORE = 'ledger-store-v1';
export const AEAD_AAD_WRAPPER = 'ledger-wrapper-v1';
