import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import {
  processImageFile,
  attachmentCountError,
  MAX_ATTACHMENTS_PER_TX,
} from '../attachments.js';

/**
 * CAR-346: shared NOTE textarea + receipt/photo attachments control used by
 * both WebAddModal and the mobile AddSheet (web/mobile parity).
 *
 * Controlled component: the parent owns `note` (string) and `attachments`
 * (array of attachment objects) state and passes setters. On pick we
 * downscale + validate via processImageFile (canvas) and enforce the
 * per-tx count cap; oversized / wrong-type / over-count picks surface an
 * inline error and are NOT stored.
 *
 * Styling goes through the `A` token object (no hardcoded hex); labels use
 * <ALabel>.
 */
export default function AttachmentsField({
  t,
  note,
  onNoteChange,
  attachments,
  onAddAttachment,
  onRemoveAttachment,
}) {
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [zoom, setZoom] = React.useState(null); // attachment being enlarged
  const inputRef = React.useRef(null);

  const accent = t?.accent || A.ink;

  const handleFiles = async (fileList) => {
    setError('');
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    let count = attachments.length;
    setBusy(true);
    try {
      for (const file of files) {
        const countErr = attachmentCountError(count);
        if (countErr) {
          setError(countErr);
          break;
        }
        try {
          const att = await processImageFile(file);
          onAddAttachment(att);
          count += 1;
        } catch (e) {
          setError(e?.message || 'Could not add that image.');
          break;
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const atCap = attachments.length >= MAX_ATTACHMENTS_PER_TX;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <ALabel>NOTE (OPTIONAL)</ALabel>
        <textarea
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="e.g. work lunch — reimbursable"
          rows={2}
          style={{
            all: 'unset', display: 'block', width: '100%', marginTop: 8,
            fontFamily: A.font, fontSize: 13, letterSpacing: 0.4, lineHeight: 1.5,
            border: '1px solid ' + A.rule2, padding: '8px', color: A.ink,
            boxSizing: 'border-box', resize: 'vertical', minHeight: 40,
            whiteSpace: 'pre-wrap',
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <ALabel>RECEIPTS / PHOTOS</ALabel>
          <span style={{ fontSize: 9, color: A.muted, letterSpacing: 0.8 }}>
            {attachments.length}/{MAX_ATTACHMENTS_PER_TX}
          </span>
        </div>

        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {attachments.map(att => (
              <div
                key={att.id}
                style={{
                  position: 'relative', width: 64, height: 64,
                  border: '1px solid ' + A.rule2, overflow: 'hidden',
                  background: A.bg2,
                }}
              >
                <img
                  src={att.dataUrl}
                  alt={att.name || 'receipt'}
                  onClick={() => setZoom(att)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                />
                <button
                  type="button"
                  aria-label={`Remove attachment ${att.name || ''}`.trim()}
                  onClick={() => { setError(''); onRemoveAttachment(att.id); }}
                  style={{
                    all: 'unset', cursor: 'pointer', position: 'absolute',
                    top: 0, right: 0, width: 18, height: 18, textAlign: 'center',
                    lineHeight: '18px', fontSize: 12,
                    background: A.ink, color: A.bg,
                  }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <label
          style={{
            display: 'inline-block', marginTop: 10, cursor: atCap || busy ? 'default' : 'pointer',
            fontSize: 10, letterSpacing: 1.4, padding: '7px 12px',
            border: '1px solid ' + (atCap || busy ? A.rule2 : accent),
            color: atCap || busy ? A.muted : accent,
          }}
        >
          {busy ? 'PROCESSING…' : atCap ? 'LIMIT REACHED' : '+ ADD IMAGE'}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/*"
            multiple
            disabled={atCap || busy}
            onChange={e => handleFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>

        {error && (
          <div style={{ fontSize: 10, color: A.neg, marginTop: 8, letterSpacing: 0.4, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>

      {/* CAR-346: enlarge a receipt thumbnail. Click the backdrop to close. */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(20,18,15,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, cursor: 'zoom-out',
          }}
        >
          <img
            src={zoom.dataUrl}
            alt={zoom.name || 'receipt'}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', border: '2px solid ' + A.bg }}
          />
        </div>
      )}
    </div>
  );
}
