import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { useUndo } from '../UndoContext';

const FRESH_MS = 5000;
const ENTER_MS = 180;
const EXIT_MS  = 120;

export default function UndoToast() {
  const stack = useUndo();
  const fresh = stack.current();
  const [exiting, setExiting] = React.useState(false);

  // Reset exiting flag whenever a new fresh entry appears.
  // `version` bumps on every register/undo (including coalesced re-registers
  // that reuse the same entry id), so this catches a coalesced action that
  // arrives mid-fade-out and needs the toast back to its visible state.
  React.useEffect(() => {
    if (fresh) setExiting(false);
  }, [fresh?.entry.id, fresh?.mode, fresh?.version]);

  // Auto-dismiss: schedule fade-out after FRESH_MS, then unmount after EXIT_MS.
  // Both timers are cleaned up if `fresh` changes (new toast replaces this one,
  // including coalesced re-registers — `version` bumps on those) or the
  // component unmounts.
  React.useEffect(() => {
    if (!fresh) return undefined;
    let unmountTimer;
    const dismissTimer = setTimeout(() => {
      setExiting(true);
      unmountTimer = setTimeout(() => {
        stack.dismissCurrent();
      }, EXIT_MS);
    }, FRESH_MS);
    return () => {
      clearTimeout(dismissTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, [fresh?.entry.id, fresh?.mode, fresh?.version, stack]);

  if (!fresh) return null;

  const isUndoMode = fresh.mode === 'undo';
  const accentColor = isUndoMode ? A.neg : A.ink;
  const actionLabel = isUndoMode ? 'UNDO' : 'REDO';
  const ariaLabel = isUndoMode ? 'Undo last action' : 'Redo last undone action';
  const baseLabel = fresh.entry.label || (isUndoMode ? 'Action performed' : 'Action undone');
  const displayLabel = isUndoMode
    ? baseLabel.toUpperCase()
    : baseLabel
        .replace(/deleted$/i, 'restored')
        .replace(/removed$/i, 'restored')
        .replace(/archived$/i, 'unarchived')
        .replace(/hidden$/i, 'unhidden')
        .toUpperCase();

  const onAction = () => {
    if (isUndoMode) stack.undo();
    else            stack.redo();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      key={`${fresh.entry.id}-${fresh.mode}`}
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        zIndex: 1500,
        minWidth: 280,
        maxWidth: 420,
        background: A.bg2,
        border: '1px solid ' + A.ink,
        fontFamily: A.font,
        color: A.ink,
        display: 'flex',
        alignItems: 'stretch',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(8px)' : 'translateY(0)',
        transition: `opacity ${exiting ? EXIT_MS : ENTER_MS}ms ease, transform ${exiting ? EXIT_MS : ENTER_MS}ms ease`,
      }}
    >
      <div style={{ width: 3, background: accentColor, flexShrink: 0 }} />
      <div style={{
        flex: 1,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <ALabel style={{ color: A.ink2, letterSpacing: 1.4 }}>{displayLabel}</ALabel>
        <button
          type="button"
          onClick={onAction}
          aria-label={ariaLabel}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: A.font,
            fontSize: 10,
            letterSpacing: 1.4,
            color: A.ink,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
