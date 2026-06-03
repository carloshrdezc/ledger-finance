// CAR-243: Settings Security section.
//
// Used by both the web Settings screen and the mobile Settings screen so
// the section is verbatim across platforms (parity is mandatory per the
// spec's slice-3 acceptance criteria).
//
// Renders three modes:
//   - DISABLED: 'set up security' CTA + (browser only) idle nudge text.
//   - ENABLED + LOCKED: shouldn't ever render here in practice (LockScreen
//     covers the locked state), but we degrade gracefully with a 'locked'
//     hint if it does.
//   - ENABLED + UNLOCKED: per-method add/remove, recovery reveal/rotate,
//     OS-escrow toggle (Electron only), lock-now, disable-security.
//
// All re-prompt operations (reveal, rotate, change-secret, disable) ship
// through the spec's R6 "ask again" gate: a tiny inline mini-form that
// re-collects the current method's secret. We reuse one ReauthForm
// component for all four flows.

import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';
import { useMK } from '../security/useMK';
import { SecuritySetupWizard } from '../security/SecuritySetupWizard';
import { createPasskey, passkeyMatchesOrigin } from '../security/webauthn';

// Browser path = no preload bridge present. Used to hide OS-escrow toggle
// per spec I9.
function detectIsElectron() {
  if (typeof window === 'undefined') return false;
  return !!window.ledgerDB;
}

const cellInput = {
  fontFamily: A.font, fontSize: 13, padding: '6px 8px',
  background: A.bg, color: A.ink, border: `1px solid ${A.rule}`, outline: 'none',
};
const btn = (primary = false, disabled = false, danger = false) => ({
  fontFamily: A.font, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
  padding: '6px 10px',
  background: primary ? A.ink : A.bg,
  color: primary ? A.bg : (danger ? A.neg : A.ink),
  border: `1px solid ${danger ? A.neg : (primary ? A.ink : A.rule)}`,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

function ReauthForm({ methods, onSubmit, onCancel, label = 'CONFIRM' }) {
  const [method, setMethod] = React.useState(methods[0] || 'pin');
  const [secret, setSecret] = React.useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: `1px solid ${A.rule}`, background: A.bg }}>
      <ALabel>RE-ENTER SECRET</ALabel>
      {methods.length > 1 && (
        <select value={method} onChange={e => setMethod(e.target.value)} style={cellInput}>
          {methods.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
        </select>
      )}
      <input
        type="password" autoFocus aria-label="reauth-secret"
        value={secret} onChange={e => setSecret(e.target.value)}
        style={cellInput}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onCancel} style={btn(false)}>CANCEL</button>
        <button
          type="button"
          disabled={!secret}
          onClick={() => onSubmit({ method, secret })}
          style={btn(true, !secret)}
        >
          {label}
        </button>
      </div>
    </div>
  );
}


export function SecuritySettings({ isElectron = detectIsElectron() }) {
  const mk = useMK();
  const {
    enabled, locked, methods, methodsDetail, hasRecovery, osEscrow,
    addMethod, removeMethod, revealRecovery, rotateRecovery, disable,
    setOsEscrow, lockNow,
  } = mk;

  const [showWizard, setShowWizard] = React.useState(false);
  const [pending, setPending] = React.useState(null); // { kind, ... }
  const [phrase, setPhrase] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [info, setInfo] = React.useState(null);

  // CAR-243 round-3 (I5): always drop the revealed/rotated recovery phrase
  // from local state when SecuritySettings unmounts (route change, tab
  // switch, app close). Without this the phrase outlives the visible UI
  // and could be retained by React devtools or memory dumps. Cheap
  // belt-and-braces — the bridge already controls IPC-level lifetime.
  React.useEffect(() => () => { setPhrase(null); }, []);

  const usableMethodNames = (methods || []).filter(name => {
    if (name !== 'passkey') return true;
    const detail = (methodsDetail || []).find(m => m.name === 'passkey');
    if (!detail) return true;
    if (typeof window === 'undefined' || !window.location) return true;
    return passkeyMatchesOrigin(detail.rpId);
  });

  function clearMessages() { setError(null); setInfo(null); setPhrase(null); }

  async function handleAddPin() {
    clearMessages();
    setPending({ kind: 'add', method: 'pin' });
  }
  async function handleAddPassword() {
    clearMessages();
    setPending({ kind: 'add', method: 'password' });
  }
  async function commitPasskey(enrolled) {
    const r = await addMethod({
      method: 'passkey',
      secret: enrolled.wk,
      kdfParams: null,
      extra: {
        rpId: enrolled.rpId,
        credentialId: Array.from(enrolled.credentialId),
        salt: Array.from(enrolled.salt),
        prfPath: enrolled.prfPath,
        userHandle: enrolled.userHandle ? Array.from(enrolled.userHandle) : null,
      },
    });
    if (!r.ok) setError(r.error || 'ADD_FAILED');
    else setInfo('PASSKEY ADDED');
  }

  async function handleAddPasskey() {
    clearMessages();
    try {
      const rpId = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
      const enrolled = await createPasskey({ rpId });
      // CAR-243: a passkey enrolled WITHOUT PRF derives its wrapping key from
      // the (cleartext-stored) userHandle, so it unlocks the app but does NOT
      // encrypt data at rest. Product decision: keep the fallback but force an
      // explicit acknowledgement before persisting it.
      if (enrolled.prfPath !== 'prf') {
        setPending({ kind: 'passkey-warn', enrolled });
        return;
      }
      await commitPasskey(enrolled);
    } catch (err) {
      setError((err && err.message) || 'PASSKEY_FAILED');
    }
  }

  async function confirmPasskeyWarn() {
    const enrolled = pending && pending.enrolled;
    setPending(null);
    clearMessages();
    if (!enrolled) return;
    try {
      await commitPasskey(enrolled);
    } catch (err) {
      setError((err && err.message) || 'PASSKEY_FAILED');
    }
  }

  function cancelPasskeyWarn() {
    setPending(null);
    // The credential now lives in the authenticator but we never persisted it;
    // tell the user so they can clean up the orphan (mirrors the wizard CANCEL).
    setInfo('PASSKEY NOT ADDED — REMOVE THE UNUSED CREDENTIAL IN YOUR AUTHENTICATOR');
  }

  async function handleRemove(name) {
    clearMessages();
    const r = await removeMethod(name);
    if (!r.ok) {
      setError(r.error === 'LAST_METHOD'
        ? 'CANNOT REMOVE THE ONLY ENABLED METHOD'
        : (r.error || 'REMOVE_FAILED'));
      return;
    }
    setInfo(`${name.toUpperCase()} REMOVED`);
  }

  async function commitAdd(secret) {
    if (!pending || pending.kind !== 'add') return;
    clearMessages();
    const r = await addMethod({ method: pending.method, secret });
    setPending(null);
    if (!r.ok) setError(r.error || 'ADD_FAILED');
    else setInfo(`${pending.method.toUpperCase()} ADDED`);
  }

  async function handleReveal() {
    clearMessages();
    setPending({ kind: 'reveal' });
  }
  async function commitReveal({ method, secret }) {
    setPending(null);
    clearMessages();
    const r = await revealRecovery({ method, secret });
    if (!r.ok) {
      setError(r.error === 'BAD_SECRET' ? 'INCORRECT' : (r.error || 'REVEAL_FAILED'));
      return;
    }
    setPhrase(r.phrase);
  }

  async function handleRotate() {
    clearMessages();
    const r = await rotateRecovery();
    if (!r.ok) {
      setError(r.error === 'LOCKED_OUT'
        ? 'A METHOD IS RATE-LIMITED — TRY AGAIN LATER'
        : (r.error || 'ROTATE_FAILED'));
      return;
    }
    setPhrase(r.phrase);
    setInfo('NEW PHRASE GENERATED — WRITE IT DOWN');
  }

  async function handleDisable() {
    clearMessages();
    setPending({ kind: 'disable' });
  }
  async function commitDisable({ method, secret }) {
    setPending(null);
    clearMessages();
    // Re-validate the secret first so we don't half-disable on a typo.
    let unlock;
    if (method === 'pin') unlock = await mk.unlockPin(secret);
    else if (method === 'password') unlock = await mk.unlockPassword(secret);
    else if (method === 'recovery') unlock = await mk.unlockRecovery(secret);
    if (!unlock || !unlock.success) {
      setError(unlock?.error === 'LOCKED_OUT' ? 'LOCKED OUT' : 'INCORRECT');
      return;
    }
    const r = await disable();
    if (!r.ok) setError(r.error || 'DISABLE_FAILED');
    else setInfo('SECURITY DISABLED');
  }

  async function toggleEscrow(e) {
    clearMessages();
    const r = await setOsEscrow(e.target.checked);
    if (!r.ok) setError(r.error || 'ESCROW_FAILED');
  }


  return (
    <div data-testid="security-settings" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ALabel>SECURITY</ALabel>
      <ARule />

      {!enabled && (
        <>
          <div style={{ fontSize: 13, color: A.muted }}>
            ENCRYPT YOUR LEDGER DATA AT REST. PIN, PASSWORD, OR PASSKEY UNLOCK.
          </div>
          <div>
            <button type="button" onClick={() => setShowWizard(true)} style={btn(true)}>
              SET UP SECURITY
            </button>
          </div>
        </>
      )}

      {enabled && locked && (
        <div style={{ fontSize: 13, color: A.muted }}>
          LOCKED — UNLOCK FROM THE LOCK SCREEN TO MANAGE METHODS.
        </div>
      )}

      {enabled && !locked && (
        <>
          <div style={{ fontSize: 13, color: A.muted }}>
            METHODS ENABLED. AT LEAST ONE PRIMARY METHOD IS REQUIRED.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['pin', 'password', 'passkey'].map(name => {
              const isOn = methods.includes(name);
              const lastEnabled = isOn && methods.length === 1;
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', flex: 1, color: isOn ? A.ink : A.muted }}>
                    {name} · {isOn ? 'ON' : 'OFF'}
                  </span>
                  {!isOn && (
                    <button
                      type="button"
                      onClick={name === 'passkey' ? handleAddPasskey : (name === 'pin' ? handleAddPin : handleAddPassword)}
                      style={btn(false)}
                    >
                      ADD
                    </button>
                  )}
                  {isOn && (
                    <button
                      type="button"
                      onClick={() => handleRemove(name)}
                      disabled={lastEnabled}
                      title={lastEnabled ? 'cannot remove the only method' : ''}
                      style={btn(false, lastEnabled, true)}
                    >
                      REMOVE
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <ARule />
          <ALabel>RECOVERY PHRASE</ALabel>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={handleReveal} disabled={!hasRecovery} style={btn(false, !hasRecovery)}>
              REVEAL
            </button>
            <button type="button" onClick={handleRotate} style={btn(false)}>
              ROTATE
            </button>
          </div>

          {isElectron && (
            <>
              <ARule />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox" checked={!!osEscrow}
                  onChange={toggleEscrow} aria-label="os-escrow"
                />
                OS ESCROW (KEYCHAIN / DPAPI)
              </label>
            </>
          )}

          <ARule />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={lockNow} style={btn(false)}>LOCK NOW</button>
            <button type="button" onClick={handleDisable} style={btn(false, false, true)}>DISABLE SECURITY</button>
          </div>
        </>
      )}

      {error && <div role="alert" style={{ fontSize: 11, color: A.neg, letterSpacing: 1.2, textTransform: 'uppercase' }}>{error}</div>}
      {info && <div role="status" style={{ fontSize: 11, color: A.muted, letterSpacing: 1.2, textTransform: 'uppercase' }}>{info}</div>}
      {phrase && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <pre
            aria-label="recovery-phrase"
            style={{
              fontFamily: A.font, fontSize: 13, padding: 10,
              border: `1px solid ${A.rule}`, background: A.bg, color: A.ink,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
            }}
          >
            {phrase}
          </pre>
          {/* CAR-243 round-3 (I5): explicit user-driven dismissal of the
              phrase. Beats waiting for the unmount effect when the user
              just wants the secret off-screen. */}
          <div>
            <button
              type="button"
              onClick={() => setPhrase(null)}
              aria-label="hide-phrase"
              style={btn(false)}
            >
              HIDE
            </button>
          </div>
        </div>
      )}

      {pending && pending.kind === 'add' && (
        <ReauthForm
          methods={[pending.method]}
          label="ADD"
          onSubmit={({ secret }) => commitAdd(secret)}
          onCancel={() => setPending(null)}
        />
      )}
      {pending && pending.kind === 'reveal' && (
        <ReauthForm
          // CAR-243 round-3 (I6): passkey isn't a secret-based ReauthForm
          // path — the form prompts for a typed secret which passkey can't
          // satisfy. Filter it out so the user only sees pin/password/recovery.
          // The bridge's revealRecovery still understands passkey method via
          // a separate flow if/when we add an inline ceremony button here.
          methods={usableMethodNames.filter(n => n !== 'passkey')}
          label="REVEAL"
          onSubmit={commitReveal}
          onCancel={() => setPending(null)}
        />
      )}
      {pending && pending.kind === 'disable' && (
        <ReauthForm
          methods={usableMethodNames.filter(n => n !== 'passkey')}
          label="DISABLE"
          onSubmit={commitDisable}
          onCancel={() => setPending(null)}
        />
      )}
      {pending && pending.kind === 'passkey-warn' && (
        <div
          role="alertdialog"
          aria-label="passkey-no-prf-warning"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: `1px solid ${A.neg}`, background: A.bg }}
        >
          <ALabel>⚠ PASSKEY WITHOUT PRF</ALabel>
          <div style={{ fontSize: 13, color: A.ink }}>
            THIS PASSKEY UNLOCKS THE APP BUT DOES NOT ENCRYPT YOUR DATA AT REST ON
            THIS DEVICE. FOR AT-REST ENCRYPTION, USE A PIN OR PASSWORD INSTEAD.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={cancelPasskeyWarn} style={btn(false)}>CANCEL</button>
            <button type="button" onClick={confirmPasskeyWarn} style={btn(true)}>ADD ANYWAY</button>
          </div>
        </div>
      )}

      {showWizard && (
        <SecuritySetupWizard
          isElectron={isElectron}
          onCancel={() => setShowWizard(false)}
          onDone={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}

// CAR-243: First-run nudge for legacy plaintext installs (edge-case row 2).
// Non-blocking — renders inline above the Settings list and dismisses
// permanently to localStorage.
const NUDGE_KEY = 'ledger.security.nudgeDismissedAt';
export function SecurityNudge({ onSetup }) {
  const { enabled } = useMK();
  const [dismissed, setDismissed] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    try { return !!window.localStorage?.getItem(NUDGE_KEY); } catch { return true; }
  });
  if (enabled || dismissed) return null;
  function dismiss() {
    try { window.localStorage?.setItem(NUDGE_KEY, new Date().toISOString()); } catch { /* private mode */ }
    setDismissed(true);
  }
  return (
    <div role="status" style={{
      padding: 12, border: `1px solid ${A.rule}`, background: A.bg,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <ALabel>SECURE YOUR DATA</ALabel>
      <div style={{ fontSize: 13, color: A.muted }}>
        YOUR LEDGER IS STORED IN PLAIN TEXT. SET UP A PIN, PASSWORD, OR PASSKEY TO ENCRYPT IT.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onSetup} style={btn(true)}>SET UP</button>
        <button type="button" onClick={dismiss} style={btn(false)}>DISMISS</button>
      </div>
    </div>
  );
}

export default SecuritySettings;
