import React from 'react';
import { A } from '../theme';

export function AsciiSpark({ data, width = 280, height = 56, stroke = A.ink, hover = null, onScrub }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    i * (width / (data.length - 1)),
    height - ((v - min) / range) * height,
  ]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const hi = hover != null ? Math.max(0, Math.min(data.length - 1, hover)) : null;

  return (
    <svg width={width} height={height} style={{ display: 'block', cursor: 'crosshair' }}
      onPointerMove={(e) => {
        if (!onScrub) return;
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1));
        onScrub(i);
      }}
      onPointerLeave={() => onScrub && onScrub(null)}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" />
      {hi != null && (
        <>
          <line x1={pts[hi][0]} y1={0} x2={pts[hi][0]} y2={height}
            stroke={stroke} strokeWidth="0.6" strokeDasharray="2 2" />
          <circle cx={pts[hi][0]} cy={pts[hi][1]} r="3"
            fill={A.bg} stroke={stroke} strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

export function ARule({ thick, c = A.rule, style }) {
  return <div style={{ height: thick ? 2 : 1, background: c, flexShrink: 0, ...style }} />;
}

export function ALabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1.4, color: A.ink2,
      textTransform: 'uppercase', ...style,
    }}>{children}</div>
  );
}

export function ADetailCell({ label, val, c = A.ink }) {
  return (
    <div style={{ background: A.bg, padding: '10px 10px', flex: 1 }}>
      <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 13, color: c, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{val}</div>
    </div>
  );
}
