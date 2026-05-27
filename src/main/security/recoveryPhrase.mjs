// CAR-241: BIP39 recovery phrase — generate, validate, and roll-trip.
//
// 12 words from the BIP39 English wordlist (128 bits of entropy + 4-bit
// checksum). The wordlist is shipped via `@scure/bip39/wordlists/english`.

import { generateMnemonic, validateMnemonic, entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { normalizeRecoveryPhrase } from './kdf.mjs';

/**
 * Generate a fresh 12-word recovery phrase (128 bits of entropy).
 *
 * `entropyProvider` is for tests — supply `() => fixed16Bytes` for
 * deterministic output.
 */
export function generateRecoveryPhrase(entropyProvider) {
  if (!entropyProvider) {
    // No deterministic entropy — let the library use its own CSPRNG.
    return generateMnemonic(wordlist, 128);
  }
  const provided = entropyProvider();
  if (!(provided instanceof Uint8Array) || provided.length !== 16) {
    throw new Error('entropy must be 16 bytes for a 12-word phrase');
  }
  // Clone — defensive in case the library mutates the input buffer.
  const entropy = new Uint8Array(provided);
  return entropyToMnemonic(entropy, wordlist);
}

/** Validate a phrase against the BIP39 English wordlist + checksum. */
export function isValidRecoveryPhrase(phrase) {
  if (typeof phrase !== 'string') return false;
  return validateMnemonic(normalizeRecoveryPhrase(phrase), wordlist);
}

export { normalizeRecoveryPhrase };
