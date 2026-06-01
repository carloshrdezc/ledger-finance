// CAR-242: Runtime tests — MK lifecycle, failure-counter persistence (T7),
// lockNow semantics (T2 setup), success/failure transitions, getState
// shape.
//
// Vitest's default 5s per-test timeout is too tight here: every
// `unlockPin()` call runs Argon2id (~1s on a fast box, ~2s on weak CI)
// and a few of these tests do 5+ unlock attempts per case. We bump to
// 30s globally for this file rather than sprinkle per-it timeouts.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRuntime } from './runtime.mjs';
import { buildSecurityConfig } from './storeCodec.mjs';

vi.setConfig({ testTimeout: 30_000 });

// Argon2id is too slow for a unit test loop. PBKDF2 with the slice-1 default
// (600k) is also slow but tractable; we drop it further for deterministic
// runs.
const FAST_PIN_ARGON = { m: 8 * 1024, t: 1, p: 1 };
const FAST_RECOVERY = { iterations: 1000 };

function buildPinConfig(pin = '1234') {
  return buildSecurityConfig(
    { pin: { secret: pin, kdfParams: FAST_PIN_ARGON } },
    { recoveryKdfParams: FAST_RECOVERY },
  );
}

function makeIo(initialConfig = null) {
  let stored = initialConfig;
  return {
    state: () => stored,
    readSecurity: async () => stored,
    writeSecurity: async cfg => { stored = cfg; },
  };
}

describe('runtime — MK lifecycle', () => {
  let io, runtime;

  beforeEach(async () => {
    const { config } = buildPinConfig('4729');
    io = makeIo(config);
    runtime = createRuntime({ io });
    await runtime.loadConfig();
  });

  it('starts locked when enabled and no MK has been set', () => {
    expect(runtime.isEnabled()).toBe(true);
    expect(runtime.isLocked()).toBe(true);
    expect(runtime.getMk()).toBe(null);
  });

  it('reports unlocked after a successful PIN unlock', async () => {
    const result = await runtime.unlockPin('4729');
    expect(result.success).toBe(true);
    expect(runtime.isLocked()).toBe(false);
    expect(runtime.getMk()).toBeInstanceOf(Uint8Array);
    expect(runtime.getMk().length).toBe(32);
  });

  it('clearMk() relocks and zeroes the MK reference', async () => {
    await runtime.unlockPin('4729');
    expect(runtime.isLocked()).toBe(false);
    runtime.clearMk();
    expect(runtime.isLocked()).toBe(true);
    expect(runtime.getMk()).toBe(null);
  });

  it('disabled config reports not-enabled and not-locked', async () => {
    const localIo = makeIo({ enabled: false });
    const local = createRuntime({ io: localIo });
    await local.loadConfig();
    expect(local.isEnabled()).toBe(false);
    expect(local.isLocked()).toBe(false);
  });

  it('getState() exposes only public fields (no MK, no wrappers)', async () => {
    const state = runtime.getState();
    expect(state).toEqual(
      expect.objectContaining({
        enabled: true,
        locked: true,
        methods: expect.arrayContaining(['pin']),
      }),
    );
    expect(Object.keys(state)).not.toContain('mk');
    expect(Object.keys(state)).not.toContain('wrappers');
  });
});

describe('runtime — failure counter (spec T7)', () => {
  it('persists failures:3 after three wrong PINs', async () => {
    const { config } = buildPinConfig('4729');
    const io = makeIo(config);
    const runtime = createRuntime({ io });
    await runtime.loadConfig();

    const r1 = await runtime.unlockPin('0000');
    const r2 = await runtime.unlockPin('0001');
    const r3 = await runtime.unlockPin('0002');

    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
    expect(r3.success).toBe(false);

    expect(io.state().methods.pin.rateLimit.failures).toBe(3);
    expect(runtime.isLocked()).toBe(true);
  });

  it('correct PIN on the 4th attempt resets failures to 0', async () => {
    const { config } = buildPinConfig('4729');
    const io = makeIo(config);
    const runtime = createRuntime({ io });
    await runtime.loadConfig();

    await runtime.unlockPin('0000');
    await runtime.unlockPin('0001');
    await runtime.unlockPin('0002');
    expect(io.state().methods.pin.rateLimit.failures).toBe(3);

    const ok = await runtime.unlockPin('4729');
    expect(ok.success).toBe(true);
    expect(io.state().methods.pin.rateLimit.failures).toBe(0);
    expect(io.state().methods.pin.rateLimit.lockedUntil).toBe(null);
  });

  it('sets lockedUntil after the 5th consecutive failure (R3 backoff)', async () => {
    const { config } = buildPinConfig('4729');
    const io = makeIo(config);
    const runtime = createRuntime({ io });
    await runtime.loadConfig();

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await runtime.unlockPin('0000');
    }
    const rl = io.state().methods.pin.rateLimit;
    expect(rl.failures).toBe(5);
    expect(rl.lockedUntil).toBeTruthy();
    // Even the correct PIN is refused while locked out — but we use a
    // deterministic clock here to avoid waiting 30s. The runtime's
    // canAttempt() check parses the ISO timestamp; with `now()` left as
    // real Date.now(), it'll be in the future briefly.
    const blocked = await runtime.unlockPin('4729');
    expect(blocked.success).toBe(false);
    expect(blocked.error).toBe('LOCKED_OUT');
  });
});
