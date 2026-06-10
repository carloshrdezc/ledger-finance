// CAR-244 (slice 4): renderer-side idle auto-lock controller.
//
// Pure logic, no React. The controller arms a timer that fires `onIdle`
// after `idleLockMs` of no activity (spec R5: "idleLockMs elapsed with no
// user input"). Activity events reset it. A value of 0 means "never"
// (spec I10) — the controller stays disarmed.
//
// Belt-and-suspenders for backgrounded contexts (spec R5 last bullet +
// design table "Idle detection"): background tabs and unfocused windows
// throttle/suspend timers, so in addition to the armed timeout we also
// compare *elapsed wall-clock time* whenever the surface becomes visible
// or regains focus again. If more than `idleLockMs` elapsed while hidden,
// we lock immediately rather than trusting the (possibly-throttled) timer.
//
// `now`, `setTimer`, `clearTimer` are injectable so the timer accuracy
// test (T10) is deterministic under Vitest fake timers.

// Activity events the renderer binds to reset the idle timer (spec:
// keydown / mousemove / touchstart / pointerdown / focus).
export const IDLE_ACTIVITY_EVENTS = Object.freeze([
  'keydown',
  'mousemove',
  'touchstart',
  'pointerdown',
  'focus',
]);

// Settings presets (spec slice-4 item 4: 1m / 5m / 15m / 1h / Never).
export const IDLE_LOCK_PRESETS = Object.freeze([
  { label: '1 MIN', ms: 60_000 },
  { label: '5 MIN', ms: 300_000 },
  { label: '15 MIN', ms: 900_000 },
  { label: '1 HOUR', ms: 3_600_000 },
  { label: 'NEVER', ms: 0 },
]);

const DEFAULT_NOW = () => Date.now();

// Normalise an idleLockMs value to a non-negative integer. Anything
// non-numeric / negative / NaN collapses to 0 ("never") so a corrupt
// config can never produce a runaway or instant lock.
export function normalizeIdleLockMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

// Create an idle controller.
//
//   onIdle      () => void   — invoked exactly once per idle period.
//   idleLockMs  number       — 0 = never.
//   now         () => ms      — wall clock (injectable for tests).
//   setTimer    (fn, ms)=>id  — defaults to setTimeout.
//   clearTimer  (id)=>void    — defaults to clearTimeout.
export function createIdleController({
  onIdle,
  idleLockMs = 0,
  now = DEFAULT_NOW,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
} = {}) {
  if (typeof onIdle !== 'function') {
    throw new TypeError('createIdleController requires an onIdle callback');
  }

  let lockMs = normalizeIdleLockMs(idleLockMs);
  let timerId = null;
  let lastActivityAt = now();
  let fired = false;
  let stopped = false;

  function disarm() {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  function fire() {
    if (fired || stopped) return;
    fired = true;
    disarm();
    onIdle();
  }

  // Arm (or re-arm) the timeout from "now". No-op when disabled (0 = never),
  // already fired, or stopped.
  function arm() {
    disarm();
    if (stopped || fired) return;
    if (lockMs <= 0) return;
    timerId = setTimer(fire, lockMs);
  }

  // Record user activity — resets the inactivity window.
  function noteActivity() {
    if (stopped || fired) return;
    lastActivityAt = now();
    arm();
  }

  // Surface went hidden/blurred. We keep the armed timer (it may or may not
  // fire depending on throttling) and rely on noteVisible() to catch up.
  function noteHidden() {
    // No state change required; lastActivityAt is the anchor. We intentionally
    // do NOT reset activity here — being hidden is not activity.
  }

  // Surface became visible / regained focus. If the idle budget already
  // elapsed while we were away, lock now (covers throttled background
  // timers — spec R5 "hidden > idleLockMs"). Otherwise treat the return
  // as activity and re-arm for the remaining time.
  function noteVisible() {
    if (stopped || fired) return;
    if (lockMs > 0 && now() - lastActivityAt >= lockMs) {
      fire();
      return;
    }
    noteActivity();
  }

  // Change the configured timeout at runtime (Settings preset change).
  function setIdleLockMs(value) {
    lockMs = normalizeIdleLockMs(value);
    if (stopped || fired) return;
    // Re-anchor and re-arm against the new budget.
    lastActivityAt = now();
    arm();
  }

  // Start the controller (arms the initial timer).
  function start() {
    if (stopped) return;
    fired = false;
    lastActivityAt = now();
    arm();
  }

  // Permanently stop — clears timers, ignores further events.
  function stop() {
    stopped = true;
    disarm();
  }

  // Reset the fired latch (e.g. after a successful re-unlock) and re-arm.
  function reset() {
    if (stopped) return;
    fired = false;
    lastActivityAt = now();
    arm();
  }

  return {
    start,
    stop,
    reset,
    arm,
    noteActivity,
    noteHidden,
    noteVisible,
    setIdleLockMs,
    // Inspectors (tests / debugging).
    isArmed: () => timerId !== null,
    hasFired: () => fired,
    getIdleLockMs: () => lockMs,
  };
}
