// CAR-243: webauthn helper tests — RP ID origin filter + create/get
// PRF path round-trip with a mocked navigator.credentials.

import { describe, it, expect, vi } from 'vitest';
import { createPasskey, getPasskeyWk, passkeyMatchesOrigin } from './webauthn';

describe('passkeyMatchesOrigin', () => {
  it('matches exact origin', () => {
    expect(passkeyMatchesOrigin('example.com', 'example.com')).toBe(true);
  });
  it('matches subdomain', () => {
    expect(passkeyMatchesOrigin('example.com', 'app.example.com')).toBe(true);
  });
  it('rejects unrelated origin', () => {
    expect(passkeyMatchesOrigin('example.com', 'evil.com')).toBe(false);
  });
  // CAR-243 round-2: lock the leading-dot guard. Without the dot,
  // `'evilexample.com'.endsWith('example.com')` would return true and let
  // an attacker register `evilexample.com` to harvest passkeys whose
  // rpId is `example.com`. The implementation prepends '.' before the
  // suffix check; this test guards against a future "simplification"
  // that removes it.
  it('rejects sibling domain that ends with rpId without dot boundary', () => {
    expect(passkeyMatchesOrigin('example.com', 'evilexample.com')).toBe(false);
  });
  it('rejects sibling domain spelled with extra prefix character', () => {
    expect(passkeyMatchesOrigin('example.com', 'aevilexample.com')).toBe(false);
  });
  it('returns false for empty rpId', () => {
    expect(passkeyMatchesOrigin('', 'example.com')).toBe(false);
  });
  // CAR-243 round-3 (I3): hostnames are case-insensitive per RFC 1035.
  // A stored mixed-case rpId must still match the runtime origin.
  it('matches case-insensitively when stored rpId has mixed case', () => {
    expect(passkeyMatchesOrigin('Example.COM', 'example.com')).toBe(true);
  });
  it('matches case-insensitively when origin has mixed case', () => {
    expect(passkeyMatchesOrigin('example.com', 'APP.Example.com')).toBe(true);
  });
});

describe('createPasskey + getPasskeyWk', () => {
  it('returns the same WK across create + get on the PRF path', async () => {
    const prfBytes = new Uint8Array(32).fill(0xAB);
    const fakeId = new Uint8Array([10, 20, 30]);
    const credentials = {
      create: vi.fn(async () => ({
        rawId: fakeId.buffer,
        getClientExtensionResults: () => ({ prf: { results: { first: prfBytes.buffer } } }),
      })),
      get: vi.fn(async () => ({
        response: {},
        getClientExtensionResults: () => ({ prf: { results: { first: prfBytes.buffer } } }),
      })),
    };
    const result = await createPasskey({ rpId: 'localhost', credentials });
    expect(result.prfPath).toBe('prf');
    expect(Array.from(result.wk)).toEqual(Array.from(prfBytes));
    const wk2 = await getPasskeyWk({
      credentialId: result.credentialId,
      rpId: result.rpId,
      salt: result.salt,
      prfPath: 'prf',
      credentials,
    });
    expect(Array.from(wk2)).toEqual(Array.from(prfBytes));
  });

  it('falls back to userHandle+HKDF when authenticator refuses PRF', async () => {
    const credentials = {
      create: vi.fn(async () => ({
        rawId: new Uint8Array([1, 2, 3]).buffer,
        getClientExtensionResults: () => ({}),
      })),
      get: vi.fn(async (opts) => ({
        response: { userHandle: opts.publicKey.allowCredentials[0].id },
        getClientExtensionResults: () => ({}),
      })),
    };
    const created = await createPasskey({ rpId: 'localhost', credentials });
    expect(created.prfPath).toBe('userHandle');
    expect(created.wk.length).toBe(32);
  });
});
