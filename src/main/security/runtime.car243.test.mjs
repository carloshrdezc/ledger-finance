// CAR-243: Runtime tests for slice 3 — multi-method MK parity (T1
// revisited), add/remove round-trip (T11), PIN auto-disable persisting
// across runtimes while password remains (T12), recovery rotate (T15).
//
// These reuse slice 2's FAST_PIN_ARGON / FAST_RECOVERY trick: production
// KDF params would push each test to ~10s.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRuntime } from './runtime.mjs';
import { buildSecurityConfig } from './storeCodec.mjs';

vi.setConfig({ testTimeout: 60_000 });

const FAST_PIN_ARGON = { m: 8 * 1024, t: 1, p: 1 };
const FAST_RECOVERY = { iterations: 1000 };

function makeIo(initialConfig = null) {
  let stored = initialConfig;
  return {
    state: () => stored,
    readSecurity: async () => stored,
    writeSecurity: async cfg => { stored = cfg; },
  };
}

async function setupRuntimeWith(methods) {
  const { config } = buildSecurityConfig(methods, { recoveryKdfParams: FAST_RECOVERY });
  const io = makeIo(config);
  const runtime = createRuntime({ io });
  await runtime.loadConfig();
  return { runtime, io, config };
}

describe('CAR-243 T1 revisited — PIN + password unwrap to the same MK', () => {
  it('all configured methods recover the same 32-byte MK', async () => {
    const methods = {
      pin: { secret: '4729', kdfParams: FAST_PIN_ARGON },
      password: { secret: 'correct horse battery staple', kdfParams: FAST_PIN_ARGON },
    };
    const { runtime } = await setupRuntimeWith(methods);
    const a = await runtime.unlockPin('4729');
    expect(a.success).toBe(true);
    const mkAfterPin = Buffer.from(runtime.getMk()).toString('hex');
    runtime.clearMk();
    const b = await runtime.unlockPassword('correct horse battery staple');
    expect(b.success).toBe(true);
    const mkAfterPwd = Buffer.from(runtime.getMk()).toString('hex');
    expect(mkAfterPin).toBe(mkAfterPwd);
  });
});

describe('CAR-243 T11 — setup -> add -> remove -> unlock with the survivor', () => {
  it('remove the original method, unlock via the added one', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    expect((await runtime.unlockPin('4729')).success).toBe(true);

    const added = await runtime.addMethod({ method: 'password', secret: 'fishfish', kdfParams: FAST_PIN_ARGON });
    expect(added.ok).toBe(true);

    // Cannot remove last method while it's the only one — but with two
    // enabled methods, removing PIN is fine.
    const removed = await runtime.removeMethod('pin');
    expect(removed.ok).toBe(true);

    runtime.clearMk();
    const result = await runtime.unlockPassword('fishfish');
    expect(result.success).toBe(true);
    expect(runtime.getMk().length).toBe(32);
  });

  it('refuses removing the last enabled method (I5 / R7)', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    await runtime.unlockPin('4729');
    const r = await runtime.removeMethod('pin');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('LAST_METHOD');
  });
});

describe('CAR-243 T12 — PIN auto-disable persists across runtime restart', () => {
  it('PIN flips enabled:false at 10 cumulative failures; password still works', async () => {
    const methods = {
      pin: { secret: '4729', kdfParams: FAST_PIN_ARGON },
      password: { secret: 'fishfish', kdfParams: FAST_PIN_ARGON },
    };
    const { runtime, io } = await setupRuntimeWith(methods);
    // Spec R8 backoff sets `lockedUntil` after 5 failures. We don't want
    // to wall-clock-wait 24h, so between attempts we forcibly clear the
    // lock window in the stored config — only the failure counter
    // matters for auto-disable.
    for (let i = 0; i < 10; i++) {
      const r = await runtime.unlockPin('0000');
      // Force the next attempt past any backoff window.
      const cfg = io.state();
      const pin = cfg.methods.pin;
      if (pin && pin.rateLimit) pin.rateLimit.lockedUntil = null;
      // If the runtime just auto-disabled the method we're done early.
      if (r && r.error === 'METHOD_AUTO_DISABLED') break;
    }
    // Restart runtime — auto-disable must have persisted to disk.
    const fresh = createRuntime({ io });
    await fresh.loadConfig();
    const state = fresh.getState();
    expect(state.methods.includes('pin')).toBe(false);
    expect(state.methods.includes('password')).toBe(true);
    // Password still unlocks.
    const r = await fresh.unlockPassword('fishfish');
    expect(r.success).toBe(true);
  });
});

describe('CAR-243 T15 — rotateRecoveryPhrase', () => {
  it('old phrase fails after rotate; new phrase decrypts', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    // Unlock to set MK.
    await runtime.unlockPin('4729');
    // Discover the original phrase via reveal.
    const reveal = await runtime.revealRecoveryPhrase({ method: 'pin', secret: '4729' });
    expect(reveal.ok).toBe(true);
    const oldPhrase = reveal.phrase;
    // Rotate.
    const r = await runtime.rotateRecoveryPhrase();
    expect(r.ok).toBe(true);
    expect(typeof r.phrase).toBe('string');
    expect(r.phrase).not.toBe(oldPhrase);
    // Old phrase no longer unlocks.
    runtime.clearMk();
    const oldAttempt = await runtime.unlockRecovery(oldPhrase);
    expect(oldAttempt.success).toBe(false);
    // New phrase does.
    const newAttempt = await runtime.unlockRecovery(r.phrase);
    expect(newAttempt.success).toBe(true);
  });
});

describe('CAR-243 — disableSecurity tears down wrappers + plaintext fallback', () => {
  it('invokes disableIo and clears cached config', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    await runtime.unlockPin('4729');
    const calls = { decryptToPlaintext: 0, wipeSecurity: 0 };
    const disableIo = {
      async decryptToPlaintext() { calls.decryptToPlaintext++; },
      async wipeSecurity() { calls.wipeSecurity++; },
    };
    const r = await runtime.disableSecurity({ disableIo });
    expect(r.ok).toBe(true);
    expect(calls.decryptToPlaintext).toBe(1);
    expect(calls.wipeSecurity).toBe(1);
    expect(runtime.isEnabled()).toBe(false);
    expect(runtime.getMk()).toBe(null);
  });
});

describe('CAR-243 — passkey unlock via raw WK', () => {
  it('addMethod(passkey, kdf:raw) + unlockPasskey round-trip', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    await runtime.unlockPin('4729');
    // Raw 32-byte WK the renderer would have derived.
    const wk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) wk[i] = i + 1;
    const added = await runtime.addMethod({
      method: 'passkey',
      secret: wk,
      extra: { rpId: 'localhost', credentialId: [1,2,3], salt: [4,5,6], prfPath: 'prf' },
    });
    expect(added.ok).toBe(true);
    runtime.clearMk();
    const r = await runtime.unlockPasskey(wk);
    expect(r.success).toBe(true);
    expect(runtime.getMk().length).toBe(32);
  });
});
