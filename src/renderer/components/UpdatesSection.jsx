import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';

// CAR-364: on-demand "Check for updates" + version display, shared by web and
// mobile Settings. Status is driven by the main process via electronAPI:
// checkForUpdates() kicks a check; onAutoUpdateStatus() streams live updates
// (checking / up-to-date / available / downloading / downloaded / error).
// In the browser preview (no electronAPI) the section renders a disabled note.

const STATUS_LABEL = {
  idle: '',
  checking: 'CHECKING…',
  'up-to-date': 'UP TO DATE',
  available: 'UPDATE AVAILABLE — DOWNLOADING…',
  downloading: 'DOWNLOADING…',
  downloaded: 'UPDATE READY — RESTART TO APPLY',
  error: 'CHECK FAILED',
  unsupported: 'UPDATES UNAVAILABLE IN THIS BUILD',
};

export default function UpdatesSection() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  const isDesktop = !!(api && api.checkForUpdates);

  const [version, setVersion] = React.useState(null);
  const [status, setStatus] = React.useState('idle');
  const [percent, setPercent] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState(null);

  React.useEffect(() => {
    if (!api) return undefined;
    let active = true;
    api.getAppVersion?.().then(v => { if (active) setVersion(v); }).catch(() => {});
    const off = api.onAutoUpdateStatus?.((payload = {}) => {
      if (!active) return;
      setStatus(payload.status || 'idle');
      if (typeof payload.percent === 'number') setPercent(payload.percent);
      setErrorMsg(payload.status === 'error' ? (payload.error || 'unknown error') : null);
    });
    return () => { active = false; if (typeof off === 'function') off(); };
  }, [api]);

  const handleCheck = async () => {
    if (!isDesktop) return;
    setErrorMsg(null);
    setStatus('checking');
    try {
      const res = await api.checkForUpdates();
      if (res?.status === 'unsupported') setStatus('unsupported');
      else if (res?.status === 'error') { setStatus('error'); setErrorMsg(res.error || 'unknown error'); }
      // 'checking'/'available'/'up-to-date' arrive via onAutoUpdateStatus.
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.message || 'unknown error');
    }
  };

  const checking = status === 'checking' || status === 'available' || status === 'downloading';
  const label = STATUS_LABEL[status] || '';
  const statusColor = status === 'error' ? A.neg : status === 'downloaded' ? A.ink : A.muted;

  return (
    <>
      <ALabel>UPDATES</ALabel>
      <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>

        {/* CURRENT VERSION */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <span style={{ fontSize: 12 }}>CURRENT VERSION</span>
          <span style={{ fontSize: 11, color: A.muted }}>{version ? `v${version}` : '—'}</span>
        </div>

        {/* CHECK FOR UPDATES */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>CHECK · FOR · UPDATES</div>
            <div style={{ fontSize: 11, marginTop: 3, color: statusColor, letterSpacing: 0.6 }}>
              {isDesktop
                ? (label
                    ? (status === 'downloading' ? `DOWNLOADING… ${Math.round(percent)}%` : label)
                    : 'Look for a newer release')
                : 'Only available in the desktop app'}
            </div>
          </div>
          <button
            onClick={handleCheck}
            disabled={!isDesktop || checking}
            style={{
              all: 'unset',
              cursor: (!isDesktop || checking) ? 'default' : 'pointer',
              fontSize: 10, letterSpacing: 1.2, padding: '5px 12px',
              border: '1px solid ' + (isDesktop ? A.ink : A.rule2),
              color: isDesktop ? A.ink : A.muted,
              opacity: checking ? 0.5 : 1,
            }}
          >
            {checking ? 'CHECKING…' : 'CHECK NOW'}
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: '9px 0', fontSize: 10, letterSpacing: 1, color: A.neg, borderBottom: '1px solid ' + A.rule2 }}>
            ✗ {errorMsg}
          </div>
        )}
      </div>
    </>
  );
}
