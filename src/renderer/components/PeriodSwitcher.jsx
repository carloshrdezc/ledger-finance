import React from 'react';
import { A } from '../theme';
import { monthKey } from '../period.mjs';
import { useStore } from '../store';

export default function PeriodSwitcher({ compact = false }) {
  const {
    selectedPeriod,
    setSelectedPeriod,
    periodLabel,
    goToPreviousPeriod,
    goToNextPeriod,
  } = useStore();

  const todayPeriod = monthKey(new Date());
  const isCurrent = selectedPeriod === todayPeriod;

  const buttonStyle = active => ({
    all: 'unset',
    cursor: active === false ? 'default' : 'pointer',
    fontSize: 10,
    letterSpacing: 1.2,
    padding: compact ? '4px 8px' : '5px 10px',
    border: '1px solid ' + (active ? A.ink : A.rule2),
    background: active ? A.ink : 'transparent',
    color: active ? A.bg : A.ink,
    opacity: active === false ? 0.5 : 1,
  });

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={goToPreviousPeriod} style={buttonStyle()}>
        {'<'}
      </button>
      <div style={{
        minWidth: compact ? 88 : 110,
        textAlign: 'center',
        fontSize: compact ? 10 : 11,
        letterSpacing: 1.2,
        border: '1px solid ' + A.ink,
        padding: compact ? '4px 8px' : '5px 10px',
        boxSizing: 'border-box',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {periodLabel}
      </div>
      <button onClick={goToNextPeriod} style={buttonStyle()}>
        {'>'}
      </button>
      <button
        onClick={() => setSelectedPeriod(todayPeriod)}
        disabled={isCurrent}
        style={buttonStyle(isCurrent ? false : undefined)}
      >
        TODAY
      </button>
    </div>
  );
}
