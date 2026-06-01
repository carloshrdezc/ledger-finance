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
  const [error, setError] = React.useState(null);

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
    // I9: OS escrow defaults ON in Electron, OFF in browser. The toggle
    // lives in Settings post-setup; we just seed the safer default here.
    const result = await setup({ methods, osEscrow: !!isElectron });
    if (!result || !result.ok) {
      setError((result && result.error) || 'SETUP FAILED');
      return;
    }
    setPhrase(result.recoveryPhrase);
    setStep(3);
  }

  function finish() {
    if (typeof onDone === 'function') onDone(phrase);
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
              <button type="button" onClick={onCancel} style={btn(false)}>CANCEL</button>
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
              </div>
            )}
            {error && <div role="alert" style={{ fontSize: 11, color: A.neg, letterSpacing: 1.2 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setStep(1)} style={btn(false)}>BACK</button>
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
              style={{
                fontFamily: A.font, fontSize: 14, letterSpacing: 1, lineHeight: 1.6,
                padding: 12, background: A.bg, border: `1px solid ${A.rule}`, color: A.ink,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
              }}
            >
              {phrase}
            </pre>
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
