import React from 'react';
import { A } from '../theme';

const PRESETS = [
  { key: 'thisMonth', label: 'THIS MONTH' },
  { key: 'lastMonth', label: 'LAST MONTH' },
  { key: 'last3',     label: 'LAST 90D' },
  { key: 'last6',     label: 'LAST 6M' },
  { key: 'ytd',       label: 'YTD' },
  { key: 'last12',    label: 'LAST 12M' },
  { key: 'lastYear',  label: 'LAST YEAR' },
  { key: 'custom',    label: 'CUSTOM' },
];

// Range = { kind: 'preset', preset } | { kind: 'custom', start, end } | null
export default function RangeSelector({ range, onChange, t }) {
  const activeKey = range?.kind === 'custom' ? 'custom' : (range?.preset || 'thisMonth');
  const [showCustom, setShowCustom] = React.useState(activeKey === 'custom');
  const [customStart, setCustomStart] = React.useState(range?.kind === 'custom' ? range.start : '');
  const [customEnd, setCustomEnd] = React.useState(range?.kind === 'custom' ? range.end : '');

  React.useEffect(() => {
    setShowCustom(activeKey === 'custom');
  }, [activeKey]);

  const apply = (key) => {
    if (key === 'custom') {
      setShowCustom(true);
      // Default custom range to last 30 days if empty.
      if (!customStart || !customEnd) {
        const today = new Date();
        const end = today.toISOString().slice(0, 10);
        const startD = new Date(today); startD.setDate(startD.getDate() - 29);
        const start = startD.toISOString().slice(0, 10);
        setCustomStart(start);
        setCustomEnd(end);
        onChange({ kind: 'custom', start, end });
      } else {
        onChange({ kind: 'custom', start: customStart, end: customEnd });
      }
      return;
    }
    setShowCustom(false);
    onChange({ kind: 'preset', preset: key });
  };

  const commitCustom = () => {
    if (customStart && customEnd && customStart <= customEnd) {
      onChange({ kind: 'custom', start: customStart, end: customEnd });
    }
  };

  const accent = t?.accent || A.ink;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map(p => {
          const active = activeKey === p.key;
          return (
            <button key={p.key} onClick={() => apply(p.key)} style={{
              all: 'unset', cursor: 'pointer', padding: '4px 9px',
              border: '1px solid ' + (active ? A.ink : A.rule2),
              background: active ? A.ink : 'transparent',
              color: active ? A.bg : A.ink,
              fontSize: 9, letterSpacing: 1.2,
            }}>{p.label}</button>
          );
        })}
      </div>
      {showCustom && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, color: A.muted, letterSpacing: 0.6 }}>
          <input type="date" value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            onBlur={commitCustom}
            style={{ fontFamily: A.font, fontSize: 11, padding: '3px 6px', border: '1px solid ' + A.rule2, background: A.bg, color: A.ink, outline: 'none' }} />
          <span>→</span>
          <input type="date" value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            onBlur={commitCustom}
            style={{ fontFamily: A.font, fontSize: 11, padding: '3px 6px', border: '1px solid ' + A.rule2, background: A.bg, color: A.ink, outline: 'none' }} />
          <button onClick={commitCustom} style={{
            all: 'unset', cursor: 'pointer', padding: '3px 8px',
            background: accent, color: A.bg, fontSize: 9, letterSpacing: 1.2,
          }}>APPLY</button>
        </div>
      )}
    </div>
  );
}
