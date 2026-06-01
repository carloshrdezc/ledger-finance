// CAR-243: WebAuthn passkey + PRF helper.
//
// Renderer-only — `navigator.credentials` doesn't exist in the main process
// and we deliberately keep WebAuthn out of preload so the API surface stays
// thin (raw 32-byte WK in/out). Two operations:
//
//   createPasskey(rpId, userName)
//     navigator.credentials.create + prf extension request. Returns
//     { credentialId, rpId, salt, prfPath, wk }. `wk` is the 32-byte
//     working key the renderer hands to ledgerSecurity.addMethod (kdf:'raw').
//     If the authenticator refuses PRF we fall back to userHandle+HKDF
//     (spec edge-case row 1 / R6 fallback) and `prfPath = "userHandle"`.
//
//   getPasskeyWk({ credentialId, rpId, salt, prfPath })
//     navigator.credentials.get with the same prf eval. Returns the same
//     32-byte WK that was used at create time (or HKDF over userHandle).
//
// Errors throw. Callers translate to user-visible messages.

const RP_NAME = 'Ledger';

// HKDF-SHA-256 over arbitrary input keying material. Browser path uses
// SubtleCrypto so we don't have to bundle @noble/hashes into renderer
// just for the fallback. 32-byte output, fixed info string.
async function hkdfSha256(ikm, info, length = 32) {
  const subtle = (globalThis.crypto || {}).subtle;
  if (!subtle) throw new Error('SUBTLE_UNAVAILABLE');
  const salt = new Uint8Array(32); // empty (zero-filled) salt is fine for HKDF
  const baseKey = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: typeof info === 'string' ? new TextEncoder().encode(info) : info,
    },
    baseKey,
    length * 8,
  );
  return new Uint8Array(bits);
}

function randBytes(n) {
  const out = new Uint8Array(n);
  (globalThis.crypto || {}).getRandomValues?.(out);
  return out;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  return new Uint8Array(0);
}

export async function createPasskey({
  rpId,
  userName = 'Ledger user',
  // Test seam — let tests inject a fake `navigator.credentials`.
  credentials = (typeof navigator !== 'undefined' ? navigator.credentials : null),
} = {}) {
  if (!credentials) throw new Error('PASSKEY_UNSUPPORTED');
  const challenge = randBytes(32);
  const userId = randBytes(16);
  const salt = randBytes(32); // PRF eval input — also persisted with the wrapper.

  const cred = await credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: RP_NAME },
      user: { id: userId, name: userName, displayName: userName },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  if (!cred) throw new Error('PASSKEY_CREATE_FAILED');
  const credentialId = toUint8Array(cred.rawId || cred.id);

  // Did the authenticator deliver PRF?
  const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
  const prf = ext && ext.prf && ext.prf.results && ext.prf.results.first;
  if (prf) {
    return {
      credentialId,
      rpId,
      salt,
      prfPath: 'prf',
      wk: toUint8Array(prf).slice(0, 32),
      userHandle: userId,
    };
  }

  // Fallback: derive a stable WK from userHandle + HKDF. Per spec edge-case
  // row 1, we record the path so re-unlock takes the same branch.
  const wk = await hkdfSha256(userId, 'ledger-passkey-userhandle-v1', 32);
  return { credentialId, rpId, salt, prfPath: 'userHandle', wk, userHandle: userId };
}

export async function getPasskeyWk({
  credentialId,
  rpId,
  salt,
  prfPath = 'prf',
  userHandle = null,
  credentials = (typeof navigator !== 'undefined' ? navigator.credentials : null),
} = {}) {
  if (!credentials) throw new Error('PASSKEY_UNSUPPORTED');
  // userHandle path doesn't need a ceremony — but spec mandates the user
  // still proves possession of the credential. We always run get(); for the
  // fallback path we discard the assertion result and re-derive HKDF.
  const challenge = randBytes(32);
  const assertion = await credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: credentialId
        ? [{ type: 'public-key', id: toUint8Array(credentialId) }]
        : [],
      userVerification: 'required',
      timeout: 60_000,
      extensions: prfPath === 'prf' ? { prf: { eval: { first: toUint8Array(salt) } } } : undefined,
    },
  });
  if (!assertion) throw new Error('PASSKEY_GET_FAILED');

  if (prfPath === 'prf') {
    const ext = assertion.getClientExtensionResults ? assertion.getClientExtensionResults() : {};
    const prf = ext && ext.prf && ext.prf.results && ext.prf.results.first;
    if (!prf) throw new Error('PRF_UNAVAILABLE');
    return toUint8Array(prf).slice(0, 32);
  }

  // userHandle path: read userHandle off the assertion or fall back to the
  // value we stored at create time.
  const handle = toUint8Array(assertion.response?.userHandle || userHandle);
  if (handle.length === 0) throw new Error('USER_HANDLE_UNAVAILABLE');
  return await hkdfSha256(handle, 'ledger-passkey-userhandle-v1', 32);
}

// Spec edge-case row 4: hide passkey methods whose RP ID doesn't match the
// current origin. Used by LockScreen + SecuritySettings on the browser path.
//
// CAR-243 round-3 (I3): RFC 1035 hostnames are case-insensitive. Browsers
// already normalize the runtime origin to lowercase, but a stored rpId
// could have been persisted with mixed case (manual seed, schema import,
// migrated config). Lowercase both sides before comparing so a stored
// `Localhost` does not silently fail to match a runtime `localhost`.
export function passkeyMatchesOrigin(rpId, origin = (typeof window !== 'undefined' ? window.location?.hostname : '')) {
  if (!rpId) return false;
  if (!origin) return true; // no origin context (e.g. tests) — defer to caller.
  const a = String(rpId).toLowerCase();
  const b = String(origin).toLowerCase();
  // Permissive match: rpId can be a registrable domain suffix of origin.
  return b === a || b.endsWith('.' + a);
}
