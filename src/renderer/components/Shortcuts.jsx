import React from 'react';
import { A } from '../theme';

const SECTIONS = [
  {
    title: 'GLOBAL',
    items: [
      ['?',                 'Toggle this cheatsheet'],
      ['Esc',               'Close any open modal'],
      ['n',                 'New transaction'],
      ['[ / ]',             'Previous / next period'],
      ['Cmd/Ctrl+K',        'Command palette'],
      ['Cmd/Ctrl+Z',        'Undo last destructive action'],
      ['Cmd/Ctrl+Shift+Z',  'Redo'],
    ],
  },
  {
    title: 'NAVIGATION',
    items: [
      ['g d', 'Go to dashboard'],
      ['g t', 'Go to transactions'],
      ['g a', 'Go to accounts'],
      ['g b', 'Go to budgets'],
      ['g r', 'Go to reports'],
      ['g i', 'Go to investments'],
    ],
  },
  {
    title: 'TRANSACTIONS',
    items: [
      ['j / k', 'Select previous / next row'],
      ['e',     'Edit selected transaction'],
      ['/',     'Focus search'],
    ],
  },
];

export default function ShortcutsOverlay({ onClose }) {
  const onBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onMouseDown={onBackdropMouseDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        paddingTop: '15vh',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        style={{
          width: 'min(560px, 90vw)',
          background: A.bg,
          border: '2px solid ' + A.ink,
          fontFamily: A.font,
          color: A.ink,
          padding: '20px 24px',
        }}
      >
        <div style={{
          fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
          color: A.muted, marginBottom: 16,
        }}>
          Keyboard Shortcuts
        </div>

        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase',
              color: A.muted, marginBottom: 8,
              borderBottom: '1px solid ' + A.rule2, paddingBottom: 4,
            }}>
              {section.title}
            </div>
            <dl style={{ margin: 0 }}>
              {section.items.map(([key, label]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'baseline',
                  fontSize: 12, padding: '4px 0',
                }}>
                  <dt style={{
                    width: 110, flexShrink: 0,
                    color: A.ink, fontWeight: 600,
                  }}>{key}</dt>
                  <dd style={{ margin: 0, color: A.ink2 }}>{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        <div style={{
          borderTop: '1px solid ' + A.rule2,
          paddingTop: 8, marginTop: 4,
          fontSize: 9, letterSpacing: 1, color: A.muted,
          textTransform: 'uppercase',
        }}>
          esc to close
        </div>
      </div>
    </div>
  );
}
