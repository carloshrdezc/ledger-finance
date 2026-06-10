// CAR-244 (slice 4): idle auto-lock controller tests.
//
// Covers spec test T10 (idleLockMs honoured within ±2 s; 0 = never) plus
// the reset-on-activity and hidden/visible catch-up behaviour. Uses an
// injectable clock + injectable timer queue so timing is fully
// deterministic — no real timers, no flakiness.

import { describe, it, expect } from 'vitest';

import {
  createIdleController,
  normalizeIdleLockMs,
  IDLE_ACTIVITY_EVENTS,
  IDLE_LOCK_PRESETS,
} from './idleLock.mjs';

// A tiny deterministic clock + timer scheduler. `advance(ms)` moves the
// clock and fires any scheduled callbacks whose deadline has passed.
function makeFakeClock(startAt = 0) {
  let nowMs = startAt;
  let nextId = 1;
  const timers = new Map(); // id -> { at, fn }

  return {
    now: () => nowMs,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: nowMs + ms, fn });
      return id;
    },
    clearTimer: id => { timers.delete(id); },
    advance: ms => {
      const target = nowMs + ms;
      // Fire due timers in deadline order until we reach the target time.
      let progressed = true;
      while (progressed) {
        progressed = false;
        let due = null;
        for (const [id, t] of timers) {
          if (t.at <= target && (due === null || t.at < due.at)) due = { id, ...t };
        }
        if (due) {
          nowMs = due.at;
          timers.delete(due.id);
          due.fn();
          progressed = true;
        }
      }
      nowMs = target;
    },
  };
}

describe('normalizeIdleLockMs', () => {
  it('collapses non-positive / non-finite values to 0 (never)', () => {
    expect(normalizeIdleLockMs(0)).toBe(0);
    expect(normalizeIdleLockMs(-5)).toBe(0);
    expect(normalizeIdleLockMs(NaN)).toBe(0);
    expect(normalizeIdleLockMs(Infinity)).toBe(0);
    expect(normalizeIdleLockMs('300000')).toBe(0);
    expect(normalizeIdleLockMs(undefined)).toBe(0);
  });
  it('floors positive values', () => {
    expect(normalizeIdleLockMs(1000.9)).toBe(1000);
    expect(normalizeIdleLockMs(300_000)).toBe(300_000);
  });
});

describe('IDLE_LOCK_PRESETS / IDLE_ACTIVITY_EVENTS', () => {
  it('exposes the spec presets including Never=0', () => {
    const labels = IDLE_LOCK_PRESETS.map(p => p.label);
    expect(labels).toEqual(['1 MIN', '5 MIN', '15 MIN', '1 HOUR', 'NEVER']);
    expect(IDLE_LOCK_PRESETS.find(p => p.label === 'NEVER').ms).toBe(0);
    expect(IDLE_LOCK_PRESETS.find(p => p.label === '5 MIN').ms).toBe(300_000);
  });
  it('binds the spec activity events', () => {
    expect(IDLE_ACTIVITY_EVENTS).toContain('keydown');
    expect(IDLE_ACTIVITY_EVENTS).toContain('mousemove');
    expect(IDLE_ACTIVITY_EVENTS).toContain('touchstart');
    expect(IDLE_ACTIVITY_EVENTS).toContain('pointerdown');
    expect(IDLE_ACTIVITY_EVENTS).toContain('focus');
  });
});

describe('T10 — idle timer fires within tolerance (I10)', () => {
  it('fires lock after idleLockMs of inactivity (1.0s budget, 1.2s elapsed)', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    clock.advance(1200); // 1.2s with no activity
    expect(locks).toBe(1);
  });

  it('fires within ±2s of a 5 minute budget', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const FIVE_MIN = 300_000;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: FIVE_MIN,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    clock.advance(FIVE_MIN - 1000); // 4:59 — not yet
    expect(locks).toBe(0);
    clock.advance(2000); // crosses 5:00 within ±2s window
    expect(locks).toBe(1);
  });

  it('does not fire before the budget elapses', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    clock.advance(900);
    expect(locks).toBe(0);
  });

  it('idleLockMs === 0 means NEVER lock (I10)', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 0,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    expect(c.isArmed()).toBe(false);
    clock.advance(10_000_000);
    expect(locks).toBe(0);
  });

  it('activity resets the inactivity window', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    clock.advance(800);
    c.noteActivity();   // reset at t=800
    clock.advance(800); // t=1600 but only 800 since activity
    expect(locks).toBe(0);
    clock.advance(400); // 1200 since activity → fires
    expect(locks).toBe(1);
  });

  it('fires only once per idle period', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    clock.advance(5000);
    expect(locks).toBe(1);
  });
});

describe('hidden/visible catch-up (spec R5: hidden > idleLockMs)', () => {
  it('locks on visibility return when budget elapsed while hidden', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      // Simulate a throttled/suspended background timer: never fires on its own.
      setTimer: () => 1,
      clearTimer: () => {},
    });
    c.start();
    c.noteHidden();
    clock.advance(1500); // hidden longer than budget; throttled timer didn't fire
    expect(locks).toBe(0);
    c.noteVisible();     // catch-up check locks immediately
    expect(locks).toBe(1);
  });

  it('does NOT lock on visibility return when budget not yet elapsed', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: () => 1,
      clearTimer: () => {},
    });
    c.start();
    c.noteHidden();
    clock.advance(400);
    c.noteVisible();
    expect(locks).toBe(0);
  });
});

describe('runtime reconfigure + stop', () => {
  it('setIdleLockMs re-anchors and can disable', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    clock.advance(500);
    c.setIdleLockMs(0); // switch to "never"
    expect(c.isArmed()).toBe(false);
    clock.advance(100_000);
    expect(locks).toBe(0);
    c.setIdleLockMs(1000); // re-enable
    clock.advance(1200);
    expect(locks).toBe(1);
  });

  it('stop() prevents any further locks', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    c.stop();
    clock.advance(5000);
    expect(locks).toBe(0);
  });

  it('reset() clears the fired latch so the timer arms again', () => {
    const clock = makeFakeClock();
    let locks = 0;
    const c = createIdleController({
      onIdle: () => { locks++; },
      idleLockMs: 1000,
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    c.start();
    clock.advance(1200);
    expect(locks).toBe(1);
    c.reset(); // post re-unlock
    clock.advance(1200);
    expect(locks).toBe(2);
  });
});
