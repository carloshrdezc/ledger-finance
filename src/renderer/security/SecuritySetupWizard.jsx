// CAR-243: First-run setup wizard. Replaces slice-2 setupScaffold.jsx.
//
// Three steps:
//   1. Choose at least one method (PIN / password / passkey).
//   2. Enter the secret(s) for each chosen method (passkey is a ceremony,
//      not a typed secret).
//   3. Display the 12-word recovery phrase, require explicit "I've written
//      it down" confirmation, then commit.
//
// Cancel at any point leaves the user with security:false (today's
// behaviour). Completion fires `onDone(recoveryPhrase)` and the host UI
// transitions to "enabled" state via security:state-changed.

import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from '../components/Shared';
import { useMK } from './useMK';
import { createPasskey } from './webauthn';

const METHOD_LABELS = {
  pin: 'PIN (4-6 digits)',
  password: 'PASSWORD',
  passkey: 'PASSKEY (FIDO2 / TouchID / etc.)',
};

const cellInput = {
  fontFamily: A.font,
  fontSize: 14,
  padding: '8px 10px',
  background: A.bg,
  color: A.ink,
  border: `1px solid ${A.rule}`,
  outline: 'none',
};

const btn = (primary = false, disabled = false) => ({
  fontFamily: A.font,
  fontSize: 12,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  padding: '10px 14px',
  background: primary ? A.ink : A.bg,
  color: primary ? A.bg : A.ink,
  border: `1px solid ${primary ? A.ink : A.rule}`,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});


export function SecuritySetupWizard({ onDone, onCancel, isElectron = (typeof window !== 'undefined' && !!window.ledgerDB) }) {
  const { setup, working } = useMK();
  const [step, setStep] = React.useState(1);
  const [chosen, setChosen] = React.useState({ pin: false, password: false, passkey: false });
  const [pin, setPin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [passwordConfirm, setPasswordConfirm] = React.useState('');
  const [passkey, setPasskey] = React.useState(null); // {credentialId, rpId, salt, prfPath, wk, userHandle}
  const [phrase, setPhrase] = React.useState(null);
  const [phraseAck, setPhraseAck] = React.useState(false);
  const [phraseHidden, setPhraseHidden] = React.useState(false);
  const [error, setError] = React.useState(null);

  // CAR-243 round-3 (I5): unconditionally drop the recovery phrase from
  // memory on unmount. Even if the parent forgets to clear it, we don't
  // want it lingering in the React tree if the wizard is teared down for
  // any reason (route change, error boundary, app reload).
  React.useEffect(() => () => { setPhrase(null); }, []);

  const anyChosen = chosen.pin || chosen.password || chosen.passkey;

  function toggleMethod(name) {
    setChosen(c => ({ ...c, [name]: !c[name] }));
  }

  async function enrollPasskey() {
    setError(null);
    try {
      const rpId = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
      const result = await createPasskey({ rpId });
      setPasskey(result);
    } catch (err) {
      setError((err && err.message) || 'PASSKEY ENROLLMENT FAILED');
    }
  }

  function step1Valid() { return anyChosen; }
  function step2Valid() {
    if (chosen.pin && !/^[0-9]{4,6}$/.test(pin)) return false;
    if (chosen.password) {
      if (!password || password.length < 8) return false;
      if (password !== passwordConfirm) return false;
    }
    if (chosen.passkey && !passkey) return false;
    return true;
  }

  async function commit() {
    setError(null);
    const methods = {};
    if (chosen.pin) methods.pin = { secret: pin, length: pin.length };
    if (chosen.password) methods.password = { secret: password };
    if (chosen.passkey && passkey) {
      methods.passkey = {
        kdf: 'raw',
        secret: passkey.wk,
        // Public per-method metadata so unlock can replay PRF.
        rpId: passkey.rpId,
        credentialId: Array.from(passkey.credentialId),
        salt: Array.from(passkey.salt),
        prfPath: passkey.prfPath,
        userHandle: passkey.userHandle ? Array.from(passkey.userHandle) : null,
      };
    }
    // CAR-243 round-3 (I1): wrap the commit in try/catch. setup() can
    // reject from IPC failures (main process crashed, channel torn down,
    // schema-validation errors thrown after the round-2 hardening). A
    // bare await would let the rejection bubble to the React tree as an
    // unhandled error; we want a clean inline alert instead.
    try {
      // I9: OS escrow defaults ON in Electron, OFF in browser. The toggle
      // lives in Settings post-setup; we just seed the safer default here.
      const result = await setup({ methods, osEscrow: !!isElectron });
      if (!result || !result.ok) {
        setError((result && result.error) || 'SETUP FAILED');
        return;
      }
      setPhrase(result.recoveryPhrase);
      setStep(3);
    } catch (err) {
      // Surface a redacted message — never leak err.stack into the UI.
      setError((err && err.message) || 'SETUP FAILED');
    }
  }

  function finish() {
    // CAR-243 round-3 (I5): drop the phrase from state immediately on
    // confirm so it does not linger in the React tree after the wizard
    // closes. The parent gets a single ref via onDone; we hand it off and
    // forget it.
    const captured = phrase;
    setPhrase(null);
    if (typeof onDone === 'function') onDone(captured);
  }

  // CAR-243 round-3/4 (I2): if the user enrolled a passkey then bails out
  // before commit, the WebAuthn credential exists at the OS but is
  // orphaned (we never persisted the wrapped key alongside it). We can't
  // programmatically revoke it (browsers don't expose that API), so we
  // surface a one-line in-app hint pointing the user at their OS settings.
  // Round-4 fixes the hint to be inline UI instead of `window.alert`
  // (alert blocks the renderer, can't be styled, looks like a system
  // error in Electron) and gates a confirmation step so the user reads
  // it before the wizard tears down.
  const [pendingOrphanCancel, setPendingOrphanCancel] = React.useState(false);
  function cancelWithHint() {
    if (passkey) {
      // Show the inline notice; the actual cancel only fires when the
      // user acknowledges via the confirm button below.
      setPendingOrphanCancel(true);
      return;
    }
    if (typeof onCancel === 'function') onCancel();
  }
  function confirmOrphanCancel() {
    setPendingOrphanCancel(false);
    if (typeof onCancel === 'function') onCancel();
  }
  function dismissOrphanCancel() {
    setPendingOrphanCancel(false);
  }

  return (
    <div role="dialog" aria-label="Set up security" style={{
      position: 'fixed', inset: 0, background: A.bg, color: A.ink,
      fontFamily: A.font, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
    }}>
      <div style={{
        minWidth: 480, maxWidth: 600, padding: 32,
        border: `1px solid ${A.rule}`, background: A.bg2,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <ALabel>SECURE YOUR DATA · STEP {step} OF 3</ALabel>
        <ARule />

        {/* CAR-243 round-4 (I2): inline orphan-passkey acknowledgement. Replaces
            the round-3 `window.alert` — styled, non-blocking, and the user
            must explicitly confirm before the wizard tears down. */}
        {pendingOrphanCancel && (
          <div
            role="alertdialog"
            aria-label="Orphan passkey warning"
            style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: 12, border: `1px solid ${A.neg}`, background: A.bg,
              fontSize: 12, color: A.ink, letterSpacing: 1.2,
            }}
          >
            <ALabel>ORPHAN PASSKEY · CONFIRM CANCEL</ALabel>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: A.muted, letterSpacing: 0 }}>
              A passkey was enrolled at your OS or browser before you cancelled.
              No data is at risk, but the credential is now orphaned. You may
              want to delete it from your OS keychain or browser passkey
              manager.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={dismissOrphanCancel} style={btn(false)}>KEEP EDITING</button>
              <button type="button" onClick={confirmOrphanCancel} style={btn(true)}>CANCEL ANYWAY</button>
            </div>
          </div>
        )}


        {step === 1 && (
          <>
            <div style={{ fontSize: 13, color: A.muted }}>
              CHOOSE AT LEAST ONE METHOD. YOU CAN ADD MORE LATER.
            </div>
            {Object.entries(METHOD_LABELS).map(([name, label]) => (
              <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!!chosen[name]}
                  onChange={() => toggleMethod(name)}
                  aria-label={name}
                />
                {label}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={cancelWithHint} style={btn(false)}>CANCEL</button>
              <button
                type="button"
                disabled={!step1Valid()}
                onClick={() => setStep(2)}
                style={btn(true, !step1Valid())}
              >
                NEXT
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {chosen.pin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <ALabel>PIN</ALabel>
                <input
                  type="password" inputMode="numeric" autoFocus
                  value={pin} onChange={e => setPin(e.target.value)}
                  aria-label="pin" style={cellInput}
                />
              </div>
            )}
            {chosen.password && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <ALabel>PASSWORD (8+ CHARACTERS)</ALabel>
                <input
                  type="password" autoFocus={!chosen.pin}
                  value={password} onChange={e => setPassword(e.target.value)}
                  aria-label="password" style={cellInput}
                />
                <input
                  type="password"
                  value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                  aria-label="password-confirm" placeholder="CONFIRM" style={cellInput}
                />
                {password && passwordConfirm && password !== passwordConfirm && (
                  <div role="alert" style={{ fontSize: 11, color: A.neg, letterSpacing: 1.2 }}>PASSWORDS DO NOT MATCH</div>
                )}
              </div>
            )}
            {chosen.passkey && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ALabel>PASSKEY</ALabel>
                <button
                  type="button" onClick={enrollPasskey}
                  disabled={!!passkey || working}
                  style={btn(false, !!passkey || working)}
                >
                  {passkey ? 'PASSKEY ENROLLED' : 'ENROLL PASSKEY'}
                </button>
                {/* CAR-243: loud non-PRF warning. A passkey enrolled without
                    PRF derives its key from the cleartext-stored userHandle, so
                    it unlocks but provides no at-rest encryption. The user sees
                    this before CREATE and can switch to PIN/password. */}
                {passkey && passkey.prfPath !== 'prf' && (
                  <div
                    role="alert"
                    aria-label="passkey-no-prf-warning"
                    style={{ fontSize: 12, color: A.neg, padding: 8, border: `1px solid ${A.neg}` }}
                  >
                    ⚠ THIS PASSKEY UNLOCKS THE APP BUT DOES NOT ENCRYPT YOUR DATA
                    AT REST ON THIS DEVICE. FOR AT-REST ENCRYPTION, ADD A PIN OR
                    PASSWORD INSTEAD.
                  </div>
                )}
              </div>
            )}
            {error && <div role="alert" style={{ fontSize: 11, color: A.neg, letterSpacing: 1.2 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setStep(1)} style={btn(false)}>BACK</button>
              {/* CAR-243 round-4 (I2): Step 2 also gets a CANCEL so the
                  orphan-passkey hint fires without forcing Back→Cancel. */}
              <button type="button" onClick={cancelWithHint} style={btn(false)}>CANCEL</button>
              <button
                type="button"
                disabled={!step2Valid() || working}
                onClick={commit}
                style={btn(true, !step2Valid() || working)}
              >
                {working ? 'SETTING UP…' : 'CREATE'}
              </button>
            </div>
          </>
        )}

        {step === 3 && phrase && (
          <>
            <div style={{ fontSize: 13, color: A.ink }}>
              WRITE THIS RECOVERY PHRASE DOWN. IT IS THE ONLY WAY TO RECOVER YOUR DATA IF YOU LOSE EVERY OTHER METHOD.
            </div>
            <pre
              aria-label="recovery-phrase"
              data-hidden={phraseHidden ? 'true' : 'false'}
              style={{
                fontFamily: A.font, fontSize: 14, letterSpacing: 1, lineHeight: 1.6,
                padding: 12, background: A.bg, border: `1px solid ${A.rule}`, color: A.ink,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                filter: phraseHidden ? 'blur(8px)' : 'none',
                userSelect: phraseHidden ? 'none' : 'auto',
              }}
            >
              {phraseHidden ? '••• ••• ••• ••• ••• ••• ••• ••• ••• ••• ••• •••' : phrase}
            </pre>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* CAR-243 round-3 (I5): give the user a way to mask the phrase
                  before stepping away from the screen. State is local — we
                  never round-trip through the bridge or storage. */}
              <button
                type="button"
                onClick={() => setPhraseHidden(h => !h)}
                style={btn(false)}
                aria-label={phraseHidden ? 'show-phrase' : 'hide-phrase'}
              >
                {phraseHidden ? 'SHOW' : 'HIDE'}
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <input
                type="checkbox" checked={phraseAck}
                onChange={e => setPhraseAck(e.target.checked)}
                aria-label="phrase-acknowledged"
              />
              I'VE WRITTEN IT DOWN SOMEWHERE SAFE
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                disabled={!phraseAck}
                onClick={finish}
                style={btn(true, !phraseAck)}
              >
                DONE
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SecuritySetupWizard;
