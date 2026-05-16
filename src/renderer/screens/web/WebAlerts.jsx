import React from 'react';
import { A } from '../../theme';
import { ARule, ALabel } from '../../components/Shared';
import { fmtMoney } from '../../data';
import { useStore } from '../../store';
import WebShell from './WebShell';

const SEVERITY_LABEL = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'WATCH',
  low: 'INFO',
};

function severityColor(severity, accent) {
  if (severity === 'critical') return A.neg;
  if (severity === 'high') return A.ink;
  if (severity === 'medium') return accent;
  return A.muted;
}

export default function WebAlerts({ t, onNavigate, onAdd }) {
  const { alertRows, dismissAlert, restoreAlerts } = useStore();
  const activeCount = alertRows.length;
  const criticalCount = alertRows.filter(a => a.severity === 'critical').length;

  return (
    <WebShell active="alerts" t={t} onNavigate={onNavigate} onAdd={onAdd}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <ALabel>[01] ALERTS</ALabel>
          <div style={{ fontSize: 48, letterSpacing: -1.5, fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginTop: 6 }}>
            {activeCount}
            <span style={{ color: A.muted, fontSize: 24 }}> ACTIVE</span>
          </div>
          <div style={{ fontSize: 11, color: A.muted, marginTop: 4, letterSpacing: 1 }}>
            {criticalCount} CRITICAL
          </div>
        </div>
        <button onClick={restoreAlerts} style={{ all: 'unset', cursor: 'pointer', padding: '8px 16px', border: '1px solid ' + A.ink, fontSize: 10, letterSpacing: 1.4 }}>
          RESTORE DISMISSED
        </button>
      </div>

      <ARule thick />

      <div style={{ marginTop: 8, borderTop: '2px solid ' + A.ink }}>
        {alertRows.length === 0 ? (
          <div style={{ padding: '26px 0', fontSize: 12, color: A.muted, letterSpacing: 1 }}>
            NO ACTIVE ALERTS
          </div>
        ) : alertRows.map(alert => (
          <div key={alert.id} style={{
            display: 'grid',
            gridTemplateColumns: '94px 1fr 96px 96px 86px',
            alignItems: 'center',
            gap: 16,
            padding: t.density === 'compact' ? '10px 0' : '14px 0',
            borderBottom: '1px solid ' + A.rule2,
          }}>
            <div style={{ fontSize: 9, letterSpacing: 1.2, color: severityColor(alert.severity, t.accent) }}>
              {SEVERITY_LABEL[alert.severity] || alert.severity.toUpperCase()}
              <br />
              <span style={{ color: A.muted }}>{alert.kind.toUpperCase()}</span>
            </div>
            <button onClick={() => onNavigate(alert.route)} style={{ all: 'unset', cursor: 'pointer', minWidth: 0 }}>
              <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.title}</div>
              <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.8, marginTop: 3 }}>{alert.detail}</div>
            </button>
            <div style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {typeof alert.metric === 'number' ? fmtMoney(alert.metric, t.currency, t.decimals) : alert.metric}
            </div>
            <button onClick={() => onNavigate(alert.route)} style={{ all: 'unset', cursor: 'pointer', textAlign: 'right', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>
              {alert.action}
            </button>
            <button onClick={() => dismissAlert(alert.id)} style={{ all: 'unset', cursor: 'pointer', textAlign: 'right', fontSize: 10, letterSpacing: 1.2, color: A.muted }}>
              DISMISS
            </button>
          </div>
        ))}
      </div>
    </WebShell>
  );
}
