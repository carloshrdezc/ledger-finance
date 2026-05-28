// CAR-241: Per-method rate-limit state machine.
//
// Pure logic — takes the current state + an event (success/failure) + `now`
// and returns the next state plus a directive ("allowed" / "locked until X" /
// "auto-disable"). Persistence is the caller's job; this module never
// touches disk so it's trivially testable and survives across runtimes.
//
// Spec §"Failed-unlock behaviour" (R8) + Invariant I7. Backoff table from
// the PIN section, applied to PIN by default. Password and recovery use the
// same table without auto-disable; that's a knob in `policy`.

export const PIN_POLICY = Object.freeze({
  // backoff[i] gives the minimum delay (ms) before the (i+1)-th attempt
  // *after* `i` consecutive failures. Index 0 = first attempt = no delay.
  // The table from spec R8: 1–4 immediate, 5 → 30s, 6 → 2min, 7 → 10min,
  // 8 → 1h, 9+ → 24h.
  backoffMs: [
    0, // 1st attempt
    0, 0, 0, // 2–4
    30_000, // 5
    2 * 60_000, // 6
    10 * 60_000, // 7
    60 * 60_000, // 8
    24 * 60 * 60_000, // 9
    24 * 60 * 60_000, // 10
  ],
  autoDisableAfter: 10, // PIN auto-disables at 10 cumulative failures
});

export const PASSWORD_POLICY = Object.freeze({
  backoffMs: PIN_POLICY.backoffMs,
  autoDisableAfter: null, // password never auto-disables (R8)
});

export const RECOVERY_POLICY = Object.freeze({
  backoffMs: PIN_POLICY.backoffMs,
  autoDisableAfter: null,
});

/** Build a fresh rate-limit state record. */
export function initialRateLimit() {
  return { failures: 0, lockedUntil: null };
}

/**
 * Decide whether an unlock attempt is currently allowed.
 *
 * Returns `{ allowed: true }` or `{ allowed: false, remainingMs }`.
 */
export function canAttempt(state, now = Date.now()) {
  if (!state || typeof state !== 'object') return { allowed: true };
  if (!state.lockedUntil) return { allowed: true };
  const lockedUntil = typeof state.lockedUntil === 'string'
    ? Date.parse(state.lockedUntil)
    : state.lockedUntil;
  if (Number.isNaN(lockedUntil) || lockedUntil <= now) return { allowed: true };
  return { allowed: false, remainingMs: lockedUntil - now };
}

/**
 * Record a failure. Returns the next state and whether the method should be
 * auto-disabled (PIN at 10 cumulative failures per spec R8).
 */
export function recordFailure(state, policy = PIN_POLICY, now = Date.now()) {
  const failures = (state?.failures || 0) + 1;
  const idx = Math.min(failures - 1, policy.backoffMs.length - 1);
  const delay = policy.backoffMs[idx] || 0;
  const lockedUntil = delay > 0 ? new Date(now + delay).toISOString() : null;
  const next = { failures, lockedUntil };
  const autoDisable = policy.autoDisableAfter !== null
    && failures >= policy.autoDisableAfter;
  return { state: next, autoDisable };
}

/** Reset failures + clear lock on a successful unlock (R3 step 5). */
export function recordSuccess() {
  return initialRateLimit();
}

/** Look up the policy for a given method name. */
export function policyForMethod(name) {
  if (name === 'pin') return PIN_POLICY;
  if (name === 'password') return PASSWORD_POLICY;
  if (name === 'recovery') return RECOVERY_POLICY;
  return PASSWORD_POLICY; // safe default for future methods
}
