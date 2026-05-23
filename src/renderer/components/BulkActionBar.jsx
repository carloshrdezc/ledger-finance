import React from 'react';
import { A } from '../theme';
import { ALabel } from './Shared';
import CategoryPicker from './CategoryPicker';

const BAR_BUTTON_STYLE = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: A.font,
  fontSize: 10,
  letterSpacing: 1.4,
  color: A.ink,
  textTransform: 'uppercase',
  fontWeight: 600,
};

const POPOVER_STYLE = {
  position: 'absolute',
  bottom: '100%',
  marginBottom: 8,
  background: A.bg,
  border: '1px solid ' + A.ink,
  fontFamily: A.font,
  minWidth: 200,
  maxHeight: 240,
  overflow: 'auto',
  boxSizing: 'border-box',
};

const POPOVER_ITEM_STYLE = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  letterSpacing: 0.8,
  color: A.ink,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid ' + A.rule2,
  cursor: 'pointer',
  fontFamily: A.font,
};

const VRULE = (
  <div style={{ width: 1, height: 16, background: A.rule2 }} />
);

export default function BulkActionBar({
  count,
  canMarkAsTransfer,
  categoryTree,           // CAR-80 / CAR-181
  accountsWithBalance,
  onCategorize,
  onSetAccount,
  onMarkAsTransfer,
  onHide,
  onDelete,
  onClear,
}) {
  const [openPicker, setOpenPicker] = React.useState(null); // 'account' | null

  // Close picker on Esc. The app's global Esc handler is a separate
  // window listener (it cannot be cancelled via stopPropagation since
  // co-listeners on the same target all fire), but it only acts when
  // a top-level overlay is open. The bar isn't an overlay, so the
  // global handler is effectively a no-op when this fires.
  React.useEffect(() => {
    if (!openPicker) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpenPicker(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPicker]);

  // Close picker on outside click.
  const barRef = React.useRef(null);
  React.useEffect(() => {
    if (!openPicker) return undefined;
    const onClick = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) {
        setOpenPicker(null);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [openPicker]);

  const handleSetAccount = (acctId) => {
    onSetAccount?.(acctId);
    setOpenPicker(null);
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={`Bulk actions for ${count} selected transactions`}
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        background: A.bg2,
        border: '1px solid ' + A.ink,
        fontFamily: A.font,
        color: A.ink,
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <ALabel style={{ color: A.ink }}>{count} SELECTED</ALabel>

      {VRULE}

      {/* CATEGORIZE — uses CategoryPicker (CAR-80 / CAR-181) */}
      <CategoryPicker
        tree={categoryTree}
        value={null}
        onChange={(path) => onCategorize?.(path)}
        placeholder="CATEGORIZE"
      />

      {/* SET ACCOUNT */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpenPicker(p => p === 'account' ? null : 'account')}
          style={BAR_BUTTON_STYLE}
        >
          SET ACCOUNT
        </button>
        {openPicker === 'account' && (
          <div style={POPOVER_STYLE}>
            {accountsWithBalance.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => handleSetAccount(a.id)}
                style={POPOVER_ITEM_STYLE}
                onMouseEnter={(e) => { e.currentTarget.style.background = A.bg2; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {a.name} · {a.code}
              </button>
            ))}
          </div>
        )}
      </div>

      {canMarkAsTransfer && (
        <button
          type="button"
          onClick={onMarkAsTransfer}
          style={BAR_BUTTON_STYLE}
        >
          MARK AS TRANSFER
        </button>
      )}

      <button
        type="button"
        onClick={onHide}
        style={BAR_BUTTON_STYLE}
      >
        HIDE
      </button>

      <button
        type="button"
        onClick={onDelete}
        onMouseEnter={(e) => { e.currentTarget.style.color = A.neg; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = A.ink; }}
        style={BAR_BUTTON_STYLE}
      >
        DELETE
      </button>

      {VRULE}

      <button
        type="button"
        onClick={onClear}
        style={{ ...BAR_BUTTON_STYLE, color: A.muted }}
        onMouseEnter={(e) => { e.currentTarget.style.color = A.ink; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = A.muted; }}
      >
        CLEAR
      </button>
    </div>
  );
}
