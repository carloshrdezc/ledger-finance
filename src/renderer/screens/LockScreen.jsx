// CAR-242 + CAR-243: Cold-start / locked-state UI.
//
// Slice 2 was PIN-only. Slice 3 adds password, passkey, and recovery as
// alternate unlock paths. Method tabs render only when the method is
// `enabled` in main's state, and the browser path additionally hides
// passkeys whose RP ID doesn't match the current origin
// (METHOD_UNAVAILABLE_ON_ORIGIN, spec edge-case row 4).
//
// Theme tokens via `A`; all-caps labels via `<ALabel>`; IBM Plex Mono only.
// The KDF runs in main — Argon2id can hit ~1s on weak hardware so we show
// a spinner via `working` while the unlock IPC is in flight.

import React from 'react';
import { A } from '../theme';
import { ALabel } from '../components/Shared';
import { useMK } from '../security/useMK';
import { getPasskeyWk, passkeyMatchesOrigin } from '../security/webauthn';

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

function classifyError(error) {
  switch (error) {
    case 'LOCKED_OUT': return 'TOO MANY ATTEMPTS — TRY AGAIN LATER';
    case 'METHOD_AUTO_DISABLED': return 'PIN DISABLED — USE ANOTHER METHOD';
    case 'BAD_SECRET': return 'INCORRECT';
    case 'NOT_ENABLED': return 'METHOD NOT ENABLED';
    case 'PHRASE_DECRYPT_FAILED': return 'BAD PHRASE';
    default: return 'UNLOCK FAILED';
  }
}

const TAB_LABELS = {
  pin: 'PIN',
  password: 'PASSWORD',
  passkey: 'PASSKEY',
  recovery: 'RECOVERY',
};

export function LockScreen() {
  const mk = useMK();
  const {
    unlockPin, unlockPassword, unlockPasskey, unlockRecovery,
    methods, methodsDetail, lockedUntil, working,
  } = mk;
  // Available methods = enabled methods (from main) minus origin-mismatched
  // passkeys (browser-only filter; Electron passes through).
  const usableMethods = React.useMemo(() => {
    const detail = (methodsDetail && methodsDetail.length) ? methodsDetail
      : (methods || []).map(name => ({ name }));
    return detail.filter(m => {
      if (m.name !== 'passkey') return true;
      // Skip the filter when window.location is unavailable (Electron + tests).
      if (typeof window === 'undefined' || !window.location) return true;
      return passkeyMatchesOrigin(m.rpId);
    });
  }, [methods, methodsDetail]);

  const [active, setActive] = React.useState(() => usableMethods[0]?.name || 'pin');
  // CAR-243 round-4 (I4 focus management): per-tab refs + effect so arrow-
  // key navigation moves keyboard focus alongside aria-selected. Without
  // this the previously-focused tab gets tabIndex=-1 on re-render and
  // focus drops to <body>, leaving the user with no visible focus ring.
  // Per WAI-ARIA tabs pattern: arrow keys must move BOTH selection AND
  // focus. https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
  const tabRefs = React.useRef({});
  const arrowMovedRef = React.useRef(false);
  React.useEffect(() => {
    if (!arrowMovedRef.current) return;
    arrowMovedRef.current = false;
    const node = tabRefs.current[active];
    if (node && typeof node.focus === 'function') node.focus();
  }, [active]);
  React.useEffect(() => {
    if (!usableMethods.find(m => m.name === active) && usableMethods[0]) {
      setActive(usableMethods[0].name);
    }
  }, [usableMethods, active]);

  const [secret, setSecret] = React.useState('');
  const [error, setError] = React.useState(null);
  const [localLockedUntil, setLocalLockedUntil] = React.useState(lockedUntil);

  React.useEffect(() => {
    setLocalLockedUntil(lockedUntil);
  }, [lockedUntil]);

  React.useEffect(() => {
    setSecret('');
    setError(null);
  }, [active]);

  const remainingMs = useCountdown(localLockedUntil);
  const lockedOut = remainingMs > 0;

  async function runUnlock() {
    setError(null);
    let result;
    try {
      if (active === 'pin') result = await unlockPin(secret);
      else if (active === 'password') result = await unlockPassword(secret);
      else if (active === 'recovery') result = await unlockRecovery(secret);
      else if (active === 'passkey') {
        const passkeyDetail = usableMethods.find(m => m.name === 'passkey');
        if (!passkeyDetail) {
          setError('PASSKEY UNAVAILABLE');
          return;
        }
        const wk = await getPasskeyWk({
          credentialId: passkeyDetail.credentialId,
          rpId: passkeyDetail.rpId,
          salt: passkeyDetail.salt,
          prfPath: passkeyDetail.prfPath || 'prf',
          userHandle: passkeyDetail.userHandle,
        });
        result = await unlockPasskey(wk);
      }
    } catch (err) {
      setError((err && err.message) || 'UNLOCK FAILED');
      return;
    }
    if (result && result.success) {
      setSecret('');
      return;
    }
    if (result && result.lockedUntil) setLocalLockedUntil(result.lockedUntil);
    setError(classifyError(result && result.error));
  }

  const onSubmit = React.useCallback(async event => {
    event.preventDefault();
    if (working || lockedOut) return;
    if (active !== 'passkey' && !secret) return;
    await runUnlock();
  }, [secret, active, working, lockedOut, unlockPin, unlockPassword, unlockPasskey, unlockRecovery, usableMethods]);

  const placeholder = {
    pin: 'PIN',
    password: 'PASSWORD',
    recovery: 'TWELVE-WORD RECOVERY PHRASE',
  }[active];

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
          minWidth: 360,
          padding: 32,
          border: `1px solid ${A.rule}`,
          background: A.bg2,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <ALabel>LEDGER · LOCKED</ALabel>

        {usableMethods.length > 1 && (
          // CAR-243 round-3/4 (I4): WAI-ARIA tabs pattern — roving tabindex,
          // arrow-key navigation moving BOTH selection AND focus, aria-controls
          // wiring the tab to its panel. Round-4 fixes: focus now follows
          // arrow-key selection (was dropping to <body>), and the `tabpanel`
          // role is gated so `aria-labelledby` only points at a rendered id.
          <div role="tablist" aria-label="Unlock methods" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
              e.preventDefault();
              const idx = usableMethods.findIndex(m => m.name === active);
              let nextIdx = idx;
              if (e.key === 'ArrowLeft')  nextIdx = (idx - 1 + usableMethods.length) % usableMethods.length;
              if (e.key === 'ArrowRight') nextIdx = (idx + 1) % usableMethods.length;
              if (e.key === 'Home')       nextIdx = 0;
              if (e.key === 'End')        nextIdx = usableMethods.length - 1;
              arrowMovedRef.current = true;
              setActive(usableMethods[nextIdx].name);
            }}
          >
            {usableMethods.map(m => (
              <button
                key={m.name}
                ref={el => { if (el) tabRefs.current[m.name] = el; }}
                type="button"
                role="tab"
                id={`unlock-tab-${m.name}`}
                aria-selected={active === m.name}
                aria-controls="unlock-tabpanel"
                tabIndex={active === m.name ? 0 : -1}
                onClick={() => setActive(m.name)}
                style={{
                  fontFamily: A.font,
                  fontSize: 11,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  padding: '4px 10px',
                  background: active === m.name ? A.ink : A.bg,
                  color: active === m.name ? A.bg : A.ink,
                  border: `1px solid ${A.rule}`,
                  cursor: 'pointer',
                }}
              >
                {TAB_LABELS[m.name] || m.name.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* CAR-243 round-4 (I4b): only attach tabpanel semantics when there
            are real tabs to label this panel. Otherwise `aria-labelledby`
            would point at a non-existent id (broken aria reference) and
            screen readers would announce an empty accessible name. The
            children are identical between the two branches; only the
            outer wrapper's a11y attributes differ. */}
        <div
          {...(usableMethods.length > 1
            ? { id: 'unlock-tabpanel', role: 'tabpanel', 'aria-labelledby': `unlock-tab-${active}` }
            : {})}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div style={{ fontSize: 14, color: A.ink }}>
            {active === 'passkey'
              ? 'PRESS UNLOCK AND APPROVE ON YOUR AUTHENTICATOR'
              : `ENTER ${active.toUpperCase()} TO UNLOCK`}
          </div>

          {active !== 'passkey' && (
            <input
              type={active === 'recovery' ? 'text' : 'password'}
              inputMode={active === 'pin' ? 'numeric' : 'text'}
              autoFocus
              value={secret}
              onChange={e => setSecret(e.target.value)}
              aria-label={TAB_LABELS[active] || active}
              disabled={working || lockedOut}
              style={{
                fontFamily: A.font,
                fontSize: active === 'pin' ? 18 : 14,
                letterSpacing: active === 'pin' ? 4 : 1,
                padding: '8px 10px',
                background: A.bg,
                color: A.ink,
                border: `1px solid ${A.rule}`,
                outline: 'none',
              }}
            />
          )}

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
            disabled={(active !== 'passkey' && !secret) || working || lockedOut}
            style={{
              fontFamily: A.font,
              fontSize: 12,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              padding: '10px 14px',
              background: A.ink,
              color: A.bg,
              border: `1px solid ${A.ink}`,
              cursor: ((active !== 'passkey' && !secret) || working || lockedOut) ? 'not-allowed' : 'pointer',
              opacity: ((active !== 'passkey' && !secret) || working || lockedOut) ? 0.5 : 1,
            }}
          >
            {working ? 'UNLOCKING…' : 'UNLOCK'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LockScreen;
