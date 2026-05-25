import React from 'react';

import { A } from '../theme';
import { ALabel } from './Shared';
import { fmtSigned } from '../data';
import { buildNetWorthAttributionFilter } from '../netWorthAttribution.mjs';

const BUCKETS = [
  {
    key: 'contributions',
    label: 'CONTRIBUTIONS',
    blurb: 'Into investment accounts',
    accent: 'positive',
  },
  {
    key: 'marketGains',
    label: 'MARKET GAINS',
    blurb: 'Residual investment change',
    accent: 'positive',
  },
  {
    key: 'income',
    label: 'INCOME',
    blurb: 'Positive non-transfer cash flow',
    accent: 'positive',
  },
  {
    key: 'spending',
    label: 'SPENDING',
    blurb: 'Negative non-transfer cash flow',
    accent: 'negative',
  },
  {
    key: 'transfers',
    label: 'TRANSFERS',
    blurb: 'Net internal movement',
    accent: 'neutral',
  },
];

function bucketValue(buckets, key) {
  return Number.isFinite(buckets?.[key]) ? buckets[key] : 0;
}

function bucketIsDrillable(key) {
  return buildNetWorthAttributionFilter(key) !== null;
}

export default function NetWorthAttributionBreakdown({
  t,
  buckets,
  onBucketClick,
  compact = false,
  label = '[02] NET WORTH · ATTRIBUTION',
}) {
  const values = BUCKETS.map(row => ({ ...row, value: bucketValue(buckets, row.key) }));
  const total = values.reduce((sum, row) => sum + row.value, 0);
  const maxAbs = Math.max(1, ...values.map(row => Math.abs(row.value)));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <ALabel>{label}</ALabel>
        <div style={{ fontSize: compact ? 12 : 13, fontVariantNumeric: 'tabular-nums', color: total >= 0 ? t.accent : A.neg }}>
          {fmtSigned(total, t.currency, t.decimals)}
        </div>
      </div>

      <div style={{ marginTop: compact ? 8 : 12, borderTop: '2px solid ' + A.ink }}>
        {values.map(row => {
          const abs = Math.abs(row.value);
          const width = `${Math.max(3, (abs / maxAbs) * 100)}%`;
          const barColor = row.value >= 0 ? (row.key === 'transfers' ? A.ink2 : t.accent) : A.neg;
          const drillable = bucketIsDrillable(row.key);
          const clickable = drillable && typeof onBucketClick === 'function';
          const buttonStyle = {
            all: 'unset',
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            cursor: clickable ? 'pointer' : 'default',
            padding: compact ? '9px 0' : '11px 0',
            borderBottom: '1px solid ' + A.rule2,
          };

          const titleText = clickable
            ? `Drill into ${row.label.toLowerCase()}`
            : (row.key === 'marketGains' ? 'Residual — no underlying transactions' : row.blurb);

          return (
            <button
              key={row.key}
              onClick={clickable ? () => onBucketClick(row.key) : undefined}
              disabled={!clickable}
              style={buttonStyle}
              title={titleText}
              aria-disabled={!clickable}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: compact ? 10 : 11, letterSpacing: 1.2 }}>{row.label}</div>
                  <div style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8, marginTop: 2 }}>{row.blurb}</div>
                </div>
                <div style={{ fontSize: compact ? 12 : 13, fontVariantNumeric: 'tabular-nums', color: row.value < 0 ? A.neg : (row.key === 'transfers' ? A.ink2 : t.accent), flexShrink: 0 }}>
                  {fmtSigned(row.value, t.currency, t.decimals)}
                </div>
              </div>
              <div style={{ marginTop: 6, height: 4, background: A.rule2 }}>
                <div style={{ width, height: '100%', background: barColor }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
