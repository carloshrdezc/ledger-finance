import React from 'react';
import { A } from '../theme';

// Shared partial-empty UI: a one-line message + optional CTA, used
// inside sections of normal screens where data hasn't been entered yet.
// Visual style A from the CAR-76 design.
export default function EmptySectionHint({ message, ctaLabel, onCta, ctaIcon = '+' }) {
  return (
    <div style={{
      padding: '14px 0',
      fontSize: 11,
      color: A.muted,
      letterSpacing: 0.6,
      lineHeight: 1.5,
    }}>
      <div>{message}</div>
      {ctaLabel && onCta && (
        <button onClick={onCta} style={{
          all: 'unset',
          cursor: 'pointer',
          marginTop: 8,
          fontSize: 10,
          letterSpacing: 1.2,
          padding: '5px 12px',
          border: '1px solid ' + A.ink,
          background: A.ink,
          color: A.bg,
        }}>
          {ctaIcon} {ctaLabel}
        </button>
      )}
    </div>
  );
}
