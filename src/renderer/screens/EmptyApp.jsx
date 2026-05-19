import React from 'react';
import { A } from '../theme';
import { useStore } from '../store';

// Whole-app-empty welcome screen (Style B from the CAR-76 design).
// Renders when welcomeSeen === true AND isAppEmpty === true.
// No top-level navigation — the user has nothing to navigate to yet.
export default function EmptyApp({ onAddAccount, onImport }) {
  const { loadSampleData } = useStore();

  const handleLoadSample = () => {
    try {
      loadSampleData();
    } catch (err) {
      console.warn('[empty-app] loadSampleData failed:', err.message);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', background: A.bg, color: A.ink,
      fontFamily: A.font, padding: '40px 24px', boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>
        [—]  NO DATA YET
      </div>
      <div style={{ fontSize: 32, letterSpacing: -0.5, marginTop: 8, fontWeight: 600 }}>
        LEDGER
      </div>
      <div style={{ fontSize: 12, color: A.ink2, letterSpacing: 0.5, marginTop: 12, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
        Add an account to begin tracking. You can also import from your bank or load sample data.
      </div>

      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10, width: 'min(280px, 100%)' }}>
        <button onClick={onAddAccount} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          textAlign: 'center', padding: '12px 20px',
          border: '1.5px solid ' + A.ink, background: A.ink, color: A.bg,
          fontSize: 11, letterSpacing: 1.2, fontWeight: 600,
        }}>
          + ADD YOUR FIRST ACCOUNT
        </button>
        <button onClick={onImport} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          textAlign: 'center', padding: '12px 20px',
          border: '1px solid ' + A.ink, background: 'transparent', color: A.ink,
          fontSize: 11, letterSpacing: 1.2,
        }}>
          IMPORT A BANK FILE
        </button>
        <button onClick={handleLoadSample} style={{
          all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
          textAlign: 'center', padding: '10px 20px',
          border: '1px dashed ' + A.rule2, background: 'transparent', color: A.muted,
          fontSize: 10, letterSpacing: 1.2,
        }}>
          LOAD SAMPLE DATA
        </button>
      </div>
    </div>
  );
}
