// CAR-242: Dev-only first-run security setup form.
//
// CAR-243 will replace this with a real Settings → Security panel. Until
// then this exists so Carlos (or any dev) can manually exercise the boot
// flow:
//   1. open `#dev-security-setup` in a fresh install
//   2. enter a PIN
//   3. confirm the recovery phrase displayed
//   4. reload — LockScreen appears, PIN unlocks the app.

import React from 'react';
import { A } from '../theme';
import { ALabel } from '../components/Shared';

export function SecuritySetupDev({ onClose }) {
  const [pin, setPin] = React.useState('');
  const [phrase, setPhrase] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const bridge = typeof window !== 'undefined' ? window.ledgerSecurity : undefined;

  const onSubmit = async event => {
    event.preventDefault();
    if (!bridge || !bridge.runSetupDev) {
      setError('SECURITY BRIDGE UNAVAILABLE');
      return;
    }
    if (!pin) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.runSetupDev(pin);
      if (result?.ok) {
        setPhrase(result.recoveryPhrase || 'PHRASE UNAVAILABLE');
      } else {
        setError('SETUP FAILED');
      }
    } catch (e) {
      setError(`SETUP FAILED: ${e?.message || 'UNKNOWN'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Dev security setup"
      style={{
        position: 'fixed',
        inset: 0,
        background: A.bg,
        color: A.ink,
        fontFamily: A.font,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9998,
      }}
    >
      <div
        style={{
          minWidth: 420,
          maxWidth: 560,
          padding: 32,
          border: `1px solid ${A.rule}`,
          background: A.bg2,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <ALabel>DEV · SECURITY SETUP</ALabel>
        {!phrase && (
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: A.muted }}>
              ENTER A PIN TO ENABLE AT-REST ENCRYPTION. THE EXISTING PLAINTEXT STORE
              WILL BE MIGRATED. SLICE 3 WILL REPLACE THIS WITH A REAL SETTINGS UI.
            </div>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={e => setPin(e.target.value)}
              aria-label="New PIN"
              disabled={busy}
              style={{
                fontFamily: A.font,
                fontSize: 18,
                letterSpacing: 4,
                padding: '8px 10px',
                background: A.bg,
                color: A.ink,
                border: `1px solid ${A.rule}`,
              }}
            />
            {error && (
              <div role="alert" style={{ color: A.neg, fontSize: 11, textTransform: 'uppercase' }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={!pin || busy}
              style={{
                fontFamily: A.font,
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                padding: '10px 14px',
                background: A.ink,
                color: A.bg,
                border: `1px solid ${A.ink}`,
                cursor: (!pin || busy) ? 'not-allowed' : 'pointer',
                opacity: (!pin || busy) ? 0.5 : 1,
              }}
            >
              {busy ? 'SETTING UP…' : 'ENABLE SECURITY'}
            </button>
          </form>
        )}
        {phrase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ALabel>RECOVERY PHRASE — WRITE THIS DOWN</ALabel>
            <div
              style={{
                fontFamily: A.font,
                fontSize: 14,
                lineHeight: 1.6,
                padding: 12,
                background: A.bg,
                border: `1px solid ${A.rule}`,
                wordBreak: 'break-word',
              }}
            >
              {phrase}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                fontFamily: A.font,
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                padding: '10px 14px',
                background: A.ink,
                color: A.bg,
                border: `1px solid ${A.ink}`,
                cursor: 'pointer',
              }}
            >
              I'VE WRITTEN IT DOWN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SecuritySetupDev;
