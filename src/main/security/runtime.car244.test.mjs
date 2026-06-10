// CAR-244 (slice 4): runtime tests for the slice-4 surface.
//
//  - setIdleLockMs persistence + getState round-trip (I10 wiring).
//  - T13: OS_ESCROW_REKEY — classify the escrow-decrypt failure, then verify
//    planOsEscrowRekey schedules a silent re-wrap after the next successful
//    primary-method unlock (Electron only).
//  - T14 (logic level): browser path (no Electron API) — setup, lock,
//    "reopen" via a fresh runtime over the same persisted config, unlock,
//    and confirm the same 32-byte MK is recovered. The byte-for-byte
//    cross-runtime parity + live passkey ceremony are manual-smoke rows.
//
// Reuses the slice-3 FAST_* KDF trick so the suite stays fast.

import { describe, it, expect, vi } from 'vitest';
import { createRuntime } from './runtime.mjs';
import { buildSecurityConfig } from './storeCodec.mjs';
import { classifyEdgeCase, planOsEscrowRekey, EDGE_FLAGS } from './bootEdgeCases.mjs';

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

async function setupRuntimeWith(methods, opts) {
  const { config } = buildSecurityConfig(methods, { recoveryKdfParams: FAST_RECOVERY, ...opts });
  const io = makeIo(config);
  const runtime = createRuntime({ io });
  await runtime.loadConfig();
  return { runtime, io, config };
}

describe('CAR-244 I10 — setIdleLockMs persists and surfaces via getState', () => {
  it('persists a positive value and reflects it in getState', async () => {
    const { runtime, io } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    const r = await runtime.setIdleLockMs(60_000);
    expect(r.ok).toBe(true);
    expect(r.idleLockMs).toBe(60_000);
    expect(io.state().idleLockMs).toBe(60_000);
    expect(runtime.getState().idleLockMs).toBe(60_000);
  });

  it('clamps non-positive / non-numeric to 0 (never)', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    expect((await runtime.setIdleLockMs(0)).idleLockMs).toBe(0);
    expect((await runtime.setIdleLockMs(-1)).idleLockMs).toBe(0);
    expect((await runtime.setIdleLockMs(NaN)).idleLockMs).toBe(0);
    expect(runtime.getState().idleLockMs).toBe(0);
  });

  it('floors fractional values', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });
    expect((await runtime.setIdleLockMs(900000.7)).idleLockMs).toBe(900000);
  });
});

describe('CAR-244 T13 — OS_ESCROW_REKEY silent re-wrap on next unlock', () => {
  it('classifies an escrow-decrypt failure as a silent, boot-continuing info', () => {
    const decision = classifyEdgeCase({ osEscrowFailed: true });
    expect(decision.flag).toBe(EDGE_FLAGS.OS_ESCROW_REKEY);
    expect(decision.blocksBoot).toBe(false);
    expect(decision.message).toBeNull();
    expect(decision.rekeyOnNextUnlock).toBe(true);
  });

  it('schedules the re-wrap only after a successful primary-method unlock (Electron)', async () => {
    const { runtime } = await setupRuntimeWith({ pin: { secret: '4729', kdfParams: FAST_PIN_ARGON } });

    // Boot-time escrow failure flags a pending re-key.
    const decision = classifyEdgeCase({ osEscrowFailed: true });
    const rekeyPending = decision.rekeyOnNextUnlock;

    // Before unlock: no re-wrap planned.
    expect(planOsEscrowRekey({ rekeyPending, unlockSucceeded: false, onElectron: true })).toBeNull();

    // User unlocks with a primary method.
    const unlock = await runtime.unlockPin('4729');
    expect(unlock.success).toBe(true);

    // Now a re-wrap is planned (Electron path).
    const plan = planOsEscrowRekey({ rekeyPending, unlockSucceeded: true, onElectron: true });
    expect(plan).not.toBeNull();
    expect(plan.action).toBe('re-wrap-os-escrow');
    expect(plan.setEnabledAfterWrap).toBe(true);

    // Browser path never re-wraps (no safeStorage).
    expect(planOsEscrowRekey({ rekeyPending, unlockSucceeded: true, onElectron: false })).toBeNull();
  });
});

describe('CAR-244 T14 (logic level) — browser path setup → reopen → unlock', () => {
  it('recovers the same MK after a fresh runtime reopens the persisted config', async () => {
    // Setup with a passkey-style raw WK (the browser path's primary) plus a
    // recovery phrase, exactly as the browser fallback would.
    const rawWk = new Uint8Array(32).fill(7);
    const { io, runtime } = await setupRuntimeWith({
      passkey: { secret: rawWk, kdf: 'raw' },
    });

    // First unlock in this "session".
    const first = await runtime.unlockPasskey(rawWk);
    expect(first.success).toBe(true);
    const mkA = Buffer.from(runtime.getMk()).toString('hex');

    // "Close the tab": clear the in-memory MK.
    runtime.clearMk();
    expect(runtime.getMk()).toBeNull();

    // "Reopen the tab": a brand-new runtime over the SAME persisted config
    // (this is what localStorage["ledger:security"] gives the browser path).
    const reopened = createRuntime({ io });
    await reopened.loadConfig();
    expect(reopened.getMk()).toBeNull(); // cold start is always locked

    const second = await reopened.unlockPasskey(rawWk);
    expect(second.success).toBe(true);
    const mkB = Buffer.from(reopened.getMk()).toString('hex');

    // Same secret → same MK across the reopen (parity).
    expect(mkB).toBe(mkA);
    expect(reopened.getMk().length).toBe(32);
  });
});
