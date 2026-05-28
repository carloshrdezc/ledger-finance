import React from 'react';
import { A } from '../theme';
import { matchAndRank } from '../fuzzy.mjs';

const LISTBOX_ID = 'cmdk-listbox';
const optionId = (i) => `cmdk-opt-${i}`;

export default function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef(null);
  const previousActiveRef = React.useRef(null);

  const filtered = React.useMemo(
    () => matchAndRank(query, commands, c => c.label),
    [query, commands],
  );

  React.useEffect(() => {
    previousActiveRef.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      previousActiveRef.current?.focus?.();
    };
  }, []);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const close = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const runAt = (i) => {
    const cmd = filtered[i];
    if (!cmd) return;
    cmd.run();
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      runAt(selectedIndex);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  const onBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) {
      close();
    }
  };

  const selectedRowId = filtered[selectedIndex] ? optionId(selectedIndex) : undefined;

  return (
    <div
      onMouseDown={onBackdropMouseDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: '20vh',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        style={{
          width: 'min(560px, 90vw)',
          background: A.bg,
          border: '2px solid ' + A.ink,
          fontFamily: A.font,
          color: A.ink,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a command..."
          aria-controls={LISTBOX_ID}
          aria-activedescendant={selectedRowId}
          style={{
            all: 'unset',
            padding: '14px 16px',
            fontSize: 14,
            color: A.ink,
            borderBottom: '1px solid ' + A.ink,
            fontFamily: A.font,
          }}
        />

        <div role="listbox" id={LISTBOX_ID} style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 12, color: A.muted }}>
              No matches
            </div>
          ) : (
            filtered.map((cmd, i) => {
              const isSelected = i === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => runAt(i)}
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    background: isSelected ? A.ink : 'transparent',
                    color: isSelected ? A.bg : A.ink,
                  }}
                >
                  {cmd.label}
                </div>
              );
            })
          )}
        </div>

        <div style={{
          borderTop: '1px solid ' + A.rule2,
          padding: '8px 14px',
          fontSize: 9,
          letterSpacing: 1,
          color: A.muted,
          textTransform: 'uppercase',
        }}>
          ↑↓ navigate · ↵ run · esc ×
        </div>
      </div>
    </div>
  );
}
