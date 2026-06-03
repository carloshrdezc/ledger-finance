// CAR-243 round-3 (I8): IPC payload-validation + error-sanitization tests.
//
// Mounts registerSecurityIpc against a fake ipcMain shim, invokes the
// add-method / remove-method / setup handlers with malformed payloads, and
// asserts:
//
//   - bad payloads are rejected with a stable UPPER_SNAKE error code,
//     never reaching the runtime (so Argon2id / KDF code can't be DoS'd
//     with garbage input from a compromised renderer)
//   - thrown errors are sanitized — stack trace / fs path style messages
//     are replaced with the fallback code, never echoed verbatim
//
// We don't exercise the slice-2 channels here (covered elsewhere); only
// the slice-3 management-surface handlers I8 hardened.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerSecurityIpc } from './ipc.mjs';
import { createRuntime } from './runtime.mjs';
import { buildSecurityConfig } from './storeCodec.mjs';

vi.setConfig({ testTimeout: 60_000 });

// Slice-2's fast KDF params so the real-runtime integration test doesn't
// spend ~10s in production-strength Argon2id.
const FAST_PIN_ARGON = { m: 8 * 1024, t: 1, p: 1 };
const FAST_RECOVERY = { iterations: 1000 };

function makeIpcMainShim() {
  const handlers = new Map();
  return {
    handle(channel, fn) { handlers.set(channel, fn); },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn({}, ...args);
    },
  };
}

function makeStubRuntime(overrides = {}) {
  return {
    getState: () => ({ enabled: false, locked: true }),
    setMk: () => {},
    clearMk: () => {},
    loadConfig: async () => {},
    setOsEscrowEnabled: async () => ({ ok: true }),
    addMethod: async () => ({ ok: true }),
    removeMethod: async () => ({ ok: true }),
    revealRecoveryPhrase: async () => ({ ok: true }),
    rotateRecoveryPhrase: async () => ({ ok: true }),
    disableSecurity: async () => ({ ok: true }),
    unlockPin: async () => ({ success: true }),
    unlockPassword: async () => ({ success: true }),
    unlockPasskey: async () => ({ success: true }),
    unlockRecovery: async () => ({ success: true }),
    ...overrides,
  };
}

describe('CAR-243 round-3 (I8) — security IPC payload validation', () => {
  let ipc, runtime, addCalls;
  beforeEach(() => {
    ipc = makeIpcMainShim();
    addCalls = 0;
    runtime = makeStubRuntime({
      addMethod: async () => { addCalls++; return { ok: true }; },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
  });

  it('rejects null payload to add-method without calling runtime', async () => {
    const r = await ipc.invoke('security:add-method', null);
    expect(r).toEqual({ ok: false, error: 'PAYLOAD_REQUIRED' });
    expect(addCalls).toBe(0);
  });

  it('rejects unknown method name', async () => {
    const r = await ipc.invoke('security:add-method', { method: 'fingerprint', secret: 'x' });
    expect(r).toEqual({ ok: false, error: 'INVALID_METHOD_NAME' });
    expect(addCalls).toBe(0);
  });

  // Regression: the renderer/preload/runtime contract is `{ method, secret }`
  // (NOT `{ name }`). An earlier validator read `payload.name`, so every real
  // add-method call from Settings was rejected with INVALID_METHOD_NAME before
  // ever reaching the runtime. Lock the field name so it can't drift back.
  it('keys off `method` (the real wire field), not `name`', async () => {
    const wrong = await ipc.invoke('security:add-method', { name: 'pin', secret: '4729' });
    expect(wrong).toEqual({ ok: false, error: 'INVALID_METHOD_NAME' });
    expect(addCalls).toBe(0);
    const right = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
    expect(right).toEqual({ ok: true });
    expect(addCalls).toBe(1);
  });

  it('rejects non-numeric pin', async () => {
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: 'abcd' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PIN' });
    expect(addCalls).toBe(0);
  });

  it('rejects pin shorter than 4 digits', async () => {
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '123' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PIN' });
  });

  it('rejects password shorter than 8 chars', async () => {
    const r = await ipc.invoke('security:add-method', { method: 'password', secret: 'short' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
    expect(addCalls).toBe(0);
  });

  it('rejects passkey with wrong WK length', async () => {
    const r = await ipc.invoke('security:add-method', {
      method: 'passkey', secret: new Uint8Array(16),
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSKEY_WK' });
  });

  // The renderer never sends a `kdf` field — the runtime derives it via
  // kdfForMethod('passkey') === 'raw'. A well-formed 32-byte WK (with the
  // real `kdfParams`/`extra` siblings the renderer ships) must be accepted.
  it('accepts a well-formed passkey WK (no `kdf` field on the wire)', async () => {
    const r = await ipc.invoke('security:add-method', {
      method: 'passkey',
      secret: new Uint8Array(32),
      kdfParams: null,
      extra: { rpId: 'localhost', credentialId: [1, 2, 3] },
    });
    expect(r).toEqual({ ok: true });
    expect(addCalls).toBe(1);
  });

  it('accepts a passkey WK supplied as a plain number[] (post structured-clone)', async () => {
    const r = await ipc.invoke('security:add-method', {
      method: 'passkey', secret: Array.from(new Uint8Array(32)),
    });
    expect(r).toEqual({ ok: true });
    expect(addCalls).toBe(1);
  });

  it('accepts a well-formed pin and forwards to runtime', async () => {
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
    expect(r).toEqual({ ok: true });
    expect(addCalls).toBe(1);
  });

  it('rejects unknown method name on remove-method', async () => {
    const r = await ipc.invoke('security:remove-method', 'fingerprint');
    expect(r).toEqual({ ok: false, error: 'INVALID_METHOD_NAME' });
  });

  it('rejects non-string method name on remove-method', async () => {
    const r = await ipc.invoke('security:remove-method', 42);
    expect(r).toEqual({ ok: false, error: 'INVALID_METHOD_NAME' });
  });
});

describe('CAR-243 round-3 (I8) — error sanitization', () => {
  it('sanitizes a runtime throw with stack-trace-like message', async () => {
    const ipc = makeIpcMainShim();
    const runtime = makeStubRuntime({
      addMethod: async () => {
        const err = new Error('Error at /Users/secret/path/foo.js:123 — bad thing happened');
        throw err;
      },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
    // Message is freeform, NOT UPPER_SNAKE → must be replaced with fallback.
    expect(r).toEqual({ ok: false, error: 'ADD_FAILED' });
  });

  it('preserves err.code when it matches the safe pattern', async () => {
    const ipc = makeIpcMainShim();
    const runtime = makeStubRuntime({
      addMethod: async () => {
        const err = new Error('whatever — should not be echoed');
        err.code = 'METHOD_EXISTS';
        throw err;
      },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
    expect(r).toEqual({ ok: false, error: 'METHOD_EXISTS' });
  });

  it('preserves an UPPER_SNAKE message when no err.code is set', async () => {
    const ipc = makeIpcMainShim();
    const runtime = makeStubRuntime({
      addMethod: async () => { throw new Error('METHOD_EXISTS'); },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
    expect(r).toEqual({ ok: false, error: 'METHOD_EXISTS' });
  });
});

// CAR-243 round-4 (I8 tighter sanitizer): the round-3 sanitizer accepted
// any UPPER_SNAKE string matching `/^[A-Z0-9_]{2,40}$/`, which let Node fs
// error codes (ENOENT/EBUSY/EPERM/EACCES) leak filesystem state to the
// renderer and would have echoed any future regression `throw new
// Error('PATH_C_USERS_…')`. The round-4 sanitizer uses an explicit
// allow-list of expected runtime codes; everything else collapses to the
// channel-specific fallback.
describe('CAR-243 round-4 (I8 tighter sanitizer) — non-allowlisted codes drop to fallback', () => {
  it('Node fs ENOENT err.code is NOT echoed', async () => {
    const ipc = makeIpcMainShim();
    const runtime = makeStubRuntime({
      addMethod: async () => {
        const err = new Error('ENOENT: no such file or directory');
        err.code = 'ENOENT';
        throw err;
      },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
    expect(r).toEqual({ ok: false, error: 'ADD_FAILED' });
  });

  it('Node fs EBUSY err.code is NOT echoed', async () => {
    const ipc = makeIpcMainShim();
    const runtime = makeStubRuntime({
      removeMethod: async () => {
        const err = new Error('resource busy or locked');
        err.code = 'EBUSY';
        throw err;
      },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    const r = await ipc.invoke('security:remove-method', 'pin');
    expect(r).toEqual({ ok: false, error: 'REMOVE_FAILED' });
  });

  it('arbitrary UPPER_SNAKE message that looks like a path leak is NOT echoed', async () => {
    const ipc = makeIpcMainShim();
    const runtime = makeStubRuntime({
      addMethod: async () => { throw new Error('PATH_C_USERS_HERNAJIC_LEAK'); },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
    expect(r).toEqual({ ok: false, error: 'ADD_FAILED' });
  });

  it('every allow-listed code from the runtime/storeCodec API is preserved', async () => {
    // Spot-check the common runtime codes survive the tighter filter.
    const codes = ['NOT_UNLOCKED', 'METHOD_EXISTS', 'UNKNOWN_METHOD', 'LAST_METHOD', 'NOT_ENABLED'];
    for (const code of codes) {
      const ipc = makeIpcMainShim();
      const runtime = makeStubRuntime({
        addMethod: async () => { const e = new Error('msg'); e.code = code; throw e; },
      });
      registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
      const r = await ipc.invoke('security:add-method', { method: 'pin', secret: '4729' });
      expect(r).toEqual({ ok: false, error: code });
    }
  });
});

// CAR-243: end-to-end IPC -> real runtime integration. The unit tests above
// use a stubbed runtime, which is exactly how the original `name`-vs-`method`
// validator drift went unnoticed: the stub accepted anything the validator
// forwarded, and the validator was tested against its own invented `{ name }`
// shape rather than the preload/renderer/runtime `{ method, secret }` contract.
// These tests drive the EXACT payload shape the preload ships, through the real
// `validateAddMethod` and into a real `createRuntime`, and assert the method is
// actually persisted — so any future renderer<->main contract drift fails here.
describe('CAR-243 — add-method IPC -> real runtime integration (contract drift guard)', () => {
  async function mountRealRuntime() {
    const { config } = buildSecurityConfig(
      { pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } },
      { recoveryKdfParams: FAST_RECOVERY },
    );
    let stored = config;
    const io = {
      readSecurity: async () => stored,
      writeSecurity: async cfg => { stored = cfg; },
    };
    const runtime = createRuntime({ io });
    await runtime.loadConfig();
    // Unlock so addMethod has a live MK (mirrors the post-setup Settings flow).
    expect((await runtime.unlockPin('4729')).success).toBe(true);
    const ipc = makeIpcMainShim();
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    return { ipc, runtime, io: { current: () => stored } };
  }

  it('persists a PIN added via the real preload payload shape', async () => {
    const { ipc, io } = await mountRealRuntime();
    const r = await ipc.invoke('security:add-method', { method: 'password', secret: 'fishfish', kdfParams: FAST_PIN_ARGON });
    expect(r).toEqual({ ok: true });
    // The method is really on disk with a wrapper — not silently dropped.
    expect(io.current().methods.password).toBeTruthy();
    expect(io.current().methods.password.enabled).toBe(true);
    expect(io.current().methods.password.wrapper).toBeTruthy();
  });

  it('the added method can actually unlock to the same MK', async () => {
    const { ipc, runtime } = await mountRealRuntime();
    const mkBefore = Buffer.from(runtime.getMk()).toString('hex');
    const r = await ipc.invoke('security:add-method', { method: 'password', secret: 'fishfish', kdfParams: FAST_PIN_ARGON });
    expect(r).toEqual({ ok: true });
    runtime.clearMk();
    const unlocked = await runtime.unlockPassword('fishfish');
    expect(unlocked.success).toBe(true);
    expect(Buffer.from(runtime.getMk()).toString('hex')).toBe(mkBefore);
  });

  it('the `{ name }` shape that used to slip through is rejected before the runtime', async () => {
    const { ipc, io } = await mountRealRuntime();
    const r = await ipc.invoke('security:add-method', { name: 'password', secret: 'fishfish', kdfParams: FAST_PIN_ARGON });
    expect(r).toEqual({ ok: false, error: 'INVALID_METHOD_NAME' });
    expect(io.current().methods.password).toBeUndefined();
  });
});
