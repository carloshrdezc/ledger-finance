import { A } from '../../theme';
import { ALabel, ARule } from '../../components/Shared';
import { fmtMoney } from '../../data';
import { useStore } from '../../store';

const ALERT_SEVERITY_LABEL = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'WATCH',
  low: 'INFO',
};

function alertSeverityColor(severity, accent) {
  if (severity === 'critical') return A.neg;
  if (severity === 'high') return A.ink;
  if (severity === 'medium') return accent;
  return A.muted;
}

export default function AlertsHub({ t, onBack, onNavigate, onInsight }) {
  const { alertRows, dismissAlert, restoreAlerts, insightRows, dismissInsight, restoreInsights } = useStore();

  return (
    <div style={{ padding: '0 18px 20px' }}>
      <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2 }}>◂ BACK</button>
        <button onClick={restoreAlerts} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>RESTORE</button>
      </div>
      <ARule thick />

      <div style={{ padding: '14px 0 8px' }}>
        <ALabel>[01] ALERTS</ALabel>
        <div style={{ fontSize: 32, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, marginTop: 4 }}>{alertRows.length}</div>
        <div style={{ fontSize: 10, color: A.muted, marginTop: 2, letterSpacing: 1 }}>ACTIVE NOTIFICATIONS</div>
      </div>

      <ARule />

      <div style={{ padding: '10px 0 0' }}>
        {alertRows.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: 11, color: A.muted, letterSpacing: 1 }}>NO ACTIVE ALERTS</div>
        ) : alertRows.map(alert => (
          <div key={alert.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <button onClick={() => onNavigate(alert.route)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: alertSeverityColor(alert.severity, t.accent), letterSpacing: 1.2 }}>
                    {ALERT_SEVERITY_LABEL[alert.severity] || alert.severity.toUpperCase()} · {alert.kind.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.title}</div>
                  <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 3 }}>{alert.detail}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {typeof alert.metric === 'number' ? fmtMoney(alert.metric, t.currency, t.decimals) : alert.metric}
                  </div>
                  <div style={{ fontSize: 9, color: t.accent, letterSpacing: 1, marginTop: 5 }}>{alert.action}</div>
                </div>
              </div>
            </button>
            <button onClick={() => dismissAlert(alert.id)} style={{ all: 'unset', cursor: 'pointer', marginTop: 8, fontSize: 10, letterSpacing: 1, color: A.muted }}>
              DISMISS
            </button>
          </div>
        ))}
      </div>

      {/* CAR-217: Insights — same shape, separate dismiss state. */}
      <div style={{ padding: '24px 0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <ALabel>[01B] WEEKLY INSIGHTS · {insightRows.length}</ALabel>
        <button onClick={restoreInsights} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2, color: t.accent }}>RESTORE</button>
      </div>
      <ARule />
      <div style={{ padding: '10px 0 0' }}>
        {insightRows.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: 11, color: A.muted, letterSpacing: 1 }}>NO ACTIVE INSIGHTS</div>
        ) : insightRows.map(insight => (
          <div key={insight.id} style={{ padding: '12px 0', borderBottom: '1px solid ' + A.rule2 }}>
            <button onClick={() => onInsight && onInsight(insight)} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: insight.severity === 'high' ? A.neg : insight.severity === 'medium' ? t.accent : A.muted, letterSpacing: 1.2 }}>
                    {insight.severity.toUpperCase()} · {insight.type.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{insight.title}</div>
                  <div style={{ fontSize: 10, color: A.muted, letterSpacing: 0.6, marginTop: 3 }}>{insight.detail}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{insight.metric}</div>
                  <div style={{ fontSize: 9, color: t.accent, letterSpacing: 1, marginTop: 5 }}>{insight.action}</div>
                </div>
              </div>
            </button>
            <button onClick={() => dismissInsight(insight.id)} style={{ all: 'unset', cursor: 'pointer', marginTop: 8, fontSize: 10, letterSpacing: 1, color: A.muted }}>
              DISMISS
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
