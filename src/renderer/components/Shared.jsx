import React from 'react';
import { A } from '../theme';
import { svgLinePath } from '../charts.mjs';

export function scaleSparkPoints(data, width = 280, height = 56) {
  if (!data.length) return [];
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  return data.map((v, i) => ({
    x: data.length === 1 ? width / 2 : i * (width / (data.length - 1)),
    y: height - ((v - min) / range) * height,
  }));
}

export function AsciiSpark({ data, width = 280, height = 56, stroke = A.ink, hover = null, onScrub }) {
  const pts = scaleSparkPoints(data, width, height);
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
          <line x1={pts[hi].x} y1={0} x2={pts[hi].x} y2={height}
            stroke={stroke} strokeWidth="0.6" strokeDasharray="2 2" />
          <circle cx={pts[hi].x} cy={pts[hi].y} r="3"
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

export function Checkbox({ checked, indeterminate = false, onChange, ariaLabel, onMouseDown }) {
  const filled = checked || indeterminate;
  const glyph = indeterminate ? '−' : (checked ? '✓' : '');
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseDown={onMouseDown}
      onClick={onChange}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange?.(e);
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        border: '1px solid ' + (filled ? A.ink : A.rule2),
        background: filled ? A.ink : 'transparent',
        color: A.bg,
        fontSize: 10,
        lineHeight: 1,
        cursor: 'pointer',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {glyph}
    </span>
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
  const labels = data.map(d => typeof d === 'number' ? '' : (d.label || d.date || d.period || ''));
  const path = svgLinePath(values, width, height);
  const area = fill !== 'none' && path
    ? `${path} L${width.toFixed(1)} ${height.toFixed(1)} L0.0 ${height.toFixed(1)} Z`
    : '';

  const [hover, setHover] = React.useState(null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    values.length === 1 ? width / 2 : i * (width / (values.length - 1)),
    height - ((v - min) / range) * height,
  ]);
  const hi = hover != null ? Math.max(0, Math.min(values.length - 1, hover)) : null;

  const fmtVal = v => {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
    return v.toFixed(0);
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block', cursor: 'crosshair' }}
        onPointerMove={e => {
          if (!values.length) return;
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (values.length - 1));
          setHover(i);
        }}
        onPointerLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map(y => (
          <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} stroke={A.rule2} strokeWidth="1" />
        ))}
        {area && <path d={area} fill={fill} opacity="0.12" />}
        <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
        {hi != null && (
          <>
            <line x1={pts[hi][0]} y1={0} x2={pts[hi][0]} y2={height}
              stroke={stroke} strokeWidth="0.6" strokeDasharray="2 2" />
            <circle cx={pts[hi][0]} cy={pts[hi][1]} r="3"
              fill={A.bg} stroke={stroke} strokeWidth="1.5" />
          </>
        )}
      </svg>
      {hi != null && (
        <div style={{
          position: 'absolute', top: 4, right: 4,
          fontSize: 10, fontFamily: A.font, letterSpacing: 0.6,
          background: A.bg, border: '1px solid ' + A.rule2, padding: '3px 6px',
          color: A.ink, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
        }}>
          {labels[hi] && <span style={{ color: A.muted, marginRight: 6 }}>{labels[hi]}</span>}
          {fmtVal(values[hi])}
        </div>
      )}
    </div>
  );
}

function ChartLegend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, fontSize: 9, color: A.ink2, letterSpacing: 1 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: it.color, opacity: it.opacity ?? 1 }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function IncomeExpenseChart({ data, width = 520, height = 180, accent = A.ink }) {
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  const gap = 10;
  const group = width / data.length;
  const bar = Math.max(5, (group - gap) / 2);

  return (
    <div>
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
      <ChartLegend items={[
        { color: accent, label: 'INCOME' },
        { color: A.neg, label: 'EXPENSE' },
      ]} />
    </div>
  );
}

export function CategoryTrendChart({ rows, periods, width = 520, height = 180, accent = A.ink, categoryTree }) {
  const max = Math.max(...rows.flatMap(row => row.values), 1);
  const group = width / periods.length;
  const bar = Math.max(7, group / Math.max(rows.length + 1, 2));

  const legendItems = rows.map((row, ri) => ({
    color: ri === 0 ? accent : A.ink,
    opacity: 1 - ri * 0.12,
    label: (categoryTree && categoryTree[row.cat]?.label) || (row.cat || '').toUpperCase(),
  }));

  return (
    <div>
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
      <ChartLegend items={legendItems} />
    </div>
  );
}

// CAR-350: Sankey cash-flow diagram. Income sources (left) flow through a
// central budget hub to spending categories + savings (right). Band heights
// and ribbon widths are proportional to value; the column with the larger
// total fills the full height and the lighter column is centered.
export function SankeyChart({ flows, categoryTree, accent = A.ink, width = 520, height = 260, fmt }) {
  const ins = flows.nodes.filter(n => n.side === 'in');
  const outs = flows.nodes.filter(n => n.side === 'out');
  if (!ins.length && !outs.length) return null;

  const pad = 8;
  const gap = 6;                          // vertical gap between stacked bands
  const nodeW = 9;                        // band thickness
  const hubX = width / 2 - nodeW / 2;
  const inX = pad;
  const outX = width - pad - nodeW;
  const usable = height - pad * 2;

  // One shared pixel-per-currency scale so a band of value V is the same height
  // on both sides — the taller stack fills the canvas, the shorter is centered.
  const sumVals = (ns) => ns.reduce((s, n) => s + n.value, 0);
  const inTotal = sumVals(ins) || 1;
  const outTotal = sumVals(outs) || 1;
  const maxTotal = Math.max(inTotal, outTotal);
  const maxBands = Math.max(ins.length, outs.length);
  const unit = (usable - gap * Math.max(0, maxBands - 1)) / maxTotal;

  const layout = (ns, x) => {
    const stack = ns.reduce((s, n) => s + Math.max(1, n.value * unit), 0) + gap * Math.max(0, ns.length - 1);
    let y = pad + (usable - stack) / 2;
    return ns.map(n => {
      const bandH = Math.max(1, n.value * unit);
      const rect = { ...n, x, y, h: bandH };
      y += bandH + gap;
      return rect;
    });
  };

  const inRects = layout(ins, inX);
  const outRects = layout(outs, outX);
  const hubH = Math.max(...inRects.map(r => r.y + r.h), ...outRects.map(r => r.y + r.h), pad)
    - Math.min(...inRects.map(r => r.y), ...outRects.map(r => r.y), pad);
  const hubTop = Math.min(...inRects.map(r => r.y), ...outRects.map(r => r.y), pad);

  const ribbon = (x1, y1, x2, y2, h) => {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} `
      + `L${x2},${y2 + h} C${mx},${y2 + h} ${mx},${y1 + h} ${x1},${y1 + h} Z`;
  };

  // Ribbons stack along the hub edge in band order, advancing by band height +
  // gap so each ribbon lines up with its source/target band (CAR-350 review m2).
  let hubInY = hubTop;
  let hubOutY = hubTop;
  const labelFor = (n) => {
    if (n.id === '__hub__') return 'BUDGET';
    if (n.id === '__savings__') return 'SAVINGS';
    if (n.label === '__other__') return 'OTHER CATEGORIES';
    return (categoryTree && categoryTree[n.label]?.label) || (n.label || '').toUpperCase();
  };

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
        {inRects.map(r => {
          const d = ribbon(inX + nodeW, r.y, hubX, hubInY, r.h);
          hubInY += r.h + gap;
          return <path key={`lin-${r.id}`} d={d} fill={accent} opacity="0.22" />;
        })}
        {outRects.map(r => {
          const isSavings = r.id === '__savings__';
          const d = ribbon(hubX + nodeW, hubOutY, outX, r.y, r.h);
          hubOutY += r.h + gap;
          return <path key={`lout-${r.id}`} d={d} fill={isSavings ? A.pos : A.neg} opacity="0.18" />;
        })}
        <rect x={hubX} y={hubTop} width={nodeW} height={Math.max(1, hubH)} fill={A.ink} />
        {inRects.map(r => (
          <rect key={`nin-${r.id}`} x={r.x} y={r.y} width={nodeW} height={r.h} fill={accent} />
        ))}
        {outRects.map(r => (
          <rect key={`nout-${r.id}`} x={r.x} y={r.y} width={nodeW} height={r.h}
            fill={r.id === '__savings__' ? A.pos : A.neg} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          {inRects.map(r => (
            <div key={`tin-${r.id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: A.ink2, letterSpacing: 0.6, padding: '2px 0' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(r)}</span>
              <span style={{ color: A.muted, fontVariantNumeric: 'tabular-nums', marginLeft: 8 }}>{fmt ? fmt(r.value) : r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {outRects.map(r => (
            <div key={`tout-${r.id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: A.ink2, letterSpacing: 0.6, padding: '2px 0' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.id === '__savings__' ? A.pos : A.ink2 }}>{labelFor(r)}</span>
              <span style={{ color: A.muted, fontVariantNumeric: 'tabular-nums', marginLeft: 8 }}>{fmt ? fmt(r.value) : r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
