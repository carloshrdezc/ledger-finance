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
 *   - <WebAddModal> / <AddSheet> — add-transaction category selection (CAR-189)
 *
 * Behavior:
 *   - Default opens UPWARD (`bottom: 100%`) — fits when host sits low in form.
 *   - Auto-flips to DOWNWARD when there isn't enough space above (e.g. picker
 *     near top of viewport, narrow vertical viewports). CAR-189 follow-up.
 *   - Arrow keys + Enter for keyboard nav when open. CAR-189 follow-up.
 */

const POPOVER_BASE_STYLE = {
  position: 'absolute',
  background: A.bg,
  border: '1px solid ' + A.ink,
  fontFamily: A.font,
  minWidth: 220,
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
  const [direction, setDirection] = React.useState('up'); // 'up' | 'down'
  const [highlight, setHighlight] = React.useState(0);
  const wrapperRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const itemRefs = React.useRef([]);

  const entries = React.useMemo(() => flattenTree(tree), [tree]);
  const display = value ? formatPath(value, tree) : placeholder;

  // CAR-189: auto-flip up/down based on available space. Measured at open
  // time using the trigger's viewport rect. Default = up (matches RuleForm
  // / BulkActionBar host expectations); flip to down only if insufficient
  // space above.
  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    const needed = Math.min(maxHeight, entries.length * 36 + 16);
    if (spaceAbove >= needed) setDirection('up');
    else if (spaceBelow >= needed) setDirection('down');
    else setDirection(spaceAbove >= spaceBelow ? 'up' : 'down');
  }, [open, entries.length, maxHeight]);

  // Reset highlight to selected entry (or 0) every time the picker opens.
  React.useEffect(() => {
    if (!open) return;
    const idx = value
      ? entries.findIndex((e) => e.path.length === value.length && e.path.every((p, i) => p === value[i]))
      : 0;
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, value, entries]);

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

  // CAR-189: keyboard nav — Esc to close, ArrowUp/Down to move highlight,
  // Enter to select, Home/End to jump. Stop propagation on handled keys so
  // the global Esc handler doesn't fire on top of ours when the picker is
  // open inside a modal.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        e.stopPropagation();
      } else if (e.key === 'ArrowDown') {
        setHighlight((h) => Math.min(entries.length - 1, h + 1));
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setHighlight((h) => Math.max(0, h - 1));
        e.preventDefault();
      } else if (e.key === 'Home') {
        setHighlight(0);
        e.preventDefault();
      } else if (e.key === 'End') {
        setHighlight(entries.length - 1);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        const entry = entries[highlight];
        if (entry) {
          onChange?.(entry.path);
          setOpen(false);
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true); // capture: beat global Esc
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, entries, highlight, onChange]);

  // Scroll highlighted item into view as user navigates.
  React.useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[highlight];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  const select = (path) => {
    onChange?.(path);
    setOpen(false);
  };

  const popoverPositionStyle = direction === 'up'
    ? { bottom: '100%', marginBottom: 8 }
    : { top: '100%', marginTop: 8 };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        style={TRIGGER_STYLE}
      >
        {display}
        <span style={{ fontSize: 8, color: A.muted }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            ...POPOVER_BASE_STYLE,
            ...popoverPositionStyle,
            maxHeight,
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
          }}
        >
          {entries.length === 0 && (
            <div style={{ ...POPOVER_ITEM_STYLE, color: A.muted, cursor: 'default' }}>
              No categories
            </div>
          )}
          {entries.map(({ path, label, glyph, breadcrumb }, i) => {
            const isHighlighted = i === highlight;
            return (
              <button
                ref={(el) => { itemRefs.current[i] = el; }}
                key={path.join('.')}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onClick={() => select(path)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  ...POPOVER_ITEM_STYLE,
                  background: isHighlighted ? A.bg2 : 'transparent',
                }}
              >
                {glyph && <span style={{ marginRight: 6 }}>{glyph}</span>}
                {breadcrumb.length > 0 && (
                  <span style={{ color: A.muted, marginRight: 4 }}>
                    {breadcrumb.join(' › ')} ›
                  </span>
                )}
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
