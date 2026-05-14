import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { ACCOUNTS, CATEGORIES } from '../../data';

export default function AddSheet({ t, open, onClose }) {
  const [amt, setAmt] = React.useState('42.50');
  const [cat, setCat] = React.useState('dining');
  const [acct, setAcct] = React.useState('csp');

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(20,18,15,0.4)', zIndex: 30,
        animation: 'fadeIn .15s ease-out',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: A.bg, padding: 18,
          borderTop: '2px solid ' + A.ink,
          animation: 'slideUp .2s ease-out',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>NEW · TRANSACTION</div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>CLOSE ×</button>
        </div>
        <ARule thick style={{ marginTop: 8 }} />

        <div style={{ padding: '16px 0' }}>
          <ALabel>AMOUNT · USD</ALabel>
          <div style={{ fontSize: 44, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>
            $ {amt}
          </div>
        </div>
        <ARule />

        <div style={{ padding: '14px 0' }}>
          <ALabel>CATEGORY</ALabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {Object.entries(CATEGORIES).slice(0, 8).map(([k, c]) => (
              <button key={k} onClick={() => setCat(k)} style={{
                all: 'unset', cursor: 'pointer', padding: '5px 9px',
                border: '1px solid ' + (cat === k ? A.ink : A.rule2),
                background: cat === k ? A.ink : 'transparent',
                color: cat === k ? A.bg : A.ink,
                fontSize: 10, letterSpacing: 1.2,
              }}>{c.glyph} {c.label}</button>
            ))}
          </div>
        </div>
        <ARule />

        <div style={{ padding: '14px 0' }}>
          <ALabel>ACCOUNT</ALabel>
          <select value={acct} onChange={e => setAcct(e.target.value)} style={{
            marginTop: 8, width: '100%', fontFamily: A.font,
            fontSize: 13, padding: 8,
            border: '1px solid ' + A.ink, background: A.bg, color: A.ink,
          }}>
            {ACCOUNTS.map(a => (
              <option key={a.id} value={a.id}>{a.name} · {a.code}</option>
            ))}
          </select>
        </div>

        <button onClick={onClose} style={{
          all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center',
          width: '100%', padding: '14px',
          background: t.accent, color: A.bg,
          fontSize: 12, letterSpacing: 2, fontWeight: 700, marginTop: 6,
        }}>SAVE ↵</button>
      </div>
    </div>
  );
}
