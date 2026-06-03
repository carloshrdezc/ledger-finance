// CAR-242 + CAR-243: Security IPC handlers.
//
// Wires the runtime + a state-changed event channel into Electron's
// `ipcMain`. Slice 2 surface (get-state, unlock-pin, lock-now) is
// preserved verbatim; slice 3 adds the management ops the Settings UI
// needs.
//
// Channel naming convention: `security:<verb>-<noun>` (kebab-case). All
// handlers return `{ ok: true, ...data }` or `{ ok: false, error }`
// except slice-2 channels which kept their original shape.

import { runSetupMigration } from './storeCodec.mjs';

// CAR-243 round-3 (I8): centralized payload validation + error sanitization
// for the Settings-management IPC handlers. Renderer passes user-shaped
// payloads (typed PINs, passwords, passkey blobs) which we must defend
// against before the runtime touches them. Sanitize errors so we never
// echo stack traces or absolute file paths back to the renderer.
const ALLOWED_METHOD_NAMES = new Set(['pin', 'password', 'passkey']);
// CAR-243 round-3/4 (I8): only surface error codes from this explicit
// allow-list. Round-3 used a broad `/^[A-Z0-9_]{2,40}$/` regex; the
// re-reviewer pointed out it would happily echo any UPPER_SNAKE
// `err.code` (incl. Node fs codes like ENOENT/EBUSY/EPERM/EACCES that
// leak filesystem state to the renderer, and any future
// `throw new Error('PATH_C_USERS_…')` regression). The tighter list
// below covers every code intentionally surfaced by the runtime, the
// validator, and the wrappers; everything else collapses to the
// channel-specific fallback (`SETUP_FAILED` / `ADD_FAILED` / etc.).
const SAFE_ERROR_CODES = new Set([
  // Validation (this file)
  'PAYLOAD_REQUIRED',
  'INVALID_METHOD_NAME',
  'INVALID_PIN',
  'INVALID_PASSWORD',
  'INVALID_PASSKEY_WK',
  // Runtime / state (security/runtime.mjs + storeCodec.mjs)
  'NOT_UNLOCKED',
  'NOT_ENABLED',
  'METHOD_EXISTS',
  'UNKNOWN_METHOD',
  'LAST_METHOD',
  'LOCKED',
  'STORE_INCONSISTENT',
  'BAD_SECRET',
  'WRONG_KEY',
  'NEEDS_RECOVERY',
  // CAR-243 round 5: PRIMARY_METHOD_REQUIRED is thrown by storeCodec
  // when a setup migration would leave zero primary methods. Practically
  // unreachable behind security:setup's METHODS_REQUIRED guard, but the
  // allow-list claims to cover "every code intentionally surfaced by
  // the runtime, the validator, and the wrappers" — adding it keeps
  // that contract honest. (Round-4 re-reviewers R1 nit, R2 #2.)
  'PRIMARY_METHOD_REQUIRED',
  // CAR-243 round 5: setup-migration / NO_SETUP_IO surface from
  // security:setup that we already use as { ok:false, error:'…' };
  // including in allow-list lets defense-in-depth pass through if any
  // future path ever attaches it as err.code instead of returning it.
  'METHODS_REQUIRED',
  'NO_SETUP_IO',
]);
// Retained for shape validation only (defense against future codes that
// don't even look like UPPER_SNAKE — those should never be surfaced).
const SAFE_ERROR_RE = /^[A-Z0-9_]{2,40}$/;

function sanitizeError(err, fallback) {
  if (!err) return fallback;
  // Prefer explicit codes; reject anything not in the allow-list.
  const candidate = err.code || (typeof err.message === 'string' ? err.message : null);
  if (typeof candidate === 'string' && SAFE_ERROR_RE.test(candidate) && SAFE_ERROR_CODES.has(candidate)) {
    return candidate;
  }
  return fallback;
}

function validateAddMethod(payload) {
  if (!payload || typeof payload !== 'object') return 'PAYLOAD_REQUIRED';
  // Real contract (see preload + runtime.addMethod): the renderer sends
  // `{ method, secret, kdfParams?, extra? }`. The KDF is derived in the
  // runtime by `kdfForMethod(method)` — there is no `kdf` field on the wire,
  // so we validate the shape from `method` + the secret alone.
  const { method, secret } = payload;
  if (!ALLOWED_METHOD_NAMES.has(method)) return 'INVALID_METHOD_NAME';
  // pin/password expect a typed string secret; passkey expects the raw
  // 32-byte WK the renderer derived from WebAuthn PRF (Uint8Array or a
  // plain number[] that survived the contextBridge structured clone).
  if (method === 'pin') {
    if (typeof secret !== 'string' || !/^[0-9]{4,6}$/.test(secret)) return 'INVALID_PIN';
  } else if (method === 'password') {
    if (typeof secret !== 'string' || secret.length < 8 || secret.length > 1024) return 'INVALID_PASSWORD';
  } else if (method === 'passkey') {
    const bytes = secret instanceof Uint8Array ? secret : (Array.isArray(secret) ? Uint8Array.from(secret) : null);
    if (!bytes || bytes.length !== 32) return 'INVALID_PASSKEY_WK';
  }
  return null;
}

export function registerSecurityIpc({
  ipcMain,
  runtime,
  webContents, // function () => Electron.WebContents | null
  setupIo,     // io object for runSetupMigration (real one in slice 3)
  disableIo,   // io for disable: decryptToPlaintext + wipeSecurity
  isDev = false,
}) {
  if (!ipcMain) throw new Error('ipcMain required');
  if (!runtime) throw new Error('runtime required');

  function emitState() {
    try {
      const wc = typeof webContents === 'function' ? webContents() : webContents;
      if (wc && !wc.isDestroyed()) {
        wc.send('security:state-changed', runtime.getState());
      }
    } catch {
      // Window torn down; nothing to do.
    }
  }

  // --- slice-2 surface (unchanged) ----------------------------------------
  ipcMain.handle('security:get-state', () => runtime.getState());

  ipcMain.handle('security:unlock-pin', async (_event, pin) => {
    try {
      const result = await runtime.unlockPin(pin);
      emitState();
      return result;
    } catch (err) {
      // CAR-243 round 5 (R2 #1): sanitize unhandled throws so Node fs
      // codes (ENOENT/EBUSY/EACCES) and absolute paths can't leak.
      return { ok: false, error: sanitizeError(err, 'UNLOCK_FAILED') };
    }
  });

  ipcMain.handle('security:lock-now', () => {
    runtime.clearMk();
    emitState();
    return { ok: true };
  });

  // --- slice-3: extra unlock methods --------------------------------------
  ipcMain.handle('security:unlock-password', async (_event, password) => {
    // CAR-243 (I2): bound input before it reaches Argon2id. A non-string or
    // oversized value can't be a valid secret; reject without spending KDF
    // work (and without leaking it into the crypto path).
    if (typeof password !== 'string' || password.length > 1024) {
      return { success: false, error: 'BAD_SECRET' };
    }
    try {
      const result = await runtime.unlockPassword(password);
      emitState();
      return result;
    } catch (err) {
      // CAR-243 round 5: sanitize so a raw fs/AEAD error can't cross IPC.
      return { ok: false, error: sanitizeError(err, 'UNLOCK_FAILED') };
    }
  });

  // Renderer derives the WK from the WebAuthn PRF result and ships the raw
  // 32 bytes here. Wrapper unwrap with kdf:'raw' is a straight AEAD
  // decrypt under that WK. The WK never persists and the MK never crosses
  // contextBridge.
  ipcMain.handle('security:unlock-passkey', async (_event, wk) => {
    const bytes = wk instanceof Uint8Array ? wk : new Uint8Array(wk || []);
    // CAR-243 (I2): a WK is exactly 32 bytes; anything else can't unwrap.
    // Reject early instead of feeding a malformed buffer to the AEAD path.
    if (bytes.length !== 32) {
      return { success: false, error: 'BAD_SECRET' };
    }
    try {
      const result = await runtime.unlockPasskey(bytes);
      emitState();
      return result;
    } catch (err) {
      // CAR-243 round 5: sanitize so a raw fs/AEAD error can't cross IPC.
      return { ok: false, error: sanitizeError(err, 'UNLOCK_FAILED') };
    }
  });

  ipcMain.handle('security:unlock-recovery', async (_event, phrase) => {
    // CAR-243 (I2): bound input before it reaches PBKDF2.
    if (typeof phrase !== 'string' || phrase.length > 512) {
      return { success: false, error: 'BAD_SECRET' };
    }
    try {
      const result = await runtime.unlockRecovery(phrase);
      emitState();
      return result;
    } catch (err) {
      // CAR-243 round 5: sanitize so a raw fs/AEAD error can't cross IPC.
      return { ok: false, error: sanitizeError(err, 'UNLOCK_FAILED') };
    }
  });

  // --- slice-3: setup, add/remove, reveal/rotate, disable ------------------
  ipcMain.handle('security:setup', async (_event, payload) => {
    if (!setupIo) return { ok: false, error: 'NO_SETUP_IO' };
    const { methods, idleLockMs, osEscrow } = payload || {};
    if (!methods || typeof methods !== 'object') {
      return { ok: false, error: 'METHODS_REQUIRED' };
    }
    try {
      const out = await runSetupMigration({
        methods,
        io: setupIo,
        opts: { idleLockMs },
      });
      // Slice 2's runtime caches the config; pick up the new file.
      await runtime.loadConfig();
      // Honour the user's OS-escrow choice if Electron and supplied.
      if (typeof osEscrow === 'boolean') {
        await runtime.setOsEscrowEnabled(osEscrow);
      }
      // Hold MK live so the user is unlocked on the next render and can
      // copy the phrase / add methods without re-typing.
      // CAR-243: previously this called runtime.setMk(out.mk) inside a
      // bare try/catch that swallowed the "32-byte Uint8Array" guard error
      // when storeCodec used to zeroise mk before returning. Now that
      // runSetupMigration returns the live mk, adopt it via the narrowed
      // adoptSetupMk (M2) which validates shape/provenance; warn instead of
      // silently leaving the user locked if it couldn't.
      if (!runtime.adoptSetupMk(out)) {
        // eslint-disable-next-line no-console
        console.warn('security:setup — runSetupMigration returned no usable MK; user will need to unlock manually');
      }
      emitState();
      return { ok: true, recoveryPhrase: out.recoveryPhrase };
    } catch (err) {
      // CAR-243 round-3 (I8): sanitize so a stack trace / fs path can't leak.
      return { ok: false, error: sanitizeError(err, 'SETUP_FAILED') };
    }
  });

  ipcMain.handle('security:add-method', async (_event, payload) => {
    // CAR-243 round-3 (I8): validate before touching runtime so a malformed
    // payload from a compromised renderer can't reach Argon2id / KDF code.
    const invalid = validateAddMethod(payload);
    if (invalid) return { ok: false, error: invalid };
    try {
      const r = await runtime.addMethod(payload || {});
      emitState();
      return r;
    } catch (err) {
      // Never echo err.message verbatim — could leak path or stack hints.
      return { ok: false, error: sanitizeError(err, 'ADD_FAILED') };
    }
  });

  ipcMain.handle('security:remove-method', async (_event, methodName) => {
    if (typeof methodName !== 'string' || !ALLOWED_METHOD_NAMES.has(methodName)) {
      return { ok: false, error: 'INVALID_METHOD_NAME' };
    }
    try {
      const r = await runtime.removeMethod(methodName);
      emitState();
      return r;
    } catch (err) {
      return { ok: false, error: sanitizeError(err, 'REMOVE_FAILED') };
    }
  });

  // CAR-243 (I3): these management ops decrypt / write the security file and
  // so can throw fs errors (EBUSY/ENOENT) or AEAD failures. Wrap + sanitize
  // like add/remove/setup so a raw stack trace or fs path can never cross IPC.
  ipcMain.handle('security:reveal-recovery', async (_event, payload) => {
    try {
      const r = await runtime.revealRecoveryPhrase(payload || {});
      emitState();
      return r;
    } catch (err) {
      return { ok: false, error: sanitizeError(err, 'REVEAL_FAILED') };
    }
  });

  ipcMain.handle('security:rotate-recovery', async () => {
    try {
      const r = await runtime.rotateRecoveryPhrase();
      emitState();
      return r;
    } catch (err) {
      return { ok: false, error: sanitizeError(err, 'ROTATE_FAILED') };
    }
  });

  ipcMain.handle('security:disable', async () => {
    try {
      const r = await runtime.disableSecurity({ disableIo });
      emitState();
      return r;
    } catch (err) {
      // CAR-243 round 5 (R2 #1, borderline-blocker): round-4 widened
      // disableSecurity's throw surface (Phase-2 wipe failure now
      // bubbles after .tmp cleanup). Without this catch, Electron's IPC
      // returns the raw rejected promise to the renderer — full
      // `Error('EBUSY: resource busy or locked, unlink C:\\…\\security.json')`
      // including the absolute path, defeating the entire I8 hardening.
      return { ok: false, error: sanitizeError(err, 'DISABLE_FAILED') };
    }
  });

  ipcMain.handle('security:set-os-escrow', async (_event, enabled) => {
    try {
      const r = await runtime.setOsEscrowEnabled(!!enabled);
      emitState();
      return r;
    } catch (err) {
      return { ok: false, error: sanitizeError(err, 'SET_OS_ESCROW_FAILED') };
    }
  });

  // --- slice-2 dev scaffold (kept until slice 3 wizard fully replaces) ---
  if (isDev && setupIo) {
    ipcMain.handle('security:run-setup-dev', async (_event, pin) => {
      const out = await runSetupMigration({
        methods: { pin: { secret: String(pin) } },
        io: setupIo,
      });
      await runtime.loadConfig();
      emitState();
      return { ok: true, recoveryPhrase: out.recoveryPhrase };
    });
  }

  return { emitState };
}
