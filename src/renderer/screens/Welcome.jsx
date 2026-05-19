import React from 'react';
import { A } from '../theme';
import { useStore } from '../store';

// First-launch modal. Renders only when welcomeSeen === false. Three
// vertical buttons: Start Fresh / Load Sample Data / Import Bank File.
// Esc / X / click-outside is treated as Start Fresh (welcomeSeen flipped,
// no other action).
export default function Welcome({ onImport }) {
  const { dismissWelcome, loadSampleData } = useStore();

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') dismissWelcome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissWelcome]);

  const handleStartFresh = () => {
    dismissWelcome();
  };

  const handleLoadSample = () => {
    try {
      loadSampleData();
    } catch (err) {
      // Should never happen on first run; defensive only.
      console.warn('[welcome] loadSampleData failed:', err.message);
    }
    dismissWelcome();
  };

  const handleImport = () => {
    dismissWelcome();
    if (onImport) onImport();
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) dismissWelcome(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: A.font,
      }}
    >
      <div style={{
        background: A.bg, color: A.ink,
        border: '2px solid ' + A.ink,
        padding: '36px 32px 28px',
        width: 'min(420px, 90vw)',
        position: 'relative',
      }}>
        <button onClick={dismissWelcome} title="Close"
          style={{
            all: 'unset', cursor: 'pointer',
            position: 'absolute', top: 10, right: 12,
            fontSize: 14, color: A.muted, padding: '2px 6px',
          }}>×</button>

        <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>
          [01] WELCOME
        </div>
        <div style={{ fontSize: 28, letterSpacing: -0.5, marginTop: 6, fontWeight: 600 }}>
          LEDGER
        </div>
        <div style={{ fontSize: 11, color: A.ink2, letterSpacing: 0.5, marginTop: 8, lineHeight: 1.5 }}>
          A personal-finance ledger. All data stays on your machine.
        </div>

        <div style={{ marginTop: 24, borderTop: '2px solid ' + A.ink }}>
          <button onClick={handleStartFresh} style={{
            all: 'unset', cursor: 'pointer',
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '14px 0', borderBottom: '1px solid ' + A.rule2,
            fontSize: 12, letterSpacing: 1, fontWeight: 600,
          }}>
            START FRESH ▸
          </button>
          <button onClick={handleLoadSample} style={{
            all: 'unset', cursor: 'pointer',
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '14px 0', borderBottom: '1px solid ' + A.rule2,
            fontSize: 12, letterSpacing: 1,
          }}>
            LOAD SAMPLE DATA ▸
          </button>
          <button onClick={handleImport} style={{
            all: 'unset', cursor: 'pointer',
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '14px 0',
            fontSize: 12, letterSpacing: 1,
          }}>
            IMPORT A BANK FILE ▸
          </button>
        </div>
      </div>
    </div>
  );
}
