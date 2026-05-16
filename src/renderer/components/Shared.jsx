import React from 'react';
import { A } from '../theme';
import { svgLinePath } from '../charts.mjs';

export function AsciiSpark({ data, width = 280, height = 56, stroke = A.ink, hover = null, onScrub }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    data.length === 1 ? width / 2 : i * (width / (data.length - 1)),
    height - ((v - min) / range) * height,
  ]);
  const d = svgLinePath(data, width, height);
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

export function LineChart({ data, width = 520, height = 140, stroke = A.ink, fill = 'none' }) {
  const values = data.map(d => typeof d === 'number' ? d : d.value);
  const path = svgLinePath(values, width, height);
  const area = fill !== 'none' && path
    ? `${path} L${width.toFixed(1)} ${height.toFixed(1)} L0.0 ${height.toFixed(1)} Z`
    : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75].map(y => (
        <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} stroke={A.rule2} strokeWidth="1" />
      ))}
      {area && <path d={area} fill={fill} opacity="0.12" />}
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

export function IncomeExpenseChart({ data, width = 520, height = 180, accent = A.ink }) {
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  const gap = 10;
  const group = width / data.length;
  const bar = Math.max(5, (group - gap) / 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke={A.ink} strokeWidth="1" />
      {data.map((d, i) => {
        const x = i * group + gap / 2;
        const incomeH = (d.income / max) * (height - 18);
        const expenseH = (d.expense / max) * (height - 18);
        return (
          <g key={d.period}>
            <rect x={x} y={height - incomeH - 1} width={bar} height={incomeH} fill={accent} />
            <rect x={x + bar + 2} y={height - expenseH - 1} width={bar} height={expenseH} fill={A.neg} />
          </g>
        );
      })}
    </svg>
  );
}

export function CategoryTrendChart({ rows, periods, width = 520, height = 180, accent = A.ink }) {
  const max = Math.max(...rows.flatMap(row => row.values), 1);
  const group = width / periods.length;
  const bar = Math.max(7, group / Math.max(rows.length + 1, 2));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke={A.ink} strokeWidth="1" />
      {periods.map((period, pi) => (
        <g key={period}>
          {rows.map((row, ri) => {
            const h = (row.values[pi] / max) * (height - 18);
            return (
              <rect
                key={row.cat}
                x={pi * group + ri * bar}
                y={height - h - 1}
                width={Math.max(2, bar - 2)}
                height={h}
                fill={ri === 0 ? accent : A.ink}
                opacity={1 - ri * 0.12}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}
