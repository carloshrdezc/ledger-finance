// CAR-242: Cold-start / locked-state UI.
//
// PIN-only this slice (CAR-243 adds password/passkey/recovery). Theme
// tokens via `A`; all-caps labels via `<ALabel>`; IBM Plex Mono only.
// The KDF runs in main — Argon2id can hit ~1s on weak hardware so we
// show a spinner via `working` while the unlock IPC is in flight.

import React from 'react';
import { A } from '../theme';
import { ALabel } from '../components/Shared';
import { useMK } from '../security/useMK';

function formatRemaining(ms) {
  if (ms <= 0) return '0S';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}S`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}M`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}H`;
}

function useCountdown(lockedUntil) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!lockedUntil) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);
  if (!lockedUntil) return 0;
  const target = typeof lockedUntil === 'string' ? Date.parse(lockedUntil) : lockedUntil;
  if (Number.isNaN(target)) return 0;
  return Math.max(0, target - now);
}

export function LockScreen() {
  const { unlockPin, lockedUntil, working } = useMK();
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState(null);
  const [localLockedUntil, setLocalLockedUntil] = React.useState(lockedUntil);

  React.useEffect(() => {
    setLocalLockedUntil(lockedUntil);
  }, [lockedUntil]);

  const remainingMs = useCountdown(localLockedUntil);
  const lockedOut = remainingMs > 0;

  const onSubmit = React.useCallback(async event => {
    event.preventDefault();
    if (!pin || working || lockedOut) return;
    setError(null);
    const result = await unlockPin(pin);
    if (result?.success) {
      setPin('');
      return;
    }
    if (result?.lockedUntil) setLocalLockedUntil(result.lockedUntil);
    if (result?.error === 'LOCKED_OUT') {
      setError('TOO MANY ATTEMPTS — TRY AGAIN LATER');
    } else if (result?.error === 'METHOD_AUTO_DISABLED') {
      setError('PIN DISABLED — USE ANOTHER METHOD');
    } else if (result?.error === 'BAD_SECRET') {
      setError('INCORRECT PIN');
    } else {
      setError('UNLOCK FAILED');
    }
  }, [pin, working, lockedOut, unlockPin]);

  return (
    <div
      role="dialog"
      aria-label="Locked"
      style={{
        position: 'fixed',
        inset: 0,
        background: A.bg,
        color: A.ink,
        fontFamily: A.font,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          minWidth: 320,
          padding: 32,
          border: `1px solid ${A.rule}`,
          background: A.bg2,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <ALabel>LEDGER · LOCKED</ALabel>
        <div style={{ fontSize: 14, color: A.ink }}>
          ENTER PIN TO UNLOCK
        </div>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={e => setPin(e.target.value)}
          aria-label="PIN"
          disabled={working || lockedOut}
          style={{
            fontFamily: A.font,
            fontSize: 18,
            letterSpacing: 4,
            padding: '8px 10px',
            background: A.bg,
            color: A.ink,
            border: `1px solid ${A.rule}`,
            outline: 'none',
          }}
        />

        {error && (
          <div role="alert" style={{ fontSize: 11, letterSpacing: 1.2, color: A.neg, textTransform: 'uppercase' }}>
            {error}
          </div>
        )}

        {lockedOut && (
          <div role="status" style={{ fontSize: 11, letterSpacing: 1.2, color: A.muted, textTransform: 'uppercase' }}>
            LOCKED · {formatRemaining(remainingMs)} REMAINING
          </div>
        )}

        {working && (
          <div role="status" style={{ fontSize: 11, letterSpacing: 1.2, color: A.muted, textTransform: 'uppercase' }}>
            WORKING…
          </div>
        )}

        <button
          type="submit"
          disabled={!pin || working || lockedOut}
          style={{
            fontFamily: A.font,
            fontSize: 12,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            padding: '10px 14px',
            background: A.ink,
            color: A.bg,
            border: `1px solid ${A.ink}`,
            cursor: (!pin || working || lockedOut) ? 'not-allowed' : 'pointer',
            opacity: (!pin || working || lockedOut) ? 0.5 : 1,
          }}
        >
          {working ? 'UNLOCKING…' : 'UNLOCK'}
        </button>
      </form>
    </div>
  );
}

export default LockScreen;
