import React from 'react';
import { A } from '../theme';
import { ALabel, ARule } from './Shared';

// Shared in-app modal for the saved-views flow. Electron's renderer does not
// implement window.prompt/confirm/alert, so these replace those calls.
//
// Two modes:
//   mode="prompt"  -> collect a text name. Optionally (showPeriodChoice) also
//                     collect the "follow current period vs snapshot" choice,
//                     rendered as two explicit radio options (NOT an OK/Cancel
//                     confirm). Used by save (with period choice) and rename
//                     (name only).
//   mode="confirm" -> a small in-app confirmation (used by delete).
//
// The parent owns submission and may pass `error` to render an inline error
// (e.g. LEDGER_DUPLICATE_VIEW_NAME) and keep the modal open. Enter submits,
// Escape cancels.
//
// All styling goes through the `A` token object — no hardcoded hex. IBM Plex
// Mono via A.font; all-caps labels via <ALabel>.
export default function ViewPromptModal({
  mode = 'prompt',
  title,
  label = 'VIEW NAME',
  placeholder = 'E.G. MONTHLY REPORT',
  initialValue = '',
  showPeriodChoice = false,
  periodLabel = '',
  accent,
  confirmLabel = 'SAVE',
  cancelLabel = 'CANCEL',
  error = null,
  message = '',
  onSubmit,
  onClose,
}) {
  const [name, setName] = React.useState(initialValue);
  // false = snapshot this period, true = follow current period.
  const [followCurrent, setFollowCurrent] = React.useState(false);

  const isConfirm = mode === 'confirm';
  const trimmed = name.trim();
  const canSubmit = isConfirm ? true : trimmed.length > 0;

  const submit = React.useCallback(() => {
    if (isConfirm) {
      onSubmit();
      return;
    }
    if (!trimmed) return;
    onSubmit({ name: trimmed, followCurrent });
  }, [isConfirm, trimmed, followCurrent, onSubmit]);

  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        // Don't hijack Enter inside the textarea-less prompt unless valid.
        if (canSubmit) {
          e.preventDefault();
          submit();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, submit, canSubmit]);

  const accentColor = accent || A.ink;

  const input = {
    width: '100%', background: 'transparent', border: 'none',
    borderBottom: '1px solid ' + A.ink, color: A.ink,
    fontFamily: A.font, fontSize: 13, padding: '6px 0', outline: 'none',
    boxSizing: 'border-box',
  };
  const fieldLabel = { fontSize: 9, color: A.muted, letterSpacing: 1.6, marginBottom: 4 };
  const radioRow = {
    display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
    fontSize: 11, letterSpacing: 0.8, lineHeight: 1.5, color: A.ink,
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,15,0.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          background: A.bg, border: '2px solid ' + A.ink,
          width: 380, maxWidth: '92vw', padding: 28, fontFamily: A.font,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <ALabel>{title}</ALabel>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: A.muted, letterSpacing: 1 }}>ESC ×</button>
        </div>
        <ARule thick />

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isConfirm ? (
            <div style={{ fontSize: 12, color: A.ink, lineHeight: 1.6 }}>{message}</div>
          ) : (
            <>
              <div>
                <div style={fieldLabel}>{label}</div>
                <input
                  aria-label={label}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={placeholder}
                  style={input}
                  autoFocus
                />
              </div>

              {showPeriodChoice && (
                <div>
                  <div style={fieldLabel}>PERIOD</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                    <label style={radioRow}>
                      <input
                        type="radio"
                        name="view-period-choice"
                        checked={!followCurrent}
                        onChange={() => setFollowCurrent(false)}
                      />
                      <span>SNAPSHOT THIS PERIOD{periodLabel ? ` · ${periodLabel}` : ''}</span>
                    </label>
                    <label style={radioRow}>
                      <input
                        type="radio"
                        name="view-period-choice"
                        checked={followCurrent}
                        onChange={() => setFollowCurrent(true)}
                      />
                      <span>FOLLOW CURRENT PERIOD</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div role="alert" style={{ fontSize: 11, color: A.neg, letterSpacing: 0.5, lineHeight: 1.5 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <button onClick={onClose} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.5,
            padding: '8px 16px', border: '1px solid ' + A.rule2, color: A.ink,
          }}>{cancelLabel}</button>
          <button onClick={submit} disabled={!canSubmit} style={{
            all: 'unset', cursor: canSubmit ? 'pointer' : 'default', fontSize: 11,
            letterSpacing: 1.5, padding: '8px 20px',
            background: canSubmit ? (isConfirm ? A.neg : accentColor) : A.rule2,
            color: canSubmit ? A.bg : A.muted,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
