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

import { describe, it, expect, beforeEach } from 'vitest';
import { registerSecurityIpc } from './ipc.mjs';

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
    const r = await ipc.invoke('security:add-method', { name: 'fingerprint', secret: 'x' });
    expect(r).toEqual({ ok: false, error: 'INVALID_METHOD_NAME' });
    expect(addCalls).toBe(0);
  });

  it('rejects non-numeric pin', async () => {
    const r = await ipc.invoke('security:add-method', { name: 'pin', secret: 'abcd' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PIN' });
    expect(addCalls).toBe(0);
  });

  it('rejects pin shorter than 4 digits', async () => {
    const r = await ipc.invoke('security:add-method', { name: 'pin', secret: '123' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PIN' });
  });

  it('rejects password shorter than 8 chars', async () => {
    const r = await ipc.invoke('security:add-method', { name: 'password', secret: 'short' });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSWORD' });
    expect(addCalls).toBe(0);
  });

  it('rejects passkey with wrong WK length', async () => {
    const r = await ipc.invoke('security:add-method', {
      name: 'passkey', kdf: 'raw', secret: new Uint8Array(16),
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSKEY_WK' });
  });

  it('rejects passkey with wrong kdf', async () => {
    const r = await ipc.invoke('security:add-method', {
      name: 'passkey', kdf: 'pbkdf2', secret: new Uint8Array(32),
    });
    expect(r).toEqual({ ok: false, error: 'INVALID_PASSKEY_KDF' });
  });

  it('accepts a well-formed pin and forwards to runtime', async () => {
    const r = await ipc.invoke('security:add-method', { name: 'pin', secret: '4729' });
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
    const r = await ipc.invoke('security:add-method', { name: 'pin', secret: '4729' });
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
    const r = await ipc.invoke('security:add-method', { name: 'pin', secret: '4729' });
    expect(r).toEqual({ ok: false, error: 'METHOD_EXISTS' });
  });

  it('preserves an UPPER_SNAKE message when no err.code is set', async () => {
    const ipc = makeIpcMainShim();
    const runtime = makeStubRuntime({
      addMethod: async () => { throw new Error('METHOD_EXISTS'); },
    });
    registerSecurityIpc({ ipcMain: ipc, runtime, webContents: () => null });
    const r = await ipc.invoke('security:add-method', { name: 'pin', secret: '4729' });
    expect(r).toEqual({ ok: false, error: 'METHOD_EXISTS' });
  });
});
