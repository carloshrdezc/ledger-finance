import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import { useStore } from '../store';
import { parseBackup } from '../backup.mjs';
import { downloadFile, todayISO } from '../download.mjs';

const INTERVAL_OPTIONS = [
  { val: 0,  label: 'OFF' },
  { val: 7,  label: '7d'  },
  { val: 30, label: '30d' },
  { val: 90, label: '90d' },
];

// Shared between WebSettings and mobile Settings. No layout chrome of its
// own beyond the section heading — the parent supplies surrounding
// padding/margins consistent with the rest of that screen's settings list.
export default function BackupSection() {
  const {
    lastBackupAt,
    backupReminderInterval,
    setBackupReminderInterval,
    exportBackup,
    restoreBackup,
    recordBackupTaken,
  } = useStore();

  const fileInputRef = React.useRef(null);
  const [pending, setPending] = React.useState(null); // { data, summary, warnings } | null
  const [pickerError, setPickerError] = React.useState(null);

  const handleBackupNow = () => {
    setPickerError(null);
    try {
      const json = exportBackup();
      downloadFile(`ledger-backup-${todayISO()}.ledger.json`, json);
      recordBackupTaken();
    } catch (err) {
      // Highly unlikely (Blob URL or builder error) — surface it.
      setPickerError('Couldn\u2019t create backup: ' + (err?.message || 'unknown error'));
    }
  };

  const handleRestoreClick = () => {
    setPickerError(null);
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseBackup(text);
      if (!result.ok) {
        setPickerError(result.error);
        return;
      }
      setPending(result);
    } catch (err) {
      setPickerError('Couldn\u2019t read file: ' + (err?.message || 'unknown error'));
    }
  };

  const handleConfirmRestore = () => {
    if (!pending) return;
    restoreBackup(pending.data);
    setPending(null);
  };

  return (
    <>
      <ALabel>BACKUP</ALabel>
      <div style={{ marginTop: 12, borderTop: '2px solid ' + A.ink }}>

        {/* LAST BACKUP */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <span style={{ fontSize: 12 }}>LAST BACKUP</span>
          <span style={{ fontSize: 11, color: A.muted }}>
            {lastBackupAt || 'NEVER'}
          </span>
        </div>

        {/* BACKUP NOW */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>BACKUP · NOW</div>
            <div style={{ fontSize: 11, marginTop: 3 }}>Download a full snapshot</div>
          </div>
          <button onClick={handleBackupNow} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
            padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
          }}>BACKUP NOW</button>
        </div>

        {/* RESTORE FROM BACKUP */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1 }}>RESTORE · FROM · BACKUP</div>
            <div style={{ fontSize: 11, marginTop: 3 }}>Replace all current data</div>
          </div>
          <button onClick={handleRestoreClick} style={{
            all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
            padding: '5px 12px', border: '1px solid ' + A.ink, color: A.ink,
          }}>CHOOSE FILE</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.ledger.json,application/json"
            style={{ display: 'none' }}
            onChange={e => { handleFileChosen(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        {pickerError && (
          <div style={{ padding: '9px 0', fontSize: 10, letterSpacing: 1, color: A.neg, borderBottom: '1px solid ' + A.rule2 }}>
            ✗ {pickerError}
          </div>
        )}

        {/* REMINDER INTERVAL */}
        <div style={{ padding: '11px 0', borderBottom: '1px solid ' + A.rule2 }}>
          <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1, marginBottom: 8 }}>REMINDER · INTERVAL</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {INTERVAL_OPTIONS.map(({ val, label }) => (
              <button
                key={val}
                onClick={() => setBackupReminderInterval(val)}
                style={{
                  all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                  padding: '5px 10px', border: '1px solid ' + (backupReminderInterval === val ? A.ink : A.rule2),
                  background: backupReminderInterval === val ? A.ink : 'transparent',
                  color: backupReminderInterval === val ? A.bg : A.ink,
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {pending && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPending(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: A.font,
          }}
        >
          <div style={{
            background: A.bg, color: A.ink,
            border: '2px solid ' + A.ink,
            padding: '24px 22px',
            width: 'min(420px, 92vw)',
          }}>
            <div style={{ fontSize: 9, color: A.muted, letterSpacing: 1.2 }}>RESTORE · FROM · BACKUP</div>
            <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
              This will replace all current data with the contents of this backup.
            </div>

            <div style={{ marginTop: 14, fontSize: 10, color: A.ink, letterSpacing: 0.6, lineHeight: 1.7 }}>
              {Object.entries(pending.summary).map(([k, n]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: A.muted, textTransform: 'uppercase' }}>{k}</span>
                  <span>{n}</span>
                </div>
              ))}
            </div>

            {pending.warnings.length > 0 && (
              <div style={{ marginTop: 14, padding: '8px 10px', border: '1px solid ' + A.rule2, fontSize: 10, color: A.muted, letterSpacing: 0.6 }}>
                {pending.warnings.map((w, i) => <div key={i}>! {w}</div>)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setPending(null)} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.rule2, color: A.muted,
              }}>CANCEL</button>
              <button onClick={handleConfirmRestore} style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, letterSpacing: 1.2,
                padding: '5px 12px', border: '1px solid ' + A.neg, background: A.neg, color: A.bg,
              }}>REPLACE MY DATA</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
