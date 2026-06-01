// @vitest-environment jsdom
// CAR-242: useMK / MKProvider tests — context shape, lockNow round-trip,
// state-changed subscription updates.

import React from 'react';
import { render, act, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MKProvider, useMK } from './useMK';

function makeBridge(overrides = {}) {
  return {
    getState: vi.fn().mockResolvedValue({
      enabled: true,
      locked: true,
      methods: ['pin'],
      lockedUntil: null,
    }),
    unlockPin: vi.fn().mockResolvedValue({ success: true }),
    lockNow: vi.fn().mockResolvedValue({ ok: true }),
    onStateChanged: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

function captureContext(target) {
  return function Probe() {
    target.value = useMK();
    return null;
  };
}

afterEach(() => {
  cleanup();
});

describe('MKProvider / useMK', () => {
  it('exposes the initial state from the bridge', async () => {
    const target = {};
    const bridge = makeBridge();
    const Probe = captureContext(target);
    render(
      <MKProvider bridge={bridge}>
        <Probe />
      </MKProvider>,
    );
    await waitFor(() => expect(target.value.enabled).toBe(true));
    expect(target.value.locked).toBe(true);
    expect(target.value.methods).toContain('pin');
  });

  it('updates when the bridge emits state-changed (locked → unlocked)', async () => {
    const target = {};
    let listener = null;
    const bridge = makeBridge({
      onStateChanged: vi.fn().mockImplementation(cb => {
        listener = cb;
        return () => { listener = null; };
      }),
    });
    const Probe = captureContext(target);
    render(
      <MKProvider bridge={bridge}>
        <Probe />
      </MKProvider>,
    );
    await waitFor(() => expect(target.value.locked).toBe(true));
    await act(async () => {
      listener({ enabled: true, locked: false, methods: ['pin'], lockedUntil: null });
    });
    expect(target.value.locked).toBe(false);
  });

  it('round-trips lockNow through the bridge', async () => {
    const target = {};
    const bridge = makeBridge();
    const Probe = captureContext(target);
    render(
      <MKProvider bridge={bridge}>
        <Probe />
      </MKProvider>,
    );
    await waitFor(() => expect(target.value.enabled).toBe(true));
    await act(async () => {
      await target.value.lockNow();
    });
    expect(bridge.lockNow).toHaveBeenCalledTimes(1);
  });

  it('round-trips unlockPin through the bridge', async () => {
    const target = {};
    const bridge = makeBridge();
    const Probe = captureContext(target);
    render(
      <MKProvider bridge={bridge}>
        <Probe />
      </MKProvider>,
    );
    await waitFor(() => expect(target.value.enabled).toBe(true));
    await act(async () => {
      const result = await target.value.unlockPin('1234');
      expect(result.success).toBe(true);
    });
    expect(bridge.unlockPin).toHaveBeenCalledWith('1234');
  });

  it('falls back to safe defaults when no bridge is provided', async () => {
    const target = {};
    const Probe = captureContext(target);
    render(
      <MKProvider bridge={null}>
        <Probe />
      </MKProvider>,
    );
    expect(target.value.enabled).toBe(false);
    expect(target.value.locked).toBe(false);
    const result = await target.value.unlockPin('x');
    expect(result.success).toBe(false);
  });
});
