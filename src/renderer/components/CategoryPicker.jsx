import React from 'react';
import { A } from '../theme';
import { formatPath } from '../categories.mjs';

/**
 * Tree-walking category picker. Walks store.categoryTree depth-first and
 * presents a flat list of all paths (top-level AND nested). User can pick
 * any node — top-level paths like ['food'] or leaves like ['food', 'produce'].
 *
 * Used by:
 *   - <RuleForm> — rule's target category
 *   - <BulkActionBar> — bulk-categorize popover (replaces static CATEGORIES)
 */

const POPOVER_STYLE = {
  position: 'absolute',
  bottom: '100%',
  marginBottom: 8,
  background: A.bg,
  border: '1px solid ' + A.ink,
  fontFamily: A.font,
  minWidth: 220,
  maxHeight: 300,
  overflow: 'auto',
  boxSizing: 'border-box',
  zIndex: 10,
};

const POPOVER_ITEM_STYLE = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 11,
  letterSpacing: 0.6,
  color: A.ink,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid ' + A.rule2,
  cursor: 'pointer',
  fontFamily: A.font,
};

const TRIGGER_STYLE = {
  background: 'transparent',
  border: '1px solid ' + A.ink,
  padding: '6px 10px',
  cursor: 'pointer',
  fontFamily: A.font,
  fontSize: 11,
  letterSpacing: 1,
  color: A.ink,
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
};

function flattenTree(tree, path = [], parentSegments = []) {
  const entries = [];
  for (const [key, node] of Object.entries(tree || {})) {
    const nextPath = [...path, key];
    const label = node.label || key.toUpperCase();
    const nextSegments = [...parentSegments, label];
    entries.push({
      path: nextPath,
      label,
      glyph: node.glyph || '',
      // Pre-resolved labels for parent segments (everything except the leaf):
      breadcrumb: parentSegments,
    });
    if (node.children) {
      entries.push(...flattenTree(node.children, nextPath, nextSegments));
    }
  }
  return entries;
}

export default function CategoryPicker({
  tree,
  value,
  onChange,
  placeholder = 'PICK CATEGORY',
  align = 'left',
  maxHeight = 300,
}) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef(null);

  const entries = React.useMemo(() => flattenTree(tree), [tree]);
  const display = value ? formatPath(value, tree) : placeholder;

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // Close on Esc. Note: cannot prevent the global Esc handler from also firing,
  // but the global handler is benign when no overlays are open. Same pattern
  // as <BulkActionBar> from CAR-82.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const select = (path) => {
    onChange?.(path);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={TRIGGER_STYLE}
      >
        {display}
        <span style={{ fontSize: 8, color: A.muted }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            ...POPOVER_STYLE,
            maxHeight,
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
          }}
        >
          {entries.length === 0 && (
            <div style={{ ...POPOVER_ITEM_STYLE, color: A.muted, cursor: 'default' }}>
              No categories
            </div>
          )}
          {entries.map(({ path, label, glyph, breadcrumb }) => (
            <button
              key={path.join('.')}
              type="button"
              onClick={() => select(path)}
              style={POPOVER_ITEM_STYLE}
              onMouseEnter={(e) => { e.currentTarget.style.background = A.bg2; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {glyph && <span style={{ marginRight: 6 }}>{glyph}</span>}
              {breadcrumb.length > 0 && (
                <span style={{ color: A.muted, marginRight: 4 }}>
                  {breadcrumb.join(' › ')} ›
                </span>
              )}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
